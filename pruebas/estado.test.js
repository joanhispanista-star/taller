import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIEZAS, PIEZAS_POR_ID, nombreDePieza } from '../js/piezas.js';
import {
  alternarPieza,
  cambiarPlaca,
  crearEstado,
  deserializar,
  formatearPlaca,
  limpiarSeleccion,
  normalizarPlaca,
  piezasSeleccionadas,
  serializar,
  textoParaAsistente,
} from '../js/estado.js';

test('el catálogo tiene 29 piezas con id único y lados válidos', () => {
  assert.equal(PIEZAS.length, 29);
  assert.equal(new Set(PIEZAS.map((p) => p.id)).size, 29);
  for (const p of PIEZAS) {
    assert.ok([null, 'izq', 'der'].includes(p.lado), p.id);
    assert.ok(p.nombre.length > 2, p.id);
  }
  // Cada pieza izquierda tiene su espejo derecho con el mismo nombre base.
  const izq = PIEZAS.filter((p) => p.lado === 'izq');
  const der = PIEZAS.filter((p) => p.lado === 'der');
  assert.equal(izq.length, der.length);
  for (const p of izq) {
    assert.ok(PIEZAS_POR_ID.has(p.id.replace('-izq', '-der')), p.id);
  }
});

test('nombreDePieza devuelve el id cuando no existe la pieza', () => {
  assert.equal(nombreDePieza('capo'), 'Capó');
  assert.equal(nombreDePieza('loquesea'), 'loquesea');
});

test('alternarPieza marca, desmarca e ignora piezas inventadas', () => {
  const estado = crearEstado();
  assert.equal(alternarPieza(estado, 'capo'), true);
  assert.equal(alternarPieza(estado, 'capo'), false);
  assert.equal(estado.seleccion.size, 0);
  assert.equal(alternarPieza(estado, 'ala-delta'), false);
  assert.equal(estado.seleccion.size, 0);
});

test('limpiarSeleccion deja el carro sin marcas', () => {
  const estado = crearEstado({ seleccion: ['capo', 'techo'] });
  limpiarSeleccion(estado);
  assert.equal(estado.seleccion.size, 0);
});

test('ponerle placa a un carro recién marcado no borra las marcas', () => {
  const estado = crearEstado({ marca: 'Kia Picanto', seleccion: ['capo'] });
  assert.equal(cambiarPlaca(estado, 'abc-123'), false);
  assert.equal(estado.placa, 'ABC123');
  assert.deepEqual([...estado.seleccion], ['capo']);
  assert.equal(estado.marca, 'Kia Picanto');
});

test('escribir la misma placa de otra forma no cambia nada', () => {
  const estado = crearEstado({ placa: 'ABC123', seleccion: ['capo'] });
  assert.equal(cambiarPlaca(estado, 'abc 123'), false);
  assert.deepEqual([...estado.seleccion], ['capo']);
});

test('cambiar a otra placa es otro carro: se limpian marcas y marca', () => {
  const estado = crearEstado({ placa: 'ABC123', marca: 'Chevrolet Onix', seleccion: ['capo', 'puerta-del-izq'] });
  assert.equal(cambiarPlaca(estado, 'XYZ789'), true);
  assert.equal(estado.placa, 'XYZ789');
  assert.equal(estado.seleccion.size, 0);
  assert.equal(estado.marca, '');
  assert.match(textoParaAsistente(estado), /placa XYZ789/);
  assert.doesNotMatch(textoParaAsistente(estado), /Onix|Capó/);
});

test('cambiar de placa sin nada marcado no reporta limpieza', () => {
  const estado = crearEstado({ placa: 'ABC123' });
  assert.equal(cambiarPlaca(estado, 'XYZ789'), false);
});

test('formatearPlaca la escribe como en la placa de verdad', () => {
  assert.equal(formatearPlaca('jrx248'), 'JRX 248');
  assert.equal(formatearPlaca('ABC12D'), 'ABC 12D');
  assert.equal(formatearPlaca('AB'), 'AB');
  assert.equal(formatearPlaca(''), '');
});

test('normalizarPlaca limpia lo que escribe la persona', () => {
  assert.equal(normalizarPlaca('abc-123'), 'ABC123');
  assert.equal(normalizarPlaca(' kjl 45 d '), 'KJL45D');
  assert.equal(normalizarPlaca('ABCDEFGH'), 'ABCDEF');
  assert.equal(normalizarPlaca(null), '');
});

test('la lista sale en el orden del catálogo, no en el orden de los toques', () => {
  const estado = crearEstado();
  alternarPieza(estado, 'espejo-der');
  alternarPieza(estado, 'capo');
  alternarPieza(estado, 'puerta-del-izq');
  assert.deepEqual(
    piezasSeleccionadas(estado).map((p) => p.id),
    ['capo', 'puerta-del-izq', 'espejo-der'],
  );
});

test('el texto para el asistente lleva carro, cantidad y piezas numeradas', () => {
  const estado = crearEstado({ placa: 'abc123', marca: 'Chevrolet Onix', seleccion: ['techo', 'capo'] });
  const lineas = textoParaAsistente(estado).split(String.fromCharCode(10));
  assert.equal(lineas[0], 'ORDEN DE PINTURA - Chevrolet Onix, placa ABC123');
  assert.equal(lineas[1], '2 piezas para pintar:');
  assert.equal(lineas[2], '1. Capó');
  assert.equal(lineas[3], '2. Techo');
  assert.equal(lineas.at(-1), 'Enviado desde Taller de Pintura');
});

test('el texto sin carro ni piezas no inventa datos', () => {
  const lineas = textoParaAsistente(crearEstado()).split(String.fromCharCode(10));
  assert.equal(lineas[0], 'ORDEN DE PINTURA');
  assert.equal(lineas[1], 'Sin piezas marcadas.');
});

test('el texto acepta otros nombres de pieza (los de la carrocería)', () => {
  const estado = crearEstado({ seleccion: ['baul', 'capo'] });
  const lineas = textoParaAsistente(estado, (id) => (id === 'baul' ? 'Compuerta trasera' : 'Capó')).split(String.fromCharCode(10));
  assert.equal(lineas[2], '1. Capó');
  assert.equal(lineas[3], '2. Compuerta trasera');
});

test('una sola pieza se escribe en singular', () => {
  const estado = crearEstado({ seleccion: ['baul'] });
  assert.match(textoParaAsistente(estado), /1 pieza para pintar:/);
});

test('serializar y deserializar conservan placa, marca y selección', () => {
  const estado = crearEstado({ placa: 'XYZ789', marca: 'Renault Logan', seleccion: ['capo', 'estribo-izq'] });
  const copia = deserializar(serializar(estado));
  assert.equal(copia.placa, 'XYZ789');
  assert.equal(copia.marca, 'Renault Logan');
  assert.deepEqual([...copia.seleccion], ['capo', 'estribo-izq']);
});

test('deserializar nunca revienta y descarta piezas que ya no existen', () => {
  assert.equal(deserializar('esto no es json').seleccion.size, 0);
  assert.equal(deserializar('null').placa, '');
  assert.equal(deserializar('[1,2,3]').seleccion.size, 0);
  const viejo = deserializar(JSON.stringify({ placa: 'AAA111', seleccion: ['capo', 'aleron-fantasma'] }));
  assert.deepEqual([...viejo.seleccion], ['capo']);
  assert.equal(viejo.placa, 'AAA111');
});
