// Lo que se ve con algo abierto: las caras de adentro de lo que abre, los marcos, los vanos, el
// tapiz de las puertas y el motor. Salen de la misma superficie, un nivel de subdivisión más abajo:
// son piezas que casi nunca se ven, y no vale la pena gastarles los triángulos de la lata de afuera.
import * as THREE from 'three';
import { Fundidor } from './rueda.js';
import { supercuerpo } from './detalle.js';

const lerp = (a, b, t) => a + (b - a) * t;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const suave = (a, b, x) => {
  const t = cl((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// La sombra de una pieza de adentro, por vértice. Un render sin sombras deja un vano como una caja de
// planos del mismo tono, y eso es lo que se leía como "cajas": lo que dibuja un hueco es que el fondo y las
// esquinas sean más oscuros. `f(x, y, z, nx, ny, nz)` devuelve cuánto de la luz llega (0 a 1).
export function conSombra(geo, f = () => 1) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const s = f(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
    col[3 * i] = col[3 * i + 1] = col[3 * i + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// La sombra de cada pieza de adentro según lo honda que queda.
export function sombraDePieza(id, j, g, d) {
  const { W, P } = g;
  if (id === 'vano-baul' && d.tipo === 'camioneta') {
    // El platón: oscuro en las esquinas del piso con las paredes, y las paredes aclaran hacia arriba.
    const yP = j.filas[j.I.ca].t[0][1];
    const xF = W * 0.8;
    const zF = d.cabinaTras + 0.08;
    return (x, y, z) => {
      const alto = suave(0, 0.2, y - yP);
      const orilla = suave(0, 0.22, xF - Math.abs(x)) * suave(0, 0.28, z - zF);
      return lerp(lerp(0.62, 0.92, orilla), 1, alto);
    };
  }
  if (id.startsWith('marco-')) {
    return (x, y) => lerp(0.7, 1, suave(P, g.H - 0.2, y));
  }
  if (id.startsWith('base-')) {
    return (x) => lerp(0.82, 1, suave(W - 0.14, W - 0.02, Math.abs(x)));
  }
  return () => 1;
}

// La cara de adentro de una pieza: la misma lámina, corrida hacia adentro y vista por detrás.
function caraInterior(p, prof) {
  const o = p.original;
  const n = p.nor;
  const pos = new Float32Array(o.length);
  const nor = new Float32Array(o.length);
  for (let i = 0; i < o.length; i++) {
    pos[i] = o[i] - n[i] * prof;
    nor[i] = -n[i];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = [];
  for (const k of p.idx) if (k < o.length / 3) idx.push(k);
  g.setIndex(idx.reverse());
  return g;
}

// El fondo de un vano: la misma lámina más abajo, mirando hacia afuera, y las paredes que la unen con el
// borde del hueco. El fondo no pasa de xMax: sin ese tope, la bandeja del motor (más ancha que el motor) se
// asomaba por el pase de rueda, encima de la llanta. Por eso a los lados queda una repisa, de la pared a la
// orilla de la lata, a `repisa` de profundidad: la que en un vano de verdad lleva la torre de la
// suspensión, y en un baúl el canal del empaque. Sin ella, ahí quedaba una ranura negra de 20 cm.
function fondoYParedes(parches, prof, f, xMax, repisa = 0.06) {
  const topeX = (x) => Math.max(-xMax, Math.min(xMax, x));
  for (const p of parches) {
    const o = p.original;
    const n = p.nor;
    const Q = (l, h) => [topeX(o[3 * l] - n[3 * l] * h), o[3 * l + 1] - n[3 * l + 1] * h, o[3 * l + 2] - n[3 * l + 2] * h];
    const base = f.n;
    for (let i = 0; i < o.length / 3; i++) f.vertice(topeX(o[3 * i] - n[3 * i] * prof), o[3 * i + 1] - n[3 * i + 1] * prof, o[3 * i + 2] - n[3 * i + 2] * prof, n[3 * i], n[3 * i + 1], n[3 * i + 2]);
    for (const k of p.idx) if (k < o.length / 3) f.idx.push(base + k);
    for (const b of p.bordes) {
      if (b.otro && b.otro.grupo === p.T.grupo) continue;
      // Ni por delante de la parrilla ni de los faros: esa pared queda más adelante que la malla,
      // que va hundida, y se asomaba como una banda del color del carro encima de la parrilla.
      if (b.otro && (b.otro.material === 'parrilla' || b.otro.material === 'faro')) continue;
      const afuera = Math.abs(o[3 * b.a]) > xMax || Math.abs(o[3 * b.b]) > xMax;
      if (!afuera) {
        f.cara([Q(b.a, prof), Q(b.a, 0.012), Q(b.b, 0.012), Q(b.b, prof)]);
        continue;
      }
      // La pared lateral, desde la repisa.
      f.cara([Q(b.a, prof), Q(b.a, repisa), Q(b.b, repisa), Q(b.b, prof)]);
      // La repisa: de la pared hasta la orilla, un centímetro por debajo de la tira negra de la junta.
      const R = (l) => [o[3 * l], o[3 * l + 1] - n[3 * l + 1] * repisa, o[3 * l + 2] - n[3 * l + 2] * repisa];
      f.cara([Q(b.a, repisa), R(b.a), R(b.b), Q(b.b, repisa)]);
    }
  }
}

// El hueco de la tapa de una cabina adelantada: el fondo y las cuatro paredes, por todo el borde. A diferencia del vano
// de un capó, aquí la tapa es casi plana y lo de los lados son los faros, y esa pared sí hace falta: sin ella se ve el
// revés de la lámpara.
function huecoDeTapa(parches, prof, f) {
  for (const p of parches) {
    const o = p.original;
    const n = p.nor;
    const Q = (l, h) => [o[3 * l] - n[3 * l] * h, o[3 * l + 1] - n[3 * l + 1] * h, o[3 * l + 2] - n[3 * l + 2] * h];
    const base = f.n;
    for (let i = 0; i < o.length / 3; i++) f.vertice(...Q(i, prof), n[3 * i], n[3 * i + 1], n[3 * i + 2]);
    for (const k of p.idx) if (k < o.length / 3) f.idx.push(base + k);
    // Por encima de la parrilla la pared arranca por detrás de su malla, que va hundida 2,8 cm: más cerca, con la
    // tapa cerrada, se asomaba como un flequillo blanco entre la malla y la repisa.
    const desde = p.T.material === 'parrilla' ? 0.03 : 0.012;
    for (const b of p.bordes) {
      if (b.otro && b.otro.grupo === p.T.grupo) continue;
      f.cara([Q(b.a, prof), Q(b.a, desde), Q(b.b, desde), Q(b.b, prof)]);
    }
  }
}

// Qué tan lejos queda cada vértice de la orilla de su pieza. La cara de adentro de un capó es un plano
// enorme: el panel del centro, un poco en sombra, y el marco claro alrededor se leen como la lámina
// troquelada de verdad, y no gasta un triángulo.
function distanciaAlBorde(p) {
  const o = p.original;
  const puntos = [];
  for (const b of p.bordes) {
    puntos.push([o[3 * b.a], o[3 * b.a + 1], o[3 * b.a + 2]]);
    puntos.push([(o[3 * b.a] + o[3 * b.b]) / 2, (o[3 * b.a + 1] + o[3 * b.b + 1]) / 2, (o[3 * b.a + 2] + o[3 * b.b + 2]) / 2]);
  }
  const n = o.length / 3;
  const salida = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let mejor = Infinity;
    for (const q of puntos) {
      const dd = (o[3 * i] - q[0]) ** 2 + (o[3 * i + 1] - q[1]) ** 2 + (o[3 * i + 2] - q[2]) ** 2;
      if (dd < mejor) mejor = dd;
    }
    salida[i] = Math.sqrt(mejor);
  }
  return salida;
}

// El revés de lo que abre, con su panel de centro.
function caraTroquelada(p, prof) {
  const geo = caraInterior(p, prof);
  const borde = distanciaAlBorde(p);
  const col = new Float32Array(3 * geo.attributes.position.count);
  for (let i = 0; i < borde.length; i++) {
    const s = lerp(1, 0.74, suave(0.05, 0.2, borde[i])) * lerp(0.86, 1, suave(0, 0.03, borde[i]));
    col[3 * i] = col[3 * i + 1] = col[3 * i + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---- El tapiz de la puerta ----
// Es una sola sábana sobre el revés de la puerta, con el relieve en su altura: la tapa de arriba,
// el apoyabrazos, el bolsillo. Una lámina plana del color del carro es lo que hacía ver la puerta
// abierta como una tapa de caja. El contorno sale del borde de la puerta, y por eso la de atrás le
// da la vuelta al pase de rueda.
const FILAS_V = [0, 0.06, 0.12, 0.17, 0.22, 0.3, 0.38, 0.44, 0.5, 0.56, 0.62, 0.7, 0.8, 0.86, 0.91, 0.96, 1];

function relieve(u, v) {
  const borde = suave(0, 0.08, u) * suave(0, 0.08, 1 - u);
  const tapa = 0.016 * Math.sin(Math.PI * cl((v - 0.85) / 0.15));
  const apoyo = 0.046 * Math.exp(-Math.pow((v - 0.5) / 0.052, 2)) * suave(0.14, 0.26, u) * suave(0, 0.06, 1 - u);
  // El bolsillo: un escalón hacia afuera (menos relieve) con su labio abajo.
  const labio = 0.022 * Math.exp(-Math.pow((v - 0.12) / 0.05, 2)) * suave(0.26, 0.36, u) * suave(0, 0.12, 1 - u);
  return 0.066 + (tapa + apoyo + labio) * borde;
}

function tonoDelTapiz(u, v) {
  // Tela clara en el centro, plástico más oscuro en lo demás. Por vértice, con el borde suave. Es una
  // fracción del tono de la pieza: el tapiz se tiñe con ella al marcarla, y si fuera oscuro de por sí la
  // pieza no se podría ver ni marcar.
  const tela = suave(0.54, 0.6, v) * suave(0.86, 0.8, v) * suave(0.04, 0.1, u) * suave(0.04, 0.1, 1 - u);
  const apoyo = Math.exp(-Math.pow((v - 0.5) / 0.05, 2)) * suave(0.14, 0.26, u);
  return 0.5 + 0.32 * tela + 0.12 * apoyo;
}

function tapizDePuerta({ p, signo, g, j, material, mats, destino }) {
  const o = p.original;
  const segmentos = p.bordes.map((b) => [o[3 * b.a + 1], o[3 * b.a + 2], o[3 * b.b + 1], o[3 * b.b + 2]]);
  const rangoZ = (y) => {
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [ya, za, yb, zb] of segmentos) {
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const z = za + ((zb - za) * (y - ya)) / (yb - ya);
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    return [z0, z1];
  };
  const yBajo = g.E + 0.035;
  // La tapa del tapiz, a la altura de la cintura en la mitad de la puerta.
  const zGuia = (segmentos[0][1] + segmentos[Math.floor(segmentos.length / 2)][1]) / 2;
  const yAlto = j.yHombro(zGuia) - 0.022;
  const columnas = 10;
  const pos = [];
  const col = [];
  const filas = FILAS_V.length;
  for (let r = 0; r < filas; r++) {
    const v = FILAS_V[r];
    for (let c = 0; c <= columnas; c++) {
      const u = c / columnas;
      const y = lerp(yBajo, yAlto, v);
      const [z0, z1] = rangoZ(Math.min(y, yAlto - 0.01));
      const z = lerp(z0 + 0.032, z1 - 0.032, u);
      const x = j.xLado(z, y) - relieve(u, v);
      pos.push(signo * x, y, z);
      const t = tonoDelTapiz(u, v);
      col.push(t, t, t);
    }
  }
  const idx = [];
  const paso = columnas + 1;
  for (let r = 0; r < filas - 1; r++) {
    for (let c = 0; c < columnas; c++) {
      const a = r * paso + c;
      const b = (r + 1) * paso + c;
      const d = b + 1;
      const e = a + 1;
      if (signo > 0) idx.push(a, e, d, a, d, b);
      else idx.push(a, b, d, a, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const malla = new THREE.Mesh(geo, material);
  malla.userData.decorativo = true;
  malla.name = 'tapiz';
  destino.add(malla);
  // La manija de adentro y el parlante: las dos señas por las que uno reconoce una puerta.
  const zD = (u, v) => {
    const y = lerp(yBajo, yAlto, v);
    // Con el mismo tope del tapiz: en una pick-up de 1,10 m de alto (un escaneo mal medido) el estribo queda por
    // encima de la cintura, ninguna arista de la puerta cruza esa altura, y el parlante salía con 234 números rotos.
    const [z0, z1] = rangoZ(Math.min(y, yAlto - 0.01));
    return { y, z: lerp(z0 + 0.032, z1 - 0.032, u) };
  };
  const m = zD(0.2, 0.66);
  const manija = supercuerpo(0.008, 0.013, 0.042, 0.7, 8, 5);
  manija.translate(signo * (j.xLado(m.z, m.y) - relieve(0.2, 0.66) - 0.006), m.y, m.z);
  const mm = new THREE.Mesh(manija, mats.de('cromo'));
  mm.userData.decorativo = true;
  destino.add(mm);
  const s = zD(0.2, 0.2);
  const parlante = supercuerpo(0.004, 0.058, 0.058, 0.9, 12, 8);
  parlante.translate(signo * (j.xLado(s.z, s.y) - relieve(0.2, 0.2) - 0.002), s.y, s.z);
  const mp = new THREE.Mesh(parlante, mats.de('oscuro'));
  mp.userData.decorativo = true;
  destino.add(mp);
}

// ---- El motor ----
// El bloque con su tapa nervada, la caja del filtro con su manguera, la batería con sus bornes, el
// depósito del agua y las torres de la suspensión: un cliente reconoce un vano por esas cosas, no
// por el bloque. La caja escalonada de antes se leía como una piedra.
function tubo(f, puntos, r, lados = 6) {
  const n = puntos.length;
  const anillos = [];
  for (let i = 0; i < n; i++) {
    const a = puntos[Math.max(0, i - 1)];
    const b = puntos[Math.min(n - 1, i + 1)];
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(d);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0).cross(d);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(d, u);
    const an = [];
    for (let k = 0; k < lados; k++) {
      const t = (k / lados) * Math.PI * 2;
      const nx = u.x * Math.cos(t) + v.x * Math.sin(t);
      const ny = u.y * Math.cos(t) + v.y * Math.sin(t);
      const nz = u.z * Math.cos(t) + v.z * Math.sin(t);
      an.push(f.vertice(puntos[i][0] + nx * r, puntos[i][1] + ny * r, puntos[i][2] + nz * r, nx, ny, nz));
    }
    anillos.push(an);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < lados; k++) {
      const a = anillos[i][k];
      const b = anillos[i][(k + 1) % lados];
      const c = anillos[i + 1][(k + 1) % lados];
      const e = anillos[i + 1][k];
      f.idx.push(a, e, c, a, c, b);
    }
  }
}

function ponerMotor({ d, g, j, grupo, mats }) {
  const zC0 = j.filas[j.I.a0].t[0][2];
  const zC1 = d.capoTras - 0.2;
  const zM = lerp(zC0, zC1, 0.55);
  const yM = j.yCapo(0.55) - 0.27;
  const a = g.W * 0.44;
  const b = 0.085;
  const c = Math.min(0.24, (zC1 - zC0) * 0.34);
  const agregar = (f, m) => {
    const malla = new THREE.Mesh(f.geometria(), m);
    malla.userData.decorativo = true;
    grupo.add(malla);
  };
  const fOscuro = new Fundidor();
  const con = (geo, x, y, z) => {
    geo.translate(x, y, z);
    return geo;
  };
  sumar(fOscuro, con(supercuerpo(a, b, c, 0.4, 16, 8), 0, yM, zM));
  sumar(fOscuro, con(supercuerpo(a * 0.32, b * 0.62, c * 0.5, 0.35, 12, 6), a * 1.36, yM + b * 0.32, zM - c * 0.1));
  sumar(fOscuro, con(supercuerpo(a * 0.25, b * 0.58, c * 0.34, 0.25, 12, 6), -a * 1.38, yM + b * 0.25, zM + c * 0.25));
  // La manguera, del filtro a la tapa del motor.
  tubo(
    fOscuro,
    [
      [a * 1.2, yM + b * 0.45, zM - c * 0.25],
      [a * 0.95, yM + b * 0.95, zM - c * 0.32],
      [a * 0.62, yM + b * 1.12, zM - c * 0.38],
    ],
    0.026,
  );
  agregar(fOscuro, mats.de('motor'));
  const fTapa = new Fundidor();
  sumar(fTapa, con(supercuerpo(a * 0.62, b * 0.25, c * 0.74, 0.35, 14, 6), 0, yM + b * 1.05, zM));
  // Los nervios de la tapa.
  for (const s of [-0.5, -0.17, 0.17, 0.5]) sumar(fTapa, con(supercuerpo(a * 0.05, b * 0.08, c * 0.56, 0.5, 6, 4), s * a * 0.9, yM + b * 1.3, zM));
  agregar(fTapa, mats.de('tapaMotor'));
  // El depósito del agua: lo único claro del vano. De un vistazo dice "aquí hay un motor".
  const fDep = new Fundidor();
  sumar(fDep, con(supercuerpo(a * 0.15, b * 0.42, c * 0.24, 0.45, 10, 6), a * 1.14, yM + b * 0.42, zM + c * 1.05));
  agregar(fDep, mats.de('deposito'));
  // Las tapas de colores: la del aceite y la del bidón.
  const fTapas = new Fundidor();
  sumar(fTapas, con(supercuerpo(0.022, 0.012, 0.022, 0.6, 8, 4), a * 0.2, yM + b * 1.36, zM + c * 0.56));
  sumar(fTapas, con(supercuerpo(0.02, 0.012, 0.02, 0.6, 8, 4), a * 1.14, yM + b * 0.86, zM + c * 1.05));
  agregar(fTapas, mats.de('tapaAmarilla'));
  // Los bornes de la batería.
  const fBornes = new Fundidor();
  sumar(fBornes, con(supercuerpo(0.014, 0.01, 0.014, 0.6, 8, 4), -a * 1.3, yM + b * 0.82, zM + c * 0.32));
  agregar(fBornes, mats.de('calaveraLed'));
}

// La joroba de la rueda, en el piso del platón o de la zona de carga: media, porque lo de abajo del piso y lo de
// afuera de la pared se aplastan contra ellos. Entera atravesaba la bóveda del pase de rueda, y con el tono claro de
// adentro salía de lado como una ceja blanca encima de la llanta, en todas las camionetas.
function joroba(ax, ay, az, exp, signo) {
  const g = supercuerpo(ax, ay, az, exp, 12, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) p.setY(i, 0);
    if (p.getX(i) * signo > 0) p.setX(i, 0);
  }
  return g;
}

function sumar(f, g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const base = f.n;
  for (let i = 0; i < p.count; i++) f.vertice(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
  const q = g.index.array;
  for (let i = 0; i < q.length; i++) f.idx.push(q[i] + base);
}

export function ponerInteriores({ d, g, jaula: j, grupo, contenedor, parches, porId, mats, registrar }) {
  const todos = [...parches.values()];
  const dePieza = (id) => todos.find((p) => p.T.pieza === id);
  const deGrupo = (nombre) => todos.filter((p) => p.T.grupo === nombre && p.T.material !== 'faro' && p.T.material !== 'calavera');

  for (const lado of ['izq', 'der']) {
    const signo = lado === 'der' ? 1 : -1;
    const fMarco = new Fundidor();
    const fBase = new Fundidor();
    const fEmpaque = new Fundidor();
    for (const nombre of ['puerta-del-' + lado, 'puerta-tras-' + lado]) {
      const p = dePieza(nombre);
      if (p) {
        const cara = registrar(nombre + '-int', new THREE.Mesh(caraInterior(p, 0.055)), nombre);
        tapizDePuerta({ p, signo, g, j, material: cara.material, mats, destino: contenedor(nombre) });
      }
      // El marco: pared hacia adentro desde el borde del hueco de la puerta, con una pestaña que
      // se mete hacia el centro del hueco. Entre las dos pestañas de las dos puertas queda el
      // pilar B; abajo, la pared es la base donde uno pisa al entrar.
      for (const parche of deGrupo(nombre)) {
        const o = parche.original;
        const n = parche.nor;
        const Q = (l, u, h, w) => [o[3 * l] - n[3 * l] * h + u[3] * w, o[3 * l + 1] - n[3 * l + 1] * h + u[4] * w, o[3 * l + 2] - n[3 * l + 2] * h + u[5] * w];
        for (const b of parche.bordes) {
          if (!b.otro || b.otro.grupo === nombre) continue;
          const ua = parche.dirU.get(b.va);
          const ub = parche.dirU.get(b.vb);
          // Abajo no va pared: la base es la losa de más abajo.
          if (b.otro.pieza && b.otro.pieza.startsWith('estribo')) continue;
          // De la cintura para arriba es empaque negro: se ve por la ventana y no debe brillar.
          const f = parche.T.material !== 'pintura' ? fEmpaque : fMarco;
          // Arranca debajo de la tira negra de la junta: si subiera hasta la lata, el tono claro
          // de la pieza interior se asomaría por la junta como una raya blanca.
          f.cara([Q(b.a, ua, 0.085, 0), Q(b.a, ua, 0.012, 0), Q(b.b, ub, 0.012, 0), Q(b.b, ub, 0.085, 0)]);
          f.cara([Q(b.a, ua, 0.085, 0), Q(b.b, ub, 0.085, 0), Q(b.b, ub, 0.085, 0.06), Q(b.a, ua, 0.085, 0.06)]);
          // El empaque de caucho, sobre la pestaña: es lo que hace ver el vano como un vano. Sin él,
          // son planos pintados.
          fEmpaque.cara([Q(b.a, ua, 0.08, -0.002), Q(b.b, ub, 0.08, -0.002), Q(b.b, ub, 0.08, 0.019), Q(b.a, ua, 0.08, 0.019)]);
        }
      }
    }
    // La base de las puertas: la losa plana del umbral, 6 mm por encima del estribo, a lo largo de
    // las dos puertas. Con las puertas abiertas es lo primero que se ve, y una pared que siguiera
    // la lata (que ahí se recoge hacia adentro) quedaba inclinada, sin dónde pisar. Termina donde
    // empieza el pase de rueda: si no, se asoma por el hueco, encima de la llanta.
    {
      const yL = g.E + 0.006;
      const z0 = Math.max(j.zPd, d.ejeDel + Math.sqrt(Math.max(0, g.ro * g.ro - (g.E - g.R) * (g.E - g.R))));
      const zArco = d.ejeTras - Math.sqrt(Math.max(0, g.ro * g.ro - (g.E - g.R) * (g.E - g.R)));
      const z1 = Math.min(d.puertaTras, zArco);
      const n = 10;
      for (let s = 0; s < n; s++) {
        const a = lerp(z0, z1, s / n);
        const b = lerp(z0, z1, (s + 1) / n);
        const xa = j.xLado(a, g.E) - 0.008;
        const xb = j.xLado(b, g.E) - 0.008;
        const adentro = Math.max(g.W - 0.128, xa - 0.118);
        const q = [
          [signo * adentro, yL, a],
          [signo * adentro, yL, b],
          [signo * xb, yL, b],
          [signo * xa, yL, a],
        ];
        fBase.cara(signo > 0 ? q : [...q].reverse());
      }
    }
    const empaque = new THREE.Mesh(fEmpaque.geometria(), mats.de('empaque'));
    empaque.userData.decorativo = true;
    grupo.add(empaque);
    registrar('marco-' + lado, new THREE.Mesh(fMarco.geometria()));
    registrar('base-puertas-' + lado, new THREE.Mesh(fBase.geometria()));
  }

  // Bajo el capó: la bandeja con sus paredes, y encima un motor que se lee como motor.
  const capo = dePieza('capo');
  if (capo && d.adelantada) {
    // La tapa de un camioncito: un hueco recto con los niveles. Debajo de ella no hay motor, que va bajo las sillas. El
    // vano de un capó, corrido hacia adentro, salía con el revés de los faros a la vista y un hueco negro donde iba la
    // parrilla, y parecía lata rota.
    const parrilla = todos.find((p) => p.T.material === 'parrilla' && p.T.grupo === 'capo');
    // A 3,5 cm: por detrás de la malla de la parrilla, que va hundida 2,8. Más cerca, las paredes de la malla atravesaban
    // el revés de la tapa y salían como un rayón negro.
    registrar('capo-int', new THREE.Mesh(caraTroquelada(capo, 0.035)), 'capo');
    if (parrilla) {
      // El revés de la parrilla es el mismo panel de la tapa: sin esto, abierta se vería el cielo por ahí.
      const reves = new THREE.Mesh(conSombra(caraInterior(parrilla, 0.035), () => 0.74), porId.get('capo-int').material);
      reves.name = 'capo-int';
      reves.userData.piezaId = 'capo-int';
      contenedor('capo').add(reves);
    }
    const f = new Fundidor();
    const hondo = 0.2;
    huecoDeTapa(parrilla ? [capo, parrilla] : [capo], hondo, f);
    const geoHueco = f.geometria();
    geoHueco.computeBoundingBox();
    const { min, max } = geoHueco.boundingBox;
    // La luz solo llega hasta la mitad del hueco, y abajo, donde se juntan el piso y el fondo, menos.
    conSombra(geoHueco, (x, y, z) => lerp(1, 0.6, suave(0.02, hondo, z - min.z)) * lerp(0.84, 1, suave(0, 0.1, y - min.y)));
    registrar('vano-motor', new THREE.Mesh(geoHueco));
    // Los depósitos: es por lo que se abre esta tapa, y con ellos un hueco se lee como un hueco de servicio.
    const fDep = new Fundidor();
    const fTapas = new Fundidor();
    const yPiso = min.y + 0.006;
    const zD = min.z + hondo * 0.62;
    const anchoHueco = max.x;
    for (const [fx, a, h] of [
      [0.5, 0.075, 0.085],
      [-0.42, 0.055, 0.07],
    ]) {
      const x = fx * anchoHueco;
      const dep = supercuerpo(a, h / 2, 0.05, 0.45, 10, 6);
      dep.translate(x, yPiso + h / 2, zD);
      sumar(fDep, dep);
      const tapita = supercuerpo(0.021, 0.012, 0.021, 0.6, 8, 4);
      tapita.translate(x, yPiso + h + 0.008, zD);
      sumar(fTapas, tapita);
    }
    for (const [fu, m] of [
      [fDep, 'deposito'],
      [fTapas, 'tapaAmarilla'],
    ]) {
      const malla = new THREE.Mesh(fu.geometria(), mats.de(m));
      malla.userData.decorativo = true;
      grupo.add(malla);
    }
  } else if (capo) {
    registrar('capo-int', new THREE.Mesh(caraTroquelada(capo, 0.02)), 'capo');
    const f = new Fundidor();
    const xMax = g.W - 0.38;
    fondoYParedes([capo], 0.25, f, xMax);
    // Las torres de la suspensión, sobre la repisa y encima de la rueda: es lo que un mecánico busca para
    // saber dónde está parado, y le quita al vano lo de caja.
    const zC0 = j.filas[j.I.a0].t[0][2];
    const zC1 = d.capoTras - 0.2;
    const sDe = (z) => cl((z - j.filas[0].t[0][2]) / (d.capoTras - 0.235 - j.filas[0].t[0][2]));
    const zTorre = lerp(zC0, zC1, 0.62);
    const yTorre = j.yCapo(sDe(zTorre)) - 0.11;
    for (const s of [-1, 1]) {
      const torre = supercuerpo(0.08, 0.062, 0.085, 0.62, 14, 7);
      torre.translate(s * (xMax + 0.055), yTorre, zTorre);
      sumar(f, torre);
    }
    const geoVano = f.geometria();
    // La sombra del vano: el fondo y sobre todo alrededor del motor, donde no llega la luz. La pared
    // aclara hacia arriba, y por eso se lee honda.
    const zMotor = lerp(zC0, zC1, 0.55);
    const anchoMotor = g.W * 0.44 * 1.5;
    const fondoMotor = Math.min(0.24, (zC1 - zC0) * 0.34) * 1.2;
    conSombra(geoVano, (x, y, z) => {
      const hondo = j.yCapo(sDe(z)) - y;
      const luz = 1 - suave(0.05, 0.26, hondo);
      const lejos = Math.hypot(Math.max(0, Math.abs(x) - anchoMotor), Math.max(0, Math.abs(z - zMotor) - fondoMotor));
      const motor = lerp(lerp(1, 0.6, suave(0.14, 0.24, hondo)), 1, suave(0, 0.22, lejos));
      const orilla = lerp(lerp(1, 0.66, suave(0.16, 0.24, hondo)), 1, suave(0, 0.14, xMax - Math.abs(x)));
      return lerp(0.5, 1, luz) * motor * orilla;
    });
    registrar('vano-motor', new THREE.Mesh(geoVano));
    ponerMotor({ d, g, j, grupo, mats });
    // El travesaño detrás de la parrilla: tapa el revés de la malla y de los faros cuando el capó
    // está abierto.
    const fT = new Fundidor();
    const zT = j.filas[0].t[0][2] + 0.1;
    const yT = g.yCapoDel - 0.035;
    // Solo detrás de la parrilla: más ancho se mete en los faros, y por el lente se veía como un
    // polígono negro adentro de la lámpara.
    const xT = Math.min(g.W - 0.2, j.filas[0].t[3][0] - 0.01);
    fT.cara([
      [xT, yT, zT],
      [xT, g.P + 0.14, zT],
      [-xT, g.P + 0.14, zT],
      [-xT, yT, zT],
    ]);
    const travesano = new THREE.Mesh(fT.geometria(), mats.de('oscuro'));
    travesano.userData.decorativo = true;
    grupo.add(travesano);
  }

  // El baúl o la compuerta.
  const baul = dePieza('baul');
  if (baul && !porId.has('baul-int')) registrar('baul-int', new THREE.Mesh(caraTroquelada(baul, 0.04)), 'baul');
  if (porId.has('vano-baul')) {
    // El platón ya viene de la jaula; aquí lo que le da cuerpo: el umbral de la compuerta (sin él, al
    // bajarla queda una franja negra entre el piso y la bisagra), las jorobas de las ruedas y las
    // nervaduras del piso. Es la misma pieza: se tiñe con ella.
    const piso = porId.get('vano-baul');
    const f = new Fundidor();
    const tonos = [];
    const con = (s) => {
      while (tonos.length < f.n) tonos.push(s);
    };
    const yP = j.filas[j.I.ca].t[0][1];
    const xF = g.W * 0.8;
    const zFin = j.filas[j.I.bt].t[0][2];
    const zBisagra = d.compuertaZ - 0.02;
    const yBisagra = j.yBisagraBaul;
    // Arranca 22 cm antes: la subdivisión redondea el final del piso hacia la cara de adentro de la compuerta,
    // y con la compuerta abajo ese redondeo queda como una franja abierta.
    f.cara([
      [-xF, yP - 0.002, zFin - 0.22],
      [-xF, yP - 0.002, zBisagra],
      [xF, yP - 0.002, zBisagra],
      [xF, yP - 0.002, zFin - 0.22],
    ]);
    con(0.84);
    f.cara([
      [-xF, yP - 0.002, zBisagra],
      [-xF, yBisagra, zBisagra],
      [xF, yBisagra, zBisagra],
      [xF, yP - 0.002, zBisagra],
    ]);
    con(0.55);
    const zIni = d.cabinaTras + 0.14;
    for (const u of [0.2, 0.4, 0.6]) {
      for (const s of [-1, 1]) {
        const x0 = s * (xF * u - 0.016);
        const x1 = s * (xF * u + 0.016);
        const q = [
          [x0, yP + 0.0035, zIni],
          [x0, yP + 0.0035, zFin - 0.03],
          [x1, yP + 0.0035, zFin - 0.03],
          [x1, yP + 0.0035, zIni],
        ];
        f.cara(s > 0 ? q : [...q].reverse());
        con(0.78);
      }
    }
    for (const s of [-1, 1]) {
      const bulto = joroba(0.095, 0.13, Math.min(0.36, (zFin - zIni) * 0.3), 0.5, s);
      bulto.translate(s * xF, yP, d.ejeTras);
      sumar(f, bulto);
      con(0.9);
    }
    const geo = f.geometria();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(tonos.flatMap((s) => [s, s, s]), 3));
    const parte = new THREE.Mesh(geo, piso.material);
    parte.name = 'vano-baul';
    parte.userData.piezaId = 'vano-baul';
    grupo.add(parte);
  } else {
    const f = new Fundidor();
    if (d.tipo === 'sedan') {
      const xMax = g.W - 0.38;
      fondoYParedes(deGrupo('baul'), 0.3, f, xMax, 0.05);
      const geo = f.geometria();
      const yTapa = j.filas[j.I.tail].t[0][1];
      const zFrente = d.vidrioTras - 0.1;
      // Honda hacia el piso, y más en las esquinas: un baúl es un hueco, no un plano.
      conSombra(geo, (x, y, z) => {
        const hondo = yTapa - y;
        const luz = 1 - suave(0.05, 0.3, hondo);
        const orilla = suave(0, 0.2, xMax - Math.abs(x)) * suave(0, 0.28, z - zFrente) * suave(0, 0.2, d.cola - 0.14 - z);
        return lerp(0.52, 1, luz) * lerp(lerp(1, 0.72, suave(0.2, 0.3, hondo)), 1, orilla);
      });
      registrar('vano-baul', new THREE.Mesh(geo));
    } else {
      // Carros cerrados: el marco del hueco de la compuerta, el piso de carga y las dos paredes, con la
      // joroba de la rueda. Sin paredes, el piso quedaba flotando en un hueco negro.
      for (const p of deGrupo('baul')) {
        const o = p.original;
        const n = p.nor;
        const Q = (l, h) => [o[3 * l] - n[3 * l] * h, o[3 * l + 1] - n[3 * l + 1] * h, o[3 * l + 2] - n[3 * l + 2] * h];
        for (const b of p.bordes) {
          if (b.otro && b.otro.grupo === 'baul') continue;
          f.cara([Q(b.a, 0.075), Q(b.a, 0.012), Q(b.b, 0.012), Q(b.b, 0.075)]);
        }
      }
      const z0 = d.puertaTras + 0.12;
      const z1 = d.compuertaZ - 0.03;
      // Por encima de la bóveda de la rueda: más abajo se asomaba por el arco, y de lado salía una ceja gris sobre la
      // llanta de atrás, 49x6 px de 173,173,175 en un hatchback rojo. Con esto, 0 px en Izquierdo y Derecho.
      const y = Math.max(d.cintura - 0.36, 2 * g.R + 0.1);
      const x = g.W - 0.14;
      const yMuro = d.cintura + 0.02;
      // El piso va en rejilla, para que la sombra de las orillas tenga dónde caer.
      const nx = 8;
      const nz = 6;
      const base = f.n;
      for (let q = 0; q <= nz; q++) {
        for (let r = 0; r <= nx; r++) f.vertice(lerp(-x, x, r / nx), y, lerp(z0, z1, q / nz), 0, 1, 0);
      }
      for (let q = 0; q < nz; q++) {
        for (let r = 0; r < nx; r++) {
          const i = base + q * (nx + 1) + r;
          f.idx.push(i, i + nx + 1, i + nx + 2, i, i + nx + 2, i + 1);
        }
      }
      for (const s of [-1, 1]) {
        const q = [
          [s * x, y, z0],
          [s * x, yMuro, z0],
          [s * x, yMuro, z1],
          [s * x, y, z1],
        ];
        f.cara(s > 0 ? [...q].reverse() : q);
        const bulto = joroba(0.1, Math.max(0.05, g.R * 2 + 0.06 - y), Math.min(0.34, (z1 - z0) * 0.42), 0.55, s);
        bulto.translate(s * x, y, Math.min(d.ejeTras, z1 - 0.1));
        sumar(f, bulto);
      }
      const geo = f.geometria();
      conSombra(geo, (px, py, pz) => {
        const alto = suave(0, 0.3, py - y);
        const orilla = suave(0, 0.26, x - Math.abs(px)) * suave(0, 0.3, pz - z0) * suave(0, 0.14, z1 - pz);
        return lerp(lerp(0.56, 0.96, orilla), 1, alto);
      });
      registrar('vano-baul', new THREE.Mesh(geo));
    }
  }
}
