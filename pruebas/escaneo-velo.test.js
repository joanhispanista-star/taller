// El borde de una pieza marcada sobre un escaneo: tiene que ser una curva limpia aunque
// la orilla de triángulos sea un serrucho, y no tardar en un escaneo grande.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campoDePieza, crearVelo, soldarVertices } from '../js/escaneo-velo.js';

// Una lámina en el plano (x, z) de n × n vértices, a 2 cm. La pieza "puerta" es la
// mitad con x bajo la orilla que diga `orilla(fila)`, en serrucho si se quiere.
function lamina(n, orilla) {
  const posiciones = [];
  const etiquetas = [];
  const indices = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      posiciones.push(j * 0.02, 0, i * 0.02);
      etiquetas.push(j < orilla(i) ? 1 : 0);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  return { posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices), etiquetas: new Uint8Array(etiquetas), nombres: ['nada', 'puerta'] };
}

// Dónde cruza el 0,5 en una fila de la lámina.
function cruce(campo, n, fila) {
  for (let j = 1; j < n; j++) {
    const a = campo[fila * n + j - 1];
    const b = campo[fila * n + j];
    if (a >= 0.5 && b < 0.5) return j - 1 + (a - 0.5) / (a - b);
  }
  return null;
}

test('de un serrucho sale una línea recta', () => {
  const n = 60;
  // Dientes de ±2 vértices (±4 cm) alrededor del vértice 30.
  const escaneo = lamina(n, (i) => (i % 8 < 4 ? 28 : 32));
  const sinSuavizar = campoDePieza(escaneo, 'puerta', 0).campo;
  const { campo } = campoDePieza(escaneo, 'puerta');
  const onda = (c) => {
    const xs = [];
    for (let i = 12; i < n - 12; i++) xs.push(cruce(c, n, i));
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(onda(sinSuavizar) > 3, `el serrucho de entrada mide ${onda(sinSuavizar).toFixed(1)} vértices`);
  assert.ok(onda(campo) < 0.5, `y queda en ${onda(campo).toFixed(2)} vértices (1 cm)`);
  assert.ok(Math.abs(cruce(campo, n, 30) - 29.5) < 1, `sin correrse de sitio: ${cruce(campo, n, 30).toFixed(1)}`);
});

test('adentro de la pieza vale 1 y lejos vale 0, y solo se dibuja lo que está cerca', () => {
  const n = 60;
  const escaneo = lamina(n, () => 30);
  const { campo, triangulos } = campoDePieza(escaneo, 'puerta');
  assert.ok(campo[30 * n + 5] > 0.99);
  assert.ok(campo[30 * n + 55] < 0.01);
  assert.ok(triangulos.length > 0);
  assert.ok(triangulos.length < escaneo.indices.length / 3, 'no se dibuja toda la lámina');
});

test('las copias de un vértice en una costura de foto llevan el mismo valor', () => {
  // Dos filas de triángulos que comparten una costura, con los vértices repetidos.
  const posiciones = new Float32Array([0, 0, 0, 0.02, 0, 0, 0, 0, 0.02, 0.02, 0, 0.02, 0, 0, 0.02, 0.02, 0, 0.02, 0, 0, 0.04, 0.02, 0, 0.04]);
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]);
  const etiquetas = new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0]);
  const { grupo } = soldarVertices(posiciones);
  assert.equal(grupo[2], grupo[4]);
  const { campo } = campoDePieza({ posiciones, indices, etiquetas, nombres: ['nada', 'puerta'] }, 'puerta');
  assert.equal(campo[2], campo[4]);
  assert.equal(campo[3], campo[5]);
});

test('una pieza que no está en el escaneo no da velo ni rompe', () => {
  const escaneo = lamina(10, () => 5);
  assert.equal(crearVelo(escaneo, 'capo', 0xff7a1a), null);
  assert.deepEqual(campoDePieza(escaneo, 'capo').triangulos, []);
});

test('el velo solo lleva los vértices que usa, y el dedo lo atraviesa', () => {
  const n = 60;
  const escaneo = lamina(n, () => 10);
  const velo = crearVelo(escaneo, 'puerta', 0xff7a1a);
  assert.ok(velo.geometry.attributes.position.count < n * n, `${velo.geometry.attributes.position.count} vértices`);
  assert.equal(velo.geometry.attributes.position.count, velo.geometry.attributes.aCampo.count);
  const cruces = [];
  velo.raycast({}, cruces);
  assert.equal(cruces.length, 0);
  assert.equal(velo.material.depthWrite, false);
});

test('marcar una pieza en un escaneo grande no se demora', () => {
  // 250 mil vértices, medio millón de triángulos: un GLB típico de RealityScan.
  const n = 500;
  const escaneo = lamina(n, () => 40);
  const t0 = performance.now();
  campoDePieza(escaneo, 'puerta');
  const primero = performance.now() - t0;
  const t1 = performance.now();
  campoDePieza(escaneo, 'puerta');
  const segundo = performance.now() - t1;
  // En el PC. En el celular, unas tres veces más: con 150 ms se nota apenas.
  assert.ok(segundo < 300, `con la soldadura ya hecha: ${segundo.toFixed(0)} ms (el primero, ${primero.toFixed(0)} ms)`);
});

// Una lámina de n × n vértices con una pieza de unos pocos vértices en el centro.
function laminaConPiezaChica(n, lado) {
  const posiciones = [];
  const indices = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) posiciones.push(i * 0.05, 0, j * 0.05);
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const etiquetas = new Uint8Array(n * n);
  const c = Math.floor(n / 2);
  for (let i = c; i < c + lado; i++) for (let j = c; j < c + lado; j++) etiquetas[i * n + j] = 1;
  return { posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices), etiquetas, nombres: ['nada', 'espejo-izq'] };
}

test('una pieza chica para sus triángulos también se pinta: el campo cruza 0,5 alrededor de ella', () => {
  for (const lado of [2, 3, 4]) {
    const { campo } = campoDePieza(laminaConPiezaChica(40, lado), 'espejo-izq');
    const pico = campo.reduce((a, b) => Math.max(a, b), 0);
    assert.ok(pico >= 0.5, `lado ${lado}: el campo llega a ${pico.toFixed(2)}: no hay línea ni relleno`);
  }
});

test('una pieza normal no se reescala: el campo llega casi a 1 por sí solo', () => {
  const { campo } = campoDePieza(laminaConPiezaChica(60, 30), 'espejo-izq');
  assert.ok(campo.reduce((a, b) => Math.max(a, b), 0) > 0.9);
});

test('una lámina suelta: con cerrarOrillas el campo baja hacia su orilla y sale la línea; sin eso se queda como en un escaneo', () => {
  // Toda la lámina es la pieza, y no comparte vértices con nadie: así va el capó de un carro de catálogo.
  const n = 21;
  const e = lamina(n, () => 99);
  const sin = campoDePieza(e, 'puerta', 10).campo;
  assert.ok(Math.min(...sin) > 0.99, 'un escaneo no dibuja línea alrededor de sus huecos');
  const con = campoDePieza(e, 'puerta', 10, { cerrarOrillas: true }).campo;
  const en = (i, j) => con[i * n + j];
  assert.ok(en(10, 0) < 0.5, 'en la orilla no llega a 0,5: ' + en(10, 0));
  assert.ok(en(10, 10) > 0.8, 'en el centro sigue adentro: ' + en(10, 10));
  // Y cruza 0,5 antes de llegar a la orilla de enfrente: ahí va la línea.
  assert.ok(cruce(con, n, 10) > 10 && cruce(con, n, 10) < n - 1, 'cruza en ' + cruce(con, n, 10));
});
