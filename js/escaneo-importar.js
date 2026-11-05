// Importar un escaneo hecho con otra app (RealityScan, Scaniverse,
// Polycam, KIRI): un archivo GLB, glTF, ZIP, OBJ o PLY que la persona comparte
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
import { giroDeNivel } from './escaneo-nivel.js';
import { leerObj } from './escaneo-obj.js';

// Más triángulos que esto no se dibujan ni se etiquetan bien en un
// teléfono: la malla se simplifica (simplificarMalla, conserva el color).
export const TRIANGULOS_MAXIMOS = 500000;

// Lo que dice la vista previa cuando un archivo se queda sin foto. Cada uno afirma solo lo que
// se sabe: la misma foto dañada decía "no cupo" en un GLB y "no trae" en un ZIP que la traía.
const FOTO_EN_VARIAS = 'Este archivo trae la foto en varias imágenes, y la app solo sabe usar una: se ve sin ella.';
const FOTO_A_MEDIAS = 'Una parte de este modelo se quedó sin foto, y la app solo la pega si la tiene todo: se ve sin ella.';
const FOTO_SIN_COORDENADAS = 'Este modelo no trae coordenadas para pegarle la foto: se ve sin ella. Expórtalo con textura.';
const FOTO_NO_ABRIO = 'La foto del archivo no abrió en este celular: expórtalo con textura de 4K.';
const FOTO_EN_DUDA = 'Vinieron varias imágenes y no sé cuál es la foto del carro: se ve sin ella. Súbelo con la foto sola, o con su archivo de materiales (.mtl).';
const FOTO_SIN_MATERIALES = 'Este modelo tiene varios materiales y no sé si esa imagen es la foto de todos: se ve sin ella. Súbelo con su archivo de materiales (.mtl).';
const FOTO_NO_PARECE ='Ninguna imagen de este archivo parece la foto del carro: se ve sin ella. Si una sí lo es, cámbiale el nombre a «foto» y súbela con el modelo.';

// Una geometría sin índice (OBJLoader repite las tres esquinas de cada triángulo) soldada por
// valores EXACTOS: esto corre antes de ajustarEscala, así que las unidades todavía no son
// metros, y el redondeo de soldarVertices se sale de sus 17 bits por eje en un archivo en
// milímetros y en uno de escala chica funde vértices distintos. Basta, porque el mismo `v`/`vt`
// repite los mismos bits. Con una tabla de bits y no con cadenas, para no pedir memoria por
// vértice. Sin soldar, cada triángulo era su propia isla de foto: 1,3 millones de vértices donde
// el GLB del mismo carro tiene 155 mil.
function soldarSinIndice(geo) {
  const nombres = ['position', 'uv', 'color'].filter((a) => geo.attributes[a]);
  const atributos = nombres.map((a) => geo.attributes[a]);
  const ancho = atributos.reduce((suma, a) => suma + a.itemSize, 0);
  const n = geo.attributes.position.count;
  const valores = new Float32Array(n * ancho);
  const bits = new Uint32Array(valores.buffer);
  let k = 0;
  for (let i = 0; i < n; i++) for (const a of atributos) for (let c = 0; c < a.itemSize; c++) valores[k++] = a.getComponent(i, c);
  // Dos materiales no comparten vértice: cada uno saca el color de su propia imagen.
  const grupoDe = geo.groups.length ? new Uint16Array(n) : null;
  for (const g of geo.groups) grupoDe.fill(g.materialIndex, g.start, g.start + g.count);
  const mascara = 2 ** Math.ceil(Math.log2(n * 2 + 2)) - 1;
  const tabla = new Int32Array(mascara + 1).fill(-1);
  const indice = new Uint32Array(n);
  const primera = new Uint32Array(n);
  let cuantos = 0;
  for (let i = 0; i < n; i++) {
    let h = grupoDe ? grupoDe[i] : 0;
    for (let c = i * ancho; c < (i + 1) * ancho; c++) h = Math.imul(h ^ bits[c], 16777619);
    let hueco = (h ^ (h >>> 15)) & mascara;
    for (;;) {
      const v = tabla[hueco];
      if (v < 0) {
        tabla[hueco] = cuantos;
        primera[cuantos] = i;
        indice[i] = cuantos++;
        break;
      }
      const otra = primera[v];
      let igual = !grupoDe || grupoDe[otra] === grupoDe[i];
      for (let c = 0; igual && c < ancho; c++) igual = bits[otra * ancho + c] === bits[i * ancho + c];
      if (igual) {
        indice[i] = v;
        break;
      }
      hueco = (hueco + 1) & mascara;
    }
  }
  const soldada = new THREE.BufferGeometry();
  let desde = 0;
  atributos.forEach((a, cual) => {
    const salida = new Float32Array(cuantos * a.itemSize);
    for (let v = 0; v < cuantos; v++) for (let c = 0; c < a.itemSize; c++) salida[v * a.itemSize + c] = valores[primera[v] * ancho + desde + c];
    soldada.setAttribute(nombres[cual], new THREE.BufferAttribute(salida, a.itemSize));
    desde += a.itemSize;
  });
  soldada.setIndex(new THREE.BufferAttribute(indice, 1));
  for (const g of geo.groups) soldada.addGroup(g.start, g.count, g.materialIndex);
  return soldada;
}

// Junta las mallas (y nubes de puntos) de un objeto de Three.js en una sola
// malla en coordenadas del mundo: { posiciones, indices, colores }. Los
// colores salen del atributo 'color' si lo hay, o de `colorDeTextura(material,
// u, v)` si se da y el material tiene textura (en el navegador). Si el
// archivo es solo puntos (un PLY de nube o de splats), `indices` queda
// vacío y `esNube` en true.
//
// Si TODO el archivo usa una sola textura (RealityScan, la tubería del PC),
// además se conservan las coordenadas: `uvs` (con v = 0 arriba en la imagen,
// venga como venga) y `mapa`, la textura de Three.js. El color por vértice
// sigue haciendo falta (la máscara de pintura, y lo que se ve mientras carga
// la imagen), pero es lo que antes se quedaba: una mancha de 2 cm donde el
// archivo traía el logo, los rines y la parrilla.
//
// OBJLoader hace UNA malla con `material` en arreglo y `geometry.groups`: por eso se miran todos
// los materiales y cada vértice saca el color del material de su grupo. Con solo el primero, un
// OBJ de dos atlas parecía de una imagen y salía con la foto revuelta, sin aviso.
export function mallaDeObjeto3D(objeto, { colorDeTextura = null } = {}) {
  objeto.updateMatrixWorld(true);
  // Primero contar, para reservar los arreglos de una vez: con push, un
  // escaneo de un millón de vértices pedía el doble de memoria (arreglos de
  // JavaScript con números de 8 bytes, más la copia final).
  const piezas = [];
  let vertices = 0;
  let indicesTotal = 0;
  let conColor = false;
  const mapas = new Set();
  let algunaSinMapa = false;
  let fotoSinCoordenadas = false;
  objeto.traverse((hijo) => {
    if (!(hijo.isMesh || hijo.isPoints) || !hijo.geometry || !hijo.geometry.attributes.position) return;
    // Solo las mallas: un PLY de puntos tampoco trae índice, y `esNube` los necesita todos.
    const geo = hijo.isMesh && !hijo.geometry.index ? soldarSinIndice(hijo.geometry) : hijo.geometry;
    const materiales = materialesDe(hijo);
    const conMapa = materiales.filter((m) => m && m.map);
    if (conMapa.length && !geo.attributes.uv) fotoSinCoordenadas = true;
    const conTextura = Boolean(colorDeTextura && geo.attributes.uv && conMapa.length);
    if (geo.attributes.color || conTextura) conColor = true;
    if (conTextura) for (const m of conMapa) mapas.add(m.map);
    if (!conTextura || conMapa.length < materiales.length) algunaSinMapa = true;
    piezas.push({ hijo, geo, materiales, conTextura });
    vertices += geo.attributes.position.count;
    if (hijo.isMesh) indicesTotal += geo.index ? geo.index.count : geo.attributes.position.count;
  });
  const posiciones = new Float32Array(vertices * 3);
  const colores = conColor ? new Uint8Array(vertices * 3).fill(128) : null;
  const indices = new Uint32Array(indicesTotal);
  const mapa = mapas.size === 1 && !algunaSinMapa ? [...mapas][0] : null;
  const uvs = mapa ? new Float32Array(vertices * 2) : null;
  let nube = false;
  let v0 = 0;
  let i0 = 0;
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  for (const { hijo, geo, materiales, conTextura } of piezas) {
    const p = geo.attributes.position;
    const c = geo.attributes.color || null;
    const uv = geo.attributes.uv || null;
    const materialDe = conTextura && materiales.length > 1 && geo.groups.length ? new Uint16Array(p.count) : null;
    if (materialDe) for (const g of geo.groups) for (let k = g.start; k < g.start + g.count; k++) materialDe[geo.index ? geo.index.getX(k) : k] = g.materialIndex;
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
        const material = materiales[materialDe ? materialDe[i] : 0];
        if (material && material.map) {
          const [r, g, b] = colorDeTextura(material, uv.getX(i), uv.getY(i));
          colores[k] = r;
          colores[k + 1] = g;
          colores[k + 2] = b;
        }
      }
      if (uvs) {
        uvs[(v0 + i) * 2] = uv.getX(i);
        uvs[(v0 + i) * 2 + 1] = mapa.flipY === false ? uv.getY(i) : 1 - uv.getY(i);
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
  let fotoPerdida = null;
  if (fotoSinCoordenadas) fotoPerdida = FOTO_SIN_COORDENADAS;
  else if (mapas.size > 1) fotoPerdida = FOTO_EN_VARIAS;
  else if (mapas.size === 1 && algunaSinMapa) fotoPerdida = FOTO_A_MEDIAS;
  return { posiciones, indices: indices.subarray(0, i0), colores, esNube: nube && i0 === 0, uvs, mapa, fotoPerdida };
}

function materialesDe(malla) {
  return Array.isArray(malla.material) ? malla.material : [malla.material];
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
    // Se nivela aquí, y no solo en procesarEscaneo: soloElCarro ya busca el piso, y con pendiente
    // bota media nube. Allá el giro da cero, porque esto ya quedó a nivel.
    const nivel = giroDeNivel(posiciones);
    puntos = nivel ? transformar(posiciones, nivel.matriz) : posiciones;
    // Solo se malla el carro (con 30 cm de margen), no el piso ni lo de
    // alrededor: con el piso, una nube de 2 MB daba 680.000 triángulos y
    // 3 s solo en hacerlos.
    base = { ...mallaDesdePuntos(soloElCarro(puntos), { voxel: 0.025 }), colores: null };
  } else {
    base = { posiciones, indices: malla.indices, colores: malla.colores, uvs: malla.uvs || null };
    // El tope se aplica a lo que queda del carro (procesarEscaneo). Un archivo descomunal
    // se reduce antes, para que quepa en la memoria mientras se recorta.
    if (triangulos > TRIANGULOS_MAXIMOS * 4) base = simplificarMalla(base, { maximo: TRIANGULOS_MAXIMOS * 4 });
  }
  // La malla rehecha de puntos sale grumosa: se alisa (después de medir).
  const escaneo = procesarEscaneo(base, { carroceria, medidasCatalogo, voltear, puntos, suavizar: Boolean(puntos), luz: malla.luz || null, maximoTriangulos: TRIANGULOS_MAXIMOS });
  escaneo.escalaAjustada = escala.motivo ? { factor: escala.factor, motivo: escala.motivo, medido: escala.medido } : null;
  escaneo.ejeArriba = arriba.eje;
  escaneo.rehecha = Boolean(puntos);
  escaneo.textura = escaneo.uvs ? malla.textura || null : null;
  escaneo.fotoPerdida = escaneo.textura ? null : malla.fotoPerdida || null;
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

// Un error que ya está en español y dice qué hacer: pasa tal cual a la pantalla. Los demás
// vienen de los cargadores, en inglés y con nombres internos ("invalid zip data"), y salían así.
class ArchivoNoSirve extends Error {}

// Lo que se sabe de un error de un cargador, sin afirmar más: no hay forma de distinguir un
// archivo dañado de un cargador que no lo entiende.
function enEspanol(err) {
  const mensaje = String((err && err.message) || err);
  if (/allocation failed|out of memory/i.test(mensaje)) return 'no cupo en la memoria de este celular; exporta el escaneo más liviano';
  if (/draco|ktx2|meshopt|unknown compression/i.test(mensaje)) return 'viene comprimido de una forma que la app no sabe abrir; expórtalo sin compresión';
  if (/failed to load buffer/i.test(mensaje)) return 'guarda la malla en un archivo aparte; expórtalo como GLB, que va en uno solo';
  return 'puede estar dañado o incompleto; vuelve a exportarlo';
}

// Lee el archivo con el cargador que le toca y devuelve la malla junta. Los cargadores se
// importan aquí (180 KB que solo hacen falta cuando alguien sube un escaneo). La textura, si la
// hay, se reduce a 1024 px para sacarle el color a cada vértice: una textura de 8K son 256 MB
// en memoria.
//
// `otros`: los demás archivos elegidos a la vez (un OBJ con su imagen y sus materiales,
// sueltos). También entiende el ZIP que da RealityScan en iPhone: el OBJ con su foto y sus
// materiales.
export async function leerArchivoDeEscaneo(archivo, otros = []) {
  try {
    return await leerArchivo(archivo, otros);
  } catch (err) {
    if (err instanceof ArchivoNoSirve) throw err;
    // mensajeParaLaPantalla solo deja el original en la consola cuando cambia el mensaje, y este ya
    // va en español. Sin esto, un ZIP de iPhone que el lector no entienda y un defecto de aquí mismo
    // decían los dos «dañado», sin rastro de cuál fue.
    console.warn(err);
    throw new ArchivoNoSirve(enEspanol(err), { cause: err });
  }
}

async function leerArchivo(archivo, otros) {
  const nombre = (archivo.name || '').toLowerCase();
  // Un USDZ también empieza como un ZIP, y decía "no trae un modelo OBJ".
  if (nombre.endsWith('.usdz')) throw new ArchivoNoSirve('la app no lee USDZ; expórtalo como GLB, ZIP, OBJ o PLY');
  // Un OBJ de 36 MB ya llevaba el navegador a casi 500 MB de memoria con OBJLoader
  // (investigación del 22-oct-2026), que sigue siendo el respaldo del lector propio: un
  // OBJ (texto) de más de 60 MB, o un GLB/PLY (binario) de más de 100 MB, no cabe en un
  // celular de gama media.
  const esTexto = nombre.endsWith('.obj');
  const tope = esTexto ? 60e6 : 100e6;
  if (archivo.size > tope) throw new ArchivoNoSirve('el archivo pesa ' + Math.round(archivo.size / 1e6) + ' MB; exporta el escaneo más liviano (menos de ' + Math.round(tope / 1e6) + ' MB)');
  const datos = await archivo.arrayBuffer();
  // Un OBJ es texto con líneas "v x y z" y "f a b c": se reconoce aunque
  // el archivo no traiga la extensión (el selector ya no filtra).
  const muestraTexto = new TextDecoder().decode(new Uint8Array(datos, 0, Math.min(4096, datos.byteLength)));
  const pareceObj = /^(v|vn|vt|f|o|g|mtllib|usemtl)\s/m.test(muestraTexto);
  const cabeza = new TextDecoder().decode(new Uint8Array(datos, 0, Math.min(4, datos.byteLength)));
  let objeto;
  // Lo que dirá la vista previa si al final no hay foto.
  let avisoDeFoto = null;
  if (nombre.endsWith('.zip') || cabeza === 'PK\x03\x04') {
    ({ objeto, avisoDeFoto } = await objetoDesdeZip(datos));
  } else if (nombre.endsWith('.glb') || nombre.endsWith('.gltf') || cabeza === 'glTF') {
    const { GLTFLoader } = await import('./vendor/loaders/GLTFLoader.js');
    const cargador = new GLTFLoader();
    cargador.register(soloLaFoto);
    const gltf = await cargador.parseAsync(datos, '');
    objeto = gltf.scene;
    // El cargador se traga el error de abrir la imagen: el material queda sin foto. Y lo que
    // cuenta es que un material de la malla la pida: tener imágenes no basta, una normal también
    // lo es, y un GLB cuya única imagen era una normal decía que la foto no había cabido.
    const { materials = [], meshes = [] } = gltf.parser.json;
    if (meshes.some((m) => m.primitives.some((p) => materials[p.material]?.pbrMetallicRoughness?.baseColorTexture))) avisoDeFoto = FOTO_NO_ABRIO;
  } else if (nombre.endsWith('.ply') || cabeza.startsWith('ply')) {
    const { PLYLoader } = await import('./vendor/loaders/PLYLoader.js');
    const geo = new PLYLoader().parse(datos);
    // Con caras es malla; sin caras, una nube (o los centros de un splat).
    objeto = geo.index ? new THREE.Mesh(geo) : new THREE.Points(geo);
  } else if (nombre.endsWith('.obj') || pareceObj) {
    objeto = await objetoDeObj(new Uint8Array(datos));
    // Un OBJ no trae la foto adentro: va al lado. Si la eligieron con él, se le pone.
    const nombreMtl = elegirMtl(objeto, archivo.name || '', otros.map((f) => f.name).filter((n) => /\.mtl$/i.test(n)));
    const mtl = nombreMtl ? await otros.find((f) => f.name === nombreMtl).text() : '';
    avisoDeFoto = await ponerFotos(objeto, otros.map((f) => ({ nombre: f.name, abrir: () => f })), mtl);
  } else {
    throw new ArchivoNoSirve('no es un escaneo que la app sepa leer (GLB, ZIP, OBJ o PLY)');
  }
  const malla = mallaDeObjeto3D(objeto, { colorDeTextura: crearLectorDeTextura() });
  if (malla.mapa) {
    malla.textura = await blobDeTextura(malla.mapa.image);
    malla.luz = luzDeTextura(malla.mapa.image);
    // Ya salió lo que hacía falta de la foto (hasta 268 MB a 8K).
    if (malla.mapa.image.close) malla.mapa.image.close();
  }
  if (!malla.textura && !malla.fotoPerdida) malla.fotoPerdida = avisoDeFoto || (malla.mapa ? FOTO_NO_ABRIO : null);
  if (!malla.textura) malla.uvs = null;
  malla.mapa = null;
  return malla;
}

// GLTFLoader abre todas las imágenes del material, y la app solo usa `map`. Con una normal y una
// ORM de 8K al lado de la foto eran +1.203 MB de pico en el PC; así, +626 MB.
function soloLaFoto(parser) {
  const original = parser.assignTexture.bind(parser);
  parser.assignTexture = (parametros, mapa, definicion, color) => (mapa === 'map' ? original(parametros, mapa, definicion, color) : Promise.resolve(null));
  return { name: 'solo-la-foto' };
}

// El lector propio y, si encuentra algo que no sabe leer, OBJLoader (escaneo-obj.js).
async function objetoDeObj(bytes) {
  const lectura = leerObj(bytes);
  if (!lectura) {
    const { OBJLoader } = await import('./vendor/loaders/OBJLoader.js');
    return new OBJLoader().parse(new TextDecoder().decode(bytes));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(lectura.posiciones, 3));
  if (lectura.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(lectura.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(lectura.indices, 1));
  const materiales = lectura.materiales.map((name) => new THREE.MeshBasicMaterial({ name }));
  if (materiales.length > 1) for (const g of lectura.grupos) geo.addGroup(g.inicio, g.cuenta, g.material);
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geo, materiales.length > 1 ? materiales : materiales[0]));
  grupo.materialLibraries = lectura.bibliotecas;
  return grupo;
}

const IMAGEN = /\.(jpe?g|png|webp)$/i;
const soloNombre = (ruta) => ruta.replace(/"/g, '').split(/[\\/]/).pop();
const base = (ruta) => soloNombre(ruta).toLowerCase();
// Si una línea del MTL nombra ese archivo. El nombre va al final: antes pueden venir opciones
// (-s 1 1 1, -bm 1.0), y puede ir entre comillas o con espacios.
const nombra = (linea, archivo) => base(linea) === base(archivo) || base(linea).endsWith(' ' + base(archivo));
// [ \t] y no \s, que también salta de línea: un «map_Kd» vacío se comía la línea siguiente, y la
// normal de un «map_Bump relieve.jpg» salía de foto, en azul [128,127,254].
const MAP_KD = /^[ \t]*map_Kd[ \t]+(\S.*?)[ \t]*$/gim;
const carpeta = (n) => n.slice(0, Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1);

// Cuántas carpetas comparten dos rutas de un ZIP. La misma carpeta cuenta una más, por el '' que
// deja el split al final: la imagen de al lado va antes que la de una subcarpeta.
function carpetasEnComun(a, b) {
  const x = carpeta(a).split(/[\\/]/);
  const y = carpeta(b).split(/[\\/]/);
  let k = 0;
  while (k < x.length && x[k] === y[k]) k++;
  return k;
}

// Los MTL de un ZIP pueden ser de otro modelo: el que nombra su mtllib o, si no, el de su carpeta.
// En el ZIP vienen del más cercano al más lejano, y por eso gana el suyo si dos se llaman igual.
function elegirMtl(objeto, nombreObj, mtls) {
  const bibliotecas = objeto.materialLibraries || [];
  return mtls.find((m) => bibliotecas.some((l) => nombra(l, m))) || mtls.find((m) => carpeta(m) === carpeta(nombreObj)) || null;
}

// Por lo que dice su nombre: por palabras y no por pedazos, porque 'nor' está en 'interior' y
// 'ao' en 'Bilbao'. 'normal' y 'nrm' sí valen pegados (modelnormal.jpg).
const NO_ES_FOTO = new Set(['nor', 'norm', 'bump', 'height', 'disp', 'displacement', 'rough', 'roughness', 'metal', 'metallic', 'metalness', 'orm', 'ao', 'occlusion', 'thumb', 'thumbnail', 'preview']);
const ES_FOTO = new Set(['diffuse', 'diff', 'albedo', 'basecolor', 'color', 'colour']);
const palabrasDe = (ruta) => soloNombre(ruta).replace(/\.[^.]*$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]+/g) || [];

// Las imágenes que podrían ser la foto. RealityScan exporta también la normal, y puede exportar
// las fotos de la captura: pegar cualquiera de esas da un carro de colores falsos.
function candidatasAFoto(archivos, mtl) {
  // Lo que el MTL llama relieve o normal no es la foto, se llame como se llame.
  const otrosMapas = [...mtl.matchAll(/^[ \t]*(?:map_Bump|bump|norm|map_Ks|map_Ns|map_d|map_Pr|map_Pm|map_Ke|disp)[ \t]+(\S.*?)[ \t]*$/gim)].map((m) => m[1]);
  // Si el MTL dice cuál es la foto y esa no vino, otra imagen no lo es, aunque venga sola: una normal
  // de nombre neutro salía de foto, sin aviso. Siguen valiendo el mismo nombre con otra extensión (un
  // .png que pasó a .jpg), lo que se llame diffuse o albedo, y el «foto» que recomienda FOTO_NO_PARECE.
  const tronco = (ruta) => base(ruta).split(' ').pop().replace(/\.[^.]*$/, '');
  const pedidas = [...mtl.matchAll(MAP_KD)].map((m) => tronco(m[1]));
  return archivos.filter((f) => {
    if (!IMAGEN.test(f.nombre) || otrosMapas.some((l) => nombra(l, f.nombre))) return false;
    if (/(^|[\\/])(photos?|fotos?|captures?|capturas?|frames?)[\\/]/i.test(f.nombre)) return false;
    const palabras = palabrasDe(f.nombre);
    if (pedidas.length && !pedidas.includes(tronco(f.nombre)) && tronco(f.nombre) !== 'foto' && !palabras.some((p) => ES_FOTO.has(p))) return false;
    return !/normal|nrm/i.test(soloNombre(f.nombre)) && !palabras.some((p) => NO_ES_FOTO.has(p)) && palabras[palabras.length - 1] !== 'n';
  });
}

// De los archivos de una exportación, la foto del carro, o null si queda duda: mejor sin foto y
// decirlo que un carro de colores falsos. `mtl`: el texto del archivo de materiales, que manda.
export function elegirFoto(archivos, mtl = '') {
  for (const pedida of mtl.matchAll(MAP_KD)) {
    const f = archivos.find((i) => IMAGEN.test(i.nombre) && nombra(pedida[1], i.nombre));
    if (f) return f;
  }
  const candidatas = candidatasAFoto(archivos, mtl);
  return candidatas.find((f) => palabrasDe(f.nombre).some((p) => ES_FOTO.has(p))) || (candidatas.length === 1 ? candidatas[0] : null);
}

// La foto de cada material que la malla usa, según el MTL. Contarlos todos descartaría una foto
// buena si sobra un material de otra exportación.
function fotosDelMtl(mtl, usados, archivos) {
  const fotoDe = new Map();
  let actual = null;
  for (const linea of mtl.split(/\r?\n/)) {
    const nuevo = /^\s*newmtl\s+(.+?)\s*$/i.exec(linea);
    if (nuevo) actual = nuevo[1];
    const kd = /^\s*map_Kd\s+(.+?)\s*$/i.exec(linea);
    if (!kd || !usados.has(actual)) continue;
    const f = archivos.find((i) => IMAGEN.test(i.nombre) && nombra(kd[1], i.nombre));
    if (f) fotoDe.set(actual, f);
  }
  return fotoDe;
}

// Le pone al OBJ lo que traiga de foto, y devuelve lo que dirá la vista previa si se queda sin
// ella. `archivos`: { nombre, abrir }, para no inflar del ZIP lo que no se va a usar. Con varias
// imágenes, cada material lleva la suya: se conserva el color por vértice, como en un GLB de
// varias imágenes. Pegar una sola a todos daba un carro en parches de camuflaje.
async function ponerFotos(objeto, archivos, mtl) {
  const usados = new Set();
  objeto.traverse((h) => {
    if (h.isMesh) for (const m of materialesDe(h)) usados.add(m.name);
  });
  const fotoDe = fotosDelMtl(mtl, usados, archivos);
  const distintas = new Set(fotoDe.values());
  if (distintas.size > 1) {
    const mapas = new Map();
    for (const f of distintas) {
      try {
        // Solo sirven para el color por vértice, que lee a 1024 px.
        mapas.set(f, new THREE.Texture(await createImageBitmap(blobDe(f.abrir()), { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'medium' })));
      } catch {
        // Esa parte se queda gris; el aviso ya dice que se ve sin foto.
      }
    }
    objeto.traverse((h) => {
      if (!h.isMesh) return;
      for (const m of materialesDe(h)) {
        const mapa = mapas.get(fotoDe.get(m.name));
        if (mapa) m.map = mapa;
      }
    });
    return FOTO_EN_VARIAS;
  }
  const candidatas = candidatasAFoto(archivos, mtl);
  const foto = distintas.size ? [...distintas][0] : elegirFoto(archivos, mtl);
  // Sin un MTL que lo diga no se sabe cuál imagen va con cuál material, ni si una sola alcanza: lo
  // común es un material por imagen, y la Kona de dos atlas con una de ellas salía en parches, sin
  // aviso. Las caras de antes del primer usemtl ('') no piden nada: no cuentan como un material más.
  const conNombre = [...usados].filter(Boolean).length;
  if (!distintas.size && conNombre > 1 && (foto || candidatas.length)) return candidatas.length > 1 ? FOTO_EN_VARIAS : FOTO_SIN_MATERIALES;
  // Con un MTL que resuelve, la foto va solo a los materiales que él dice que la usan: si pide dos
  // imágenes y vino una, pegarla sobre todo daba el mismo camuflaje. mallaDeObjeto3D ve lo que quedó
  // sin foto, lo deja gris y lo dice.
  const leToca = distintas.size ? (m) => fotoDe.has(m.name) || m.name === '' : () => true;
  if (foto) return (await ponerFotoAlObjeto(objeto, foto, leToca)) ? null : FOTO_NO_ABRIO;
  if (candidatas.length > 1) return FOTO_EN_DUDA;
  return archivos.some((f) => IMAGEN.test(f.nombre)) ? FOTO_NO_PARECE : null;
}

const blobDe = (datos) => (datos instanceof Blob ? datos : new Blob([datos]));

// Hasta 4096 px: RealityScan ofrece 8K, y decodificarla entera son 256 MB. Las coordenadas
// van de 0 a 1, así que da igual si la imagen no es cuadrada. Devuelve si pudo.
async function ponerFotoAlObjeto(objeto, foto, leToca) {
  try {
    const blob = blobDe(foto.abrir());
    let imagen = await createImageBitmap(blob);
    if (Math.max(imagen.width, imagen.height) > 4096) {
      imagen.close();
      imagen = await createImageBitmap(blob, { resizeWidth: 4096, resizeHeight: 4096, resizeQuality: 'high' });
    }
    const mapa = new THREE.Texture(imagen);
    objeto.traverse((h) => {
      if (!h.isMesh) return;
      for (const m of materialesDe(h)) if (leToca(m)) m.map = mapa;
    });
    return true;
  } catch {
    return false;
  }
}

// El ZIP de una exportación: el OBJ, sus materiales y la foto. Solo se descomprime lo que se va
// a usar: la normal de 8K pesa tanto como la foto, y un OBJ de 193 MB en un ZIP de 31 MB pedía
// 193 MB y 2,2 s de hilo bloqueado solo para decir que era muy grande. Por eso primero se mira
// el índice (el filtro ve nombres y tamaños sin inflar nada).
async function objetoDesdeZip(datos) {
  const { unzipSync, strFromU8 } = await import('./vendor/libs/fflate.module.js');
  const bytes = new Uint8Array(datos);
  const inflar = (quiere) => unzipSync(bytes, { filter: quiere });
  const entradas = [];
  inflar((f) => {
    // Los ._algo y lo de __MACOSX son metadatos de Mac, con los mismos nombres del modelo.
    if (!/(^|[\\/])(__MACOSX[\\/]|\._)/.test(f.name)) entradas.push(f);
    return false;
  });
  // El más grande: junto al modelo puede venir uno liviano (un lod1/ de un triángulo).
  const modelos = entradas.filter((f) => /\.obj$/i.test(f.name));
  const modelo = modelos.reduce((mayor, f) => (!mayor || f.originalSize > mayor.originalSize ? f : mayor), null);
  if (!modelo) throw new ArchivoNoSirve('ese ZIP no trae un modelo OBJ; si trae un GLB o un PLY, sácalo del ZIP y súbelo solo');
  if (modelo.originalSize > 60e6) throw new ArchivoNoSirve('el modelo del ZIP pesa ' + Math.round(modelo.originalSize / 1e6) + ' MB; exporta el escaneo más liviano (menos de 60 MB)');
  // Con dos modelos los nombres se repiten, y el nombre no dice de cuál es cada archivo: los 136.646
  // triángulos de la Kona salían con la imagen azul del modelo chico, sin aviso. Lo que está más cerca
  // de otro modelo es de ese otro, aunque el grande no traiga imagen: mejor sin foto. De lo demás, lo
  // más cercano va primero, porque los `find` que siguen se quedan con el primero que se llame así.
  const cercania = (f) => carpetasEnComun(f.name, modelo.name);
  const suyas = entradas.filter((f) => !modelos.some((otro) => carpetasEnComun(f.name, otro.name) > cercania(f))).sort((a, b) => cercania(b) - cercania(a));
  const mtls = suyas.map((f) => f.name).filter((n) => /\.mtl$/i.test(n));
  const dentro = inflar((f) => f.name === modelo.name || mtls.includes(f.name));
  const objeto = await objetoDeObj(dentro[modelo.name]);
  const nombreMtl = elegirMtl(objeto, modelo.name, mtls);
  const mtl = nombreMtl ? strFromU8(dentro[nombreMtl]) : '';
  const imagenes = suyas.filter((f) => IMAGEN.test(f.name)).map((f) => ({ nombre: f.name, abrir: () => inflar((e) => e.name === f.name)[f.name] }));
  return { objeto, avisoDeFoto: await ponerFotos(objeto, imagenes, mtl) };
}

// La imagen de la textura como JPEG, de hasta 4096 px (lo que dibuja cualquier
// celular): es lo que se guarda con el escaneo y lo que se vuelve a abrir.
async function blobDeTextura(imagen, lado = 4096) {
  try {
    const factor = Math.min(1, lado / Math.max(imagen.width, imagen.height));
    const ancho = Math.round(imagen.width * factor);
    const alto = Math.round(imagen.height * factor);
    // En software (willReadFrequently): un lienzo acelerado subía la foto a la GPU para
    // leerla de vuelta. A 8K eran 220 MB más de pico y casi un segundo de hilo bloqueado.
    if (typeof OffscreenCanvas !== 'undefined') {
      const lienzo = new OffscreenCanvas(ancho, alto);
      lienzo.getContext('2d', { willReadFrequently: true }).drawImage(imagen, 0, 0, ancho, alto);
      return await lienzo.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    }
    const lienzo = Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
    lienzo.getContext('2d', { willReadFrequently: true }).drawImage(imagen, 0, 0, ancho, alto);
    return await new Promise((listo) => lienzo.toBlob(listo, 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}

// La foto en grises, a su tamaño (hasta 4096 px), para leer las juntas de las
// puertas: una junta mide medio centímetro y no se ve en el color por vértice,
// que va cada 2 cm. Un byte por píxel: 16 MB, que se sueltan al cerrar la vista
// previa. Si el celular no da para tanto, no se leen las juntas.
function luzDeTextura(imagen, lado = 4096) {
  try {
    const factor = Math.min(1, lado / Math.max(imagen.width, imagen.height));
    const ancho = Math.round(imagen.width * factor);
    const alto = Math.round(imagen.height * factor);
    const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    const rgba = ctx.getImageData(0, 0, ancho, alto).data;
    const datos = new Uint8Array(ancho * alto);
    for (let i = 0; i < datos.length; i++) datos[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    return { datos, ancho, alto };
  } catch {
    return null;
  }
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
