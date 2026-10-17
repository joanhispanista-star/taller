// Lo instalable, probado en Node sin navegador: que el manifest sea válido y
// apunte a iconos que existen, que las tres páginas lo enlacen con rutas
// relativas, que sw.js esté sellado con la lista real de archivos, y que el
// service worker decida bien qué toca y qué no (Hugging Face, nunca).
//
// sw.js se ejecuta de verdad dentro de un `vm` con un `self`, unas `caches`
// y un `fetch` de mentira: así la prueba mira lo que el navegador haría, no
// una copia de la lógica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { RAIZ, archivosMotor, leerSello, rutaEnDisco, sellos } from '../herramientas/sellar-version.mjs';

const leer = (archivo) => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const PAGINAS = ['index.html', 'garaje.html', 'tablero.html'];

// Ancho y alto de un PNG, de su cabecera (IHDR): sin librerías.
function medidasPng(archivo) {
  const bytes = fs.readFileSync(path.join(RAIZ, archivo));
  assert.equal(bytes.toString('latin1', 1, 4), 'PNG', archivo + ' no es un PNG');
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}

test('el manifest es JSON válido, relativo a la carpeta y con lo que piden Android y iPhone', () => {
  const m = JSON.parse(leer('manifest.webmanifest'));
  assert.equal(m.name, 'Taller de Pintura');
  assert.ok(m.short_name && m.short_name.length <= 12, 'short_name corto para el nombre bajo el icono');
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'es');
  // Relativas: la app vive en /taller/ en GitHub Pages, no en la raíz.
  assert.ok(m.start_url.startsWith('./'), 'start_url relativa');
  assert.ok(m.scope.startsWith('./'), 'scope relativo');
  assert.ok(PAGINAS.includes(m.start_url.slice(2)), 'start_url es una de las páginas');
  assert.equal(m.theme_color, '#1a1e24');
  assert.equal(m.background_color, '#1a1e24');
});

test('los iconos del manifest existen, miden lo que dicen y hay 192 y 512 maskable', () => {
  const m = JSON.parse(leer('manifest.webmanifest'));
  const maskables = new Set();
  for (const icono of m.icons) {
    assert.ok(!icono.src.startsWith('/'), icono.src + ' debe ser relativo');
    const [ancho, alto] = icono.sizes.split('x').map(Number);
    const medidas = medidasPng(icono.src);
    assert.deepEqual(medidas, { ancho, alto }, icono.src + ' no mide ' + icono.sizes);
    assert.equal(icono.type, 'image/png');
    if ((icono.purpose || 'any').includes('maskable')) maskables.add(ancho);
  }
  assert.ok(maskables.has(192) && maskables.has(512), 'Android pide maskable de 192 y de 512');
  assert.deepEqual(medidasPng('iconos/icono-180.png'), { ancho: 180, alto: 180 }, 'el de iPhone');
});

test('las tres páginas enlazan el manifest, el icono de iPhone y el registro, con rutas relativas', () => {
  for (const pagina of PAGINAS) {
    const html = leer(pagina);
    assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'), pagina + ' sin manifest');
    assert.ok(html.includes('<link rel="apple-touch-icon" href="iconos/icono-180.png">'), pagina + ' sin apple-touch-icon');
    assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'), pagina + ' sin apple-mobile-web-app-capable');
    assert.ok(html.includes('<script type="module" src="js/instalable.js"></script>'), pagina + ' sin instalable.js');
    assert.ok(html.includes('<meta name="theme-color" content="#1a1e24">'), pagina + ' con otro theme-color que el manifest');
    assert.ok(!/href="\/|src="\//.test(html), pagina + ' tiene una ruta absoluta (rompería bajo /taller/)');
  }
  assert.ok(leer('garaje.html').includes('id="actualizar"'), 'el Garaje tiene el aviso de versión nueva');
  assert.ok(leer('js/instalable.js').includes("new URL('../sw.js', import.meta.url)"), 'sw.js se busca al lado de las páginas, no en la raíz del dominio');
});

test('sw.js está sellado con la lista y la huella reales (si falla: npm run sellar)', () => {
  const sello = leerSello(leer('sw.js'));
  assert.ok(sello, 'sw.js no tiene sello');
  const real = sellos();
  assert.deepEqual(sello.archivos, real.archivos, 'la lista de archivos de sw.js no es la de la carpeta: corre `npm run sellar`');
  assert.equal(sello.version, real.version, 'la versión de sw.js no es la del contenido actual: corre `npm run sellar`');
  assert.equal(sello.versionMotor, real.versionMotor, 'la versión del motor en sw.js no es la actual: corre `npm run sellar`');
});

test('todo lo que el service worker precarga existe, y nada pesado va en la precarga', () => {
  const { archivos, motor } = sellos();
  for (const a of archivos) assert.ok(fs.existsSync(path.join(RAIZ, rutaEnDisco(a))), a + ' no existe');
  for (const pagina of PAGINAS) assert.ok(archivos.includes(pagina), pagina + ' no está en la precarga');
  for (const necesario of ['./', 'css/estilos.css', 'js/vendor/three.module.min.js', 'js/etiquetas-clip.json', 'manifest.webmanifest']) {
    assert.ok(archivos.includes(necesario), necesario + ' no está en la precarga');
  }
  // Todo módulo propio que importe alguna página o módulo tiene que estar.
  for (const modulo of fs.readdirSync(path.join(RAIZ, 'js')).filter((n) => n.endsWith('.js'))) {
    assert.ok(archivos.includes('js/' + modulo), 'js/' + modulo + ' no está en la precarga');
  }
  // Los .wasm del motor van aparte (al primer uso), nunca en la precarga.
  assert.ok(!archivos.some((a) => a.endsWith('.wasm')), 'un .wasm en la precarga');
  assert.ok(motor.some((a) => a.endsWith('.asyncify.wasm')), 'el motor incluye el wasm que usa Transformers.js');
  assert.deepEqual(motor, archivosMotor());
  const total = archivos.reduce((s, a) => s + fs.statSync(path.join(RAIZ, rutaEnDisco(a))).size, 0);
  assert.ok(total < 4 * 1024 * 1024, 'la precarga pesa ' + total + ' bytes; más de 4 MB es sospechoso');
});

// ---------- El service worker corriendo en un vm ----------

// El cuerpo lleva la etiqueta: así sobrevive a que el SW rehaga la
// respuesta para ponerle las cabeceras de aislamiento (conAislamiento).
function respuestaFalsa(etiqueta, { ok = true, status = 200 } = {}) {
  return { etiqueta, ok, status, type: 'basic', body: { etiqueta }, headers: new Headers(), clone() { return this; } };
}
class RespuestaFalsa {
  constructor(cuerpo, init = {}) {
    this.etiqueta = cuerpo && cuerpo.etiqueta;
    this.body = cuerpo;
    this.status = init.status;
    this.ok = init.status >= 200 && init.status < 300;
    this.type = 'basic';
    this.headers = new Headers(init.headers);
  }
  clone() {
    return this;
  }
}

// Un navegador de mentira: `self` con sus eventos, `caches` que recuerda lo
// que se abre, guarda y borra, y `fetch` que devuelve lo que se le diga.
function navegadorFalso({ ubicacion, cachesIniciales = {}, red = () => respuestaFalsa('de la red'), sinRed = false }) {
  const manejadores = {};
  const almacenes = {};
  const registro = { puts: [], matches: [], borradas: [], fetches: [], addAll: [], skipWaiting: 0, claim: 0 };
  for (const [nombre, contenido] of Object.entries(cachesIniciales)) almacenes[nombre] = new Map(Object.entries(contenido));
  const abrir = async (nombre) => {
    almacenes[nombre] ||= new Map();
    const mapa = almacenes[nombre];
    return {
      async match(clave) {
        registro.matches.push({ nombre, clave });
        return mapa.get(clave) || undefined;
      },
      async put(clave, respuesta) {
        registro.puts.push({ nombre, clave, etiqueta: respuesta.etiqueta });
        mapa.set(clave, respuesta);
      },
      async addAll(peticiones) {
        registro.addAll.push(...peticiones);
        for (const p of peticiones) mapa.set(p.url, respuestaFalsa('precargada'));
      },
    };
  };
  const self = {
    location: new URL(ubicacion),
    addEventListener(tipo, fn) {
      manejadores[tipo] = fn;
    },
    skipWaiting() {
      registro.skipWaiting++;
    },
    clients: {
      async claim() {
        registro.claim++;
      },
    },
  };
  class Request {
    constructor(url, init = {}) {
      this.url = String(url);
      this.cache = init.cache;
      this.method = init.method || 'GET';
      this.mode = init.mode || 'cors';
      this.destination = init.destination || '';
    }
  }
  const contexto = vm.createContext({
    self,
    URL,
    Request,
    Headers,
    Response: RespuestaFalsa,
    caches: {
      open: abrir,
      async keys() {
        return Object.keys(almacenes);
      },
      async delete(nombre) {
        registro.borradas.push(nombre);
        return delete almacenes[nombre];
      },
    },
    async fetch(peticion) {
      registro.fetches.push(peticion.url);
      if (sinRed) throw new TypeError('Failed to fetch');
      return red(peticion);
    },
  });
  vm.runInContext(leer('sw.js'), contexto, { filename: 'sw.js' });
  // Lo que el navegador haría con una petición: null si el SW no se metió.
  const pedir = async (url, init = {}) => {
    const evento = { request: new Request(url, init), respuesta: null, respondWith(p) { this.respuesta = p; } };
    manejadores.fetch(evento);
    return evento.respuesta ? await evento.respuesta : null;
  };
  const esperar = async (tipo, datos = {}) => {
    let promesa = null;
    manejadores[tipo]({ ...datos, waitUntil(p) { promesa = p; } });
    await promesa;
  };
  return { pedir, esperar, registro, almacenes, manejadores };
}

const PUBLICA = 'https://joanhispanista-star.github.io/taller/sw.js';
const LOCAL = 'http://127.0.0.1:8310/sw.js';

test('el service worker no toca Hugging Face, otros orígenes, otros métodos ni lo que no es de la app', async () => {
  const { pedir, registro } = navegadorFalso({ ubicacion: PUBLICA });
  assert.equal(await pedir('https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx'), null);
  assert.equal(await pedir('https://cdn-lfs.huggingface.co/repos/abc/def'), null);
  assert.equal(await pedir('https://joanhispanista-star.github.io/otro/cosa.js'), null, 'misma máquina, otra carpeta');
  assert.equal(await pedir('https://joanhispanista-star.github.io/taller/js/visor.js', { method: 'POST' }), null);
  assert.equal(await pedir('https://joanhispanista-star.github.io/taller/pruebas/fotos-reconocer/duster.jpg'), null, 'no es de la app');
  assert.equal(registro.fetches.length, 0, 'ni un fetch desde el SW');
});

test('en la dirección pública lo propio sale de la caché sin ir a la red, con o sin ?placa=', async () => {
  const { archivos } = sellos();
  const base = 'https://joanhispanista-star.github.io/taller/';
  const cachesIniciales = { ['taller-app-' + leerSello(leer('sw.js')).version]: Object.fromEntries(archivos.map((a) => [new URL(a, base).href, respuestaFalsa('precargada ' + a)])) };
  const { pedir, registro } = navegadorFalso({ ubicacion: PUBLICA, cachesIniciales });
  assert.equal((await pedir(base + 'js/visor.js')).etiqueta, 'precargada js/visor.js');
  assert.equal((await pedir(base + 'index.html?placa=JRX248')).etiqueta, 'precargada index.html');
  assert.equal((await pedir(base + 'tablero.html?p=empleados#x')).etiqueta, 'precargada tablero.html');
  assert.equal((await pedir(base)).etiqueta, 'precargada ./', 'la carpeta sola es index.html');
  assert.equal((await pedir(base + 'js/vendor/transformers/transformers.min.js')).etiqueta, 'precargada js/vendor/transformers/transformers.min.js');
  assert.equal(registro.fetches.length, 0, 'todo salió de la caché');
});

test('el motor ONNX (wasm y mjs) se guarda al primer uso en su propia caché, y la segunda vez no va a la red', async () => {
  const base = 'https://joanhispanista-star.github.io/taller/';
  const { pedir, registro, almacenes } = navegadorFalso({ ubicacion: PUBLICA });
  const wasm = base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm';
  assert.equal((await pedir(wasm)).etiqueta, 'de la red');
  assert.deepEqual(registro.fetches, [wasm]);
  const nombreMotor = Object.keys(almacenes).find((n) => n.startsWith('taller-motor-'));
  assert.ok(nombreMotor, 'una caché taller-motor-*');
  assert.equal(registro.puts[0].nombre, nombreMotor);
  assert.equal((await pedir(wasm)).etiqueta, 'de la red', 'la segunda vez devuelve lo guardado (que fue lo de la red)');
  assert.equal(registro.fetches.length, 1, 'la segunda vez no fue a la red');
  const mjs = base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs';
  await pedir(mjs);
  assert.equal(registro.fetches.length, 2);
});

test('una respuesta rota (404 o parcial) no se guarda', async () => {
  const base = 'https://joanhispanista-star.github.io/taller/';
  let siguiente = respuestaFalsa('404', { ok: false, status: 404 });
  const { pedir, registro } = navegadorFalso({ ubicacion: PUBLICA, red: () => siguiente });
  await pedir(base + 'js/vendor/transformers/ort-wasm-simd-threaded.wasm');
  siguiente = respuestaFalsa('206', { ok: true, status: 206 });
  await pedir(base + 'js/vendor/transformers/ort-wasm-simd-threaded.wasm');
  assert.equal(registro.puts.length, 0);
});

test('en el PC va primero a la red (para ver lo editado) y usa la caché solo si el servidor está apagado', async () => {
  const base = 'http://127.0.0.1:8310/';
  const conRed = navegadorFalso({ ubicacion: LOCAL });
  assert.equal((await conRed.pedir(base + 'garaje.html')).etiqueta, 'de la red');
  assert.equal(conRed.registro.puts.length, 1, 'y la guarda para cuando no haya servidor');
  assert.equal(conRed.registro.puts[0].clave, base + 'garaje.html');

  const sinRed = navegadorFalso({
    ubicacion: LOCAL,
    sinRed: true,
    cachesIniciales: { ['taller-app-' + leerSello(leer('sw.js')).version]: { [base + 'garaje.html']: respuestaFalsa('guardada') } },
  });
  assert.equal((await sinRed.pedir(base + 'garaje.html?x=1')).etiqueta, 'guardada');
  await assert.rejects(sinRed.pedir(base + 'tablero.html'), /Failed to fetch/, 'lo que no está guardado falla como sin SW');
});

test('al instalar precarga todos los archivos saltándose la caché HTTP, y al activar borra solo las cachés taller-* viejas', async () => {
  const { archivos } = sellos();
  const n = navegadorFalso({
    ubicacion: PUBLICA,
    cachesIniciales: { 'taller-app-vieja': {}, 'taller-motor-vieja': {}, 'transformers-cache': {}, 'otra-app': {} },
  });
  await n.esperar('install');
  assert.equal(n.registro.addAll.length, archivos.length);
  assert.ok(n.registro.addAll.every((p) => p.cache === 'reload'), "todas con cache: 'reload'");
  assert.ok(n.registro.addAll.some((p) => p.url === 'https://joanhispanista-star.github.io/taller/'), 'la carpeta sola');
  assert.ok(n.registro.addAll.some((p) => p.url === 'https://joanhispanista-star.github.io/taller/js/visor.js'));

  await n.esperar('activate');
  assert.deepEqual(n.registro.borradas.sort(), ['taller-app-vieja', 'taller-motor-vieja']);
  assert.ok(n.almacenes['transformers-cache'], 'la caché de Transformers.js sigue ahí');
  assert.equal(n.registro.claim, 1);

  n.manejadores.message({ data: { tipo: 'activar' } });
  n.manejadores.message({ data: { tipo: 'otra' } });
  n.manejadores.message({ data: null });
  assert.equal(n.registro.skipWaiting, 1, 'solo el mensaje del botón activa la versión que espera');
});

test('la página y los workers salen con las cabeceras de aislamiento; el .wasm sale tal cual; y el SW dice su versión', async () => {
  const base = 'https://joanhispanista-star.github.io/taller/';
  const { pedir, manejadores } = navegadorFalso({ ubicacion: PUBLICA });
  for (const [url, init] of [[base + 'garaje.html', { mode: 'navigate', destination: 'document' }], [base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', { destination: 'worker' }]]) {
    const r = await pedir(url, init);
    assert.equal(r.headers.get('Cross-Origin-Opener-Policy'), 'same-origin', url);
    assert.equal(r.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp', url);
    assert.equal(r.etiqueta, 'de la red', 'el cuerpo es el mismo');
  }
  // El .wasm (y cualquier subrecurso) no se rehace: Chrome guarda su código
  // compilado junto a la respuesta de la caché.
  const wasm = await pedir(base + 'js/vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm', { destination: '' });
  assert.ok(!(wasm instanceof RespuestaFalsa), 'el wasm sale tal cual, sin rehacer la respuesta');
  assert.equal(wasm.headers.get('Cross-Origin-Embedder-Policy'), null);
  assert.equal(wasm.etiqueta, 'de la red');
  const recibidos = [];
  manejadores.message({ data: { tipo: 'version' }, source: { postMessage: (m) => recibidos.push(m) } });
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0].version, leerSello(leer('sw.js')).version);
  manejadores.message({ data: { tipo: 'version' } }); // sin source no revienta
});
