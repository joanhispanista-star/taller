// Lo que hace que un carro real se vea real: la foto pegada encima (textura), las
// normales que no se quiebran en las costuras, el carro que no pierde las llantas
// cuando la malla no trae piso, y la cintura leída del color. Son los defectos que
// no gritan: la malla sigue midiendo bien y solo se ve mal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ajustesDelEscaneo, etiquetarPiezas, juntasDelEscaneo, modeloDesdeEscaneo, muestrasDelGenerico, normalesSoldadas, piezasDelEscaneo, pinturaDelEscaneo, procesarEscaneo, puertasDeLaFoto, quitarIslas, recortarMalla, reetiquetarEscaneo, simplificarMalla } from '../js/escaneo.js';
import { mallaDeObjeto3D } from '../js/escaneo-importar.js';
import { escaneoParaGuardar } from '../js/escaneos.js';
import { construirCarro, disposicion, resaltar } from '../js/carro.js';

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

test('la línea de junta queda por fuera de la lata, aunque el archivo traiga las caras al revés', () => {
  // Un cubo de dos piezas: la cara de arriba es una y lo demás otra. Con las caras al
  // revés, las normales apuntan hacia adentro: sumarle los 3 mm a la normal metía la
  // línea debajo de la lata, y en los escaneos sin foto casi no se veía.
  const malla = { posiciones: [], indices: [] };
  agregarCaja(malla, [-1, 1], [0, 2], [-1, 1], 8);
  const posiciones = new Float32Array(malla.posiciones);
  const derecho = new Uint32Array(malla.indices);
  // La tapa de abajo falta, y da igual: el signo del volumen sigue saliendo.
  const alReves = derecho.slice();
  for (let t = 0; t < alReves.length; t += 3) [alReves[t + 1], alReves[t + 2]] = [alReves[t + 2], alReves[t + 1]];
  const adentro = (indices) => {
    const deTriangulo = new Uint8Array(indices.length / 3);
    for (let t = 0; t < indices.length; t += 3) {
      const yMedia = (posiciones[indices[t] * 3 + 1] + posiciones[indices[t + 1] * 3 + 1] + posiciones[indices[t + 2] * 3 + 1]) / 3;
      deTriangulo[t / 3] = yMedia > 1.99 ? 1 : 0;
    }
    const lineas = juntasDelEscaneo(posiciones, indices, deTriangulo, ['nada', 'techo'], normalesSoldadas(posiciones, indices));
    const P = lineas.geometry.attributes.position;
    assert.ok(P.count > 0);
    let cuantos = 0;
    // El borde del cubo está en |x| = 1 o |z| = 1 y y = 2: adentro es menos que eso.
    for (let i = 0; i < P.count; i++) if (Math.max(Math.abs(P.getX(i)), Math.abs(P.getZ(i))) < 1 && P.getY(i) < 2) cuantos++;
    return cuantos / P.count;
  };
  const a = adentro(derecho);
  const b = adentro(alReves);
  assert.ok(Math.abs(a - b) < 0.05, `con las caras al derecho, ${(a * 100).toFixed(0)} % por dentro; al revés, ${(b * 100).toFixed(0)} %`);
});

test('una raya de un solo costado, sola, es un reflejo y no una junta', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => raya(img, 0.15, 0, { valor: 20 }));
  assert.deepEqual(puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA), {});
});

test('un reflejo fuerte de un costado no le gana a una junta tenue de los dos', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    raya(img, 0.35, 0, { valor: 120 });
    raya(img, 0.35, 0.5, { valor: 120 });
    raya(img, 0.15, 0, { valor: 20 });
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA);
  assert.ok(Math.abs(j.juntasLado.izq.puertaMedia - 0.35) < 0.02, JSON.stringify(j));
  assert.ok(Math.abs(j.puertaMedia - 0.35) < 0.15, JSON.stringify(j));
});

test('un escalón de brillo no es una raya: el borde de un reflejo o de una sombra', () => {
  for (const costados of [[0, 0.5], [0]]) {
    const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
      for (const u0 of costados) {
        const c = columnaDe(0.1, u0);
        for (let y = 0; y < 500; y++) for (let x = c; x < u0 * 2000 + 1000; x++) img.datos[y * 2000 + x] = Math.round(img.datos[y * 2000 + x] * 0.88);
      }
    });
    assert.deepEqual(puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA), {});
  }
});

test('sin rayas no se inventan juntas, ni con grano ni en un costado oscuro', () => {
  for (const [base, amplitud] of [[150, 23], [20, 5]]) {
    const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
      let semilla = 11;
      for (let i = 0; i < img.datos.length; i++) {
        semilla = (semilla * 16807) % 2147483647;
        img.datos[i] = base + (semilla % amplitud);
      }
    });
    assert.deepEqual(puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA), {}, `brillo ${base}`);
  }
});

test('la junta delantera no se acepta dentro de la rueda', () => {
  const previa = { ...PREVIA, ejeDel: -1.3, radioRueda: 0.32 };
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    // El borde del pase de rueda: una raya en los dos costados, más fuerte que la junta.
    for (const u0 of [0, 0.5]) {
      raya(img, -1.05, u0, { valor: 10 });
      raya(img, -0.8, u0, { valor: 80 });
      raya(img, 0.35, u0);
    }
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, previa);
  assert.ok(Math.abs(j.puertaDel + 0.8) < 0.02, `delantera ${j.puertaDel}`);
});

test('cada costado guarda su propia lectura: la foto se corre según el lado', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    raya(img, 0.3, 0);
    raya(img, 0.4, 0.5);
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA);
  assert.ok(Math.abs(j.juntasLado.der.puertaMedia - 0.3) < 0.015, JSON.stringify(j.juntasLado));
  assert.ok(Math.abs(j.juntasLado.izq.puertaMedia - 0.4) < 0.015, JSON.stringify(j.juntasLado));
  assert.ok(Math.abs(j.puertaMedia - 0.35) < 0.015);
});

test('en un costado a contraluz manda el otro, sin que lo oscuro invente', () => {
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    // El costado izquierdo, oscurecido: ahí una raya casi no se distingue.
    for (let y = 0; y < 500; y++) for (let x = 1000; x < 2000; x++) img.datos[y * 2000 + x] = 18 + (x % 3);
    raya(img, 0.35, 0);
    raya(img, 0.1, 0.5, { valor: 6 }); // una mancha en lo oscuro, sin pareja
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA);
  assert.ok(Math.abs(j.juntasLado.der.puertaMedia - 0.35) < 0.015, JSON.stringify(j.juntasLado));
  assert.ok(Math.abs(j.juntasLado.izq.puertaMedia - 0.35) < 0.015, JSON.stringify(j.juntasLado));
});

test('en una pick-up, la raya de esa ventana es la luz entre cabina y platón: la puerta termina antes', () => {
  const previa = { ...PREVIA, tipo: 'camioneta' };
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    for (const u0 of [0, 0.5]) {
      raya(img, 0.35, u0);
      raya(img, 1.2, u0);
    }
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, previa);
  assert.ok(Math.abs(j.puertaTras - 1.08) < 0.02, `trasera ${j.puertaTras}`);
});

test('simplificar conserva la foto: coordenadas, costuras cerradas y sin triángulos de área cero', () => {
  // Dos islas de foto que comparten una costura, con los vértices repetidos.
  const n = 80;
  const posiciones = [];
  const uvs = [];
  const indices = [];
  for (const [z0, u0] of [[0, 0], [0.8, 0.5]]) {
    const base = posiciones.length / 3;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        posiciones.push((j / n) * 0.8, 0, z0 + (i / n) * 0.8);
        uvs.push(u0 + (j / n) * 0.4, (i / n) * 0.9);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = base + i * (n + 1) + j;
        indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
  }
  const r = simplificarMalla({ posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices), colores: null, uvs: new Float32Array(uvs) }, { maximo: 6000, celda: 0.012 });
  assert.ok(r.indices.length / 3 <= 6000, `${r.indices.length / 3} triángulos`);
  assert.equal(r.uvs.length, (r.posiciones.length / 3) * 2);
  // Cada isla sigue en su mitad de la foto: promediar los dos lados de la costura daría
  // coordenadas en el medio de la imagen.
  for (let v = 0; v < r.posiciones.length / 3; v++) {
    const u = r.uvs[v * 2];
    assert.ok(u <= 0.41 || u >= 0.49, `coordenada ${u} entre las dos islas`);
  }
  // Las dos islas comparten posición en la costura.
  const enCostura = new Set();
  for (let v = 0; v < r.posiciones.length / 3; v++) {
    if (Math.abs(r.posiciones[v * 3 + 2] - 0.8) < 0.012) enCostura.add(r.posiciones[v * 3].toFixed(4) + ',' + r.posiciones[v * 3 + 2].toFixed(4));
  }
  assert.ok(enCostura.size < r.posiciones.length / 3);
});

test('un archivo pesado conserva la foto, y el tope cuenta lo que queda del carro', () => {
  const malla = carroDeCajas();
  const n = malla.posiciones.length / 3;
  const escaneo = procesarEscaneo({ ...malla, uvs: new Float32Array(n * 2).fill(0.5) }, { carroceria: 'suv', maximoTriangulos: 4000 });
  assert.ok(escaneo.indices.length / 3 <= 4000, `${escaneo.indices.length / 3} triángulos`);
  assert.ok(escaneo.uvs, 'se quedó sin coordenadas');
  assert.equal(escaneo.uvs.length, (escaneo.posiciones.length / 3) * 2);
});

test('la pintura por costado no parte un panel por la mitad', () => {
  // Una cola de un solo tono, entre un costado al sol y otro a contraluz.
  const posiciones = [];
  const colores = [];
  for (const [x, brillo] of [[0.85, 200], [-0.85, 60]]) {
    for (let y = 0.3; y < 1.2; y += 0.03) {
      for (let z = -1.5; z < 1.5; z += 0.06) {
        posiciones.push(x, y, z);
        colores.push(brillo, brillo * 0.2, brillo * 0.2);
      }
    }
  }
  for (let x = -0.5; x <= 0.5; x += 0.02) {
    posiciones.push(x, 0.7, 2.0);
    colores.push(90, 18, 18);
  }
  const pintura = pinturaDelEscaneo(new Float32Array(posiciones), new Uint8Array(colores), { largo: 4.4, ancho: 1.8, alto: 1.4 });
  const cola = [];
  for (let i = 0; i < posiciones.length; i += 3) if (posiciones[i + 2] === 2.0) cola.push(pintura[i / 3]);
  assert.equal(new Set(cola).size, 1, 'media cola pintura y media no');
});

// ---------- Defectos de la segunda revisión (4-nov-2026) ----------

test('si falla la reserva de memoria, el siguiente intento de recortar no da una malla vacía', () => {
  const malla = { posiciones: Float32Array.from({ length: 12 }, (_, i) => i), indices: new Uint32Array([0, 1, 2, 1, 3, 2]) };
  const Original = globalThis.Uint32Array;
  globalThis.Uint32Array = class extends Original {
    constructor() {
      throw new RangeError('Array buffer allocation failed');
    }
  };
  try {
    assert.throws(() => recortarMalla(malla, null), RangeError);
  } finally {
    globalThis.Uint32Array = Original;
  }
  const otra = recortarMalla(malla, null);
  assert.equal(otra.posiciones.length, 12, 'el reintento se quedó sin vértices');
  assert.deepEqual(Array.from(otra.indices), [0, 1, 2, 1, 3, 2]);
});

test('simplificar no deja vértices que ningún triángulo usa', () => {
  // Sin índice, como sale de un OBJ: cada triángulo con sus tres vértices, y con foto.
  const posiciones = [];
  const uvs = [];
  const indices = [];
  const n = 60;
  const paso = 0.8 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const esquinas = [[i, j], [i + 1, j], [i, j + 1], [i, j + 1], [i + 1, j], [i + 1, j + 1]];
      for (const [a, b] of esquinas) {
        indices.push(posiciones.length / 3);
        posiciones.push(a * paso, 0, b * paso);
        uvs.push(a / n, b / n);
      }
    }
  }
  const r = simplificarMalla({ posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices), colores: null, uvs: new Float32Array(uvs) }, { maximo: 1500 });
  assert.ok(r.indices.length > 0 && r.indices.length / 3 <= 1500);
  const usado = new Uint8Array(r.posiciones.length / 3);
  for (const v of r.indices) usado[v] = 1;
  assert.equal(usado.reduce((s, x) => s + x, 0), usado.length, `${usado.length} vértices`);
  assert.equal(r.uvs.length, usado.length * 2);
});

// Dos láminas de una pieza cada una, a lado y lado de una costura de foto, con los vértices
// de la costura repetidos: así quedaban los escaneos guardados antes del 3-nov.
function costuraEntreDosPiezas(etiquetaDeCostura) {
  const n = 12;
  const posiciones = [];
  const etiquetas = [];
  const indices = [];
  for (const [z0, pieza] of [[-0.2, 1], [0, 2]]) {
    const base = posiciones.length / 3;
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j < n; j++) {
        posiciones.push(j * 0.02, 0, z0 + i * 0.02);
        etiquetas.push(pieza);
      }
    }
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = base + i * n + j;
        indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    }
  }
  // La fila de la costura en la segunda lámina: la primera ya acaba en z = 0.
  for (let j = 0; j < n; j++) etiquetas[11 * n + j] = etiquetaDeCostura;
  const I = new Uint32Array(indices);
  const deTriangulo = new Uint8Array(I.length / 3);
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [etiquetas[I[t]], etiquetas[I[t + 1]], etiquetas[I[t + 2]]];
    deTriangulo[t / 3] = a === b || a === c ? a : b === c ? b : a;
  }
  return { posiciones: new Float32Array(posiciones), indices: I, etiquetas: new Uint8Array(etiquetas), deTriangulo };
}
const NOMBRES_COSTURA = ['nada', 'puerta', 'costado'];
const puntosDe = (lineas) => lineas.geometry.attributes.position.count;

test('la junta de un escaneo guardado antes del 3-nov no se pierde en una costura de foto', () => {
  // Los vértices soldados llevan etiquetas distintas: los dos triángulos de la junta son parejos.
  const { posiciones, indices, etiquetas, deTriangulo } = costuraEntreDosPiezas(2);
  const sinFiltro = juntasDelEscaneo(posiciones, indices, deTriangulo, NOMBRES_COSTURA);
  const conFiltro = juntasDelEscaneo(posiciones, indices, deTriangulo, NOMBRES_COSTURA, null, { etiquetas });
  assert.ok(puntosDe(sinFiltro) > 0);
  assert.equal(puntosDe(conFiltro), puntosDe(sinFiltro));
});

test('el filtro de triángulos mezclados no cambia nada si las soldadas llevan una sola etiqueta', () => {
  const { posiciones, indices, etiquetas, deTriangulo } = costuraEntreDosPiezas(1);
  const sinFiltro = juntasDelEscaneo(posiciones, indices, deTriangulo, NOMBRES_COSTURA);
  const conFiltro = juntasDelEscaneo(posiciones, indices, deTriangulo, NOMBRES_COSTURA, null, { etiquetas });
  assert.ok(puntosDe(sinFiltro) > 0);
  assert.equal(puntosDe(conFiltro), puntosDe(sinFiltro));
});

// Los dos costados rectos, con la pintura hasta donde diga cada uno.
function costadosHasta(limiteDer, limiteIzq, pasoZ = 0.06) {
  const posiciones = [];
  const colores = [];
  for (let y = 0.3; y < 1.5; y += 0.015) {
    for (let z = -1.5; z < 1.5; z += pasoZ) {
      for (const [x, limite] of [[0.85, limiteDer], [-0.85, limiteIzq]]) {
        posiciones.push(x, y, z);
        colores.push(...(y < limite ? [170, 32, 40] : [28, 30, 34]));
      }
    }
  }
  return { posiciones: new Float32Array(posiciones), colores: new Uint8Array(colores) };
}
const MEDIDAS_CINTURA = { largo: 4.4, ancho: 1.8, alto: 1.5, entreEjes: 2.6 };

test('la cintura es la menor de los dos costados: el error común es un vidrio que parece pintura', () => {
  // Como en el Kona: 1,00 y 1,16 m, con la línea de verdad en 1,02. El promedio, 1,08, subía las
  // puertas al vidrio y apagaba la lectura de la junta del medio.
  for (const [der, izq] of [[1.16, 1.0], [1.0, 1.16]]) {
    const { posiciones, colores } = costadosHasta(der, izq);
    const { cintura } = ajustesDelEscaneo(posiciones, MEDIDAS_CINTURA, colores);
    assert.ok(Math.abs(cintura - 1.0) <= 0.05, `der ${der}, izq ${izq}: cintura ${cintura}`);
  }
});

test('el gris de relleno de lo que no trae color no cuenta como el final de la pintura', () => {
  // Media lata con color y media con el gris exacto de mallaDeObjeto3D: un OBJ al que le faltó una
  // imagen. La cintura de la Kona bajaba de 1,08 a 0,76 m.
  const posiciones = [];
  const colores = [];
  for (let y = 0.3; y < 1.5; y += 0.015) {
    for (let z = -1.5; z < 1.5; z += 0.03) {
      for (const x of [0.85, -0.85]) {
        posiciones.push(x, y, z);
        const pintura = y < 1.0;
        const sinFoto = pintura && z > 0;
        colores.push(...(sinFoto ? [128, 128, 128] : pintura ? [170, 32, 40] : [20, 24, 28]));
      }
    }
  }
  const { cintura } = ajustesDelEscaneo(new Float32Array(posiciones), MEDIDAS_CINTURA, new Uint8Array(colores));
  assert.ok(Math.abs(cintura - 1.0) <= 0.06, `cintura ${cintura}`);
});

test('un costado cuya lectura de cintura no es creíble se bota', () => {
  // 1,38 de 1,50 m: un vidrio que refleja el tono de la pintura. Sola se bota, y con otra buena
  // al lado no puede subirle la cintura 20 cm.
  for (const [der, izq] of [[1.38, 1.0], [1.0, 1.38]]) {
    const { posiciones, colores } = costadosHasta(der, izq);
    const { cintura } = ajustesDelEscaneo(posiciones, MEDIDAS_CINTURA, colores);
    assert.ok(Math.abs(cintura - 1.0) <= 0.06, `der ${der}, izq ${izq}: cintura ${cintura}`);
  }
  const { posiciones, colores } = costadosHasta(1.38, 1.38);
  assert.equal(ajustesDelEscaneo(posiciones, MEDIDAS_CINTURA, colores).cintura, undefined);
});

test('sin vidrio en la malla, la cintura sale del hueco de la ventana, aunque el techo sea del mismo color', () => {
  // Pintura hasta 1,00 m, la ventana sin reconstruir y el marco del techo.
  const posiciones = [];
  const colores = [];
  for (let y = 0.3; y < 1.5; y += 0.015) {
    if (y >= 1.0 && y < 1.34) continue;
    for (let z = -1.5; z < 1.5; z += 0.06) {
      for (const x of [0.85, -0.85]) {
        posiciones.push(x, y, z);
        colores.push(170, 32, 40);
      }
    }
  }
  const { cintura } = ajustesDelEscaneo(new Float32Array(posiciones), MEDIDAS_CINTURA, new Uint8Array(colores));
  assert.ok(Math.abs(cintura - 1.0) <= 0.06, `cintura ${cintura}`);
});

test('en una malla rala, una franja vacía no dice que se acabó la pintura', () => {
  // Cada franja de 4 cm trae menos de 40 puntos: un hueco de 12 cm en la lata es la malla que no
  // llega, y la pintura sigue hasta el vidrio. Tienen que ser 12: con 8 queda una sola franja
  // vacía, la lectura pide dos seguidas, y la prueba pasaba con y sin ese mínimo de 40 (sin él, 0,92).
  const { posiciones, colores } = costadosHasta(1.2, 1.2, 0.3);
  const conHueco = [];
  const susColores = [];
  for (let i = 0; i < posiciones.length; i += 3) {
    if (posiciones[i + 1] >= 0.9 && posiciones[i + 1] < 1.02) continue;
    conHueco.push(posiciones[i], posiciones[i + 1], posiciones[i + 2]);
    susColores.push(colores[i], colores[i + 1], colores[i + 2]);
  }
  const { cintura } = ajustesDelEscaneo(new Float32Array(conHueco), MEDIDAS_CINTURA, new Uint8Array(susColores));
  assert.ok(Math.abs(cintura - 1.2) <= 0.06, `cintura ${cintura}`);
});

test('el costado trasero no abraza la rueda por delante de la puerta', () => {
  const medidas = { largo: 4.3, ancho: 1.8, alto: 1.6, entreEjes: 2.6 };
  for (const carroceria of ['suv', 'hatchback', 'sedan', 'camioneta']) {
    const eje = disposicion(carroceria, medidas).ejeTras;
    // La de fábrica, y una leída en la foto sobre el arco.
    for (const ajustes of [{}, { puertaTras: eje - 0.1 }]) {
      const d = disposicion(carroceria, medidas, ajustes);
      const inicio = (carroceria === 'camioneta' ? d.platonDel : d.puertaTras) - 0.01;
      const m = muestrasDelGenerico(construirCarro({ carroceria, medidas, ajustes }), { paso: 0.03 });
      const id = m.nombres.indexOf('costado-der');
      let total = 0;
      let delante = 0;
      for (let i = 0; i < m.etiquetas.length; i++) {
        if (m.etiquetas[i] !== id) continue;
        total++;
        if (m.puntos[i * 3 + 2] < inicio) delante++;
      }
      assert.ok(total > 200, `${carroceria}: ${total} muestras`);
      assert.equal(delante, 0, `${carroceria} ${JSON.stringify(ajustes)}: ${delante} de ${total} muestras delante de la junta`);
    }
  }
});

test('cuando la junta cae encima del arco, el costado sigue el arco y deja libre el pase de rueda', () => {
  const medidas = { largo: 4.3, ancho: 1.8, alto: 1.6, entreEjes: 2.6 };
  const d = disposicion('suv', medidas);
  const m = muestrasDelGenerico(construirCarro({ carroceria: 'suv', medidas }), { paso: 0.03 });
  const id = m.nombres.indexOf('costado-der');
  let encima = 0;
  let adentro = 0;
  for (let i = 0; i < m.etiquetas.length; i++) {
    if (m.etiquetas[i] !== id) continue;
    const y = m.puntos[i * 3 + 1];
    const z = m.puntos[i * 3 + 2];
    if (z < d.puertaTras + 0.08 || z > d.ejeTras) continue;
    const alCentro = Math.hypot(z - d.ejeTras, y - d.radioRueda);
    if (alCentro > d.arco + 0.02) encima++;
    if (alCentro < d.arco - 0.02 && y > d.radioRueda + 0.02) adentro++;
  }
  assert.ok(encima > 20, `${encima} muestras encima del arco`);
  assert.equal(adentro, 0, `${adentro} muestras dentro del pase de rueda`);
});

test('con voladizo corto, el costado termina donde debe y no vuelve por dentro del pase de rueda', () => {
  // Un Picanto: el arco trasero sigue 17 cm después de donde termina el costado.
  const medidas = { largo: 3.595, ancho: 1.595, alto: 1.485, entreEjes: 2.4 };
  const eje = disposicion('hatchback', medidas).ejeTras;
  // De fábrica la junta cae sobre el arco; una leída antes del arco toma el otro camino del perfil.
  for (const ajustes of [{}, { puertaTras: eje - 0.5 }]) {
    const d = disposicion('hatchback', medidas, ajustes);
    assert.ok(d.ejeTras + d.arco > d.finCostado + 0.15, 'este carro tiene que ser de voladizo corto');
    const m = muestrasDelGenerico(construirCarro({ carroceria: 'hatchback', medidas, ajustes }), { paso: 0.03 });
    const id = m.nombres.indexOf('costado-der');
    let total = 0;
    let despues = 0;
    let adentro = 0;
    for (let i = 0; i < m.etiquetas.length; i++) {
      if (m.etiquetas[i] !== id) continue;
      total++;
      const y = m.puntos[i * 3 + 1];
      const z = m.puntos[i * 3 + 2];
      if (z > d.finCostado + 0.01) despues++;
      if (z > d.ejeTras && y > d.radioRueda + 0.02 && Math.hypot(z - d.ejeTras, y - d.radioRueda) < d.arco - 0.02) adentro++;
    }
    assert.ok(total > 200, `${total} muestras`);
    assert.equal(despues, 0, `${JSON.stringify(ajustes)}: ${despues} de ${total} muestras pasan del fin del costado`);
    assert.equal(adentro, 0, `${JSON.stringify(ajustes)}: ${adentro} de ${total} muestras dentro del pase de rueda`);
  }
});

test('con voladizo largo, el arco no se corta y el costado baja a ras hasta su fin', () => {
  const medidas = { largo: 5.33, ancho: 1.855, alto: 1.815, entreEjes: 3.085 };
  const d = disposicion('camioneta', medidas);
  assert.ok(d.ejeTras + d.arco < d.finCostado - 0.3, 'este carro tiene que ser de voladizo largo');
  const m = muestrasDelGenerico(construirCarro({ carroceria: 'camioneta', medidas }), { paso: 0.03 });
  const id = m.nombres.indexOf('costado-der');
  let enLaEsquina = 0;
  for (let i = 0; i < m.etiquetas.length; i++) {
    if (m.etiquetas[i] !== id) continue;
    if (m.puntos[i * 3 + 2] > d.finCostado - 0.1 && m.puntos[i * 3 + 1] < d.radioRueda + 0.1) enLaEsquina++;
  }
  assert.ok(enLaEsquina > 0, 'la esquina de abajo del costado desapareció');
});

test('en una pick-up, leer cada costado no le deja un escalón al techo', () => {
  // Un techo plano de lado a lado. Con la junta de atrás 20 cm más allá de un lado que del
  // otro, cada mitad del techo terminaba en un sitio distinto.
  const posiciones = [];
  const indices = [];
  const [nx, nz] = [70, 200];
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) posiciones.push(-0.7 + (1.4 * j) / nx, 1.8, -2.5 + (5 * i) / nz);
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < nx; j++) {
      const a = i * (nx + 1) + j;
      indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  }
  const base = { puertaDel: -0.72, puertaMedia: 0.37 };
  const previos = { ...base, puertaTras: 0.95, juntasLado: { der: { ...base, puertaTras: 0.85 }, izq: { ...base, puertaTras: 1.05 } } };
  const r = piezasDelEscaneo(new Float32Array(posiciones), 'camioneta', { largo: 5.3, ancho: 1.85, alto: 1.85 }, null, { indices: new Uint32Array(indices), previos });
  const techo = r.nombres.indexOf('techo');
  const finDe = (signo) => {
    let fin = -Infinity;
    for (let v = 0; v < r.etiquetas.length; v++) {
      if (r.etiquetas[v] !== techo) continue;
      const x = posiciones[v * 3] * signo;
      if (x > 0.05 && x < 0.5) fin = Math.max(fin, posiciones[v * 3 + 2]);
    }
    return fin;
  };
  assert.ok(finDe(1) > 0, 'no hay techo');
  assert.ok(Math.abs(finDe(1) - finDe(-1)) < 0.03, `el techo termina en ${finDe(1).toFixed(3)} a la derecha y en ${finDe(-1).toFixed(3)} a la izquierda`);
});

test('una pieza de costado sí sigue la junta de su costado', () => {
  const posiciones = [];
  const indices = [];
  const [ny, nz] = [20, 220];
  for (const x of [0.92, -0.92]) {
    const base = posiciones.length / 3;
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= ny; j++) posiciones.push(x, 0.55 + (0.3 * j) / ny, -2.2 + (4.4 * i) / nz);
    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < ny; j++) {
        const a = base + i * (ny + 1) + j;
        indices.push(a, a + ny + 1, a + 1, a + 1, a + ny + 1, a + ny + 2);
      }
    }
  }
  const base = { puertaDel: -0.72, puertaMedia: 0.1 };
  const previos = { ...base, puertaTras: 1.0, juntasLado: { der: { ...base, puertaTras: 0.9 }, izq: { ...base, puertaTras: 1.1 } } };
  const r = piezasDelEscaneo(new Float32Array(posiciones), 'suv', { largo: 4.4, ancho: 1.84, alto: 1.6 }, null, { indices: new Uint32Array(indices), previos });
  const finDe = (id, signo) => {
    const e = r.nombres.indexOf(id);
    let fin = -Infinity;
    for (let v = 0; v < r.etiquetas.length; v++) if (r.etiquetas[v] === e && posiciones[v * 3] * signo > 0) fin = Math.max(fin, posiciones[v * 3 + 2]);
    return fin;
  };
  assert.ok(Math.abs(finDe('puerta-tras-der', 1) - 0.9) < 0.06, `derecha ${finDe('puerta-tras-der', 1)}`);
  assert.ok(Math.abs(finDe('puerta-tras-izq', -1) - 1.1) < 0.06, `izquierda ${finDe('puerta-tras-izq', -1)}`);
});

test('la junta leída se corrige 12 cm al entrar y al salir de pick-up', () => {
  const escaneo = procesarEscaneo(carroDeCajas(), { carroceria: 'suv' });
  escaneo.ajustes = { ...escaneo.ajustes, puertaMedia: 0.3, puertaTras: 1.2, juntasLado: { der: { puertaDel: null, puertaMedia: 0.3, puertaTras: 1.25 }, izq: { puertaDel: null, puertaMedia: 0.3, puertaTras: 1.15 } } };
  const pickUp = reetiquetarEscaneo(escaneo, 'camioneta');
  assert.ok(Math.abs(pickUp.ajustes.puertaTras - 1.08) < 1e-9, `puerta ${pickUp.ajustes.puertaTras}`);
  assert.ok(Math.abs(pickUp.ajustes.juntasLado.der.puertaTras - 1.13) < 1e-9);
  assert.ok(Math.abs(pickUp.ajustes.juntasLado.izq.puertaTras - 1.03) < 1e-9);
  // La pared de la cabina cae donde estaba la raya.
  assert.ok(Math.abs(disposicion('camioneta', pickUp.medidasDibujo, pickUp.ajustes).cabinaTras - 1.2) < 1e-9);
  assert.equal(pickUp.ajustes.puertaMedia, 0.3, 'las demás juntas no cambian');
  const otraVez = reetiquetarEscaneo(pickUp, 'suv');
  assert.ok(Math.abs(otraVez.ajustes.puertaTras - 1.2) < 1e-9, `de vuelta ${otraVez.ajustes.puertaTras}`);
  assert.ok(Math.abs(otraVez.ajustes.juntasLado.der.puertaTras - 1.25) < 1e-9);
  // Entre las que no son pick-up no se toca.
  assert.equal(reetiquetarEscaneo(escaneo, 'hatchback').ajustes.puertaTras, 1.2);
});

test('en una pick-up, la luz cabina-platón es la raya de más atrás, aunque la puerta sea más oscura', () => {
  const previa = { ...PREVIA, tipo: 'camioneta' };
  for (const [puerta, luzCabina] of [[10, 90], [90, 10]]) {
    const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
      for (const u0 of [0, 0.5]) {
        raya(img, 0.35, u0);
        raya(img, 1.05, u0, { valor: puerta });
        raya(img, 1.28, u0, { valor: luzCabina });
      }
    });
    const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, previa);
    assert.ok(Math.abs(j.puertaTras - 1.16) < 0.02, `puerta ${puerta}, luz ${luzCabina}: trasera ${j.puertaTras}`);
    // Con traza se recorre todo: tiene que dar lo mismo.
    assert.deepEqual(puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, previa, []), j);
    // Sin junta del medio la ventana sale de otro lado: ahí también manda la de más atrás (la
    // más fuerte daba 0,935).
    const sinMedia = costadosConFoto((img) => {
      for (const u0 of [0, 0.5]) {
        raya(img, 1.05, u0, { valor: puerta });
        raya(img, 1.28, u0, { valor: luzCabina });
      }
    });
    const s = puertasDeLaFoto(sinMedia.posiciones, sinMedia.indices, sinMedia.uvs, sinMedia.luz, { largo: 4.4 }, previa);
    assert.equal(s.puertaMedia, undefined, 'esta prueba es sin junta del medio');
    assert.ok(Math.abs(s.puertaTras - 1.16) < 0.02, `sin junta del medio, puerta ${puerta}, luz ${luzCabina}: trasera ${s.puertaTras}`);
  }
});

test('con los dos costados oscuros, una junta clara y con pareja sí se lee', () => {
  const oscuro = (img) => {
    for (let i = 0; i < img.datos.length; i++) img.datos[i] = 30 + (i % 3);
  };
  const { posiciones, uvs, indices, luz } = costadosConFoto((img) => {
    oscuro(img);
    for (const z of [-0.8, 0.35, 1.2]) {
      raya(img, z, 0, { valor: 8 });
      raya(img, z, 0.5, { valor: 8 });
    }
  });
  const j = puertasDeLaFoto(posiciones, indices, uvs, luz, { largo: 4.4 }, PREVIA);
  assert.ok(Math.abs(j.puertaMedia - 0.35) < 0.015, JSON.stringify(j));
  assert.ok(Math.abs(j.puertaDel + 0.8) < 0.015, JSON.stringify(j));
  assert.ok(Math.abs(j.puertaTras - 1.2) < 0.015, JSON.stringify(j));
  // En lo oscuro una raya sola no manda, aunque el otro costado tampoco pueda opinar.
  const sola = costadosConFoto((img) => {
    oscuro(img);
    raya(img, 0.35, 0, { valor: 8 });
  });
  assert.deepEqual(puertasDeLaFoto(sola.posiciones, sola.indices, sola.uvs, sola.luz, { largo: 4.4 }, PREVIA), {});
});

test('con color por vértice y sin foto, la pieza marcada lleva velo y no se tiñe de gris', () => {
  const malla = carroDeCajas();
  const n = malla.posiciones.length / 3;
  const colores = new Uint8Array(n * 3);
  for (let v = 0; v < n; v++) colores.set([49, 115, 142], v * 3);
  const modelo = modeloDesdeEscaneo(procesarEscaneo({ ...malla, colores }, { carroceria: 'suv' }));
  const pieza = modelo.seleccionables[0];
  assert.equal(typeof pieza.userData.pintarVelo, 'function');
  const antes = pieza.material.color.getHex();
  resaltar(pieza, '#ff7a1a');
  assert.equal(pieza.material.color.getHex(), antes, 'la lata no se multiplica por el acento');
  const velo = modelo.grupo.getObjectByName('velo-' + pieza.userData.piezaId);
  assert.ok(velo && velo.visible);
  assert.equal(velo.material.defines.SIN_FOTO, 1);
  assert.equal(velo.material.uniforms.uColor.value.getHexString(), 'ff7a1a');
  resaltar(pieza, null);
  assert.equal(velo.visible, false);
  // Sin color por vértice el tinte funciona: la lata es de un color liso.
  const gris = modeloDesdeEscaneo(procesarEscaneo(malla, { carroceria: 'suv' })).seleccionables[0];
  assert.equal(gris.userData.pintarVelo, undefined);
});

function escaneoConColorYFoto() {
  const malla = carroDeCajas();
  const n = malla.posiciones.length / 3;
  const escaneo = procesarEscaneo({ ...malla, colores: new Uint8Array(n * 3).fill(120), uvs: new Float32Array(n * 2) }, { carroceria: 'suv' });
  return { ...escaneo, textura: { tipo: 'image/jpeg' } };
}

test('si la foto no abre, lo ya marcado pasa del tinte al velo, y al desmarcarlo no queda teñido', async () => {
  const escaneo = escaneoConColorYFoto();
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = () => Promise.reject(new Error('no cupo'));
  try {
    const modelo = modeloDesdeEscaneo(escaneo);
    const [marcada, sinMarcar] = modelo.seleccionables;
    const base = marcada.userData.colorBase.getHex();
    const veloDe = (malla) => modelo.grupo.getObjectByName('velo-' + malla.userData.piezaId);
    // El visor tiñe lo marcado apenas arma el modelo, sin saber todavía si la foto abre.
    resaltar(marcada, '#ff7a1a');
    assert.notEqual(marcada.material.color.getHex(), base);
    assert.equal(await modelo.texturaLista, null);
    assert.equal(marcada.material.color.getHex(), base, 'el tinte siguió sobre el color por vértice');
    assert.equal(marcada.material.emissive.getHex(), 0, 'siguió brillando');
    const velo = veloDe(marcada);
    assert.ok(velo && velo.visible, 'la lista la dice marcada y el carro no la muestra');
    assert.equal(velo.material.defines.SIN_FOTO, 1);
    assert.equal(velo.material.uniforms.uColor.value.getHexString(), 'ff7a1a');
    assert.ok(!veloDe(sinMarcar), 'lo que no estaba marcado no lleva velo');
    resaltar(marcada, null);
    assert.equal(velo.visible, false);
    assert.equal(marcada.material.color.getHex(), base, 'al desmarcarla quedó teñida');
    assert.equal(marcada.material.emissive.getHex(), 0, 'al desmarcarla quedó brillando');
    // Lo que se marque después también va con velo.
    resaltar(sinMarcar, '#ffd23f');
    assert.equal(sinMarcar.material.color.getHex(), sinMarcar.userData.colorBase.getHex());
    assert.ok(veloDe(sinMarcar).visible);
  } finally {
    globalThis.createImageBitmap = original;
  }
});

test('si el visor ya cambió de carro cuando la foto falla, no se arman velos para ese carro', async () => {
  const escaneo = escaneoConColorYFoto();
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = () => Promise.reject(new Error('no cupo'));
  try {
    const modelo = modeloDesdeEscaneo(escaneo);
    const pieza = modelo.seleccionables[0];
    resaltar(pieza, '#ff7a1a');
    modelo.soltado = true;
    await modelo.texturaLista;
    // Con assert.ok: al fallar, assert.equal imprimía la malla entera (35 s y sin memoria).
    assert.ok(!modelo.grupo.getObjectByName('velo-' + pieza.userData.piezaId), 'armó un velo para un carro que ya no está');
  } finally {
    globalThis.createImageBitmap = original;
  }
});

test('un navegador sin con qué abrir la foto también le pone velo a la pieza con color por vértice', async () => {
  const escaneo = escaneoConColorYFoto();
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = undefined;
  try {
    const modelo = modeloDesdeEscaneo(escaneo);
    const pieza = modelo.seleccionables[0];
    const base = pieza.userData.colorBase.getHex();
    resaltar(pieza, '#ff7a1a');
    assert.equal(pieza.material.color.getHex(), base, 'el acento se multiplicó por el color de la lata');
    const velo = modelo.grupo.getObjectByName('velo-' + pieza.userData.piezaId);
    assert.ok(velo && velo.visible);
    assert.equal(velo.material.defines.SIN_FOTO, 1);
    assert.equal(await modelo.texturaLista, null, 'el visor avisa que no hay foto');
  } finally {
    globalThis.createImageBitmap = original;
  }
});

test('un retazo de piso que no llega al 5 % también se bota, y no apaga los ejes', () => {
  const carro = carroDeCajas();
  const posiciones = Array.from(carro.posiciones);
  const indices = Array.from(carro.indices);
  // Una tira de 25 cm a lo largo de un costado, a la altura de las llantas.
  const base = posiciones.length / 3;
  const [nx, nz] = [6, 60];
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) posiciones.push(1.0 + (0.25 * j) / nx, 0, -2.2 + (4.4 * i) / nz);
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < nx; j++) {
      const a = base + i * (nx + 1) + j;
      indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  }
  const escaneo = procesarEscaneo({ posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices) }, { carroceria: 'suv' });
  let piso = 0;
  for (let v = 0; v < escaneo.posiciones.length / 3; v++) if (Math.abs(escaneo.posiciones[v * 3]) > escaneo.medidas.ancho / 2 + 0.05 && escaneo.posiciones[v * 3 + 1] < 0.03) piso++;
  assert.equal(piso, 0, `${piso} vértices de piso`);
  assert.ok(Number.isFinite(escaneo.ajustes.ejeDel) && Number.isFinite(escaneo.ajustes.ejeTras), JSON.stringify(escaneo.ajustes));
});

// Una lámina de n × n vértices, cada uno con un milésimo de metro cuadrado.
function laminaConArea(n = 20) {
  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  return { indices: new Uint32Array(indices), etiquetas: new Uint8Array(n * n).fill(1), area: new Float64Array(n * n).fill(0.001) };
}

test('las pecas se miden en área: una pieza grande y rala se queda, y un pedacito tupido se va', () => {
  const n = 20;
  const { indices, etiquetas, area } = laminaConArea(n);
  // La pieza 2: cuatro vértices ralos, 0,08 m².
  for (let i = 2; i < 4; i++) {
    for (let j = 2; j < 4; j++) {
      etiquetas[i * n + j] = 2;
      area[i * n + j] = 0.02;
    }
  }
  // La pieza 3: 25 vértices que suman 0,025 m², y otros cuatro sueltos que suman 0,004.
  for (let i = 10; i < 15; i++) for (let j = 10; j < 15; j++) etiquetas[i * n + j] = 3;
  for (let i = 16; i < 18; i++) for (let j = 2; j < 4; j++) etiquetas[i * n + j] = 3;
  const limpias = quitarIslas(indices, etiquetas, 0.024, 0.24, area);
  assert.equal(limpias[2 * n + 2], 2, 'la pieza rala se queda');
  assert.equal(limpias[12 * n + 12], 3);
  assert.equal(limpias[16 * n + 2], 1, 'el pedacito se va, aunque tenga más vértices que la rala');
});

test('el pedazo mayor de una pieza se queda aunque sea chico: esto quita pedacitos, no piezas', () => {
  const n = 20;
  const { indices, etiquetas, area } = laminaConArea(n);
  // La pieza 2: dos pedazos, de 0,009 y de 0,001 m². La 3: uno solo, de 0,002 m².
  for (let i = 2; i < 5; i++) for (let j = 2; j < 5; j++) etiquetas[i * n + j] = 2;
  etiquetas[15 * n + 15] = 2;
  etiquetas[10 * n + 10] = 3;
  etiquetas[10 * n + 11] = 3;
  const limpias = quitarIslas(indices, etiquetas, 0.024, 0.24, area);
  assert.equal(limpias[3 * n + 3], 2, 'un espejo no da para más: se queda');
  assert.equal(limpias[15 * n + 15], 1, 'el pedacito suelto de la misma pieza se va');
  assert.equal(limpias[10 * n + 10], 1, 'por debajo del mínimo no es una pieza, es una peca');
});

test('una malla que gasta los vértices en otro lado no pierde la lata de los costados', () => {
  // Costados con vértices cada 7 cm; el techo, cada 1,5 cm.
  const posiciones = [];
  const indices = [];
  const lamina = (origen, u, v, nu, nv) => {
    const base = posiciones.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) posiciones.push(origen[0] + (u[0] * i) / nu + (v[0] * j) / nv, origen[1] + (u[1] * i) / nu + (v[1] * j) / nv, origen[2] + (u[2] * i) / nu + (v[2] * j) / nv);
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j;
        indices.push(a, a + nv + 1, a + 1, a + 1, a + nv + 1, a + nv + 2);
      }
    }
  };
  lamina([-0.92, 1.4, -2.2], [1.84, 0, 0], [0, 0, 4.4], 120, 290);
  for (const x of [0.92, -0.92]) lamina([x, 0.3, -2.2], [0, 0, 4.4], [0, 1.1, 0], 63, 16);
  const r = piezasDelEscaneo(new Float32Array(posiciones), 'suv', { largo: 4.4, ancho: 1.84, alto: 1.45 }, null, { indices: new Uint32Array(indices) });
  for (const id of ['guardafango-del-der', 'guardafango-del-izq', 'costado-der', 'costado-izq']) {
    assert.ok(r.etiquetas.includes(r.nombres.indexOf(id)), `se perdió ${id}`);
  }
});

// Un carro de cajas con foto: la pintura de color hasta 0,75 m, y tres juntas en los dos costados.
function carroConFoto() {
  const malla = carroDeCajas();
  const P = malla.posiciones;
  const n = P.length / 3;
  const uvs = new Float32Array(n * 2);
  const colores = new Uint8Array(n * 3);
  const uDe = (x, z) => (x > 0 ? 0 : 0.5) + (0.5 * (z + 2.4)) / 4.8;
  for (let v = 0; v < n; v++) {
    uvs[v * 2] = uDe(P[v * 3], P[v * 3 + 2]);
    uvs[v * 2 + 1] = 1 - P[v * 3 + 1] / 1.5;
    colores.set(P[v * 3 + 1] < 0.75 ? [170, 32, 40] : [28, 30, 34], v * 3);
  }
  const luz = { ancho: 2000, alto: 500, datos: new Uint8Array(2000 * 500) };
  let semilla = 7;
  for (let i = 0; i < luz.datos.length; i++) {
    semilla = (semilla * 16807) % 2147483647;
    luz.datos[i] = 150 + (semilla % 7);
  }
  for (const z of [-0.8, 0.35, 1.2]) {
    for (const x of [0.9, -0.9]) {
      const c = Math.round(uDe(x, z) * 2000);
      for (let y = 0; y < 500; y++) for (let k = c - 2; k <= c + 2; k++) luz.datos[y * 2000 + k] = 40;
    }
  }
  return { ...malla, uvs, colores, luz };
}

test('las juntas y la cintura no cambian porque el archivo pase del tope de triángulos', () => {
  const { luz, ...malla } = carroConFoto();
  const completa = procesarEscaneo(malla, { carroceria: 'suv', luz });
  assert.ok(Number.isFinite(completa.ajustes.cintura) && completa.ajustes.juntasLado, JSON.stringify(completa.ajustes));
  for (const tope of [6000, 4000]) {
    const conTope = procesarEscaneo(malla, { carroceria: 'suv', luz, maximoTriangulos: tope });
    assert.ok(conTope.indices.length / 3 <= tope, `${conTope.indices.length / 3} triángulos`);
    for (const k of ['cintura', 'puertaDel', 'puertaMedia', 'puertaTras', 'juntasLado']) assert.deepEqual(conTope.ajustes[k], completa.ajustes[k], `${k} con tope ${tope}`);
    // Y cuando la persona corrige la carrocería: la cintura no vuelve a ser la de la rejilla.
    assert.equal(reetiquetarEscaneo(conTope, 'hatchback').ajustes.cintura, completa.ajustes.cintura);
  }
});

test('las piezas usan las lecturas que les den, sin volver a leer la malla', () => {
  const { luz, ...malla } = carroConFoto();
  const e = procesarEscaneo(malla, { carroceria: 'suv', luz });
  const lecturas = { ...e.ajustes, cintura: 0.66, puertaMedia: 0.2, juntasLado: undefined };
  const r = piezasDelEscaneo(e.posiciones, 'suv', e.medidas, null, { indices: e.indices, colores: e.colores, uvs: e.uvs, luz, lecturas });
  assert.equal(r.ajustes.cintura, 0.66);
  assert.equal(r.ajustes.puertaMedia, 0.2);
  assert.notEqual(r.ajustes, lecturas, 'una copia: lo de abajo le agrega cosas');
});
