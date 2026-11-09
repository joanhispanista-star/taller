// Los modelos de catálogo que la app ya trae: un GLB por línea de carro, hecho con fotos (la tubería vive
// fuera del repo, en fg-trabajo/captiva/foto2), que sale solo al abrir un carro de esa línea. Qué es un carro de
// catálogo lo dice js/escaneo-catalogo.js; aquí están cuáles hay, de dónde se bajan y cómo se leen.
//
// Es uno por línea, no uno por placa: varias Captivas no gastan 4 MB cada una. Por eso no entra a la base de los
// escaneos (js/escaneos.js), que es por placa, y por eso tampoco se "quita" de ningún registro.
//
// Para agregar otro modelo: poner el archivo en modelos/, su crédito en modelos/CREDITOS.txt y una entrada en MODELOS.
// Nada más: la pantalla, la lista del diálogo y las pruebas salen de esta tabla.
import { buscarLinea, datosDeEntrada, entradaDe, familiaDe, marcaDelCatalogo, sinTildes } from './catalogo.js';
import { conTope } from './conexion-bd.js';

// Fuera de la precarga del service worker (sellar-version.mjs no mira modelos/): 4 MB por línea no se le bajan a
// todos los teléfonos. La caché la maneja la página, y el nombre NO puede empezar por "taller-": el activate de
// sw.js borra las que empiezan así en cada versión, y la Captiva se volvería a bajar cada vez que se publica.
export const CAJA_DE_MODELOS = 'modelos-de-carros';

export const MODELOS = [
  {
    // Tal como la guarda el catálogo (js/catalogo-carros.js) y, con él, la ficha en el carro.
    marca: 'Chevrolet',
    linea: 'Captiva (nueva)',
    nombre: 'Chevrolet Captiva LT 2020',
    corto: 'la Captiva',
    // Otro nombre que el de la primera versión, a propósito: GitHub Pages cachea 10 minutos, y con el mismo nombre la huella de aquí abajo
    // rechazaría el archivo viejo durante ese rato. El viejo sigue en modelos/ una publicación más: un teléfono con la versión anterior de
    // la app lo sigue pidiendo hasta que acepte la actualización, y sin él vería la carrocería de referencia.
    archivo: 'modelos/chevrolet-captiva-2020-v2.glb',
    // Con dos decimales: el letrero redondea, y 4,46 MB no son "5 MB", que es lo que salía de 4,5.
    megas: 4.46,
    // Las que se pueden tocar y van a la orden: las 17 de afuera. Lo dice la pestaña Vehículos, y una prueba la cuenta en el archivo.
    piezas: 17,
    // La foto de la tarjeta en la pestaña Vehículos y la portada en el Garaje de un carro de esta línea sin foto propia. Sacada
    // de la app misma (Edge sin ventana, vista Inicio, sin color elegido, placa de muestra DEM006), con el nombre del GLB:
    // un modelo nuevo es una foto nueva. Va en vehiculos/, que SÍ entra a la precarga, para que la pestaña abra sin señal.
    miniatura: 'vehiculos/chevrolet-captiva-2020-v2.jpg',
    // Del archivo, comprobado al bajarlo y al sacarlo de la caché: uno dañado por dentro mide lo mismo y empieza igual, y se
    // quedaría roto para siempre. También es lo que hace llegar un GLB corregido que se publique con el mismo nombre.
    sha256: 'c9739044ccf54cf7c0ea3bc3858b85b95cee338ab6f1e3e406f7df6dac726d9c',
    // Lo que el diálogo tiene que decir de esta línea y no se sabe mirando el modelo. Sin año: el cambio de 2024 está en notas de México
    // y Centroamérica, para Colombia no hay fuente, y allá se habló de otro retoque para 2021.
    aviso: 'Las de otros años pueden tener otra trompa.',
    // El de la lata en pantalla: lo usan "por dentro" y el cuadrito de la ficha y del Garaje cuando nadie eligió color. Con el
    // de la pintura pura, el carro de adentro salía más oscuro que el de afuera.
    colorFoto: 0x7a4f37,
    credito: {
      autor: 'Autosdeprimera',
      licencia: 'CC BY 3.0',
      enlaceLicencia: 'https://creativecommons.org/licenses/by/3.0/',
      fuente: 'Wikimedia Commons',
      // El extras del GLB dice "de rojo a café", y en la app salen en el color que diga la ficha.
      // Y el capó y el techo, lo primero que se ve, ya no salen de una foto, y el brillo que se mueve lo calcula la app: decir solo "pegadas" no sería verdad.
      cambios: 'recoloreadas y pegadas sobre una forma 3D; capó y techo pintados aparte, y un brillo calculado encima',
      // La licencia de las fotos no cubre la marca, y CC BY tampoco deja insinuar respaldo del autor. El corbatín se ve grande.
      marcaDe: 'Chevrolet es marca de General Motors',
      fotos: [
        { nombre: 'Chevrolet Captiva 2020 (Colombia) front view 1.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_front_view_1.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) front view 2.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_front_view_2.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) front view 3.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_front_view_3.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) front view 4.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_front_view_4.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) front view 5.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_front_view_5.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) side view.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_side_view.png' },
        { nombre: 'Chevrolet Captiva 2020 (Colombia) rear view.png', enlace: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Captiva_2020_(Colombia)_rear_view.png' },
      ],
    },
  },
];

// Los modelos que alguien está haciendo de verdad, para la sección "Los que siguen" de la pestaña Vehículos:
// { nombre: 'Renault Logan II 2019', de: 'fotos de ...' }. Hoy no hay ninguno, y con la tabla vacía la pestaña no muestra
// esa sección: anunciar carros "en camino" que nadie está haciendo es prometer lo que la app no va a cumplir. Se agrega
// aquí cuando la tubería ya esté corriendo con sus fotos, y se quita al pasar a MODELOS.
export const MODELOS_EN_OBRA = [];

// La entrada de la tabla para la línea de este carro, o null. Sin tildes ni mayúsculas, como el catálogo. Por el nombre
// entero y no campo por campo: el formulario por placa del Garaje guarda lo que se escriba como marca
// ("Chevrolet Captiva (nueva)"), y ese carro también es de la línea.
export function modeloDeLaLinea(carro) {
  if (!carro) return null;
  const nombre = sinTildes([carro.marca, carro.linea].filter(Boolean).join(' '));
  if (!nombre) return null;
  return MODELOS.find((m) => sinTildes(m.marca + ' ' + m.linea) === nombre) || null;
}

// Lo que le toca a este carro: nada si la persona pidió la carrocería de referencia para él.
export function modeloQueLeToca(carro) {
  return carro && !carro.sinModeloDeCatalogo ? modeloDeLaLinea(carro) : null;
}

// Un carro cuyo nombre habla de una línea con modelo sin ser exactamente esa ("Chevrolet Captiva", "Captiva LT 2020"): lo que
// escribe cualquiera en el campo Marca del Garaje. No se le pone el modelo sin preguntar: la Captiva de 2007 a 2018 también se
// llama así y es otro carro, y "de la misma línea" sería falso. El diálogo pregunta. Lo que dice ser otra línea del catálogo
// ("Captiva Sport") es esa línea, y no se ofrece nada.
const palabrasDe = (texto) => sinTildes(texto).split(/[^a-z0-9ª]+/).filter(Boolean);
export function modeloParecido(carro, modelos = MODELOS) {
  if (!carro || modeloDeLaLinea(carro)) return null;
  const palabras = palabrasDe([carro.marca, carro.linea].filter(Boolean).join(' '));
  if (!palabras.length) return null;
  const esa = (m) => {
    const familia = palabrasDe(familiaDe(m));
    if (!familia.every((p) => palabras.includes(p))) return false;
    const marcaEscrita = marcaDelCatalogo(palabras[0]);
    if (marcaEscrita && sinTildes(marcaEscrita) !== sinTildes(m.marca)) return false;
    const otraLinea = (e) => sinTildes(e.marca) === sinTildes(m.marca) && sinTildes(e.linea) !== sinTildes(m.linea) && palabrasDe(e.linea).every((p) => palabras.includes(p));
    return !buscarLinea(familia.join(' '), 12).some(otraLinea);
  };
  return modelos.find(esa) || null;
}

// De "2019-hoy" a "de 2019 en adelante": para preguntarlo sin adivinar la generación.
export function anosDelModelo(modelo) {
  const entrada = entradaDe(modelo.marca, modelo.linea);
  const [desde, hasta] = String((entrada && entrada.anos) || '').match(/\d{4}|hoy/g) || [];
  if (!desde) return '';
  return !hasta || hasta === 'hoy' ? 'de ' + desde + ' en adelante' : 'de ' + desde + ' a ' + hasta;
}

// Lo que se le escribe al carro al decir "sí, es de esa línea": los datos del catálogo, y lo que escribió de más ("LT 2020") a
// la versión, si no tenía, para no perderlo.
export function datosParaUsarModelo(carro, modelo) {
  const sobran = new Set([...palabrasDe(modelo.marca), ...palabrasDe(familiaDe(modelo))]);
  const resto = [carro.marca, carro.linea]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter((p) => p && !sobran.has(sinTildes(p)))
    .join(' ');
  return { ...datosDeEntrada(entradaDe(modelo.marca, modelo.linea)), version: carro.version || resto, sinModeloDeCatalogo: false };
}

// La entrada de la tabla para lo que un archivo dice de sí mismo (extras.taller). El archivo llama la línea
// "Captiva" a secas, porque es lo que dice la foto: se reconoce por su nombre completo. Sirve también para un
// GLB de catálogo que alguien subió a mano a una placa.
export function modeloDelCatalogo(catalogo) {
  const a = (catalogo && catalogo.carro) || {};
  const nombre = sinTildes([a.marca, a.linea, a.version, a.modelo].filter(Boolean).join(' '));
  return (nombre && MODELOS.find((m) => sinTildes(m.nombre) === nombre)) || null;
}

// ---- El color que se le ve ----

// El gris con que abre la ficha no es un color elegido (ficha-carro.js): es lo que queda si nadie tocó el color.
const COLOR_SIN_ELEGIR = '#cfd4da';
export function colorElegido(carro) {
  return carro.color && String(carro.color).toLowerCase() !== COLOR_SIN_ELEGIR ? carro.color : null;
}

export function hexDeColor(numero) {
  return '#' + numero.toString(16).padStart(6, '0');
}

// El que se puede nombrar y poner en un cuadrito: el Garaje y el Historial decían "plateado", con el cuadro gris, de una Captiva
// que en el visor es café. Sin elegir, y con un modelo que le toca, es el del modelo; sin modelo, lo de siempre.
export function colorQueSeVe(carro) {
  const elegido = colorElegido(carro);
  if (elegido) return elegido;
  const modelo = modeloQueLeToca(carro);
  return modelo ? hexDeColor(modelo.colorFoto) : carro.color || '';
}

// ---- Lo que dice la pantalla ----

// Las fotos son CC BY 3.0: autor, licencia y que se modificaron. Se lee en el diálogo, con su enlace. Y que no es de la marca:
// "catálogo de Chevrolet", con el corbatín en pantalla, se podía leer como que sí.
export function textoDelCredito(modelo) {
  const c = modelo.credito;
  return 'Fotos: ' + c.autor + ', ' + c.licencia + ' (' + c.fuente + '). Modificadas: ' + c.cambios + '. No es un modelo oficial: ' + c.marcaDe + ', y ni la marca ni el autor de las fotos tienen relación con esta app.';
}

// El crédito de un carro de catálogo, también de uno subido a mano: el del archivo dice "de rojo a café", que es cómo
// se hizo, y en la pantalla el carro puede estar en cualquier color. El del archivo queda para lo que no está en la tabla.
export function creditoDeCatalogo(catalogo) {
  const deLaTabla = modeloDelCatalogo(catalogo);
  return deLaTabla ? textoDelCredito(deLaTabla) : (catalogo && catalogo.credito) || '';
}

// Para que el dueño del taller no escanee lo que la app ya tiene, y con cuál línea sale: anunciar "Captiva LT 2020" sin decir qué
// elegir dejaba a quien escribió eso con el carro de cajas y este texto al lado. "Tiene" y no "ya trae": se baja al abrirlo.
export function textoDeLaLista(modelos = MODELOS) {
  return 'La app tiene el modelo de: ' + modelos.map((m) => m.nombre + ' (en Datos del carro, línea «' + m.marca + ' ' + m.linea + '»)').join(', ') + '. Se baja la primera vez que se abre esa línea. Para las demás líneas se ve la carrocería de referencia hasta que se escanee ese carro.';
}

// "4,5 MB", con coma, como se escribe aquí. Un decimal basta para decidir si bajarlo con datos del celular.
export function textoDeMegas(megas) {
  return String(Math.round(megas * 10) / 10).replace('.', ',') + ' MB';
}

// Lo que dice la tarjeta de un modelo en la pestaña Vehículos. Todo sale de la tabla y del catálogo, para que un modelo
// nuevo no pida tocar la pantalla. Sin "escaneado": está hecho con fotos de otro carro de la línea, y la pestaña lo dice.
// `uso` lleva al botón «Usar en un carro» y no a Datos del carro: hasta el 9-nov decía "toca «Datos del carro» y elige la
// línea", y en un carro creado como "Chevrolet Captiva" ese botón lleva el nombre del carro, y escribir la línea como la
// sugiere el campo dejaba "Chevrolet Captiva Captiva (nueva)", con la carrocería de cajas (revisión del 9-nov).
export function textosDeLaTarjeta(modelo) {
  const anos = anosDelModelo(modelo);
  const linea = modelo.marca + ' ' + modelo.linea;
  return {
    nombre: modelo.nombre,
    linea,
    detalle: ['Para ' + modelo.corto + (anos ? ' ' + anos : ''), modelo.piezas + ' piezas', textoDeMegas(modelo.megas) + ' la primera vez'].join(' · '),
    uso: 'En un carro del taller: toca «Usar en un carro» y elígelo. Le pone la línea «' + linea + '», y ' + modelo.corto + ' sale sola en ese carro.' + (modelo.aviso ? ' ' + modelo.aviso : ''),
  };
}

// La miniatura que va de portada en el Garaje para un carro sin foto propia: la del modelo que le toca, o '' si no le toca
// ninguno (otra línea, o la persona pidió la carrocería de referencia para él; entonces la miniatura no sería su carro).
export function miniaturaDelCarro(carro) {
  const modelo = modeloQueLeToca(carro);
  return (modelo && modelo.miniatura) || '';
}

// ---- Bajarlo una vez ----

const MAGIA_GLTF = 0x46546c67; // "glTF" al derecho, en little-endian
const TROZO_JSON = 0x4e4f534a;
const TROZO_BIN = 0x004e4942;

// Empieza por "glTF" y mide lo que dice medir. Una página de error o un portal de Wi-Fi llegan con 200, y una
// descarga cortada también puede: guardados, serían un carro roto para siempre.
export function pareceGlb(bytes) {
  if (!bytes || bytes.byteLength < 20) return false;
  const vista = new DataView(bytes);
  return vista.getUint32(0, true) === MAGIA_GLTF && vista.getUint32(8, true) === bytes.byteLength;
}

// Lo que no es de este momento: el que cambió de nombre es un archivo que ya nadie va a pedir.
async function botarLoViejo(caja) {
  for (const pedido of await caja.keys()) {
    const url = pedido.url || String(pedido);
    if (!MODELOS.some((m) => url === m.archivo || url.endsWith('/' + m.archivo))) await caja.delete(pedido);
  }
}

// iOS puede dejar el almacenamiento sin responder y sin avisar (ver conexion-bd.js): lo que no contesta no puede dejar el
// letrero puesto para siempre, ni el carro esperando un archivo que ya llegó.
const TOPE_DE_LA_CAJA = 8000;
// Por silencio y no por total: 4 MB en 3G tardan unos 25 s, y una red colgada dejaba "Bajando…" para siempre.
const TOPE_SIN_DATOS = 30000;

async function abrirCaja(cajas, tope = TOPE_DE_LA_CAJA) {
  try {
    return cajas ? await conTope(cajas.open(CAJA_DE_MODELOS), tope) : null;
  } catch (e) {
    // En http (la red del PC) no hay caches, y en una ventana privada puede lanzar: baja directo, sin guardar.
    console.warn(e);
    return null;
  }
}

// El archivo que es, byte por byte. En http no hay crypto.subtle (la red del PC): ahí queda lo de pareceGlb.
async function esElArchivo(modelo, bytes) {
  if (!pareceGlb(bytes)) return false;
  const sutil = globalThis.crypto && globalThis.crypto.subtle;
  if (!sutil || !modelo.sha256) return true;
  const resumen = new Uint8Array(await sutil.digest('SHA-256', bytes));
  return Array.from(resumen, (b) => b.toString(16).padStart(2, '0')).join('') === modelo.sha256;
}

async function deLaCaja(caja, modelo) {
  const guardada = await caja.match(modelo.archivo);
  if (!guardada) return null;
  const bytes = await guardada.arrayBuffer();
  if (await esElArchivo(modelo, bytes)) return bytes;
  await caja.delete(modelo.archivo);
  return null;
}

// Lo viejo primero, para que quepa.
async function aLaCaja(caja, modelo, bytes) {
  await botarLoViejo(caja);
  await caja.put(modelo.archivo, new Response(bytes, { headers: { 'content-type': 'model/gltf-binary' } }));
}

// Por trozos, para saber que siguen llegando. `alRecibir`: cada vez que llega algo.
async function leerRespuesta(respuesta, alRecibir) {
  if (!respuesta.body || !respuesta.body.getReader) return respuesta.arrayBuffer();
  const lector = respuesta.body.getReader();
  const trozos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    total += value.length;
    alRecibir();
  }
  const salida = new Uint8Array(total);
  let desde = 0;
  for (const trozo of trozos) {
    salida.set(trozo, desde);
    desde += trozo.length;
  }
  return salida.buffer;
}

// Sin Referer: la dirección de la página lleva la placa (?placa=JPX248), y este es el único pedido que sale del teléfono mientras se
// usa la app. Quedaría en los registros de quien la sirve. Lo que no contesta en `topeSinDatos` se corta, y cuenta como sin red.
async function deLaRed(modelo, pedir, topeSinDatos) {
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  let reloj;
  let vencer;
  const vencido = new Promise((_, rechazar) => (vencer = rechazar));
  const velar = () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      if (control) control.abort();
      vencer(new DOMException('La bajada se quedó sin datos ' + topeSinDatos / 1000 + ' s', 'TimeoutError'));
    }, topeSinDatos);
  };
  velar();
  let respuesta;
  let bytes;
  try {
    await Promise.race([
      vencido,
      (async () => {
        respuesta = await pedir(modelo.archivo, { referrerPolicy: 'no-referrer', ...(control ? { signal: control.signal } : {}) });
        velar();
        if (respuesta.ok) bytes = await leerRespuesta(respuesta, velar);
      })(),
    ]);
  } catch (e) {
    throw Object.assign(new Error('No hay internet para bajar el modelo'), { sinRed: true, cause: e });
  } finally {
    clearTimeout(reloj);
  }
  if (!respuesta.ok) throw new Error('El modelo no se pudo bajar: respuesta ' + respuesta.status);
  if (!(await esElArchivo(modelo, bytes))) throw new Error('Lo que llegó no es el modelo');
  return bytes;
}

async function traerModelo(modelo, { cajas, pedir, alIrALaRed, tope, topeSinDatos }) {
  const caja = await abrirCaja(cajas, tope);
  if (caja) {
    try {
      const guardados = await conTope(deLaCaja(caja, modelo), tope);
      if (guardados) return guardados;
    } catch (e) {
      console.warn(e);
    }
  }
  alIrALaRed();
  const bytes = await deLaRed(modelo, pedir, topeSinDatos);
  // Sin esperar: el carro no tiene por qué aguardar a que guarden un archivo que ya llegó, y menos con un almacenamiento que no
  // responde. Sin espacio se ve igual: solo que se vuelve a bajar la próxima vez.
  if (caja) conTope(aLaCaja(caja, modelo, bytes), tope).catch((e) => console.warn(e));
  return bytes;
}

// Lo que ya viene en camino, por archivo: volver a una Captiva mientras baja gastaba otros 4 MB, y con datos prepago se nota. La
// pantalla decide con su turno si lo usa; aquí no se cancela nada, porque la siguiente Captiva lo va a querer.
const EN_CAMINO = new WeakMap();

// Los bytes del GLB: la primera vez, de la red; después, sin internet. `alIrALaRed` avisa cuando va a pedirlo de
// verdad, para que el letrero diga lo que pesa. El error lleva `sinRed` si es que no hubo con qué bajarlo: lo
// demás (un 404, una página que no es el modelo) es otra cosa y la pantalla lo dice distinto.
export async function bajarModelo(modelo, { cajas = globalThis.caches, pedir = globalThis.fetch, alIrALaRed = () => {}, tope = TOPE_DE_LA_CAJA, topeSinDatos = TOPE_SIN_DATOS } = {}) {
  let viajes = EN_CAMINO.get(pedir);
  if (!viajes) EN_CAMINO.set(pedir, (viajes = new Map()));
  let viaje = viajes.get(modelo.archivo);
  if (!viaje) {
    const nuevo = { enLaRed: false, oyentes: [] };
    nuevo.bytes = traerModelo(modelo, {
      cajas,
      pedir,
      tope,
      topeSinDatos,
      alIrALaRed: () => {
        nuevo.enLaRed = true;
        for (const oyente of nuevo.oyentes) oyente();
      },
    }).finally(() => viajes.delete(modelo.archivo));
    viajes.set(modelo.archivo, nuevo);
    viaje = nuevo;
  }
  if (viaje.enLaRed) alIrALaRed();
  else viaje.oyentes.push(alIrALaRed);
  return viaje.bytes;
}

// Si el archivo guardado resultó dañado por dentro: que la próxima vez se baje de nuevo.
export async function olvidarModelo(modelo, { cajas = globalThis.caches } = {}) {
  const caja = await abrirCaja(cajas);
  if (!caja) return;
  try {
    await caja.delete(modelo.archivo);
  } catch (e) {
    console.warn(e);
  }
}

// ---- Lo que ya se sabe de este celular ----

// La foto abierta son 48 MiB, más 64 en la GPU; a 2048 x 1536 es la cuarta parte, y se ve bien. En iOS la falta de memoria suele
// matar la pestaña sin error: Safari la recarga, el modelo se vuelve a pedir solo, y ese carro no abriría nunca en ese teléfono. Por
// eso se deja una marca antes de abrir la foto y se quita con el primer cuadro dibujado: si al arrancar sigue puesta, el intento
// anterior murió ahí. Cada caída baja un escalón, y se recuerda: en localStorage y no en la base, que sin memoria es lo primero
// que se cae.
export const FOTO_COMPLETA = 0;
export const FOTO_LIVIANA = 1;
export const SIN_CUPO = 2;
export const OPCIONES_LIVIANAS = { resizeWidth: 2048, resizeHeight: 1536, resizeQuality: 'high' };
const CLAVE_CUPO = 'taller-cupo-de-modelos';
const CLAVE_ABRIENDO = 'taller-abriendo-modelo';

// Con el almacenamiento bloqueado (ventana privada) dura lo que dure la página: si no, un celular sin cupo lo reintentaría sin parar.
const SIN_ALMACEN = new Map();
function leerLocal(clave) {
  try {
    if (globalThis.localStorage) return globalThis.localStorage.getItem(clave);
  } catch {
    // Ver arriba.
  }
  return SIN_ALMACEN.get(clave) ?? null;
}
function ponerLocal(clave, valor) {
  try {
    if (globalThis.localStorage) {
      if (valor === null) globalThis.localStorage.removeItem(clave);
      else globalThis.localStorage.setItem(clave, valor);
      return;
    }
  } catch {
    // Ver arriba.
  }
  if (valor === null) SIN_ALMACEN.delete(clave);
  else SIN_ALMACEN.set(clave, valor);
}
function leerCupos() {
  try {
    return JSON.parse(leerLocal(CLAVE_CUPO)) || {};
  } catch {
    return {};
  }
}

export function nivelDeCupo(modelo) {
  return Number(leerCupos()[modelo.archivo]) || FOTO_COMPLETA;
}
export function fijarCupo(modelo, nivel) {
  const cupos = leerCupos();
  if (nivel === FOTO_COMPLETA) delete cupos[modelo.archivo];
  else cupos[modelo.archivo] = nivel;
  ponerLocal(CLAVE_CUPO, JSON.stringify(cupos));
}
export function bajarCupo(modelo) {
  const nivel = Math.min(SIN_CUPO, nivelDeCupo(modelo) + 1);
  fijarCupo(modelo, nivel);
  return nivel;
}
export function marcarAbriendo(modelo) {
  ponerLocal(CLAVE_ABRIENDO, modelo.archivo);
}
export function quitarMarcaDeAbriendo() {
  ponerLocal(CLAVE_ABRIENDO, null);
}
// Al arrancar: la entrada del modelo si el intento anterior no llegó al primer cuadro, ya con un escalón menos.
export function revisarIntentoAnterior(modelos = MODELOS) {
  const archivo = leerLocal(CLAVE_ABRIENDO);
  if (!archivo) return null;
  quitarMarcaDeAbriendo();
  const modelo = modelos.find((m) => m.archivo === archivo) || null;
  if (modelo) bajarCupo(modelo);
  return modelo;
}

// ---- Leerlo sin lienzos ----

const TIPO_DE_COMPONENTE = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const POR_ELEMENTO = { SCALAR: 1, VEC2: 2, VEC3: 3 };

const noSeEntiende = (que) => new Error('El modelo no trae lo que la app espera: ' + que);

// Copia y no una vista: alinea los números pase lo que pase, y deja soltar el archivo entero.
function leerAccesor(json, datos, inicioBin, indice) {
  const a = json.accessors && json.accessors[indice];
  const vista = a && json.bufferViews && json.bufferViews[a.bufferView];
  const Tipo = a && TIPO_DE_COMPONENTE[a.componentType];
  const n = a && POR_ELEMENTO[a.type];
  if (!vista || !Tipo || !n || a.sparse) throw noSeEntiende('un dato en otro formato');
  if (vista.byteStride && vista.byteStride !== n * Tipo.BYTES_PER_ELEMENT) throw noSeEntiende('datos intercalados');
  const desde = inicioBin + (vista.byteOffset || 0) + (a.byteOffset || 0);
  const largo = a.count * n * Tipo.BYTES_PER_ELEMENT;
  if (desde + largo > datos.byteLength) throw noSeEntiende('un archivo cortado');
  return new Tipo(datos.slice(desde, desde + largo));
}

// Del GLB a lo que espera escaneoDeCatalogo, sin GLTFLoader y sin ningún lienzo. La ruta normal
// (leerArchivoDeEscaneo) abre la imagen en un lienzo para volverla a comprimir y sacarle el color por vértice, y
// en un iPhone la suma de los lienzos tiene tope: eso ya tumbó crear un carro (ver js/fotos.js). Aquí nada de eso
// hace falta: la imagen sigue como vino, un JPEG, y los números salen directo. Sin `colores`: modeloDesdeEscaneo
// usa entonces el colorBase mientras abre la foto, y ajustesDelEscaneo saca la cintura de la forma.
//
// Lee lo que hace la tubería: un nodo, una malla, una primitiva. Lo que no sea eso dice que no lo entiende en vez
// de dibujar un carro torcido: una transformación en el nodo o una segunda malla no estarían aquí.
export function leerModeloGlb(bytes) {
  const datos = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!pareceGlb(datos)) throw noSeEntiende('no es un GLB entero');
  const vista = new DataView(datos);
  const largoJson = vista.getUint32(12, true);
  if (vista.getUint32(16, true) !== TROZO_JSON) throw noSeEntiende('la cabecera');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(datos, 20, largoJson)));
  const posicionBin = 20 + largoJson;
  if (posicionBin + 8 > datos.byteLength || vista.getUint32(posicionBin + 4, true) !== TROZO_BIN) throw noSeEntiende('los datos binarios');
  const inicioBin = posicionBin + 8;

  const nodos = (json.nodes || []).filter((n) => n.mesh !== undefined);
  if (nodos.length !== 1 || !json.meshes || json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw noSeEntiende('una sola malla');
  const nodo = nodos[0];
  if (nodo.matrix || nodo.translation || nodo.rotation || nodo.scale) throw noSeEntiende('una malla sin mover');
  const catalogo = nodo.extras && nodo.extras.taller;
  if (!catalogo || catalogo.origen !== 'catalogo') throw noSeEntiende('lo que dice de sí mismo');

  const primitiva = json.meshes[0].primitives[0];
  const { POSITION, TEXCOORD_0, _PIEZA } = primitiva.attributes;
  if (POSITION === undefined || TEXCOORD_0 === undefined || _PIEZA === undefined || primitiva.indices === undefined) throw noSeEntiende('posiciones, coordenadas, piezas e índices');
  const posiciones = leerAccesor(json, datos, inicioBin, POSITION);
  const uvs = leerAccesor(json, datos, inicioBin, TEXCOORD_0);
  if (!(posiciones instanceof Float32Array) || !(uvs instanceof Float32Array)) throw noSeEntiende('posiciones y coordenadas en punto flotante');
  const vertices = posiciones.length / 3;
  const crudosPieza = leerAccesor(json, datos, inicioBin, _PIEZA);
  const crudosIndices = leerAccesor(json, datos, inicioBin, primitiva.indices);
  if (uvs.length / 2 !== vertices || crudosPieza.length !== vertices) throw noSeEntiende('un dato por vértice');
  // Las coordenadas van tal cual: glTF ya trae v = 0 arriba en la imagen, y ponerTextura abre con flipY en false. No
  // se voltean, igual que en mallaDeObjeto3D con lo que deja GLTFLoader (mapa.flipY === false).
  const pieza = crudosPieza instanceof Uint8Array ? crudosPieza : Uint8Array.from(crudosPieza);
  const indices = crudosIndices instanceof Uint32Array ? crudosIndices : Uint32Array.from(crudosIndices);

  const material = json.materials && json.materials[primitiva.material];
  const color = material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorTexture;
  const textura = color && json.textures && json.textures[color.index];
  const imagen = textura && json.images && json.images[textura.source];
  const vistaImagen = imagen && json.bufferViews[imagen.bufferView];
  // Un modelo sin foto no sirve: es una forma gris, y para eso está la carrocería de referencia.
  if (!vistaImagen) throw noSeEntiende('la foto');
  const desde = inicioBin + (vistaImagen.byteOffset || 0);
  const foto = new Blob([new Uint8Array(datos, desde, vistaImagen.byteLength)], { type: imagen.mimeType || 'image/jpeg' });

  return { posiciones, indices, colores: null, esNube: false, uvs, mapa: null, fotoPerdida: null, pieza, catalogo, textura: foto };
}
