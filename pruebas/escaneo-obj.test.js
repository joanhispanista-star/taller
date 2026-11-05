// El lector de OBJ sobre los bytes (escaneo-obj.js) contra OBJLoader, que es la referencia: los
// mismos triángulos en el mismo orden y las mismas coordenadas, bit a bit, con un vértice por
// cada (v, vt, material) en vez de tres por triángulo. Y lo que no sabe leer no lo adivina.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerObj } from '../js/escaneo-obj.js';
import { OBJLoader } from '../js/vendor/loaders/OBJLoader.js';

const bytes = (texto) => new TextEncoder().encode(texto);

// OBJLoader ya entrega las esquinas de cada triángulo una por una, en el orden del archivo.
function sopaDeOBJLoader(texto) {
  const pos = [];
  const uv = [];
  new OBJLoader().parse(texto).traverse((h) => {
    if (!h.isMesh) return;
    for (const x of h.geometry.attributes.position.array) pos.push(x);
    if (h.geometry.attributes.uv) for (const x of h.geometry.attributes.uv.array) uv.push(x);
  });
  return { pos: Float32Array.from(pos), uv: Float32Array.from(uv) };
}

function sopaDelLector(l) {
  const pos = new Float32Array(l.indices.length * 3);
  const uv = new Float32Array(l.uvs ? l.indices.length * 2 : 0);
  l.indices.forEach((v, k) => {
    for (let c = 0; c < 3; c++) pos[k * 3 + c] = l.posiciones[v * 3 + c];
    if (l.uvs) for (let c = 0; c < 2; c++) uv[k * 2 + c] = l.uvs[v * 2 + c];
  });
  return { pos, uv };
}

// Bit a bit: un 0,1 mal redondeado o un -0 que se vuelve 0 también cuentan.
function igualQueOBJLoader(texto) {
  const l = leerObj(bytes(texto));
  assert.ok(l, 'el lector no debía rendirse con esto');
  const a = sopaDelLector(l);
  const b = sopaDeOBJLoader(texto);
  assert.equal(a.pos.length, b.pos.length, 'los mismos triángulos');
  assert.deepEqual(new Uint8Array(a.pos.buffer), new Uint8Array(b.pos.buffer), 'las mismas posiciones');
  assert.deepEqual(new Uint8Array(a.uv.buffer), new Uint8Array(b.uv.buffer), 'las mismas coordenadas');
  return l;
}

const CUADRADO = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1'];

test('dos triángulos que comparten un borde son 4 vértices, no 6, y las mismas coordenadas de OBJLoader', () => {
  const l = igualQueOBJLoader([...CUADRADO, 'f 1/1 2/2 3/3', 'f 1/1 3/3 4/4'].join('\n') + '\n');
  assert.equal(l.posiciones.length / 3, 4);
  assert.equal(l.uvs.length / 2, 4);
  assert.deepEqual(Array.from(l.indices), [0, 1, 2, 0, 2, 3]);
});

test('una costura de la foto sí parte el vértice: la misma posición con otra coordenada', () => {
  const l = igualQueOBJLoader([...CUADRADO, 'vt 0.5 0.5', 'f 1/1 2/2 3/3', 'f 1/5 3/3 4/4'].join('\n') + '\n');
  assert.equal(l.posiciones.length / 3, 5);
});

test('cuadriláteros y polígonos se abren en abanico, como OBJLoader', () => {
  const l = igualQueOBJLoader([...CUADRADO, 'v 0.5 2 0', 'vt 0.5 1', 'f 1/1 2/2 3/3 4/4', 'f 1/1 2/2 3/3 5/5 4/4'].join('\n'));
  assert.equal(l.indices.length, 3 * (2 + 3));
  // Sin coordenadas también.
  assert.equal(igualQueOBJLoader('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n').uvs, null);
});

test('los índices negativos cuentan desde lo leído hasta esa línea, no desde el total', () => {
  const texto = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'f -3/-3 -2/-2 -1/-1', 'v 5 5 5', 'vt 0.5 0.5', 'f -4/-4 -3/-3 -1/-1', 'f -4/-1 -3/-2 -2/-3'].join('\n') + '\n';
  igualQueOBJLoader(texto);
});

test('CRLF, comentarios, líneas en blanco, tabs, sangría, normales y lo que no importa', () => {
  const lineas = ['# exportado por la app', '', 'mtllib modelo.mtl', 'o carro', 'g lata', 's 1', '  v 0.5\t1.5   2.5  ', '\tv -1 0 0', 'v 0 -1 0', '   ', 'vn 0 0 1', 'vt 0 0', 'vt 1 0', 'vt 0 1 0', 'usemtl m', 'f 1/1/1 2/2/1 3/3/1', 'f  1//1\t2//1  3//1  ', 's off', '# fin'];
  // Con y sin coordenadas no se mezclan en un archivo: se prueba cada forma aparte.
  const conVt = lineas.filter((l) => !l.startsWith('f  1//1')).join('\r\n') + '\r\n';
  assert.equal(igualQueOBJLoader(conVt).bibliotecas[0], 'modelo.mtl');
  const sinVt = lineas.filter((l) => !l.startsWith('f 1/1/1')).join('\r\n');
  igualQueOBJLoader(sinVt);
  igualQueOBJLoader(lineas.filter((l) => !l.startsWith('f  1//1')).join('\n'));
});

test('con la marca de UTF-8 al principio, el primer vértice no se pierde', () => {
  igualQueOBJLoader('﻿v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
});

test('los números se leen como parseFloat, en todas sus formas', () => {
  const raros = ['.5', '5.', '-.5', '+1.5', '1e3', '1E-3', '1.5e+2', '-2.5E2', '0.000001', '-0.000', '-0', '123456.789012', '0.12345678901234567890', '1234567890123456789012', '1e40', '1e-50', '0.1', '0.2', '0.3', '1.1', '2.675', '4.35'];
  const lineas = [];
  for (let i = 0; i < raros.length; i += 3) lineas.push(`v ${raros[i]} ${raros[(i + 1) % raros.length]} ${raros[(i + 2) % raros.length]}`);
  const n = lineas.length;
  for (let i = 1; i + 2 <= n; i += 3) lineas.push(`f ${i} ${i + 1} ${i + 2}`);
  lineas.push(`f 1 ${n - 1} ${n}`);
  igualQueOBJLoader(lineas.join('\n'));
});

test('decimales exactos: junto a un límite de redondeo de 32 bits sale lo mismo que parseFloat', () => {
  // Puntos medios entre dos flotantes de 32 bits, escritos con 15 a 17 cifras: quedan a menos de
  // 1e-15 del límite, y sumar los decimales de a 0,1 acumula justo ese error y salta al vecino.
  const lineas = [];
  const coord = [];
  for (let k = 0; k < 3000; k++) {
    const medio = (e) => 2 ** e * (1 + (2 * (k * 1103 + e) + 1) / 2 ** 24);
    const x = medio(0).toPrecision(16);
    const y = (-medio(1)).toPrecision(15);
    const z = medio(-3).toPrecision(17);
    lineas.push(`v ${x} ${y} ${z}`);
    coord.push(`vt ${medio(-1).toPrecision(16)} ${medio(-2).toPrecision(16)}`);
  }
  const caras = [];
  for (let i = 1; i + 2 <= 3000; i += 3) caras.push(`f ${i}/${i} ${i + 1}/${i + 1} ${i + 2}/${i + 2}`);
  igualQueOBJLoader([...lineas, ...coord, ...caras].join('\n') + '\n');
});

test('muchas coordenadas por vértice no se salen de lo reservado', () => {
  // El prototipo reservaba 4 pares por vértice más 512, y escribía de largo en silencio.
  const lineas = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0'];
  const caras = [];
  for (let k = 0; k < 900; k++) {
    lineas.push(`vt ${k / 3000} ${1 - k / 3000}`);
    if (k % 3 === 2) caras.push(`f 1/${k - 1} 2/${k} 3/${k + 1}`);
  }
  const l = igualQueOBJLoader([...lineas, ...caras].join('\n') + '\n');
  assert.equal(l.posiciones.length / 3, 900);
});

test('usemtl: un grupo por tramo, los nombres de los que tienen caras, y cada material con sus vértices', () => {
  const texto = ['mtllib uno.mtl', ...CUADRADO, 'usemtl sin_caras', 'usemtl rojo', 'f 1/1 2/2 3/3', 'usemtl verde', 'f 1/1 3/3 4/4', 'usemtl rojo', 'usemtl rojo', 'f 1/1 2/2 4/4'].join('\n') + '\n';
  const l = igualQueOBJLoader(texto);
  assert.deepEqual(l.materiales, ['rojo', 'verde']);
  assert.deepEqual(l.grupos, [
    { inicio: 0, cuenta: 3, material: 0 },
    { inicio: 3, cuenta: 3, material: 1 },
    { inicio: 6, cuenta: 3, material: 0 },
  ]);
  // Rojo reparte 1, 2, 3 y 4; verde repite 1, 3 y 4: no comparten vértice, porque cada uno saca
  // el color de su propia imagen.
  assert.equal(l.posiciones.length / 3, 4 + 3);
  // Sin usemtl hay un solo material, sin nombre: como OBJLoader.
  assert.deepEqual(leerObj(bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')).materiales, ['']);
  assert.equal(leerObj(bytes('mtllib  con espacio.mtl \nusemtl  m 1 \nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')).materiales[0], 'm 1');
  assert.equal(leerObj(bytes('mtllib  con espacio.mtl \nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')).bibliotecas[0], 'con espacio.mtl');
});

test('lo que no sabe leer lo devuelve a OBJLoader: mejor lento que un carro roto', () => {
  const caso = (rotulo, texto) => assert.equal(leerObj(bytes(texto)), null, rotulo);
  const T = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n';
  caso('color por vértice', 'v 0 0 0 1 0 0\nv 1 0 0 1 0 0\nv 0 1 0 1 0 0\nf 1 2 3\n');
  caso('un w de más', 'v 0 0 0 1\nv 1 0 0 1\nv 0 1 0 1\nf 1 2 3\n');
  caso('solo puntos', T);
  caso('puntos sueltos', T + 'p 1 2\n');
  caso('líneas', T + 'l 1 2\n');
  caso('coma decimal', 'v 0,5 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('nan', 'v nan 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('un número pegado a una letra', 'v 1.5x 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('faltan coordenadas', 'v 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('exponente sin cifras', 'v 1e 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('una v sin datos', 'v\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('palabra desconocida con v', 'vx 1 2 3\n' + T + 'f 1 2 3\n');
  caso('vt con una sola coordenada', T + 'vt 0\nf 1/1 2/1 3/1\n');
  caso('vt con cuatro', T + 'vt 0 0 0 0\nf 1/1 2/1 3/1\n');
  caso('índice cero', T + 'f 0 1 2\n');
  caso('índice de más', T + 'f 1 2 4\n');
  caso('negativo de más', T + 'f -4 -2 -1\n');
  caso('un vértice definido después', 'v 0 0 0\nv 1 0 0\nf 1 2 3\nv 0 1 0\n');
  caso('coordenada de más', T + 'vt 0 0\nf 1/2 2/1 3/1\n');
  caso('coordenada cero', T + 'vt 0 0\nf 1/0 2/1 3/1\n');
  caso('cara de dos esquinas', T + 'f 1 2\n');
  caso('cara con basura', T + 'f 1 2 x\n');
  caso('esquina con cuatro partes', T + 'vt 0 0\nvn 0 0 1\nf 1/1/1/1 2/1/1 3/1/1\n');
  caso('caras con y sin coordenadas', T + 'vt 0 0\nf 1/1 2/1 3/1\nf 1 2 3\n');
  caso('una línea que sigue en la siguiente', 'v 0 0 \\\n0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('lo mismo con CRLF', T + 'f 1 2 \\\r\n3\r\n');
  caso('un retorno suelto en medio', 'v 0 0 0\rv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  caso('vacío', '');
  caso('solo comentarios', '# nada\n');
});
