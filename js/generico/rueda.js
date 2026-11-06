// La rueda: llanta con hombro redondeado, rin de aleación con rayos dobles, cubo con tuercas,
// disco de freno y mordaza detrás. Es lo primero que se mira de un carro después de la cara, y lo
// que más delataba al juguete. El rin es el que ganó en el jurado (el del prototipo A): el único
// que de cerca parece de fábrica.
//
// Se arma una sola vez por carro y las cuatro ruedas se funden en una malla por material (el lado
// izquierdo es la misma girada 180°): 6 llamadas de dibujo en vez de 24.
import * as THREE from 'three';

// Acumula triángulos con su normal, para fundir muchas partes en una sola malla por material.
export class Fundidor {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.idx = [];
    this.uv = null;
  }

  get n() {
    return this.pos.length / 3;
  }

  vertice(x, y, z, nx, ny, nz) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    return this.n - 1;
  }

  // Un polígono convexo plano con normal de cara, cada uno con sus vértices: arista dura.
  cara(puntos) {
    // La normal con todos los vértices (Newell). Con los tres primeros, una cara con una arista de largo cero
    // salía con normal (0,0,0): en las 1.103 líneas del catálogo había de esas en el vano del motor y en las
    // puertas. Y una cara sin área no se dibuja: son triángulos que nadie ve.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < puntos.length; i++) {
      const p = puntos[i];
      const q = puntos[(i + 1) % puntos.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = this.n;
    for (const p of puntos) this.vertice(p[0], p[1], p[2], nx, ny, nz);
    for (let i = 1; i < puntos.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  // Revuelve un perfil [a, r] alrededor del eje X. La normal sale de (dr, -da): recorrer el
  // perfil de la ceja de afuera hacia arriba y luego hacia -a la deja mirando hacia afuera.
  // Si el perfil dobla más de `quiebre` grados se duplica el anillo y queda arista dura.
  revolver(perfil, n, quiebre = 40, desde = 0, hasta = Math.PI * 2) {
    const seg = [];
    for (let i = 0; i < perfil.length - 1; i++) {
      const da = perfil[i + 1][0] - perfil[i][0];
      const dr = perfil[i + 1][1] - perfil[i][1];
      const l = Math.hypot(da, dr) || 1;
      seg.push([dr / l, -da / l]);
    }
    const anillos = [];
    const cosQ = Math.cos((quiebre * Math.PI) / 180);
    for (let i = 0; i < perfil.length; i++) {
      const izq = seg[Math.max(0, i - 1)];
      const der = seg[Math.min(seg.length - 1, i)];
      const cos = izq[0] * der[0] + izq[1] * der[1];
      if (cos < cosQ && i > 0 && i < perfil.length - 1) {
        anillos.push({ p: perfil[i], n: izq, fin: true });
        anillos.push({ p: perfil[i], n: der, fin: false });
      } else {
        const na = izq[0] + der[0];
        const nr = izq[1] + der[1];
        const l = Math.hypot(na, nr) || 1;
        anillos.push({ p: perfil[i], n: [na / l, nr / l], fin: false });
      }
    }
    const base = this.n;
    for (const an of anillos) {
      for (let s = 0; s <= n; s++) {
        const f = desde + ((hasta - desde) * s) / n;
        const c = Math.cos(f);
        const d = Math.sin(f);
        this.vertice(an.p[0], an.p[1] * c, an.p[1] * d, an.n[0], an.n[1] * c, an.n[1] * d);
      }
    }
    const paso = n + 1;
    for (let i = 0; i < anillos.length - 1; i++) {
      if (anillos[i].fin) continue;
      for (let s = 0; s < n; s++) {
        const a = base + i * paso + s;
        const b = base + (i + 1) * paso + s;
        const c = b + 1;
        const d = a + 1;
        this.idx.push(a, b, c, a, c, d);
      }
    }
  }

  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

// Un sólido de revolución alrededor del eje X, con el perfil en [radio, x]: se escribe como se lee
// un plano de rin. El perfil se recorre de afuera hacia adentro del carro.
function torno(f, perfil, n, quiebre = 40) {
  f.revolver(
    perfil.map(([r, x]) => [x, Math.max(r, 1e-4)]),
    n,
    quiebre,
  );
}

// Un rayo de aleación: prisma afinado, con la cara a dos aguas y bombeado en el medio. Agarra luz
// por un lado y queda en sombra por el otro, y las normales van por cara: así se lee como metal
// mecanizado. Con normales suaves parecía de plastilina; con la cara plana, un aspa de plástico.
function rayo(f, angulo, desfase, r0, r1, a0, a1, x0, x1, grueso) {
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  const punto = (r, lat, xx) => [xx, r * cos - lat * sin, r * sin + lat * cos];
  const estaciones = 4;
  const secciones = [];
  for (let k = 0; k <= estaciones; k++) {
    const t = k / estaciones;
    const r = r0 + (r1 - r0) * t;
    const c = desfase * t; // el desfase lo inclina: de a dos forman una V
    const a = a0 + (a1 - a0) * t;
    const frente = x0 + (x1 - x0) * t + 0.004 * Math.sin(Math.PI * t);
    secciones.push([punto(r, c - a, frente - 0.006), punto(r, c, frente), punto(r, c + a, frente - 0.006), punto(r, c + a * 1.05, frente - grueso), punto(r, c - a * 1.05, frente - grueso)]);
  }
  for (let k = 0; k < estaciones; k++) {
    const s0 = secciones[k];
    const s1 = secciones[k + 1];
    for (let m = 0; m < 5; m++) {
      const m1 = (m + 1) % 5;
      f.cara([s0[m], s0[m1], s1[m1], s1[m]]);
    }
  }
}

// La llanta: flanco abombado y hombro redondo. Una llanta "gorda" o con el canto vivo es la mitad
// de lo que hacía de juguete al genérico. Los surcos son los dos que se ven en la banda de frente.
function perfilLlanta(R, rr, a, hombro) {
  return [
    [rr - 0.012, a - 0.014],
    [rr + 0.004, a - 0.002],
    [rr + (R - rr) * 0.45, a + 0.002],
    [R - hombro * 1.6, a - 0.008],
    [R - hombro * 0.5, a - hombro * 1.2],
    [R, a - hombro * 2.4],
    [R, a * 0.46],
    [R - 0.006, a * 0.42],
    [R - 0.006, a * 0.34],
    [R, a * 0.3],
    [R, -a * 0.3],
    [R - 0.006, -a * 0.34],
    [R - 0.006, -a * 0.42],
    [R, -a * 0.46],
    [R, -a + hombro * 2.4],
    [R - hombro * 0.5, -a + hombro * 1.2],
    [R - hombro * 1.6, -a + 0.008],
    [rr + (R - rr) * 0.45, -a - 0.002],
    [rr + 0.004, -a + 0.002],
    [rr - 0.012, -a + 0.012],
  ];
}

// Cinco rayos solos son lo que el dueño llamó "estrella": aquí van de a dos, en V, sobre un cubo
// hundido. Una SUV o una camioneta llevan seis pares, más gruesos.
const DISENOS = {
  sedan: { pares: 5, abre: 0.23, ancho: 0.011 },
  hatchback: { pares: 5, abre: 0.23, ancho: 0.0105 },
  suv: { pares: 6, abre: 0.2, ancho: 0.0125 },
  camioneta: { pares: 6, abre: 0.2, ancho: 0.0145 },
};

// Copia una geometría en varias posiciones, ya colocadas. `lugares` son [x, y, z, girada].
function colocar(g, lugares) {
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  const uv = g.attributes.uv ? g.attributes.uv.array : null;
  const q = g.index.array;
  const nV = p.length / 3;
  const pos = new Float32Array(p.length * lugares.length);
  const nor = new Float32Array(n.length * lugares.length);
  const uvs = uv ? new Float32Array(uv.length * lugares.length) : null;
  const idx = new (nV * lugares.length > 65535 ? Uint32Array : Uint16Array)(q.length * lugares.length);
  lugares.forEach(([x, y, z, girada], c) => {
    const s = girada ? -1 : 1;
    for (let i = 0; i < nV; i++) {
      const k = 3 * (c * nV + i);
      pos[k] = x + s * p[3 * i];
      pos[k + 1] = y + p[3 * i + 1];
      pos[k + 2] = z + s * p[3 * i + 2];
      nor[k] = s * n[3 * i];
      nor[k + 1] = n[3 * i + 1];
      nor[k + 2] = s * n[3 * i + 2];
    }
    if (uvs) uvs.set(uv, c * uv.length);
    for (let i = 0; i < q.length; i++) idx[c * q.length + i] = q[i] + c * nV;
  });
  const salida = new THREE.BufferGeometry();
  salida.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  salida.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uvs) salida.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  salida.setIndex(new THREE.BufferAttribute(idx, 1));
  return salida;
}

// `lugares`: una lista de [x, y, z, girada] por rueda.
export function crearRuedas(tipo, R, ancho, lugares) {
  const dis = DISENOS[tipo] || DISENOS.sedan;
  const fuerte = tipo === 'camioneta' || tipo === 'suv';
  const a = ancho / 2;
  // La pared de la llanta de un carro de verdad mide 10-13 cm; en un carro chico, algo menos.
  const rr = R - (fuerte ? 0.128 : 0.102) * Math.min(1, R / 0.3);
  const hombro = fuerte ? 0.022 : 0.016;
  const llanta = new Fundidor();
  torno(llanta, perfilLlanta(R, rr, a, hombro), 36, 55);

  // La pestaña brillante del rin, a ras de la ceja de la llanta.
  const xCara = a - 0.012;
  const rin = new Fundidor();
  torno(
    rin,
    [
      [rr - 0.024, xCara - 0.014],
      [rr - 0.016, xCara + 0.003],
      [rr - 0.006, xCara + 0.007],
      [rr + 0.002, xCara + 0.004],
      [rr + 0.002, xCara - 0.004],
    ],
    32,
    70,
  );
  const r0 = 0.052;
  const r1 = rr - 0.018;
  for (let k = 0; k < dis.pares; k++) {
    const ang = (k * 2 * Math.PI) / dis.pares;
    const abre = rr * dis.abre;
    rayo(rin, ang, abre, r0, r1, dis.ancho, dis.ancho * 0.82, xCara - 0.03, xCara - 0.002, 0.022);
    rayo(rin, ang, -abre, r0, r1, dis.ancho, dis.ancho * 0.82, xCara - 0.03, xCara - 0.002, 0.022);
  }
  // La manzana, hundida respecto de la cara.
  torno(
    rin,
    [
      [0.0, xCara - 0.015],
      [0.03, xCara - 0.016],
      [0.058, xCara - 0.022],
      [0.068, xCara - 0.034],
      [0.068, xCara - 0.05],
    ],
    20,
    60,
  );

  // El barril oscuro da la profundidad; la tapa y las tuercas, la escala.
  const oscuro = new Fundidor();
  torno(
    oscuro,
    [
      [rr - 0.024, xCara - 0.014],
      [rr - 0.03, xCara - 0.05],
      [rr - 0.032, -a + 0.05],
      [0.05, -a + 0.035],
    ].reverse(),
    24,
    60,
  );
  // El barril se ve por dentro: la pared de adentro del tubo.
  const tuerca = (cy, cz) => {
    const x1 = xCara - 0.016;
    const x0 = xCara - 0.028;
    const anillo = (x, r) => {
      const p = [];
      for (let k = 0; k < 6; k++) {
        const t = (k / 6) * Math.PI * 2;
        p.push([x, cy + r * Math.cos(t), cz + r * Math.sin(t)]);
      }
      return p;
    };
    const arriba = anillo(x1, 0.0075);
    const abajo = anillo(x0, 0.009);
    oscuro.cara(arriba);
    for (let k = 0; k < 6; k++) oscuro.cara([arriba[k], abajo[k], abajo[(k + 1) % 6], arriba[(k + 1) % 6]]);
  };
  const nTuercas = dis.pares === 6 ? 6 : 5;
  for (let k = 0; k < nTuercas; k++) {
    const ang = (k * 2 * Math.PI) / nTuercas + 0.3;
    tuerca(0.05 * Math.cos(ang), 0.05 * Math.sin(ang));
  }
  // La tapa central.
  torno(
    oscuro,
    [
      [0.0, xCara - 0.011],
      [0.024, xCara - 0.011],
      [0.026, xCara - 0.017],
    ],
    14,
    60,
  );

  // El disco de freno y la mordaza se ven entre los rayos: sin ellos, el rin es un adorno pegado a
  // un cilindro negro.
  const rd = rr * 0.86;
  const disco = new Fundidor();
  torno(
    disco,
    [
      [0.075, a - 0.075],
      [rd * 0.62, a - 0.09],
      [rd, a - 0.092],
      [rd, a - 0.108],
    ],
    28,
    60,
  );
  const mordaza = new Fundidor();
  {
    const ang0 = 2.55;
    const ang1 = 3.45;
    const rM0 = rd * 0.62;
    const rM1 = rd * 1.04;
    const x0 = a - 0.125;
    const x1 = a - 0.078;
    const p = (r, f, x) => [x, r * Math.cos(f), r * Math.sin(f)];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const f0 = ang0 + ((ang1 - ang0) * i) / n;
      const f1 = ang0 + ((ang1 - ang0) * (i + 1)) / n;
      mordaza.cara([p(rM0, f0, x1), p(rM1, f0, x1), p(rM1, f1, x1), p(rM0, f1, x1)]);
      mordaza.cara([p(rM1, f0, x1), p(rM1, f0, x0), p(rM1, f1, x0), p(rM1, f1, x1)]);
    }
  }

  // Las letras de la llanta: una medida y dos palabras, sin marca, en relieve casi del mismo tono.
  // Es lo que separa una llanta de una dona negra en un primer plano, y no se ve de lejos.
  let letras = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#505257';
    x.font = 'bold 30px Arial, sans-serif';
    x.textBaseline = 'middle';
    x.textAlign = 'center';
    x.fillText('RADIAL TUBELESS', 256, 22);
    x.fillText('185 / 65  R15  88 H', 768, 22);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    const rI = rr + (R - rr) * 0.34;
    const rE = rr + (R - rr) * 0.66;
    const n = 48;
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    for (let s = 0; s <= n; s++) {
      const f = (s / n) * Math.PI * 2;
      for (const [q, v] of [
        [rI, 0],
        [rE, 1],
      ]) {
        pos.push(a + 0.0042, q * Math.cos(f), q * Math.sin(f));
        nor.push(1, 0, 0);
        uv.push((-s / n) * 2, v);
      }
    }
    for (let s = 0; s < n; s++) {
      const b = 2 * s;
      idx.push(b, b + 3, b + 2, b, b + 1, b + 3);
    }
    letras = new THREE.BufferGeometry();
    letras.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    letras.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    letras.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    letras.setIndex(idx);
    letras.userData.mapa = t;
  }
  const geo = {
    llanta: llanta.geometria(),
    rin: rin.geometria(),
    oscuro: oscuro.geometria(),
    disco: disco.geometria(),
    mordaza: mordaza.geometria(),
  };
  const mat = {
    // El caucho no es negro: es gris muy oscuro y agarra algo de luz en el flanco.
    llanta: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.82, metalness: 0 }),
    rin: new THREE.MeshStandardMaterial({ color: 0xb6bcc4, roughness: 0.3, metalness: 0.95 }),
    oscuro: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.5 }),
    disco: new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.42, metalness: 0.9 }),
    mordaza: new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.6, metalness: 0.5 }),
  };
  if (letras) {
    geo.letras = letras;
    mat.letras = new THREE.MeshStandardMaterial({ map: letras.userData.mapa, transparent: true, depthWrite: false, roughness: 0.85, metalness: 0 });
  }
  const grupo = new THREE.Group();
  grupo.name = 'ruedas';
  for (const k of Object.keys(geo)) grupo.add(new THREE.Mesh(colocar(geo[k], lugares), mat[k]));
  return grupo;
}
