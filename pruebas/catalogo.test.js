// El catálogo de carros y su buscador: lo que escribe el dueño tiene que
// encontrar la línea aunque le falten tildes o la marca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../js/catalogo-carros.js';
import { buscarLinea, catalogoOrdenado, datosDeEntrada, entradaDe, entradaEscrita, entradasDeFamilia, familiaDe, marcaDelCatalogo, mejorDeFamilia, nombreDeLinea } from '../js/catalogo.js';
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
  const onix = buscarLinea('onix').find((e) => e.largo > 0 && e.entreEjes > 0);
  assert.ok(onix, 'hay un Onix con medidas');
  const m = medidasParaDibujar(onix.carroceria, datosDeEntrada(onix).medidas);
  assert.ok(Math.abs(m.largo - onix.largo / 1000) < 1e-9);
  assert.ok(Math.abs(m.entreEjes - onix.entreEjes / 1000) < 1e-9);
});

test('buscarLinea encuentra por línea sola, por marca y línea, y sin tildes', () => {
  assert.ok(buscarLinea('onix')[0].linea.startsWith('Onix'));
  assert.equal(buscarLinea('chevrolet onix')[0].marca, 'Chevrolet');
  // Las palabras pueden ir en cualquier orden: "sedan onix" encuentra el Onix sedán.
  const sedan = buscarLinea('sedan onix');
  assert.ok(sedan.length > 0 && sedan.every((e) => e.linea.toLowerCase().includes('onix')));
  assert.equal(buscarLinea('nave espacial').length, 0);
  assert.equal(buscarLinea('Logan')[0].marca, 'Renault');
  assert.equal(buscarLinea('')[0], undefined);
  const duster = buscarLinea('duster');
  assert.ok(duster.length >= 2, 'Duster y Duster Oroch');
  assert.ok(duster[0].linea.startsWith('Duster'), 'la coincidencia por el principio va primero');
  assert.ok(buscarLinea('kwid')[0].linea.startsWith('Kwid'));
});

test('entradaDe y datosDeEntrada', () => {
  const hilux = buscarLinea('hilux')[0];
  assert.equal(hilux.carroceria, 'camioneta');
  assert.equal(entradaDe(hilux.marca, hilux.linea), hilux);
  assert.equal(entradaDe('Toyota', 'Nave'), null);
  const kwid = buscarLinea('kwid')[0];
  const d = datosDeEntrada(kwid);
  assert.deepEqual(Object.keys(d).sort(), ['carroceria', 'linea', 'marca', 'medidas']);
  assert.equal(d.carroceria, 'hatchback');
  assert.ok(d.medidas.largo > 3000);
});

test('el catálogo cubre lo que más rueda en Colombia', () => {
  for (const [marca, linea] of [['Chevrolet', 'spark'], ['Chevrolet', 'sail'], ['Renault', 'logan'], ['Renault', 'sandero'], ['Kia', 'picanto'], ['Mazda', 'cx-30'], ['Toyota', 'corolla'], ['Nissan', 'versa'], ['BYD', 'yuan'], ['Suzuki', 'swift']]) {
    const hallada = buscarLinea(linea).find((e) => e.marca === marca);
    assert.ok(hallada, marca + ' ' + linea);
  }
  assert.ok(CATALOGO.length >= 500, 'líneas: ' + CATALOGO.length);
  assert.ok(new Set(CATALOGO.map((e) => e.marca)).size >= 40, 'marcas');
});

test('familiaDe quita generaciones, paréntesis, carrocerías y la marca repetida', () => {
  const f = (marca, linea) => familiaDe({ marca, linea });
  assert.equal(f('Renault', 'Logan II'), 'Logan');
  assert.equal(f('Renault', 'Duster I'), 'Duster');
  assert.equal(f('Toyota', 'Hilux (AN120) doble cabina'), 'Hilux');
  assert.equal(f('Toyota', 'Hilux Vigo (AN10/AN30) doble cabina'), 'Hilux Vigo');
  assert.equal(f('Chevrolet', 'Onix Plus / Onix sedán (2ª generación)'), 'Onix Plus');
  assert.equal(f('Chevrolet', 'Onix (hatchback 2ª generación)'), 'Onix');
  assert.equal(f('Chevrolet', 'Spark (M200, base Matiz) / Spark Life'), 'Spark');
  assert.equal(f('Chevrolet', 'Spark GT'), 'Spark GT');
  assert.equal(f('Kia', 'New Sportage (NQ5 facelift, carrocería larga)'), 'Sportage');
  assert.equal(f('Nissan', 'Nueva Kicks (P16)'), 'Kicks');
  assert.equal(f('Hyundai', 'Hyundai Eon'), 'Eon');
  assert.equal(f('Mazda', 'Mazda 3 (BP) sedán'), '3');
  assert.equal(f('Kia', 'Picanto (3ª gen JA) / New Picanto'), 'Picanto');
});

test('mejorDeFamilia da la entrada más común y más reciente de la familia', () => {
  const logan = entradasDeFamilia('Renault', 'Logan');
  assert.ok(logan.length >= 2, 'Logan I y II');
  assert.ok(logan.every((e) => familiaDe(e) === 'Logan'));
  const mejor = mejorDeFamilia('renault', 'logan');
  assert.equal(mejor.carroceria, 'sedan');
  assert.ok(mejor.largo > 4000);
  assert.equal(mejorDeFamilia('Renault', 'Nave'), null);
  const hilux = mejorDeFamilia('Toyota', 'Hilux');
  assert.equal(hilux.carroceria, 'camioneta');
});

test('catalogoOrdenado pone las muy comunes primero', () => {
  const lista = catalogoOrdenado();
  assert.equal(lista[0].presencia, 'muy comun');
  const primerComun = lista.findIndex((e) => e.presencia === 'comun');
  const ultimoMuyComun = lista.map((e) => e.presencia).lastIndexOf('muy comun');
  assert.ok(primerComun === -1 || ultimoMuyComun < primerComun);
});

test('marcaDelCatalogo reconoce una marca escrita de cualquier forma y rechaza lo que no es marca', () => {
  assert.equal(marcaDelCatalogo('CHEVROLET'), 'Chevrolet');
  assert.equal(marcaDelCatalogo('mercedes'), 'Mercedes-Benz');
  assert.equal(marcaDelCatalogo('ssangyong'), 'SsangYong / KGM');
  assert.equal(marcaDelCatalogo('captiva'), '');
  assert.equal(marcaDelCatalogo(''), '');
});

test('entradaEscrita entiende el nombre completo, marca + familia, y solo la línea cuando la marca ya se sabe', () => {
  const completa = entradaEscrita('chevrolet captiva (nueva)');
  assert.equal(completa.marca, 'Chevrolet');
  assert.equal(completa.linea, 'Captiva (nueva)');
  // Marca + familia: la mejor entrada de la familia, no la primera que empiece igual.
  const familia = entradaEscrita('Chevrolet Captiva');
  assert.equal(familia, mejorDeFamilia('Chevrolet', 'Captiva'));
  assert.ok(familia.linea.startsWith('Captiva') && !familia.linea.startsWith('Captiva Sport'));
  // Solo la línea: sin marca sabida no es nada; con la marca, sí.
  assert.equal(entradaEscrita('captiva'), null);
  assert.equal(entradaEscrita('captiva', ['Chevrolet']), mejorDeFamilia('Chevrolet', 'Captiva'));
  assert.equal(entradaEscrita('captiva sport', ['Chevrolet']).linea, 'Captiva Sport');
  // Lo escrito con otra marca manda sobre la marca sabida.
  assert.equal(entradaEscrita('renault logan', ['Chevrolet']), mejorDeFamilia('Renault', 'Logan'));
  // Una línea que no es de la marca sabida no se inventa.
  assert.equal(entradaEscrita('onix', ['Renault']), null);
  assert.equal(entradaEscrita('', ['Chevrolet']), null);
  assert.equal(entradaEscrita('chevrolet', []), null);
});
