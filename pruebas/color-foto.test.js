// El color del carro a partir de píxeles de mentira: un carro rojo con
// vidrios oscuros, un carro negro, y una foto vacía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorDominante, hexARgb, nombreDeColor, rgbAHex } from '../js/color-foto.js';

function foto(ancho, alto, pintar) {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const [r, g, b] = pintar(x, y);
      const i = (y * ancho + x) * 4;
      datos[i] = r;
      datos[i + 1] = g;
      datos[i + 2] = b;
      datos[i + 3] = 255;
    }
  }
  return datos;
}

test('hex y rgb van y vuelven', () => {
  assert.deepEqual(hexARgb('#b8232a'), [184, 35, 42]);
  assert.equal(rgbAHex([184, 35, 42]), '#b8232a');
  assert.equal(rgbAHex([300, -5, 12.6]), '#ff000d');
});

test('nombreDeColor acerca cualquier hex a un color de taller', () => {
  assert.equal(nombreDeColor('#ffffff'), 'blanco');
  assert.equal(nombreDeColor('#c0392b'), 'rojo');
  assert.equal(nombreDeColor('#101010'), 'negro');
  assert.equal(nombreDeColor('#2255aa'), 'azul');
  assert.equal(nombreDeColor('#d0d0d0'), 'plateado');
});

test('un carro rojo con vidrios oscuros y cielo azul alrededor sale rojo', () => {
  const datos = foto(64, 64, (x, y) => {
    if (y < 12) return [120, 170, 230]; // cielo, fuera del recorte central
    if (y >= 20 && y < 28 && x >= 20 && x < 44) return [20, 28, 36]; // vidrios
    if (x >= 14 && x < 50 && y >= 20 && y < 50) return [178, 36, 40]; // la chapa
    return [90, 90, 90]; // piso
  });
  const color = colorDominante(datos, 64, 64);
  assert.equal(color.nombre, 'rojo');
  assert.ok(color.proporcion > 0.5, 'proporción ' + color.proporcion);
});

test('un carro negro no se confunde con sus vidrios: sale negro', () => {
  const datos = foto(64, 64, (x, y) => (x >= 10 && x < 54 && y >= 16 && y < 56 ? [22, 23, 26] : [120, 120, 120]));
  assert.equal(colorDominante(datos, 64, 64).nombre, 'negro');
});

test('un carro blanco sale blanco aunque las sombras sean grises', () => {
  const datos = foto(64, 64, (x, y) => (y > 44 ? [140, 140, 140] : [238, 238, 236]));
  assert.equal(colorDominante(datos, 64, 64).nombre, 'blanco');
});

test('una foto vacía o transparente devuelve el plateado de fábrica', () => {
  const vacia = new Uint8ClampedArray(16 * 16 * 4); // todo transparente
  const color = colorDominante(vacia, 16, 16);
  assert.equal(color.nombre, 'plateado');
  assert.equal(color.proporcion, 0);
});
