// Importar un escaneo de otra app y guardarlo: archivos de mentira (un PLY
// de puntos en milímetros con z arriba, una malla en metros con y arriba)
// que tienen que salir del mismo tamaño y parados; y el almacén aparte de
// los escaneos, con fake-indexeddb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IDBFactory } from 'fake-indexeddb';
import { construirCarro } from '../js/carro.js';
import { muestrasDelGenerico, simplificarMalla } from '../js/escaneo.js';
import { ajustarEscala, detectarArriba, leerArchivoDeEscaneo, mallaDeObjeto3D, procesarImportado } from '../js/escaneo-importar.js';
import { abrirEscaneos, escaneoParaGuardar } from '../js/escaneos.js';
import { PLYLoader } from '../js/vendor/loaders/PLYLoader.js';

const MEDIDAS = { largo: 4.34, ancho: 1.8, alto: 1.69, entreEjes: 2.67 };

function azar(semilla = 11) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// La chapa de la SUV y un piso, en metros, y arriba.
function nubeEnMetros() {
  const r = azar();
  const m = muestrasDelGenerico(construirCarro({ carroceria: 'suv', medidas: MEDIDAS }), { paso: 0.03 });
  const p = [];
  for (let i = 0; i < m.puntos.length; i += 3) p.push(m.puntos[i] + (r() - 0.5) * 0.01, m.puntos[i + 1] + (r() - 0.5) * 0.01, m.puntos[i + 2] + (r() - 0.5) * 0.01);
  for (let x = -3; x <= 3; x += 0.05) for (let z = -3.5; z <= 3.5; z += 0.05) p.push(x, (r() - 0.5) * 0.01, z);
  return p;
}

test('ajustarEscala: metros se quedan, centímetros y milímetros se convierten, lo demás va al largo del catálogo', () => {
  // Doscientos puntos a lo largo (la escala se mide con percentiles).
  const caja = (largo) => Float32Array.from({ length: 600 }, (_, i) => (i % 3 === 0 ? (largo * Math.floor(i / 3)) / 199 : i % 3 === 1 ? 0.5 : 0.5));
  assert.equal(ajustarEscala(caja(5)).factor, 1);
  assert.equal(ajustarEscala(caja(450)).factor, 0.01);
  assert.equal(ajustarEscala(caja(4500)).factor, 0.001, '4.500 son milímetros: 4,5 m es un carro; 45 m no');
  assert.equal(ajustarEscala(caja(20000)).factor, 0.001);
  const raro = ajustarEscala(caja(1), { largoCatalogo: 4340 });
  // Lo lleva al largo del catálogo (a 2 %: la extensión se mide con percentiles).
  assert.ok(Math.abs(raro.factor - 4.34) / 4.34 < 0.02, "factor " + raro.factor);
  assert.match(raro.motivo, /catálogo/);
  assert.equal(raro.medido, false);
  assert.equal(ajustarEscala(caja(450)).medido, true);
  // Un carro chico en milímetros sin piso: 3.600 son 3,6 m, no 36 m.
  assert.equal(ajustarEscala(caja(3600)).factor, 0.001);
  // Unos puntos sueltos lejísimos no cambian la escala de un archivo en metros.
  const p = Array.from(nubeEnMetros());
  for (let k = 0; k < 20; k++) p.push(60 + k, 1, 500);
  assert.equal(ajustarEscala(new Float32Array(p)).factor, 1);
});

test('detectarArriba encuentra el piso en z o en -y, y sin piso se queda en y', () => {
  const p = nubeEnMetros();
  const enY = new Float32Array(p);
  assert.equal(detectarArriba(enY).eje, '+y');
  // El mismo escaneo con z arriba (girado -90° en x: y → z).
  const giro = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const v = new THREE.Vector3();
  const enZ = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(giro);
    enZ[i] = v.x;
    enZ[i + 1] = v.y;
    enZ[i + 2] = v.z;
  }
  const d = detectarArriba(enZ);
  assert.equal(d.eje, '+z');
  // Y la matriz que devuelve lo vuelve a parar: el piso queda abajo en y.
  const parado = new THREE.Vector3(0, 0, 0.0).applyMatrix4(d.matriz);
  void parado;
  const punto = new THREE.Vector3(0, 1.6, 0).applyMatrix4(giro).applyMatrix4(d.matriz);
  assert.ok(Math.abs(punto.y - 1.6) < 1e-6, 'el techo vuelve a quedar arriba: ' + punto.y);
  // Boca abajo.
  const alReves = Float32Array.from(p, (x, i) => (i % 3 === 1 ? -x : x));
  assert.equal(detectarArriba(alReves).eje, '-y');
});

test('sin piso en el archivo (un carro ya recortado), las cuatro carrocerías se quedan paradas', () => {
  // La chapa vista desde afuera, sin piso: el costado y el techo también
  // son planos llenos, pero no rodean al carro (revisión del 22-oct-2026:
  // la primera versión los tomaba por piso y lo acostaba o lo volteaba).
  for (const carroceria of ['sedan', 'hatchback', 'suv', 'camioneta']) {
    const m = muestrasDelGenerico(construirCarro({ carroceria }), { paso: 0.03 });
    assert.equal(detectarArriba(m.puntos).eje, '+y', carroceria);
  }
});

test('con el eje elegido a mano ("Está acostado"), la malla se para con ese eje', () => {
  const p = nubeEnMetros();
  const giro = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const v = new THREE.Vector3();
  const enZ = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(giro);
    enZ.set([v.x, v.y, v.z], i);
  }
  const e = procesarImportado({ posiciones: enZ, indices: new Uint32Array(0), colores: null, esNube: true }, { carroceria: 'suv', ejeArriba: '+z' });
  assert.equal(e.ejeArriba, '+z');
  assert.ok(Math.abs(e.medidas.alto - 1.66) < 0.06, 'alto ' + e.medidas.alto.toFixed(2));
});

test('un OBJ sin extensión se reconoce por su contenido', async () => {
  const texto = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  const datos = new TextEncoder().encode(texto);
  const archivo = { name: 'escaneo', size: datos.length, arrayBuffer: async () => datos.buffer.slice(0) };
  const malla = await leerArchivoDeEscaneo(archivo);
  assert.equal(malla.indices.length, 3);
  assert.equal(malla.posiciones.length, 9);
});

test('un PLY de puntos en milímetros con z arriba sale parado, en metros y con las medidas del carro', () => {
  const p = nubeEnMetros();
  // Escribirlo como lo exportaría una app: ascii, milímetros, z arriba.
  const lineas = [];
  for (let i = 0; i < p.length; i += 3) lineas.push((p[i] * 1000).toFixed(1) + ' ' + (-p[i + 2] * 1000).toFixed(1) + ' ' + (p[i + 1] * 1000).toFixed(1));
  const texto = 'ply\nformat ascii 1.0\nelement vertex ' + lineas.length + '\nproperty float x\nproperty float y\nproperty float z\nend_header\n' + lineas.join('\n') + '\n';
  const geo = new PLYLoader().parse(texto);
  const malla = mallaDeObjeto3D(new THREE.Points(geo));
  assert.equal(malla.esNube, true);
  const e = procesarImportado(malla, { carroceria: 'suv', medidasCatalogo: { largo: 4340, ancho: 1800, alto: 1690, entreEjes: 2670 } });
  assert.equal(e.ejeArriba, '+z');
  assert.match(e.escalaAjustada.motivo, /milímetros/);
  assert.equal(e.escalaAjustada.medido, true, 'en milímetros sigue siendo medido');
  assert.equal(e.rehecha, true);
  assert.ok(Math.abs(e.medidas.largo - 4.34) < 0.06, 'largo ' + e.medidas.largo.toFixed(3));
  assert.ok(Math.abs(e.medidas.ancho - 1.8) < 0.04, 'ancho ' + e.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(e.medidas.alto - 1.66) < 0.05, 'alto ' + e.medidas.alto.toFixed(3));
});

test('una malla en metros con y arriba, girada dentro del archivo y con color por vértice, conserva el color', () => {
  // Una "carrocería" de caja fina (como la superficie de un escaneo, sin
  // grosor) sobre un piso, dentro de un grupo girado y corrido.
  const caja = new THREE.BoxGeometry(1.8, 1.6, 4.3, 18, 16, 43).toNonIndexed();
  caja.translate(0, 0.8, 0);
  const n = caja.attributes.position.count;
  const colores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colores.set([0.6, 0.05, 0.05], i * 3);
  caja.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  const piso = new THREE.PlaneGeometry(8, 8, 80, 80).rotateX(-Math.PI / 2);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(caja), new THREE.Mesh(piso));
  grupo.rotation.y = 0.7;
  grupo.position.set(1.5, -0.3, 2);
  const malla = mallaDeObjeto3D(grupo);
  assert.equal(malla.esNube, false);
  assert.ok(malla.colores, 'trae colores');
  const e = procesarImportado(malla, { carroceria: 'suv' });
  assert.equal(e.ejeArriba, '+y');
  assert.equal(e.escalaAjustada, null, 'venía en metros: no se tocó la escala');
  assert.equal(e.rehecha, false);
  assert.ok(Math.abs(e.medidas.largo - 4.3) < 0.04, 'largo ' + e.medidas.largo.toFixed(3));
  assert.ok(Math.abs(e.medidas.ancho - 1.8) < 0.04, 'ancho ' + e.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(e.medidas.alto - 1.6) < 0.04, 'alto ' + e.medidas.alto.toFixed(3));
  // El color (rojo, guardado en sRGB) llega a los vértices del carro.
  assert.ok(e.colores && e.colores.length === e.posiciones.length);
  assert.ok(e.colores[0] > 150 && e.colores[1] < 90, 'color ' + e.colores[0] + ',' + e.colores[1] + ',' + e.colores[2]);
});

test('simplificarMalla baja los triángulos de una malla grande sin perder su forma ni su color', () => {
  // Una esfera fina de 1 m con color: muchos triángulos.
  const geo = new THREE.SphereGeometry(1, 400, 300);
  const n = geo.attributes.position.count;
  const colores = new Uint8Array(n * 3).fill(200);
  const malla = { posiciones: Float32Array.from(geo.attributes.position.array), indices: Uint32Array.from(geo.index.array), colores };
  const antes = malla.indices.length / 3;
  const chica = simplificarMalla(malla, { maximo: 60000 });
  assert.ok(antes > 200000 && chica.indices.length / 3 <= 60000, antes + ' → ' + chica.indices.length / 3);
  // Sigue siendo una esfera de radio 1 (los vértices quedan a ±1 cm).
  let peor = 0;
  for (let i = 0; i < chica.posiciones.length; i += 3) peor = Math.max(peor, Math.abs(Math.hypot(chica.posiciones[i], chica.posiciones[i + 1], chica.posiciones[i + 2]) - 1));
  assert.ok(peor < 0.03, 'se deformó ' + peor.toFixed(3));
  assert.ok(chica.colores && chica.colores.every((c) => c === 200), 'el color se conserva');
});

test('el almacén de escaneos: guarda, trae la malla igual, lista las placas y borra', async () => {
  const escaneos = await abrirEscaneos({ indexedDB: new IDBFactory() });
  const escaneo = {
    posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    colores: null,
    etiquetas: new Uint8Array([1, 1, 0]),
    nombres: ['nada', 'capo'],
    medidas: { largo: 4.3, ancho: 1.8, alto: 1.6 },
    medidasDibujo: { largo: 4.3, ancho: 1.8, alto: 1.6 },
    carroceria: 'suv',
  };
  await escaneos.guardar('jrx-248', escaneo, { origen: 'archivo', archivo: 'captiva.glb' });
  const leido = await escaneos.obtener('JRX248');
  assert.equal(leido.placa, 'JRX248');
  assert.equal(leido.origen, 'archivo');
  assert.deepEqual(Array.from(leido.indices), [0, 1, 2]);
  assert.ok(leido.posiciones instanceof Float32Array && leido.etiquetas instanceof Uint8Array);
  assert.deepEqual(leido.nombres, ['nada', 'capo']);
  assert.deepEqual(await escaneos.placas(), ['JRX248']);
  await escaneos.borrar('JRX248');
  assert.equal(await escaneos.obtener('JRX248'), null);
  assert.throws(() => escaneoParaGuardar('', escaneo), /placa/);
  assert.throws(() => escaneoParaGuardar('ABC123', { ...escaneo, indices: new Uint32Array(0) }), /malla/);
  escaneos.cerrar();
});
