// El service worker: lo que hace que la app abra sin internet y que el
// celular la ofrezca como app instalable (con manifest.webmanifest).
//
// Qué guarda y cómo:
//
//  - Lo propio (las tres páginas, el CSS, los módulos, Three.js, las
//    etiquetas del reconocedor, el bundle de Transformers.js, el manifest y
//    los iconos: 36 archivos, 2,5 MB) se guarda ENTERO al instalar y de ahí en
//    adelante se sirve de la caché sin preguntarle a la red. El Garaje y el
//    3D abren al instante y sin señal.
//  - El motor del reconocedor (ONNX Runtime: los ort-*.wasm/.mjs de
//    js/vendor/transformers, 27 MB el que se usa y 14 MB el de reserva) NO
//    se baja al instalar: se guarda la primera vez que se pide. Instalar la
//    app no debe costar 41 MB que el Garaje y el 3D no necesitan, y el
//    reconocedor exige internet la primera vez de todas formas (los 89 MB
//    del modelo vienen de Hugging Face). Desde esa primera vez, el motor ya
//    queda en el teléfono.
//  - Hugging Face, y cualquier otro origen, no se toca: Transformers.js
//    guarda el modelo en su propia caché (`transformers-cache`) y sabe
//    reanudar descargas; meterse en medio solo puede romperlo.
//
// La versión va en el nombre de la caché y la escribe `npm run sellar` a
// partir del contenido de los archivos (herramientas/sellar-version.mjs):
// si cambia un archivo y no se sella, los teléfonos se quedan con la versión
// vieja para siempre, porque el navegador solo renueva el service worker
// cuando este archivo cambia. Al activarse una versión nueva se borran las
// cachés `taller-*` viejas; la de Transformers.js no se toca.
//
// En el PC (127.0.0.1 o localhost) el orden se invierte: primero la red, y
// la caché solo si el servidor está apagado. Si no, al editar un archivo el
// navegador seguiría mostrando el viejo y nadie entendería por qué.

/* SELLO-INICIO: lo escribe `npm run sellar` (herramientas/sellar-version.mjs). No editar a mano. */
const VERSION = '7295d8bec883';
const VERSION_MOTOR = 'a4950633eb87';
const ARCHIVOS = [
  "./",
  "css/estilos.css",
  "garaje.html",
  "iconos/icono-180.png",
  "iconos/icono-192-maskable.png",
  "iconos/icono-192.png",
  "iconos/icono-512-maskable.png",
  "iconos/icono-512.png",
  "index.html",
  "js/carro.js",
  "js/carrocerias.js",
  "js/catalogo-carros.js",
  "js/catalogo.js",
  "js/color-foto.js",
  "js/demo.js",
  "js/estado.js",
  "js/etiquetas-clip.json",
  "js/ficha-carro.js",
  "js/fotos.js",
  "js/garaje-pantalla.js",
  "js/garaje.js",
  "js/hoja.js",
  "js/instalable.js",
  "js/logo.js",
  "js/piezas.js",
  "js/placa-foto.js",
  "js/placa-ocr.js",
  "js/reconocer.js",
  "js/tablero-pantalla.js",
  "js/tablero.js",
  "js/toque.js",
  "js/vendor/OrbitControls.js",
  "js/vendor/RoomEnvironment.js",
  "js/vendor/placa/ort.wasm.min.mjs",
  "js/vendor/three.module.min.js",
  "js/vendor/transformers/transformers.min.js",
  "js/visor.js",
  "manifest.webmanifest",
  "tablero.html"
];
/* SELLO-FIN */

const CACHE_APP = 'taller-app-' + VERSION;
const CACHE_MOTOR = 'taller-motor-' + VERSION_MOTOR;
const PROPIAS = [CACHE_APP, CACHE_MOTOR];

// La carpeta de la app: /taller/ en GitHub Pages, / en el PC. Todo lo demás
// se calcula desde aquí, por eso las rutas de ARCHIVOS son relativas.
const RAIZ = new URL('./', self.location.href);
const DESARROLLO = ['127.0.0.1', 'localhost', '[::1]'].includes(self.location.hostname);
const CARPETA_MOTOR = 'js/vendor/transformers/';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      // `cache: 'reload'` salta la caché HTTP del navegador: GitHub Pages
      // manda max-age=600 y sin esto una versión nueva podía instalarse con
      // archivos de la anterior que el navegador aún tenía por frescos.
      await cache.addAll(ARCHIVOS.map((a) => new Request(new URL(a, RAIZ).href, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith('taller-') && !PROPIAS.includes(n)).map((n) => caches.delete(n)));
      // Tomar las pestañas abiertas sin esperar a que naveguen: así la
      // primera visita ya queda cubierta y el botón de actualizar recarga
      // con la versión nueva.
      await self.clients.claim();
    })(),
  );
});

// El botón "Hay una versión nueva" del Garaje manda esto: la versión que
// espera pasa a activa y la página se recarga (instalable.js).
self.addEventListener('message', (evento) => {
  if (!evento.data) return;
  if (evento.data.tipo === 'activar') self.skipWaiting();
  // "¿Qué versión eres?": la ficha con foto lo pone en el detalle que Joan
  // copia cuando algo no reconoce, para saber si el teléfono ya tiene la
  // versión nueva o sigue con la vieja (instalable.js, versionInstalada).
  if (evento.data.tipo === 'version' && evento.source) evento.source.postMessage({ tipo: 'version', version: VERSION, motor: VERSION_MOTOR });
});

// Qué hacer con cada petición: 'app' (lo propio, precargado), 'motor' (ONNX,
// al primer uso) o 'red' (ni se toca: otros orígenes, otros métodos, lo que
// no es de la app).
function decidir(peticion) {
  if (peticion.method !== 'GET') return 'red';
  const url = new URL(peticion.url);
  if (url.origin !== RAIZ.origin || !url.pathname.startsWith(RAIZ.pathname)) return 'red';
  const relativa = url.pathname.slice(RAIZ.pathname.length) || './';
  if (ARCHIVOS.includes(relativa)) return 'app';
  // El motor ONNX, y el modelo del lector de placas (3,3 MB): al primer uso.
  if (relativa.startsWith(CARPETA_MOTOR) || relativa.endsWith('.onnx')) return 'motor';
  return 'red';
}

// La misma petición sin ?placa= ni ?p=: en la caché hay un solo garaje.html
// y un solo tablero.html, se pidan con la pestaña que se pidan.
function claveDe(peticion) {
  const url = new URL(peticion.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

async function guardarSiSirve(cache, peticion, respuesta) {
  // Solo respuestas completas y buenas: un 206 parcial o un 404 guardado
  // sería un archivo roto para siempre.
  if (respuesta && respuesta.ok && respuesta.status === 200) await cache.put(claveDe(peticion), respuesta.clone());
  return respuesta;
}

async function responder(peticion, decision) {
  const cache = await caches.open(decision === 'motor' ? CACHE_MOTOR : CACHE_APP);
  if (DESARROLLO && decision === 'app') {
    try {
      return await guardarSiSirve(cache, peticion, await fetch(peticion));
    } catch (error) {
      const guardada = await cache.match(claveDe(peticion));
      if (guardada) return guardada;
      throw error;
    }
  }
  const guardada = await cache.match(claveDe(peticion));
  if (guardada) return guardada;
  return guardarSiSirve(cache, peticion, await fetch(peticion));
}

// Las páginas y los scripts de los workers salen con las dos cabeceras de
// aislamiento de origen (COOP/COEP): con ellas el navegador permite
// SharedArrayBuffer y el motor del reconocedor (ONNX Runtime) corre con
// varios hilos en vez de uno. GitHub Pages no manda cabeceras, así que las
// pone el service worker, que sirve la página desde la segunda visita (la
// primera va sin ellas: un hilo). Los workers también: los hilos de ONNX
// cargan su propio script (ort-wasm-*.mjs) y un worker sin COEP no
// arranca dentro de una página aislada. Lo demás (el .wasm de 27 MB, los
// módulos, el JSON) va TAL CUAL sale de la caché: rehacer la respuesta le
// quita a Chrome el código del .wasm ya compilado que guarda junto a la
// caché, y lo volvería a compilar en cada carga (revisión del 17-oct). Un
// recurso del mismo origen no necesita las cabeceras. Lo que la app carga
// de otro origen (el modelo de Hugging Face) va por fetch con CORS, que el
// aislamiento permite.
function conAislamiento(respuesta) {
  // Una respuesta opaca o de error no se toca (no se pueden leer sus cabeceras).
  if (!respuesta || respuesta.type === 'opaque' || respuesta.status === 0) return respuesta;
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set('Cross-Origin-Opener-Policy', 'same-origin');
  cabeceras.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras });
}

function necesitaAislamiento(peticion) {
  return peticion.mode === 'navigate' || ['document', 'worker', 'sharedworker'].includes(peticion.destination);
}

self.addEventListener('fetch', (evento) => {
  const decision = decidir(evento.request);
  if (decision === 'red') return;
  const respuesta = responder(evento.request, decision);
  evento.respondWith(necesitaAislamiento(evento.request) ? respuesta.then(conAislamiento) : respuesta);
});
