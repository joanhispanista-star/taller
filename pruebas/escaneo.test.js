// El carro escaneado, sin celular: los escaneos de aquí se fabrican con el
// carro paramétrico (carro.js), cuyas medidas se conocen, girado y corrido
// a propósito, con piso, ruido y un estorbo al lado; y la fusión de
// profundidad con una caja de carro vista como la ve ARCore. Si la tubería
// (fusión, malla, piso, aislar, orientar, medir, piezas) se equivoca en
// algo, aquí se nota en centímetros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import {
  aislarCarro,
  crearTSDF,
  estimarPiso,
  mallaDesdePuntos,
  mallaDesdeTSDF,
  modeloDesdeEscaneo,
  muestrasDelGenerico,
  orientarCarro,
  muestrearMalla,
  procesarEscaneo,
  puntoDesdeProfundidad,
  reetiquetarEscaneo,
  puntosDeCuadro,
  transformar,
} from '../js/escaneo.js';

// Una Duster: SUV de 4,34 × 1,80 × 1,69 m, 2,67 m entre ejes.
const MEDIDAS = { largo: 4.34, ancho: 1.8, alto: 1.69, entreEjes: 2.67 };

// Números al azar con semilla: las pruebas dan lo mismo siempre.
function azar(semilla = 7) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Puntos de la superficie de afuera del carro (con vidrios y llantas), uno
// cada 3 cm, con ruido; un piso alrededor; y un estorbo (una caja de
// 1 × 1,5 × 0,5 m a un metro del carro, como una mesa de herramientas).
function nubeDeMentira({ carroceria = 'suv', medidas = MEDIDAS, ruido = 0.01, giro = 0.6, corrido = [2.3, 0, -1.4], piso = -0.12 } = {}) {
  const r = azar();
  const carro = construirCarro({ carroceria, medidas });
  const muestras = muestrasDelGenerico(carro, { paso: 0.03 });
  const puntos = [];
  // De qué pieza vino cada punto del carro ('' el piso y el estorbo).
  const pieza = [];
  for (let i = 0; i < muestras.puntos.length; i += 3) {
    puntos.push(muestras.puntos[i] + (r() - 0.5) * 2 * ruido, muestras.puntos[i + 1] + (r() - 0.5) * 2 * ruido, muestras.puntos[i + 2] + (r() - 0.5) * 2 * ruido);
    pieza.push(muestras.nombres[muestras.etiquetas[i / 3]]);
  }
  for (let x = -3.2; x <= 3.2; x += 0.06) {
    for (let z = -3.4; z <= 3.4; z += 0.06) puntos.push(x + (r() - 0.5) * 0.02, (r() - 0.5) * 2 * ruido, z + (r() - 0.5) * 0.02);
  }
  for (let k = 0; k < 4000; k++) puntos.push(2.1 + r() * 1.0, r() * 1.5, -0.25 + r() * 0.5);
  // Girar y correr todo (el carro no queda alineado con nada), y bajar el piso.
  const m = new THREE.Matrix4().makeRotationY(giro).setPosition(corrido[0], piso, corrido[2]);
  return { posiciones: transformar(new Float32Array(puntos), m), carro, pieza };
}

// Dónde quedó, tras orientar, el centro de los puntos que vinieron de una pieza.
function centroDePieza(enCarro, pieza, id) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < pieza.length; i++) {
    if (pieza[i] !== id) continue;
    sx += enCarro[i * 3];
    sy += enCarro[i * 3 + 1];
    sz += enCarro[i * 3 + 2];
    n++;
  }
  return { x: sx / n, y: sy / n, z: sz / n, n };
}

// La nube de mentira de la SUV hecha malla y pasada por la tubería entera,
// una sola vez para las tres pruebas que la usan (son unos segundos).
let procesada = null;
function escaneoDePuntos() {
  if (!procesada) {
    const { posiciones } = nubeDeMentira({ ruido: 0.008 });
    const malla = mallaDesdePuntos(posiciones, { voxel: 0.03 });
    procesada = { malla, escaneo: procesarEscaneo(malla, { carroceria: 'suv', medidasCatalogo: MEDIDAS, puntos: posiciones }) };
  }
  return procesada;
}

// Lo que mide de verdad el carro dibujado, visto por un sensor.
function medidasDelDibujo(carroceria, medidas) {
  // Sin los adornos (las barras del techo de la SUV no entran en el
  // escaneo de mentira: se muestrea la chapa, como la vería un sensor).
  const carro = construirCarro({ carroceria, medidas });
  const caja = new THREE.Box3();
  carro.grupo.traverse((o) => {
    if (o.isMesh && !o.userData.decorativo && o.name !== 'interior') caja.expandByObject(o);
  });
  // El largo, de bómper a bómper (el del catálogo: la medida toma la cara
  // de cada punta, no la placa que sobresale 2 cm); el ancho, el de la
  // carrocería sin espejos (el del catálogo); el alto, el de la chapa vista.
  return { largo: medidas.largo, ancho: medidas.ancho, alto: caja.max.y };
}

test('puntoDesdeProfundidad devuelve el punto del mundo que la cámara vio a esa profundidad', () => {
  const camara = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 20);
  camara.position.set(1.2, 1.4, 3);
  camara.lookAt(0.3, 0.8, 0);
  camara.updateMatrixWorld(true);
  const inv = camara.projectionMatrixInverse.elements;
  const vista = camara.matrixWorld.elements;
  for (const objetivo of [new THREE.Vector3(0.3, 0.8, 0), new THREE.Vector3(-0.4, 1.1, 0.5), new THREE.Vector3(1.0, 0.2, -0.6)]) {
    const enCamara = objetivo.clone().applyMatrix4(camara.matrixWorldInverse);
    const ndc = objetivo.clone().project(camara);
    const u = (ndc.x + 1) / 2;
    const v = 1 - (ndc.y + 1) / 2;
    const p = puntoDesdeProfundidad(u, v, -enCamara.z, inv, vista, [0, 0, 0]);
    assert.ok(Math.hypot(p[0] - objetivo.x, p[1] - objetivo.y, p[2] - objetivo.z) < 1e-4, JSON.stringify(p));
  }
});

test('puntosDeCuadro (la vía rápida del celular) da los mismos puntos que puntoDesdeProfundidad, y descarta lo muy cerca o muy lejos', () => {
  const camara = new THREE.PerspectiveCamera(65, 4 / 3, 0.05, 20);
  camara.position.set(-0.8, 1.3, 2.4);
  camara.lookAt(0, 0.7, 0);
  camara.updateMatrixWorld(true);
  const P = camara.projectionMatrix.elements;
  const M = camara.matrixWorld.elements;
  // Una "pared" a profundidad variable; y un cuadrito sin dato (0) y otro lejísimos.
  const profundidad = (u, v) => (u < 0.1 && v < 0.1 ? 0 : u > 0.9 && v > 0.9 ? 9 : 1.5 + u * 0.8 + v * 0.3);
  const puntos = puntosDeCuadro(profundidad, P, M, { columnas: 20, filas: 15 });
  const esperados = [];
  const inv = camara.projectionMatrixInverse.elements;
  for (let j = 0; j < 15; j++) {
    for (let i = 0; i < 20; i++) {
      const u = (i + 0.5) / 20;
      const v = (j + 0.5) / 15;
      const z = profundidad(u, v);
      if (!(z > 0.3 && z < 4)) continue;
      esperados.push(...puntoDesdeProfundidad(u, v, z, inv, M, [0, 0, 0]));
    }
  }
  assert.equal(puntos.length, esperados.length);
  assert.ok(puntos.length < 20 * 15 * 3, 'descartó los sin dato y los lejanos');
  for (let k = 0; k < puntos.length; k++) assert.ok(Math.abs(puntos[k] - esperados[k]) < 1e-4, 'punto ' + k);
});

test('el piso, el carro y el estorbo: el piso sale a su altura y el estorbo queda fuera', () => {
  const { posiciones } = nubeDeMentira();
  const piso = estimarPiso(posiciones);
  assert.ok(Math.abs(piso - -0.12) < 0.02, 'piso ' + piso.toFixed(3));
  const mascara = aislarCarro(posiciones, { piso });
  const n = posiciones.length / 3;
  let delEstorbo = 0;
  for (let i = n - 4000; i < n; i++) delEstorbo += mascara[i];
  assert.ok(delEstorbo < 40, 'del estorbo entraron ' + delEstorbo);
  let delCarro = 0;
  for (let i = 0; i < n - 4000; i++) delCarro += mascara[i];
  assert.ok(delCarro > 20000, 'del carro quedaron ' + delCarro);
});

test('orientar: largo a 4 cm, ancho y alto a 3 cm, el frente hacia -Z y la izquierda en -X', () => {
  for (const [carroceria, medidas] of [
    ['suv', MEDIDAS],
    ['sedan', { largo: 4.36, ancho: 1.73, alto: 1.52, entreEjes: 2.63 }],
    ['camioneta', { largo: 5.3, ancho: 1.86, alto: 1.82, entreEjes: 3.08 }],
  ]) {
    const { posiciones } = nubeDeMentira({ carroceria, medidas, giro: 2.2 });
    const piso = estimarPiso(posiciones);
    const mascara = aislarCarro(posiciones, { piso });
    const o = orientarCarro(posiciones, mascara, { piso, carroceria });
    const real = medidasDelDibujo(carroceria, medidas);
    // El largo, a 4 cm: el recorte de las puntas (0,2 % de los puntos en cada
    // una, para que una punta suelta no infle el largo) se come parte de una
    // cara chica como el bómper trasero de la camioneta.
    assert.ok(Math.abs(o.medidas.largo - real.largo) < 0.04, carroceria + ' largo ' + o.medidas.largo.toFixed(3) + ' de ' + real.largo.toFixed(3));
    assert.ok(Math.abs(o.medidas.ancho - real.ancho) < 0.03, carroceria + ' ancho ' + o.medidas.ancho.toFixed(3) + ' de ' + real.ancho.toFixed(3));
    assert.ok(Math.abs(o.medidas.alto - real.alto) < 0.03, carroceria + ' alto ' + o.medidas.alto.toFixed(3) + ' de ' + real.alto.toFixed(3));
    // Llevado al marco del carro, lo más adelantado del escaneo (menor z)
    // debe ser el bómper (bajo), no el techo: si el frente saliera al
    // revés, las piezas se pintarían donde no van.
    const enCarro = transformar(posiciones, o.matriz);
    let zMin = Infinity;
    let yEnZMin = 0;
    for (let i = 0; i < mascara.length; i++) {
      if (!mascara[i]) continue;
      if (enCarro[i * 3 + 2] < zMin) {
        zMin = enCarro[i * 3 + 2];
        yEnZMin = enCarro[i * 3 + 1];
      }
    }
    assert.ok(yEnZMin < 0.9, carroceria + ': lo más adelantado está a ' + yEnZMin.toFixed(2) + ' m de altura');
    // Y el capó del genérico (adelante) queda en -Z: sin eso la prueba de
    // arriba no diría nada.
    const capo = new THREE.Box3().setFromObject(construirCarro({ carroceria, medidas }).porId.get('capo')).getCenter(new THREE.Vector3());
    assert.ok(capo.z < 0, 'el genérico mira a -Z');
  }
});

test('el frente sale adelante y la izquierda a la izquierda en las cuatro carrocerías, gire como gire', () => {
  // La prueba que faltaba (revisión del 22-oct-2026): la camioneta salía
  // SIEMPRE al revés y la prueba de arriba no lo veía, porque las dos puntas
  // de una camioneta son bajas. Aquí se mira dónde quedan el capó y el
  // espejo izquierdo de verdad.
  const carrocerias = [
    ['sedan', { largo: 4.36, ancho: 1.73, alto: 1.52, entreEjes: 2.63 }],
    ['hatchback', { largo: 3.98, ancho: 1.73, alto: 1.5, entreEjes: 2.55 }],
    ['suv', MEDIDAS],
    ['camioneta', { largo: 5.33, ancho: 1.86, alto: 1.82, entreEjes: 3.08 }],
  ];
  for (const [carroceria, medidas] of carrocerias) {
    for (const giro of [0.6, 2.2, -1.1]) {
      const { posiciones, pieza } = nubeDeMentira({ carroceria, medidas, giro });
      const piso = estimarPiso(posiciones);
      const mascara = aislarCarro(posiciones, { piso });
      const o = orientarCarro(posiciones, mascara, { piso, carroceria });
      const enCarro = transformar(posiciones, o.matriz);
      const capo = centroDePieza(enCarro, pieza, 'capo');
      const espejo = centroDePieza(enCarro, pieza, 'espejo-izq');
      assert.ok(capo.z < -0.5, carroceria + ' (giro ' + giro + '): el capó quedó en z = ' + capo.z.toFixed(2));
      assert.ok(espejo.x < -0.5, carroceria + ' (giro ' + giro + '): el espejo izquierdo quedó en x = ' + espejo.x.toFixed(2));
    }
  }
});

test('orientar no refleja: el espejo izquierdo del escaneo queda en -X', () => {
  const { posiciones, carro } = nubeDeMentira({ giro: -1.1 });
  const espejo = new THREE.Box3().setFromObject(carro.porId.get('espejo-izq')).expandByScalar(0.02);
  const inversa = new THREE.Matrix4().makeRotationY(-1.1).setPosition(2.3, -0.12, -1.4).invert();
  const piso = estimarPiso(posiciones);
  const mascara = aislarCarro(posiciones, { piso });
  const o = orientarCarro(posiciones, mascara, { piso, carroceria: 'suv' });
  const enCarro = transformar(posiciones, o.matriz);
  const p = new THREE.Vector3();
  let suma = 0;
  let n = 0;
  for (let i = 0; i < mascara.length; i++) {
    p.set(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]).applyMatrix4(inversa);
    if (espejo.containsPoint(p)) {
      suma += enCarro[i * 3];
      n++;
    }
  }
  assert.ok(n > 10, 'puntos del espejo: ' + n);
  assert.ok(suma / n < -0.8, 'el espejo izquierdo quedó en x = ' + (suma / n).toFixed(2));
});

test('aguanta un escaneo malo: 4 cm de ruido y uno de cada cinco puntos "reflejado" 20-50 cm detrás de la chapa', () => {
  // Lo que se espera de la profundidad suavizada de ARCore sobre pintura
  // brillante y vidrios (investigación del 22-oct-2026): ruido de varios
  // centímetros y profundidad inventada detrás de la superficie.
  const r = azar(21);
  const { posiciones } = nubeDeMentira({ ruido: 0 });
  const n = posiciones.length / 3;
  const malo = new Float32Array(posiciones.length);
  // Ruido gaussiano (Box-Muller) de 4 cm; y el 20 % de los puntos se hunde
  // hacia el centro del carro (lo que está "detrás" de la chapa).
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  // El centro del carro en el marco girado de la nube: (2,3; -0,12; -1,4) + el giro no lo mueve.
  const cx = 2.3;
  const cz = -1.4;
  for (let i = 0; i < n; i++) {
    let x = posiciones[i * 3];
    let y = posiciones[i * 3 + 1];
    let z = posiciones[i * 3 + 2];
    const esPiso = Math.abs(y + 0.12) < 0.02;
    if (!esPiso) {
      if (r() < 0.2) {
        const hacia = [cx - x, 0.6 - y, cz - z];
        const l = Math.hypot(...hacia);
        const k = (0.2 + r() * 0.3) / l;
        x += hacia[0] * k;
        y += hacia[1] * k;
        z += hacia[2] * k;
      }
      x += gauss() * 0.04;
      y += gauss() * 0.04;
      z += gauss() * 0.04;
    }
    malo[i * 3] = x;
    malo[i * 3 + 1] = y;
    malo[i * 3 + 2] = z;
  }
  const piso = estimarPiso(malo);
  const mascara = aislarCarro(malo, { piso });
  const o = orientarCarro(malo, mascara, { piso, carroceria: 'suv' });
  const real = medidasDelDibujo('suv', MEDIDAS);
  // Con un escaneo así no se promete más que ±10 cm (lo que dice la pantalla).
  assert.ok(Math.abs(o.medidas.largo - real.largo) < 0.1, 'largo ' + o.medidas.largo.toFixed(3));
  assert.ok(Math.abs(o.medidas.ancho - real.ancho) < 0.1, 'ancho ' + o.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(o.medidas.alto - real.alto) < 0.1, 'alto ' + o.medidas.alto.toFixed(3));
  // Y el frente sigue adelante.
  const enCarro = transformar(malo, o.matriz);
  let zMin = Infinity;
  let yEnZMin = 0;
  for (let i = 0; i < n; i++) {
    if (!mascara[i]) continue;
    if (enCarro[i * 3 + 2] < zMin) {
      zMin = enCarro[i * 3 + 2];
      yEnZMin = enCarro[i * 3 + 1];
    }
  }
  assert.ok(yEnZMin < 1.0, 'lo más adelantado está a ' + yEnZMin.toFixed(2) + ' m');
});

test('reetiquetarEscaneo pone las piezas de otra carrocería sobre la misma malla', () => {
  const e = escaneoDePuntos().escaneo;
  const como = reetiquetarEscaneo(e, 'sedan');
  assert.equal(como.carroceria, 'sedan');
  assert.equal(como.posiciones, e.posiciones, 'la malla no cambia');
  assert.equal(e.carroceria, 'suv', 'el original no se toca');
  const k = como.nombres.indexOf('capo');
  let z = 0;
  let n = 0;
  for (let v = 0; v < como.etiquetas.length; v++) {
    if (como.etiquetas[v] !== k) continue;
    z += como.posiciones[v * 3 + 2];
    n++;
  }
  assert.ok(n > 100 && z / n < -0.5, 'el capó sigue adelante');
});

test('muestrearMalla reparte por área, no por triángulo, y respeta el máximo', () => {
  // Dos triángulos: uno con el triple de área que el otro, y el chico partido
  // en 300 triangulitos (una malla fina en un lado): las muestras siguen al área.
  const posiciones = [0, 0, 0, 3, 0, 0, 0, 0, 2];
  const indices = [0, 1, 2];
  for (let i = 0; i < 300; i++) {
    const x0 = 10 + (i % 30) * 0.1;
    const z0 = Math.floor(i / 30) * 0.2;
    const b = posiciones.length / 3;
    posiciones.push(x0, 0, z0, x0 + 0.1, 0, z0, x0, 0, z0 + 0.2 * (1 / 1));
    indices.push(b, b + 1, b + 2);
  }
  const p = new Float32Array(posiciones);
  const ind = new Uint32Array(indices);
  const muestras = muestrearMalla({ posiciones: p, indices: ind }, { paso: 0.05 });
  let enGrande = 0;
  let enChicos = 0;
  for (let i = 0; i < muestras.length; i += 3) (muestras[i] < 5 ? enGrande++ : enChicos++);
  // Área: el grande 3 m², los chicos 300 × 0,01 = 3 m²... el grande es igual
  // en área a todos los chicos juntos: las muestras deben repartirse ~50/50.
  assert.ok(Math.abs(enGrande / (enGrande + enChicos) - 0.5) < 0.05, enGrande + ' / ' + enChicos);
  const pocas = muestrearMalla({ posiciones: p, indices: ind }, { paso: 0.01, maximo: 1000 });
  assert.ok(pocas.length / 3 <= 1100, 'muestras: ' + pocas.length / 3);
});

test('voltear lo gira 180° y las medidas no cambian', () => {
  const { posiciones } = nubeDeMentira();
  const piso = estimarPiso(posiciones);
  const mascara = aislarCarro(posiciones, { piso });
  const a = orientarCarro(posiciones, mascara, { piso, carroceria: 'suv' });
  const b = orientarCarro(posiciones, mascara, { piso, carroceria: 'suv', voltear: true });
  assert.notEqual(a.frenteHaciaMasU, b.frenteHaciaMasU);
  assert.ok(Math.abs(a.medidas.largo - b.medidas.largo) < 1e-9);
  const pa = transformar(posiciones.slice(0, 3), a.matriz);
  const pb = transformar(posiciones.slice(0, 3), b.matriz);
  assert.ok(Math.abs(pa[0] + pb[0]) < 1e-4 && Math.abs(pa[2] + pb[2]) < 1e-4 && Math.abs(pa[1] - pb[1]) < 1e-4);
});

test('una nube de puntos importada se vuelve malla, y la tubería entera da medidas y piezas', () => {
  const { malla, escaneo } = escaneoDePuntos();
  assert.ok(malla.indices.length / 3 > 20000, 'triángulos ' + malla.indices.length / 3);
  const real = medidasDelDibujo('suv', MEDIDAS);
  // Las medidas salen de los puntos, no de la cáscara: 3 cm.
  assert.ok(Math.abs(escaneo.medidas.largo - real.largo) < 0.03, 'largo ' + escaneo.medidas.largo.toFixed(3));
  assert.ok(Math.abs(escaneo.medidas.ancho - real.ancho) < 0.03, 'ancho ' + escaneo.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(escaneo.medidas.alto - real.alto) < 0.03, 'alto ' + escaneo.medidas.alto.toFixed(3));
  const presentes = new Set();
  for (const e of escaneo.etiquetas) presentes.add(escaneo.nombres[e]);
  for (const id of ['capo', 'techo', 'baul', 'bomper-del', 'bomper-tras', 'puerta-del-izq', 'puerta-del-der', 'puerta-tras-izq', 'puerta-tras-der', 'guardafango-del-izq', 'costado-der']) {
    assert.ok(presentes.has(id), 'falta ' + id);
  }
});

test('las piezas caen donde van: el capó adelante y arriba, la puerta delantera izquierda en -X', () => {
  const e = escaneoDePuntos().escaneo;
  const centro = (id) => {
    const k = e.nombres.indexOf(id);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let v = 0; v < e.etiquetas.length; v++) {
      if (e.etiquetas[v] !== k) continue;
      sx += e.posiciones[v * 3];
      sy += e.posiciones[v * 3 + 1];
      sz += e.posiciones[v * 3 + 2];
      n++;
    }
    return { x: sx / n, y: sy / n, z: sz / n, n };
  };
  const capo = centro('capo');
  assert.ok(capo.z < -0.8 && capo.y > 0.8 && Math.abs(capo.x) < 0.2, 'capó en ' + JSON.stringify(capo));
  const puerta = centro('puerta-del-izq');
  assert.ok(puerta.x < -0.7 && Math.abs(puerta.z) < 1.0, 'puerta del. izq. en ' + JSON.stringify(puerta));
  const bomperTras = centro('bomper-tras');
  assert.ok(bomperTras.z > 1.7, 'bómper trasero en z = ' + bomperTras.z.toFixed(2));
});

test('el modelo del escaneo cumple el contrato del visor: una malla por pieza, y las de adentro marcables', () => {
  const e = escaneoDePuntos().escaneo;
  const modelo = modeloDesdeEscaneo(e, { colorBase: 0xaa3322 });
  assert.equal(modelo.escaneado, true);
  assert.ok(modelo.seleccionables.length >= 15, 'piezas con malla: ' + modelo.seleccionables.length);
  for (const malla of modelo.seleccionables) {
    assert.equal(malla.userData.piezaId, malla.name);
    assert.ok(malla.userData.colorBase, 'colorBase de ' + malla.name);
    assert.equal(malla.parent, modelo.grupo);
  }
  // Las 29 piezas se pueden marcar (las de adentro vienen del genérico).
  assert.equal(modelo.porId.size, 29);
  assert.ok(modelo.porId.has('vano-motor') && modelo.porId.get('vano-motor').parent !== modelo.grupo);
  assert.ok(Math.abs(modelo.disposicion.largo - e.medidas.largo) < 1e-9);
  // Un rayo desde la izquierda a media altura toca una pieza del lado izquierdo.
  const rayo = new THREE.Raycaster(new THREE.Vector3(-4, 0.75, -0.3), new THREE.Vector3(1, 0, 0));
  const cruce = rayo.intersectObject(modelo.grupo, true)[0];
  assert.ok(cruce && /-izq$/.test(cruce.object.userData.piezaId || ''), 'el rayo tocó ' + (cruce && cruce.object.name));
});

test('la fusión de profundidad: cuadros densos alrededor de una caja de carro dan su forma y sus medidas', () => {
  // Una "carrocería" de 4,30 × 1,80 × 1,60 m sobre el piso, girada y
  // corrida, vista como la ve ARCore: 100 × 75 profundidades por cuadro (a
  // 2-3 m, un rayo cada 1,5 cm), 1 cm de ruido, dando la vuelta a dos
  // alturas. Los rayos se calculan a mano (caja y piso), sin raycaster: lo
  // que importa aquí es que sean densos, y con el raycaster serían minutos.
  const L = 4.3;
  const W = 1.8;
  const H = 1.6;
  const giro = 0.5;
  const centro = new THREE.Vector3(0.4, 0, -0.3);
  const aLocal = new THREE.Matrix4().makeRotationY(-giro).multiply(new THREE.Matrix4().makeTranslation(-centro.x, 0, -centro.z));
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const pisoEn = (origen, direccion) => (direccion.y < -1e-6 ? -origen.y / direccion.y : null);
  function cruzar(origen, direccion) {
    // La caja en su marco: x en ±W/2, y en 0..H, z en ±L/2.
    o.copy(origen).applyMatrix4(aLocal);
    d.copy(direccion).transformDirection(aLocal);
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [oi, di, lo, hi] of [[o.x, d.x, -W / 2, W / 2], [o.y, d.y, 0, H], [o.z, d.z, -L / 2, L / 2]]) {
      if (Math.abs(di) < 1e-9) {
        if (oi < lo || oi > hi) return pisoEn(origen, direccion);
        continue;
      }
      let a = (lo - oi) / di;
      let b = (hi - oi) / di;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t0 <= t1 && t0 > 0) return t0;
    return pisoEn(origen, direccion);
  }
  const r = azar(5);
  const tsdf = crearTSDF({ voxel: 0.03 });
  const camara = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 10);
  const dir = new THREE.Vector3();
  const salida = [0, 0, 0];
  // Una vuelta con el celular levantado (1,9 m, para ver el techo: a 1,5 m
  // el techo de una caja de 1,6 m no se ve y el alto sale 5 cm corto) y
  // otra a la altura de la cintura.
  for (const [alto, radio] of [[1.9, 3.3], [0.8, 3.0]]) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      camara.position.set(centro.x + Math.sin(a) * radio * 0.8, alto, centro.z + Math.cos(a) * radio * 1.1);
      camara.lookAt(centro.x, 0.6, centro.z);
      camara.updateMatrixWorld(true);
      const inv = camara.projectionMatrixInverse.elements;
      const puntos = [];
      for (let j = 0; j < 75; j++) {
        for (let i = 0; i < 100; i++) {
          const u = (i + 0.5) / 100;
          const v = (j + 0.5) / 75;
          dir.set(u * 2 - 1, -(v * 2 - 1), 0.5).unproject(camara).sub(camara.position).normalize();
          const t = cruzar(camara.position, dir);
          if (t === null || t > 6) continue;
          const punto = camara.position.clone().addScaledVector(dir, t).applyMatrix4(camara.matrixWorldInverse);
          puntoDesdeProfundidad(u, v, -punto.z + (r() - 0.5) * 0.02, inv, camara.matrixWorld.elements, salida);
          puntos.push(...salida);
        }
      }
      tsdf.integrar([camara.position.x, camara.position.y, camara.position.z], new Float32Array(puntos));
    }
  }
  assert.ok(!tsdf.lleno && tsdf.megabytes < 25, tsdf.bloques + ' bloques, ' + tsdf.megabytes.toFixed(1) + ' MB');
  const superficie = tsdf.puntosDeSuperficie();
  const pisoEstimado = estimarPiso(superficie);
  assert.ok(Math.abs(pisoEstimado) < 0.03, 'piso ' + pisoEstimado.toFixed(3));
  const mascara = aislarCarro(superficie, { piso: pisoEstimado });
  const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    for (let k = 0; k < 3; k++) {
      caja.min[k] = Math.min(caja.min[k], superficie[i * 3 + k]);
      caja.max[k] = Math.max(caja.max[k], superficie[i * 3 + k]);
    }
  }
  caja.min[1] = pisoEstimado - 0.1;
  const malla = mallaDesdeTSDF(tsdf, caja);
  assert.ok(malla.indices.length / 3 > 5000, 'triángulos ' + malla.indices.length / 3);
  const e = procesarEscaneo(malla, { carroceria: 'suv' });
  assert.ok(Math.abs(e.medidas.largo - L) < 0.04, 'largo ' + e.medidas.largo.toFixed(3));
  assert.ok(Math.abs(e.medidas.ancho - W) < 0.04, 'ancho ' + e.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(e.medidas.alto - H) < 0.04, 'alto ' + e.medidas.alto.toFixed(3));
});
