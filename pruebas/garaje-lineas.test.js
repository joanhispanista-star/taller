// La lista de líneas del Garaje (el <datalist> "lineas-catalogo") es UNA para los dos campos que la ofrecen: la marca del
// formulario por placa y la línea de "Nuevo carro con foto". Al elegir la marca en la ficha, la lista se queda con las
// líneas de esa marca (así "Captiva" no compite con 1.100). Hasta el 9-nov-2026, si la persona cancelaba la ficha, la
// lista se quedaba así, y en el formulario por placa solo salían, por ejemplo, las de Chevrolet.
//
// Aquí corre la pantalla de verdad (js/garaje-pantalla.js) sobre un DOM de mentira. El reconocedor y el lector de placas
// se cambian por unos que fallan en el acto: no se baja ni se carga ningún modelo, y la pantalla sigue como en un
// teléfono donde el reconocedor no pudo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import 'fake-indexeddb/auto';
import { CATALOGO } from '../js/catalogo-carros.js';

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

// Un nodo de mentira: guarda lo que la pantalla le pone y despacha sus eventos. El <dialog> se cierra como uno de verdad:
// close() deja de estar abierto y avisa con 'close' (que es por donde pasan Cancelar y la tecla Escape).
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
  despachar(tipo) {
    for (const oyente of this.oyentes[tipo] || []) oyente({ type: tipo, target: this, preventDefault() {} });
  }
  click() {
    this.despachar('click');
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
    if (!this.open) return;
    this.open = false;
    this.despachar('close');
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

const lineas = () => nodo('lineas-catalogo').children.map((o) => o.value);
const ficha = nodo('ficha-nueva');
const espera = (ms = 30) => new Promise((listo) => setTimeout(listo, ms));

async function abrirConMarca(garaje, marca) {
  await garaje.abrirFicha(new File([new Uint8Array(64)], 'carro.jpg', { type: 'image/jpeg' }));
  await espera(); // la placa y el logo van aparte, y fallan solos
  assert.equal(ficha.open, true, 'la ficha no abrió');
  const chip = nodo('ficha-marcas').children.find((b) => b.textContent === marca);
  assert.ok(chip, 'no salió el chip de ' + marca);
  chip.click();
  await espera();
  assert.ok(lineas().length > 0 && lineas().every((l) => l.startsWith(marca + ' ')), 'al elegir la marca la lista no quedó solo con sus líneas');
}

test('al cerrar "Nuevo carro con foto", la lista de líneas vuelve entera', async (t) => {
  t.mock.method(console, 'warn', () => {});
  await import('../js/garaje-pantalla.js');
  const garaje = window.__garaje;
  await garaje.listo;
  assert.equal(lineas().length, CATALOGO.length, 'al abrir el Garaje la lista no trae todo el catálogo');

  // Con el botón Cancelar.
  await abrirConMarca(garaje, 'Chevrolet');
  document.querySelector('#ficha-nueva [data-accion="cancelar"]').click();
  assert.equal(ficha.open, false);
  assert.equal(lineas().length, CATALOGO.length, 'después de Cancelar el formulario por placa solo ofrece ' + lineas().length + ' líneas');

  // Con la tecla Escape (o el atrás del teléfono): el navegador cierra el diálogo sin pasar por Cancelar.
  await abrirConMarca(garaje, 'Renault');
  ficha.close();
  assert.equal(lineas().length, CATALOGO.length, 'después de Escape el formulario por placa solo ofrece ' + lineas().length + ' líneas');
});
