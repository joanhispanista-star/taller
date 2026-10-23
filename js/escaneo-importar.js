// Importar un escaneo hecho con otra app (RealityScan, Scaniverse,
// Polycam, KIRI): un archivo GLB, glTF, OBJ o PLY que la persona comparte
// a la app desde el celular. Es el camino del iPhone (que no tiene WebXR)
// y el de quien quiera un escaneo mejor que el de la app.
//
// Lo de arriba del archivo es puro (se prueba en Node): juntar todas las
// mallas del archivo en una, adivinar qué eje es "arriba", corregir la
// escala si el archivo no viene en metros. Lo de abajo (leer el archivo con
// los cargadores de Three.js y sacar los colores de la textura) es del
// navegador y se importa solo cuando alguien sube un escaneo.
import * as THREE from 'three';
import { aislarCarro, cajaDe, estimarPiso, mallaDesdePuntos, procesarEscaneo, simplificarMalla, transformar } from './escaneo.js';

// Más triángulos que esto no se dibujan ni se etiquetan bien en un
// teléfono: la malla se simplifica (simplificarMalla, conserva el color).
export const TRIANGULOS_MAXIMOS = 500000;

// Junta las mallas (y nubes de puntos) de un objeto de Three.js en una sola
// malla en coordenadas del mundo: { posiciones, indices, colores }. Los
// colores salen del atributo 'color' si lo hay, o de `colorDeTextura(material,
// u, v)` si se da y el material tiene textura (en el navegador). Si el
// archivo es solo puntos (un PLY de nube o de splats), `indices` queda
// vacío y `esNube` en true.
export function mallaDeObjeto3D(objeto, { colorDeTextura = null } = {}) {
  objeto.updateMatrixWorld(true);
  // Primero contar, para reservar los arreglos de una vez: con push, un
  // escaneo de un millón de vértices pedía el doble de memoria (arreglos de
  // JavaScript con números de 8 bytes, más la copia final).
  const piezas = [];
  let vertices = 0;
  let indicesTotal = 0;
  let conColor = false;
  objeto.traverse((hijo) => {
    if (!(hijo.isMesh || hijo.isPoints) || !hijo.geometry || !hijo.geometry.attributes.position) return;
    const geo = hijo.geometry;
    const material = Array.isArray(hijo.material) ? hijo.material[0] : hijo.material;
    const conTextura = Boolean(colorDeTextura && geo.attributes.uv && material && material.map);
    if (geo.attributes.color || conTextura) conColor = true;
    piezas.push({ hijo, geo, material, conTextura });
    vertices += geo.attributes.position.count;
    if (hijo.isMesh) indicesTotal += geo.index ? geo.index.count : geo.attributes.position.count;
  });
  const posiciones = new Float32Array(vertices * 3);
  const colores = conColor ? new Uint8Array(vertices * 3).fill(128) : null;
  const indices = new Uint32Array(indicesTotal);
  let nube = false;
  let v0 = 0;
  let i0 = 0;
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  for (const { hijo, geo, material, conTextura } of piezas) {
    const p = geo.attributes.position;
    const c = geo.attributes.color || null;
    const uv = geo.attributes.uv || null;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(hijo.matrixWorld);
      const k = (v0 + i) * 3;
      posiciones[k] = v.x;
      posiciones[k + 1] = v.y;
      posiciones[k + 2] = v.z;
      if (c) {
        // Los cargadores dejan el color en lineal (0-1); se guarda en sRGB 0-255.
        color.setRGB(c.getX(i), c.getY(i), c.getZ(i)).convertLinearToSRGB();
        colores[k] = Math.round(color.r * 255);
        colores[k + 1] = Math.round(color.g * 255);
        colores[k + 2] = Math.round(color.b * 255);
      } else if (conTextura) {
        const [r, g, b] = colorDeTextura(material, uv.getX(i), uv.getY(i));
        colores[k] = r;
        colores[k + 1] = g;
        colores[k + 2] = b;
      }
    }
    if (hijo.isPoints) {
      nube = true;
    } else if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) indices[i0++] = v0 + geo.index.getX(i);
    } else {
      for (let i = 0; i < p.count; i++) indices[i0++] = v0 + i;
    }
    v0 += p.count;
  }
  // Los vértices de una malla sin color (si otra sí lo traía) quedan grises.
  return { posiciones, indices: indices.subarray(0, i0), colores, esNube: nube && i0 === 0 };
}

// Qué eje es "arriba". Las apps de escaneo del celular exportan con y hacia
// arriba (glTF lo exige; RealityScan lo cumple), pero un OBJ de
// fotogrametría puede venir con z arriba. El piso alrededor del carro es un
// plano lleno QUE RODEA al objeto: para cada uno de los seis sentidos (±x,
// ±y, ±z) se busca la franja de 3 cm más llena del tercio de abajo, y solo
// cuenta como piso si tiene al menos el 4 % de los puntos y si, en los
// otros dos ejes, cubre el 85 % de lo que cubre todo el escaneo. Lo segundo
// es lo que separa un piso de un costado o del techo, que también son
// planos llenos (la primera versión acostaba o volteaba un carro recortado
// sin piso: el costado ganaba; revisión del 22-oct-2026). Sin piso que
// rodee, se queda y arriba. Las posiciones tienen que venir en metros
// (ajustarEscala antes). Devuelve la matriz de giro y el eje elegido.
export function detectarArriba(posiciones, { franja = 0.03 } = {}) {
  const n = posiciones.length / 3;
  if (n < 100) return { matriz: new THREE.Matrix4(), eje: '+y' };
  const paso = Math.max(1, Math.floor(n / 60000));
  const muestra = [];
  for (let i = 0; i < n; i += paso) muestra.push(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]);
  const m = muestra.length / 3;
  const rango = (k, filtro = null) => {
    const v = [];
    for (let i = 0; i < m; i++) if (!filtro || filtro(i)) v.push(muestra[i * 3 + k]);
    if (v.length < 2) return 0;
    v.sort((a, b) => a - b);
    return v[Math.floor((v.length - 1) * 0.98)] - v[Math.floor((v.length - 1) * 0.02)];
  };
  const caja = cajaDe(Float32Array.from(muestra));
  const rangoTodo = [0, 1, 2].map((k) => rango(k));
  let mejor = { eje: '+y', fraccion: 0 };
  for (const [k, nombre] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
    const tercio = (caja.max[k] - caja.min[k]) / 3;
    const bins = new Float64Array(Math.max(1, Math.ceil(tercio / franja)) + 1);
    for (const signo of [1, -1]) {
      const altura = (i) => (signo > 0 ? muestra[i * 3 + k] - caja.min[k] : caja.max[k] - muestra[i * 3 + k]);
      bins.fill(0);
      for (let i = 0; i < m; i++) {
        const h = altura(i);
        if (h <= tercio) bins[Math.floor(h / franja)]++;
      }
      let pico = 0;
      for (let b = 1; b < bins.length; b++) if (bins[b] > bins[pico]) pico = b;
      const fraccion = bins[pico] / m;
      if (fraccion < 0.04) continue;
      // ¿Rodea? En los otros dos ejes, la franja cubre casi todo lo que cubre el escaneo.
      const enFranja = (i) => Math.floor(altura(i) / franja) === pico;
      const otros = [0, 1, 2].filter((e) => e !== k);
      const rodea = otros.every((e) => rangoTodo[e] > 0 && rango(e, enFranja) >= 0.85 * rangoTodo[e]);
      if (!rodea) continue;
      // A igualdad, y arriba gana (es lo que exportan casi todas).
      const ventaja = nombre === 'y' && signo > 0 ? 1.15 : 1;
      if (fraccion * ventaja > mejor.fraccion) mejor = { eje: (signo > 0 ? '+' : '-') + nombre, fraccion: fraccion * ventaja };
    }
  }
  return { matriz: matrizParaArriba(mejor.eje), eje: mejor.eje };
}

// El giro que lleva el eje dado (+y, -y, +z, -z, +x, -x) a +y.
export function matrizParaArriba(eje) {
  const matriz = new THREE.Matrix4();
  if (eje === '-y') matriz.makeRotationX(Math.PI);
  else if (eje === '+z') matriz.makeRotationX(-Math.PI / 2);
  else if (eje === '-z') matriz.makeRotationX(Math.PI / 2);
  else if (eje === '+x') matriz.makeRotationZ(Math.PI / 2);
  else if (eje === '-x') matriz.makeRotationZ(-Math.PI / 2);
  return matriz;
}

// Los seis "arriba" posibles, en el orden en que los recorre el botón
// "Está acostado" de la vista previa.
export const EJES_ARRIBA = ['+y', '+z', '-z', '+x', '-x', '-y'];

// La escala. Un escaneo de celular con ARCore o LiDAR viene en metros; uno
// de fotogrametría pura puede venir en centímetros, milímetros o sin
// unidad. Si lo más largo del archivo mide entre 2 y 40 m (un carro con su
// piso alrededor), se deja; si mide de 200 a 4.000, eran centímetros; de
// 2.000 a 40.000, milímetros; y si no cuadra con nada, se escala para que
// mida lo que dice el catálogo (o 4,3 m). Devuelve el factor y por qué,
// para decirlo en la pantalla: una escala puesta a mano no es una medida.
//
// `medido` dice si el tamaño sigue siendo medido (metros, o centímetros y
// milímetros convertidos: la medida es la misma) o si lo puso la app
// (escalado al catálogo): solo en ese caso la pantalla dice que no es medido.
//
// Lo más largo se mide entre los percentiles 0,5 y 99,5 de cada eje, no
// entre el mínimo y el máximo: unos pocos puntos sueltos a 60 m (un reflejo,
// un pedazo de pared) cambiaban la escala de un archivo que sí venía en
// metros. Y los centímetros van de 200 a 2.000 (no a 4.000): un carro chico
// en milímetros sin piso mide de 2.600 a 4.000, y se tomaba por centímetros
// (10 veces más grande y "medido"). Un carro en centímetros mide de 260 a
// 650, así que no se pierde nada (revisión del 22-oct-2026).
export function ajustarEscala(posiciones, { largoCatalogo = null } = {}) {
  const n = posiciones.length / 3;
  const paso = Math.max(1, Math.floor(n / 60000));
  const extension = [0, 1, 2].map((k) => {
    const v = [];
    for (let i = 0; i < n; i += paso) v.push(posiciones[i * 3 + k]);
    v.sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) * 0.995)] - v[Math.floor((v.length - 1) * 0.005)] : 0;
  });
  const mayor = Math.max(...extension);
  if (mayor >= 2 && mayor <= 40) return { posiciones, factor: 1, motivo: '', medido: true };
  if (mayor >= 200 && mayor < 2000) return { posiciones: escalar(posiciones, 0.01), factor: 0.01, motivo: 'venía en centímetros', medido: true };
  if (mayor >= 2000 && mayor <= 40000) return { posiciones: escalar(posiciones, 0.001), factor: 0.001, motivo: 'venía en milímetros', medido: true };
  const objetivo = largoCatalogo ? (largoCatalogo > 100 ? largoCatalogo / 1000 : largoCatalogo) : 4.3;
  const factor = objetivo / (mayor || 1);
  return { posiciones: escalar(posiciones, factor), factor, motivo: 'el archivo no traía medidas reales: lo escalé al largo ' + (largoCatalogo ? 'del catálogo' : 'típico de un carro'), medido: false };
}

function escalar(posiciones, factor) {
  const salida = new Float32Array(posiciones.length);
  for (let i = 0; i < posiciones.length; i++) salida[i] = posiciones[i] * factor;
  return salida;
}

// De la malla del archivo al escaneo procesado (escaneo.js): arriba,
// escala, y si es una nube o una malla gigante, malla nueva desde sus
// puntos (los puntos siguen siendo los que miden).
//
// `ejeArriba`: si la persona dijo que quedó acostado, el eje que eligió con
// el botón (uno de EJES_ARRIBA); si no, el que adivina detectarArriba.
export function procesarImportado(malla, { carroceria = 'sedan', medidasCatalogo = null, voltear = false, ejeArriba = null } = {}) {
  // Primero la escala (no depende de qué eje es arriba) y con eso, en
  // metros, el piso que dice dónde es arriba.
  const escala = ajustarEscala(malla.posiciones, { largoCatalogo: medidasCatalogo && medidasCatalogo.largo });
  const arriba = ejeArriba ? { matriz: matrizParaArriba(ejeArriba), eje: ejeArriba } : detectarArriba(escala.posiciones);
  const posiciones = transformar(escala.posiciones, arriba.matriz);
  const triangulos = malla.indices.length / 3;
  let base;
  let puntos = null;
  if (malla.esNube || triangulos === 0) {
    puntos = posiciones;
    // Solo se malla el carro (con 30 cm de margen), no el piso ni lo de
    // alrededor: con el piso, una nube de 2 MB daba 680.000 triángulos y
    // 3 s solo en hacerlos.
    base = { ...mallaDesdePuntos(soloElCarro(posiciones), { voxel: 0.025 }), colores: null };
  } else {
    base = { posiciones, indices: malla.indices, colores: malla.colores };
    if (triangulos > TRIANGULOS_MAXIMOS) base = simplificarMalla(base, { maximo: TRIANGULOS_MAXIMOS });
  }
  // La malla rehecha de puntos sale grumosa: se alisa (después de medir).
  const escaneo = procesarEscaneo(base, { carroceria, medidasCatalogo, voltear, puntos, suavizar: Boolean(puntos) });
  escaneo.escalaAjustada = escala.motivo ? { factor: escala.factor, motivo: escala.motivo, medido: escala.medido } : null;
  escaneo.ejeArriba = arriba.eje;
  escaneo.rehecha = Boolean(puntos);
  return escaneo;
}

// Los puntos del carro y lo que esté a menos de 30 cm de su caja, sin la
// banda del piso.
function soloElCarro(posiciones) {
  const piso = estimarPiso(posiciones);
  const mascara = aislarCarro(posiciones, { piso });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], posiciones[i * 3 + k]);
      max[k] = Math.max(max[k], posiciones[i * 3 + k]);
    }
  }
  if (min[0] === Infinity) return posiciones;
  const salida = [];
  for (let i = 0; i < posiciones.length; i += 3) {
    const x = posiciones[i];
    const y = posiciones[i + 1];
    const z = posiciones[i + 2];
    if (y < piso + 0.02) continue;
    if (x < min[0] - 0.3 || x > max[0] + 0.3 || z < min[2] - 0.3 || z > max[2] + 0.3 || y > max[1] + 0.3) continue;
    salida.push(x, y, z);
  }
  return new Float32Array(salida);
}

// ---------- En el navegador ----------

// Lee el archivo con el cargador de Three.js que le toca y devuelve la
// malla junta. Los cargadores se importan aquí (180 KB que solo hacen
// falta cuando alguien sube un escaneo). La textura, si la hay, se reduce
// a 1024 px para sacarle el color a cada vértice: una textura de 8K son
// 256 MB en memoria.
export async function leerArchivoDeEscaneo(archivo) {
  const nombre = (archivo.name || '').toLowerCase();
  // Un OBJ de 36 MB ya lleva el navegador a casi 500 MB de memoria
  // (investigación del 22-oct-2026): un OBJ (texto) de más de 60 MB, o un
  // GLB/PLY (binario) de más de 100 MB, no cabe en un celular de gama media.
  const esTexto = nombre.endsWith('.obj');
  const tope = esTexto ? 60e6 : 100e6;
  if (archivo.size > tope) throw new Error('el archivo pesa ' + Math.round(archivo.size / 1e6) + ' MB; exporta el escaneo más liviano (menos de ' + Math.round(tope / 1e6) + ' MB)');
  const datos = await archivo.arrayBuffer();
  // Un OBJ es texto con líneas "v x y z" y "f a b c": se reconoce aunque
  // el archivo no traiga la extensión (el selector ya no filtra).
  const muestraTexto = new TextDecoder().decode(new Uint8Array(datos, 0, Math.min(4096, datos.byteLength)));
  const pareceObj = /^(v|vn|vt|f|o|g|mtllib|usemtl)\s/m.test(muestraTexto);
  const cabeza = new TextDecoder().decode(new Uint8Array(datos, 0, Math.min(4, datos.byteLength)));
  let objeto;
  if (nombre.endsWith('.glb') || nombre.endsWith('.gltf') || cabeza === 'glTF') {
    const { GLTFLoader } = await import('./vendor/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(datos, '');
    objeto = gltf.scene;
  } else if (nombre.endsWith('.ply') || cabeza.startsWith('ply')) {
    const { PLYLoader } = await import('./vendor/loaders/PLYLoader.js');
    const geo = new PLYLoader().parse(datos);
    // Con caras es malla; sin caras, una nube (o los centros de un splat).
    objeto = geo.index ? new THREE.Mesh(geo) : new THREE.Points(geo);
  } else if (nombre.endsWith('.obj') || pareceObj) {
    const { OBJLoader } = await import('./vendor/loaders/OBJLoader.js');
    objeto = new OBJLoader().parse(new TextDecoder().decode(datos));
  } else {
    throw new Error('Ese archivo no es un escaneo que la app sepa leer (GLB, glTF, OBJ o PLY)');
  }
  return mallaDeObjeto3D(objeto, { colorDeTextura: crearLectorDeTextura() });
}

function crearLectorDeTextura() {
  const cache = new Map();
  return (material, u, v) => {
    let lectura = cache.get(material.map);
    if (lectura === undefined) {
      lectura = null;
      try {
        const imagen = material.map.image;
        const ancho = Math.min(1024, imagen.width || 1024);
        const alto = Math.min(1024, imagen.height || 1024);
        const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imagen, 0, 0, ancho, alto);
        lectura = { datos: ctx.getImageData(0, 0, ancho, alto).data, ancho, alto, voltearV: material.map.flipY !== false };
      } catch {
        lectura = null;
      }
      cache.set(material.map, lectura);
    }
    if (!lectura) return [180, 180, 180];
    // glTF trae flipY = false: v = 0 es arriba en la imagen.
    const x = Math.min(lectura.ancho - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * lectura.ancho)));
    const vv = (((v % 1) + 1) % 1);
    const y = Math.min(lectura.alto - 1, Math.max(0, Math.floor((lectura.voltearV ? 1 - vv : vv) * lectura.alto)));
    const i = (y * lectura.ancho + x) * 4;
    return [lectura.datos[i], lectura.datos[i + 1], lectura.datos[i + 2]];
  };
}
