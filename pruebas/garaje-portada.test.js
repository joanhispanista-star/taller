// La portada de cada carro en el Garaje (9-nov-2026): la foto de verdad manda; si no hay, y a la línea le toca un modelo de
// catálogo (la Captiva), la miniatura del modelo; y si tampoco, el cuadro de su color. Antes una Captiva sin foto salía
// como un cuadro café, que no decía nada al lado del 3D que se ve al abrirla.
//
// Aquí corre la pantalla de verdad (js/garaje-pantalla.js) sobre un DOM de mentira, con la base de fake-indexeddb. El
// reconocedor y el lector de placas se cambian por unos que fallan (como en garaje-lineas.test.js): esta prueba no los usa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import 'fake-indexeddb/auto';
import { datosDeEntrada, entradaDe } from '../js/catalogo.js';
import { PIEZA_CARRO, abrirAlmacen, crearCarro } from '../js/garaje.js';
import { MODELOS } from '../js/modelos-catalogo.js';
import { carroDeMuestra } from '../js/demo.js';

const FALSOS = {
  'reconocer.js': `const no = async () => { throw new Error('sin reconocedor en esta prueba'); };
    export const hilosEnUso = () => 1;
    export const reconocerCarro = no, reconocerMarcaPorLogo = no, reconocerMarcaCercaDePlaca = no, reconocerMarcaBarriendo = no, reconocerMarcaEnFotoDeCerca = no, lineasDeMarca = no;`,
  'placa-ocr.js': `const no = async () => { throw new Error('sin lector de placas en esta prueba'); };
    export const ubicarPlaca = no, leerPlacaDeFoto = no;`,
};
registerHooks({
  resolve(especificador, contexto, siguiente) {
    const resuelto = siguiente(especificador, contexto);
    for (const [archivo, fuente] of Object.entries(FALSOS)) {
      if (resuelto.url.endsWith('/js/' + archivo)) return { url: 'data:text/javascript,' + encodeURIComponent(fuente), shortCircuit: true };
    }
    return resuelto;
  },
});

class Nodo {
  constructor(etiqueta = 'div') {
    this.tagName = etiqueta.toUpperCase();
    this.children = [];
    this.oyentes = {};
    this.style = {};
    this.dataset = {};
    this.atributos = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.open = false;
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  addEventListener(tipo, oyente) {
    (this.oyentes[tipo] ||= []).push(oyente);
  }
  removeEventListener() {}
  click() {
    for (const oyente of this.oyentes.click || []) oyente({ type: 'click', target: this, preventDefault() {} });
  }
  focus() {}
  append(...nodos) {
    this.children.push(...nodos);
  }
  replaceChildren(...nodos) {
    this.children = nodos;
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
  querySelector() {
    return (this.hijo ||= new Nodo('span'));
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

const nodos = new Map();
const nodo = (clave) => {
  if (!nodos.has(clave)) nodos.set(clave, new Nodo());
  return nodos.get(clave);
};
globalThis.window = globalThis;
globalThis.document = { getElementById: nodo, querySelector: nodo, createElement: (etiqueta) => new Nodo(etiqueta), addEventListener() {}, visibilityState: 'visible' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { href: '' };
globalThis.confirm = () => true;

const CAPTIVA = MODELOS[0];
const LINEA = datosDeEntrada(entradaDe('Chevrolet', 'Captiva (nueva)'));
const espera = (ms = 30) => new Promise((listo) => setTimeout(listo, ms));

test('la portada: la foto de verdad manda, después la miniatura del modelo, y si no, el color', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const almacen = await abrirAlmacen();
  await almacen.guardar(carroDeMuestra(CAPTIVA));
  // JPX248, la de Joan, sin foto: la miniatura. Con otro color elegido, un punto de ese color encima.
  await almacen.guardar(crearCarro({ placa: 'JPX248', ...LINEA, color: '#a4161a' }));
  // Pidió la carrocería de referencia para este carro: la Captiva no es su foto.
  await almacen.guardar(crearCarro({ placa: 'REF123', ...LINEA, color: '#1f4e9c', sinModeloDeCatalogo: true }));
  // Con su foto de verdad: esa manda.
  await almacen.guardar(crearCarro({ placa: 'FOT123', ...LINEA }));
  await almacen.guardarFoto({ placa: 'FOT123', pieza: PIEZA_CARRO, foto: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }) });
  // Otra línea: el cuadro de color, como siempre.
  await almacen.guardar(crearCarro({ placa: 'LOG123', ...datosDeEntrada(entradaDe('Renault', 'Symbol II')), color: '#f2f2f0' }));
  almacen.cerrar();

  // Como vienen en garaje.html.
  nodo('demo').hidden = true;
  nodo('demo-quitar').hidden = true;
  await import('../js/garaje-pantalla.js');
  await window.__garaje.listo;
  await espera(80); // las fotos del registro llegan aparte
  const portadas = new Map(
    nodo('carros').children.map((li) => {
      const enlace = li.children[0];
      const placa = enlace.children.find((n) => n.tagName === 'STRONG').textContent;
      return [placa, enlace.children[0]];
    }),
  );
  assert.deepEqual([...portadas.keys()].sort(), ['DEM006', 'FOT123', 'JPX248', 'LOG123', 'REF123']);

  const dem = portadas.get('DEM006');
  assert.equal(dem.children[0].tagName, 'IMG');
  assert.equal(dem.children[0].src, CAPTIVA.miniatura);
  assert.equal(dem.style.background, undefined, 'no el cuadro de color');
  assert.equal(dem.children.length, 1, 'sin color elegido no lleva punto: la miniatura ya es su color');

  const jpx = portadas.get('JPX248');
  assert.equal(jpx.children[0].src, CAPTIVA.miniatura);
  const punto = jpx.children.find((n) => n.className === 'portada-color');
  assert.ok(punto, 'el rojo elegido no se ve en la miniatura café');
  assert.equal(punto.style.background, '#a4161a');

  const ref = portadas.get('REF123');
  assert.equal(ref.children.length, 0);
  assert.equal(ref.style.background, '#1f4e9c');

  const fot = portadas.get('FOT123');
  assert.equal(fot.children.length, 1);
  assert.match(fot.children[0].src, /^blob:/, 'la foto de verdad no le cede el puesto a la miniatura');

  const log = portadas.get('LOG123');
  assert.equal(log.children.length, 0);
  assert.equal(log.style.background, '#f2f2f0');

  // DEM006 solo, con carros reales: la demostración a medias se dice en el Garaje, con sus dos botones.
  assert.equal(nodo('demo').hidden, false);
  assert.equal(nodo('demo-boton').textContent, 'Cargar el resto');
  assert.equal(nodo('demo-quitar').hidden, false);

  // Cada fila dice cómo sale al abrirla (revisión del 9-nov: 5 de los 6 de la demostración abrían de cajas sin decirlo). Los
  // escaneos viven en otra base y llegan aparte; aquí ninguno tiene.
  const comoSale = new Map(nodo('carros').children.map((li) => [li.children[0].children.find((n) => n.tagName === 'STRONG').textContent, li.children[0].children.find((n) => /carro-3d/.test(n.className)).textContent]));
  assert.deepEqual(Object.fromEntries(comoSale), {
    DEM006: '3D de verdad',
    JPX248: '3D de verdad',
    FOT123: '3D de verdad',
    REF123: 'Carrocería de referencia',
    LOG123: 'Carrocería de referencia',
  });
});
