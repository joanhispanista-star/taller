// La cuenta de reducir una foto: lo único de fotos.js que no necesita
// navegador. El resto (canvas, createImageBitmap) se prueba en el panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADO_MAYOR, LADO_MINIATURA, medidaReducida } from '../js/fotos.js';

test('una foto de celular queda a 1280 px de lado mayor, en horizontal y en vertical', () => {
  assert.deepEqual(medidaReducida(4000, 3000), { ancho: 1280, alto: 960 });
  assert.deepEqual(medidaReducida(3000, 4000), { ancho: 960, alto: 1280 });
  assert.deepEqual(medidaReducida(4032, 3024), { ancho: 1280, alto: 960 });
  assert.equal(LADO_MAYOR, 1280);
});

test('una foto pequeña no se agranda', () => {
  assert.deepEqual(medidaReducida(800, 600), { ancho: 800, alto: 600 });
  assert.deepEqual(medidaReducida(1280, 1280), { ancho: 1280, alto: 1280 });
});

test('la miniatura es de 200 px y una tira muy larga nunca baja de 1 px', () => {
  assert.deepEqual(medidaReducida(4000, 3000, LADO_MINIATURA), { ancho: 200, alto: 150 });
  assert.deepEqual(medidaReducida(10000, 10, LADO_MINIATURA), { ancho: 200, alto: 1 });
});

test('una medida inválida da cero, no NaN', () => {
  assert.deepEqual(medidaReducida(0, 0), { ancho: 0, alto: 0 });
  assert.deepEqual(medidaReducida(undefined, 100), { ancho: 0, alto: 0 });
  assert.deepEqual(medidaReducida(-5, 100), { ancho: 0, alto: 0 });
});
