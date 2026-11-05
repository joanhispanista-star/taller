// El carro ESCANEADO: de lo que mide el celular a un 3D del tamaño y la
// forma reales, con las piezas marcables. Es la parte pura (sin DOM ni
// WebXR): se prueba en Node con un escaneo de mentira hecho del carro
// paramétrico, cuyas medidas se conocen.
//
// Por qué así (22-oct-2026). El 15-oct se descartó escanear por tres
// razones (LEEME, "Lo que NO va a hacer esta app"): la pintura es un
// espejo, un escaneo es una sola masa sin piezas, y en Android no había
// cómo. Joan lo volvió a pedir. Lo que cambia:
//  - La profundidad no sale de fotos sino del sensor y del movimiento del
//    celular (ARCore, por WebXR, en Chrome de Android) o de una app de
//    escaneo (archivo GLB, OBJ o PLY). La pintura sigue siendo un problema,
//    de otra forma: Chrome solo entrega la profundidad "suavizada" de
//    ARCore, que rellena todo, así que vidrios, cromo y pintura negra no
//    salen como huecos sino como profundidad inventada (investigación del
//    22-oct-2026). Error típico de ARCore: 6-10 cm. Da el TAMAÑO y la
//    SILUETA del carro, no la forma de un panel ni una abolladura.
//  - Las piezas NO se adivinan en la malla: se ajusta el carro genérico
//    (carro.js) a las medidas que dio el escaneo, y cada punto del escaneo
//    toma la pieza genérica que tiene más cerca. Las juntas no siguen las
//    del carro real al milímetro; la puerta queda donde está la puerta.
//
// La tubería, en orden:
//  1. Fusión: cada cuadro de profundidad (puntos + dónde estaba la cámara)
//     se integra en una TSDF dispersa (crearTSDF): una rejilla que guarda,
//     por vóxel, la distancia con signo a la superficie más cercana a lo
//     largo del rayo. Promedia el ruido de muchos cuadros y "talla" el aire.
//  2. Malla: surface nets sobre la TSDF (mallaDesdeTSDF), o sobre la
//     densidad de una nube de puntos importada (mallaDesdePuntos).
//  3. Piso, aislar y orientar (estimarPiso, aislarCarro, orientarCarro): el
//     piso es el plano más bajo y lleno; el carro, el bloque conectado más
//     grande encima; su eje largo sale de las componentes principales, y el
//     frente de dónde queda la cabina. Resultado: la malla en el marco del
//     carro de la app (mira hacia -Z, piso en y = 0) y sus medidas reales.
//  4. Piezas (etiquetarPiezas, modeloDesdeEscaneo): el carro genérico a
//     esas medidas, muestreado por su superficie, y a cada vértice la pieza
//     más cercana; la malla se parte en una malla por pieza, con el mismo
//     contrato que construirCarro, para que el visor marque y tiña igual.
import * as THREE from 'three';
import { construirCarro, disposicion, resaltar } from './carro.js';
import { esInterior } from './piezas.js';
import { crearVelo, soldarVertices } from './escaneo-velo.js';
import { giroDeNivel } from './escaneo-nivel.js';
import { medidasParaDibujar, normalizarCarroceria } from './carrocerias.js';

// ---------- 1. Fusión de profundidad: TSDF dispersa por bloques ----------

// Bloques de 8 × 8 × 8 vóxeles: solo existen los que tocan una superficie,
// así un volumen de 8 × 8 × 3 m con vóxeles de 3 cm no ocupa 70 MB sino lo
// que mida la superficie vista. Cada vóxel guarda la distancia con signo
// (normalizada por el truncamiento: +1 delante de la superficie, -1 detrás)
// y su peso (cuántas veces se vio).
const B = 8;
const B3 = B * B * B;
// La clave de un bloque (o de una celda) junta los tres índices en un solo
// número: 17 bits por eje, 51 en total, dentro de los 53 que un número de
// JavaScript guarda exactos. Con 21 bits por eje (63 en total) se perdía
// precisión y dos celdas distintas compartían clave: en la prueba, un
// estorbo a un metro del carro quedaba "pegado" a él. ±65.536 celdas por
// eje alcanzan para ±1,6 km con celdas de 2,5 cm.
const DESPLAZAMIENTO = 1 << 16;
const ESCALA_CLAVE = 1 << 17;

function claveBloque(bx, by, bz) {
  return ((bx + DESPLAZAMIENTO) * ESCALA_CLAVE + (by + DESPLAZAMIENTO)) * ESCALA_CLAVE + (bz + DESPLAZAMIENTO);
}
function desdeClave(clave) {
  const bz = (clave % ESCALA_CLAVE) - DESPLAZAMIENTO;
  const resto = Math.floor(clave / ESCALA_CLAVE);
  const by = (resto % ESCALA_CLAVE) - DESPLAZAMIENTO;
  const bx = Math.floor(resto / ESCALA_CLAVE) - DESPLAZAMIENTO;
  return [bx, by, bz];
}

// `voxel` en metros; `truncamiento` es el grosor de la banda alrededor de
// la superficie que se actualiza (3 vóxeles a cada lado); `pesoMaximo`
// deja que el escaneo se corrija si algo se movió (una persona que pasó).
// `maxBloques` es el freno de memoria: 1 bloque son 2,5 KB (la distancia
// en Float32 y el peso en un byte), 8.000 bloques son 20 MB. Un carro visto
// por todos lados ocupa unos 1.000-2.000 bloques de 3 cm; el resto es lo
// que haya alrededor.
export function crearTSDF({ voxel = 0.03, truncamiento = null, pesoMaximo = 40, maxBloques = 8000 } = {}) {
  const trunc = truncamiento || voxel * 3;
  const bloques = new Map();
  let lleno = false;

  function bloque(bx, by, bz, crear) {
    const clave = claveBloque(bx, by, bz);
    let b = bloques.get(clave);
    if (!b && crear) {
      if (bloques.size >= maxBloques) {
        lleno = true;
        return null;
      }
      b = { sdf: new Float32Array(B3).fill(1), peso: new Uint8Array(B3) };
      bloques.set(clave, b);
    }
    return b;
  }

  // A lo largo de un rayo, los vóxeles seguidos casi siempre caen en el
  // mismo bloque: se guarda el último y se evita buscarlo en el Map (en el
  // celular son ~35.000 actualizaciones por cuadro).
  let ultimo = null;
  let ux = NaN;
  let uy = NaN;
  let uz = NaN;
  function actualizarVoxel(ix, iy, iz, valor) {
    const bx = Math.floor(ix / B);
    const by = Math.floor(iy / B);
    const bz = Math.floor(iz / B);
    let b;
    if (bx === ux && by === uy && bz === uz) {
      b = ultimo;
    } else {
      b = bloque(bx, by, bz, true);
      ultimo = b;
      ux = bx;
      uy = by;
      uz = bz;
    }
    if (!b) return;
    const i = ((ix - bx * B) * B + (iy - by * B)) * B + (iz - bz * B);
    const w = b.peso[i];
    b.sdf[i] = (b.sdf[i] * w + valor) / (w + 1);
    b.peso[i] = Math.min(pesoMaximo, w + 1);
  }

  // Integra los puntos de un cuadro: `origen` es la cámara [x, y, z] y
  // `puntos` un Float32Array plano [x, y, z, x, y, z...] de lo que midió.
  // A lo largo de cada rayo, los vóxeles de la banda toman la distancia
  // con signo hasta el punto medido. `filtro(x, y, z)` deja fuera lo que no
  // interesa (el piso, lo que está lejísimos) antes de gastar en ello.
  //
  // La banda va del truncamiento por delante a UN vóxel por detrás: con la
  // banda pareja, los rayos que pasan rasantes por el borde de un panel
  // marcaban como "dentro" el aire de más allá del borde, y las esquinas
  // engordaban (en la prueba, el largo salía 6 cm de más).
  function integrar(origen, puntos, filtro = null) {
    const [ox, oy, oz] = origen;
    const pasos = Math.ceil(trunc / voxel);
    const pasosDetras = 1;
    for (let k = 0; k < puntos.length; k += 3) {
      const px = puntos[k];
      const py = puntos[k + 1];
      const pz = puntos[k + 2];
      if (filtro && !filtro(px, py, pz)) continue;
      let dx = px - ox;
      let dy = py - oy;
      let dz = pz - oz;
      const largo = Math.hypot(dx, dy, dz);
      if (largo < 1e-6) continue;
      dx /= largo;
      dy /= largo;
      dz /= largo;
      for (let s = -pasos; s <= pasosDetras; s++) {
        const t = s * voxel;
        const ix = Math.round((px + dx * t) / voxel);
        const iy = Math.round((py + dy * t) / voxel);
        const iz = Math.round((pz + dz * t) / voxel);
        // La distancia del CENTRO del vóxel al punto medido, a lo largo del
        // rayo; delante de la superficie (hacia la cámara) es positiva. Antes
        // se usaba el paso (s × vóxel): el vóxel del punto valía 0 caiga
        // donde caiga, la superficie quedaba en escalones, y en las latas
        // vistas de canto (capó, techo) el vóxel de debajo casi nunca salía
        // negativo y la malla quedaba llena de huecos (maqueta del 23-oct,
        // con el ruido de ARCore).
        const d = (px - ix * voxel) * dx + (py - iy * voxel) * dy + (pz - iz * voxel) * dz;
        actualizarVoxel(ix, iy, iz, Math.max(-1, Math.min(1, d / trunc)));
      }
    }
  }

  // Lee un vóxel: su distancia con signo, o null si se vio menos de
  // `pesoMinimo` veces (ahí no se sabe nada y no se pone superficie).
  function leer(ix, iy, iz, pesoMinimo = 1) {
    const bx = Math.floor(ix / B);
    const by = Math.floor(iy / B);
    const bz = Math.floor(iz / B);
    const b = bloque(bx, by, bz, false);
    if (!b) return null;
    const i = ((ix - bx * B) * B + (iy - by * B)) * B + (iz - bz * B);
    return b.peso[i] >= pesoMinimo ? b.sdf[i] : null;
  }

  // Los puntos de la superficie: centros de los vóxeles visto `pesoMinimo`
  // veces cuyo valor está cerca de cero. Sirven para aislar y orientar
  // antes de hacer la malla.
  function puntosDeSuperficie({ pesoMinimo = 2, banda = 0.5 } = {}) {
    const salida = [];
    for (const [clave, b] of bloques) {
      const [bx, by, bz] = desdeClave(clave);
      for (let i = 0; i < B3; i++) {
        if (b.peso[i] < pesoMinimo || Math.abs(b.sdf[i]) > banda) continue;
        const lz = i % B;
        const ly = Math.floor(i / B) % B;
        const lx = Math.floor(i / (B * B));
        salida.push((bx * B + lx) * voxel, (by * B + ly) * voxel, (bz * B + lz) * voxel);
      }
    }
    return new Float32Array(salida);
  }

  return {
    voxel,
    integrar,
    leer,
    puntosDeSuperficie,
    get bloques() {
      return bloques.size;
    },
    get lleno() {
      return lleno;
    },
    get megabytes() {
      return (bloques.size * B3 * 5) / 1e6;
    },
  };
}

// De un píxel del mapa de profundidad al punto en el mundo. `u`, `v` van
// de 0 a 1 sobre la vista (v hacia abajo, como lo da WebXR), `metros` es
// la profundidad a lo largo del eje de la cámara, `invProyeccion` la
// inversa de la proyección de la vista y `matrizVista` la pose de la
// cámara en el mundo (las dos como arreglos de 16, por columnas, como
// WebXR y Three.js). Escribe [x, y, z] en `salida`.
export function puntoDesdeProfundidad(u, v, metros, invProyeccion, matrizVista, salida) {
  // Un punto del rayo en coordenadas normalizadas, llevado a la cámara.
  const nx = u * 2 - 1;
  const ny = (1 - v) * 2 - 1;
  const m = invProyeccion;
  const cx = m[0] * nx + m[4] * ny + m[8] * -1 + m[12];
  const cy = m[1] * nx + m[5] * ny + m[9] * -1 + m[13];
  const cz = m[2] * nx + m[6] * ny + m[10] * -1 + m[14];
  const cw = m[3] * nx + m[7] * ny + m[11] * -1 + m[15];
  const rx = cx / cw;
  const ry = cy / cw;
  const rz = cz / cw;
  // Escalar el rayo para que su z sea -metros (la cámara mira hacia -z).
  const k = metros / -rz;
  const vx = rx * k;
  const vy = ry * k;
  const vz = rz * k;
  const w = matrizVista;
  salida[0] = w[0] * vx + w[4] * vy + w[8] * vz + w[12];
  salida[1] = w[1] * vx + w[5] * vy + w[9] * vz + w[13];
  salida[2] = w[2] * vx + w[6] * vy + w[10] * vz + w[14];
  return salida;
}

// Los puntos de un cuadro de profundidad, como los da WebXR en Chrome de
// Android: `profundidad(u, v)` es getDepthInMeters (u, v de 0 a 1 sobre la
// vista, v hacia abajo; distancia al PLANO de la cámara; 0 si no sabe),
// `P` la proyección de la vista y `M` su pose (arreglos de 16 por
// columnas). Se pide una rejilla de `columnas` × `filas` (el mapa de
// Chrome es de unos 160 × 120) y se descarta lo de menos de `cerca` o más
// de `lejos` metros: ARCore mide bien de 0,5 a ~4 m y el error crece con el
// cuadrado de la distancia. Devuelve un Float32Array [x, y, z, ...].
// Invierte la perspectiva a mano (x = z·(xn + P[8]) / P[0]): por cuadro es
// más barato que invertir la matriz, y es lo mismo que puntoDesdeProfundidad.
export function puntosDeCuadro(profundidad, P, M, { columnas = 96, filas = 72, cerca = 0.3, lejos = 4 } = {}) {
  const salida = new Float32Array(columnas * filas * 3);
  let k = 0;
  for (let j = 0; j < filas; j++) {
    const v = (j + 0.5) / filas;
    const yn = 1 - 2 * v;
    for (let i = 0; i < columnas; i++) {
      const u = (i + 0.5) / columnas;
      const z = profundidad(u, v);
      if (!(z > cerca && z < lejos)) continue;
      const xn = 2 * u - 1;
      const xv = (z * (xn + P[8])) / P[0];
      const yv = (z * (yn + P[9])) / P[5];
      const zv = -z;
      salida[k++] = M[0] * xv + M[4] * yv + M[8] * zv + M[12];
      salida[k++] = M[1] * xv + M[5] * yv + M[9] * zv + M[13];
      salida[k++] = M[2] * xv + M[6] * yv + M[10] * zv + M[14];
    }
  }
  return salida.subarray(0, k);
}

// ---------- 2. Malla: surface nets ----------
//
// Surface nets: por cada celda de la rejilla donde el campo cambia de
// signo se pone UN vértice (el promedio de los cruces en sus aristas), y
// por cada arista con cambio de signo un cuadrilátero entre las cuatro
// celdas que la rodean. Da una superficie suave y soldada (cada vértice
// compartido), sin las tablas de marching cubes. `campo(ix, iy, iz)`
// devuelve el valor o null si no se sabe (ahí no se pone superficie).
// La superficie es donde el campo vale `iso`; "dentro" es campo < iso.
function surfaceNets(campo, min, max, tamano, iso = 0) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  // Los valores en los puntos de la rejilla, leídos UNA vez (antes se leía
  // cada esquina 8 veces y 4 más para las caras): NaN donde no se sabe.
  const px = x1 - x0 + 1;
  const py = y1 - y0 + 1;
  const pz = z1 - z0 + 1;
  const valor = new Float32Array(px * py * pz);
  for (let ix = 0; ix < px; ix++) {
    for (let iy = 0; iy < py; iy++) {
      for (let iz = 0; iz < pz; iz++) {
        const v = campo(ix + x0, iy + y0, iz + z0);
        valor[(ix * py + iy) * pz + iz] = v === null ? NaN : v - iso;
      }
    }
  }
  const val = (ix, iy, iz) => valor[(ix * py + iy) * pz + iz];
  const nx = px - 1;
  const ny = py - 1;
  const nz = pz - 1;
  const indiceDe = new Int32Array(nx * ny * nz).fill(-1);
  const posiciones = [];
  const ESQ = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const ARISTAS = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float64Array(8);
  // Vértices: uno por celda que cruza la superficie (con sus 8 esquinas sabidas).
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let iz = 0; iz < nz; iz++) {
        let dentro = 0;
        let sabido = true;
        for (let e = 0; e < 8; e++) {
          const w = val(ix + ESQ[e][0], iy + ESQ[e][1], iz + ESQ[e][2]);
          if (w !== w) {
            sabido = false;
            break;
          }
          v[e] = w;
          if (w < 0) dentro++;
        }
        if (!sabido || dentro === 0 || dentro === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of ARISTAS) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += ESQ[a][0] + (ESQ[b][0] - ESQ[a][0]) * t;
          sy += ESQ[a][1] + (ESQ[b][1] - ESQ[a][1]) * t;
          sz += ESQ[a][2] + (ESQ[b][2] - ESQ[a][2]) * t;
          n++;
        }
        indiceDe[(ix * ny + iy) * nz + iz] = posiciones.length / 3;
        posiciones.push((ix + x0 + sx / n) * tamano, (iy + y0 + sy / n) * tamano, (iz + z0 + sz / n) * tamano);
      }
    }
  }
  // Caras: por cada arista de la rejilla que cruza la superficie, el
  // cuadrilátero de las cuatro celdas que la comparten, con el giro según
  // de qué lado queda "dentro".
  const indices = [];
  const idx = (ix, iy, iz) => (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz ? -1 : indiceDe[(ix * ny + iy) * nz + iz]);
  const quad = (a, b, c, d, invertir) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (invertir) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let ix = 0; ix < px; ix++) {
    for (let iy = 0; iy < py; iy++) {
      for (let iz = 0; iz < pz; iz++) {
        const a = val(ix, iy, iz);
        if (a !== a) continue;
        const dentro = a < 0;
        if (ix + 1 < px) {
          const b = val(ix + 1, iy, iz);
          if (b === b && dentro !== b < 0) quad(idx(ix, iy - 1, iz - 1), idx(ix, iy, iz - 1), idx(ix, iy, iz), idx(ix, iy - 1, iz), dentro);
        }
        if (iy + 1 < py) {
          const b = val(ix, iy + 1, iz);
          if (b === b && dentro !== b < 0) quad(idx(ix - 1, iy, iz - 1), idx(ix - 1, iy, iz), idx(ix, iy, iz), idx(ix, iy, iz - 1), dentro);
        }
        if (iz + 1 < pz) {
          const b = val(ix, iy, iz + 1);
          if (b === b && dentro !== b < 0) quad(idx(ix - 1, iy - 1, iz), idx(ix, iy - 1, iz), idx(ix, iy, iz), idx(ix - 1, iy, iz), dentro);
        }
      }
    }
  }
  return { posiciones: new Float32Array(posiciones), indices: new Uint32Array(indices) };
}

// La malla de la TSDF dentro de una caja del mundo ({ min: [x,y,z], max }),
// en metros. Solo los vóxeles vistos al menos `pesoMinimo` veces cuentan.
export function mallaDesdeTSDF(tsdf, caja, { pesoMinimo = 2 } = {}) {
  const t = tsdf.voxel;
  const min = caja.min.map((v) => Math.floor(v / t) - 1);
  const max = caja.max.map((v) => Math.ceil(v / t) + 1);
  const celdas = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
  if (celdas > 40e6) throw new Error('La caja del carro es demasiado grande para hacer la malla (' + Math.round(celdas / 1e6) + ' M de vóxeles)');
  return surfaceNets((ix, iy, iz) => tsdf.leer(ix, iy, iz, pesoMinimo), min, max, t);
}

// La malla de una nube de puntos SIN rayos (un PLY de puntos o de splats
// importado): la densidad de puntos por vóxel, suavizada, y su superficie.
// Un escaneo de puntos es una cáscara: la malla sale de doble cara, con un
// grosor de un par de vóxeles. Para verlo y marcarlo, sirve.
export function mallaDesdePuntos(posiciones, { voxel = 0.025 } = {}) {
  if (posiciones.length < 30) return { posiciones: new Float32Array(0), indices: new Uint32Array(0) };
  const caja = cajaDe(posiciones);
  const min = caja.min.map((v) => Math.floor(v / voxel) - 2);
  const max = caja.max.map((v) => Math.ceil(v / voxel) + 2);
  const nx = max[0] - min[0];
  const ny = max[1] - min[1];
  const nz = max[2] - min[2];
  if (nx * ny * nz > 40e6) throw new Error('La nube es demasiado grande para hacer la malla');
  const cuenta = new Float32Array(nx * ny * nz);
  const i3 = (x, y, z) => ((x - min[0]) * ny + (y - min[1])) * nz + (z - min[2]);
  for (let k = 0; k < posiciones.length; k += 3) {
    cuenta[i3(Math.round(posiciones[k] / voxel), Math.round(posiciones[k + 1] / voxel), Math.round(posiciones[k + 2] / voxel))] += 1;
  }
  // Suavizado 3 × 3 × 3 (separable): une los puntos sueltos en una cáscara.
  const suave = suavizar3(cuenta, nx, ny, nz);
  // El umbral: una fracción de la densidad típica de la superficie.
  const llenas = [];
  for (let i = 0; i < suave.length; i++) if (suave[i] > 0) llenas.push(suave[i]);
  llenas.sort((a, b) => a - b);
  const iso = Math.max(1e-3, (llenas[Math.floor(llenas.length * 0.5)] || 1) * 0.35);
  // Campo con "dentro" = densidad alta (negativo): -densidad.
  return surfaceNets(
    (ix, iy, iz) => {
      if (ix < min[0] || iy < min[1] || iz < min[2] || ix >= max[0] || iy >= max[1] || iz >= max[2]) return 0;
      return -suave[i3(ix, iy, iz)];
    },
    min,
    max,
    voxel,
    -iso,
  );
}

function suavizar3(datos, nx, ny, nz) {
  let a = datos;
  let b = new Float32Array(a.length);
  const i3 = (x, y, z) => (x * ny + y) * nz + z;
  const ejes = [
    [nx, (x, y, z, d) => i3(x + d, y, z), 0],
    [ny, (x, y, z, d) => i3(x, y + d, z), 1],
    [nz, (x, y, z, d) => i3(x, y, z + d), 2],
  ];
  for (const [n, vecino, eje] of ejes) {
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
          const pos = [x, y, z][eje];
          let s = a[i3(x, y, z)] * 2;
          if (pos > 0) s += a[vecino(x, y, z, -1)];
          if (pos < n - 1) s += a[vecino(x, y, z, 1)];
          b[i3(x, y, z)] = s / 4;
        }
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

// ---------- 3. Piso, aislar y orientar ----------

export function cajaDe(posiciones) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posiciones.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = posiciones[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

// La mediana de la fracción `fraccion` de valores más extremos hacia
// `sentido` (+1 los mayores, -1 los menores): dónde está la cara de ese
// lado, sin que la cola del ruido la corra. Para el ancho se aplica a cada
// lado por separado.
function extremo(valores, sentido, fraccion) {
  if (valores.length === 0) return 0;
  const copia = Float64Array.from(valores).sort();
  const k = Math.max(1, Math.round(copia.length * fraccion));
  const i = sentido > 0 ? copia.length - 1 - Math.floor(k / 2) : Math.floor(k / 2);
  return copia[i];
}

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const copia = Float64Array.from(valores).sort();
  const i = Math.min(copia.length - 1, Math.max(0, Math.round((copia.length - 1) * p)));
  return copia[i];
}

// La altura del piso: el y con más puntos en la franja de abajo (el piso
// visto alrededor del carro es el plano más grande y más bajo). Si el
// escaneo no trae piso (un carro ya recortado), el percentil 0,5 de y: la
// parte de abajo de las llantas. Supone el "arriba" en +y, como lo dan
// WebXR y las apps de escaneo (glTF es y-arriba).
export function estimarPiso(posiciones, { franja = 0.02 } = {}) {
  const ys = [];
  for (let i = 1; i < posiciones.length; i += 3) ys.push(posiciones[i]);
  if (ys.length === 0) return 0;
  const bajo = percentil(ys, 0.005);
  const alto = percentil(ys, 0.995);
  const n = Math.max(1, Math.ceil((alto - bajo) / franja));
  const hist = new Float64Array(n + 1);
  for (const y of ys) {
    const k = Math.floor((y - bajo) / franja);
    if (k >= 0 && k <= n) hist[k]++;
  }
  // Solo el tercio de abajo: el techo de un carro también es un plano lleno.
  const tope = Math.max(1, Math.floor(n / 3));
  let mejor = 0;
  for (let k = 1; k < tope; k++) if (hist[k] > hist[mejor]) mejor = k;
  // Un piso de verdad tiene muchos puntos en una sola franja: más del 6 %
  // del total. Si no, no hay piso en el escaneo.
  if (hist[mejor] < ys.length * 0.06) return bajo;
  return bajo + (mejor + 0.5) * franja;
}

// El carro: el bloque conectado más grande por encima del piso (y por
// debajo de 2,6 m sobre él). Se trabaja en vóxeles de `celda`; dos vóxeles
// se tocan si comparten cara, arista o esquina. Devuelve una máscara
// (Uint8Array, 1 = del carro) sobre los puntos.
// `sobrePiso`: lo que se descarta encima del piso. 8 cm, no 4: el piso
// convertido en malla (surface nets) tiene un grosor de un par de vóxeles y
// sus vértices pasaban los 4 cm, uniendo el carro con todo lo de alrededor.
// Al carro solo le quita la base de las llantas; las medidas no cambian
// (el alto se mide desde el piso).
export function aislarCarro(posiciones, { piso = 0, celda = 0.06, sobrePiso = 0.08, altoMaximo = 2.6 } = {}) {
  const n = posiciones.length / 3;
  const mascara = new Uint8Array(n);
  const deVoxel = new Map();
  const claveDe = (x, y, z) => claveBloque(Math.floor(x / celda), Math.floor(y / celda), Math.floor(z / celda));
  for (let i = 0; i < n; i++) {
    const y = posiciones[i * 3 + 1];
    if (y < piso + sobrePiso || y > piso + altoMaximo) continue;
    const c = claveDe(posiciones[i * 3], y, posiciones[i * 3 + 2]);
    let lista = deVoxel.get(c);
    if (!lista) deVoxel.set(c, (lista = []));
    lista.push(i);
  }
  // Componentes conexas sobre los vóxeles ocupados.
  const componente = new Map();
  let mejor = -1;
  let mejorCuenta = 0;
  let siguiente = 0;
  for (const inicio of deVoxel.keys()) {
    if (componente.has(inicio)) continue;
    const id = siguiente++;
    let cuenta = 0;
    const pila = [inicio];
    componente.set(inicio, id);
    while (pila.length) {
      const c = pila.pop();
      cuenta += deVoxel.get(c).length;
      const [bx, by, bz] = desdeClave(c);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const v = claveBloque(bx + dx, by + dy, bz + dz);
            if (deVoxel.has(v) && !componente.has(v)) {
              componente.set(v, id);
              pila.push(v);
            }
          }
        }
      }
    }
    if (cuenta > mejorCuenta) {
      mejorCuenta = cuenta;
      mejor = id;
    }
  }
  for (const [c, lista] of deVoxel) {
    if (componente.get(c) === mejor) for (const i of lista) mascara[i] = 1;
  }
  return mascara;
}

// El ángulo del eje largo del carro visto desde arriba: el del rectángulo
// de menor área que encierra su huella (entre los percentiles 0,5 y 99,5,
// para que una punta suelta no lo tuerza). Antes eran las componentes
// principales, pero esas se tuercen cuando un lado del carro tiene más
// puntos que el otro (lo normal al escanear: un lado se ve mejor): en la
// prueba, 2° de giro y 7 cm de más en el largo. Busca cada 2° y afina
// cada 0,2°; con 20.000 puntos tarda unas décimas.
function anguloDeMenorArea(xs, zs) {
  const n = xs.length;
  const paso = Math.max(1, Math.floor(n / 20000));
  const px = [];
  const pz = [];
  for (let i = 0; i < n; i += paso) {
    px.push(xs[i]);
    pz.push(zs[i]);
  }
  const u = new Float64Array(px.length);
  const w = new Float64Array(px.length);
  const extension = (valores) => {
    valores.sort();
    const k = valores.length - 1;
    return valores[Math.round(k * 0.995)] - valores[Math.round(k * 0.005)];
  };
  const area = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let i = 0; i < px.length; i++) {
      u[i] = px[i] * c + pz[i] * s;
      w[i] = -px[i] * s + pz[i] * c;
    }
    const eu = extension(u);
    const ew = extension(w);
    return { area: eu * ew, eu, ew };
  };
  let mejor = { angulo: 0, area: Infinity, eu: 0, ew: 0 };
  const probar = (a) => {
    const r = area(a);
    if (r.area < mejor.area) mejor = { angulo: a, ...r };
  };
  for (let g = 0; g < 90; g += 2) probar((g * Math.PI) / 180);
  const base = mejor.angulo;
  for (let g = -2; g <= 2; g += 0.2) probar(base + (g * Math.PI) / 180);
  // El eje largo: si el rectángulo es más largo en w, el carro va a 90°.
  return mejor.eu >= mejor.ew ? mejor.angulo : mejor.angulo + Math.PI / 2;
}

// Orienta el carro aislado: el eje largo con el rectángulo de menor área
// de su huella, el centro donde caen los percentiles 1 y 99 (las
// puntas sueltas del escaneo no lo corren), y el frente por la cabina: el
// techo queda más cerca de la cola que de la punta (el capó es más largo
// que el baúl, y en la camioneta DOBLE cabina de la app el techo también
// queda detrás del centro: en una Hilux va de 2,3 a 3,55 m desde la punta,
// con el centro del carro en 2,66). La misma regla para las cuatro
// carrocerías: la primera versión la invertía para la camioneta y la
// camioneta salía SIEMPRE al revés, con el capó sobre el platón (revisión
// del 22-oct-2026). Una cabina sencilla (techo adelante) saldría al revés:
// para eso está `voltear`, que lo gira 180° si la persona dice que quedó al
// revés. `carroceria` ya no cambia la orientación; queda en la firma por
// compatibilidad. Devuelve la matriz (THREE.Matrix4) que lleva el escaneo
// al marco del carro de la app (mira hacia -Z, piso en y = 0, centrado) y
// las medidas reales en metros.
export function orientarCarro(posiciones, mascara, { piso = 0, carroceria = 'sedan', voltear = false } = {}) {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    sx += posiciones[i * 3];
    sz += posiciones[i * 3 + 2];
    n++;
  }
  if (n < 50) throw new Error('El escaneo tiene muy pocos puntos del carro (' + n + ')');
  const mx = sx / n;
  const mz = sz / n;
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  for (let i = 0, k = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    xs[k] = posiciones[i * 3] - mx;
    zs[k] = posiciones[i * 3 + 2] - mz;
    k++;
  }
  const angulo = anguloDeMenorArea(xs, zs);
  const ux = Math.cos(angulo);
  const uz = Math.sin(angulo);
  // u: a lo largo; w: a lo ancho (u girado 90°).
  const us = [];
  const ws = [];
  const ys = [];
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    const dx = posiciones[i * 3] - mx;
    const dz = posiciones[i * 3 + 2] - mz;
    us.push(dx * ux + dz * uz);
    ws.push(-dx * uz + dz * ux);
    ys.push(posiciones[i * 3 + 1] - piso);
  }
  // Las medidas, con la MEDIANA de los puntos más externos de cada cara y
  // no con un percentil extremo: un percentil se va con la cola del ruido
  // (con 4 cm de ruido, el ancho salía 11 cm de más), y la mediana de una
  // cara grande no se mueve. Cuánto se toma de cada cara depende de su
  // tamaño: los costados son grandes (15 % de cada lado), el techo mediano
  // (3 %), las puntas chicas (1 %: el bómper trasero de una camioneta).
  const u0 = extremo(us, -1, 0.01);
  const u1 = extremo(us, 1, 0.01);
  const uc = (u0 + u1) / 2;
  const w0 = extremo(ws, -1, 0.05);
  const w1 = extremo(ws, 1, 0.05);
  const wc = (w0 + w1) / 2;
  const largo = u1 - u0;
  const alto = extremo(ys, 1, 0.03);
  // El ancho de la carrocería, sin los espejos: entre 35 y 85 cm de altura.
  const wsCuerpo = [];
  for (let k = 0; k < ys.length; k++) if (ys[k] > 0.35 && ys[k] < 0.85) wsCuerpo.push(ws[k] - wc);
  const ancho = wsCuerpo.length > 50 ? extremo(wsCuerpo, 1, 0.15) - extremo(wsCuerpo, -1, 0.15) : w1 - w0;

  // ¿Hacia dónde queda la cabina? El centro de los puntos más altos.
  let sumaU = 0;
  let cuentaU = 0;
  for (let k = 0; k < ys.length; k++) {
    if (ys[k] > alto - 0.12) {
      sumaU += us[k] - uc;
      cuentaU++;
    }
  }
  const cabina = cuentaU ? sumaU / cuentaU : 0;
  // Frente: el extremo lejos de la cabina. Si la cabina está hacia +u, el
  // frente está hacia -u.
  void carroceria;
  let frenteHaciaMasU = !(cabina > 0);
  if (voltear) frenteHaciaMasU = !frenteHaciaMasU;

  // La matriz: trasladar al centro, girar para que u quede en -Z (frente)
  // o en +Z, y bajar el piso a 0. En el marco del carro, -Z es el frente.
  const centroX = mx + uc * ux - wc * uz;
  const centroZ = mz + uc * uz + wc * ux;
  // Ángulo que lleva u a +Z: u = (cos a, sin a) en (x, z).
  const signo = frenteHaciaMasU ? -1 : 1;
  const giro = new THREE.Matrix4();
  // Base del carro: Z = signo·u, X = Z × Y... con Y arriba, X = (Y × Z)·(-1)
  // para que -X sea la izquierda mirando al frente (-Z).
  const zx = signo * ux;
  const zz = signo * uz;
  // X = Y × Z = (0,1,0) × (zx,0,zz) = (zz, 0, -zx)
  const xx = zz;
  const xz = -zx;
  // Filas = ejes del carro en coordenadas del escaneo (matriz de cambio de base).
  giro.set(xx, 0, xz, 0, 0, 1, 0, 0, zx, 0, zz, 0, 0, 0, 0, 1);
  const traslado = new THREE.Matrix4().makeTranslation(-centroX, -piso, -centroZ);
  const matriz = giro.multiply(traslado);
  return { matriz, medidas: { largo, ancho, alto }, cabina, frenteHaciaMasU };
}

// ---------- 4. Las piezas sobre el escaneo ----------

// Muestras de la superficie del carro genérico con la pieza de cada una:
// las piezas de afuera con su id, y lo que no es pieza (vidrios, llantas,
// luces, placas, la parrilla) como 'nada', para que el vidrio del escaneo
// no se lo quede la puerta. Las de adentro (vano, marcos, caras interiores)
// no cuentan: un escaneo no ve adentro. Una muestra cada `paso` metros.
export function muestrasDelGenerico(modelo, { paso = 0.04 } = {}) {
  const puntos = [];
  const etiquetas = [];
  const nombres = ['nada'];
  const indiceDe = new Map([['nada', 0]]);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  modelo.grupo.updateMatrixWorld(true);
  modelo.grupo.traverse((objeto) => {
    if (!objeto.isMesh) return;
    const id = objeto.userData.piezaId || null;
    if (id && esInterior(id)) return;
    if (!id && objeto.userData.decorativo) return; // manijas y molduras: las tapa la chapa
    if (objeto.name === 'interior') return;
    // Los bloques de relleno (el forro bajo el techo, el del motor bajo el
    // capó) no se ven desde afuera, pero están a 1-2 cm de la lata: si se
    // muestrean, se roban los puntos del techo y del capó escaneados y los
    // dejan como "nada", a manchas (maqueta del 23-oct).
    if (objeto.userData.relleno) return;
    const nombre = id || 'nada';
    if (!indiceDe.has(nombre)) {
      indiceDe.set(nombre, nombres.length);
      nombres.push(nombre);
    }
    const etiqueta = indiceDe.get(nombre);
    const geo = objeto.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const triangulos = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < triangulos; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(objeto.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(objeto.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(objeto.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const area = ab.clone().cross(ac).length() / 2;
      // Muestras en una rejilla triangular de lado `paso`, al menos una.
      const k = Math.max(1, Math.ceil(Math.sqrt(area) / paso));
      for (let i = 0; i <= k; i++) {
        for (let j = 0; j <= k - i; j++) {
          const s = (i + 1 / 3) / (k + 1);
          const r = (j + 1 / 3) / (k + 1);
          if (s + r > 1) continue;
          puntos.push(a.x + ab.x * s + ac.x * r, a.y + ab.y * s + ac.y * r, a.z + ab.z * s + ac.z * r);
          etiquetas.push(etiqueta);
        }
      }
    }
  });
  return { puntos: new Float32Array(puntos), etiquetas: new Uint8Array(etiquetas), nombres };
}

// A cada vértice del escaneo (ya en el marco del carro) la etiqueta de la
// muestra del genérico más cercana; lo que queda a más de `radio` de
// cualquier muestra es 'nada' (0).
//
// Cómo, sin tardar: las muestras van a una rejilla DENSA de `celda` (12 cm)
// alrededor del genérico, guardadas en arreglos (cada celda, su tramo de
// una lista ordenada); cada vértice mira las 27 celdas vecinas, y solo si
// ahí no hay nada, las 125. La primera versión buscaba anillo por anillo en
// un Map: 17 s para 340.000 vértices en el PC; una propagación por ondas
// también se fue de las manos (las celdas se volvían a mejorar onda tras
// onda). Así son unas décimas de segundo.
//
// Con `normales`, lo que cuenta es la distancia A LO LARGO de la lata: lo que
// separa el escaneo del genérico (el escaneo es unos centímetros más ancho o más
// delgado) casi no cuenta. Si no, la junta entre dos puertas, que en el genérico
// es una recta, salía ondulada: el punto más cercano en el espacio no es el que
// está a la misma altura y en la misma tajada del carro.
export function etiquetarPiezas(posiciones, muestras, { celda = 0.12, radio = 0.35, normales = null } = {}) {
  const { puntos, etiquetas } = muestras;
  const n = etiquetas.length;
  const caja = cajaDe(puntos);
  const x0 = caja.min[0];
  const y0 = caja.min[1];
  const z0 = caja.min[2];
  const nx = Math.floor((caja.max[0] - x0) / celda) + 1;
  const ny = Math.floor((caja.max[1] - y0) / celda) + 1;
  const nz = Math.floor((caja.max[2] - z0) / celda) + 1;
  const celdaDe = (x, y, z) => (x * ny + y) * nz + z;
  // Ordenar las muestras por celda (conteo y acumulado).
  const cuentas = new Uint32Array(nx * ny * nz + 1);
  const suya = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = celdaDe(Math.floor((puntos[i * 3] - x0) / celda), Math.floor((puntos[i * 3 + 1] - y0) / celda), Math.floor((puntos[i * 3 + 2] - z0) / celda));
    suya[i] = c;
    cuentas[c + 1]++;
  }
  for (let c = 0; c < nx * ny * nz; c++) cuentas[c + 1] += cuentas[c];
  const inicio = cuentas.slice();
  const orden = new Int32Array(n);
  for (let i = 0; i < n; i++) orden[inicio[suya[i]]++] = i;
  const r2 = radio * radio;
  const salida = new Uint8Array(posiciones.length / 3);
  for (let v = 0; v < salida.length; v++) {
    const px = posiciones[v * 3];
    const py = posiciones[v * 3 + 1];
    const pz = posiciones[v * 3 + 2];
    const cx = Math.floor((px - x0) / celda);
    const cy = Math.floor((py - y0) / celda);
    const cz = Math.floor((pz - z0) / celda);
    const nx_ = normales ? normales[v * 3] : 0;
    const ny_ = normales ? normales[v * 3 + 1] : 0;
    const nz_ = normales ? normales[v * 3 + 2] : 0;
    let mejor = -1;
    let mejorD = r2;
    for (let r = 1; r <= 2 && mejor < 0; r++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(nx - 1, cx + r); x++) {
        for (let y = Math.max(0, cy - r); y <= Math.min(ny - 1, cy + r); y++) {
          for (let z = Math.max(0, cz - r); z <= Math.min(nz - 1, cz + r); z++) {
            const c = celdaDe(x, y, z);
            for (let k = cuentas[c]; k < cuentas[c + 1]; k++) {
              const i = orden[k];
              const dx = puntos[i * 3] - px;
              const dy = puntos[i * 3 + 1] - py;
              const dz = puntos[i * 3 + 2] - pz;
              const hondo = dx * nx_ + dy * ny_ + dz * nz_;
              const d = dx * dx + dy * dy + dz * dz - 0.85 * hondo * hondo;
              if (d < mejorD) {
                mejorD = d;
                mejor = i;
              }
            }
          }
        }
      }
    }
    salida[v] = mejor >= 0 ? etiquetas[mejor] : 0;
  }
  return salida;
}

// Aplica una matriz (THREE.Matrix4) a posiciones planas; devuelve copia.
export function transformar(posiciones, matriz) {
  const e = matriz.elements;
  const salida = new Float32Array(posiciones.length);
  for (let i = 0; i < posiciones.length; i += 3) {
    const x = posiciones[i];
    const y = posiciones[i + 1];
    const z = posiciones[i + 2];
    salida[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    salida[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    salida[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return salida;
}

// Quita de una malla los triángulos cuyos tres vértices están fuera de la
// máscara, y los vértices que quedan sueltos. Devuelve la malla nueva y,
// si se dan, los colores recortados igual.
// `conservar` null: se queda con todos los triángulos. Con arreglos tipados y sin pedir
// memoria por cada llamada: al armar un carro se llama una vez por pieza, y con arreglos
// de JavaScript era lo que más tardaba al abrir un escaneo de 500 mil triángulos.
let tablaRecorte = new Int32Array(0);
export function recortarMalla({ posiciones, indices, colores = null, uvs = null, normales = null }, conservar) {
  const total = posiciones.length / 3;
  if (tablaRecorte.length < total) tablaRecorte = new Int32Array(total).fill(-1);
  const nuevoIndice = tablaRecorte;
  try {
    // Primero contar, en el orden de aparición, y después llenar.
    let vertices = 0;
    let numIndices = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t];
      const b = indices[t + 1];
      const c = indices[t + 2];
      if (conservar && !(conservar[a] || conservar[b] || conservar[c])) continue;
      numIndices += 3;
      if (nuevoIndice[a] < 0) nuevoIndice[a] = vertices++;
      if (nuevoIndice[b] < 0) nuevoIndice[b] = vertices++;
      if (nuevoIndice[c] < 0) nuevoIndice[c] = vertices++;
    }
    const salida = {
      posiciones: new Float32Array(vertices * 3),
      indices: new Uint32Array(numIndices),
      colores: colores ? new Uint8Array(vertices * 3) : null,
      uvs: uvs ? new Float32Array(vertices * 2) : null,
      normales: normales ? new Float32Array(vertices * 3) : null,
    };
    let k = 0;
    for (let t = 0; t < indices.length; t += 3) {
      if (conservar && !(conservar[indices[t]] || conservar[indices[t + 1]] || conservar[indices[t + 2]])) continue;
      for (let e = 0; e < 3; e++) {
        const v = indices[t + e];
        const u = nuevoIndice[v];
        salida.indices[k++] = u;
        salida.posiciones[u * 3] = posiciones[v * 3];
        salida.posiciones[u * 3 + 1] = posiciones[v * 3 + 1];
        salida.posiciones[u * 3 + 2] = posiciones[v * 3 + 2];
        if (colores) {
          salida.colores[u * 3] = colores[v * 3];
          salida.colores[u * 3 + 1] = colores[v * 3 + 1];
          salida.colores[u * 3 + 2] = colores[v * 3 + 2];
        }
        if (uvs) {
          salida.uvs[u * 2] = uvs[v * 2];
          salida.uvs[u * 2 + 1] = uvs[v * 2 + 1];
        }
        if (normales) {
          salida.normales[u * 3] = normales[v * 3];
          salida.normales[u * 3 + 1] = normales[v * 3 + 1];
          salida.normales[u * 3 + 2] = normales[v * 3 + 2];
        }
      }
    }
    return salida;
  } finally {
    // La tabla queda limpia para la próxima, sin recorrerla entera. En un finally: si falla
    // la reserva de memoria, la pantalla deja volver a elegir el archivo, y con la tabla
    // sucia ese reintento no lanzaba nada y daba un carro de 0 vértices y 136 mil triángulos.
    for (let t = 0; t < indices.length; t++) nuevoIndice[indices[t]] = -1;
  }
}

// Suavizado de Taubin: cada vértice se acerca al promedio de sus vecinos
// (lambda) y luego se aleja un poco (mu negativo), así la malla se alisa sin
// encogerse como con un promedio simple. Para las mallas que arma la app
// (de la profundidad del celular o de una nube): salen grumosas por el
// ruido de cada medida, y la chapa de un carro es lisa. Se aplica DESPUÉS
// de medir: no cambia las medidas, solo cómo se ve.
export function suavizarMalla(posiciones, indices, { iteraciones = 10, lambda = 0.5, mu = -0.53 } = {}) {
  const n = posiciones.length / 3;
  const grado = new Uint32Array(n + 1);
  for (let t = 0; t < indices.length; t += 3) {
    grado[indices[t]] += 2;
    grado[indices[t + 1]] += 2;
    grado[indices[t + 2]] += 2;
  }
  const inicio = new Uint32Array(n + 1);
  for (let v = 0; v < n; v++) inicio[v + 1] = inicio[v] + grado[v];
  const vecinos = new Uint32Array(inicio[n]);
  const lleno = inicio.slice(0, n);
  const unir = (a, b) => {
    vecinos[lleno[a]++] = b;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    unir(a, b);
    unir(a, c);
    unir(b, a);
    unir(b, c);
    unir(c, a);
    unir(c, b);
  }
  let actual = Float32Array.from(posiciones);
  let otra = new Float32Array(posiciones.length);
  for (let it = 0; it < iteraciones; it++) {
    for (const factor of [lambda, mu]) {
      for (let v = 0; v < n; v++) {
        const desde = inicio[v];
        const hasta = inicio[v + 1];
        if (hasta === desde) {
          otra[v * 3] = actual[v * 3];
          otra[v * 3 + 1] = actual[v * 3 + 1];
          otra[v * 3 + 2] = actual[v * 3 + 2];
          continue;
        }
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let k = desde; k < hasta; k++) {
          const w = vecinos[k] * 3;
          sx += actual[w];
          sy += actual[w + 1];
          sz += actual[w + 2];
        }
        // Sin arreglos por vértice: son millones de vueltas (con uno
        // pequeño por vértice el suavizado tardaba 7 s en el PC).
        const m = hasta - desde;
        const i = v * 3;
        otra[i] = actual[i] + factor * (sx / m - actual[i]);
        otra[i + 1] = actual[i + 1] + factor * (sy / m - actual[i + 1]);
        otra[i + 2] = actual[i + 2] + factor * (sz / m - actual[i + 2]);
      }
      [actual, otra] = [otra, actual];
    }
  }
  return actual;
}

// Simplificar una malla grande sin rehacerla: los vértices que caen en la
// misma celda de `celda` metros se juntan en uno (su promedio, y el
// promedio de sus colores), y los triángulos que quedan sin área se van.
// Conserva la superficie de una sola capa y el color (rehacer la malla
// desde los puntos los perdía: salía una cáscara de doble capa, gris y
// unos centímetros más gorda). Si con esa celda quedan más de `maximo`
// triángulos, se agranda la celda y se repite.
//
// Con foto (`uvs`), el carro no la pierde: era pasar de nítido a una mancha pálida por un
// 0,3 % más de triángulos. La posición sigue saliendo de la celda entera, así que las
// costuras quedan cerradas para soldarVertices. La coordenada se promedia por celda y por
// ISLA de la foto (triángulos unidos por sus vértices): promediar dos lados de una costura
// daría un punto cualquiera de la imagen. Un triángulo se va si dos esquinas comparten
// celda, igual que sin foto.
//
// Sin foto, de paso suelda los vértices repetidos de un archivo sin índice. Con foto NO: ahí
// cada triángulo suelto es su propia isla y cada celda se queda con un vértice por isla.
// Medido con un Kona de 546 mil triángulos: 818 mil vértices usados sin índice, y 155 mil con
// él. Una malla con foto tiene que llegar con sus índices.
export function simplificarMalla({ posiciones, indices, colores = null, uvs = null }, { maximo = 500000, celda = 0.012 } = {}) {
  let actual = { posiciones, indices, colores, uvs };
  let tamano = celda;
  const islas = uvs ? islasDeLaFoto(posiciones.length / 3, indices) : null;
  while (actual.indices.length / 3 > maximo && tamano < 0.2) {
    actual = agruparVertices({ posiciones, indices, colores, uvs }, tamano, islas);
    tamano *= 1.4;
  }
  return actual;
}

// Unión por índices: dos vértices del mismo triángulo son de la misma isla. Una malla con
// textura repite los vértices donde cambia de pedazo de foto, así que los pedazos no
// quedan unidos.
function islasDeLaFoto(n, indices) {
  const padre = new Int32Array(n);
  for (let i = 0; i < n; i++) padre[i] = i;
  const raiz = (x) => {
    while (padre[x] !== x) {
      padre[x] = padre[padre[x]];
      x = padre[x];
    }
    return x;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = raiz(indices[t]);
    const b = raiz(indices[t + 1]);
    const c = raiz(indices[t + 2]);
    padre[b] = a;
    padre[c] = a;
  }
  const isla = new Int32Array(n);
  for (let i = 0; i < n; i++) isla[i] = raiz(i);
  return isla;
}

function agruparVertices({ posiciones, indices, colores, uvs = null }, tamano, islas = null) {
  const n = posiciones.length / 3;
  // Dos niveles: primero la celda a un entero (claveBloque ya usa 51 de los 53 bits
  // exactos, no se le puede sumar nada), y luego celda + isla.
  const celdaDe = new Int32Array(n);
  const indiceCelda = new Map();
  const sumaCelda = [];
  const cuentaCelda = [];
  for (let v = 0; v < n; v++) {
    const clave = claveBloque(Math.floor(posiciones[v * 3] / tamano), Math.floor(posiciones[v * 3 + 1] / tamano), Math.floor(posiciones[v * 3 + 2] / tamano));
    let c = indiceCelda.get(clave);
    if (c === undefined) {
      c = cuentaCelda.length;
      indiceCelda.set(clave, c);
      cuentaCelda.push(0);
      sumaCelda.push(0, 0, 0);
    }
    celdaDe[v] = c;
    cuentaCelda[c]++;
    for (let k = 0; k < 3; k++) sumaCelda[c * 3 + k] += posiciones[v * 3 + k];
  }
  const grupoDe = new Int32Array(n);
  const indiceGrupo = islas ? new Map() : null;
  const celdaDeGrupo = [];
  const sumaColor = colores ? [] : null;
  const sumaUv = uvs ? [] : null;
  const cuenta = [];
  for (let v = 0; v < n; v++) {
    let g;
    if (islas) {
      const clave = celdaDe[v] * n + islas[v];
      g = indiceGrupo.get(clave);
      if (g === undefined) {
        g = cuenta.length;
        indiceGrupo.set(clave, g);
      }
    } else {
      g = celdaDe[v];
    }
    if (g === cuenta.length) {
      cuenta.push(0);
      celdaDeGrupo.push(celdaDe[v]);
      if (sumaColor) sumaColor.push(0, 0, 0);
      if (sumaUv) sumaUv.push(0, 0);
    }
    grupoDe[v] = g;
    cuenta[g]++;
    if (sumaColor) for (let k = 0; k < 3; k++) sumaColor[g * 3 + k] += colores[v * 3 + k];
    if (sumaUv) {
      sumaUv[g * 2] += uvs[v * 2];
      sumaUv[g * 2 + 1] += uvs[v * 2 + 1];
    }
  }
  const pos = new Float32Array(cuenta.length * 3);
  const col = sumaColor ? new Uint8Array(cuenta.length * 3) : null;
  const uv = sumaUv ? new Float32Array(cuenta.length * 2) : null;
  for (let g = 0; g < cuenta.length; g++) {
    const c = celdaDeGrupo[g];
    for (let k = 0; k < 3; k++) {
      pos[g * 3 + k] = sumaCelda[c * 3 + k] / cuentaCelda[c];
      if (col) col[g * 3 + k] = Math.round(sumaColor[g * 3 + k] / cuenta[g]);
    }
    if (uv) {
      uv[g * 2] = sumaUv[g * 2] / cuenta[g];
      uv[g * 2 + 1] = sumaUv[g * 2 + 1] / cuenta[g];
    }
  }
  const ind = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    if (celdaDe[a] !== celdaDe[b] && celdaDe[b] !== celdaDe[c] && celdaDe[a] !== celdaDe[c]) ind.push(grupoDe[a], grupoDe[b], grupoDe[c]);
  }
  // Un grupo nace aunque luego se vayan todos sus triángulos, y esos vértices sueltos se
  // guardaban y pesaban: hasta el 54,6 % de los de una malla sin índice.
  return recortarMalla({ posiciones: pos, indices: new Uint32Array(ind), colores: col, uvs: uv }, null);
}

// Puntos repartidos por la superficie de una malla, en promedio uno por
// cada `paso` × `paso` de área, y nunca más de unos `maximo`. Para medir y
// aislar no sirven los vértices: una malla exportada y simplificada puede
// tenerlos a 10 cm (cada vértice quedaba suelto en la rejilla de 6 cm y el
// carro "no aparecía"), y donde hay más vértices la medida se cargaba hacia
// ese lado. Por eso cada triángulo recibe muestras según su ÁREA (un
// triángulo diminuto puede no recibir ninguna; la primera versión le daba
// al menos tres a cada uno y en mallas finas volvía el sesgo), en posiciones
// al azar con una semilla fija: el mismo archivo da siempre las mismas.
export function muestrearMalla({ posiciones, indices }, { paso = 0.03, maximo = 600000, semilla = 12345 } = {}) {
  let area = 0;
  for (let t = 0; t < indices.length; t += 3) area += areaTriangulo(posiciones, indices[t], indices[t + 1], indices[t + 2]);
  const porMuestra = Math.max(paso * paso, area / maximo);
  let s = semilla >>> 0;
  const azar = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const salida = new Float32Array(Math.ceil(area / porMuestra + indices.length / 3 + 16) * 3);
  let k = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const esperadas = areaTriangulo(posiciones, indices[t], indices[t + 1], indices[t + 2]) / porMuestra;
    let m = Math.floor(esperadas) + (azar() < esperadas - Math.floor(esperadas) ? 1 : 0);
    while (m-- > 0 && k + 3 <= salida.length) {
      let r1 = azar();
      let r2 = azar();
      if (r1 + r2 > 1) {
        r1 = 1 - r1;
        r2 = 1 - r2;
      }
      for (let e = 0; e < 3; e++) salida[k++] = posiciones[a + e] + (posiciones[b + e] - posiciones[a + e]) * r1 + (posiciones[c + e] - posiciones[a + e]) * r2;
    }
  }
  return salida.subarray(0, k);
}

function areaTriangulo(p, i0, i1, i2) {
  const ax = p[i1 * 3] - p[i0 * 3];
  const ay = p[i1 * 3 + 1] - p[i0 * 3 + 1];
  const az = p[i1 * 3 + 2] - p[i0 * 3 + 2];
  const bx = p[i2 * 3] - p[i0 * 3];
  const by = p[i2 * 3 + 1] - p[i0 * 3 + 1];
  const bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
}

// La tubería completa sobre una malla en coordenadas del escaneo (y
// arriba): piso, carro, orientación, medidas y piezas. Devuelve el
// "escaneo" listo para guardar: la malla en el marco del carro, colores
// (si los traía), una etiqueta por vértice, los nombres de las etiquetas,
// las medidas reales y cómo se orientó.
//
// `puntos` (opcional): la nube original, en las mismas coordenadas que la
// malla, cuando la malla se hizo de una nube (mallaDesdePuntos). La malla
// de una nube es una cáscara con grosor y sale unos 6 cm más ancha de cada
// lado; el piso, el carro, la orientación y las medidas se sacan de los
// puntos, y la malla solo se recorta y se lleva al marco del carro.
//
// `suavizar`: para las mallas que arma la app (suavizarMalla), no para las
// que vienen hechas de otra app.
// ---------- Cerrar los huecos chicos ----------
//
// En el escaneo del celular, el capó y el techo se ven casi de canto
// (nadie sube el celular dos metros por encima del carro) y, con el ruido
// de ARCore, la TSDF no alcanza a saber qué queda debajo de la lata: la
// malla sale picada de huecos de 3 a 20 cm (maqueta del 23-oct-2026, con
// el escaneo simulado de un sedán). Bajar el peso mínimo no los cierra: no
// faltan datos, falta el lado de adentro. Lo que hace cualquier app de
// escaneo: cerrar los huecos CHICOS de la malla. Cada hueco es un lazo de
// aristas de borde (las que solo tienen un triángulo); si es corto, se
// tapa con un abanico desde su centro. Los lazos largos (la panza del
// carro, que nunca se ve) quedan abiertos: taparlos sería inventar.
export function cerrarHuecos(malla, { maxAristas = 60, maxPerimetro = 1.2 } = {}) {
  const { posiciones, indices, colores } = malla;
  const nv = posiciones.length / 3;
  const clave = (a, b) => a * nv + b;
  const aristas = new Set();
  for (let t = 0; t < indices.length; t += 3) {
    aristas.add(clave(indices[t], indices[t + 1]));
    aristas.add(clave(indices[t + 1], indices[t + 2]));
    aristas.add(clave(indices[t + 2], indices[t]));
  }
  // De cada vértice del borde sale UNA arista de borde (si la malla es
  // limpia). Si salen dos, el vértice es ambiguo y su lazo no se toca.
  const sale = new Map();
  const ambiguo = new Set();
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      const b = indices[t + ((k + 1) % 3)];
      if (aristas.has(clave(b, a))) continue;
      if (sale.has(a)) ambiguo.add(a);
      else sale.set(a, b);
    }
  }
  const visto = new Set();
  const nuevasPos = [];
  const nuevosCol = [];
  const nuevosInd = [];
  for (const inicio of sale.keys()) {
    if (visto.has(inicio)) continue;
    const lazo = [];
    let v = inicio;
    let sirve = true;
    let perimetro = 0;
    for (;;) {
      if (visto.has(v)) {
        if (v !== inicio) sirve = false;
        break;
      }
      visto.add(v);
      if (ambiguo.has(v)) sirve = false;
      lazo.push(v);
      const w = sale.get(v);
      if (w === undefined) {
        sirve = false;
        break;
      }
      perimetro += Math.hypot(posiciones[w * 3] - posiciones[v * 3], posiciones[w * 3 + 1] - posiciones[v * 3 + 1], posiciones[w * 3 + 2] - posiciones[v * 3 + 2]);
      v = w;
    }
    if (!sirve || lazo.length < 3 || lazo.length > maxAristas || perimetro > maxPerimetro) continue;
    // Los triángulos nuevos van al revés del borde, para quedar con la
    // misma orientación que los de alrededor.
    if (lazo.length === 3) {
      nuevosInd.push(lazo[0], lazo[2], lazo[1]);
      continue;
    }
    const centro = nv + nuevasPos.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const col = [0, 0, 0];
    for (const i of lazo) {
      cx += posiciones[i * 3];
      cy += posiciones[i * 3 + 1];
      cz += posiciones[i * 3 + 2];
      if (colores) for (let k = 0; k < 3; k++) col[k] += colores[i * 3 + k];
    }
    nuevasPos.push(cx / lazo.length, cy / lazo.length, cz / lazo.length);
    if (colores) nuevosCol.push(...col.map((c) => Math.round(c / lazo.length)));
    for (let i = 0; i < lazo.length; i++) nuevosInd.push(lazo[(i + 1) % lazo.length], lazo[i], centro);
  }
  if (!nuevosInd.length) return malla;
  const pos = new Float32Array(posiciones.length + nuevasPos.length);
  pos.set(posiciones);
  pos.set(nuevasPos, posiciones.length);
  const ind = new Uint32Array(indices.length + nuevosInd.length);
  ind.set(indices);
  ind.set(nuevosInd, indices.length);
  let col = null;
  if (colores) {
    col = new Uint8Array(colores.length + nuevosCol.length);
    col.set(colores);
    col.set(nuevosCol, colores.length);
  }
  return { posiciones: pos, indices: ind, colores: col };
}

export function procesarEscaneo(mallaDelArchivo, { carroceria = 'sedan', medidasCatalogo = null, voltear = false, entreEjes = null, puntos = null, suavizar = false, luz = null, maximoTriangulos = null } = {}) {
  // Se mide sobre puntos repartidos por la superficie (muestrearMalla), no
  // sobre los vértices; o sobre la nube original si la hay.
  let fuente = puntos || muestrearMalla(mallaDelArchivo);
  let malla = mallaDelArchivo;
  // Un carro parqueado en pendiente: lo de abajo supone un piso a "y" constante (escaneo-nivel.js).
  const nivel = giroDeNivel(fuente);
  if (nivel) {
    fuente = transformar(fuente, nivel.matriz);
    malla = { ...malla, posiciones: transformar(malla.posiciones, nivel.matriz) };
  }
  const piso = estimarPiso(fuente);
  const mascara = aislarCarro(fuente, { piso });
  const orientacion = orientarCarro(fuente, mascara, { piso, carroceria, voltear });
  // La malla: lo que quede dentro de la caja del carro (en su marco), con
  // 10 cm de margen, y por encima de la banda del piso.
  const enCarroTodo = transformar(malla.posiciones, orientacion.matriz);
  const m = orientacion.medidas;
  const dentro = new Uint8Array(enCarroTodo.length / 3);
  // La franja de abajo se corta para botar el piso; pero una malla SIN piso
  // alrededor (tallada con siluetas, o recortada a mano en la app de escaneo)
  // perdía ahí los últimos 8 cm de las llantas y el carro quedaba flotando. Se decide con
  // las muestras repartidas por área, no con los vértices: un piso simplificado (30
  // vértices en 80 m²) casi no tiene vértices, y uno recortado casi no tiene nada
  // alrededor. El mismo criterio de estimarPiso: hay piso si es una franja llena. O si hay
  // algo a esa altura por fuera de la huella, donde las llantas no llegan: un retazo (una
  // tira de 25 cm en un costado es el 4,8 %, y en el Kona o el Moskvitch afuera hay 0,00 %)
  // se quedaba en la malla, apagaba la lectura de los ejes y se teñía con la pieza de al lado.
  const fuenteEnCarro = transformar(fuente, orientacion.matriz);
  let cercaDelPiso = 0;
  let pisoAfuera = 0;
  for (let i = 0; i < fuenteEnCarro.length; i += 3) {
    if (fuenteEnCarro[i + 1] >= 0.03) continue;
    cercaDelPiso++;
    if (Math.abs(fuenteEnCarro[i]) > m.ancho / 2 + 0.05 || Math.abs(fuenteEnCarro[i + 2]) > m.largo / 2 + 0.05) pisoAfuera++;
  }
  const muestras = fuenteEnCarro.length / 3;
  const corte = cercaDelPiso > 0.05 * muestras || pisoAfuera > 0.005 * muestras ? 0.08 : -0.02;
  for (let v = 0; v < dentro.length; v++) {
    const x = enCarroTodo[v * 3];
    const y = enCarroTodo[v * 3 + 1];
    const z = enCarroTodo[v * 3 + 2];
    const enCaja = Math.abs(x) < m.ancho / 2 + 0.25 && Math.abs(z) < m.largo / 2 + 0.1 && y > corte && y < m.alto + 0.1;
    dentro[v] = enCaja ? 1 : 0;
  }
  let cortada = recortarMalla({ posiciones: enCarroTodo, indices: malla.indices, colores: malla.colores || null, uvs: malla.uvs || null }, dentro);
  const ejes = entreEjes || (medidasCatalogo && medidasCatalogo.entreEjes) || null;
  // El tope cuenta lo que queda del carro, no el archivo entero con su piso y alrededores.
  // Lo que se lee (juntas, cintura, ejes) sale de antes de simplificar: el carro no puede
  // cambiar de puertas por pasar del tope. La misma Kona a 546 mil triángulos perdía la junta
  // delantera, y el color promediado por celda movía la cintura.
  let lecturas = null;
  if (maximoTriangulos && cortada.indices.length / 3 > maximoTriangulos) {
    lecturas = lecturasDelEscaneo(cortada.posiciones, carroceria, m, ejes, { indices: cortada.indices, colores: cortada.colores, uvs: cortada.uvs, luz });
    cortada = simplificarMalla(cortada, { maximo: maximoTriangulos });
  }
  if (cortada.indices.length < 300) throw new Error('No encontré un carro en el escaneo (quedaron muy pocos triángulos)');
  // El escaneo del celular (el que se suaviza) trae huecos chicos donde la
  // lata se vio de canto; se cierran ANTES de suavizar, para que el
  // suavizado acomode el parche con lo de alrededor.
  const recortada = suavizar ? cerrarHuecos(cortada) : cortada;
  const enCarro = suavizar ? suavizarMalla(recortada.posiciones, recortada.indices) : recortada.posiciones;
  const medidas = orientacion.medidas;
  const piezas = piezasDelEscaneo(enCarro, carroceria, medidas, ejes, { indices: recortada.indices, colores: recortada.colores, uvs: recortada.uvs || null, luz, lecturas });
  return {
    posiciones: enCarro,
    indices: recortada.indices,
    colores: recortada.colores,
    uvs: recortada.uvs || null,
    ...piezas,
    medidas,
    volteado: Boolean(voltear),
  };
}

// Las piezas de un escaneo ya en el marco del carro: el genérico a las
// medidas medidas (la distancia entre ejes, la del catálogo si la hay: el
// escaneo no la mide) y la muestra más cercana. `medidasDibujo` es lo que
// el genérico de verdad dibuja: si el escaneo mide algo fuera de lo que
// es un carro (un alto de 3 m por un estorbo pegado), el genérico se queda
// en lo razonable y `fueraDeRango` lo dice, para que la pantalla avise.
//
// Desde el 27-oct-2026 el genérico no solo toma el largo, el ancho y el
// alto: se acomoda a lo que se lee en el escaneo (ajustesDelEscaneo: los
// ejes, el bajo de la lata y la línea del vidrio). Si el escaneo trae color,
// lo que es claramente oscuro (plástico negro, llantas, vidrio polarizado)
// no se cuenta como pieza pintada. Y las etiquetas se limpian por mayoría de
// vecinos, para que cada pieza tenga un borde limpio y no dientes.
//
// `lecturas`: lo que ya se leyó con lecturasDelEscaneo, sobre la malla sin simplificar.
export function piezasDelEscaneo(enCarro, carroceria, medidas, entreEjes = null, { indices = null, colores = null, uvs = null, luz = null, previos = null, lecturas = null } = {}) {
  const tipo = normalizarCarroceria(carroceria);
  const medidasDibujo = medidasDelGenerico(tipo, medidas, entreEjes);
  // Por debajo de 1,2 m se dibuja a la medida (para que las piezas caigan bien), pero se
  // avisa: solo un deportivo mide menos, y lo más probable es que el escaneo esté mal.
  const fueraDeRango = ['largo', 'ancho', 'alto'].some((c) => Math.abs(medidasDibujo[c] - medidas[c]) > 0.02) || medidas.alto < 1.2;
  const ajustes = lecturas ? { ...lecturas } : lecturasDelEscaneo(enCarro, tipo, medidas, entreEjes, { indices, colores, uvs, luz });
  // La foto no se guarda, así que al cambiar de carrocería se usan las juntas que ya se
  // leyeron (son del carro). Y la cintura: leída otra vez, en una malla simplificada volvería
  // a ser la de esa rejilla.
  if (previos && !(luz && uvs && indices)) {
    for (const k of ['puertaDel', 'puertaMedia', 'puertaTras', 'juntasLado', 'cintura']) if (previos[k] != null) ajustes[k] = previos[k];
  }
  // La puerta empieza donde se acaba el capó: si la forma no dijo dónde está la
  // base del parabrisas, la junta sí lo dice.
  if (ajustes.puertaDel != null && ajustes.capoTras == null) ajustes.capoTras = ajustes.puertaDel + 0.04;
  const generico = construirCarro({ carroceria: tipo, medidas: medidasDibujo, ajustes });
  const muestras = muestrasDelGenerico(generico, { paso: 0.03 });
  const soldado = indices ? soldarVertices(enCarro) : null;
  const normales = indices ? normalesSoldadas(enCarro, indices, soldado) : null;
  let etiquetas = etiquetarPiezas(enCarro, muestras, { normales });
  // Un costado cuyas juntas caen en otro sitio se etiqueta con un genérico a su medida.
  const lados = ajustes.juntasLado;
  if (lados) {
    for (const [nombre, signo] of [['der', 1], ['izq', -1]]) {
      const propias = {};
      let distinta = false;
      for (const k of ['puertaDel', 'puertaMedia', 'puertaTras']) {
        if (lados[nombre] && lados[nombre][k] != null) {
          propias[k] = lados[nombre][k];
          if (Math.abs(propias[k] - (ajustes[k] ?? propias[k])) > 0.015) distinta = true;
        }
      }
      if (!distinta) continue;
      const otras = muestrasDelGenerico(construirCarro({ carroceria: tipo, medidas: medidasDibujo, ajustes: { ...ajustes, ...propias } }), { paso: 0.03 });
      if (otras.nombres.join() !== muestras.nombres.join()) continue;
      const suyas = etiquetarPiezas(enCarro, otras, { normales });
      // Solo las piezas de ese costado: las del centro se quedan con el genérico del promedio.
      // En una pick-up el techo termina donde la cabina, que sale de puertaTras, y con un
      // final por lado le quedaba un escalón en x = 0 (1,17 contra 1,32 en el Kona).
      const deCostado = muestras.nombres.map((pieza) => /-(der|izq)$/.test(pieza));
      for (let v = 0; v < etiquetas.length; v++) if (enCarro[v * 3] * signo > 0 && (deCostado[etiquetas[v]] || deCostado[suyas[v]])) etiquetas[v] = suyas[v];
    }
  }
  const pintura = pinturaDelEscaneo(enCarro, colores, medidasDibujo);
  if (pintura) {
    for (let v = 0; v < etiquetas.length; v++) if (!pintura[v]) etiquetas[v] = 0;
  }
  if (indices) {
    // Soldadas: una malla con textura repite los vértices en cada costura de
    // foto, y sin soldar, la limpieza de bordes no cruza esas costuras.
    const { grupo, cuantos } = soldado;
    const porGrupo = new Uint8Array(cuantos);
    for (let v = 0; v < etiquetas.length; v++) porGrupo[grupo[v]] = etiquetas[v];
    const soldados = Uint32Array.from(indices, (v) => grupo[v]);
    // Los umbrales de las pecas van por área de verdad, un tercio de cada triángulo vecino.
    // Con vértices a la densidad promedio, una malla que gasta los suyos en llantas y parrilla
    // y deja rala la lata perdía piezas enteras: el guardafango del Kona a 50 mil triángulos,
    // con 0,042 m² y 21 vértices, contra un mínimo de 31.
    const area = new Float64Array(cuantos);
    for (let t = 0; t < indices.length; t += 3) {
      const tercio = areaTriangulo(enCarro, indices[t], indices[t + 1], indices[t + 2]) / 3;
      for (let k = 0; k < 3; k++) area[soldados[t + k]] += tercio;
    }
    const limpias = quitarIslas(soldados, suavizarEtiquetas(soldados, porGrupo), 0.024, 0.24, area);
    etiquetas = Uint8Array.from(etiquetas, (_, v) => limpias[grupo[v]]);
  }
  return { etiquetas, nombres: muestras.nombres, medidasDibujo, fueraDeRango, carroceria: tipo, ajustes };
}

// Las medidas del genérico: las del escaneo, con la distancia entre ejes del catálogo si la hay.
function medidasDelGenerico(tipo, medidas, entreEjes) {
  const pedidas = { largo: medidas.largo, ancho: medidas.ancho, alto: medidas.alto };
  if (entreEjes) pedidas.entreEjes = entreEjes > 100 ? entreEjes / 1000 : entreEjes;
  return medidasParaDibujar(tipo, pedidas);
}

// Lo que se lee en el escaneo para acomodar el genérico: lo de la forma y el color
// (ajustesDelEscaneo) y las juntas de las puertas, de la foto si llegó.
function lecturasDelEscaneo(enCarro, carroceria, medidas, entreEjes, { indices = null, colores = null, uvs = null, luz = null }) {
  const tipo = normalizarCarroceria(carroceria);
  const medidasDibujo = medidasDelGenerico(tipo, medidas, entreEjes);
  const lecturas = ajustesDelEscaneo(enCarro, medidasDibujo, colores);
  if (luz && uvs && indices) Object.assign(lecturas, puertasDeLaFoto(enCarro, indices, uvs, luz, medidasDibujo, disposicion(tipo, medidasDibujo, lecturas)));
  return lecturas;
}

// Las juntas reales de las puertas, leídas de la foto. Vistas de lado, son rayas
// verticales oscuras y angostas que atraviesan toda la lata. Se pinta cada costado como
// una imagen (5 mm a lo largo, en la mitad de arriba de la puerta) y, por cada tajada,
// se mide cuántos niveles de gris es más oscura que lo que tiene a CADA lado, con la
// mediana de las filas:
//  - la mediana: lo que no atraviesa la franja (una manija) no cuenta;
//  - a cada lado, y se toma el menor: el borde de un reflejo es un escalón, más oscuro
//    que un lado pero no que el otro, y contra la media de los dos contaba como raya;
//  - en niveles de gris y no en proporción: en un costado a contraluz, de brillo 20, dos
//    niveles pesaban como una junta.
// Un reflejo de un poste sí es una raya, pero no está en los dos costados. Una raya
// cuenta si en el otro costado hay otra cerca, o si el otro costado no puede opinar (no
// hay foto, o está tan oscuro que ahí no se distingue nada). En lo oscuro una raya no manda
// sola: se le exige una pareja clara y cerca, también si el otro costado está oscuro. Un
// carro negro, con los dos a brillo 30, si no nunca leía una junta, por marcada que fuera.
//
// Cada costado guarda su propia lectura (`juntasLado`): sobre una malla tallada con
// siluetas la foto se corre según desde dónde se tomó, y en el Kona la misma junta cae
// 10 cm más allá de un lado que del otro. La pieza tiene que caer sobre la junta que se
// ve en ESE lado. Medido solo en dos carros: los umbrales hay que volver a mirarlos con
// el primer escaneo de RealityScan.
//
// `luz`: { datos, ancho, alto }, la foto en grises, un byte por píxel.
// Devuelve solo las juntas que se ven claras. `traza`: un arreglo donde dejar qué se
// consideró y por qué (para volver a medir con otro carro).
const JUNTA_NIVELES = 3.4; // cuántos niveles de gris más oscura que a los dos lados
const JUNTA_VECES_RUIDO = 5; // y cuántas veces sobre el ruido de su propia ventana
const JUNTA_PAREJA_NIVELES = 2; // lo que basta en el otro costado para contar como pareja
const JUNTA_PAREJA_M = 0.15; // a qué distancia en el otro costado
const JUNTA_LUZ_MUDA = 40; // con menos brillo que esto, un costado no opina
const LUZ_CABINA = 0.12; // de la puerta a la luz cabina-platón de una pick-up (disposicion: cabinaTras)

function medianaDe(lista, cuantos) {
  const parte = lista.subarray(0, cuantos).sort();
  return parte[Math.floor(cuantos / 2)];
}

// De la imagen de un costado, por tajada: la raya (`perfil`), la misma medida contra la
// media de los dos lados, que no se sesga y es de donde sale el ruido (`referencia`), y
// el brillo de alrededor (`brillo`).
function perfilDeCostado(lado, nz, filas) {
  const radio = 10; // ±5 cm
  const perfil = new Float32Array(nz);
  const referencia = new Float32Array(nz);
  const brillo = new Float32Array(nz);
  const conDato = new Uint8Array(nz);
  const izq = new Float32Array(nz * filas).fill(NaN);
  const der = new Float32Array(nz * filas).fill(NaN);
  const med = new Float32Array(nz * filas).fill(NaN);
  const alrededor = new Float32Array(nz * filas).fill(NaN);
  const suma = new Float64Array(nz + 1);
  const cuenta = new Int32Array(nz + 1);
  for (let f = 0; f < filas; f++) {
    for (let k = 0; k < nz; k++) {
      const v = lado[f * nz + k];
      suma[k + 1] = suma[k] + (v >= 0 ? v : 0);
      cuenta[k + 1] = cuenta[k] + (v >= 0 ? 1 : 0);
    }
    for (let k = 0; k < nz; k++) {
      const v = lado[f * nz + k];
      if (v < 0) continue;
      const a = Math.max(0, k - radio);
      const b = Math.min(nz, k + radio + 1);
      const nIzq = cuenta[k] - cuenta[a];
      const nDer = cuenta[b] - cuenta[k + 1];
      // Al borde de lo que hay foto no hay con qué comparar.
      if (nIzq < radio / 2 || nDer < radio / 2) continue;
      const mediaIzq = (suma[k] - suma[a]) / nIzq;
      const mediaDer = (suma[b] - suma[k + 1]) / nDer;
      izq[f * nz + k] = mediaIzq - v;
      der[f * nz + k] = mediaDer - v;
      med[f * nz + k] = (mediaIzq + mediaDer) / 2 - v;
      alrededor[f * nz + k] = (mediaIzq + mediaDer) / 2;
    }
  }
  const fila = [new Float32Array(filas), new Float32Array(filas), new Float32Array(filas), new Float32Array(filas)];
  for (let k = 0; k < nz; k++) {
    let m = 0;
    for (let f = 0; f < filas; f++) {
      if (Number.isNaN(izq[f * nz + k])) continue;
      fila[0][m] = izq[f * nz + k];
      fila[1][m] = der[f * nz + k];
      fila[2][m] = med[f * nz + k];
      fila[3][m] = alrededor[f * nz + k];
      m++;
    }
    if (m < filas * 0.6) continue;
    conDato[k] = 1;
    perfil[k] = Math.min(medianaDe(fila[0], m), medianaDe(fila[1], m));
    referencia[k] = medianaDe(fila[2], m);
    brillo[k] = medianaDe(fila[3], m);
  }
  return { perfil, referencia, brillo, conDato };
}

export function puertasDeLaFoto(posiciones, indices, uvs, luz, { largo }, previa, traza = null) {
  const paso = 0.005;
  const z0 = -largo / 2 - 0.1;
  const nz = Math.ceil((largo + 0.2) / paso);
  const yBajo = previa.piso + 0.45 * (previa.cintura - previa.piso);
  const yAlto = previa.cintura - 0.05;
  if (yAlto - yBajo < 0.1) return {};
  // 56 filas y no 14: con pocas, una sola fila mala inflaba el contraste (una falsa del
  // Moskvitch bajó de 0,105 a 0,025).
  const filas = 56;
  const altoFila = (yAlto - yBajo) / filas;
  const crear = () => new Float32Array(nz * filas).fill(-1);
  const lados = [crear(), crear()]; // 0: x > 0 (el lado derecho), 1: x < 0
  const P = posiciones;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const ya = P[a * 3 + 1];
    const yb = P[b * 3 + 1];
    const yc = P[c * 3 + 1];
    if (Math.max(ya, yb, yc) < yBajo || Math.min(ya, yb, yc) > yAlto) continue;
    const za = P[a * 3 + 2];
    const zb = P[b * 3 + 2];
    const zc = P[c * 3 + 2];
    const ux = P[b * 3] - P[a * 3];
    const uy = yb - ya;
    const uz = zb - za;
    const wx = P[c * 3] - P[a * 3];
    const wy = yc - ya;
    const wz = zc - za;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz_ = ux * wy - uy * wx;
    // Solo lo que mira hacia el costado.
    if (nx * nx < 0.5 * (nx * nx + ny * ny + nz_ * nz_) || nx === 0) continue;
    const lado = lados[P[a * 3] > 0 ? 0 : 1];
    const f0 = Math.max(0, Math.ceil((Math.min(ya, yb, yc) - yBajo) / altoFila - 0.5));
    const f1 = Math.min(filas - 1, Math.floor((Math.max(ya, yb, yc) - yBajo) / altoFila - 0.5));
    const k0 = Math.max(0, Math.ceil((Math.min(za, zb, zc) - z0) / paso - 0.5));
    const k1 = Math.min(nz - 1, Math.floor((Math.max(za, zb, zc) - z0) / paso - 0.5));
    const den = (yb - yc) * (za - zc) + (zc - zb) * (ya - yc);
    if (Math.abs(den) < 1e-12) continue;
    for (let f = f0; f <= f1; f++) {
      const y = yBajo + (f + 0.5) * altoFila;
      for (let k = k0; k <= k1; k++) {
        const z = z0 + (k + 0.5) * paso;
        const l0 = ((yb - yc) * (z - zc) + (zc - zb) * (y - yc)) / den;
        const l1 = ((yc - ya) * (z - zc) + (za - zc) * (y - yc)) / den;
        const l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const u = l0 * uvs[a * 2] + l1 * uvs[b * 2] + l2 * uvs[c * 2];
        const v = l0 * uvs[a * 2 + 1] + l1 * uvs[b * 2 + 1] + l2 * uvs[c * 2 + 1];
        // Un archivo puede traer la foto repetida, con coordenadas fuera de 0..1.
        const px = Math.min(luz.ancho - 1, Math.floor((u - Math.floor(u)) * luz.ancho));
        const py = Math.min(luz.alto - 1, Math.floor((v - Math.floor(v)) * luz.alto));
        lado[f * nz + k] = luz.datos[py * luz.ancho + px];
      }
    }
  }
  const perfiles = lados.map((lado) => perfilDeCostado(lado, nz, filas));
  const kDe = (z) => Math.round((z - z0) / paso - 0.5);
  const zDe = (k) => z0 + (k + 0.5) * paso;
  const mudo = (s, z) => {
    const k = kDe(z);
    return k < 0 || k >= nz || !perfiles[s].conDato[k] || perfiles[s].brillo[k] < JUNTA_LUZ_MUDA;
  };
  // ¿Hay raya en el costado s cerca de z?
  const hayRaya = (s, z, distancia, niveles) => {
    const { perfil, conDato } = perfiles[s];
    const alcance = Math.round(distancia / paso);
    const k = kDe(z);
    for (let i = Math.max(0, k - alcance); i <= Math.min(nz - 1, k + alcance); i++) if (conDato[i] && perfil[i] >= niveles) return true;
    return false;
  };
  // Las rayas de un costado en una ventana, la más fuerte primero.
  const candidatas = (s, desde, hasta) => {
    const { perfil, referencia, conDato } = perfiles[s];
    const k0 = Math.max(0, kDe(desde));
    const k1 = Math.min(nz - 1, kDe(hasta));
    const ruidos = [];
    for (let k = k0; k <= k1; k++) if (conDato[k]) ruidos.push(Math.abs(referencia[k]));
    if (!ruidos.length) return [];
    ruidos.sort((p, q) => p - q);
    const ruido = ruidos[Math.floor(ruidos.length / 2)];
    const lista = [];
    for (let k = k0; k <= k1; k++) {
      const v = perfil[k];
      if (!conDato[k] || v < JUNTA_NIVELES || v <= JUNTA_VECES_RUIDO * ruido) continue;
      if ((k > 0 && perfil[k - 1] > v) || (k < nz - 1 && perfil[k + 1] > v) || (k > 1 && perfil[k - 2] > v) || (k < nz - 2 && perfil[k + 2] > v)) continue;
      lista.push({ z: zDe(k), fuerza: v });
    }
    return lista.sort((p, q) => q.fuerza - p.fuerza);
  };
  // La junta de esa ventana en cada costado (null donde no se lee). El que no se lee
  // toma la del otro: es mejor que el genérico, que la pone a ojo. Vale la más fuerte, o
  // la de más atrás con `laDeAtras`.
  const leer = (desde, hasta, laDeAtras = false) => {
    const lectura = [null, null];
    for (const s of [0, 1]) {
      const otro = 1 - s;
      for (const c of candidatas(s, desde, hasta)) {
        const yoMudo = mudo(s, c.z);
        const otroMudo = mudo(otro, c.z);
        const vale = yoMudo
          ? hayRaya(otro, c.z, 0.08, JUNTA_NIVELES)
          : otroMudo || hayRaya(otro, c.z, JUNTA_PAREJA_M, JUNTA_PAREJA_NIVELES);
        if (traza) traza.push(`[${desde.toFixed(2)}, ${hasta.toFixed(2)}] ${s === 0 ? 'der' : 'izq'} z=${c.z.toFixed(3)} fuerza ${c.fuerza.toFixed(1)} brillo ${perfiles[s].brillo[kDe(c.z)].toFixed(0)}${yoMudo ? ' mudo' : ''}${otroMudo ? ' otro-mudo' : ''} → ${vale ? 'VALE' : 'no'}`);
        if (vale && (lectura[s] === null || (laDeAtras && c.z > lectura[s]))) lectura[s] = c.z;
        if (vale && !traza && !laDeAtras) break;
      }
    }
    if (lectura[0] === null) lectura[0] = lectura[1];
    if (lectura[1] === null) lectura[1] = lectura[0];
    return lectura;
  };
  const promedio = (l) => (l[0] === null ? null : (l[0] + l[1]) / 2);

  // Primero la del medio, que es la más marcada (el pilar, con su caucho). Las otras dos
  // se buscan a partir de ella, por lo que mide una puerta: el genérico las pone a ojo, a
  // veces 40 cm al lado (en el Moskvitch, la delantera). Y no dentro de la rueda: ahí el
  // borde del pase de rueda es una raya vertical en los dos costados.
  const medio = leer(previa.puertaMedia - 0.35, previa.puertaMedia + 0.35);
  const m = promedio(medio);
  const finRuedaDel = Number.isFinite(previa.ejeDel + previa.radioRueda) ? previa.ejeDel + previa.radioRueda - 0.05 : -Infinity;
  const hastaEjeTras = Number.isFinite(previa.ejeTras) ? previa.ejeTras : Infinity;
  const del = m !== null ? leer(Math.max(m - 1.25, finRuedaDel), m - 0.75) : leer(Math.max(previa.puertaDel - 0.3, finRuedaDel), previa.puertaDel + 0.3);
  // En una pick-up, en esa ventana están la puerta y, detrás, la luz entre la cabina y el
  // platón: la luz es la de más atrás, y no la más oscura (con la cabina en sombra gana la
  // puerta, y restarle los 12 cm la corría 11,5 cm). La puerta termina 12 cm antes de la luz.
  const esPickUp = previa.tipo === 'camioneta';
  const tras = m !== null ? leer(m + 0.6, Math.min(m + 1.15, hastaEjeTras), esPickUp) : leer(previa.puertaTras - 0.3, Math.min(previa.puertaTras + 0.3, hastaEjeTras), esPickUp);
  if (esPickUp) {
    if (tras[0] !== null) tras[0] -= LUZ_CABINA;
    if (tras[1] !== null) tras[1] -= LUZ_CABINA;
  }
  const salida = {};
  if (m !== null) salida.puertaMedia = m;
  if (promedio(del) !== null) salida.puertaDel = promedio(del);
  if (promedio(tras) !== null) salida.puertaTras = promedio(tras);
  if (m !== null || promedio(del) !== null || promedio(tras) !== null) {
    salida.juntasLado = {
      der: { puertaDel: del[0], puertaMedia: medio[0], puertaTras: tras[0] },
      izq: { puertaDel: del[1], puertaMedia: medio[1], puertaTras: tras[1] },
    };
  }
  return salida;
}

// ---------- Acomodar el genérico a lo medido ----------
//
// Tres cosas que se leen en la malla del carro (en su marco: piso en y = 0,
// frente hacia -Z), y que mandan sobre las proporciones típicas:
//  - Los EJES: a lo largo del carro, por tajadas de 5 cm, el punto más bajo
//    de los costados. Donde están las llantas, toca el piso; entre ellas y
//    en los voladizos, queda a la altura del bajo de la lata. Los dos tramos
//    que tocan el piso son las llantas, y su centro, el eje.
//  - El PISO (dónde empieza la lata): la mediana de ese punto más bajo entre
//    las dos llantas.
//  - La CINTURA (dónde termina la lata y empieza el vidrio): por alturas, el
//    ancho de la carrocería en la mitad del carro (percentil 70, para que los
//    espejos no cuenten). La lata baja casi recta y la cabina se cierra hacia
//    adentro: la cintura es el codo de esa curva.
//  - El PERFIL de arriba: el codo entre el capó y el parabrisas (capoTras),
//    dónde se llega al techo (parabrisasAlto) y dónde se acaba (techoTras).
// Lo que no se pueda leer con confianza no se devuelve, y el genérico usa lo
// típico. Medido en el Kona escaneado: ejes a -1,23 y +1,53 m, piso a 20 cm,
// cintura a 1,00 m (el genérico SUV ponía 42 cm y 86 cm).
export function ajustesDelEscaneo(posiciones, medidas, colores = null) {
  const { largo, ancho, alto } = medidas;
  const n = posiciones.length / 3;
  const ajustes = {};
  const paso = 0.05;
  const z0 = -largo / 2;
  const nz = Math.ceil(largo / paso) + 1;
  const bajo = new Float32Array(nz).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (Math.abs(posiciones[i * 3]) < ancho / 2 - 0.3) continue;
    const b = Math.floor((posiciones[i * 3 + 2] - z0) / paso);
    const y = posiciones[i * 3 + 1];
    if (b >= 0 && b < nz && y < bajo[b]) bajo[b] = y;
  }
  const conDato = Array.from(bajo).filter(Number.isFinite).sort((p, q) => p - q);
  if (conDato.length > 10) {
    // Una llanta llega al menos 5 cm más abajo que el bajo de la carrocería
    // (la mediana); no se compara con el punto más bajo de todos, porque un
    // piso apenas inclinado deja una de las dos llantas sin contar.
    const mediana = conDato[Math.floor(conDato.length / 2)];
    const suelo = Math.min(mediana - 0.05, conDato[0] + 0.1);
    const tramos = [];
    let ini = -1;
    let ult = -1;
    for (let b = 0; b < nz; b++) {
      if (bajo[b] < suelo) {
        if (ini < 0) ini = b;
        ult = b;
      } else if (ini >= 0 && b - ult > 2) {
        tramos.push([ini, ult]);
        ini = -1;
      }
    }
    if (ini >= 0) tramos.push([ini, ult]);
    const centro = ([a, b]) => z0 + ((a + b + 1) / 2) * paso;
    const ancho_ = ([a, b]) => (b - a + 1) * paso;
    const llantas = tramos.filter((t) => ancho_(t) >= 0.12 && ancho_(t) <= 1.3);
    const mayor = (lista) => lista.sort((p, q) => ancho_(q) - ancho_(p))[0];
    const del = mayor(llantas.filter((t) => centro(t) < -largo * 0.1));
    const tras = mayor(llantas.filter((t) => centro(t) > largo * 0.1));
    if (del && tras) {
      const ejeDel = centro(del);
      const ejeTras = centro(tras);
      if (ejeTras - ejeDel > 0.5 * largo && ejeTras - ejeDel < 0.75 * largo) {
        ajustes.ejeDel = ejeDel;
        ajustes.ejeTras = ejeTras;
        const entre = [];
        for (let b = 0; b < nz; b++) {
          const z = z0 + (b + 0.5) * paso;
          if (z > ejeDel + 0.5 && z < ejeTras - 0.5 && Number.isFinite(bajo[b])) entre.push(bajo[b]);
        }
        if (entre.length >= 5) {
          entre.sort((p, q) => p - q);
          const piso = entre[Math.floor(entre.length / 2)];
          if (piso >= 0.1 && piso <= 0.6) ajustes.piso = piso;
        }
      }
    }
  }
  // La cintura: el codo del ancho por altura, en la mitad del largo.
  const pasoY = 0.05;
  const ny = Math.ceil(alto / pasoY) + 1;
  const xs = Array.from({ length: ny }, () => []);
  for (let i = 0; i < n; i++) {
    if (Math.abs(posiciones[i * 3 + 2]) > largo * 0.2) continue;
    const b = Math.floor(posiciones[i * 3 + 1] / pasoY);
    if (b >= 0 && b < ny) xs[b].push(Math.abs(posiciones[i * 3]));
  }
  const alturas = [];
  const anchos = [];
  for (let b = 0; b < ny; b++) {
    const y = (b + 0.5) * pasoY;
    if (y < 0.35 * alto || y > 0.93 * alto || xs[b].length < 20) continue;
    xs[b].sort((p, q) => p - q);
    alturas.push(y);
    anchos.push(2 * xs[b][Math.floor(xs[b].length * 0.7)]);
  }
  const quiebre = codo(alturas, anchos);
  if (quiebre && quiebre.x >= 0.45 * alto && quiebre.x <= 0.85 * alto) {
    const promedio = (lista) => lista.reduce((a, b) => a + b, 0) / Math.max(lista.length, 1);
    const abajo = promedio(anchos.filter((_, i) => alturas[i] < quiebre.x));
    const arriba = promedio(anchos.filter((_, i) => alturas[i] >= quiebre.x));
    if (abajo - arriba >= 0.06) ajustes.cintura = quiebre.x;
  }
  // Con fotos, la pintura lo dice mejor que la forma: una malla tallada con
  // siluetas no ve el entrante entre el hombro de la puerta y el techo (en el
  // Kona, la forma decía 1,15 m y la línea de ventanas está a 1 m).
  const porColor = cinturaPorColor(posiciones, colores, medidas);
  if (porColor) ajustes.cintura = porColor;
  // El perfil de arriba, por tajadas a lo largo y por el centro del carro (sin
  // espejos ni costados): de adelante hacia atrás sube el capó, sube más el
  // parabrisas, y luego el techo casi plano hasta que cae la cola.
  const techoEn = new Float32Array(nz).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    if (Math.abs(posiciones[i * 3]) > ancho * 0.3) continue;
    const b = Math.floor((posiciones[i * 3 + 2] - z0) / paso);
    if (b >= 0 && b < nz && posiciones[i * 3 + 1] > techoEn[b]) techoEn[b] = posiciones[i * 3 + 1];
  }
  let cima = -Infinity;
  for (const y of techoEn) if (y > cima) cima = y;
  const nivelTecho = cima - 0.05;
  let bInicio = -1;
  let bFin = -1;
  for (let b = 0; b < nz; b++) {
    if (techoEn[b] >= nivelTecho) {
      if (bInicio < 0) bInicio = b;
      bFin = b;
    }
  }
  if (bInicio > 0) {
    const inicioTecho = z0 + (bInicio + 0.5) * paso;
    const finTecho = z0 + (bFin + 0.5) * paso;
    const ejeRef = ajustes.ejeDel ?? -largo / 2 + (largo - medidas.entreEjes) * 0.55;
    // La base del parabrisas: el codo entre el capó y el parabrisas.
    const zs = [];
    const ys = [];
    for (let b = 0; b < bInicio; b++) {
      const z = z0 + (b + 0.5) * paso;
      if (z >= ejeRef - 0.15 && Number.isFinite(techoEn[b])) {
        zs.push(z);
        ys.push(techoEn[b]);
      }
    }
    const base = codo(zs, ys);
    if (base && base.despues > base.antes + 0.25) {
      const capoTras = base.x;
      if (capoTras > ejeRef + 0.3 && capoTras < ejeRef + 1.35 && inicioTecho > capoTras + 0.3 && inicioTecho < capoTras + 1.3) {
        ajustes.capoTras = capoTras;
        ajustes.parabrisasAlto = inicioTecho;
      }
    }
    if (finTecho > inicioTecho + 0.5 && finTecho < largo / 2 - 0.15) ajustes.techoTras = finTecho;
  }
  return ajustes;
}

// La línea de ventanas por el color: en los costados, a la mitad del largo, la
// altura donde deja de haber pintura. La pintura es el color de la franja media
// (35-60 % del alto). Con pintura sin color (plateado, blanco, negro) no se sabe.
// El gris exacto es el relleno de mallaDeObjeto3D para lo que no trae color: no dice nada de la
// pintura. Leído como dato, la cintura de la Kona bajaba de 1,08 a 0,76 m en un OBJ de dos atlas al
// que le faltaba una imagen.
const sinColor = (colores, i) => colores[i * 3] === 128 && colores[i * 3 + 1] === 128 && colores[i * 3 + 2] === 128;

function cinturaPorColor(posiciones, colores, { largo, ancho, alto }) {
  if (!colores) return null;
  const n = posiciones.length / 3;
  const lado = ancho * 0.28;
  // Por costado: con uno a contraluz, si la referencia salía del otro, todo el costado
  // oscuro "no era pintura" y la cintura bajaba 20 cm. Cada costado se lee con su propia
  // referencia, y al final se promedian los que dieron una lectura creíble.
  const pasoY = 0.04;
  const ny = Math.ceil(alto / pasoY) + 1;
  const alturas = [];
  for (const signo of [1, -1]) {
    const rojos = [];
    const verdes = [];
    const azules = [];
    for (let i = 0; i < n; i++) {
      const y = posiciones[i * 3 + 1];
      if (y < 0.35 * alto || y > 0.6 * alto || Math.abs(posiciones[i * 3 + 2]) > largo * 0.2 || posiciones[i * 3] * signo < lado) continue;
      if (sinColor(colores, i)) continue;
      rojos.push(colores[i * 3]);
      verdes.push(colores[i * 3 + 1]);
      azules.push(colores[i * 3 + 2]);
    }
    if (rojos.length < 25) continue;
    const mediana = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
    const r = mediana(rojos);
    const g = mediana(verdes);
    const b = mediana(azules);
    const maximo = Math.max(r, g, b);
    if (maximo < 20 || (maximo - Math.min(r, g, b)) / maximo < 0.25) continue;
    const suma = r + g + b;
    const pintura = new Float32Array(ny);
    const total = new Float32Array(ny);
    for (let i = 0; i < n; i++) {
      if (Math.abs(posiciones[i * 3 + 2]) > largo * 0.22 || posiciones[i * 3] * signo < lado) continue;
      const k = Math.floor(posiciones[i * 3 + 1] / pasoY);
      if (k < 0 || k >= ny || sinColor(colores, i)) continue;
      const cr = colores[i * 3];
      const cg = colores[i * 3 + 1];
      const cb = colores[i * 3 + 2];
      const cs = cr + cg + cb + 1;
      // Misma cromaticidad (el reflejo aclara u oscurece, no cambia tanto el tono).
      const dist = Math.abs(cr / cs - r / suma) + Math.abs(cg / cs - g / suma) + Math.abs(cb / cs - b / suma);
      total[k]++;
      if (dist < 0.16 && Math.max(cr, cg, cb) > 0.4 * maximo) pintura[k]++;
    }
    // En una malla rala, una franja con muy pocos puntos no dice nada (ni que hay pintura ni
    // que no). Pero si las franjas de lata traen puntos de sobra, una casi vacía es el hueco
    // de una ventana que el escaneo no reconstruyó: ahí ya no hay pintura. Saltársela dejaba
    // que el marco del techo, también pintado, tapara el final de la lata, y la cintura no
    // salía (pintura hasta 1,00 m, hueco hasta 1,34 m y techo).
    const deLata = mediana(total.slice(Math.ceil((0.35 * alto) / pasoY), Math.floor((0.6 * alto) / pasoY) + 1));
    const hueco = deLata >= 40 ? 0.15 * deLata : 0;
    let anterior = null;
    for (let k = Math.ceil((0.5 * alto) / pasoY); k < ny - 1; k++) {
      const vacia = total[k] < hueco;
      if (!vacia && total[k] < 10) continue;
      const v = vacia ? 0 : pintura[k] / total[k];
      if (anterior !== null && anterior.v < 0.45 && v < 0.5) {
        // El tope va por costado: revisado sobre el promedio, un vidrio que refleja el tono
        // de la pintura (1,38 de 1,50 m de alto) se botaba si venía solo o por los dos lados,
        // y entraba si venía con una lectura buena: 20 cm de más.
        const altura = anterior.k * pasoY;
        if (altura <= 0.85 * alto) alturas.push(altura);
        break;
      }
      anterior = { k, v };
    }
  }
  if (!alturas.length) return null;
  // La menor de los dos costados: el error común es hacia arriba, un vidrio que refleja un cielo
  // del tono de la pintura. En el Kona dan 1,00 y 1,16 m, y la línea de verdad está en 1,02. Con
  // el promedio (1,08) las puertas subían al vidrio y la junta del medio ya no se leía: con 1,06
  // o más su contraste se cae de 21 a nada.
  return Math.min(...alturas);
}

// Dónde quiebra una curva: la recta partida en dos que mejor la sigue. Devuelve
// la x del quiebre y las pendientes de antes y de después.
function codo(xs, ys) {
  const n = xs.length;
  if (n < 6) return null;
  const recta = (a, b) => {
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    const m = b - a;
    for (let i = a; i < b; i++) {
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
    const den = m * sxx - sx * sx;
    const pendiente = den > 1e-12 ? (m * sxy - sx * sy) / den : 0;
    const corte = (sy - pendiente * sx) / m;
    let error = 0;
    for (let i = a; i < b; i++) error += (ys[i] - pendiente * xs[i] - corte) ** 2;
    return { pendiente, error };
  };
  let mejor = null;
  for (let k = 3; k <= n - 3; k++) {
    const a = recta(0, k);
    const b = recta(k, n);
    const error = a.error + b.error;
    if (!mejor || error < mejor.error) mejor = { error, x: (xs[k - 1] + xs[k]) / 2, antes: a.pendiente, despues: b.pendiente };
  }
  return mejor;
}

// Qué vértices son PINTURA, por el color (solo si el escaneo trae color).
// El color de la pintura sale de la franja media de los costados (entre el
// 35 y el 60 % del alto, en la mitad del largo): ahí siempre hay lata. No es
// pintura lo claramente OSCURO respecto de ella (plástico negro, llantas,
// vidrio polarizado, faros apagados). Lo claro y sin color NO se descarta:
// es el reflejo del cielo en la misma pintura (en el Kona, rayas blancas en
// las puertas). Con una pintura sin color (plateado, blanco, negro) el color
// no separa la lata del vidrio ni del plástico, y no se usa: devuelve null.
export function pinturaDelEscaneo(posiciones, colores, medidas) {
  if (!colores) return null;
  const { largo, ancho, alto } = medidas;
  const n = posiciones.length / 3;
  // Saturación y brillo (el tono no hace falta: se separa por oscuridad).
  const hsv = (i) => {
    const max = Math.max(colores[i * 3], colores[i * 3 + 1], colores[i * 3 + 2]) / 255;
    const min = Math.min(colores[i * 3], colores[i * 3 + 1], colores[i * 3 + 2]) / 255;
    return [max > 0 ? (max - min) / max : 0, max];
  };
  // Por costado: un lado puede estar a contraluz y dar tres veces menos brillo. Con
  // una sola referencia, todo ese lado era "plástico oscuro" y sus puertas salían a
  // huecos.
  const sat = [[], []];
  const val = [[], []];
  for (let i = 0; i < n; i++) {
    const y = posiciones[i * 3 + 1];
    if (y < 0.35 * alto || y > 0.6 * alto || Math.abs(posiciones[i * 3 + 2]) > largo * 0.2 || Math.abs(posiciones[i * 3]) < ancho / 2 - 0.25) continue;
    const [s, v] = hsv(i);
    const lado = posiciones[i * 3] > 0 ? 0 : 1;
    sat[lado].push(s);
    val[lado].push(v);
  }
  if (sat[0].length + sat[1].length < 50) return null;
  const mediana = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  if (mediana([...sat[0], ...sat[1]]) < 0.25) return null;
  // Un costado casi sin muestras usa las del otro.
  const satPintura = [0, 1].map((k) => mediana(sat[k].length >= 30 ? sat[k] : sat[1 - k]));
  const valPintura = [0, 1].map((k) => mediana(val[k].length >= 30 ? val[k] : val[1 - k]));
  const pintura = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [s, v] = hsv(i);
    // Cada costado con su referencia, donde se midió. En el centro (capó, techo, cola) la
    // más oscura de las dos: si no, un panel de un solo tono cambiaba de veredicto
    // justo en x = 0 y quedaba partido por la mitad con una línea recta.
    const x = posiciones[i * 3];
    const sat_ = Math.abs(x) >= ancho / 2 - 0.25 ? satPintura[x > 0 ? 0 : 1] : Math.min(satPintura[0], satPintura[1]);
    const val_ = Math.abs(x) >= ancho / 2 - 0.25 ? valPintura[x > 0 ? 0 : 1] : Math.min(valPintura[0], valPintura[1]);
    pintura[i] = v < 0.5 * val_ || (s < 0.4 * sat_ && v < 0.75 * val_) ? 0 : 1;
  }
  return pintura;
}

// Limpia las etiquetas por mayoría: cada vértice toma la pieza que más se
// repite entre él y sus vecinos (él cuenta doble, para no comerse las
// piezas angostas como el espejo). Tres vueltas quitan los dientes y las
// pecas del borde sin mover las piezas.
export function suavizarEtiquetas(indices, etiquetas, vueltas = 3) {
  const n = etiquetas.length;
  const grado = new Uint32Array(n + 1);
  for (let t = 0; t < indices.length; t++) grado[indices[t] + 1] += 2;
  for (let i = 0; i < n; i++) grado[i + 1] += grado[i];
  const vecinos = new Uint32Array(grado[n]);
  const lleno = grado.slice(0, n);
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      vecinos[lleno[a]++] = indices[t + ((k + 1) % 3)];
      vecinos[lleno[a]++] = indices[t + ((k + 2) % 3)];
    }
  }
  let actual = Uint8Array.from(etiquetas);
  const cuenta = new Uint16Array(256);
  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    const nueva = actual.slice();
    for (let v = 0; v < n; v++) {
      const propia = actual[v];
      cuenta[propia] += 2;
      let mejor = propia;
      for (let k = grado[v]; k < grado[v + 1]; k++) {
        const e = actual[vecinos[k]];
        cuenta[e]++;
        if (cuenta[e] > cuenta[mejor]) mejor = e;
      }
      nueva[v] = mejor;
      cuenta[propia] = 0;
      for (let k = grado[v]; k < grado[v + 1]; k++) cuenta[actual[vecinos[k]]] = 0;
    }
    actual = nueva;
  }
  return actual;
}

// Lo que queda de pecas: un pedacito de pieza suelto (el guardafango en cuatro
// trozos alrededor de la llanta), o un hueco dentro de una puerta donde un reflejo
// oscuro pareció plástico. Un pedazo conectado de menos de `minimo` vértices (a
// 2 cm, unos 15 × 15 cm) toma la etiqueta que más tiene alrededor. Lo que no es
// pieza (etiqueta 0) rodeado casi del todo por UNA sola pieza es un reflejo dentro
// de esa lata, aunque sea más grande (hasta `minimoHueco`, unos 50 × 50 cm); una
// ventana no: toca el resto del vidrio y varias piezas.
//
// Con `area` (el área de cada vértice), los dos umbrales son m², y el pedazo mayor de cada
// pieza se queda si mide al menos PEDAZO_QUE_SE_QUEDA: esto quita pedacitos, no piezas. Un
// espejo mide menos que el mínimo: el del Kona, unos 0,02 m², que con el área sola se iba en
// 9 de 43 mallas, y el del Moskvitch, 0,008, que sale de verdad sobre el espejo de la foto. La
// cifra sale de estos dos carros.
const PEDAZO_QUE_SE_QUEDA = 0.004;
export function quitarIslas(indices, etiquetas, minimo = 60, minimoHueco = 600, area = null) {
  const n = etiquetas.length;
  const grado = new Uint32Array(n + 1);
  for (let t = 0; t < indices.length; t++) grado[indices[t] + 1] += 2;
  for (let i = 0; i < n; i++) grado[i + 1] += grado[i];
  const vecinos = new Uint32Array(grado[n]);
  const lleno = grado.slice(0, n);
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      vecinos[lleno[a]++] = indices[t + ((k + 1) % 3)];
      vecinos[lleno[a]++] = indices[t + ((k + 2) % 3)];
    }
  }
  const pila = [];
  // De cada pieza, un vértice de su pedazo mayor. Con las etiquetas de entrada: abajo cambian.
  const delMayor = new Int32Array(256).fill(-1);
  if (area) {
    const mayor = new Float64Array(256).fill(PEDAZO_QUE_SE_QUEDA);
    const visto = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const propia = etiquetas[v];
      if (visto[v] || propia === 0 || grado[v] === grado[v + 1]) continue;
      let suma = 0;
      pila.push(v);
      visto[v] = 1;
      while (pila.length) {
        const u = pila.pop();
        suma += area[u];
        for (let k = grado[u]; k < grado[u + 1]; k++) {
          const w = vecinos[k];
          if (etiquetas[w] === propia && !visto[w]) {
            visto[w] = 1;
            pila.push(w);
          }
        }
      }
      if (suma >= mayor[propia]) {
        mayor[propia] = suma;
        delMayor[propia] = v;
      }
    }
  }
  const salida = Uint8Array.from(etiquetas);
  const visto = new Uint8Array(n);
  const pedazo = [];
  const cuenta = new Uint32Array(256);
  for (let v = 0; v < n; v++) {
    if (visto[v] || grado[v] === grado[v + 1]) continue;
    const propia = salida[v];
    pedazo.length = 0;
    pila.push(v);
    visto[v] = 1;
    cuenta.fill(0);
    let suma = 0;
    let esElMayor = false;
    while (pila.length) {
      const u = pila.pop();
      pedazo.push(u);
      if (area) suma += area[u];
      if (u === delMayor[propia]) esElMayor = true;
      for (let k = grado[u]; k < grado[u + 1]; k++) {
        const w = vecinos[k];
        if (salida[w] === propia) {
          if (!visto[w]) {
            visto[w] = 1;
            pila.push(w);
          }
        } else {
          cuenta[salida[w]]++;
        }
      }
    }
    let mejor = -1;
    let borde = 0;
    for (let e = 0; e < 256; e++) {
      borde += cuenta[e];
      if (cuenta[e] > 0 && (mejor < 0 || cuenta[e] > cuenta[mejor])) mejor = e;
    }
    if (mejor < 0) continue;
    const medida = area ? suma : pedazo.length;
    const hueco = propia === 0 && medida < minimoHueco && cuenta[mejor] > 0.85 * borde;
    if ((medida < minimo && !esElMayor) || hueco) for (const u of pedazo) salida[u] = mejor;
  }
  return salida;
}

// Volver a poner las piezas de un escaneo con otra carrocería (la persona
// la corrigió en la ficha): la malla ya está en el marco del carro, así que
// solo cambian las etiquetas. Devuelve un escaneo nuevo; el de entrada no
// se toca.
export function reetiquetarEscaneo(escaneo, carroceria) {
  const ejes = escaneo.medidasDibujo && escaneo.medidasDibujo.entreEjes;
  const previos = juntasParaCarroceria(escaneo.ajustes, escaneo.carroceria, carroceria);
  return { ...escaneo, ...piezasDelEscaneo(escaneo.posiciones, carroceria, escaneo.medidas, ejes, { indices: escaneo.indices, colores: escaneo.colores, previos }) };
}

// Las juntas ya leídas son del carro, salvo por un detalle: en una pick-up `puertaTras` es la
// raya menos 12 cm (puertasDeLaFoto). Copiarla tal cual dejaba la puerta 12 cm detrás de la
// luz al corregir una SUV a pick-up, y 12 cm antes de la raya al corregir al revés. Se mira
// la carrocería con que se leyó, para que sirva también con lo ya guardado.
function juntasParaCarroceria(ajustes, de, a) {
  const corrimiento = (normalizarCarroceria(de) === 'camioneta' ? LUZ_CABINA : 0) - (normalizarCarroceria(a) === 'camioneta' ? LUZ_CABINA : 0);
  if (!ajustes || !corrimiento) return ajustes;
  const correr = (junta) => (junta == null ? junta : junta + corrimiento);
  const copia = { ...ajustes, puertaTras: correr(ajustes.puertaTras) };
  if (ajustes.juntasLado) {
    const { der, izq } = ajustes.juntasLado;
    copia.juntasLado = { der: { ...der, puertaTras: correr(der.puertaTras) }, izq: { ...izq, puertaTras: correr(izq.puertaTras) } };
  }
  return copia;
}

// ---------- El modelo para el visor ----------

// Una tabla: Math.pow por cada componente de cada vértice se notaba al abrir un carro.
const SRGB_A_LINEAL = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

// Del escaneo procesado al mismo contrato que construirCarro: { grupo,
// seleccionables, porId, articulaciones, disposicion }. La malla se parte
// en una malla por pieza (los triángulos cuya mayoría de vértices es de
// esa pieza), cada una con su material, así el visor la tiñe y el toque
// la encuentra igual que en el carro genérico. Lo que no es pieza queda
// como una malla que para el dedo (como el vidrio). Las piezas de adentro
// (que el escaneo no ve) se toman del genérico a las mismas medidas, fuera
// de la escena: así marcarlas desde la lista sigue funcionando.
// Las aristas donde cambia la pieza, como segmentos (THREE.LineSegments con
// userData.juntas). Una arista la comparten dos triángulos; si son de piezas
// distintas y al menos uno es pieza, es junta. Sobre triángulos de 2 cm la
// línea sale en escalera: cada tramo se alisa con sus vecinos (los cruces de
// tres piezas se quedan quietos), y se botan las islas de pocos tramos, que
// son pecas y no juntas. Va 3 mm por encima de la lata, para que no parpadee.
export function juntasDelEscaneo(posiciones, indices, deTriangulo, nombres, normales = null, { soldado = null, etiquetas = null } = {}) {
  const { grupo, cuantos } = soldado || soldarVertices(posiciones);
  const unVertice = new Int32Array(cuantos).fill(-1);
  for (let v = 0; v < grupo.length; v++) if (unVertice[grupo[v]] < 0) unVertice[grupo[v]] = v;
  const primera = new Map();
  const tramos = [];
  // Hacia dónde queda afuera: el escaneo del celular (surface nets) y algunos archivos
  // traen las caras al revés, y entonces las normales apuntan hacia adentro. Sumar los
  // 3 mm a lo largo de la normal metía la línea debajo de la lata: en esos escaneos,
  // justo los que no tienen foto y donde la línea es lo único que separa una pieza de
  // otra, casi no se veían. El signo del volumen lo dice, y se calcula al dibujar: sirve
  // también para los escaneos ya guardados.
  let volumen = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    volumen +=
      posiciones[a] * (posiciones[b + 1] * posiciones[c + 2] - posiciones[b + 2] * posiciones[c + 1]) +
      posiciones[a + 1] * (posiciones[b + 2] * posiciones[c] - posiciones[b] * posiciones[c + 2]) +
      posiciones[a + 2] * (posiciones[b] * posiciones[c + 1] - posiciones[b + 1] * posiciones[c]);
  }
  const afuera = volumen < 0 ? -1 : 1;
  // Una arista entre dos piezas solo puede estar entre dos triángulos con etiquetas
  // mezcladas: los demás (el 97 %) no entran al Map, que era el costo mayor. Eso supone que
  // dos vértices soldados llevan la misma etiqueta, y solo es cierto desde el 3-nov: en lo
  // guardado antes, a cada lado de una costura puede haber un triángulo parejo de otra pieza,
  // y en el Kona se perdían 22 % de las líneas, justo donde no hay foto que las reemplace.
  let soloMezclados = Boolean(etiquetas);
  if (etiquetas) {
    const deGrupo = new Int16Array(cuantos).fill(-1);
    for (let v = 0; v < grupo.length && soloMezclados; v++) {
      if (deGrupo[grupo[v]] < 0) deGrupo[grupo[v]] = etiquetas[v];
      else if (deGrupo[grupo[v]] !== etiquetas[v]) soloMezclados = false;
    }
  }
  for (let t = 0; t < indices.length / 3; t++) {
    if (soloMezclados) {
      const ea = etiquetas[indices[t * 3]];
      if (ea === etiquetas[indices[t * 3 + 1]] && ea === etiquetas[indices[t * 3 + 2]]) continue;
    }
    for (let k = 0; k < 3; k++) {
      const a = grupo[indices[t * 3 + k]];
      const b = grupo[indices[t * 3 + ((k + 1) % 3)]];
      if (a === b) continue;
      const clave = a < b ? a * cuantos + b : b * cuantos + a;
      const otra = primera.get(clave);
      if (otra === undefined) {
        primera.set(clave, t);
        continue;
      }
      const ea = deTriangulo[t];
      const eb = deTriangulo[otra];
      if (ea !== eb && (nombres[ea] !== 'nada' || nombres[eb] !== 'nada')) tramos.push(a, b);
    }
  }
  // Los vecinos de cada punto de junta.
  const vecinos = new Map();
  const unir = (a, b) => {
    let lista = vecinos.get(a);
    if (!lista) vecinos.set(a, (lista = []));
    lista.push(b);
  };
  for (let i = 0; i < tramos.length; i += 2) {
    unir(tramos[i], tramos[i + 1]);
    unir(tramos[i + 1], tramos[i]);
  }
  // Las islas: pedazos conectados de pocos puntos.
  const isla = new Map();
  const tamano = [];
  for (const inicio of vecinos.keys()) {
    if (isla.has(inicio)) continue;
    const id = tamano.length;
    let cuenta = 0;
    const pila = [inicio];
    isla.set(inicio, id);
    while (pila.length) {
      const g = pila.pop();
      cuenta++;
      for (const w of vecinos.get(g)) {
        if (!isla.has(w)) {
          isla.set(w, id);
          pila.push(w);
        }
      }
    }
    tamano.push(cuenta);
  }
  // Alisar: solo los puntos con exactamente dos vecinos.
  const pos = new Map();
  for (const g of vecinos.keys()) {
    const v = unVertice[g];
    pos.set(g, [posiciones[v * 3], posiciones[v * 3 + 1], posiciones[v * 3 + 2]]);
  }
  for (let vuelta = 0; vuelta < 14; vuelta++) {
    const nuevas = new Map();
    for (const [g, lista] of vecinos) {
      if (lista.length !== 2) continue;
      const p = pos.get(g);
      const a = pos.get(lista[0]);
      const b = pos.get(lista[1]);
      nuevas.set(g, [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1]), 0.5 * p[2] + 0.25 * (a[2] + b[2])]);
    }
    for (const [g, p] of nuevas) pos.set(g, p);
  }
  // El alisado recorta las curvas en proporción al largo de arista: en una malla liviana,
  // 3 mm no alcanzan para quedar por encima de la lata.
  let largoTotal = 0;
  for (let i = 0; i < tramos.length; i += 2) {
    const a = unVertice[tramos[i]] * 3;
    const b = unVertice[tramos[i + 1]] * 3;
    largoTotal += Math.hypot(posiciones[a] - posiciones[b], posiciones[a + 1] - posiciones[b + 1], posiciones[a + 2] - posiciones[b + 2]);
  }
  const despegue = afuera * Math.max(0.003, (0.15 * largoTotal) / Math.max(tramos.length / 2, 1));
  const segmentos = [];
  for (let i = 0; i < tramos.length; i += 2) {
    if (tamano[isla.get(tramos[i])] < 8) continue;
    for (const g of [tramos[i], tramos[i + 1]]) {
      const p = pos.get(g);
      const v = unVertice[g];
      const n = normales ? [normales[v * 3], normales[v * 3 + 1], normales[v * 3 + 2]] : [0, 0, 0];
      segmentos.push(p[0] + n[0] * despegue, p[1] + n[1] * despegue, p[2] + n[2] * despegue);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentos), 3));
  const lineas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: 0.85 }));
  lineas.name = 'juntas';
  lineas.userData.juntas = true;
  // Son dibujo: el toque del dedo las atraviesa (un rayo de Three.js "toca"
  // una línea a un metro de distancia por defecto, y tapaba las piezas).
  lineas.raycast = () => {};
  return lineas;
}

// La imagen se abre aparte (decodificar 4096 px toma un momento): mientras
// tanto se ve el color por vértice, y al llegar la foto entra en cada pieza.
// `modelo.texturaLista` avisa cuando ya está. En Node (las pruebas) no hay
// createImageBitmap y se queda con el color por vértice.
//
// La foto va sin luces: ya trae las suyas. Con las luces del visor encima, y el
// tono de cine, salía un carro pálido y sin contraste, justo lo contrario de lo que
// se ve en la foto. Lo único que se le suma es un brillo muy suave que sí depende de
// desde dónde se mira (el canto que se aclara, una lámpara arriba): los reflejos de la
// foto están pegados, y al girar eso es lo que delata una foto sobre una forma.
function materialDeFoto(textura) {
  const material = new THREE.ShaderMaterial({
    uniforms: { mapa: { value: textura } },
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `varying vec2 vU; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vU = uv;
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vN = mat3(modelMatrix) * normal;
        vV = cameraPosition - mundo.xyz;
        vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }`,
    fragmentShader: `precision highp float;
      uniform sampler2D mapa; varying vec2 vU; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vec3 c = texture2D(mapa, vU).rgb;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(vV);
        float canto = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
        float lampara = smoothstep(0.45, 0.95, reflect(-v, n).y);
        // Abajo no: llantas y bajos no brillan.
        float alto = smoothstep(0.32, 0.62, vY);
        c += vec3(0.88, 0.94, 1.0) * alto * (0.13 * canto + 0.05 * lampara);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // Quien cierra el visor suelta material.map: así suelta también la foto.
  material.map = textura;
  return material;
}

function ponerTextura(modelo, blob, escaneo) {
  modelo.texturaLista = Promise.resolve(null);
  if (typeof createImageBitmap !== 'function') {
    // Sin con qué abrir la foto se queda el color por vértice, y ahí teñir sale gris.
    if (escaneo.colores) engancharVelos(modelo, escaneo);
    return;
  }
  const textura = new THREE.Texture();
  textura.flipY = false; // las coordenadas ya vienen con v = 0 arriba en la imagen
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  // Un archivo puede traer coordenadas fuera de 0..1 con la foto repetida, y cualquier
  // visor de glTF lo muestra bien; recortadas, el carro sale de un solo color.
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  modelo.textura = textura;
  modelo.texturaLista = createImageBitmap(blob).then(
    (imagen) => {
      // El visor ya cambió de carro mientras se abría la foto: no se usa, se suelta.
      if (modelo.soltado) {
        imagen.close();
        return null;
      }
      textura.image = imagen;
      textura.needsUpdate = true;
      modelo.grupo.traverse((malla) => {
        if (!malla.isMesh || !malla.geometry.attributes.uv || !malla.material.isMeshStandardMaterial) return;
        malla.material.dispose();
        malla.material = materialDeFoto(textura);
      });
      // Con la foto, la junta real ya se ve: una línea dibujada encima, que además no
      // cae exacto sobre ella, se lee como un rayón. Se quedan en el escaneo sin foto,
      // donde es lo único que separa una pieza de otra.
      const juntas = modelo.grupo.getObjectByName('juntas');
      if (juntas) juntas.visible = false;
      engancharVelos(modelo, escaneo, textura);
      return textura;
    },
    // Si la foto no abre (al celular no le alcanza la memoria), queda el color por vértice.
    () => {
      if (escaneo.colores && !modelo.soltado) {
        // Lo ya marcado se tiñó mientras se esperaba la foto, y con el velo enganchado resaltar
        // ya no toca el material: la puerta seguía en (255, 203, 188) después de desmarcarla, y
        // no se quitaba sin recargar. Cada pieza pasa del tinte a su velo, con el acento que el
        // tinte dejó en `emissive`.
        const acentos = modelo.seleccionables.map((malla) => malla.material.emissive.getHex());
        for (const malla of modelo.seleccionables) resaltar(malla, null);
        engancharVelos(modelo, escaneo);
        modelo.seleccionables.forEach((malla, i) => {
          if (acentos[i]) resaltar(malla, acentos[i]);
        });
      }
      return null;
    },
  );
}

// Una pieza marcada lleva velo en vez de teñirse (resaltar, en carro.js). Hace falta con foto
// y con color por vértice: teñir multiplica el acento por el color de la lata, y el naranja
// sobre un carro azul salía gris, (141, 146, 161), sin reconocerse como el estado.
function engancharVelos(modelo, escaneo, foto = null) {
  const velos = new Map();
  for (const malla of modelo.seleccionables) {
    const id = malla.userData.piezaId;
    malla.userData.pintarVelo = (acento) => {
      let velo = velos.get(id);
      if (acento == null) {
        if (velo) velo.visible = false;
        return;
      }
      if (!velo) {
        velo = crearVelo(escaneo, id, acento, { foto });
        if (!velo) return;
        velos.set(id, velo);
        modelo.grupo.add(velo);
      }
      velo.material.uniforms.uColor.value.set(acento);
      velo.visible = true;
    };
  }
}

// Las normales de toda la malla, soldando por posición: una malla con textura
// repite los vértices donde cambia de foto, y cada pieza se dibuja aparte. Si
// cada pedazo sacara sus propias normales, en cada costura y en cada junta se
// vería un quiebre de luz que la lata no tiene.
export function normalesSoldadas(posiciones, indices, soldado = null) {
  const n = posiciones.length / 3;
  const { grupo, cuantos: grupos } = soldado || soldarVertices(posiciones);
  const suma = new Float32Array(grupos * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const ux = posiciones[b * 3] - posiciones[a * 3];
    const uy = posiciones[b * 3 + 1] - posiciones[a * 3 + 1];
    const uz = posiciones[b * 3 + 2] - posiciones[a * 3 + 2];
    const wx = posiciones[c * 3] - posiciones[a * 3];
    const wy = posiciones[c * 3 + 1] - posiciones[a * 3 + 1];
    const wz = posiciones[c * 3 + 2] - posiciones[a * 3 + 2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const v of [a, b, c]) {
      const g = grupo[v] * 3;
      suma[g] += nx;
      suma[g + 1] += ny;
      suma[g + 2] += nz;
    }
  }
  const salida = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const g = grupo[v] * 3;
    const largo = Math.hypot(suma[g], suma[g + 1], suma[g + 2]) || 1;
    salida[v * 3] = suma[g] / largo;
    salida[v * 3 + 1] = suma[g + 1] / largo;
    salida[v * 3 + 2] = suma[g + 2] / largo;
  }
  return salida;
}

export function modeloDesdeEscaneo(escaneo, { colorBase = 0xcfd4da } = {}) {
  const { posiciones, indices, colores, etiquetas, nombres, textura = null } = escaneo;
  const uvs = textura ? escaneo.uvs || null : null;
  const soldado = soldarVertices(posiciones);
  const normales = normalesSoldadas(posiciones, indices, soldado);
  const grupo = new THREE.Group();
  grupo.name = 'carro-escaneado';
  const porTriangulo = new Map();
  const deTriangulo = new Uint8Array(indices.length / 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = etiquetas[indices[t]];
    const b = etiquetas[indices[t + 1]];
    const c = etiquetas[indices[t + 2]];
    const etiqueta = a === b || a === c ? a : b === c ? b : a;
    deTriangulo[t / 3] = etiqueta;
    let lista = porTriangulo.get(etiqueta);
    if (!lista) porTriangulo.set(etiqueta, (lista = []));
    lista.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  const base = new THREE.Color(colorBase);
  const seleccionables = [];
  const porId = new Map();
  for (const [etiqueta, lista] of porTriangulo) {
    const sub = recortarMalla({ posiciones, indices: Uint32Array.from(lista), colores, uvs, normales }, null);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sub.posiciones, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(sub.normales, 3));
    if (sub.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(sub.uvs, 2));
    // Los colores se guardan en sRGB (0-255, como en el archivo) y Three.js
    // espera el color por vértice en lineal: sin pasarlos, el vino tinto
    // salía rosado.
    if (sub.colores) geo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(sub.colores, (v) => SRGB_A_LINEAL[v]), 3));
    geo.setIndex(new THREE.BufferAttribute(sub.indices, 1));
    const nombre = nombres[etiqueta];
    const esPieza = nombre !== 'nada';
    const material = new THREE.MeshStandardMaterial({
      color: sub.colores ? 0xffffff : esPieza ? base : 0x2a2f36,
      vertexColors: Boolean(sub.colores),
      roughness: esPieza ? 0.45 : 0.7,
      metalness: esPieza ? 0.15 : 0,
      side: THREE.DoubleSide, // los escaneos traen huecos: que no se vea el revés transparente
    });
    const malla = new THREE.Mesh(geo, material);
    malla.name = esPieza ? nombre : 'escaneo-sin-pieza';
    if (esPieza) {
      malla.userData.piezaId = nombre;
      malla.userData.colorBase = material.color.clone();
      seleccionables.push(malla);
      porId.set(nombre, malla);
    }
    grupo.add(malla);
  }
  // Las JUNTAS: el borde entre dos piezas (o entre una pieza y lo que no es
  // pieza), como una línea oscura, igual que la luz entre dos latas de un
  // carro de verdad. Sin ellas, en un escaneo gris no se ve dónde termina
  // la puerta y empieza el guardafango (pedido de Joan, 27-oct-2026).
  grupo.add(juntasDelEscaneo(posiciones, indices, deTriangulo, nombres, normales, { soldado, etiquetas }));
  // Las de adentro, del genérico, sin agregarlas a la escena.
  const ajustes = escaneo.ajustes || {};
  const generico = construirCarro({ colorBase, carroceria: escaneo.carroceria, medidas: escaneo.medidasDibujo, ajustes });
  for (const malla of generico.seleccionables) {
    if (!porId.has(malla.userData.piezaId)) porId.set(malla.userData.piezaId, malla);
  }
  grupo.updateMatrixWorld(true);
  const modelo = { grupo, seleccionables, porId, articulaciones: new Map(), disposicion: disposicion(escaneo.carroceria, escaneo.medidasDibujo, ajustes), escaneado: true };
  if (uvs) ponerTextura(modelo, textura, escaneo);
  else if (colores) engancharVelos(modelo, escaneo);
  return modelo;
}
