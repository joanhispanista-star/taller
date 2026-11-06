// Lo que va encima de la lata: materiales, espejos, manijas, placas, parrilla, cola y cabina. La lata
// la hace la jaula; lo que le termina de quitar la cara de juguete está aquí.
//
// Este módulo se construye igual en el navegador y en Node: lo único que pide el DOM (el dibujo
// de la placa y de la malla de la parrilla) tiene su respaldo liso.
import * as THREE from 'three';
import { crearMalla, subdividir, normalesPorSector } from './subdivision.js';
import { Fundidor } from './rueda.js';
import { crearInterior, crearPintura, crearPlano, crearPlaton, conReflejoDeEstudio } from './pintura.js';
import { exploradora } from './luces.js';

const lerp = (a, b, t) => a + (b - a) * t;

// ---- Materiales ----

const vidrioReal = (o) =>
  new THREE.MeshPhysicalMaterial({
    metalness: 0,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    ...o,
  });

// three 0.169 no le hace caso a envMapIntensity cuando el material toma el entorno de la escena
// (scene.environment). Y aquí hace falta: un plástico o una goma, con el reflejo entero de este
// cuarto, salen grises. El carro no conoce la escena al construirse, así que la toma en el primer
// cuadro; a three le da igual, compila el programa justo después.
export function conEntorno(malla) {
  const antes = malla.onBeforeRender;
  malla.onBeforeRender = (r, escena, ...resto) => {
    antes.call(malla, r, escena, ...resto);
    const m = malla.material;
    // Sin tope a "solo la primera vez": el visor cambia el entorno al cambiar de escena.
    if (escena.environment && m.envMap !== escena.environment) m.envMap = escena.environment;
  };
}

// La malla de la parrilla, dibujada: luz arriba y sombra abajo. Cada carrocería la suya: hexágonos,
// rombos o listones. Una parrilla negra lisa es exactamente lo que el dueño ve como "bloque".
function texturaRejilla(forma) {
  if (typeof document === 'undefined') return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 128;
  const c = lienzo.getContext('2d');
  c.fillStyle = '#050608';
  c.fillRect(0, 0, 128, 128);
  if (forma === 'barras') {
    for (let y = 0; y < 128; y += 32) {
      const g = c.createLinearGradient(0, y, 0, y + 18);
      g.addColorStop(0, '#3a3e44');
      g.addColorStop(1, '#101215');
      c.fillStyle = g;
      c.fillRect(0, y + 4, 128, 14);
    }
  } else if (forma === 'rombo') {
    c.lineWidth = 7;
    const trazo = (x0, y0, x1, y1, col) => {
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    for (let k = -128; k <= 256; k += 64) {
      trazo(k, 0, k + 128, 128, '#23262b');
      trazo(k + 128, 0, k, 128, '#2e3238');
    }
  } else {
    // Panal: dos filas de hexágonos por baldosa, para que se repita sin costura.
    c.strokeStyle = '#26292e';
    c.lineWidth = 7;
    const r = 16;
    const hex = (cx, cy) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.stroke();
    };
    for (let y = -1; y < 6; y++) {
      for (let x = -1; x < 6; x++) hex(x * 32 + (y % 2 ? 16 : 0), y * 32);
    }
  }
  const t = new THREE.CanvasTexture(lienzo);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FORMA_PARRILLA = { sedan: 'rombo', hatchback: 'panal', suv: 'panal', camioneta: 'barras' };
const FORMA_TOMA = { sedan: 'rombo', hatchback: 'panal', suv: 'panal', camioneta: 'barras' };

export function crearMateriales(base, tipo, medidas = {}) {
  const cache = new Map();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const fabricas = {
    // Un vidrio de verdad: lo de atrás se oscurece (el tinte), y el reflejo se SUMA entero encima.
    // Con la transparencia normal de three el reflejo también se atenúa, y el vidrio sale gris y
    // sin brillo, o negro si se le sube la opacidad: por eso se veían las sillas como cajas.
    vidrio: () => conReflejoDeEstudio(vidrioReal({ color: 0x06080a, roughness: 0.05, opacity: 0.8, side: THREE.DoubleSide })),
    // El de las puertas, más claro, como en los carros de verdad: con la puerta abierta se tiene que
    // ver a través de él, y con el del parabrisas parecía una lámina negra.
    vidrioPuerta: () => conReflejoDeEstudio(vidrioReal({ color: 0x06080a, roughness: 0.05, opacity: 0.62, side: THREE.DoubleSide })),
    // Los marcos y pilares: negros de verdad. Con el reflejo entero salían grises, y un pilar gris se
    // lee como una pieza de juguete.
    negro: () => conReflejoDeEstudio(std({ color: 0x050607, metalness: 0, roughness: 0.2, side: THREE.DoubleSide }), 0.2),
    plastico: () => std({ color: 0x101215, metalness: 0, roughness: 0.68, envMapIntensity: 0.45 }),
    plata: () => std({ color: 0x35383c, metalness: 0.5, roughness: 0.48, envMapIntensity: 0.6 }),
    // Con emissiveMap apagado: no brilla, pero así es el mismo programa de sombreado de las lámparas y la placa,
    // y uno menos que compilar en el primer cuadro del celular.
    parrilla: () => {
      const map = texturaRejilla(FORMA_PARRILLA[tipo]);
      return std(map ? { map, emissiveMap: map, emissive: 0x000000, color: 0xffffff, metalness: 0.4, roughness: 0.5, envMapIntensity: 0.6 } : { color: 0x0a0b0d, metalness: 0.4, roughness: 0.5, envMapIntensity: 0.6 });
    },
    toma: () => {
      const map = texturaRejilla(FORMA_TOMA[tipo]);
      return std(map ? { map, emissiveMap: map, emissive: 0x000000, color: 0xa0a0a0, metalness: 0.2, roughness: 0.65, envMapIntensity: 0.5 } : { color: 0x08090b, metalness: 0.2, roughness: 0.65, envMapIntensity: 0.5 });
    },
    hueco: () => std({ color: 0x050506, roughness: 1 }),
    parachoques: () => std({ color: 0x2a2d31, metalness: 0.35, roughness: 0.55 }),
    // El fondo de la junta lleva el tono de la pintura, muy oscurecido: en un carro blanco, una
    // junta negra pura parece trazada con esfero.
    // En un blanco, más claro todavía: con 0,05 (casi negro) la junta sobre la lata de 225 se leía
    // como una línea de esfero; con 0,2 se lee como la sombra de una rendija.
    junta: () => {
      const Y = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
      return crearPlano(base.clone().multiplyScalar(lerp(0.09, 0.2, THREE.MathUtils.smoothstep(Y, 0.42, 0.75))));
    },
    // El filo claro de la junta, solo en pinturas oscuras: en un carro negro, una línea oscura no se
    // ve, y el dueño tiene que poder señalar la puerta sin marcarla. Con poco contraste: de 4 mm, a la
    // distancia de la app, es menos de un píxel, y con más contraste sale punteado, como una costura.
    filo: () => crearPlano(new THREE.Color(0x2e3033)),
    oscuro: () => std({ color: 0x0c0d0f, metalness: 0, roughness: 0.95 }),
    forro: () => std({ color: 0x08090a, metalness: 0, roughness: 1 }),
    // De una sola cara, como todo lo que no sea el vidrio y los marcos: la doble cara es un programa de sombreado
    // aparte, y lo usaban seis materiales que igual solo se ven de un lado. Lo que sí se ve de los dos (el piso y las
    // paredes de la cabina) lleva las dos caras en la malla: son 2 triángulos más por cada plano.
    suelo: () => std({ color: 0x08090a, metalness: 0, roughness: 1 }),
    // Más claros que el negro de verdad: detrás del vidrio polarizado se tienen que alcanzar a
    // leer, y un carro con la cabina negra entera parece macizo.
    silla: () => std({ color: 0x2a2c31, metalness: 0, roughness: 0.92 }),
    tablero: () => std({ color: 0x1e2024, metalness: 0, roughness: 0.7 }),
    goma: () => std({ color: 0x08090a, metalness: 0, roughness: 0.75, envMapIntensity: 0.3 }),
    espejoVidrio: () => std({ color: 0x59626a, metalness: 1, roughness: 0.08, envMapIntensity: 0.7 }),
    cromo: () => std({ color: 0xd8dde3, metalness: 1, roughness: 0.14 }),
    // El tubo de escape: acero viejo. Cromado, de atrás se leía como un aro brillante colgado bajo el bómper.
    cromoAmbos: () => std({ color: 0x55585d, metalness: 0.9, roughness: 0.42 }),
    // El lente no tiene color: solo reflejo, y deja ver entero lo que hay detrás.
    // Sin la franja del horizonte: el lente tiene aristas duras, y la franja dibujaba adentro del faro
    // un polígono negro con el borde vivo.
    faroLente: () => conReflejoDeEstudio(vidrioReal({ color: 0x000000, roughness: 0.03, opacity: 0.1 }), 0.45, 0),
    faroCaja: () => std({ color: 0x24272b, metalness: 0, roughness: 0.6 }),
    calaveraFondo: () => std({ color: 0x8a0a10, emissive: 0x5a0408, emissiveIntensity: 0.9, metalness: 0, roughness: 0.34 }),
    calaveraLed: () => std({ color: 0xff2a33, emissive: 0xff1a24, emissiveIntensity: 0.95, roughness: 0.4 }),
    catadioptrico: () => std({ color: 0x5a070c, emissive: 0x4a0408, emissiveIntensity: 0.5, roughness: 0.22 }),
    lenteExploradora: () => std({ color: 0x7c8289, metalness: 0.55, roughness: 0.3 }),
    // Un color parejo: la pared de abajo de cada boca mira al cielo, y con un material normal salía
    // como un filo cromado al pie de todas las caras.
    bisel: () => crearPlano(new THREE.Color(0x0f1012)),
    satinado: () => std({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.42 }),
    empaque: () => std({ color: 0x08090a, metalness: 0, roughness: 0.78 }),
    motor: () => std({ color: 0x1b1d20, metalness: 0.45, roughness: 0.55 }),
    tapaMotor: () => std({ color: 0x3a3d42, metalness: 0.5, roughness: 0.48 }),
    deposito: () => std({ color: 0xb9bdb2, metalness: 0, roughness: 0.5 }),
    tapaAmarilla: () => std({ color: 0xd8a51c, metalness: 0, roughness: 0.5 }),
  };
  return {
    // Cada pieza pintable lleva su propio material, para que `resaltar` la tiña sola.
    pintura: (color = base) => crearPintura(color, medidas),
    // Las de adentro, cada una con el suyo, como la lata: ver crearInterior.
    interior: (color = base) => crearInterior(color),
    platon: (color = base) => crearPlaton(color),
    mate: (color) => new THREE.MeshStandardMaterial({ color: color.clone(), metalness: 0, roughness: 0.72, envMapIntensity: 0.5 }),
    de: (nombre) => {
      if (!cache.has(nombre)) cache.set(nombre, (fabricas[nombre] || (() => std({ color: 0xff00ff })))());
      return cache.get(nombre);
    },
  };
}

// ---- Piezas pequeñas con la misma subdivisión del carro ----

// Una jaula pequeña y convexa: se orienta sola (cada cara hacia afuera del centro) y se vuelca.
function orientar(pos, caras) {
  const n = pos.length;
  const c = [0, 0, 0];
  for (const p of pos) {
    c[0] += p[0] / n;
    c[1] += p[1] / n;
    c[2] += p[2] / n;
  }
  return caras.map((f) => {
    const a = pos[f[0]];
    const b = pos[f[1]];
    const d = pos[f[2]];
    const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const m = [0, 0, 0];
    for (const v of f) {
      m[0] += pos[v][0] / f.length;
      m[1] += pos[v][1] / f.length;
      m[2] += pos[v][2] / f.length;
    }
    const lado = nx * (m[0] - c[0]) + ny * (m[1] - c[1]) + nz * (m[2] - c[2]);
    return lado >= 0 ? f : [...f].reverse();
  });
}

// Vuelca una jaula subdividida en uno o varios fundidores. `espejar` refleja en X (el lado
// izquierdo) y le da la vuelta a las caras.
function volcar(pos, caras, { tags = null, pliegues = [], niveles = 2, destino, espejar = false }) {
  const plano = [];
  for (const p of pos) plano.push(espejar ? -p[0] : p[0], p[1], p[2]);
  const carasO = orientar(pos, caras).map((f) => (espejar ? [...f].reverse() : f));
  let m = crearMalla(plano, carasO, tags || carasO.map(() => 0), pliegues);
  for (let i = 0; i < niveles; i++) m = subdividir(m);
  const N = normalesPorSector(m);
  const local = new Int32Array(4 * m.nF).fill(-1);
  const destinoDe = (t) => (destino instanceof Fundidor ? destino : destino[t]);
  const usados = new Map();
  for (let f = 0; f < m.nF; f++) {
    const t = m.tag[f];
    const fd = destinoDe(t);
    if (!fd) continue;
    let marca = usados.get(t);
    if (!marca) usados.set(t, (marca = []));
    const c = [];
    for (let q = 4 * f; q < 4 * f + 4; q++) {
      const g = N.grupo[q];
      if (local[g] < 0) {
        const v = m.fV[q];
        local[g] = fd.vertice(m.P[3 * v], m.P[3 * v + 1], m.P[3 * v + 2], N.normal[3 * g], N.normal[3 * g + 1], N.normal[3 * g + 2]);
        marca.push(g);
      }
      c.push(local[g]);
    }
    fd.idx.push(c[0], c[1], c[2], c[0], c[2], c[3]);
    // Una esquina de sector no se comparte entre etiquetas: el grupo vale solo para su cara.
  }
}

// Una caja con los cantos redondeados, según lo filosos que sean. `xf` deforma los vértices.
function caja(c, t, filo = 1, xf = null) {
  const pos = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = [c[0] + (sx * t[0]) / 2, c[1] + (sy * t[1]) / 2, c[2] + (sz * t[2]) / 2];
        pos.push(xf ? xf(p, sx, sy, sz) : p);
      }
    }
  }
  const caras = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  const pliegues = [];
  for (const f of caras) for (let k = 0; k < 4; k++) pliegues.push([f[k], f[(k + 1) % 4], filo]);
  return { pos, caras, pliegues };
}

// Una esfera deformada a superelipse: carcasas, cojines y manijas sin caras planas ni filos.
export function supercuerpo(ax, ay, az, exp, sx = 14, sy = 10) {
  const g = new THREE.SphereGeometry(1, sx, sy);
  const p = g.attributes.position;
  const f = (t) => Math.sign(t) * Math.pow(Math.abs(t), exp);
  for (let k = 0; k < p.count; k++) p.setXYZ(k, ax * f(p.getX(k)), ay * f(p.getY(k)), az * f(p.getZ(k)));
  g.computeVertexNormals();
  // En los polos de la esfera, computeVertexNormals deja normal cero (sus triángulos no tienen área).
  const n = g.attributes.normal;
  for (let k = 0; k < n.count; k++) {
    if (n.getX(k) ** 2 + n.getY(k) ** 2 + n.getZ(k) ** 2 < 0.25) n.setXYZ(k, 0, Math.sign(p.getY(k)) || 1, 0);
  }
  g.deleteAttribute('uv');
  return g;
}

// Funde geometrías con índice en una sola.
function fundirGeos(geos) {
  const f = new Fundidor();
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const base = f.n;
    for (let i = 0; i < p.count; i++) f.vertice(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    const q = g.index.array;
    for (let i = 0; i < q.length; i++) f.idx.push(q[i] + base);
  }
  return f.geometria();
}

// Silla: cojín, respaldo y cabecera, ya fundidos. Mira hacia -Z.
function geometriaSilla(escala = 1) {
  const cojin = supercuerpo(0.24 * escala, 0.065 * escala, 0.25 * escala, 0.7, 14, 7);
  const respaldo = supercuerpo(0.235 * escala, 0.3 * escala, 0.08 * escala, 0.7, 14, 9);
  respaldo.rotateX(0.22);
  respaldo.translate(0, 0.3 * escala, 0.23 * escala);
  const cabecera = supercuerpo(0.125 * escala, 0.085 * escala, 0.055 * escala, 0.8, 12, 7);
  cabecera.translate(0, 0.665 * escala, 0.31 * escala);
  return fundirGeos([cojin, respaldo, cabecera]);
}

// Para jaulas que no son convexas (el alerón, las barras): la orientación se corrige mirando
// una sola cara hacia afuera por el volumen firmado, y se aplica a todas.
function volcarSinOrientar(pos, caras, pliegues, f, espejar = false, niveles = 2) {
  let vol = 0;
  for (const c of caras) {
    const a = pos[c[0]];
    for (let i = 1; i < c.length - 1; i++) {
      const b = pos[c[i]];
      const e = pos[c[i + 1]];
      vol += a[0] * (b[1] * e[2] - b[2] * e[1]) - a[1] * (b[0] * e[2] - b[2] * e[0]) + a[2] * (b[0] * e[1] - b[1] * e[0]);
    }
  }
  const invertir = (vol < 0) !== espejar;
  const carasF = invertir ? caras.map((c) => [...c].reverse()) : caras;
  const plano = [];
  for (const p of pos) plano.push(espejar ? -p[0] : p[0], p[1], p[2]);
  let m = crearMalla(plano, carasF, carasF.map(() => 0), pliegues);
  for (let i = 0; i < niveles; i++) m = subdividir(m);
  const N = normalesPorSector(m);
  const local = new Int32Array(4 * m.nF).fill(-1);
  for (let k = 0; k < m.nF; k++) {
    const c = [];
    for (let q = 4 * k; q < 4 * k + 4; q++) {
      const g = N.grupo[q];
      if (local[g] < 0) {
        const v = m.fV[q];
        local[g] = f.vertice(m.P[3 * v], m.P[3 * v + 1], m.P[3 * v + 2], N.normal[3 * g], N.normal[3 * g + 1], N.normal[3 * g + 2]);
      }
      c.push(local[g]);
    }
    f.idx.push(c[0], c[1], c[2], c[0], c[2], c[3]);
  }
}

// ---- El espejo ----
// Carcasa de huevo sobre un brazo, con el vidrio metido en su marco.
function ponerEspejo({ d, g, j, signo, lado, contenedor, mats, registrar }) {
  const z0 = j.zsCw + 0.075;
  const yB = j.yHombro(z0);
  const xBase = j.xLado(z0, yB) - 0.03 * (g.W / 0.92);
  const camioneta = d.tipo === 'camioneta';
  // El de un camioncito es chico: con el de una Hilux, en una cabina de 1,4 m de ancho, parecía una oreja.
  const ancho = d.adelantada ? 0.15 : camioneta ? 0.21 : d.tipo === 'suv' ? 0.195 : 0.175;
  const alto = d.adelantada ? 0.12 : camioneta ? 0.15 : d.tipo === 'suv' ? 0.128 : 0.112;
  // Pegado a la puerta: un espejo lejos de la lata, en un brazo largo, parece una antena.
  const x0 = xBase + 0.04;
  const x1 = x0 + ancho;
  const yC = yB + 0.045 + alto / 2;
  const zA = z0 + 0.075; // la cara del vidrio, hacia atrás
  const fondo = camioneta ? 0.09 : 0.082;
  const aro = (kx, ky, z, dy = 0) => {
    const cx = (x0 + x1) / 2;
    const a = (ancho / 2) * kx;
    const h = (alto / 2) * ky;
    return [
      [cx - a, yC + h * 0.82 + dy, z],
      [cx + a, yC + h * 1.02 + dy, z],
      [cx + a * 1.02, yC - h * 0.92 + dy, z],
      [cx - a * 1.0, yC - h * 0.68 + dy, z],
    ];
  };
  const pos = [...aro(1, 1, zA), ...aro(0.88, 0.84, zA - 0.006), ...aro(0.72, 0.74, zA - fondo, -0.002)];
  const caras = [
    [0, 1, 9, 8],
    [1, 2, 10, 9],
    [2, 3, 11, 10],
    [3, 0, 8, 11],
    [8, 9, 10, 11],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [4, 5, 6, 7],
  ];
  const tags = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2];
  const pliegues = [];
  for (let k = 0; k < 4; k++) {
    pliegues.push([k, (k + 1) % 4, 2.2]);
    pliegues.push([4 + k, 4 + ((k + 1) % 4), 3]);
    pliegues.push([k, 4 + k, 1]);
  }
  const fCar = new Fundidor();
  const fMarco = new Fundidor();
  const fVidrio = new Fundidor();
  volcar(pos, caras, { tags, pliegues, niveles: 2, destino: [fCar, fMarco, fVidrio], espejar: signo < 0 });
  const nombreGrupo = 'puerta-del-' + lado;
  const carcasa = new THREE.Mesh(fCar.geometria(), mats.pintura());
  registrar('espejo-' + lado, carcasa, nombreGrupo);
  const marco = new THREE.Mesh(fMarco.geometria(), mats.de('negro'));
  marco.userData.decorativo = true;
  const vidrio = new THREE.Mesh(fVidrio.geometria(), mats.de('espejoVidrio'));
  vidrio.userData.decorativo = true;
  // El brazo: del triángulo de la puerta a la carcasa.
  const fBrazo = new Fundidor();
  const cb = caja([(xBase - 0.01 + x0 + 0.05) / 2, yB + 0.032, z0 + 0.03], [x0 + 0.05 - xBase + 0.01, 0.034, 0.085], 1, (p, sx) => (sx < 0 ? [p[0], p[1] - 0.012, p[2]] : [p[0], p[1] + 0.022, p[2]]));
  volcar(cb.pos, cb.caras, { pliegues: cb.pliegues, niveles: 1, destino: fBrazo, espejar: signo < 0 });
  const brazo = new THREE.Mesh(fBrazo.geometria(), mats.de('negro'));
  brazo.userData.decorativo = true;
  contenedor(nombreGrupo).add(marco, vidrio, brazo);
}

// ---- El bómper de acero de la pick-up ----
// Va aparte de la jaula: es otra lámina, atornillada al chasis. Hecho con la rejilla de la cola, una
// cara de 20 cm redondeada por la subdivisión y con el metal reflejando el cuarto salía como una masa
// borrosa; aquí tiene un perfil que corre de punta a punta (la tapa donde se pisa, la cara, un quiebre, y
// abajo se recoge), con los cantos vivos, y le da la vuelta a la esquina hasta el costado. Pintura y no
// metal: el mismo reflejo limpio de la lata, y al marcarlo sale del color del acento.
// Oscuro, como el de casi toda camioneta de trabajo. Claro (0xa9aeb3) daba 133,139,144 parejo en todos los colores: con
// las caras planas y nada que reflejar, se leía como lata sin pintar, y justo en el centro del botón Atrás.
function ponerBomperAcero({ d, g, j, mats, registrar, agregar }) {
  const { P } = g;
  const yTope = P + 0.262;
  const yQuiebre = P + 0.165;
  const yBajo = P + 0.04;
  const zA = d.cola;
  const zI = d.compuertaZ + 0.01; // arranca al ras de la compuerta
  const zF = j.zBtCola - 0.045; // hasta donde llega la vuelta por el costado
  const xC = j.xLado(zF, P + 0.22);
  const xA = xC + 0.014;
  // Cada estación: el canto de afuera y el de adentro, en planta, de la mitad derecha.
  const media = [
    [0.3, zA, 0.3, zI],
    [0.6, zA, 0.6, zI],
    [0.84, zA - 0.002, 0.84, zI],
    [0.945, zA - 0.022, 0.93, zI],
    [0.993, zA - 0.07, 0.985, zI - 0.008],
    [1, zA - 0.135, 0.985, Math.min(zI - 0.03, zA - 0.135)],
    [1, zF, 0.985, zF],
  ];
  const estaciones = [...[...media].reverse().map(([x, z, xi, zi]) => [-x, z, -xi, zi]), [0, zA, 0, zI], ...media];
  const pos = [];
  const nS = 5;
  for (const [fx, zo, fxi, zi] of estaciones) {
    const xo = fx * xA;
    const xi = fxi * xA;
    const l = Math.hypot(xi - xo, zi - zo) || 1;
    const hacia = (t) => [xo + ((xi - xo) * t) / l, zo + ((zi - zo) * t) / l];
    // La parte de abajo se recoge fuerte: mira al piso y queda más oscura, y por eso se lee un quiebre.
    const c1 = hacia(Math.min(0.075, l * 0.5));
    const c2 = hacia(Math.min(0.14, l * 0.8));
    pos.push([xi, yTope, zi], [xo, yTope, zo], [xo, yQuiebre, zo], [c1[0], yBajo, c1[1]], [c2[0], yBajo + 0.012, c2[1]]);
  }
  const nE = estaciones.length;
  const caras = [];
  const pliegues = [];
  for (let e = 0; e < nE - 1; e++) {
    for (let s = 0; s < nS; s++) {
      const a = nS * e + s;
      const b = nS * e + ((s + 1) % nS);
      caras.push([a, b, b + nS, a + nS]);
    }
    for (const [s, filo] of [[1, 2], [2, 1.2], [3, 2]]) pliegues.push([nS * e + s, nS * (e + 1) + s, filo]);
  }
  caras.push([0, 1, 2, 3, 4], [nS * (nE - 1), nS * (nE - 1) + 1, nS * (nE - 1) + 2, nS * (nE - 1) + 3, nS * (nE - 1) + 4]);
  for (const e of [0, nE - 1]) for (let s = 0; s < nS; s++) pliegues.push([nS * e + s, nS * e + ((s + 1) % nS), 2]);
  const f = new Fundidor();
  volcarSinOrientar(pos, caras, pliegues, f, false, 1);
  registrar('bomper-tras', new THREE.Mesh(f.geometria(), mats.pintura(new THREE.Color(0x2a2d31))));
  // El caucho de la tapa: la raya oscura donde se pisa es lo que dice "escalón".
  const fG = new Fundidor();
  const y = yTope + 0.002;
  const x = 0.8 * xA;
  fG.cara([
    [-x, y, zI + 0.05],
    [-x, y, zA - 0.022],
    [x, y, zA - 0.022],
    [x, y, zI + 0.05],
  ]);
  agregar(fG, mats.de('goma'));
}

// ---- El estribo de la pick-up ----
// Un tubo ovalado de acero que corre bajo las puertas y se dobla hacia el chasis en las dos puntas, con
// sus patas. La tabla plana de antes, con las puntas al aire, se leía como una tabla suelta.
function ponerEstriboTubo({ d, g, j, agregar, mats }) {
  const { P, W } = g;
  const fT = new Fundidor();
  const fP = new Fundidor();
  const fG = new Fundidor();
  const y = P - 0.045;
  const ancho = 0.036;
  const alto = 0.024;
  for (const signo of [-1, 1]) {
    const x = W - 0.028;
    const z0 = j.zPd + 0.03;
    const z1 = d.puertaTras - 0.02;
    const camino = [
      [x - 0.17, y + 0.04, z0 - 0.01],
      [x - 0.1, y + 0.022, z0 + 0.005],
      [x - 0.035, y + 0.004, z0 + 0.05],
      [x, y, z0 + 0.15],
      [x, y, lerp(z0, z1, 0.5)],
      [x, y, z1 - 0.15],
      [x - 0.035, y + 0.004, z1 - 0.05],
      [x - 0.1, y + 0.022, z1 - 0.005],
      [x - 0.17, y + 0.04, z1 + 0.01],
    ];
    const lados = 8;
    const anillos = camino.map((p, i) => {
      const a = camino[Math.max(0, i - 1)];
      const b = camino[Math.min(camino.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const l = Math.hypot(dx, dz) || 1;
      // Lo ancho va en la horizontal, perpendicular al camino.
      const u = [dz / l, 0, -dx / l];
      const an = [];
      for (let k = 0; k < lados; k++) {
        const t = (k / lados) * Math.PI * 2;
        const c = Math.cos(t);
        const e = Math.sin(t);
        const nx = u[0] * c;
        const nz = u[2] * c;
        const px = p[0] + u[0] * c * ancho;
        const py = p[1] + e * alto;
        const pz = p[2] + u[2] * c * ancho;
        const ln = Math.hypot(nx, e, nz) || 1;
        an.push(fT.vertice(signo * px, py, pz, (signo * nx) / ln, e / ln, nz / ln));
      }
      return an;
    });
    for (let i = 0; i < anillos.length - 1; i++) {
      for (let k = 0; k < lados; k++) {
        const a = anillos[i][k];
        const b = anillos[i][(k + 1) % lados];
        const c = anillos[i + 1][(k + 1) % lados];
        const e = anillos[i + 1][k];
        if (signo > 0) fT.idx.push(a, b, c, a, c, e);
        else fT.idx.push(a, c, b, a, e, c);
      }
    }
    // Las patas: de la parte de abajo del tubo al estribo de lata.
    for (const z of [lerp(z0, z1, 0.27), lerp(z0, z1, 0.73)]) {
      const pata = caja([x - 0.07, y + 0.034, z], [0.15, 0.03, 0.05], 1);
      volcar(pata.pos, pata.caras, { pliegues: pata.pliegues, niveles: 1, destino: fP, espejar: signo < 0 });
    }
    // El caucho de arriba, por donde se pisa.
    const yG = y + alto + 0.001;
    const q = [
      [signo * (x - ancho * 0.72), yG, z0 + 0.2],
      [signo * (x - ancho * 0.72), yG, z1 - 0.2],
      [signo * (x + ancho * 0.72), yG, z1 - 0.2],
      [signo * (x + ancho * 0.72), yG, z0 + 0.2],
    ];
    fG.cara(signo > 0 ? q : [...q].reverse());
  }
  agregar(fT, mats.de('satinado'));
  agregar(fP, mats.de('plastico'));
  agregar(fG, mats.de('goma'));
}

// La manija de la compuerta de la pick-up: arriba de la mitad, y en una compuerta baja, contra el canto.
const yManijaCompuerta = (d, j) => {
  const yTope = j.yHombro(d.compuertaZ);
  return Math.min((yTope + j.yBisagraBaul) / 2 + 0.11, yTope - 0.055);
};

// ---- La placa ----
// La colombiana: el mismo amarillo claro con luz propia del carro de hoy (pedido de Joan,
// 15-oct-2026), con la palabra COLOMBIA abajo y un marco delgado. Detalle barato que da confianza.
// Casi no refleja el cuarto, y por eso lleva más luz propia. Con el reflejo entero, atrás salía lavada, como una placa
// vieja: fondo 248,241,201 y letras 131,131,131, contra 234,220,126 y 23,23,23 adelante. Ahora, atrás 230,214,118 y
// 30,30,30; adelante 226,208,99 y 6,6,6. El reflejo lo baja envMapIntensity, que three solo atiende con conEntorno: se lo pone carro-nuevo.js al final.
function ponerPlaca(destino, texto, c, n, mats) {
  const lienzoOk = typeof document !== 'undefined';
  let material;
  if (lienzoOk && texto) {
    const lienzo = document.createElement('canvas');
    lienzo.width = 512;
    lienzo.height = 240;
    const x = lienzo.getContext('2d');
    x.fillStyle = '#ffd83d';
    x.fillRect(0, 0, 512, 240);
    x.strokeStyle = '#111';
    x.lineWidth = 7;
    x.strokeRect(8, 8, 496, 224);
    x.fillStyle = '#111';
    x.font = 'bold 150px "Arial Narrow", Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(texto, 256, 112, 470);
    x.font = 'bold 24px Arial, sans-serif';
    x.fillText('C O L O M B I A', 256, 208);
    const t = new THREE.CanvasTexture(lienzo);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5, envMapIntensity: 0.12 });
  } else {
    material = new THREE.MeshStandardMaterial({ color: 0xffd83d, roughness: 0.5, emissive: 0xffd83d, emissiveIntensity: 0.5, envMapIntensity: 0.12 });
  }
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.15), material);
  placa.name = 'placa';
  const soporte = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.01), mats.de('negro'));
  const arriba = new THREE.Vector3(0, 1, 0);
  const nn = new THREE.Vector3(...n).normalize();
  const der = new THREE.Vector3().crossVectors(arriba, nn).normalize();
  const sup = new THREE.Vector3().crossVectors(nn, der);
  const base = new THREE.Matrix4().makeBasis(der, sup, nn);
  placa.quaternion.setFromRotationMatrix(base);
  soporte.quaternion.copy(placa.quaternion);
  placa.position.set(c[0] + nn.x * 0.016, c[1] + nn.y * 0.016, c[2] + nn.z * 0.016);
  soporte.position.set(c[0] + nn.x * 0.008, c[1] + nn.y * 0.008, c[2] + nn.z * 0.008);
  placa.userData.decorativo = true;
  soporte.userData.decorativo = true;
  destino.add(soporte, placa);
}

// El parche de una pieza por su id.
function parcheDe(parches, id) {
  for (const [, p] of parches) if (p.T.pieza === id && !p.T.nombre.endsWith('riel')) return p;
  return null;
}

// El punto de la lata que corresponde a dos coordenadas: se busca el triángulo que las contiene.
// `eje` es la coordenada que falta (0: x, a partir de y y z; 1: y, a partir de x y z; 2: z, a partir de x y y). Lo que se
// pega a la lata (la manija, la tapa de la gasolina) tiene que caer en la superficie subdividida:
// la de la jaula queda varios milímetros por fuera, y un adorno así se ve flotando o se hunde.
function enLata(p, eje, a, b, valeNormal) {
  const o = p.original;
  const n = p.nor;
  const idx = p.idx;
  const nV = o.length / 3;
  const ia = eje === 0 ? 1 : 0;
  const ib = eje === 2 ? 1 : 2;
  for (let t = 0; t < idx.length; t += 3) {
    const v0 = idx[t];
    const v1 = idx[t + 1];
    const v2 = idx[t + 2];
    if (v0 >= nV || v1 >= nV || v2 >= nV) continue;
    const ax = o[3 * v0 + ia];
    const ay = o[3 * v0 + ib];
    const bx = o[3 * v1 + ia];
    const by = o[3 * v1 + ib];
    const cx = o[3 * v2 + ia];
    const cy = o[3 * v2 + ib];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const l0 = ((by - cy) * (a - cx) + (cx - bx) * (b - cy)) / det;
    const l1 = ((cy - ay) * (a - cx) + (ax - cx) * (b - cy)) / det;
    const l2 = 1 - l0 - l1;
    if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
    const nor = [0, 1, 2].map((k) => l0 * n[3 * v0 + k] + l1 * n[3 * v1 + k] + l2 * n[3 * v2 + k]);
    if (valeNormal && !valeNormal(nor)) continue;
    return { p: [0, 1, 2].map((k) => l0 * o[3 * v0 + k] + l1 * o[3 * v1 + k] + l2 * o[3 * v2 + k]), n: nor };
  }
  return null;
}

// El punto del eje central de la lata más cercano a una altura, mirando adelante o atrás. Solo en
// la punta del carro: la pared de la cabina también mira hacia atrás, y sin el tope la placa de
// la camioneta caía adentro del platón.
function puntoCentral(parches, y, signoZ, zTope) {
  let mejor = null;
  let dMejor = Infinity;
  for (const [, p] of parches) {
    const o = p.original;
    const n = p.nor;
    for (let i = 0; i < o.length / 3; i++) {
      if (Math.abs(o[3 * i]) > 1e-4) continue;
      if (n[3 * i + 2] * signoZ < 0.35) continue;
      if (o[3 * i + 2] * signoZ < zTope * signoZ) continue;
      const dd = Math.abs(o[3 * i + 1] - y);
      if (dd < dMejor) {
        dMejor = dd;
        mejor = { c: [0, o[3 * i + 1], o[3 * i + 2]], n: [0, n[3 * i + 1], n[3 * i + 2]] };
      }
    }
  }
  return mejor;
}

// ---- Todo lo demás ----
export function ponerDetalles({ d, g, jaula: j, grupo, contenedor, parches, porId, mats, placa, registrar }) {
  const { W, B, H, P, R, ra } = g;
  const eW = W / 0.92;
  const camioneta = d.tipo === 'camioneta';
  const sedan = d.tipo === 'sedan';
  const suv = d.tipo === 'suv';
  const oscuro = new Fundidor();
  const agregar = (f, m, destino = grupo, decor = true) => {
    if (!f.n) return null;
    const malla = new THREE.Mesh(f.geometria(), m);
    malla.userData.decorativo = decor;
    destino.add(malla);
    return malla;
  };
  // Lo que amuebla la cabina para el dedo, aunque no se marque: por una rendija que se cuele (en la pick-up, la de
  // 1 cm entre el vidrio de atrás y el platón), el toque seguía de largo por sillas y tablero, y marcaba el capó, a 2 m
  // del dedo. Y con la puerta abierta, tocar la silla marcaba la puerta del otro lado.
  const mueble = (f, m) => {
    const malla = agregar(f, m, grupo, false);
    if (malla) malla.userData.relleno = true;
    return malla;
  };

  for (const [lado, signo] of [
    ['izq', -1],
    ['der', 1],
  ]) {
    ponerEspejo({ d, g, j, signo, lado, contenedor, mats, registrar });
    // La manija va en la franja alta de la puerta, cerca del borde de atrás. En la pick-up de cabina
    // adelantada lo de atrás es el costado de la cabina: no lleva manija.
    const manijas = [['puerta-del-', d.puertaMedia - 0.13]];
    if (!(d.adelantada && camioneta)) manijas.push(['puerta-tras-', d.puertaTras - 0.13]);
    for (const [nombre, zF] of manijas) {
      const id = nombre + lado;
      const yM = j.yHombro(zF) - 0.115;
      const q = enLata(parcheDe(parches, id), 0, yM, zF, (n) => Math.abs(n[0]) > 0.5);
      const xM = q ? Math.abs(q.p[0]) : j.xLado(zF, yM);
      // Cromada, con su cuenco oscuro detrás: una manija del color de la lata no se ve a la distancia
      // de la app, y un cliente busca la manija sin saberlo.
      const cuerpo = supercuerpo(0.0135, 0.014, 0.07, 0.75, 14, 8);
      cuerpo.translate(signo * (xM + 0.0085), yM, zF);
      const m1 = new THREE.Mesh(cuerpo, mats.de('cromo'));
      m1.userData.decorativo = true;
      const cuenco = supercuerpo(0.0035, 0.027, 0.086, 0.8, 18, 10);
      cuenco.translate(signo * (xM + 0.0002), yM - 0.002, zF);
      const m2 = new THREE.Mesh(cuenco, mats.de('junta'));
      m2.userData.decorativo = true;
      contenedor(id).add(m1, m2);
    }
    // Los pases de rueda por dentro: la bóveda oscura sobre la llanta y la pared del fondo. Sin
    // esto, por encima de la rueda se ve el piso a través del carro.
    for (const eje of [d.ejeDel, d.ejeTras]) {
      const rB = ra + 0.02;
      const tope = Math.acos(Math.max(-0.95, Math.min(0.95, (P + 0.02 - R) / rB)));
      // La bóveda arranca pegada al final del labio y sigue la lata, que no es recta: se recoge
      // hacia el estribo. Con un borde recto se salía por abajo como una aleta negra; y si
      // queda una rendija con el labio, por ella se asoma la bandeja del motor, en rosado.
      const xI = W - (camioneta ? g.anchoLlanta + 0.035 : 0.36);
      // En el platón la bóveda se recoge pegada a la llanta para no atravesar el piso.
      const rAdentro = camioneta ? Math.min(rB, R + 0.012) : rB;
      const xQuiebre = W - (camioneta ? 0.17 : 0.2);
      const anillo = [];
      for (let s = 0; s <= 16; s++) {
        const f = -tope + (2 * tope * s) / 16;
        const c = Math.cos(f);
        const e = Math.sin(f);
        const zB = eje + ra * e;
        const yB = R + ra * c;
        const xB = j.xLado(zB, yB) - 0.02;
        anillo.push({ c, e, xB });
      }
      for (let s = 0; s < 16; s++) {
        const a = anillo[s];
        const b = anillo[s + 1];
        const punto = (n, r, x) => [signo * x, R + r * n.c, eje + r * n.e];
        const q0 = [punto(a, rB, a.xB - 0.05), punto(a, ra, a.xB), punto(b, ra, b.xB), punto(b, rB, b.xB - 0.05)];
        const q1 = [punto(a, rAdentro, xQuiebre), punto(a, rB, a.xB - 0.05), punto(b, rB, b.xB - 0.05), punto(b, rAdentro, xQuiebre)];
        const q2 = [punto(a, rAdentro, xI), punto(a, rAdentro, xQuiebre), punto(b, rAdentro, xQuiebre), punto(b, rAdentro, xI)];
        oscuro.cara(signo > 0 ? q0 : [...q0].reverse());
        oscuro.cara(signo > 0 ? q1 : [...q1].reverse());
        oscuro.cara(signo > 0 ? q2 : [...q2].reverse());
      }
      const xPared = signo * xI;
      const pts = [];
      for (let s = 0; s <= 16; s++) {
        const f = -tope + (2 * tope * s) / 16;
        pts.push([xPared, R + rAdentro * Math.cos(f), eje + rAdentro * Math.sin(f)]);
      }
      oscuro.cara(signo > 0 ? pts : [...pts].reverse());
    }
  }

  // El piso de abajo: nadie lo mira, pero sin él se ve el otro lado del carro por debajo.
  const fSuelo = new Fundidor();
  const xS = W - 0.1;
  const yS = P + 0.05;
  const zS0 = d.ejeDel + ra + 0.02;
  const zS1 = d.ejeTras - ra - 0.02;
  const dosCaras = (f, q) => {
    f.cara(q);
    f.cara([...q].reverse());
  };
  dosCaras(fSuelo, [
    [-xS, yS, zS0],
    [-xS, yS, zS1],
    [xS, yS, zS1],
    [xS, yS, zS0],
  ]);
  // Entre las ruedas, de punta a punta, más angosto.
  const xS2 = W - g.anchoLlanta - 0.06;
  dosCaras(fSuelo, [
    [-xS2, yS, d.punta + 0.34],
    [-xS2, yS, d.cola - 0.3],
    [xS2, yS, d.cola - 0.3],
    [xS2, yS, d.punta + 0.34],
  ]);
  mueble(fSuelo, mats.de('suelo'));
  // La bóveda para el dedo: un toque en el hueco del pase no debe atravesar y marcar lo de adentro.
  const boveda = agregar(oscuro, mats.de('oscuro'), grupo, false);
  boveda.userData.relleno = true;

  // ---- La cabina por dentro ----
  // Silueta de sillas y tablero: tras un vidrio polarizado es lo único que se alcanza a ver, y
  // basta con que haya algo para que el carro no parezca hueco.
  // Cojín, respaldo y cabecera: los de cajas se leían por el vidrio como cubos apilados.
  const yPisoCabina = P + 0.1;
  const yCojin = Math.max(yPisoCabina + 0.24, B - 0.43);
  const escalaSilla = Math.max(0.82, Math.min(1, (H - 0.1 - yCojin) / 0.75));
  const silla = geometriaSilla(escalaSilla);
  const fSilla = new Fundidor();
  const ponerSilla = (x, z) => {
    const p = silla.attributes.position;
    const n = silla.attributes.normal;
    const base = fSilla.n;
    for (let i = 0; i < p.count; i++) fSilla.vertice(p.getX(i) + x, p.getY(i) + yCojin, p.getZ(i) + z, n.getX(i), n.getY(i), n.getZ(i));
    const q = silla.index.array;
    for (let i = 0; i < q.length; i++) fSilla.idx.push(q[i] + base);
  };
  const xSilla = Math.min(0.38, W * 0.42);
  const zSilla = d.adelantada ? d.ejeDel + 0.42 : lerp(d.puertaDel, d.puertaMedia, 0.72);
  const zAtras = lerp(d.puertaMedia, Math.min(d.puertaTras, camioneta ? d.cabinaTras - 0.1 : d.puertaTras), 0.68);
  for (const signoS of [-1, 1]) {
    ponerSilla(signoS * xSilla, zSilla);
    if (zAtras > zSilla + 0.55) ponerSilla(signoS * xSilla, zAtras);
  }
  mueble(fSilla, mats.de('silla'));
  const fTablero = new Fundidor();
  const ct = caja([0, B - 0.09, d.capoTras + 0.28], [2 * W * 0.82, 0.22, 0.56], 1.2, (p, sx, sy, sz) => {
    const q = [...p];
    if (sy > 0 && sz < 0) q[2] += 0.1;
    return q;
  });
  volcar(ct.pos, ct.caras, { pliegues: ct.pliegues, niveles: 2, destino: fTablero });
  // El timón, del lado del conductor.
  {
    const xV = -W * 0.43;
    const zV = d.capoTras + (d.adelantada ? 0.42 : 0.62);
    const yV = B - 0.03;
    const fv = new Fundidor();
    const radio = 0.185;
    const seg = 20;
    const giro = 0.42;
    const anillo = (a) => {
      const p = [];
      for (let k = 0; k < 6; k++) {
        const t = (k / 6) * Math.PI * 2;
        const r = radio + Math.cos(t) * 0.014;
        const e = Math.sin(t) * 0.014;
        const y = Math.cos(a) * r;
        const x = Math.sin(a) * r;
        p.push([xV + x, yV + y * Math.cos(giro) + e * Math.sin(giro), zV - y * Math.sin(giro) + e * Math.cos(giro)]);
      }
      return p;
    };
    let prev = anillo(0);
    for (let s = 1; s <= seg; s++) {
      const act = anillo((s / seg) * Math.PI * 2);
      for (let k = 0; k < 6; k++) fv.cara([prev[k], act[k], act[(k + 1) % 6], prev[(k + 1) % 6]]);
      prev = act;
    }
    mueble(fv, mats.de('tablero'));
  }
  // El retrovisor de adentro: se ve desde lejos como un puntico contra el parabrisas, y sin él
  // el vidrio se ve vacío.
  {
    const cr = caja([0, H - 0.135, d.parabrisasAlto + 0.13], [0.21, 0.058, 0.025], 1);
    volcar(cr.pos, cr.caras, { pliegues: cr.pliegues, niveles: 1, destino: fTablero });
  }
  mueble(fTablero, mats.de('tablero'));

  // ---- La bandeja de atrás ----
  // Separa la cabina del baúl. Sin ella, por el vidrio de atrás se ve el piso del baúl, que es
  // de tono claro, y se lee como una mancha blanca en el vidrio. En hatchback y SUV se levanta
  // con la compuerta, como la de verdad.
  if (!camioneta) {
    const fB = new Fundidor();
    const yB = B + 0.015;
    const xB = W * 0.84;
    const z0 = sedan ? d.techoTras - 0.05 : d.puertaTras + 0.1;
    const z1 = sedan ? d.vidrioTras + 0.02 : d.compuertaZ - 0.02;
    fB.cara([
      [-xB, yB, z0],
      [-xB, yB, z1],
      [xB, yB, z1],
      [xB, yB, z0],
    ]);
    agregar(fB, mats.de('tablero'), sedan ? grupo : contenedor('baul'));
  }

  // ---- Las paredes de la cabina detrás de las puertas ----
  // Alrededor del arco de atrás no hay forro, y por la ventana se veía, del color del carro, el marco
  // de la puerta del otro lado: rayas rojas detrás de las sillas. En un carro de verdad ahí va plástico.
  {
    const f = new Fundidor();
    const fBanca = new Fundidor();
    const z0 = j.filas[j.I.pt].s[0][2] - 0.04;
    const z1 = camioneta ? d.cabinaTras - 0.01 : sedan ? d.techoTras + 0.3 : d.compuertaZ - 0.14;
    const y0 = Math.max(P + 0.08, 2 * R + 0.07);
    const y1 = B + 0.02;
    const x = W - 0.135;
    for (const signo of [-1, 1]) {
      const q = [
        [signo * x, y0, z0],
        [signo * x, y1, z0],
        [signo * x, y1, z1],
        [signo * x, y0, z1],
      ];
      dosCaras(f, q);
    }
    // Y en los de compuerta, de la cintura al techo: ahí no va forro, que se salía por el pilar (jaula.js), y sin
    // tapa se vería el otro lado del carro por la ventana de atrás y desde la zona de carga. Es plástico oscuro,
    // como en el carro de verdad, y no pieza: por afuera se ve como vidrio polarizado.
    if (!camioneta && !sedan) {
      const yT = H - 0.12;
      const xT = W * 0.74;
      // Arriba termina antes: el vidrio de atrás se viene hacia adelante, y recta se asomaba en su esquina.
      const zT1 = Math.min(z1, d.techoTras - 0.08);
      for (const signo of [-1, 1]) {
        const q = [
          [signo * x, y1, z0],
          [signo * xT, yT, z0],
          [signo * xT, yT, zT1],
          [signo * x, y1, z1],
        ];
        dosCaras(f, q);
      }
      // El espaldar de la banca de atrás, de lado a lado: es lo que cierra la zona de carga. Sin él, entre las dos
      // sillas se ve la cabina entera, y al fondo los retazos del tapiz de las puertas, por debajo de la pared.
      const zB = (zAtras > zSilla + 0.55 ? zAtras : zSilla) + 0.22 * escalaSilla;
      const yB0 = Math.min(d.cintura - 0.36, y0);
      const yB1 = yCojin + 0.5 * escalaSilla;
      const xB1 = W * 0.76;
      const qb = [
        [-x, yB0, zB],
        [-x, B, zB],
        [x, B, zB],
        [x, yB0, zB],
      ];
      const qa = [
        [-x, B, zB],
        [-xB1, yB1, zB],
        [xB1, yB1, zB],
        [x, B, zB],
      ];
      fBanca.cara([...qb].reverse());
      fBanca.cara([...qa].reverse());
    }
    mueble(f, mats.de('suelo'));
    // Más oscuro que las sillas: un panel plano del mismo tono se comía los espaldares.
    mueble(fBanca, mats.de('tablero'));
  }

  // ---- Limpiabrisas ----
  // Dos tiras sobre el borde de abajo del parabrisas. Cuestan cuatro triángulos, y cambian el
  // frente más de lo que uno creería.
  {
    const fL = new Fundidor();
    const I = j.I;
    const f0 = j.filas[I.cowl].t;
    const f1 = j.filas[I.pb1].t;
    const puntoV = (x, a) => {
      // De las columnas 0 a 3 de la fila de la base, interpolando por x.
      let q = 0;
      for (; q < 2; q++) if (Math.abs(x) <= f0[q + 1][0]) break;
      const t = Math.min(1, (Math.abs(x) - f0[q][0]) / (f0[q + 1][0] - f0[q][0]));
      const b0 = [lerp(f0[q][0], f0[q + 1][0], t), lerp(f0[q][1], f0[q + 1][1], t), lerp(f0[q][2], f0[q + 1][2], t)];
      const b1 = [lerp(f1[q][0], f1[q + 1][0], t), lerp(f1[q][1], f1[q + 1][1], t), lerp(f1[q][2], f1[q + 1][2], t)];
      return [Math.sign(x) * lerp(b0[0], b1[0], a), lerp(b0[1], b1[1], a) + 0.008, lerp(b0[2], b1[2], a)];
    };
    const tira = (x0, x1, a0, a1) => {
      const n = 6;
      for (let s = 0; s < n; s++) {
        const u0 = s / n;
        const u1 = (s + 1) / n;
        const p0 = puntoV(lerp(x0, x1, u0), lerp(a0, a1, u0));
        const p1 = puntoV(lerp(x0, x1, u1), lerp(a0, a1, u1));
        const quad = [
          [p0[0], p0[1] + 0.006, p0[2] + 0.006],
          [p1[0], p1[1] + 0.006, p1[2] + 0.006],
          [p1[0], p1[1] - 0.004, p1[2] - 0.006],
          [p0[0], p0[1] - 0.004, p0[2] - 0.006],
        ];
        fL.cara(quad);
        fL.cara([...quad].reverse());
      }
    };
    tira(-0.72 * eW, 0.0, 0.14, 0.2);
    tira(0.06, 0.62 * eW, 0.19, 0.11);
    agregar(fL, mats.de('goma'));
    if (d.tipo === 'hatchback' || suv) {
      // El limpiabrisas de atrás viaja con la compuerta, y dice "hatchback" desde lejos.
      const fT = new Fundidor();
      const b0 = j.filas[I.bt].t;
      const b1 = j.filas[I.e1].t;
      const n = 6;
      for (let s = 0; s < n; s++) {
        const u0 = s / n;
        const u1 = (s + 1) / n;
        const punto = (u) => {
          const x = 0.46 * eW * u;
          const f = Math.min(1, x / b0[2][0]);
          const q0 = [lerp(b0[0][0], b0[2][0], f), lerp(b0[0][1], b0[2][1], f * f), lerp(b0[0][2], b0[2][2], f * f)];
          const q1 = [lerp(b1[0][0], b1[2][0], f), lerp(b1[0][1], b1[2][1], f * f), lerp(b1[0][2], b1[2][2], f * f)];
          const a = 0.1 + 0.5 * u;
          return [x, lerp(q0[1], q1[1], a) + 0.012, lerp(q0[2], q1[2], a) + 0.012];
        };
        const p0 = punto(u0);
        const p1 = punto(u1);
        const quad = [
          [p0[0], p0[1] + 0.007, p0[2] - 0.003],
          [p1[0], p1[1] + 0.007, p1[2] - 0.003],
          [p1[0], p1[1] - 0.007, p1[2] + 0.003],
          [p0[0], p0[1] - 0.007, p0[2] + 0.003],
        ];
        fT.cara(quad);
        fT.cara([...quad].reverse());
      }
      agregar(fT, mats.de('goma'), contenedor('baul'));
    }
  }

  // ---- Placas ----
  const pd = puntoCentral(parches, P + (g.yCapoDel - P) * 0.46, -1, d.punta + 0.5);
  if (pd) ponerPlaca(grupo, placa, pd.c, pd.n, mats);
  // En la compuerta, siempre debajo de la manija: en una baja no caben las dos donde caben en una Hilux, y la manija
  // tapaba el número.
  const yPT = camioneta ? Math.min(j.yBisagraBaul + 0.2, yManijaCompuerta(d, j) - 0.117) : j.C[0][2][1] + (sedan ? 0.1 : suv ? 0.12 : 0.1);
  const pt = puntoCentral(parches, yPT, 1, d.cola - 0.5);
  if (pt) ponerPlaca(contenedor('baul'), placa, pt.c, pt.n, mats);

  // ---- Sombras de contacto ----
  // La sombra general la pone el visor; esta es la que aterriza el carro: sin ella, las llantas
  // flotan a un milímetro del piso.
  if (typeof document !== 'undefined') {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 128;
    const c = lienzo.getContext('2d');
    const gr = c.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.95)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
    const mapa = new THREE.CanvasTexture(lienzo);
    const mSombra = new THREE.MeshBasicMaterial({ map: mapa, transparent: true, depthWrite: false, color: 0xffffff });
    const plano = (ancho, largo, x, y, z) => {
      const go = new THREE.PlaneGeometry(ancho, largo);
      go.rotateX(-Math.PI / 2);
      const s = new THREE.Mesh(go, mSombra);
      s.position.set(x, y, z);
      s.name = 'sombra';
      s.userData.decorativo = true;
      s.userData.relleno = true;
      grupo.add(s);
    };
    plano(2 * W * 1.06, d.largo * 1.02, 0, 0.012, (d.punta + d.cola) / 2);
    for (const signo of [-1, 1]) {
      for (const eje of [d.ejeDel, d.ejeTras]) plano(g.anchoLlanta * 1.9, R * 1.5, signo * g.ruedaX, 0.014, eje);
    }
  }

  // ---- Las barras de la parrilla ----
  // Es lo que cambia la cara de un carro a otro sin cambiarle la lata, y tienen cuerpo de verdad:
  // agarran luz por arriba y dejan sombra en la malla de atrás.
  {
    const barras = d.adelantada ? [] : { sedan: [[0.36, 0.0075], [0.68, 0.0075]], hatchback: [], suv: [[0.25, 0.012], [0.5, 0.012], [0.75, 0.012]], camioneta: [[0.17, 0.018], [0.39, 0.018], [0.61, 0.018], [0.83, 0.018]] }[d.tipo];
    const f = new Fundidor();
    const fila0 = j.filas[0].t;
    for (const [v, alto] of barras) {
      for (const signo of [-1, 1]) {
        for (let c = 0; c < 3; c++) {
          const ini = [lerp(fila0[c][0], j.F[c][1][0], v), lerp(fila0[c][1], j.F[c][1][1], v), lerp(fila0[c][2], j.F[c][1][2], v)];
          const fin = [lerp(fila0[c + 1][0], j.F[c + 1][1][0], v), lerp(fila0[c + 1][1], j.F[c + 1][1][1], v), lerp(fila0[c + 1][2], j.F[c + 1][1][2], v)];
          const P = (q, dy, dz) => [signo * q[0], q[1] + dy, q[2] + 0.012 + dz];
          const caras = [
            [P(ini, alto, 0.012), P(ini, alto * 0.45, 0), P(fin, alto * 0.45, 0), P(fin, alto, 0.012)],
            [P(ini, alto * 0.45, 0), P(ini, -alto * 0.45, 0), P(fin, -alto * 0.45, 0), P(fin, alto * 0.45, 0)],
            [P(ini, -alto * 0.45, 0), P(ini, -alto, 0.012), P(fin, -alto, 0.012), P(fin, -alto * 0.45, 0)],
          ];
          // La misma normal de punta a punta de la barra: la de cada tramo, que siguen la curva de la nariz,
          // daba un reflejo distinto en cada uno, y de frente el cromo salía a pedazos.
          const normales = [[0, 0.8, -0.6], [0, 0, -1], [0, -0.8, -0.6]];
          caras.forEach((q, n) => {
            const b = f.n;
            const orden = signo > 0 ? [...q].reverse() : q;
            for (const v of orden) f.vertice(v[0], v[1], v[2], ...normales[n]);
            f.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
          });
        }
      }
    }
    agregar(f, mats.de(suv ? 'satinado' : 'cromo'));
  }

  // ---- Exploradoras ----
  // El de ciudad no lleva: la mayoría de los que ruedan son de la versión de entrada, y dos faroles a los
  // lados de una boca grande eran parte de lo que hacía que todos tuvieran la misma cara.
  if (!d.adelantada && d.tipo !== 'hatchback') {
    const fAro = new Fundidor();
    const fLente = new Fundidor();
    for (const signo of [-1, 1]) {
      const a = j.F[3][3];
      const b = j.F[5][3];
      const e = j.F[3][4];
      const h = j.F[5][4];
      const cx = (a[0] + b[0] + e[0] + h[0]) / 4;
      const cy = (a[1] + b[1] + e[1] + h[1]) / 4;
      const cz = (a[2] + b[2] + e[2] + h[2]) / 4;
      const r = Math.min(0.03, Math.abs(a[1] - e[1]) * 0.27);
      const n = [signo * 0.42, 0.02, -0.9];
      // Redonda y chica en el sedán, grande en la pick-up, y rectangular en el campero.
      exploradora(fAro, fLente, [signo * cx, cy, cz + 0.016], n, camioneta ? r * 1.1 : suv ? r * 0.82 : r, suv ? 1.5 : 1);
    }
    agregar(fAro, mats.de('bisel'));
    agregar(fLente, mats.de('lenteExploradora'));
  }

  // ---- Lo que solo lleva una camioneta ----
  if (camioneta) {
    // Manija de la compuerta y estribos de tubo: dos señas que dicen "de trabajo".
    const f = new Fundidor();
    const cm = caja([0, yManijaCompuerta(d, j), d.compuertaZ + 0.012], [0.24, 0.05, 0.022], 1);
    volcar(cm.pos, cm.caras, { pliegues: cm.pliegues, niveles: 1, destino: f });
    const manija = new THREE.Mesh(f.geometria(), mats.de('negro'));
    manija.userData.decorativo = true;
    contenedor('baul').add(manija);
    ponerBomperAcero({ d, g, j, mats, registrar, agregar });
    // Una de cabina adelantada no lleva: la puerta queda a un paso del piso.
    if (!d.adelantada) ponerEstriboTubo({ d, g, j, agregar, mats });
  }

  // ---- La tapa de la gasolina ----
  // Un rectángulo de esquinas redondas, en el costado izquierdo, con su línea siguiendo la lata de
  // verdad. No es pieza del catálogo: es de esos detalles que nadie nota hasta que faltan.
  {
    const costado = parcheDe(parches, 'costado-izq');
    if (costado) {
      const zT = d.ejeTras + (camioneta ? -0.02 : -0.03);
      const yT = j.yHombro(zT) - (camioneta ? 0.15 : 0.125);
      const a = camioneta ? 0.07 : 0.062;
      const grosor = 0.0036;
      const f = new Fundidor();
      const seg = 28;
      const redondo = (t, r) => {
        // Una superelipse: esquinas limpias y lados rectos.
        const c = Math.cos(t);
        const e = Math.sin(t);
        const k = r / Math.pow(Math.pow(Math.abs(c), 6) + Math.pow(Math.abs(e), 6), 1 / 6);
        const y = yT + e * k;
        const z = zT + c * k;
        const q = enLata(costado, 0, y, z, (n) => n[0] < -0.3);
        return q ? [q.p[0] - 0.0012, y, z] : null;
      };
      for (let s = 0; s < seg; s++) {
        const t0 = (s / seg) * Math.PI * 2;
        const t1 = ((s + 1) / seg) * Math.PI * 2;
        const q = [redondo(t0, a), redondo(t1, a), redondo(t1, a + grosor), redondo(t0, a + grosor)];
        if (q.some((x) => !x)) continue;
        f.cara(q);
        f.cara([...q].reverse());
      }
      agregar(f, mats.de('junta'));
    }
  }

  // ---- Tercer stop ----
  // Una tirita roja arriba del vidrio de atrás. Desde atrás es la seña de que hay un carro de
  // verdad, y no cuesta nada.
  if (d.tipo !== 'camioneta') {
    const f = new Fundidor();
    const I = j.I;
    const a = j.filas[sedan ? I.c0 : I.c4].t;
    const b = j.filas[sedan ? I.c1 : I.e1].t;
    const ancho = W * 0.26;
    const paso = 6;
    const punto = (u, h) => {
      const x = lerp(-ancho, ancho, u);
      const f2 = Math.pow(Math.abs(x) / a[3][0], 2);
      const v = sedan ? 0.13 : 0.1;
      const y0 = lerp(a[0][1], a[3][1], f2);
      const y1 = lerp(b[0][1], b[3][1], f2);
      const z0 = lerp(a[0][2], a[3][2], f2);
      const z1 = lerp(b[0][2], b[3][2], f2);
      return [x, lerp(y0, y1, v + h) + 0.004, lerp(z0, z1, v + h) + 0.004];
    };
    for (let s = 0; s < paso; s++) {
      const u0 = s / paso;
      const u1 = (s + 1) / paso;
      f.cara([punto(u0, 0.05), punto(u1, 0.05), punto(u1, 0), punto(u0, 0)]);
    }
    agregar(f, mats.de('calaveraLed'), sedan ? grupo : contenedor('baul'));
  }

  // ---- La cola: lo que le quita lo de pared lisa ----
  if (!camioneta) {
    const bomper = parcheDe(parches, 'bomper-tras');
    const tapa = parcheDe(parches, 'baul');
    // Una tira que sigue la lata, de x0 a x1, a una altura: la moldura, el filete.
    const tira = (f, p, y0, alto, x0, x1, n = 10, salir = 0.0016) => {
      const punto = (x, y) => {
        const q = enLata(p, 2, x, y, (m) => m[2] > 0.25);
        return q ? [q.p[0] + q.n[0] * salir, q.p[1] + q.n[1] * salir, q.p[2] + q.n[2] * salir] : null;
      };
      for (const signo of [-1, 1]) {
        for (let s = 0; s < n; s++) {
          const xa = signo * lerp(x0, x1, s / n);
          const xb = signo * lerp(x0, x1, (s + 1) / n);
          const q = [punto(xa, y0 + alto / 2), punto(xa, y0 - alto / 2), punto(xb, y0 - alto / 2), punto(xb, y0 + alto / 2)];
          if (q.some((x) => !x)) continue;
          f.cara(signo > 0 ? q : [...q].reverse());
        }
      }
    };
    if (bomper) {
      // El catadióptrico: un lente en su marco oscuro, un poco hundido. Y al lado, la línea baja del
      // bómper. Los dos juntos parten la pared en dos.
      const yR = lerp(j.C[0][3][1], j.C[0][4][1], 0.62);
      const fMarco = new Fundidor();
      const fLente = new Fundidor();
      tira(fMarco, bomper, yR, 0.04, W * 0.6, W * 0.83, 6, 0.0012);
      tira(fLente, bomper, yR, 0.026, W * 0.61, W * 0.82, 6, 0.0024);
      agregar(fMarco, mats.de('bisel'));
      agregar(fLente, mats.de('catadioptrico'));
      const fLinea = new Fundidor();
      tira(fLinea, bomper, yR, 0.012, 0.0, W * 0.56, 8, 0.0012);
      agregar(fLinea, mats.de(sedan ? 'cromo' : 'bisel'));
    }
    if (tapa) {
      // El filete cromado sobre la placa, de lámpara a lámpara. Viaja con la tapa.
      const yPF = j.C[0][2][1] + (sedan ? 0.205 : suv ? 0.235 : 0.215);
      const f = new Fundidor();
      tira(f, tapa, yPF, 0.012, 0.0, j.C[3][1][0] - 0.02, 8, 0.0014);
      agregar(f, mats.de('cromo'), contenedor('baul'));
    }
    // El tubo de escape: un círculo chico y oscuro por dentro, abajo a la izquierda. Sin él, la cola
    // parece de un carro eléctrico de juguete.
    {
      const r = suv ? 0.042 : 0.036;
      const x = -W * 0.58;
      const y = P + (suv ? 0.075 : 0.05);
      const z0 = d.cola - 0.17;
      const z1 = d.cola - 0.025;
      const fTubo = new Fundidor();
      fTubo.revolver(
        [
          [0, r],
          [0.015, r * 0.98],
          [z1 - z0, r * 0.94],
        ].reverse(),
        14,
        50,
      );
      const go = fTubo.geometria();
      go.rotateY(-Math.PI / 2);
      go.translate(x, y, z0);
      const malla = new THREE.Mesh(go, mats.de('cromo'));
      malla.material = mats.de('cromoAmbos');
      malla.userData.decorativo = true;
      grupo.add(malla);
      const fBoca = new Fundidor();
      const pts = [];
      for (let s = 0; s < 14; s++) pts.push([x + r * 0.9 * Math.cos((s / 14) * Math.PI * 2), y + r * 0.9 * Math.sin((s / 14) * Math.PI * 2), z1 - 0.02]);
      fBoca.cara(pts);
      agregar(fBoca, mats.de('oscuro'));
    }
  }

  // ---- Antena ----
  if (!camioneta) {
    const f = new Fundidor();
    const zA = d.techoTras - 0.16;
    const q = j.filas[sedan ? j.I.ptA : j.I.c1].t[0][1];
    const yA = q + 0.002;
    const a = caja([0, yA + 0.025, zA], [0.045, 0.05, 0.17], 0.8, (p, sx, sy, sz) => {
      const c = [...p];
      if (sy > 0) {
        c[0] *= 0.25;
        if (sz < 0) c[2] += 0.09;
        else c[2] += 0.0;
      }
      return c;
    });
    volcar(a.pos, a.caras, { pliegues: a.pliegues, niveles: 2, destino: f });
    agregar(f, mats.de('negro'));
  }

  // ---- Alerón sobre el vidrio de la compuerta ----
  // Se tiñe con la compuerta, como en el carro. Es lo que cierra la silueta de un hatchback:
  // sin él, el techo se acaba en seco.
  if (d.tipo === 'hatchback' || suv) {
    const baul = porId.get('baul');
    const fin = j.filas[j.finTecho].t;
    const f = new Fundidor();
    const xCol = [0, fin[1][0], fin[2][0], fin[3][0] * 0.99];
    const lar = suv ? 0.12 : 0.15;
    const seccion = (x, yy, zz, dz = 0) => [
      [x, yy + 0.002, zz - 0.09],
      [x, yy + 0.008, zz + 0.02],
      [x, yy - 0.012, zz + lar + dz],
      [x, yy - 0.05, zz + lar - 0.02 + dz],
      [x, yy - 0.05, zz + 0.0],
    ];
    const pos = [];
    const secs = [];
    for (let s = -3; s <= 3; s++) {
      const i = Math.abs(s);
      const sg = s < 0 ? -1 : 1;
      const base = seccion(sg * xCol[i], fin[i][1], fin[i][2], -0.012 * i);
      secs.push(pos.length);
      pos.push(...base);
    }
    const caras = [];
    for (let s = 0; s < 6; s++) {
      for (let k = 0; k < 5; k++) {
        const a = secs[s] + k;
        const b = secs[s] + ((k + 1) % 5);
        const c = secs[s + 1] + ((k + 1) % 5);
        const e = secs[s + 1] + k;
        caras.push([a, b, c, e]);
      }
    }
    caras.push([secs[0], secs[0] + 1, secs[0] + 2, secs[0] + 3], [secs[6], secs[6] + 1, secs[6] + 2, secs[6] + 3]);
    const pli = [];
    for (let s = 0; s < 6; s++) pli.push([secs[s] + 2, secs[s + 1] + 2, 1.5]);
    volcarSinOrientar(pos, caras, pli, f);
    const al = new THREE.Mesh(f.geometria(), baul.material);
    al.name = 'aleron';
    // Se tiñe con la compuerta y es de ella. De adorno, el dedo seguía de largo por debajo de su ala y
    // marcaba el vano de atrás, que ni se ve.
    al.userData.piezaId = 'baul';
    contenedor('baul').add(al);
  }

  // ---- Barras del techo de la SUV ----
  // Dos rieles sobre el techo, con un pie largo en cada punta y dos patas en medio, y debajo la sombra que los
  // asienta en la lata. Van 7 cm por dentro de la orilla del techo, donde van de verdad: ahí el techo todavía
  // no ha caído, y la barra casi no se asoma por encima de la silueta. En la orilla, cinco centímetros más
  // abajo que la cumbre, de frente sobresalían enteras contra el fondo y se leían como dos cachitos.
  // La altura sale de la superficie de verdad: la de la jaula queda 2 cm por encima de la lata subdividida. Las
  // de una van no: esas no llevan.
  if (suv && !d.adelantada) {
    const techos = [...parches.values()].filter((p) => p.T.pieza === 'techo');
    const alturaLata = (x, z) => {
      for (const p of techos) {
        const q = enLata(p, 1, x, z, (n) => n[1] > 0.2);
        if (q) return q.p[1];
      }
      return null;
    };
    const fB = new Fundidor();
    const fPie = new Fundidor();
    const fSombra = new Fundidor();
    const lados = 8;
    const ancho = 0.021;
    const alto = 0.0125;
    const aire = 0.021;
    const largoPie = 0.17;
    const z0 = j.filas[j.I.head].t[3][2] + 0.1;
    const z1 = d.techoTras - 0.1;
    const x = j.filas[j.I.pmB].t[3][0] - 0.07;
    const n = 18;
    const suave = (u) => {
      const c = Math.max(0, Math.min(1, u));
      return c * c * (3 - 2 * c);
    };
    // Las estaciones del riel: tupidas en las puntas, que es donde se curva.
    const estaciones = [];
    let ultimaY = H - 0.055;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const z = lerp(z0, z1, u);
      const yL = alturaLata(x, z) ?? ultimaY;
      ultimaY = yL;
      const hasta = Math.min(z - z0, z1 - z);
      estaciones.push({ z, yL, y: yL + (aire + alto) * suave(hasta / largoPie) - 0.002 * (1 - suave(hasta / largoPie)), pie: 1 - suave(hasta / largoPie) });
    }
    for (const signo of [-1, 1]) {
      const anillo = (f, { z, y, pie }) => {
        const an = [];
        // El pie es más ancho que el riel: de frente se ve una base, no una punta.
        const a0 = ancho * (1 + 0.45 * pie);
        for (let k = 0; k < lados; k++) {
          const a = (k / lados) * Math.PI * 2 + Math.PI / lados;
          const c = Math.cos(a);
          const e = Math.sin(a);
          // Una superelipse, para que tenga caras y no sea un tubo: agarra el reflejo arriba.
          const q = Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(e), 4), -0.25);
          const l = Math.hypot(c / a0, e / alto) || 1;
          an.push(f.vertice(signo * (x + c * q * a0), y + e * q * alto, z, (signo * c) / a0 / l, e / alto / l, 0));
        }
        return an;
      };
      for (let i = 0; i < n; i++) {
        // Las puntas, de plástico negro: es lo único del riel que se ve de frente y de atrás, y metálicas brillaban
        // contra el fondo oscuro como dos cachitos. El tramo de en medio, satinado, se ve de lado.
        const f = estaciones[i].pie > 0.3 || estaciones[i + 1].pie > 0.3 ? fPie : fB;
        const an0 = anillo(f, estaciones[i]);
        const an1 = anillo(f, estaciones[i + 1]);
        for (let k = 0; k < lados; k++) {
          const a = an0[k];
          const b2 = an0[(k + 1) % lados];
          const c = an1[(k + 1) % lados];
          const e = an1[k];
          if (signo > 0) f.idx.push(a, e, c, a, c, b2);
          else f.idx.push(a, c, e, a, b2, c);
        }
      }
      // Las patas de en medio, y las de las puntas que abrazan el pie: de la lata al medio del riel. Más anchas
      // que el riel, y del mismo plástico negro: son lo que dice que la barra se apoya.
      for (const u of [0.36, 0.68]) {
        const m = estaciones[Math.round(u * n)];
        const pata = caja([x, (m.yL + m.y) / 2 - 0.004, m.z], [0.05, m.y - m.yL + 0.012, 0.075], 1);
        volcar(pata.pos, pata.caras, { pliegues: pata.pliegues, niveles: 1, destino: fPie, espejar: signo < 0 });
      }
      // La sombra en el techo: una tira oscura debajo del riel, de punta a punta. Sin sombras de verdad, una barra
      // sin esto flota aunque toque.
      for (let i = 0; i < n; i++) {
        const a = estaciones[i];
        const b2 = estaciones[i + 1];
        const m = 0.03;
        const q = [
          [signo * (x - m), a.yL + 0.0015, a.z],
          [signo * (x + m), a.yL + 0.0015, a.z],
          [signo * (x + m), b2.yL + 0.0015, b2.z],
          [signo * (x - m), b2.yL + 0.0015, b2.z],
        ];
        fSombra.cara(signo > 0 ? [...q].reverse() : q);
      }
    }
    agregar(fSombra, mats.de('junta'));
    agregar(fB, mats.de('satinado'));
    agregar(fPie, mats.de('plastico'));
  }

}

