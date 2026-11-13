// El enlace de prueba (probar-carro.html), con su código de verdad: el script de la página corre aquí con un service
// worker, unos botones y un reloj de mentira. Hasta el 9-nov-2026, a los 40 s entraba solo con lo que hubiera, y con
// mala señal eso era la versión vieja, que no conoce la Captiva: Joan abrió el enlace de JPX248 en su iPhone y no vio
// la camioneta por ningún lado (una de las dos causas posibles; la otra la cubre la pestaña Vehículos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { archivosApp } from '../herramientas/sellar-version.mjs';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { abrirAlmacen, crearCarro } from '../js/garaje.js';
import { datosDeEntrada, entradaDe } from '../js/catalogo.js';
import { destinoDelEnlace, porQueNoSeVeria } from '../js/enlace-prueba.js';

const HTML = fs.readFileSync(new URL('../probar-carro.html', import.meta.url), 'utf8');
const CODIGO = /<script type="module">([\s\S]*?)<\/script>/.exec(HTML)[1];
// El import() de la página (js/enlace-prueba.js) pasa por `importar`: cada prueba dice qué módulo contesta. Por defecto, uno
// que manda al visor de siempre, como un JPX248 que en ese teléfono ya tiene su línea.
const CODIGO_PROBADO = CODIGO.replace(/\bimport\(/g, 'importar(');
const alVisor = async () => ({ destinoDelEnlace: async (placa) => 'index.html?carro=nuevo&placa=' + placa });

class Trabajador {
  constructor(estado) {
    this.state = estado;
    this.oyentes = [];
    this.mensajes = [];
  }
  addEventListener(_, oyente) {
    this.oyentes.push(oyente);
  }
  postMessage(m) {
    this.mensajes.push(m);
  }
  pasarA(estado) {
    this.state = estado;
    for (const o of this.oyentes) o();
  }
}

// La página, con lo que el navegador le da. `registro` es lo que contesta register(); `controlador`, si ya hay una versión
// instalada controlando la página.
function abrir({ registro, controlador = {}, placa = 'JPX248', importar = alVisor }) {
  const nodos = new Map();
  const nodo = (id) => {
    if (!nodos.has(id)) {
      // Escondido o no, como viene en el HTML.
      const hidden = new RegExp('id="' + id + '"[^>]*\\shidden').test(HTML);
      nodos.set(id, { id, hidden, textContent: '', oyentes: [], addEventListener(_, o) { this.oyentes.push(o); }, click() { for (const o of this.oyentes) o(); } });
    }
    return nodos.get(id);
  };
  const pagina = { reemplazos: [], recargas: 0, nodo };
  const location = { search: '?placa=' + placa, replace: (url) => pagina.reemplazos.push(url), reload: () => (pagina.recargas += 1) };
  const navigator = { serviceWorker: { controller: controlador, register: async () => registro } };
  const correr = new Function('document', 'navigator', 'location', 'localStorage', 'window', 'console', 'importar', CODIGO_PROBADO);
  correr({ getElementById: nodo }, navigator, location, { setItem() {} }, { isSecureContext: true }, { warn() {} }, importar);
  return pagina;
}

const tandas = async (n = 30) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

test('probar-carro.html no está en la precarga: tiene que llegar de la red aunque el teléfono tenga una versión vieja', () => {
  assert.ok(!archivosApp().includes('probar-carro.html'));
});

test('con la versión al día entra de una, sin esperar a nadie', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const pagina = abrir({ registro: { installing: null, waiting: null, update: async () => {} } });
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248']);
});

test('con una versión nueva que no termina de bajar, a los 40 s NO entra a la vieja: lo dice, sigue esperando y deja entrar igual', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const bajando = new Trabajador('installing');
  const registro = { installing: bajando, waiting: null, update: async () => {} };
  const pagina = abrir({ registro });
  await tandas();
  assert.equal(pagina.nodo('entrar-igual').hidden, true, 'al principio solo espera');
  t.mock.timers.tick(15000);
  assert.match(pagina.nodo('estado').textContent, /^Todavía está bajando la versión nueva \(lleva 15 s\)\. La señal está lenta: sigo esperando/);
  assert.equal(pagina.nodo('entrar-igual').hidden, false);
  assert.equal(pagina.nodo('entrar-nota').hidden, false);
  t.mock.timers.tick(120000);
  await tandas();
  assert.deepEqual(pagina.reemplazos, [], 'entró a la versión vieja sin que nadie lo pidiera');
  assert.match(pagina.nodo('estado').textContent, /lleva 135 s/);

  // Termina de bajar: la enciende y entra sola.
  registro.waiting = bajando;
  registro.installing = null;
  bajando.pasarA('installed');
  await tandas();
  assert.deepEqual(bajando.mensajes, [{ tipo: 'activar' }]);
  bajando.pasarA('activated');
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248']);
});

test('"Entrar igual" entra cuando la persona lo pide, una sola vez', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const bajando = new Trabajador('installing');
  const pagina = abrir({ registro: { installing: bajando, waiting: null, update: async () => {} } });
  await tandas();
  t.mock.timers.tick(13000);
  pagina.nodo('entrar-igual').click();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248'], 'entra al tocarlo, sin esperar a que termine');
  bajando.pasarA('installed');
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248'], 'y no entra dos veces');
});

test('si la versión nueva se cae a mitad, no entra a la vieja: lo dice y ofrece intentar otra vez o entrar igual', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const bajando = new Trabajador('installing');
  const pagina = abrir({ registro: { installing: bajando, waiting: null, update: async () => {} } });
  await tandas();
  bajando.pasarA('redundant');
  await tandas();
  t.mock.timers.tick(60000);
  assert.deepEqual(pagina.reemplazos, []);
  assert.equal(pagina.nodo('estado').textContent, 'No se pudo terminar de bajar la versión nueva. Con mejor señal, toca «Intentar otra vez».');
  assert.equal(pagina.nodo('reintentar').hidden, false);
  assert.equal(pagina.nodo('entrar-igual').hidden, false);
  pagina.nodo('reintentar').click();
  assert.equal(pagina.recargas, 1);
});

test('si el navegador no deja registrar, dice lo que dijo el navegador', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const pagina = abrir({ registro: null });
  // register() devuelve null: update() revienta con el error del navegador de mentira.
  await tandas();
  assert.deepEqual(pagina.reemplazos, []);
  assert.match(pagina.nodo('estado').textContent, /^No se pudo terminar de bajar la versión nueva \(el navegador dijo: .+\)\./);
});

// ---------- A dónde entra (js/enlace-prueba.js) ----------
// La otra causa de que Joan no viera la camioneta: en ese almacén del teléfono JPX248 no existía o no tenía la línea, y el
// enlace lo creaba vacío, con el carro de siempre. Y la vez siguiente, lo mismo: ya existía, vacío.

const linea = (marca, nombre) => datosDeEntrada(entradaDe(marca, nombre));

test('qué placa no se vería: la que no está, la vacía y la "Chevrolet Captiva" sin año; las demás entran como siempre', () => {
  assert.equal(porQueNoSeVeria(null), 'no-esta');
  assert.equal(porQueNoSeVeria(crearCarro({ placa: 'JPX248' })), 'sin-datos');
  assert.equal(porQueNoSeVeria(crearCarro({ placa: 'JPX248', marca: 'Chevrolet Captiva' })), 'parecido');
  assert.equal(porQueNoSeVeria(crearCarro({ placa: 'JPX248', ...linea('Chevrolet', 'Captiva (nueva)') })), '');
  // Pidió la carrocería de referencia para ese carro: fue a propósito.
  assert.equal(porQueNoSeVeria(crearCarro({ placa: 'JPX248', ...linea('Chevrolet', 'Captiva (nueva)'), sinModeloDeCatalogo: true })), '');
  // Un carro con sus datos y sin modelo es justo lo que el enlace sirve para probar: el carro nuevo.
  assert.equal(porQueNoSeVeria(crearCarro({ placa: 'LOG123', ...linea('Renault', 'Symbol II') })), '');
});

test('el destino lee el registro de este teléfono y no crea nada: JPX248 que no está va a Vehículos, con la línea va al visor', async () => {
  const fabrica = new IDBFactory();
  const abrir = () => abrirAlmacen({ indexedDB: fabrica });
  assert.equal(await destinoDelEnlace('JPX248', { abrir }), 'tablero.html?p=vehiculos&placa=JPX248');
  assert.equal(await destinoDelEnlace(' jpx-248 ', { abrir }), 'tablero.html?p=vehiculos&placa=JPX248');
  let almacen = await abrir();
  assert.deepEqual(await almacen.listar(), [], 'el enlace no deja un JPX248 vacío');
  await almacen.guardar(crearCarro({ placa: 'JPX248' }));
  assert.equal(await destinoDelEnlace('JPX248', { abrir }), 'tablero.html?p=vehiculos&placa=JPX248');
  await almacen.guardar(crearCarro({ placa: 'JPX248', ...linea('Chevrolet', 'Captiva (nueva)') }));
  assert.equal(await destinoDelEnlace('JPX248', { abrir }), 'index.html?carro=nuevo&placa=JPX248');
  almacen.cerrar();
  assert.equal(await destinoDelEnlace('', { abrir }), 'index.html?carro=nuevo');
  // Sin registro, el de siempre: el visor sabe trabajar con borrador.
  assert.equal(await destinoDelEnlace('JPX248', { abrir: async () => { throw new Error('sin IndexedDB'); } }), 'index.html?carro=nuevo&placa=JPX248');
});

test('la página, con el módulo de verdad: un teléfono sin JPX248 entra a Vehículos, no al carro de siempre', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const fabrica = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  try {
    const pagina = abrir({ registro: { installing: null, waiting: null, update: async () => {} }, importar: () => import('../js/enlace-prueba.js') });
    for (let i = 0; i < 40 && !pagina.reemplazos.length; i++) {
      t.mock.timers.tick(10);
      await new Promise((listo) => setImmediate(listo));
    }
    assert.deepEqual(pagina.reemplazos, ['tablero.html?p=vehiculos&placa=JPX248']);
  } finally {
    globalThis.indexedDB = fabrica;
  }
});

test('si el módulo no contesta, entra al de siempre; y «Entrar igual» nunca le pregunta a la versión que haya', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  let pagina = abrir({ registro: { installing: null, waiting: null, update: async () => {} }, importar: async () => { throw new Error('404'); } });
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248']);

  // Se queda colgado: a los 4 s entra igual.
  pagina = abrir({ registro: { installing: null, waiting: null, update: async () => {} }, importar: () => new Promise(() => {}) });
  await tandas();
  assert.deepEqual(pagina.reemplazos, []);
  t.mock.timers.tick(4000);
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248']);

  let preguntas = 0;
  const bajando = new Trabajador('installing');
  pagina = abrir({ registro: { installing: bajando, waiting: null, update: async () => {} }, importar: async () => (preguntas += 1, { destinoDelEnlace: async () => 'tablero.html' }) });
  await tandas();
  t.mock.timers.tick(13000);
  pagina.nodo('entrar-igual').click();
  await tandas();
  assert.deepEqual(pagina.reemplazos, ['index.html?carro=nuevo&placa=JPX248']);
  assert.equal(preguntas, 0);
});
