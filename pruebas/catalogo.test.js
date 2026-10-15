// El catálogo de carros y su buscador: lo que escribe el dueño tiene que
// encontrar la línea aunque le falten tildes o la marca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../js/catalogo-carros.js';
import { buscarLinea, catalogoOrdenado, datosDeEntrada, entradaDe, nombreDeLinea } from '../js/catalogo.js';
import { medidasParaDibujar } from '../js/carrocerias.js';

test('el catálogo tiene entradas completas y sin repetidos', () => {
  assert.ok(CATALOGO.length >= 30, 'líneas: ' + CATALOGO.length);
  const claves = new Set();
  for (const e of CATALOGO) {
    assert.ok(e.marca && e.linea, JSON.stringify(e));
    assert.ok(['sedan', 'hatchback', 'suv', 'camioneta', 'van', 'coupe', 'otro'].includes(e.carroceria), nombreDeLinea(e));
    assert.ok(['muy comun', 'comun', 'poco comun'].includes(e.presencia), nombreDeLinea(e));
    const clave = nombreDeLinea(e).toLowerCase();
    assert.ok(!claves.has(clave), 'repetida: ' + clave);
    claves.add(clave);
    // Medidas: o están en milímetros razonables, o son 0 (sin confirmar).
    for (const campo of ['largo', 'ancho', 'alto', 'entreEjes']) {
      const v = e[campo] || 0;
      assert.ok(v === 0 || (v > 1000 && v < 7000), nombreDeLinea(e) + ' ' + campo + ' = ' + v);
    }
  }
});

test('las medidas del catálogo sirven para dibujar sin caer a las típicas', () => {
  const onix = entradaDe('chevrolet', 'onix');
  assert.ok(onix);
  const m = medidasParaDibujar(onix.carroceria, datosDeEntrada(onix).medidas);
  assert.ok(Math.abs(m.largo - onix.largo / 1000) < 1e-9);
  assert.ok(Math.abs(m.entreEjes - onix.entreEjes / 1000) < 1e-9);
});

test('buscarLinea encuentra por línea sola, por marca y línea, y sin tildes', () => {
  assert.equal(buscarLinea('onix')[0].linea, 'Onix');
  assert.equal(buscarLinea('chevrolet onix')[0].linea, 'Onix');
  // Las palabras pueden ir en cualquier orden: "sedan onix" es el Onix sedán.
  assert.equal(buscarLinea('sedan onix')[0].linea, 'Onix sedán');
  assert.equal(buscarLinea('nave espacial').length, 0);
  assert.equal(buscarLinea('Logan')[0].marca, 'Renault');
  assert.equal(buscarLinea('')[0], undefined);
  const duster = buscarLinea('duster');
  assert.ok(duster.length >= 2, 'Duster y Duster Oroch');
  assert.equal(duster[0].linea, 'Duster', 'la coincidencia exacta va primero');
});

test('entradaDe y datosDeEntrada', () => {
  assert.equal(entradaDe('Toyota', 'Hilux').carroceria, 'camioneta');
  assert.equal(entradaDe('Toyota', 'Nave'), null);
  const d = datosDeEntrada(entradaDe('Renault', 'Kwid'));
  assert.deepEqual(Object.keys(d).sort(), ['carroceria', 'linea', 'marca', 'medidas']);
  assert.equal(d.carroceria, 'hatchback');
  assert.ok(d.medidas.largo > 3000);
});

test('catalogoOrdenado pone las muy comunes primero', () => {
  const lista = catalogoOrdenado();
  assert.equal(lista[0].presencia, 'muy comun');
  const primerComun = lista.findIndex((e) => e.presencia === 'comun');
  const ultimoMuyComun = lista.map((e) => e.presencia).lastIndexOf('muy comun');
  assert.ok(primerComun === -1 || ultimoMuyComun < primerComun);
});
