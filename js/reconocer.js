// Reconocer el carro de una foto, en el teléfono, sin servidor.
//
// Cómo funciona: CLIP (el modelo de OpenAI que relaciona imágenes con
// texto) convierte la foto en un vector de 512 números. Los vectores de los
// textos ("a photo of a Renault Duster SUV", "a photo of a pickup truck")
// ya vienen calculados en js/etiquetas-clip.json (los hace
// herramientas/calcular-etiquetas.mjs). Comparar la foto con cada texto es
// un producto punto: lo que más se parece gana.
//
// Lo que hay que saber antes de confiar en esto (medido el 15-oct-2026 con
// nueve fotos reales y las 89 familias más comunes como candidatas): la
// carrocería acierta 6 o 7 de 9, la línea 3 o 4 de 9 de primera y 4 o 5 de
// 9 entre las tres primeras; desde el frente, un sedán y un hatchback son
// iguales (el
// baúl está atrás). Por eso esto es una SUGERENCIA que la persona confirma
// con un toque, nunca el dato final. Lo que la foto sí da con certeza es el
// color (color-foto.js).
//
// El modelo de visión pesa 89 MB y se descarga de Hugging Face la primera
// vez; el navegador lo guarda y las siguientes veces abre sin internet. El
// motor (ONNX Runtime, en js/vendor/transformers) sí viaja con la app.
import { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from './vendor/transformers/transformers.min.js';
import { normalizarCarroceria } from './carrocerias.js';
import { ESCALAS_RECORTE, clasificarLogo, logoSeguro, recorteAlrededor } from './logo.js';

export const MODELO = 'Xenova/clip-vit-base-patch32';
const ESCALA = 100; // la "temperatura" de CLIP: convierte parecidos en probabilidades

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers/', import.meta.url).href;
// Un solo hilo: los hilos exigen cabeceras COOP/COEP que el servidor del
// taller no manda, y ONNX igual caería a uno solo, pero avisando en consola.
env.backends.onnx.wasm.numThreads = 1;

let preparando = null;

function desdeBase64(texto) {
  const binario = atob(texto);
  const bytes = new Int8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = (binario.charCodeAt(i) << 24) >> 24;
  const salida = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) salida[i] = bytes[i] / 127;
  return salida;
}

function softmax(valores) {
  const mayor = Math.max(...valores);
  const exp = valores.map((v) => Math.exp(v - mayor));
  const suma = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / suma);
}

function punto(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Carga (una sola vez) las etiquetas y el modelo de visión. `alAvanzar`
// recibe texto y porcentaje para que la pantalla diga qué está pasando: la
// primera vez son 89 MB y en la Wi-Fi del taller puede tardar un minuto.
export function prepararReconocedor(alAvanzar = () => {}) {
  if (!preparando) {
    preparando = (async () => {
      alAvanzar('Leyendo el catálogo…', 0);
      const respuesta = await fetch(new URL('./etiquetas-clip.json', import.meta.url));
      if (!respuesta.ok) throw new Error('No se pudo leer etiquetas-clip.json');
      const crudo = await respuesta.json();
      const etiquetas = {
        carrocerias: Object.fromEntries(Object.entries(crudo.carrocerias).map(([k, v]) => [k, desdeBase64(v)])),
        // Todas las familias del catálogo; el carro entero se compara solo
        // con las "muy común" (ver reconocerCarro) y las demás entran
        // cuando ya se sabe la marca.
        lineas: crudo.lineas.map((l) => ({ ...l, e: desdeBase64(l.e) })),
        marcas: (crudo.marcas || []).map((m) => ({ ...m, e: desdeBase64(m.e) })),
      };
      const progreso = (p) => {
        if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) {
          alAvanzar('Descargando el reconocedor (' + Math.round(p.progress || 0) + ' %)…', p.progress || 0);
        } else if (p.status === 'ready') {
          alAvanzar('Reconocedor listo.', 100);
        }
      };
      alAvanzar('Abriendo el reconocedor…', 0);
      const procesador = await AutoProcessor.from_pretrained(MODELO, { progress_callback: progreso });
      const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8', progress_callback: progreso });
      return { procesador, vision, etiquetas };
    })().catch((e) => {
      preparando = null; // la próxima vez se vuelve a intentar
      throw e;
    });
  }
  return preparando;
}

// Devuelve { carrocerias: [{tipo, p}], lineas: [{marca, linea, carroceria, p}],
// marcas: [{marca, p}], milisegundos }, todo ordenado de más a menos probable.
// `linea` es la FAMILIA del catálogo (Logan, Hilux): catalogo.js la
// convierte en una entrada concreta con mejorDeFamilia.
// La foto leída UNA vez por archivo y reducida a 1600 px por el lado mayor:
// una foto de teléfono de 12 MP ocupa 48 MB decodificada, y cada recorte
// la clona entera; con tres recortes por toque un teléfono con poca RAM se
// quedaba sin memoria. A 1600 px (lo que midió medir-logo.mjs) el logo
// recortado sigue siendo más grande que los 224 px que mira CLIP.
const LADO_MAXIMO = 1600;
const imagenesLeidas = new WeakMap();

async function leerFoto(archivo) {
  let pendiente = imagenesLeidas.get(archivo);
  if (!pendiente) {
    pendiente = (async () => {
      let imagen = await RawImage.fromBlob(archivo);
      const mayor = Math.max(imagen.width, imagen.height);
      if (mayor > LADO_MAXIMO) {
        const factor = LADO_MAXIMO / mayor;
        imagen = await imagen.resize(Math.round(imagen.width * factor), Math.round(imagen.height * factor));
      }
      return imagen;
    })();
    imagenesLeidas.set(archivo, pendiente);
    pendiente.catch(() => imagenesLeidas.delete(archivo));
  }
  return pendiente;
}

// El vector (normalizado) de una imagen ya leída.
async function vectorDeImagen(procesador, vision, imagen) {
  const entradas = await procesador(imagen);
  const { image_embeds } = await vision(entradas);
  const vector = Float32Array.from(image_embeds.data);
  const norma = Math.hypot(...vector);
  for (let i = 0; i < vector.length; i++) vector[i] /= norma;
  return vector;
}

export async function reconocerCarro(archivo, alAvanzar) {
  const { procesador, vision, etiquetas } = await prepararReconocedor(alAvanzar);
  const inicio = performance.now();
  const imagen = await leerFoto(archivo);
  const vector = await vectorDeImagen(procesador, vision, imagen);

  const tipos = Object.keys(etiquetas.carrocerias);
  const pTipos = softmax(tipos.map((t) => ESCALA * punto(vector, etiquetas.carrocerias[t])));
  // Contra el carro entero solo compiten las familias "muy común": con
  // cientos de candidatas CLIP se confunde más (medido el 15-oct-2026).
  const candidatas = etiquetas.lineas.filter((l) => l.presencia === 'muy comun');
  const pLineas = softmax(candidatas.map((l) => ESCALA * punto(vector, l.e)));

  // La carrocería final mezcla lo que CLIP ve directamente (30 %) con lo
  // que votan las líneas más parecidas (70 %): si la foto se parece a un
  // Logan, eso es un voto por sedán aunque desde el frente CLIP diga
  // hatchback. Los pesos salen de medir con nueve fotos reales (15-oct-2026):
  // a partes iguales acertaba 4 de 9 carrocerías; así, 6 de 9.
  const PESO_DIRECTO = 0.3;
  const mezcla = {};
  tipos.forEach((t, i) => (mezcla[t] = PESO_DIRECTO * pTipos[i]));
  const marcas = {};
  const lineas = candidatas.map((l, i) => {
    const tipo = normalizarCarroceria(l.carroceria);
    mezcla[tipo] = (mezcla[tipo] || 0) + (1 - PESO_DIRECTO) * pLineas[i];
    marcas[l.marca] = (marcas[l.marca] || 0) + pLineas[i];
    return { marca: l.marca, linea: l.linea, carroceria: tipo, p: pLineas[i] };
  });
  const ordenar = (lista) => lista.sort((a, b) => b.p - a.p);
  return {
    carrocerias: ordenar(Object.entries(mezcla).map(([tipo, p]) => ({ tipo, p }))),
    lineas: ordenar(lineas).slice(0, 12),
    marcas: ordenar(Object.entries(marcas).map(([marca, p]) => ({ marca, p }))).slice(0, 5),
    // El vector de la foto se devuelve para volver a clasificar sin pasar
    // la foto otra vez por el modelo (cuando la marca cambia).
    vector,
    milisegundos: Math.round(performance.now() - inicio),
  };
}

// La marca por el logo: recorta la foto alrededor del punto que la persona
// tocó (fracciones del ancho y del alto), a tres escalas, y compara cada
// recorte con los logos. Devuelve { marcas: [{ nombre, marcas, p }],
// seguro, milisegundos }. Medido el 15-oct-2026 con diez fotos reales
// (herramientas/medir-logo.mjs): la marca correcta sale de primera en 8 de
// 10, y en 7 de 10 con ventaja suficiente para ponerla sola (`seguro`); en
// la otra (un Tucson al 12 %) la pantalla pregunta. Nissan y Kia salen con
// 70-90 %, Chevrolet, Renault y Mazda con 20-30 % pero con ventaja clara;
// fallan un Logan con el rombo en sombra y un Onix de lado sin emblema a
// la vista. Sin toque, barriendo la foto a ciegas, 4 de 10: por eso se
// pide el toque.
export async function reconocerMarcaPorLogo(archivo, { x, y }, alAvanzar) {
  const { procesador, vision, etiquetas } = await prepararReconocedor(alAvanzar);
  const inicio = performance.now();
  if (etiquetas.marcas.length === 0) throw new Error('etiquetas-clip.json no trae logos: hay que regenerarlo');
  const imagen = await leerFoto(archivo);
  const vectores = [];
  for (const escala of ESCALAS_RECORTE) {
    const r = recorteAlrededor(imagen.width, imagen.height, x, y, escala);
    const recorte = await imagen.crop([r.x1, r.y1, r.x2, r.y2]);
    vectores.push(await vectorDeImagen(procesador, vision, recorte));
  }
  const marcas = clasificarLogo(vectores, etiquetas.marcas, { escala: ESCALA });
  return { marcas: marcas.slice(0, 5), seguro: logoSeguro(marcas), milisegundos: Math.round(performance.now() - inicio) };
}

// La marca SOLA, sin toque: sabiendo dónde está la placa (placa-foto.js la
// ubica por su amarillo), el emblema va encima, en la parrilla. Se
// recortan los puntos de la zona encima de la placa a la escala chica, se
// queda el punto donde algún logo gana con más fuerza, y ahí se promedian
// las tres escalas como en el toque. Unas 10 inferencias: en el PC un
// segundo, en el teléfono unos cinco. Devuelve lo mismo que
// reconocerMarcaPorLogo más `punto` (dónde encontró el logo), o null si la
// zona no cabe en la foto.
export async function reconocerMarcaCercaDePlaca(archivo, zona, alAvanzar) {
  const { procesador, vision, etiquetas } = await prepararReconocedor(alAvanzar);
  const inicio = performance.now();
  if (etiquetas.marcas.length === 0) throw new Error('etiquetas-clip.json no trae logos: hay que regenerarlo');
  if (!zona || zona.puntos.length === 0) return null;
  const imagen = await leerFoto(archivo);
  const escalaChica = Math.max(0.06, Math.min(0.12, zona.escala * 0.7));
  let mejor = null;
  for (const punto of zona.puntos) {
    const r = recorteAlrededor(imagen.width, imagen.height, punto.x, punto.y, escalaChica);
    const vector = await vectorDeImagen(procesador, vision, await imagen.crop([r.x1, r.y1, r.x2, r.y2]));
    const lista = clasificarLogo([vector], etiquetas.marcas, { escala: ESCALA });
    if (!mejor || lista[0].p > mejor.p) mejor = { punto, p: lista[0].p, vector };
  }
  const vectores = [mejor.vector];
  for (const escala of [escalaChica * 1.6, escalaChica * 2.5]) {
    const r = recorteAlrededor(imagen.width, imagen.height, mejor.punto.x, mejor.punto.y, Math.min(0.3, escala));
    vectores.push(await vectorDeImagen(procesador, vision, await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
  }
  const marcas = clasificarLogo(vectores, etiquetas.marcas, { escala: ESCALA });
  return { marcas: marcas.slice(0, 5), seguro: logoSeguro(marcas), punto: mejor.punto, milisegundos: Math.round(performance.now() - inicio) };
}

// La marca con una foto tomada DE CERCA al emblema (la cámara apuntando al
// logo): se mira la foto entera y dos recortes del centro (70 % y 45 %),
// por si la persona dejó aire alrededor. Es el camino más seguro: el logo
// llena la imagen y no depende de dónde cayó el dedo.
export async function reconocerMarcaEnFotoDeCerca(archivo, alAvanzar) {
  const { procesador, vision, etiquetas } = await prepararReconocedor(alAvanzar);
  const inicio = performance.now();
  if (etiquetas.marcas.length === 0) throw new Error('etiquetas-clip.json no trae logos: hay que regenerarlo');
  const imagen = await leerFoto(archivo);
  const vectores = [await vectorDeImagen(procesador, vision, imagen)];
  for (const escala of [0.7, 0.45]) {
    const r = recorteAlrededor(imagen.width, imagen.height, 0.5, 0.5, escala);
    vectores.push(await vectorDeImagen(procesador, vision, await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
  }
  const marcas = clasificarLogo(vectores, etiquetas.marcas, { escala: ESCALA });
  return { marcas: marcas.slice(0, 5), seguro: logoSeguro(marcas), milisegundos: Math.round(performance.now() - inicio) };
}

// Las líneas de UNA marca (o varias que comparten logo), ordenadas por lo
// que se parece la foto entera a cada familia, con un empujón a las de la
// carrocería que la foto votó. Aquí sí entran todas las familias de la
// marca, raras incluidas: entre veinte candidatas CLIP acierta mucho más
// que entre setecientas. Devuelve [{ marca, linea, carroceria, p }].
export async function lineasDeMarca(vector, marcas, carroceriaVotada = '') {
  const { etiquetas } = await prepararReconocedor();
  const familias = etiquetas.lineas.filter((l) => marcas.includes(l.marca));
  if (familias.length === 0) return [];
  const p = softmax(familias.map((l) => ESCALA * punto(vector, l.e)));
  const PESO_CARROCERIA = 1.5; // una familia de la carrocería votada pesa 50 % más
  // Lo raro parte con desventaja: con 0,6 un Bolt EUV (poco común) salía
  // segundo para la Captiva de Joan, delante de la Captiva (común).
  const PRIOR = { 'muy comun': 1, comun: 0.75, 'poco comun': 0.35 };
  let lista = familias.map((l, i) => {
    const carroceria = normalizarCarroceria(l.carroceria);
    const empujon = carroceriaVotada && carroceria === carroceriaVotada ? PESO_CARROCERIA : 1;
    return { marca: l.marca, linea: l.linea, carroceria, p: p[i] * empujon * (PRIOR[l.presencia] || 0.6) };
  });
  const total = lista.reduce((s, l) => s + l.p, 0);
  lista = lista.map((l) => ({ ...l, p: l.p / total }));
  return lista.sort((a, b) => b.p - a.p);
}
