// La pestaña Vehículos (9-nov-2026): los modelos que la app tiene en 3D, su miniatura, el carro de muestra que abre
// "Ver en 3D" (DEM006, la Captiva) y lo que cambia en la demostración por eso. Joan abrió en su iPhone el enlace de
// prueba de JPX248 y no vio la camioneta: con este carro se ve el modelo sin depender de cómo esté guardado otro carro
// en ese teléfono.
//
// La pantalla del tablero corre de verdad (js/tablero-pantalla.js) sobre un DOM de mentira y la base de fake-indexeddb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { archivosApp } from '../herramientas/sellar-version.mjs';
import { CATALOGO } from '../js/catalogo-carros.js';
import { datosDeEntrada, entradaDe } from '../js/catalogo.js';
import { CLAVE_GUARDADO } from '../js/estado.js';
import { ajustesDelEscaneo } from '../js/escaneo.js';
import { escaneoDeCatalogo } from '../js/escaneo-catalogo.js';
import { abrirAlmacen, crearCarro, deserializarCarro, serializarCarro } from '../js/garaje.js';
import { MODELOS, MODELOS_EN_OBRA, colorQueSeVe, leerModeloGlb, miniaturaDelCarro, modeloQueLeToca, textoDeMegas, textosDeLaTarjeta } from '../js/modelos-catalogo.js';
import { PIEZAS } from '../js/piezas.js';
import { nombreDeColor } from '../js/color-foto.js';
import { nominaSemanal, semanaDe } from '../js/tablero.js';
import { asegurarCarroDeMuestra, cargarDemo, carroDeMuestra, carrosDemo, comoSeVen, empleadosDemo, estadoDemo, ofertaDeLaDemo, quitarLaDemostracion } from '../js/demo.js';
import { lineaConLaMarcaDeMas } from '../js/ficha-carro.js';

const CAPTIVA = MODELOS[0];
const HOY = new Date(2026, 10, 9, 10, 0, 0);
const bytesDe = (ruta) => fs.readFileSync(new URL('../' + ruta, import.meta.url));
const nuevoAlmacen = () => abrirAlmacen({ indexedDB: new IDBFactory() });

// Ancho y alto de un JPEG, de su marca SOF: sin librerías.
function medidasJpeg(bytes) {
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8, 'no empieza como JPEG');
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('JPEG raro en ' + i);
    const marca = bytes[i + 1];
    const largo = bytes.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { alto: bytes.readUInt16BE(i + 5), ancho: bytes.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  throw new Error('JPEG sin SOF');
}

// ---------- La tabla y la miniatura ----------

test('cada modelo dice cuántas piezas trae, y son las que trae su archivo', () => {
  for (const m of MODELOS) {
    const e = escaneoDeCatalogo(leerModeloGlb(bytesDe(m.archivo)), ajustesDelEscaneo);
    const cuentas = new Map();
    for (const etiqueta of e.etiquetas) cuentas.set(etiqueta, (cuentas.get(etiqueta) || 0) + 1);
    const presentes = PIEZAS.filter((p) => (cuentas.get(e.nombres.indexOf(p.id)) || 0) > 50).length;
    assert.equal(m.piezas, presentes, m.nombre + ': la tabla dice ' + m.piezas + ' y el archivo trae ' + presentes);
  }
});

test('cada modelo tiene su miniatura: JPEG de unos 700 x 380, liviana, al lado de la app y dentro de la precarga', () => {
  const precarga = archivosApp();
  for (const m of MODELOS) {
    assert.match(m.miniatura, /^vehiculos\/[a-z0-9-]+\.jpg$/, 'la ruta va en la tabla');
    // Con el nombre del archivo del modelo: un GLB nuevo pide una foto nueva, y así no se queda la vieja por descuido.
    assert.equal(m.miniatura.slice('vehiculos/'.length, -'.jpg'.length), m.archivo.slice('modelos/'.length, -'.glb'.length));
    const bytes = bytesDe(m.miniatura);
    assert.ok(bytes.length < 80 * 1024, m.miniatura + ' pesa ' + bytes.length);
    assert.deepEqual(medidasJpeg(bytes), { ancho: 700, alto: 380 });
    // Sin señal la pestaña abre: tiene que estar en la precarga. El GLB no, a propósito (4,5 MB).
    assert.ok(precarga.includes(m.miniatura), m.miniatura + ' no está en la precarga');
    assert.ok(!precarga.includes(m.archivo));
  }
});

test('la tabla de los que siguen está vacía hoy, y si un día tiene algo, es de verdad y no repite un modelo', () => {
  assert.ok(Array.isArray(MODELOS_EN_OBRA));
  // Si esto falla porque alguien agregó un modelo en obra: que sea uno que de verdad se está haciendo, con sus fotos.
  assert.equal(MODELOS_EN_OBRA.length, 0, 'la pestaña dice "se están haciendo sus modelos": que sea verdad');
  for (const m of MODELOS_EN_OBRA) {
    assert.ok(m.nombre && m.de);
    assert.ok(!MODELOS.some((x) => x.nombre === m.nombre));
  }
});

test('lo que dice la tarjeta sale de la tabla y no dice "escaneado"', () => {
  const t = textosDeLaTarjeta(CAPTIVA);
  assert.equal(t.nombre, 'Chevrolet Captiva LT 2020');
  assert.equal(t.detalle, 'Para la Captiva de 2019 en adelante · 17 piezas · 4,5 MB la primera vez');
  assert.equal(t.linea, 'Chevrolet Captiva (nueva)');
  // Al botón, y no a Datos del carro: en un carro creado como "Chevrolet Captiva" esa receta dejaba la carrocería de cajas.
  assert.match(t.uso, /^En un carro del taller: toca «Usar en un carro» y elígelo\. Le pone la línea «Chevrolet Captiva \(nueva\)», y la Captiva sale sola en ese carro\./);
  assert.ok(!/Datos del carro/.test(t.uso));
  assert.match(t.uso, /Las de otros años pueden tener otra trompa\./);
  for (const texto of Object.values(t)) assert.ok(!/escanead/i.test(texto), texto);
  assert.equal(textoDeMegas(4.46), '4,5 MB');
  assert.equal(textoDeMegas(12), '12 MB');
});

test('la miniatura va de portada solo en un carro al que le toca el modelo', () => {
  const linea = datosDeEntrada(entradaDe('Chevrolet', 'Captiva (nueva)'));
  assert.equal(miniaturaDelCarro(crearCarro({ placa: 'JPX248', ...linea })), CAPTIVA.miniatura);
  // Escrito en el campo Marca del Garaje, también es de la línea.
  assert.equal(miniaturaDelCarro(crearCarro({ placa: 'JPX248', marca: 'Chevrolet Captiva (nueva)' })), CAPTIVA.miniatura);
  // Pidió la carrocería de referencia: la miniatura no sería su carro.
  assert.equal(miniaturaDelCarro(crearCarro({ placa: 'JPX248', ...linea, sinModeloDeCatalogo: true })), '');
  // "Chevrolet Captiva" a secas puede ser la de 2007 a 2018: el modelo no se le pone sin preguntar, ni su foto tampoco.
  assert.equal(miniaturaDelCarro(crearCarro({ placa: 'JPX248', marca: 'Chevrolet Captiva' })), '');
  assert.equal(miniaturaDelCarro(crearCarro({ placa: 'LOG123', ...datosDeEntrada(entradaDe('Renault', 'Logan II')) })), '');
});

// ---------- El carro de muestra ----------

test('DEM006 es la Captiva del catálogo, en el café del modelo, y cada modelo tiene su carro de muestra', () => {
  const dem = carroDeMuestra(CAPTIVA, HOY);
  assert.equal(dem.placa, 'DEM006');
  assert.equal(dem.demo, true);
  const ficha = datosDeEntrada(entradaDe('Chevrolet', 'Captiva (nueva)'));
  assert.deepEqual({ marca: dem.marca, linea: dem.linea, carroceria: dem.carroceria, medidas: dem.medidas }, ficha);
  assert.equal(modeloQueLeToca(dem), CAPTIVA);
  // Sin color elegido: el 3D sale en el de las fotos, y el Garaje dice café.
  assert.equal(dem.color, '');
  assert.equal(nombreDeColor(colorQueSeVe(dem)), 'café');
  for (const m of MODELOS) assert.ok(carroDeMuestra(m, HOY), 'sin carro de muestra: ' + m.nombre);
});

test('DEM006 creado solo no deja plata "sin pintor" en la nómina, y con los demás tampoco', () => {
  const dem = carroDeMuestra(CAPTIVA, HOY);
  const piezas = Object.values(dem.piezas);
  assert.ok(piezas.length >= 2 && piezas.length <= 3);
  assert.ok(piezas.some((p) => p.estado === 'en-proceso') && piezas.some((p) => p.estado === 'pendiente'));
  assert.ok(!piezas.some((p) => p.estado === 'terminada'), 'una terminada sin sus empleados sale como "sin pintor"');
  // Ningún pintor: llega solo a un taller real, donde los de la demostración no existen (revisión del 9-nov).
  assert.ok(piezas.every((p) => !p.pintor), 'con un pintor que no existe, el menú solo ofrece a los reales');
  assert.equal(nominaSemanal([dem], [], semanaDe(HOY)).sinPintor.length, 0);
  assert.equal(nominaSemanal(carrosDemo(HOY), empleadosDemo(HOY), semanaDe(HOY)).sinPintor.length, 0);
});

test('"Ver en 3D" crea solo DEM006: ni el resto de la demostración ni sus empleados, y no pisa lo que ya está', async () => {
  const almacen = await nuevoAlmacen();
  const real = crearCarro({ placa: 'JPX248', marca: 'Chevrolet', linea: 'Captiva (nueva)', piezas: { capo: { estado: 'terminada' } } });
  await almacen.guardar(real);
  const antes = await almacen.obtener('JPX248');

  const primera = await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY);
  assert.equal(primera.como, 'creado');
  assert.deepEqual((await almacen.listar()).map((c) => c.placa).sort(), ['DEM006', 'JPX248']);
  assert.deepEqual(await almacen.listarEmpleados(), []);
  assert.deepEqual(await almacen.obtener('JPX248'), antes, 'el carro real no se toca');

  // Alguien marcó el techo para probar: la segunda vez no se lo borra.
  const dem = await almacen.obtener('DEM006');
  dem.piezas.techo = { estado: 'pendiente', desde: HOY.toISOString(), trabajo: 'pintura', pintor: '' };
  await almacen.guardar(dem);
  assert.equal((await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY)).como, 'estaba');
  assert.ok((await almacen.obtener('DEM006')).piezas.techo);

  // Le pidieron la carrocería de referencia: "Ver en 3D" no abriría la Captiva. Se le devuelve, con sus piezas.
  await almacen.guardar({ ...(await almacen.obtener('DEM006')), sinModeloDeCatalogo: true });
  const arreglado = await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY);
  assert.equal(arreglado.como, 'arreglado');
  assert.equal(modeloQueLeToca(await almacen.obtener('DEM006')), CAPTIVA);
  assert.ok((await almacen.obtener('DEM006')).piezas.techo);
  almacen.cerrar();
});

test('un carro real con la placa DEM006 no se toca nunca', async () => {
  const almacen = await nuevoAlmacen();
  await almacen.guardar(crearCarro({ placa: 'DEM006', marca: 'Fiat' }));
  const antes = await almacen.obtener('DEM006');
  const r = await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY);
  assert.equal(r.como, 'real');
  assert.deepEqual(await almacen.obtener('DEM006'), antes);
  almacen.cerrar();
});

// ---------- La demostración a medias ----------

test('la demostración dice lo que hay y ofrece lo que falta: nada, a medias, entera', async () => {
  const almacen = await nuevoAlmacen();
  let oferta = ofertaDeLaDemo(await estadoDemo(almacen, HOY), { ahora: HOY });
  assert.equal(oferta.accion, 'cargar');
  assert.equal(oferta.boton, 'Cargar demostración');
  // Dice cuántos salen en 3D de verdad: Joan pidió carros reales, y de los 6 solo la Captiva tiene modelo.
  assert.equal(oferta.texto, 'Para ver la app con algo adentro puedes cargar 6 carros de demostración y 3 empleados, con piezas arregladas y en reparación: 1 en 3D de verdad (la Captiva) y 5 con la carrocería de referencia. Se quitan en bloque cuando quieras.');
  assert.equal('oculto' in oferta, false, 'se ofrece siempre, también en el Garaje con carros reales: decisión de Joan');

  // Solo DEM006 (de "Ver en 3D"), con un carro real: se puede cargar el resto o quitarla, y dice cómo se ven los que faltan.
  await almacen.guardar(crearCarro({ placa: 'JPX248', marca: 'Chevrolet' }));
  await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY);
  oferta = ofertaDeLaDemo(await estadoDemo(almacen, HOY), { ahora: HOY });
  assert.equal(oferta.boton, 'Cargar el resto');
  assert.equal(oferta.accion, 'cargar');
  assert.equal(oferta.quitarAparte, true);
  assert.equal(oferta.texto, 'Hay 1 carro de demostración (el marcado «demo»). Puedes cargar los otros: 5 carros y 3 empleados (esos carros se ven con la carrocería de referencia, no en 3D de verdad). Lo real no se toca, ni al cargar ni al quitar.');
  assert.ok(!/Falta/.test(oferta.texto), '"falta" suena a que algo se dañó');

  await cargarDemo(almacen, HOY);
  oferta = ofertaDeLaDemo(await estadoDemo(almacen, HOY), { ahora: HOY });
  assert.equal(oferta.accion, 'quitar');
  assert.equal(oferta.quitarAparte, false);
  assert.match(oferta.texto, /^Hay 6 carros y 3 empleados de demostración/);
  almacen.cerrar();
});

test('quitar la demostración se lleva DEM006, sus escaneos y su borrador, y deja lo real', async () => {
  const almacen = await nuevoAlmacen();
  const real = crearCarro({ placa: 'JPX248', marca: 'Chevrolet', linea: 'Captiva (nueva)', piezas: { capo: { estado: 'en-proceso' } } });
  await almacen.guardar(real);
  await cargarDemo(almacen, HOY);
  const antes = await almacen.obtener('JPX248');
  const guardado = new Map([[CLAVE_GUARDADO, serializarCarro(await almacen.obtener('DEM006'))]]);
  const local = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: (k) => guardado.delete(k) };
  const borrados = [];
  const quitado = await quitarLaDemostracion(almacen, { local, abrirEscaneos: async () => ({ borrar: async (placa) => borrados.push(placa) }) });
  assert.deepEqual(quitado, { carros: 6, empleados: 3 });
  assert.deepEqual((await almacen.listar()).map((c) => c.placa), ['JPX248']);
  assert.deepEqual(await almacen.obtener('JPX248'), antes);
  assert.equal(guardado.has(CLAVE_GUARDADO), false, 'el visor sin placa la volvería a crear');
  await new Promise((listo) => setTimeout(listo, 10));
  assert.deepEqual(borrados.sort(), ['DEM001', 'DEM002', 'DEM003', 'DEM004', 'DEM005', 'DEM006']);

  // Con un carro real en el borrador, el borrador se queda.
  await cargarDemo(almacen, HOY);
  guardado.set(CLAVE_GUARDADO, serializarCarro(real));
  await quitarLaDemostracion(almacen, { local, abrirEscaneos: async () => ({ borrar: async () => {} }) });
  assert.equal(deserializarCarro(guardado.get(CLAVE_GUARDADO)).placa, 'JPX248');
  almacen.cerrar();
});

// ---------- La pantalla, con un DOM de mentira ----------

class Nodo {
  constructor(etiqueta = 'div', id = '') {
    this.tagName = etiqueta.toUpperCase();
    this.id = id;
    this.children = [];
    this.oyentes = {};
    this.style = {};
    this.dataset = {};
    this.atributos = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.className = '';
  }
  addEventListener(tipo, oyente) {
    (this.oyentes[tipo] ||= []).push(oyente);
  }
  click() {
    for (const oyente of this.oyentes.click || []) oyente({ type: 'click', target: this, preventDefault() {} });
  }
  append(...nodos) {
    this.children.push(...nodos.map((n) => (typeof n === 'string' ? Object.assign(new Nodo('#texto'), { textContent: n }) : n)));
  }
  replaceChildren(...nodos) {
    this.children = [];
    this.append(...nodos);
  }
  setAttribute(nombre, valor) {
    this.atributos[nombre] = String(valor);
  }
  getAttribute(nombre) {
    return this.atributos[nombre] ?? null;
  }
  removeAttribute(nombre) {
    delete this.atributos[nombre];
  }
  querySelectorAll() {
    return [];
  }
  // Todo el texto de adentro, como innerText.
  get texto() {
    return [this.textContent, ...this.children.map((h) => h.texto)].filter(Boolean).join(' ');
  }
  buscar(condicion) {
    if (condicion(this)) return this;
    for (const h of this.children) {
      const r = h.buscar(condicion);
      if (r) return r;
    }
    return null;
  }
}

const nodos = new Map();
const nodo = (clave) => {
  if (!nodos.has(clave)) nodos.set(clave, new Nodo('div', clave));
  return nodos.get(clave);
};
const espera = (ms = 30) => new Promise((listo) => setTimeout(listo, ms));

function ponerPagina(url, guardado) {
  globalThis.window = globalThis;
  globalThis.document = {
    getElementById: nodo,
    querySelector: nodo,
    querySelectorAll: (selector) => (selector === '.pestana' ? ['vehiculos', 'empleados', 'historial', 'indicadores'].map(nodo) : []),
    createElement: (etiqueta) => new Nodo(etiqueta),
    title: '',
  };
  globalThis.location = { href: url };
  globalThis.history = { replaceState: (_, __, nueva) => (globalThis.location.href = String(nueva)) };
  globalThis.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: (k) => guardado.delete(k) };
  globalThis.confirm = () => true;
}

test('la pestaña Vehículos: una tarjeta por modelo, sin "Los que siguen", y "Ver en 3D" crea solo DEM006 y lo abre', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const guardado = new Map();
  ponerPagina('http://x/taller/tablero.html?p=vehiculos', guardado);
  globalThis.indexedDB = new IDBFactory();
  await import('../js/tablero-pantalla.js?con-registro');
  await window.__tablero.listo;

  assert.equal(nodo('vehiculos').hidden, false);
  assert.equal(nodo('empleados').hidden, true);
  assert.equal(nodo('subtitulo').textContent, 'Vehículos');
  const tarjetas = nodo('vehiculos-lista').children;
  assert.equal(tarjetas.length, MODELOS.length);
  const foto = tarjetas[0].buscar((n) => n.tagName === 'IMG');
  assert.equal(foto.src, CAPTIVA.miniatura);
  const texto = tarjetas[0].texto;
  assert.match(texto, /En 3D de verdad Chevrolet Captiva LT 2020 Para la Captiva de 2019 en adelante · 17 piezas · 4,5 MB la primera vez Ver en 3D/);
  assert.match(texto, /Abre DEM006, un carro de demostración/);
  assert.match(texto, /CC BY 3\.0/, 'la miniatura sale de fotos CC BY: va con su crédito');
  assert.ok(!/escanead/i.test(texto));
  assert.equal(nodo('vehiculos-en-obra').hidden, true, 'con la tabla vacía no se anuncia nada');
  // Sin prometer un camino que un iPhone no tiene: el escáner de la app pide un Android con ARCore.
  assert.equal(nodo('vehiculos-demas').textContent, 'Las demás líneas del catálogo (' + (CATALOGO.length - MODELOS.length).toLocaleString('es-CO') + ') se ven con la carrocería de referencia. Para un carro exacto hay que escanearlo: con la app, en un Android con ARCore, o con RealityScan subiendo el archivo, que todavía no se ha probado con uno sacado de un celular. En el carro, «Escanear» dice cómo.');
  assert.equal(nodo('vehiculos-enlace').hidden, true, 'sin venir del enlace no hay aviso');
  assert.equal(nodo('demo').hidden, false);
  assert.equal(nodo('demo-boton').textContent, 'Cargar demostración');

  tarjetas[0].buscar((n) => n.tagName === 'BUTTON' && n.textContent === 'Ver en 3D').click();
  await espera(60);
  assert.equal(location.href, 'index.html?placa=DEM006');
  const almacen = window.__tablero.almacen;
  assert.deepEqual((await almacen.listar()).map((c) => c.placa), ['DEM006']);
  assert.deepEqual(await almacen.listarEmpleados(), []);
  assert.equal(modeloQueLeToca(await almacen.obtener('DEM006')), CAPTIVA);
});

test('sin registro, "Ver en 3D" deja DEM006 de borrador, que es de donde lee el visor, y abre igual', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const guardado = new Map();
  ponerPagina('http://x/taller/tablero.html?p=vehiculos', guardado);
  const fabrica = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try {
    await import('../js/tablero-pantalla.js?sin-registro');
    await window.__tablero.listo;
  } finally {
    globalThis.indexedDB = fabrica;
  }
  assert.equal(window.__tablero.almacen, null);
  assert.equal(nodo('demo').hidden, true);
  nodo('vehiculos-lista').children[0].buscar((n) => n.tagName === 'BUTTON' && n.textContent === 'Ver en 3D').click();
  await espera(30);
  assert.equal(location.href, 'index.html?placa=DEM006');
  const borrador = deserializarCarro(guardado.get(CLAVE_GUARDADO));
  assert.equal(borrador.placa, 'DEM006');
  assert.equal(borrador.demo, true);
  assert.equal(modeloQueLeToca(borrador), CAPTIVA, 'el visor lo abre con la línea, y le toca la Captiva');
});

// ---------- Lo que arregló la revisión del 9-nov ----------

test('"Cargar el resto" no pisa lo que se marcó en DEM006, ni vuelve a cargar lo que ya está', async () => {
  const almacen = await nuevoAlmacen();
  await asegurarCarroDeMuestra(almacen, CAPTIVA, HOY);
  const dem = await almacen.obtener('DEM006');
  dem.piezas.techo = { estado: 'pendiente', desde: HOY.toISOString(), trabajo: 'pintura', pintor: '' };
  await almacen.guardar(dem, '2026-11-09T15:00:00.000Z');
  const antes = await almacen.obtener('DEM006');
  assert.deepEqual(await cargarDemo(almacen, HOY), { carros: 5, empleados: 3 });
  assert.deepEqual(await almacen.obtener('DEM006'), antes, 'el techo y su fecha se quedan');
  assert.deepEqual(await cargarDemo(almacen, HOY), { carros: 0, empleados: 0 });
  almacen.cerrar();
});

test('cómo se ven los carros, dicho en palabras: cuántos en 3D de verdad y cuántos con la carrocería de referencia', () => {
  const demo = carrosDemo(HOY);
  assert.equal(comoSeVen(demo), '1 en 3D de verdad (la Captiva) y 5 con la carrocería de referencia');
  assert.equal(comoSeVen(demo.filter((c) => c.placa !== 'DEM006')), 'se ven con la carrocería de referencia, no en 3D de verdad');
  assert.equal(comoSeVen(demo.filter((c) => c.placa === 'DEM006')), 'sale en 3D de verdad');
});

test('Datos del carro: "Captiva (nueva)" en Línea con "Chevrolet Captiva" en Marca es la Captiva nueva del catálogo', () => {
  const entrada = lineaConLaMarcaDeMas('Chevrolet Captiva', 'Captiva (nueva)');
  assert.equal(entrada && entrada.marca + ' ' + entrada.linea, 'Chevrolet Captiva (nueva)');
  assert.equal(modeloQueLeToca(crearCarro({ placa: 'JPX248', ...datosDeEntrada(entrada) })), CAPTIVA);
  // Con la marca sola ya quedaba bien (y no se toca, para no pisar al guardar la carrocería que se eligió después).
  assert.equal(lineaConLaMarcaDeMas('Chevrolet', 'Captiva (nueva)'), null);
  assert.equal(lineaConLaMarcaDeMas('Chevrolet Captiva', 'Una que no existe'), null);
  assert.equal(lineaConLaMarcaDeMas('', 'Captiva (nueva)'), null);
});

// Una pantalla del tablero nueva, sobre un registro que ya trae `carros`.
async function tableroCon(url, carros, sufijo) {
  const fabrica = new IDBFactory();
  const previo = await abrirAlmacen({ indexedDB: fabrica });
  for (const c of carros) await previo.guardar(c);
  previo.cerrar();
  const guardado = new Map();
  ponerPagina(url, guardado);
  globalThis.indexedDB = fabrica;
  await import('../js/tablero-pantalla.js?' + sufijo);
  await window.__tablero.listo;
  await espera(60);
  const tarjeta = nodo('vehiculos-lista').children[0];
  const boton = (texto) => tarjeta.buscar((n) => n.tagName === 'BUTTON' && n.textContent.startsWith(texto));
  return { almacen: window.__tablero.almacen, tarjeta, boton, guardado };
}

test('con un carro del taller de placa DEM006, "Ver en 3D" no lo abre: lo dice, y ese carro queda igual', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const fiat = crearCarro({ placa: 'DEM006', marca: 'Fiat Uno', piezas: { capo: { estado: 'pendiente' } } });
  const { almacen, boton } = await tableroCon('http://x/taller/tablero.html?p=vehiculos', [fiat], 'dem-real');
  const antes = await almacen.obtener('DEM006');
  boton('Ver en 3D').click();
  await espera(60);
  assert.equal(location.href, 'http://x/taller/tablero.html?p=vehiculos', 'abría el Fiat del taller mientras la tarjeta prometía uno de demostración');
  assert.match(nodo('aviso').textContent, /^Ya hay un carro del taller con la placa DEM006, que es la de la muestra de la Captiva: no se abre/);
  assert.equal(nodo('aviso').hidden, false);
  assert.deepEqual(await almacen.obtener('DEM006'), antes);
});

test('"Usar en un carro" lista los carros del taller (no los de demostración) y le pone la línea al que se toque', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const jpx = crearCarro({ placa: 'JPX248', marca: 'Chevrolet Captiva', color: '#1f4e9c', piezas: { capo: { estado: 'en-proceso' } } });
  const { almacen, tarjeta, boton } = await tableroCon('http://x/taller/tablero.html?p=vehiculos', [jpx, carroDeMuestra(CAPTIVA, HOY)], 'usar');
  const caja = tarjeta.buscar((n) => n.className === 'usar-en');
  assert.equal(caja.hidden, true);
  boton('Usar en un carro').click();
  await espera(60);
  assert.equal(caja.hidden, false);
  assert.match(caja.texto, /Le pone la línea «Chevrolet Captiva \(nueva\)» con su carrocería y sus medidas\. Las piezas marcadas y el color se quedan\./);
  assert.equal(caja.buscar((n) => n.tagName === 'BUTTON' && n.textContent.startsWith('DEM006')), null, 'los de demostración no');
  const opcion = caja.buscar((n) => n.tagName === 'BUTTON' && n.textContent.startsWith('JPX248'));
  assert.equal(opcion.textContent, 'JPX248 · Chevrolet Captiva');
  opcion.click();
  await espera(60);
  assert.equal(location.href, 'index.html?placa=JPX248');
  const nuevo = await almacen.obtener('JPX248');
  assert.equal(modeloQueLeToca(nuevo), CAPTIVA, 'con "Chevrolet Captiva" escrito, la receta vieja dejaba la carrocería de cajas');
  assert.equal(nuevo.color, '#1f4e9c');
  assert.equal(nuevo.piezas.capo.estado, 'en-proceso');
});

test('del enlace de prueba con un JPX248 que en este teléfono no está: dice por qué y ofrece crearlo con la Captiva', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { almacen, tarjeta } = await tableroCon('http://x/taller/tablero.html?p=vehiculos&placa=JPX248', [], 'enlace-no-esta');
  assert.equal(nodo('vehiculos-enlace').hidden, false);
  assert.equal(
    nodo('vehiculos-enlace').textContent,
    'En este celular no hay ningún carro JPX248, y por eso el enlace mostraba el carro de siempre (Safari y la app de la pantalla de inicio guardan los carros aparte). «Ver en 3D» muestra la Captiva, y abajo puedes crear JPX248 con ella.',
  );
  const caja = tarjeta.buscar((n) => n.className === 'usar-en');
  assert.equal(caja.hidden, false, 'la lista ya abierta, con JPX248 a mano');
  const crear = caja.buscar((n) => n.tagName === 'BUTTON' && n.textContent === 'Crear JPX248 como Chevrolet Captiva (nueva)');
  assert.ok(crear);
  crear.click();
  await espera(60);
  assert.equal(location.href, 'index.html?placa=JPX248');
  assert.equal(modeloQueLeToca(await almacen.obtener('JPX248')), CAPTIVA);
});

test('del enlace con un JPX248 que dice "Chevrolet Captiva": dice que falta el año, y ofrece ponérsela', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const jpx = crearCarro({ placa: 'JPX248', marca: 'Chevrolet Captiva' });
  const { tarjeta } = await tableroCon('http://x/taller/tablero.html?p=vehiculos&placa=JPX248', [jpx], 'enlace-parecido');
  assert.equal(nodo('vehiculos-enlace').textContent, 'JPX248 dice «Chevrolet Captiva», sin decir si es la de 2019 en adelante, y por eso el enlace mostraba el carro de siempre. «Ver en 3D» muestra la Captiva, y abajo puedes ponérsela a JPX248.');
  const caja = tarjeta.buscar((n) => n.className === 'usar-en');
  assert.equal(caja.hidden, false);
  assert.ok(caja.buscar((n) => n.tagName === 'BUTTON' && n.textContent === 'JPX248 · Chevrolet Captiva'));
});
