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
import { construirCarro, disposicion } from './carro.js';
import { esInterior } from './piezas.js';
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
        const qx = px + dx * t;
        const qy = py + dy * t;
        const qz = pz + dz * t;
        // Delante de la superficie (hacia la cámara, t < 0) es positivo.
        actualizarVoxel(Math.round(qx / voxel), Math.round(qy / voxel), Math.round(qz / voxel), Math.max(-1, Math.min(1, -t / trunc)));
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
export function etiquetarPiezas(posiciones, muestras, { celda = 0.12, radio = 0.35 } = {}) {
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
              const d = dx * dx + dy * dy + dz * dz;
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
export function recortarMalla({ posiciones, indices, colores = null }, conservar) {
  const nuevoIndice = new Int32Array(posiciones.length / 3).fill(-1);
  const pos = [];
  const col = colores ? [] : null;
  const ind = [];
  const tomar = (v) => {
    if (nuevoIndice[v] < 0) {
      nuevoIndice[v] = pos.length / 3;
      pos.push(posiciones[v * 3], posiciones[v * 3 + 1], posiciones[v * 3 + 2]);
      if (col) col.push(colores[v * 3], colores[v * 3 + 1], colores[v * 3 + 2]);
    }
    return nuevoIndice[v];
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    if (!(conservar[a] || conservar[b] || conservar[c])) continue;
    ind.push(tomar(a), tomar(b), tomar(c));
  }
  return { posiciones: new Float32Array(pos), indices: new Uint32Array(ind), colores: col ? new Uint8Array(col) : null };
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
// unos centímetros más gorda). De paso suelda los vértices repetidos de un
// OBJ sin índice. Si con esa celda quedan más de `maximo` triángulos, se
// agranda la celda y se repite.
export function simplificarMalla({ posiciones, indices, colores = null }, { maximo = 500000, celda = 0.012 } = {}) {
  let actual = { posiciones, indices, colores };
  let tamano = celda;
  while (actual.indices.length / 3 > maximo && tamano < 0.2) {
    actual = agruparVertices({ posiciones, indices, colores }, tamano);
    tamano *= 1.4;
  }
  return actual;
}

function agruparVertices({ posiciones, indices, colores }, tamano) {
  const n = posiciones.length / 3;
  const grupoDe = new Int32Array(n);
  const indice = new Map();
  const suma = [];
  const sumaColor = colores ? [] : null;
  const cuenta = [];
  for (let v = 0; v < n; v++) {
    const clave = claveBloque(Math.floor(posiciones[v * 3] / tamano), Math.floor(posiciones[v * 3 + 1] / tamano), Math.floor(posiciones[v * 3 + 2] / tamano));
    let g = indice.get(clave);
    if (g === undefined) {
      g = cuenta.length;
      indice.set(clave, g);
      cuenta.push(0);
      suma.push(0, 0, 0);
      if (sumaColor) sumaColor.push(0, 0, 0);
    }
    grupoDe[v] = g;
    cuenta[g]++;
    for (let k = 0; k < 3; k++) {
      suma[g * 3 + k] += posiciones[v * 3 + k];
      if (sumaColor) sumaColor[g * 3 + k] += colores[v * 3 + k];
    }
  }
  const pos = new Float32Array(cuenta.length * 3);
  const col = sumaColor ? new Uint8Array(cuenta.length * 3) : null;
  for (let g = 0; g < cuenta.length; g++) {
    for (let k = 0; k < 3; k++) {
      pos[g * 3 + k] = suma[g * 3 + k] / cuenta[g];
      if (col) col[g * 3 + k] = Math.round(sumaColor[g * 3 + k] / cuenta[g]);
    }
  }
  const ind = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = grupoDe[indices[t]];
    const b = grupoDe[indices[t + 1]];
    const c = grupoDe[indices[t + 2]];
    if (a !== b && b !== c && a !== c) ind.push(a, b, c);
  }
  return { posiciones: pos, indices: new Uint32Array(ind), colores: col };
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
export function procesarEscaneo(malla, { carroceria = 'sedan', medidasCatalogo = null, voltear = false, entreEjes = null, puntos = null, suavizar = false } = {}) {
  // Se mide sobre puntos repartidos por la superficie (muestrearMalla), no
  // sobre los vértices; o sobre la nube original si la hay.
  const fuente = puntos || muestrearMalla(malla);
  const piso = estimarPiso(fuente);
  const mascara = aislarCarro(fuente, { piso });
  const orientacion = orientarCarro(fuente, mascara, { piso, carroceria, voltear });
  // La malla: lo que quede dentro de la caja del carro (en su marco), con
  // 10 cm de margen, y por encima de la banda del piso.
  const enCarroTodo = transformar(malla.posiciones, orientacion.matriz);
  const m = orientacion.medidas;
  const dentro = new Uint8Array(enCarroTodo.length / 3);
  for (let v = 0; v < dentro.length; v++) {
    const x = enCarroTodo[v * 3];
    const y = enCarroTodo[v * 3 + 1];
    const z = enCarroTodo[v * 3 + 2];
    const enCaja = Math.abs(x) < m.ancho / 2 + 0.25 && Math.abs(z) < m.largo / 2 + 0.1 && y > 0.08 && y < m.alto + 0.1;
    dentro[v] = enCaja ? 1 : 0;
  }
  const recortada = recortarMalla({ posiciones: enCarroTodo, indices: malla.indices, colores: malla.colores || null }, dentro);
  if (recortada.indices.length < 300) throw new Error('No encontré un carro en el escaneo (quedaron muy pocos triángulos)');
  const enCarro = suavizar ? suavizarMalla(recortada.posiciones, recortada.indices) : recortada.posiciones;
  const medidas = orientacion.medidas;
  const ejes = entreEjes || (medidasCatalogo && medidasCatalogo.entreEjes) || null;
  const piezas = piezasDelEscaneo(enCarro, carroceria, medidas, ejes);
  return {
    posiciones: enCarro,
    indices: recortada.indices,
    colores: recortada.colores,
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
export function piezasDelEscaneo(enCarro, carroceria, medidas, entreEjes = null) {
  const tipo = normalizarCarroceria(carroceria);
  const pedidas = { largo: medidas.largo, ancho: medidas.ancho, alto: medidas.alto };
  if (entreEjes) pedidas.entreEjes = entreEjes > 100 ? entreEjes / 1000 : entreEjes;
  const medidasDibujo = medidasParaDibujar(tipo, pedidas);
  const fueraDeRango = ['largo', 'ancho', 'alto'].some((c) => Math.abs(medidasDibujo[c] - medidas[c]) > 0.02);
  const generico = construirCarro({ carroceria: tipo, medidas: medidasDibujo });
  const muestras = muestrasDelGenerico(generico);
  return { etiquetas: etiquetarPiezas(enCarro, muestras), nombres: muestras.nombres, medidasDibujo, fueraDeRango, carroceria: tipo };
}

// Volver a poner las piezas de un escaneo con otra carrocería (la persona
// la corrigió en la ficha): la malla ya está en el marco del carro, así que
// solo cambian las etiquetas. Devuelve un escaneo nuevo; el de entrada no
// se toca.
export function reetiquetarEscaneo(escaneo, carroceria) {
  const ejes = escaneo.medidasDibujo && escaneo.medidasDibujo.entreEjes;
  return { ...escaneo, ...piezasDelEscaneo(escaneo.posiciones, carroceria, escaneo.medidas, ejes) };
}

// ---------- El modelo para el visor ----------

function srgbALineal(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Del escaneo procesado al mismo contrato que construirCarro: { grupo,
// seleccionables, porId, articulaciones, disposicion }. La malla se parte
// en una malla por pieza (los triángulos cuya mayoría de vértices es de
// esa pieza), cada una con su material, así el visor la tiñe y el toque
// la encuentra igual que en el carro genérico. Lo que no es pieza queda
// como una malla que para el dedo (como el vidrio). Las piezas de adentro
// (que el escaneo no ve) se toman del genérico a las mismas medidas, fuera
// de la escena: así marcarlas desde la lista sigue funcionando.
export function modeloDesdeEscaneo(escaneo, { colorBase = 0xcfd4da } = {}) {
  const { posiciones, indices, colores, etiquetas, nombres } = escaneo;
  const grupo = new THREE.Group();
  grupo.name = 'carro-escaneado';
  const porTriangulo = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = etiquetas[indices[t]];
    const b = etiquetas[indices[t + 1]];
    const c = etiquetas[indices[t + 2]];
    const etiqueta = a === b || a === c ? a : b === c ? b : a;
    let lista = porTriangulo.get(etiqueta);
    if (!lista) porTriangulo.set(etiqueta, (lista = []));
    lista.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  const base = new THREE.Color(colorBase);
  const seleccionables = [];
  const porId = new Map();
  for (const [etiqueta, lista] of porTriangulo) {
    const sub = recortarMalla({ posiciones, indices: Uint32Array.from(lista), colores }, new Uint8Array(posiciones.length / 3).fill(1));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sub.posiciones, 3));
    // Los colores se guardan en sRGB (0-255, como en el archivo) y Three.js
    // espera el color por vértice en lineal: sin pasarlos, el vino tinto
    // salía rosado.
    if (sub.colores) geo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(sub.colores, (v) => srgbALineal(v / 255)), 3));
    geo.setIndex(new THREE.BufferAttribute(sub.indices, 1));
    geo.computeVertexNormals();
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
  // Las de adentro, del genérico, sin agregarlas a la escena.
  const generico = construirCarro({ colorBase, carroceria: escaneo.carroceria, medidas: escaneo.medidasDibujo });
  for (const malla of generico.seleccionables) {
    if (!porId.has(malla.userData.piezaId)) porId.set(malla.userData.piezaId, malla);
  }
  grupo.updateMatrixWorld(true);
  return { grupo, seleccionables, porId, articulaciones: new Map(), disposicion: disposicion(escaneo.carroceria, escaneo.medidasDibujo), escaneado: true };
}
