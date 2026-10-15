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
        lineas: crudo.lineas.map((l) => ({ ...l, e: desdeBase64(l.e) })),
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
export async function reconocerCarro(archivo, alAvanzar) {
  const { procesador, vision, etiquetas } = await prepararReconocedor(alAvanzar);
  const inicio = performance.now();
  const imagen = await RawImage.fromBlob(archivo);
  const entradas = await procesador(imagen);
  const { image_embeds } = await vision(entradas);
  const vector = Float32Array.from(image_embeds.data);
  const norma = Math.hypot(...vector);
  for (let i = 0; i < vector.length; i++) vector[i] /= norma;

  const tipos = Object.keys(etiquetas.carrocerias);
  const pTipos = softmax(tipos.map((t) => ESCALA * punto(vector, etiquetas.carrocerias[t])));
  const pLineas = softmax(etiquetas.lineas.map((l) => ESCALA * punto(vector, l.e)));

  // La carrocería final mezcla lo que CLIP ve directamente (30 %) con lo
  // que votan las líneas más parecidas (70 %): si la foto se parece a un
  // Logan, eso es un voto por sedán aunque desde el frente CLIP diga
  // hatchback. Los pesos salen de medir con nueve fotos reales (15-oct-2026):
  // a partes iguales acertaba 4 de 9 carrocerías; así, 6 de 9.
  const PESO_DIRECTO = 0.3;
  const mezcla = {};
  tipos.forEach((t, i) => (mezcla[t] = PESO_DIRECTO * pTipos[i]));
  const marcas = {};
  const lineas = etiquetas.lineas.map((l, i) => {
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
    milisegundos: Math.round(performance.now() - inicio),
  };
}
