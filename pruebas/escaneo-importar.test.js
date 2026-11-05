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
import { ajustarEscala, detectarArriba, elegirFoto, leerArchivoDeEscaneo, mallaDeObjeto3D, procesarImportado } from '../js/escaneo-importar.js';
import { strToU8, zipSync } from '../js/vendor/libs/fflate.module.js';
import { abrirEscaneos, escaneoParaGuardar } from '../js/escaneos.js';
import { OBJLoader } from '../js/vendor/loaders/OBJLoader.js';
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

test('de una exportación se elige la foto del carro, nunca la normal', () => {
  const archivos = ['model_normal.png', 'model_diffuse.png', 'model.obj', 'model.mtl'].map((nombre) => ({ nombre, datos: nombre }));
  assert.equal(elegirFoto(archivos).nombre, 'model_diffuse.png');
  // Si el archivo de materiales dice cuál es, manda él, aunque se llame raro.
  const otros = ['tex_0.jpg', 'tex_1.jpg'].map((nombre) => ({ nombre, datos: nombre }));
  assert.equal(elegirFoto(otros, 'newmtl m\nmap_Bump tex_0.jpg\nmap_Kd carpeta/tex_1.jpg\n').nombre, 'tex_1.jpg');
  // Solo hay normal: mejor sin foto que un carro de colores falsos.
  assert.equal(elegirFoto([{ nombre: 'modelo_NORMAL.jpg', datos: 1 }]), null);
});

test('un ZIP de RealityScan se abre: adentro está el OBJ', async () => {
  const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'f 1/1 2/2 3/3'].join('\n');
  const zip = zipSync({
    'modelo/model.obj': strToU8(obj),
    'modelo/model.mtl': strToU8('newmtl m\nmap_Kd difusa.jpg\n'),
    'modelo/difusa.jpg': new Uint8Array([1, 2, 3]),
    'modelo/normal.jpg': new Uint8Array([4, 5, 6]),
  });
  const malla = await leerArchivoDeEscaneo(new File([zip], 'export.zip'));
  assert.equal(malla.indices.length, 3);
  // En Node no se abren imágenes: el modelo llega, y dice que se quedó sin foto.
  assert.equal(malla.uvs, null);
  assert.match(malla.fotoPerdida, /no abrió/);
  await assert.rejects(leerArchivoDeEscaneo(new File([zipSync({ 'a.txt': strToU8('hola') })], 'otro.zip')), /no trae un modelo/);
});

// ---- La ruta del OBJ y el ZIP, con un espía donde Node no abre imágenes ----

const OBJ_CUADRADO = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'f 1/1 2/2 3/3', 'f 1/1 3/3 4/4'].join('\n');
const OBJ_DOS_MATERIALES = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'usemtl m0', 'f 1/1 2/2 3/3', 'usemtl m1', 'f 1/1 3/3 4/4'].join('\n');

// Node no tiene createImageBitmap: sin espía, la imagen elegida no deja rastro y una prueba pasa
// con cualquiera. Anota cuál se quiso abrir: el nombre en lo suelto, los bytes en lo del ZIP (por
// eso cada imagen de estas pruebas tiene un tamaño distinto). Con `abre`, da una imagen de mentira.
function espiarImagenes(t, { abre = false } = {}) {
  const abiertas = [];
  globalThis.createImageBitmap = async (blob) => {
    abiertas.push(blob.name || blob.size);
    if (!abre) throw new Error('Node no abre imágenes');
    return { width: 8, height: 8, bytes: blob.size, close() {} };
  };
  t.after(() => delete globalThis.createImageBitmap);
  return abiertas;
}

// Un lienzo de mentira: cada imagen es de un solo color, según sus bytes (222 verde; las demás, rojo).
function lienzoDeMentira(t) {
  globalThis.OffscreenCanvas = class {
    constructor(ancho, alto) {
      Object.assign(this, { ancho, alto, imagen: null });
    }
    getContext() {
      const lienzo = this;
      return {
        drawImage: (imagen) => {
          lienzo.imagen = imagen;
        },
        getImageData: (_x, _y, ancho, alto) => {
          const data = new Uint8ClampedArray(ancho * alto * 4);
          const color = lienzo.imagen.bytes === 222 ? [32, 192, 32] : [192, 32, 32];
          for (let i = 0; i < ancho * alto; i++) data.set(color, i * 4);
          return { data };
        },
      };
    }
    async convertToBlob() {
      return new Blob([new Uint8Array(5)], { type: 'image/jpeg' });
    }
  };
  t.after(() => delete globalThis.OffscreenCanvas);
}

const imagen = (bytes) => new Uint8Array(bytes);
const zipDe = (archivos, nombre = 'export.zip') => new File([zipSync(archivos)], nombre);

// Dónde queda una entrada en el ZIP, leyendo el directorio del final como hace el lector.
function entradaDelZip(zip, nombre) {
  const d = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let o = zip.length - 46; o >= 0; o--) {
    if (d.getUint32(o, true) !== 0x02014b50) continue;
    const largo = d.getUint16(o + 28, true);
    if (new TextDecoder().decode(zip.subarray(o + 46, o + 46 + largo)) !== nombre) continue;
    const local = d.getUint32(o + 42, true);
    return { central: o, datos: local + 30 + d.getUint16(local + 26, true) + d.getUint16(local + 28, true) };
  }
  throw new Error('no está en el ZIP: ' + nombre);
}

test('la foto se elige por lo que dice el MTL, con opciones y comillas, y nunca lo que llama relieve', () => {
  const elegida = (nombres, mtl) => (elegirFoto(nombres.map((nombre) => ({ nombre })), mtl) || { nombre: null }).nombre;
  assert.equal(elegida(['tex_0.jpg', 'tex_1.jpg'], 'map_Bump -bm 1.0 tex_0.jpg\nmap_Kd -s 1 1 1 tex_1.jpg\n'), 'tex_1.jpg');
  // Con opciones también manda sobre el nombre, y sigue siendo relieve.
  assert.equal(elegida(['a_diffuse.jpg', 'tex_1.jpg'], 'map_Kd -s 1 1 1 tex_1.jpg\n'), 'tex_1.jpg');
  assert.equal(elegida(['tex_0.jpg'], 'map_Bump -bm 1.0 tex_0.jpg\n'), null);
  assert.equal(elegida(['a.jpg', 'mi foto.jpg'], 'map_Kd mi foto.jpg\n'), 'mi foto.jpg');
  assert.equal(elegida(['tex_0.jpg', 'tex 1.jpg'], 'map_Bump tex_0.jpg\nmap_Kd "tex 1.jpg"\n'), 'tex 1.jpg');
  assert.equal(elegida(['tex_0.jpg', 'tex_1.jpg'], 'newmtl m\r\nmap_Kd tex_1.jpg\r\n'), 'tex_1.jpg');
  assert.equal(elegida(['Corolla normal.jpg'], 'map_Kd Corolla normal.jpg\n'), 'Corolla normal.jpg', 'el MTL manda, aunque se llame raro');
  // El primer map_Kd no está; el segundo sí.
  assert.equal(elegida(['b.jpg', 'c.jpg'], 'map_Kd a.jpg\nmap_Kd c.jpg\n'), 'c.jpg');
  // El MTL nombra la normal y la foto no vino: mejor sin foto que la normal pegada.
  assert.equal(elegida(['tex_0.jpg'], 'map_Bump tex_0.jpg\nmap_Kd tex_1.jpg\n'), null);
  assert.equal(elegida(['tex_0.jpg'], 'map_Bump tex_0.jpg\n'), null);
  assert.equal(elegida(['t.jpg'], 'norm t.jpg\n'), null);
  // El MTL dice cuál es y no vino: otra imagen no lo es, aunque venga sola.
  assert.equal(elegida(['tex_0.jpg'], 'map_Kd atlas.jpg\n'), null);
  assert.equal(elegida(['tex_0.jpg', 'tex_1.jpg'], 'map_Kd atlas.jpg\n'), null);
  // Sí valen el mismo nombre con otra extensión, lo que se llame diffuse, y el «foto» del aviso.
  assert.equal(elegida(['Atlas.JPG'], 'map_Kd -s 1 1 1 carpeta/atlas.png\n'), 'Atlas.JPG');
  assert.equal(elegida(['modelo_diffuse.jpg'], 'map_Kd atlas.jpg\n'), 'modelo_diffuse.jpg');
  assert.equal(elegida(['foto.jpg'], 'map_Kd atlas.jpg\n'), 'foto.jpg');
});

test('una línea vacía del MTL no se come la siguiente', () => {
  const elegida = (nombres, mtl) => (elegirFoto(nombres.map((nombre) => ({ nombre })), mtl) || { nombre: null }).nombre;
  // Lo de abajo sigue siendo relieve: no se vuelve la foto que pedía el map_Kd vacío.
  assert.equal(elegida(['tex_a.jpg'], 'newmtl m\nmap_Kd \nmap_Bump tex_a.jpg\n'), null);
  assert.equal(elegida(['tex_a.jpg'], 'newmtl m\r\nmap_Kd \r\nmap_Bump tex_a.jpg\r\n'), null);
  assert.equal(elegida(['tex_a.jpg'], 'newmtl m\nmap_Kd   \t \nmap_Bump tex_a.jpg\n'), null);
  // Al revés: un relieve vacío no vuelve relieve a lo de abajo.
  assert.equal(elegida(['tex_a.jpg'], 'map_Bump \nmap_Ka tex_a.jpg\n'), 'tex_a.jpg');
  // Y un map_Kd en blanco no pide ninguna: la única imagen se toma.
  assert.equal(elegida(['tex_a.jpg'], 'map_Kd \t \nNs 10\n'), 'tex_a.jpg');
});

test('si el MTL pide una foto que no vino se dice, y cambiarle el nombre como dice el aviso sí sirve', async (t) => {
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const obj = () => new File([OBJ_CUADRADO], 'model.obj');
  const mtl = new File(['newmtl m\nmap_Kd atlas.jpg\n'], 'model.mtl');
  const sinFoto = await leerArchivoDeEscaneo(obj(), [mtl, new File([imagen(40)], 'tex_0.jpg')]);
  assert.deepEqual(abiertas, []);
  assert.equal(sinFoto.uvs, null);
  assert.match(sinFoto.fotoPerdida, /cámbiale el nombre a «foto»/);
  const conFoto = await leerArchivoDeEscaneo(obj(), [mtl, new File([imagen(40)], 'foto.jpg')]);
  assert.deepEqual(abiertas, ['foto.jpg']);
  assert.ok(conFoto.textura);
  assert.equal(conFoto.fotoPerdida, null);
});

test('sin un MTL que resuelva, el nombre decide, y si queda duda no se pega ninguna', () => {
  const elegida = (...nombres) => (elegirFoto(nombres.map((nombre) => ({ nombre }))) || { nombre: null }).nombre;
  // El que parece la foto gana, venga antes o después.
  assert.equal(elegida('model_norm.png', 'model_diffuse.png'), 'model_diffuse.png');
  assert.equal(elegida('model_nor_gl.png', 'model_basecolor.png'), 'model_basecolor.png');
  assert.equal(elegida('model_ao.jpg', 'model_basecolor.jpg'), 'model_basecolor.jpg');
  assert.equal(elegida('preview.jpg', 'scan_diffuse.jpg'), 'scan_diffuse.jpg');
  assert.equal(elegida('ModelRoughness.png', 'Model_Albedo.png'), 'Model_Albedo.png');
  assert.equal(elegida('tex_0.jpg', 'tex_1.jpg', 'BaseColor.jpg'), 'BaseColor.jpg');
  // Una sola candidata se toma, aunque su nombre no diga nada.
  assert.equal(elegida('thumbnail.jpg', 'scan.jpg'), 'scan.jpg');
  assert.equal(elegida('interior.jpg'), 'interior.jpg', "'nor' es una palabra, no un pedazo");
  assert.equal(elegida('Bilbao.jpg'), 'Bilbao.jpg', "'ao' es una palabra, no un pedazo");
  // Las fotos de la captura no son la foto del carro.
  assert.equal(elegida('photos/IMG_0001.jpg', 'photos/IMG_0002.jpg', 'scan.jpg'), 'scan.jpg');
  assert.equal(elegida('modelo/fotos/IMG_0001.jpg'), null);
  // Nada que decida.
  assert.equal(elegida('tex_0.jpg', 'tex_1.jpg'), null);
  for (const nombre of ['model_bump.jpg', 'model_height.jpg', 'model_disp.jpg', 'model_rough.jpg', 'model_metal.jpg', 'model_orm.jpg', 'model_occlusion.jpg', 'model_n.jpg', 'modelnormal.jpg', 'thumb.jpg', 'Corolla normal.jpg']) assert.equal(elegida(nombre), null, nombre);
  // Un formato que no se sabe abrir no es candidato.
  assert.equal(elegida('foto.tif'), null);
});

test('un OBJ suelto usa el MTL que eligieron con él, y la vista previa dice por qué no hay foto', async (t) => {
  const abiertas = espiarImagenes(t);
  const obj = () => new File([OBJ_CUADRADO], 'model.obj');
  const img = (nombre) => new File([imagen(8)], nombre);
  const mtl = new File(['newmtl m\nmap_Bump tex_0.jpg\nmap_Kd tex_1.jpg\n'], 'model.mtl');
  await leerArchivoDeEscaneo(obj(), [mtl, img('tex_0.jpg'), img('tex_1.jpg')]);
  assert.deepEqual(abiertas, ['tex_1.jpg']);
  abiertas.length = 0;
  await leerArchivoDeEscaneo(obj(), [img('tex_1.jpg'), img('tex_0.jpg'), mtl]);
  assert.deepEqual(abiertas, ['tex_1.jpg'], 'en cualquier orden');
  abiertas.length = 0;
  // Con solo la normal, no se abre nada y se dice.
  const soloNormal = await leerArchivoDeEscaneo(obj(), [mtl, img('tex_0.jpg')]);
  assert.deepEqual(abiertas, []);
  assert.match(soloNormal.fotoPerdida, /ninguna imagen .* parece la foto/i);
  // Dos imágenes sin nada que decida: tampoco, y dice qué hacer.
  const enDuda = await leerArchivoDeEscaneo(obj(), [img('tex_0.jpg'), img('tex_1.jpg')]);
  assert.deepEqual(abiertas, []);
  assert.match(enDuda.fotoPerdida, /no sé cuál es la foto/);
  // Sin ninguna imagen no hay nada que explicar: el texto general es de la pantalla.
  assert.equal((await leerArchivoDeEscaneo(obj(), [])).fotoPerdida, null);
});

test('si la foto no abre se dice eso, en el ZIP y en el OBJ suelto, y no que el archivo no la trae', async (t) => {
  espiarImagenes(t);
  const zip = zipDe({ 'model.obj': strToU8(OBJ_CUADRADO), 'model.mtl': strToU8('newmtl m\nmap_Kd difusa.jpg\n'), 'difusa.jpg': imagen(9) });
  assert.match((await leerArchivoDeEscaneo(zip)).fotoPerdida, /no abrió/);
  const suelto = await leerArchivoDeEscaneo(new File([OBJ_CUADRADO], 'model.obj'), [new File([imagen(9)], 'foto.jpg')]);
  assert.match(suelto.fotoPerdida, /no abrió/);
  // Un ZIP con una foto en un formato que no se abre, o sin foto: no se afirma nada de eso.
  assert.equal((await leerArchivoDeEscaneo(zipDe({ 'model.obj': strToU8(OBJ_CUADRADO), 'foto.tif': imagen(9) }))).fotoPerdida, null);
  assert.equal((await leerArchivoDeEscaneo(zipDe({ 'model.obj': strToU8(OBJ_CUADRADO) }))).fotoPerdida, null);
});

test('un OBJ sin coordenadas elegido con su foto dice que no trae cómo pegarla', async (t) => {
  espiarImagenes(t, { abre: true });
  const sinVt = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
  const malla = await leerArchivoDeEscaneo(new File([sinVt], 'model.obj'), [new File([imagen(9)], 'foto.jpg')]);
  assert.match(malla.fotoPerdida, /no trae coordenadas/);
  assert.equal(malla.uvs, null);
  // Vale también si solo una parte no trae coordenadas: no es que la foto esté en varias imágenes.
  const geo = (conUv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    if (conUv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    g.setIndex([0, 1, 2]);
    return g;
  };
  const mapa = new THREE.Texture();
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geo(true), new THREE.MeshBasicMaterial({ map: mapa })), new THREE.Mesh(geo(false), new THREE.MeshBasicMaterial({ map: mapa })));
  assert.match(mallaDeObjeto3D(grupo, { colorDeTextura: () => [1, 2, 3] }).fotoPerdida, /no trae coordenadas/);
});

// Lo que hace leerArchivoDeEscaneo cuando cae al respaldo: OBJLoader hace una sola malla con
// `material` en arreglo y `geometry.groups`, y sin índice.
function mallaDesdeOBJLoader(obj) {
  const objeto = new OBJLoader().parse(obj);
  const rojo = new THREE.Texture();
  const verde = new THREE.Texture();
  objeto.traverse((h) => {
    if (!h.isMesh) return;
    h.material[0].map = rojo;
    h.material[1].map = verde;
  });
  return mallaDeObjeto3D(objeto, { colorDeTextura: (m) => (m.map === verde ? [32, 192, 32] : [192, 32, 32]) });
}

test('un OBJ de dos atlas: cada parte con el color de su imagen, sin foto pegada, y lo dice', async (t) => {
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const mtl = 'newmtl m0\nmap_Kd tex_0.jpg\nnewmtl m1\nmap_Kd tex_1.jpg\n';
  const revisar = (malla) => {
    assert.match(malla.fotoPerdida, /la foto en varias imágenes/);
    assert.equal(malla.uvs, null);
    assert.equal(malla.textura, undefined);
    // El triángulo de m1 es verde, no el rojo de la primera imagen: no comparten vértices.
    const color = (i) => Array.from(malla.colores.subarray(malla.indices[i] * 3, malla.indices[i] * 3 + 3));
    for (let i = 0; i < 3; i++) assert.deepEqual(color(i), [192, 32, 32]);
    for (let i = 3; i < 6; i++) assert.deepEqual(color(i), [32, 192, 32]);
  };
  revisar(await leerArchivoDeEscaneo(zipDe({ 'model.obj': strToU8(OBJ_DOS_MATERIALES), 'model.mtl': strToU8(mtl), 'tex_0.jpg': imagen(111), 'tex_1.jpg': imagen(222) })));
  assert.deepEqual(abiertas.sort(), [111, 222]);
  // Igual sueltos, y por el camino de OBJLoader.
  revisar(await leerArchivoDeEscaneo(new File([OBJ_DOS_MATERIALES], 'model.obj'), [new File([mtl], 'model.mtl'), new File([imagen(111)], 'tex_0.jpg'), new File([imagen(222)], 'tex_1.jpg')]));
  revisar(mallaDesdeOBJLoader(OBJ_DOS_MATERIALES));
});

test('varias imágenes y una sola foto de verdad: los casos que no deben perderla', async (t) => {
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const conFoto = async (rotulo, archivos, abierta) => {
    abiertas.length = 0;
    const malla = await leerArchivoDeEscaneo(zipDe(archivos));
    assert.ok(malla.textura, rotulo + ': conserva la foto');
    assert.ok(malla.uvs, rotulo + ': conserva las coordenadas');
    assert.equal(malla.fotoPerdida, null, rotulo);
    assert.deepEqual(abiertas, [abierta], rotulo);
  };
  await conFoto('dos materiales con la misma imagen', { 'm.obj': strToU8(OBJ_DOS_MATERIALES), 'm.mtl': strToU8('newmtl m0\nmap_Kd tex.jpg\nnewmtl m1\nmap_Kd tex.jpg\n'), 'tex.jpg': imagen(111) }, 111);
  await conFoto('un material sobrante en el MTL', { 'm.obj': strToU8('usemtl m\n' + OBJ_CUADRADO), 'm.mtl': strToU8('newmtl sobra\nmap_Kd otra.jpg\nnewmtl m\nmap_Kd tex.jpg\n'), 'otra.jpg': imagen(222), 'tex.jpg': imagen(111) }, 111);
  await conFoto('una imagen y su normal, sin MTL', { 'm.obj': strToU8(OBJ_CUADRADO), 'tex.jpg': imagen(111), 'tex_normal.jpg': imagen(222) }, 111);
  // Las caras de antes del primer usemtl no piden nada: no son un material más sin foto.
  const antesDeUsemtl = OBJ_CUADRADO.replace('f 1/1 3/3 4/4', 'usemtl m0\nf 1/1 3/3 4/4');
  await conFoto('caras sin usemtl y un MTL que resuelve', { 'm.obj': strToU8(antesDeUsemtl), 'm.mtl': strToU8('newmtl m0\nmap_Kd tex.jpg\n'), 'tex.jpg': imagen(111) }, 111);
  await conFoto('caras sin usemtl y sin MTL', { 'm.obj': strToU8(antesDeUsemtl), 'tex.jpg': imagen(111) }, 111);
  // Dos materiales, dos imágenes y nada que diga cuál va con cuál: ninguna, y se dice.
  abiertas.length = 0;
  const sinSaber = await leerArchivoDeEscaneo(zipDe({ 'm.obj': strToU8(OBJ_DOS_MATERIALES), 'a_diffuse.jpg': imagen(111), 'b_diffuse.jpg': imagen(222) }));
  assert.deepEqual(abiertas, []);
  assert.match(sinSaber.fotoPerdida, /la foto en varias imágenes/);
});

test('si el MTL le da imagen a una parte y a otra no, esa imagen no se pega sobre todo el carro', async (t) => {
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const revisar = (malla, rotulo) => {
    assert.match(malla.fotoPerdida, /una parte/i, rotulo);
    assert.equal(malla.uvs, null, rotulo);
    assert.equal(malla.textura, undefined, rotulo);
    // m0 con el color de su imagen y m1 en gris: con el de la otra salían parches de camuflaje.
    const color = (i) => Array.from(malla.colores.subarray(malla.indices[i] * 3, malla.indices[i] * 3 + 3));
    for (let i = 0; i < 3; i++) assert.deepEqual(color(i), [192, 32, 32], rotulo);
    for (let i = 3; i < 6; i++) assert.deepEqual(color(i), [128, 128, 128], rotulo);
  };
  const obj = strToU8(OBJ_DOS_MATERIALES);
  const faltaUna = 'newmtl m0\nmap_Kd tex_0.jpg\nnewmtl m1\nmap_Kd tex_1.jpg\n';
  revisar(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'm.mtl': strToU8(faltaUna), 'tex_0.jpg': imagen(111) })), 'falta una, en ZIP');
  revisar(await leerArchivoDeEscaneo(new File([OBJ_DOS_MATERIALES], 'm.obj'), [new File([faltaUna], 'm.mtl'), new File([imagen(111)], 'tex_0.jpg')]), 'falta una, sueltos');
  revisar(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'm.mtl': strToU8('newmtl m0\nmap_Kd tex_0.jpg\nnewmtl m1\nKd 0.5 0.5 0.5\n'), 'tex_0.jpg': imagen(111) })), 'm1 sin imagen');
  revisar(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'm.mtl': strToU8('newmtl m0\nmap_Kd tex_0.jpg\nnewmtl m1\nmap_Kd tex_1.tif\n'), 'tex_0.jpg': imagen(111), 'tex_1.tif': imagen(222) })), 'm1 en un formato que no abre');
  // Igual por el camino de OBJLoader: un w de más lo manda allá.
  const conW = OBJ_DOS_MATERIALES.replace(/^v (.+)$/gm, 'v $1 1.0');
  revisar(await leerArchivoDeEscaneo(zipDe({ 'm.obj': strToU8(conW), 'm.mtl': strToU8(faltaUna), 'tex_0.jpg': imagen(111) })), 'falta una, por OBJLoader');
  assert.deepEqual(abiertas, [111, 'tex_0.jpg', 111, 111, 111]);
});

test('dos materiales, una imagen y nada que diga si alcanza: ninguna, y dice cómo resolverlo', async (t) => {
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const dice = (malla, rotulo) => {
    assert.deepEqual(abiertas, [], rotulo);
    assert.equal(malla.uvs, null, rotulo);
    assert.match(malla.fotoPerdida, /no sé si esa imagen es la foto de todos.*\.mtl/, rotulo);
  };
  const obj = strToU8(OBJ_DOS_MATERIALES);
  dice(await leerArchivoDeEscaneo(new File([OBJ_DOS_MATERIALES], 'm.obj'), [new File([imagen(111)], 'tex_0.jpg')]), 'suelto y sin MTL, como dice la ayuda');
  dice(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'tex_0.jpg': imagen(111) })), 'en ZIP y sin MTL');
  dice(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'm.mtl': strToU8('newmtl otro\nKd 1 1 1\n'), 'tex.jpg': imagen(111) })), 'un MTL que no los nombra');
  dice(await leerArchivoDeEscaneo(zipDe({ 'm.obj': obj, 'm.mtl': strToU8('newmtl otro\nmap_Kd Corolla normal.jpg\n'), 'Corolla normal.jpg': imagen(111) })), 'un MTL que solo le da foto a un material que no se usa');
  // Y con su MTL se resuelve, que es lo que dice el aviso.
  const conMtl = await leerArchivoDeEscaneo(new File([OBJ_DOS_MATERIALES], 'm.obj'), [new File(['newmtl m0\nmap_Kd tex_0.jpg\nnewmtl m1\nmap_Kd tex_0.jpg\n'], 'm.mtl'), new File([imagen(111)], 'tex_0.jpg')]);
  assert.deepEqual(abiertas, ['tex_0.jpg']);
  assert.ok(conMtl.uvs);
  assert.equal(conMtl.fotoPerdida, null);
});

test('el OBJ con foto da un vértice por par (v, vt), no tres por triángulo', async (t) => {
  espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const zip = zipDe({ 'model.obj': strToU8(OBJ_CUADRADO), 'model.mtl': strToU8('newmtl m\nmap_Kd difusa.jpg\n'), 'difusa.jpg': imagen(111) });
  const malla = await leerArchivoDeEscaneo(zip);
  assert.equal(malla.posiciones.length / 3, 4);
  assert.equal(malla.uvs.length / 2, 4);
  assert.deepEqual(Array.from(malla.indices), [0, 1, 2, 0, 2, 3]);
  // Un OBJ cuenta v desde abajo; la malla la guarda con v = 0 arriba.
  assert.deepEqual(Array.from(malla.uvs.subarray(0, 2)), [0, 1]);
  // Dos objetos que comparten vértices los siguen compartiendo. OBJLoader, aun soldando, hace una
  // malla por objeto: con esto se sabe que el lector propio es el que lee.
  const dosObjetos = await leerArchivoDeEscaneo(new File([OBJ_CUADRADO.replace('f 1/1 2/2 3/3', 'o a\nf 1/1 2/2 3/3').replace('f 1/1 3/3 4/4', 'o b\nf 1/1 3/3 4/4')], 'model.obj'));
  assert.equal(dosObjetos.posiciones.length / 3, 4);
  assert.deepEqual(Array.from(dosObjetos.indices), [0, 1, 2, 0, 2, 3]);
});

test('lo que cae al respaldo también se suelda, con coordenadas exactas', async () => {
  // Color por vértice: el lector se lo deja a OBJLoader, que repite las tres esquinas.
  const conColor = ['v 0 0 0 1 0 0', 'v 1 0 0 1 0 0', 'v 1 1 0 1 0 0', 'v 0 1 0 1 0 0', 'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'f 1/1 2/2 3/3', 'f 1/1 3/3 4/4'].join('\n');
  const malla = await leerArchivoDeEscaneo(new File([conColor], 'color.obj'));
  assert.equal(malla.posiciones.length / 3, 4);
  assert.equal(malla.indices.length, 6);
  assert.ok(malla.colores[0] > 200 && malla.colores[1] < 10, 'conserva el color');
  // Todavía no está en metros: dos puntos a una décima de micra no se funden, ni en milímetros grandes.
  const cerca = ['v 0.0000001 0 0', 'v 0.0000002 0 0', 'v 0 0.0000001 0', 'v 40000.5 0 0', 'v 40000.504 0 0', 'v 0 40000.5 0', 'f 1 2 3', 'f 4 5 6'].join('\n');
  assert.equal(mallaDeObjeto3D(new OBJLoader().parse(cerca)).posiciones.length / 3, 6);
  // La misma posición con otra coordenada (una costura de la foto) sigue siendo dos vértices.
  const costura = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'v 1 1 0', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 0.5 0.5', 'f 1/1 2/2 3/3', 'f 2/4 4/2 3/3'].join('\n');
  assert.equal(mallaDeObjeto3D(new OBJLoader().parse(costura)).posiciones.length / 3, 5);
  // Y dos materiales no se juntan: cada uno lleva el color de su imagen.
  assert.equal(mallaDesdeOBJLoader(OBJ_DOS_MATERIALES).posiciones.length / 3, 6);
  // Una nube no se suelda: `esNube` necesita todos sus puntos, también los repetidos.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1]), 3));
  const nube = mallaDeObjeto3D(new THREE.Points(geo));
  assert.equal(nube.posiciones.length / 3, 3);
  assert.equal(nube.esNube, true);
  // Solo puntos en un OBJ: lo arma OBJLoader, y sigue siendo una nube.
  const soloPuntos = await leerArchivoDeEscaneo(new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 1 0\n'], 'nube.obj'));
  assert.equal(soloPuntos.posiciones.length / 3, 4);
  assert.equal(soloPuntos.esNube, true);
});

test('el ZIP se fija en el tamaño antes de inflar el modelo', async () => {
  const zip = zipSync({ 'model.obj': strToU8(OBJ_CUADRADO) });
  // El directorio dice 61 MB. Si se inflara primero, saldría un OBJ chiquito y seguiría de largo.
  new DataView(zip.buffer, zip.byteOffset).setUint32(entradaDelZip(zip, 'model.obj').central + 24, 61e6, true);
  await assert.rejects(leerArchivoDeEscaneo(new File([zip], 'export.zip')), /pesa 61 MB; exporta el escaneo más liviano/);
});

test('el ZIP no infla la normal ni las fotos de la captura, y si la foto elegida está dañada no se cae el modelo', async (t) => {
  const abiertas = espiarImagenes(t);
  // Esas entradas quedan dañadas: inflarlas falla con "invalid block type".
  const zip = zipSync({
    'a/model.obj': strToU8(OBJ_CUADRADO),
    'a/model.mtl': strToU8('newmtl m\nmap_Kd difusa.jpg\nmap_Bump model_normal.jpg\n'),
    'a/difusa.jpg': imagen(111),
    'a/model_normal.jpg': imagen(40),
    'photos/IMG_0001.jpg': imagen(41),
    'photos/IMG_0002.jpg': imagen(42),
  });
  for (const nombre of ['a/model_normal.jpg', 'photos/IMG_0001.jpg', 'photos/IMG_0002.jpg']) zip[entradaDelZip(zip, nombre).datos] = 0x06;
  const malla = await leerArchivoDeEscaneo(new File([zip], 'export.zip'));
  assert.equal(malla.indices.length, 6);
  assert.deepEqual(abiertas, [111]);
  zip[entradaDelZip(zip, 'a/difusa.jpg').datos] = 0x06;
  abiertas.length = 0;
  const sinFoto = await leerArchivoDeEscaneo(new File([zip], 'export.zip'));
  assert.equal(sinFoto.indices.length, 6);
  assert.deepEqual(abiertas, []);
  assert.match(sinFoto.fotoPerdida, /no abrió/);
});

test('en el ZIP manda el modelo más grande, sin metadatos de Mac, y el MTL que él nombra', async (t) => {
  const abiertas = espiarImagenes(t);
  const unTriangulo = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
  // Los de Mac pesan más que el modelo: no es solo cuestión de tamaño.
  const relleno = '# metadatos\n'.repeat(200);
  const triangulos = async (archivos) => (await leerArchivoDeEscaneo(zipDe(archivos))).indices.length / 3;
  assert.equal(await triangulos({ '._model.obj': strToU8(relleno + unTriangulo), 'model.obj': strToU8(OBJ_CUADRADO) }), 2);
  assert.equal(await triangulos({ '__MACOSX/model.obj': strToU8(relleno + unTriangulo), 'model.obj': strToU8(OBJ_CUADRADO) }), 2);
  assert.equal(await triangulos({ 'lod1/a.obj': strToU8(unTriangulo), 'b.obj': strToU8(OBJ_CUADRADO) }), 2);
  await assert.rejects(leerArchivoDeEscaneo(zipDe({ '._model.obj': strToU8(unTriangulo) })), /no trae un modelo/);
  // Tampoco cuentan las imágenes de Mac.
  abiertas.length = 0;
  await leerArchivoDeEscaneo(zipDe({ '._foto.jpg': imagen(40), 'model.obj': strToU8(OBJ_CUADRADO), 'foto.jpg': imagen(111) }));
  assert.deepEqual(abiertas, [111]);
  // El MTL es el que nombra su mtllib, aunque otro venga antes.
  abiertas.length = 0;
  await leerArchivoDeEscaneo(zipDe({ 'otro/otro.mtl': strToU8('newmtl m\nmap_Kd a.jpg\n'), 'x/correcto.mtl': strToU8('newmtl m\nmap_Kd b.jpg\n'), 'x/m.obj': strToU8('mtllib correcto.mtl\n' + OBJ_CUADRADO), 'a.jpg': imagen(40), 'b.jpg': imagen(111) }));
  assert.deepEqual(abiertas, [111]);
  // Sin mtllib, el de su misma carpeta.
  abiertas.length = 0;
  await leerArchivoDeEscaneo(zipDe({ 'otro/otro.mtl': strToU8('newmtl m\nmap_Kd a.jpg\n'), 'x/mio.mtl': strToU8('newmtl m\nmap_Kd b.jpg\n'), 'x/m.obj': strToU8(OBJ_CUADRADO), 'a.jpg': imagen(40), 'b.jpg': imagen(111) }));
  assert.deepEqual(abiertas, [111]);
});

test('con dos modelos en el ZIP, el grande no se lleva el MTL ni la foto del otro aunque se llamen igual', async (t) => {
  const abiertas = espiarImagenes(t);
  const chico = strToU8(['mtllib model.mtl', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'usemtl m', 'f 1/1 2/2 3/3'].join('\n'));
  const grande = strToU8('mtllib model.mtl\nusemtl m\n' + OBJ_CUADRADO);
  const kd = (nombre) => strToU8('newmtl m\nmap_Kd ' + nombre + '\n');
  // Lo del modelo chico va primero en el ZIP: con solo comparar nombres, gana. Su imagen es la de 40.
  const abre = async (rotulo, archivos, esperada) => {
    abiertas.length = 0;
    const malla = await leerArchivoDeEscaneo(zipDe(archivos));
    assert.equal(malla.indices.length / 3, 2, rotulo + ': manda el grande');
    assert.deepEqual(abiertas, esperada, rotulo);
  };
  await abre('mismos nombres', { 'a/model.obj': chico, 'a/model.mtl': kd('tex.jpg'), 'a/tex.jpg': imagen(40), 'b/model.obj': grande, 'b/model.mtl': kd('tex.jpg'), 'b/tex.jpg': imagen(111) }, [111]);
  await abre('cada MTL nombra otra imagen', { 'a/model.obj': chico, 'a/model.mtl': kd('baja.jpg'), 'a/baja.jpg': imagen(40), 'b/model.obj': grande, 'b/model.mtl': kd('alta.jpg'), 'b/alta.jpg': imagen(111) }, [111]);
  await abre('sin MTL, diffuse en las dos', { 'a/model.obj': chico, 'a/diffuse.jpg': imagen(40), 'b/model.obj': strToU8(OBJ_CUADRADO), 'b/diffuse.jpg': imagen(111) }, [111]);
  await abre('sin MTL, diffuse solo en la del otro', { 'a/model.obj': chico, 'a/diffuse.jpg': imagen(40), 'b/model.obj': strToU8(OBJ_CUADRADO), 'b/tex.jpg': imagen(111) }, [111]);
  await abre('en una subcarpeta de cada modelo', { 'a/model.obj': chico, 'a/model.mtl': kd('textures/tex.jpg'), 'a/textures/tex.jpg': imagen(40), 'b/model.obj': grande, 'b/model.mtl': kd('textures/tex.jpg'), 'b/textures/tex.jpg': imagen(111) }, [111]);
  await abre('en carpetas hermanas de cada modelo', { 'a/obj/model.obj': chico, 'a/obj/model.mtl': kd('../tex/tex.jpg'), 'a/tex/tex.jpg': imagen(40), 'b/obj/model.obj': grande, 'b/obj/model.mtl': kd('../tex/tex.jpg'), 'b/tex/tex.jpg': imagen(111) }, [111]);
  await abre('el chico en la raíz', { 'model.obj': chico, 'model.mtl': kd('tex.jpg'), 'tex.jpg': imagen(40), 'b/model.obj': grande, 'b/model.mtl': kd('tex.jpg'), 'b/tex.jpg': imagen(111) }, [111]);
  // Si el grande no trae foto, la del otro no le sirve: colores falsos. Mejor sin foto.
  await abre('el grande sin imagen', { 'a/model.obj': chico, 'a/tex.jpg': imagen(40), 'b/model.obj': strToU8(OBJ_CUADRADO) }, []);
  await abre('su MTL la pide y solo la tiene el otro', { 'a/model.obj': chico, 'a/tex.jpg': imagen(40), 'b/model.obj': grande, 'b/model.mtl': kd('tex.jpg') }, []);
  // Con un solo modelo, la imagen de otra carpeta sigue siendo suya (source/ y textures/ es común),
  // pero si dos se llaman igual, primero la de al lado.
  await abre('un modelo y la foto en otra carpeta', { 'source/model.obj': grande, 'source/model.mtl': kd('../textures/tex.jpg'), 'textures/tex.jpg': imagen(111) }, [111]);
  await abre('un modelo y la foto sola en otra carpeta', { 'source/model.obj': strToU8(OBJ_CUADRADO), 'textures/tex.jpg': imagen(111) }, [111]);
  await abre('un modelo y dos imágenes iguales', { 'otra/tex.jpg': imagen(40), 'x/model.obj': grande, 'x/model.mtl': kd('tex.jpg'), 'x/tex.jpg': imagen(111) }, [111]);
  await abre('un modelo y una igual en su subcarpeta', { 'x/sub/tex.jpg': imagen(40), 'x/model.obj': grande, 'x/model.mtl': kd('tex.jpg'), 'x/tex.jpg': imagen(111) }, [111]);
  await abre('un modelo y dos MTL iguales', { 'model.mtl': kd('a.jpg'), 'x/model.obj': grande, 'x/model.mtl': kd('b.jpg'), 'a.jpg': imagen(40), 'b.jpg': imagen(111) }, [111]);
  // Dos modelos en la misma carpeta: decide el mtllib.
  await abre('dos modelos en la misma carpeta', { 'x/chico.obj': strToU8(new TextDecoder().decode(chico).replace('model.mtl', 'chico.mtl')), 'x/chico.mtl': kd('c.jpg'), 'x/c.jpg': imagen(40), 'x/grande.obj': strToU8(new TextDecoder().decode(grande).replace('model.mtl', 'grande.mtl')), 'x/grande.mtl': kd('g.jpg'), 'x/g.jpg': imagen(111) }, [111]);
});

// Un GLB de un triángulo por malla, con las imágenes (bytes de mentira) y el JSON que se le pida.
function armarGlb({ imagenes = [], materials = [], meshes = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }], ...resto }) {
  const partes = [new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Float32Array([0, 0, 1, 0, 0, 1]), ...imagenes];
  const vistas = [];
  let largo = 0;
  for (const p of partes) {
    vistas.push({ buffer: 0, byteOffset: largo, byteLength: p.byteLength });
    largo += p.byteLength + ((4 - (p.byteLength % 4)) % 4);
  }
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((_, mesh) => ({ mesh })),
    meshes,
    materials,
    bufferViews: vistas,
    buffers: [{ byteLength: largo }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    ...(imagenes.length ? { images: imagenes.map((_, i) => ({ bufferView: 2 + i, mimeType: 'image/jpeg' })), textures: imagenes.map((_, source) => ({ source })) } : {}),
    ...resto,
  };
  let textoJson = JSON.stringify(json);
  while (textoJson.length % 4) textoJson += ' ';
  const bytesJson = new TextEncoder().encode(textoJson);
  const salida = new Uint8Array(12 + 8 + bytesJson.length + 8 + largo);
  const d = new DataView(salida.buffer);
  d.setUint32(0, 0x46546c67, true);
  d.setUint32(4, 2, true);
  d.setUint32(8, salida.length, true);
  d.setUint32(12, bytesJson.length, true);
  d.setUint32(16, 0x4e4f534a, true);
  salida.set(bytesJson, 20);
  const binario = 20 + bytesJson.length;
  d.setUint32(binario, largo, true);
  d.setUint32(binario + 4, 0x004e4942, true);
  partes.forEach((p, i) => salida.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), binario + 8 + vistas[i].byteOffset));
  return new File([salida], 'modelo.glb');
}

// GLTFLoader abre las imágenes con fetch(blob:) y createImageBitmap, y mira `self`, que Node no tiene.
function paraGlb(t) {
  globalThis.self = globalThis;
  t.after(() => delete globalThis.self);
}

test('un GLB solo decodifica la foto: ni la normal ni las demás texturas que no se usan', async (t) => {
  paraGlb(t);
  const abiertas = espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const malla = await leerArchivoDeEscaneo(armarGlb({
    imagenes: [imagen(111), imagen(40), imagen(41)],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 2 } }, normalTexture: { index: 1 }, occlusionTexture: { index: 2 } }],
  }));
  assert.deepEqual(abiertas, [111]);
  assert.ok(malla.textura, 'la foto sigue llegando');
  assert.ok(malla.uvs);
  assert.equal(malla.fotoPerdida, null);
});

test('los textos de un GLB dicen lo que pasó de verdad', async (t) => {
  paraGlb(t);
  espiarImagenes(t, { abre: true });
  lienzoDeMentira(t);
  const dosMallas = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }, { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 1 }] }];
  // Una sola imagen en una malla y otra malla sin foto: no es "en varias imágenes".
  const aMedias = await leerArchivoDeEscaneo(armarGlb({ imagenes: [imagen(111)], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }, {}], meshes: dosMallas }));
  assert.match(aMedias.fotoPerdida, /una parte/i);
  // Dos imágenes de foto de verdad sí.
  const enVarias = await leerArchivoDeEscaneo(armarGlb({ imagenes: [imagen(111), imagen(222)], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }, { pbrMetallicRoughness: { baseColorTexture: { index: 1 } } }], meshes: dosMallas }));
  assert.match(enVarias.fotoPerdida, /la foto en varias imágenes/);
  // La única imagen es una normal: exportar a 4K no arregla nada, y no hay foto que se perdiera.
  const soloNormal = await leerArchivoDeEscaneo(armarGlb({ imagenes: [imagen(40)], materials: [{ normalTexture: { index: 0 } }] }));
  assert.equal(soloNormal.fotoPerdida, null);
  // Un material con foto que ninguna malla usa tampoco es una foto que se perdió.
  const sobrante = await leerArchivoDeEscaneo(armarGlb({ imagenes: [imagen(111)], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }] }));
  assert.equal(sobrante.fotoPerdida, null);
  // Y si la foto de verdad no abre, eso.
  espiarImagenes(t);
  const noAbre = await leerArchivoDeEscaneo(armarGlb({ imagenes: [imagen(111)], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }] }));
  assert.match(noAbre.fotoPerdida, /no abrió/);
});

test('los errores de los cargadores salen en español y dicen qué hacer', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const dice = async (archivo, patron) => {
    const err = await leerArchivoDeEscaneo(archivo).then(() => null, (e) => e);
    assert.ok(err, 'tenía que fallar');
    assert.match(err.message, patron);
    assert.doesNotMatch(err.message, /invalid|THREE|failed|unexpected|undefined|offset/i);
  };
  const cortado = zipSync({ 'model.obj': strToU8(OBJ_CUADRADO) });
  await dice(new File([imagen(100)], 'no-es.zip'), /dañado o incompleto/);
  await dice(new File([cortado.subarray(0, cortado.length - 30)], 'cortado.zip'), /dañado o incompleto/);
  await dice(new File([strToU8('esto no es un GLB')], 'roto.glb'), /dañado o incompleto/);
  await dice(new File([strToU8('ply\nformat binary_little_endian 1.0\nelement vertex 10\nproperty float x\nend_header\n')], 'roto.ply'), /dañado o incompleto/);
  await dice(armarGlb({ extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] }), /comprimido.*sin compresión/);
  // Un ZIP con clave o con otro método de compresión: el directorio dice el 99, que es AES.
  const conClave = zipSync({ 'model.obj': strToU8(OBJ_CUADRADO) });
  new DataView(conClave.buffer, conClave.byteOffset).setUint16(entradaDelZip(conClave, 'model.obj').central + 10, 99, true);
  await dice(new File([conClave], 'clave.zip'), /comprimido.*sin compresión/);
  // El puerto 1 está prohibido para fetch: falla sin tocar la red, como un .bin que no vino.
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'http://127.0.0.1:1/scene.bin', byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  await dice(new File([JSON.stringify(gltf)], 'scene.gltf'), /archivo aparte.*GLB/);
  await dice(new File([strToU8('Rar!\x1a\x07\x00')], 'modelo.rar'), /GLB, ZIP, OBJ o PLY/);
  await dice(new File([imagen(50)], 'foto.png'), /GLB, ZIP, OBJ o PLY/);
  await dice(zipDe({ 'modelo.glb': imagen(50) }), /no trae un modelo OBJ.*sácalo del ZIP/);
  await dice(zipDe({ 'scene.usdc': imagen(50) }, 'modelo.usdz'), /no lee USDZ.*GLB, ZIP, OBJ o PLY/);
  // Sin memoria lo dice así: no es que esté dañado.
  await dice({ name: 'modelo.glb', size: 10, arrayBuffer: async () => { throw new RangeError('Array buffer allocation failed'); } }, /no cupo en la memoria/);
});

test('el error original de un cargador queda en la consola, y un mensaje nuestro no', async (t) => {
  const consola = t.mock.method(console, 'warn', () => {});
  // Sin esto, mensajeParaLaPantalla no lo escribe: el mensaje ya va en español.
  const dañado = await leerArchivoDeEscaneo(new File([imagen(100)], 'no-es.zip')).then(() => null, (e) => e);
  assert.match(dañado.message, /dañado o incompleto/);
  assert.match(dañado.cause.message, /invalid zip data/);
  assert.equal(consola.mock.callCount(), 1);
  assert.equal(consola.mock.calls[0].arguments[0], dañado.cause);
  // Un defecto de aquí mismo se lee igual en la pantalla: en la consola es lo único que lo delata.
  consola.mock.resetCalls();
  const defecto = new TypeError('defecto interno');
  const interno = await leerArchivoDeEscaneo(new File([OBJ_CUADRADO], 'model.obj'), [{ name: 'model.mtl', text() { throw defecto; } }]).then(() => null, (e) => e);
  assert.match(interno.message, /dañado o incompleto/);
  assert.equal(consola.mock.calls[0].arguments[0], defecto);
  // Lo que ya es un mensaje nuestro no es un error que haya que ir a arreglar.
  consola.mock.resetCalls();
  await assert.rejects(leerArchivoDeEscaneo(zipDe({ 'a.txt': strToU8('hola') })), /no trae un modelo/);
  await assert.rejects(leerArchivoDeEscaneo(new File([imagen(50)], 'foto.png')), /GLB, ZIP, OBJ o PLY/);
  assert.equal(consola.mock.callCount(), 0);
});
