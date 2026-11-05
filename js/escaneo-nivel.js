// Nivelar la escena antes de medir. Todo lo que busca el piso (estimarPiso, aislarCarro y el
// corte de procesarEscaneo) supone un piso a "y" constante, y un carro parqueado en una calle o
// un patio con pendiente no lo tiene: a 2° (3,5 %) el piso se reparte en muchas franjas de 2 cm,
// ninguna llega a contar como piso, y la parte alta se une al carro y se mide como carro. Un Kona
// de 4,20 m salía de 5,20 sin ningún aviso, con las puertas corridas (revisión del 4-nov-2026).
//
// Solo el piso dice cuánto está inclinado: se busca un plano casi horizontal en el tercio de abajo
// que tenga muchos puntos. Es un RANSAC con semilla: la misma malla da siempre lo mismo.
import * as THREE from 'three';

// Por debajo de este ángulo no se gira. Un piso de verdad plano da 0,01° y la panza de un carro
// sin piso, entre 0,16° y 0,22°: girar por eso movería medidas que ya están bien. Con la zona
// muerta, además, nivelar lo ya nivelado no hace nada, y es lo que deja llamarlo dos veces.
const INCLINACION_MINIMA = 0.3;

// El plano del piso, o null si no hay uno. `minimo` es la misma fracción con la que estimarPiso
// dice que hay piso, contada sobre todos los puntos: un carro recortado no llega y no se toca.
// `angulo`: más allá de 10° (18 % de pendiente) no es un piso sino otra cosa.
export function planoDelPiso(fuente, { tolerancia = 0.02, iteraciones = 300, angulo = 10, minimo = 0.06, semilla = 99 } = {}) {
  const n = fuente.length / 3;
  if (n < 100) return null;
  let s = semilla >>> 0;
  const azar = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) ys[i] = fuente[i * 3 + 1];
  const orden = Float32Array.from(ys).sort();
  const bajo = orden[Math.floor(n * 0.005)];
  const alto = orden[Math.floor(n * 0.995)];
  // Solo el tercio de abajo: el techo de un carro también es un plano lleno.
  const tope = bajo + (alto - bajo) / 3;
  const abajo = [];
  for (let i = 0; i < n; i++) if (ys[i] <= tope) abajo.push(i);
  if (abajo.length < 100) return null;
  const paso = Math.max(1, Math.floor(abajo.length / 20000));
  const coseno = Math.cos((angulo * Math.PI) / 180);
  let mejor = null;
  for (let intento = 0; intento < iteraciones; intento++) {
    const a = abajo[Math.floor(azar() * abajo.length)] * 3;
    const b = abajo[Math.floor(azar() * abajo.length)] * 3;
    const c = abajo[Math.floor(azar() * abajo.length)] * 3;
    const ux = fuente[b] - fuente[a];
    const uy = fuente[b + 1] - fuente[a + 1];
    const uz = fuente[b + 2] - fuente[a + 2];
    const wx = fuente[c] - fuente[a];
    const wy = fuente[c + 1] - fuente[a + 1];
    const wz = fuente[c + 2] - fuente[a + 2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const largo = Math.hypot(nx, ny, nz);
    if (largo < 1e-6) continue;
    nx /= largo;
    ny /= largo;
    nz /= largo;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    if (ny < coseno) continue;
    const d = nx * fuente[a] + ny * fuente[a + 1] + nz * fuente[a + 2];
    let cuenta = 0;
    for (let q = 0; q < abajo.length; q += paso) {
      const i = abajo[q] * 3;
      if (Math.abs(nx * fuente[i] + ny * fuente[i + 1] + nz * fuente[i + 2] - d) < tolerancia) cuenta++;
    }
    if (!mejor || cuenta > mejor.cuenta) mejor = { cuenta, nx, ny, nz, d };
  }
  if (!mejor || (mejor.cuenta * paso) / n < minimo) return null;
  // Tres puntos dan un plano con su ruido: se afina con todos los que cayeron en él
  // (mínimos cuadrados, y = ax + bz + c).
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  let sx = 0;
  let sz = 0;
  let sy = 0;
  let sxy = 0;
  let szy = 0;
  let m = 0;
  for (let q = 0; q < abajo.length; q += paso) {
    const i = abajo[q] * 3;
    const x = fuente[i];
    const y = fuente[i + 1];
    const z = fuente[i + 2];
    if (Math.abs(mejor.nx * x + mejor.ny * y + mejor.nz * z - mejor.d) >= tolerancia) continue;
    sxx += x * x;
    sxz += x * z;
    szz += z * z;
    sx += x;
    sz += z;
    sy += y;
    sxy += x * y;
    szy += z * y;
    m++;
  }
  const inversa = new THREE.Matrix3().set(sxx, sxz, sx, sxz, szz, sz, sx, sz, m).invert();
  const v = new THREE.Vector3(sxy, szy, sy).applyMatrix3(inversa);
  const normal = new THREE.Vector3(-v.x, 1, -v.y).normalize();
  return { normal, inclinacion: (Math.acos(Math.min(1, normal.y)) * 180) / Math.PI };
}

// El giro que deja el piso a "y" constante, o null si no hay nada que girar.
export function giroDeNivel(fuente, opciones) {
  const plano = planoDelPiso(fuente, opciones);
  if (!plano || plano.inclinacion < INCLINACION_MINIMA) return null;
  const giro = new THREE.Quaternion().setFromUnitVectors(plano.normal, new THREE.Vector3(0, 1, 0));
  return { matriz: new THREE.Matrix4().makeRotationFromQuaternion(giro), inclinacion: plano.inclinacion };
}
