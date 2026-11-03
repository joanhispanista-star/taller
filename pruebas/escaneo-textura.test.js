// Lo que hace que un carro real se vea real: la foto pegada encima (textura), las
// normales que no se quiebran en las costuras, el carro que no pierde las llantas
// cuando la malla no trae piso, y la cintura leída del color. Son los defectos que
// no gritan: la malla sigue midiendo bien y solo se ve mal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ajustesDelEscaneo, etiquetarPiezas, modeloDesdeEscaneo, normalesSoldadas, pinturaDelEscaneo, procesarEscaneo, puertasDeLaFoto, quitarIslas, recortarMalla, reetiquetarEscaneo } from '../js/escaneo.js';
import { mallaDeObjeto3D } from '../js/escaneo-importar.js';
import { escaneoParaGuardar } from '../js/escaneos.js';

// Una caja de triángulos, con cada cara partida en n × n (pocos triángulos no
// llegan al mínimo que pide el procesado), y sin tapa de abajo: una malla con la
// panza plana y llena parece un piso para estimarPiso, y ninguna tubería la saca.
function agregarCaja(malla, [x0, x1], [y0, y1], [z0, z1], n = 12) {
  const cara = (origen, u, v) => {
    const base = malla.posiciones.length / 3;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        malla.posiciones.push(origen[0] + (u[0] * i) / n + (v[0] * j) / n, origen[1] + (u[1] * i) / n + (v[1] * j) / n, origen[2] + (u[2] * i) / n + (v[2] * j) / n);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = base + i * (n + 1) + j;
        malla.indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
  };
  const [dx, dy, dz] = [x1 - x0, y1 - y0, z1 - z0];
  cara([x0, y1, z0], [dx, 0, 0], [0, 0, dz]);
  cara([x0, y0, z0], [0, dy, 0], [0, 0, dz]);
  cara([x1, y0, z0], [0, dy, 0], [0, 0, dz]);
  cara([x0, y0, z0], [dx, 0, 0], [0, dy, 0]);
  cara([x0, y0, z1], [dx, 0, 0], [0, dy, 0]);
}

function carroDeCajas() {
  const malla = { posiciones: [], indices: [] };
  agregarCaja(malla, [-0.9, 0.9], [0.3, 1.0], [-2.2, 2.2], 24);
  agregarCaja(malla, [-0.75, 0.75], [1.0, 1.45], [-1.0, 1.2], 20);
  for (const x of [[-0.9, -0.7], [0.7, 0.9]]) {
    for (const z of [[-1.6, -1.0], [1.0, 1.6]]) agregarCaja(malla, x, [0, 0.6], z, 8);
  }
  return { posiciones: new Float32Array(malla.posiciones), indices: new Uint32Array(malla.indices) };
}

test('recortar una malla no desordena las coordenadas de la foto', () => {
  const posiciones = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
  const uvs = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  const normales = new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, -1]);
  // Solo el segundo triángulo: el vértice 0 se va y los demás cambian de número.
  const sub = recortarMalla({ posiciones, indices: new Uint32Array([0, 1, 2, 1, 3, 2]), uvs, normales }, new Uint8Array([0, 0, 0, 1]));
  assert.deepEqual(Array.from(sub.indices), [0, 1, 2]);
  assert.deepEqual(Array.from(sub.uvs).map((v) => Number(v.toFixed(1))), [0.3, 0.4, 0.7, 0.8, 0.5, 0.6]);
  assert.deepEqual(Array.from(sub.normales), [0, 1, 0, 0, 0, -1, 1, 0, 0]);
});

test('las normales no se quiebran donde la textura repite los vértices', () => {
  // Dos triángulos que forman un techo a dos aguas; la cumbrera está repetida
  // (vértices 1-2 y 3-4), como en una costura entre dos fotos.
  const posiciones = new Float32Array([-1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1]);
  const indices = new Uint32Array([0, 2, 1, 3, 4, 5]);
  const n = normalesSoldadas(posiciones, indices);
  assert.deepEqual(Array.from(n.slice(3, 6)), Array.from(n.slice(9, 12)), 'la copia del vértice lleva la misma normal');
  assert.ok(Math.abs(n[3]) < 1e-6 && Math.abs(n[4]) > 0.99, 'en la cumbrera, la normal apunta hacia arriba');
});

test('una malla sin piso alrededor conserva hasta abajo las llantas', () => {
  // Tallada con siluetas no trae piso: si igual se corta la franja de abajo, el
  // carro queda flotando 8 cm.
  const escaneo = procesarEscaneo(carroDeCajas(), { carroceria: 'suv' });
  let bajo = Infinity;
  for (let i = 1; i < escaneo.posiciones.length; i += 3) bajo = Math.min(bajo, escaneo.posiciones[i]);
  assert.ok(bajo < 0.04, `lo más bajo quedó a ${bajo.toFixed(3)} m`);
  assert.ok(Math.abs(escaneo.medidas.alto - 1.45) < 0.08, `alto ${escaneo.medidas.alto.toFixed(2)}`);
});

test('los ejes se leen de donde la malla toca el piso', () => {
  const escaneo = procesarEscaneo(carroDeCajas(), { carroceria: 'suv' });
  const { ejeDel, ejeTras } = escaneo.ajustes;
  assert.ok(Number.isFinite(ejeDel) && Number.isFinite(ejeTras), JSON.stringify(escaneo.ajustes));
  assert.ok(Math.abs(Math.abs(ejeTras - ejeDel) - 2.6) < 0.2, `entre ejes ${(ejeTras - ejeDel).toFixed(2)}`);
});

// Un costado recto: la forma no dice dónde está la cintura, solo el color.
function costadoConColor(pintura) {
  const posiciones = [];
  const colores = [];
  for (let y = 0.3; y < 1.5; y += 0.015) {
    for (let z = -1.5; z < 1.5; z += 0.06) {
      for (const x of [-0.85, 0.85]) {
        posiciones.push(x, y, z);
        colores.push(...(y < 1.0 ? pintura : [28, 30, 34]));
      }
    }
  }
  return { posiciones: new Float32Array(posiciones), colores: new Uint8Array(colores) };
}

test('con pintura de color, la cintura sale de donde se acaba la pintura', () => {
  const { posiciones, colores } = costadoConColor([170, 32, 40]);
  const { cintura } = ajustesDelEscaneo(posiciones, { largo: 4.4, ancho: 1.8, alto: 1.5, entreEjes: 2.6 }, colores);
  assert.ok(Math.abs(cintura - 1.0) <= 0.06, `cintura ${cintura}`);
});

test('con pintura sin color no se inventa la cintura: gris y vidrio no se distinguen por el tono', () => {
  const { posiciones, colores } = costadoConColor([175, 178, 180]);
  const { cintura } = ajustesDelEscaneo(posiciones, { largo: 4.4, ancho: 1.8, alto: 1.5, entreEjes: 2.6 }, colores);
  assert.equal(cintura, undefined);
});

test('al leer un archivo con una sola textura se guardan sus coordenadas, con v = 0 arriba', () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.25, 0.1, 0.5, 0.2, 0.75, 0.3]), 2));
  const mapa = new THREE.Texture();
  const color = () => [10, 20, 30];
  const conFlip = mallaDeObjeto3D(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapa })), { colorDeTextura: color });
  assert.equal(conFlip.mapa, mapa);
  assert.equal(Number(conFlip.uvs[1].toFixed(2)), 0.9);
  // Así viene de glTF: flipY apagado, v ya cuenta desde arriba.
  mapa.flipY = false;
  const sinFlip = mallaDeObjeto3D(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapa })), { colorDeTextura: color });
  assert.equal(Number(sinFlip.uvs[1].toFixed(2)), 0.1);
  // Dos texturas: no hay una sola foto que poner, se queda el color por vértice.
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mapa })), new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.Texture() })));
  const dos = mallaDeObjeto3D(grupo, { colorDeTextura: color });
  assert.equal(dos.mapa, null);
  assert.equal(dos.uvs, null);
});

test('guardar un escaneo se lleva la foto y lo medido; sin foto no guarda coordenadas sueltas', () => {
  const base = {
    posiciones: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    etiquetas: new Uint8Array(3),
    nombres: ['nada'],
    medidas: { largo: 4, ancho: 1.8, alto: 1.5 },
    medidasDibujo: { largo: 4, ancho: 1.8, alto: 1.5 },
    ajustes: { ejeDel: -1.2, ejeTras: 1.4 },
  };
  const textura = { tipo: 'image/jpeg' };
  const con = escaneoParaGuardar('abc123', { ...base, uvs: new Float32Array(6), textura });
  assert.equal(con.textura, textura);
  assert.equal(con.uvs.length, 6);
  assert.deepEqual(con.ajustes, base.ajustes);
  const sin = escaneoParaGuardar('abc123', { ...base, uvs: new Float32Array(6), textura: null });
  assert.equal(sin.uvs, null);
  assert.equal(sin.textura, null);
});

test('el modelo con textura lleva sus coordenadas en cada pieza, y sin navegador no se rompe', async () => {
  const escaneo = procesarEscaneo(carroDeCajas(), { carroceria: 'suv' });
  const n = escaneo.posiciones.length / 3;
  const modelo = modeloDesdeEscaneo({ ...escaneo, uvs: new Float32Array(n * 2), textura: { tipo: 'image/jpeg' } });
  assert.equal(await modelo.texturaLista, null, 'sin createImageBitmap, no hay foto que poner');
  const conUv = modelo.grupo.children.filter((m) => m.isMesh);
  assert.ok(conUv.length > 1);
  for (const m of conUv) assert.ok(m.geometry.attributes.uv, `${m.name} sin coordenadas`);
  // Sin textura, no se cuelan coordenadas que nadie va a usar.
  const sin = modeloDesdeEscaneo({ ...escaneo, uvs: new Float32Array(n * 2), textura: null });
  for (const m of sin.grupo.children.filter((h) => h.isMesh)) assert.equal(m.geometry.attributes.uv, undefined);
});

// Los dos costados de un carro, planos, con la foto de cada uno en media imagen.
function costadosConFoto(pintar) {
  const posiciones = [];
  const uvs = [];
  const indices = [];
  const [nz, ny] = [88, 22];
  for (const [x, u0] of [[0.9, 0], [-0.9, 0.5]]) {
    const base = posiciones.length / 3;
    for (let i = 0; i <= nz; i++) {
      for (let j = 0; j <= ny; j++) {
        posiciones.push(x, 0.2 + (1.1 * j) / ny, -2.2 + (4.4 * i) / nz);
        uvs.push(u0 + (0.5 * i) / nz, 1 - j / ny);
      }
    }
    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < ny; j++) {
        const a = base + i * (ny + 1) + j;
        indices.push(a, a + ny + 1, a + 1, a + 1, a + ny + 1, a + ny + 2);
      }
    }
  }
  const luz = { ancho: 2000, alto: 500, datos: new Uint8Array(2000 * 500) };
  // Ruido fijo, como la textura de una foto.
  let semilla = 7;
  for (let i = 0; i < luz.datos.length; i++) {
    semilla = (semilla * 16807) % 2147483647;
    luz.datos[i] = 150 + (semilla % 7);
  }
  pintar(luz);
  return { posiciones: new Float32Array(posiciones), uvs: new Float32Array(uvs), indices: new Uint32Array(indices), luz };
}
const PREVIA = { piso: 0.2, cintura: 1.1, puertaDel: -0.7, puertaMedia: 0.25, puertaTras: 1.05 };
const columnaDe = (z, u0) => Math.round((u0 + 0.5 * ((z + 2.2) / 4.4)) * 2000);
function raya(luz, z, u0, { desde = 0, hasta = 500, ancho = 2, valor = 40 } = {}) {
  const c = columnaDe(z, u0);
  for (let y = desde; y < hasta; y++) {
    for (let x = c - ancho; x <= c + ancho; x++) luz.datos[y * 2000 + x] = valor;
  }
}

test('las juntas de las puertas se leen de la foto, aunque el genérico las ponga 10 cm al lado', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    for (const z of [-0.8, 0.35, 1.2]) {
      raya(img, z, 0);
      raya(img, z, 0.5);
    }
    // Una manija: oscura, pero no atraviesa la lata de arriba abajo.
    raya(img, 0.1, 0, { desde: 120, hasta: 150, ancho: 30 });
    raya(img, 0.1, 0.5, { desde: 120, hasta: 150, ancho: 30 });
    // Una raya de un solo costado: un reflejo no está en los dos lados.
    raya(img, 0.15, 0, { valor: 20 });
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA);
  assert.ok(Math.abs(j.puertaDel + 0.8) < 0.015, `delantera ${j.puertaDel}`);
  assert.ok(Math.abs(j.puertaMedia - 0.35) < 0.015, `del medio ${j.puertaMedia}`);
  assert.ok(Math.abs(j.puertaTras - 1.2) < 0.015, `trasera ${j.puertaTras}`);
});

test('sin rayas en la foto no se inventan juntas', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto(() => {});
  assert.deepEqual(puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA), {});
});

test('al cambiar la carrocería se conservan las juntas ya leídas: son del carro', () => {
  const escaneo = procesarEscaneo(carroDeCajas(), { carroceria: 'suv' });
  escaneo.ajustes.puertaMedia = 0.42;
  const otra = reetiquetarEscaneo(escaneo, 'hatchback');
  assert.equal(otra.ajustes.puertaMedia, 0.42);
});

test('con normales, cuenta la distancia a lo largo de la lata, no lo que separa la malla del genérico', () => {
  // A está al lado sobre la misma lata; B está casi justo debajo, 10 cm más
  // adentro. (La tercera muestra solo agranda la rejilla.)
  const muestras = { puntos: new Float32Array([0.09, 0, 0, 0.02, 0.1, 0, -0.5, -0.5, -0.5]), etiquetas: new Uint8Array([1, 2, 3]) };
  const punto = new Float32Array([0, 0, 0]);
  assert.equal(etiquetarPiezas(punto, muestras)[0], 1);
  assert.equal(etiquetarPiezas(punto, muestras, { normales: new Float32Array([0, 1, 0]) })[0], 2);
});

test('sin pecas: lo suelto y los huecos chicos toman la etiqueta de alrededor', () => {
  // Una lámina de 40 × 40 vértices: la mitad es la pieza 1 y la otra la pieza 2.
  const n = 40;
  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const etiquetas = new Uint8Array(n * n).map((_, v) => (Math.floor(v / n) < 20 ? 1 : 2));
  // Un hueco de 3 × 3 (9 vértices) en la pieza 1, y una isla de 3 × 3 de la pieza 1 en la 2.
  for (let i = 5; i < 8; i++) for (let j = 5; j < 8; j++) etiquetas[i * n + j] = 0;
  for (let i = 30; i < 33; i++) for (let j = 30; j < 33; j++) etiquetas[i * n + j] = 1;
  const limpias = quitarIslas(new Uint32Array(indices), etiquetas, 30);
  assert.equal(limpias[6 * n + 6], 1, 'el hueco se llena');
  assert.equal(limpias[31 * n + 31], 2, 'la isla se va');
  assert.equal(limpias[0], 1, 'lo demás no cambia');
  assert.equal(limpias[39 * n], 2);
  // Un hueco grande dentro de una sola pieza es un reflejo, y se llena; el mismo
  // hueco tocando dos piezas puede ser una ventana, y se queda.
  const grande = new Uint8Array(n * n).map((_, v) => (Math.floor(v / n) < 20 ? 1 : 2));
  for (let i = 2; i < 12; i++) for (let j = 5; j < 15; j++) grande[i * n + j] = 0;
  assert.equal(quitarIslas(new Uint32Array(indices), grande, 30)[6 * n + 8], 1);
  for (let i = 15; i < 25; i++) for (let j = 5; j < 15; j++) grande[i * n + j] = 0;
  assert.equal(quitarIslas(new Uint32Array(indices), grande, 30)[20 * n + 8], 0);
});

test('un costado a contraluz sigue siendo pintura', () => {
  // Los dos lados del mismo carro rojo: uno da 200 de brillo, y el otro, 60. El
  // plástico negro de cada lado da la cuarta parte de su costado.
  const posiciones = [];
  const colores = [];
  for (const [x, brillo] of [[0.85, 200], [-0.85, 60]]) {
    for (let y = 0.2; y < 1.2; y += 0.02) {
      for (let z = -1.5; z < 1.5; z += 0.05) {
        posiciones.push(x, y, z);
        const v = y < 0.35 ? brillo / 4 : brillo;
        colores.push(v, v * 0.2, v * 0.2);
      }
    }
  }
  const pintura = pinturaDelEscaneo(new Float32Array(posiciones), new Uint8Array(colores), { largo: 4.4, ancho: 1.8, alto: 1.4 });
  const de = (x, y) => {
    for (let i = 0; i < posiciones.length; i += 3) if (posiciones[i] === x && Math.abs(posiciones[i + 1] - y) < 0.011) return pintura[i / 3];
    return null;
  };
  assert.equal(de(0.85, 0.7), 1, 'lado del sol: pintura');
  assert.equal(de(-0.85, 0.7), 1, 'lado a contraluz: también pintura');
  assert.equal(de(0.85, 0.25), 0, 'plástico del lado del sol');
  assert.equal(de(-0.85, 0.25), 0, 'plástico del lado a contraluz');
});
