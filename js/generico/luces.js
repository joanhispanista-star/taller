// Las luces: faros, stops y exploradoras. Son la cara del carro, y lo que más lo fecha.
//
// Una luz es un hueco en la lata con capas: un lente a ras de la superficie (solo reflejo: lo que
// hay detrás se ve entero), una carcasa a unos centímetros, y encima de la carcasa el dibujo de la
// luz, pintado en un lienzo. Con cintas sobre la rejilla no se podía: la línea de luz cruza celdas
// y salían esquirlas. El dibujo se hace en coordenadas propias de cada lámpara, que se sacan de sus
// vértices: así el trazo sigue el contorno de la lámpara, sea la medida que sea.
//
// Sin DOM (en Node) no hay lienzo: las lámparas salen lisas, y lo demás igual.
import * as THREE from 'three';
import { Fundidor } from './rueda.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hayLienzo = () => typeof document !== 'undefined';

// ---- Capas de una lámpara ----

export function capa(p, prof, material, decorativa = true, uv = null) {
  const pos = new Float32Array(p.pos.length);
  const o = p.original;
  const n = p.nor;
  for (let i = 0; i < pos.length; i++) pos[i] = o[i] - n[i] * prof;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(p.idx);
  const malla = new THREE.Mesh(g, material);
  malla.userData.decorativo = decorativa;
  if (!decorativa) malla.name = 'luz'; // así la llaman las pruebas del carro de hoy
  return malla;
}

export function paredAdentro(p, prof, f) {
  const o = p.original;
  const n = p.nor;
  const P = (l, h) => [o[3 * l] - n[3 * l] * h, o[3 * l + 1] - n[3 * l + 1] * h, o[3 * l + 2] - n[3 * l + 2] * h];
  for (const b of p.bordes) f.cara([P(b.a, prof), P(b.a, 0), P(b.b, 0), P(b.b, prof)]);
}

export function cintaBorde(p, f, filtro, d1, d2, prof) {
  const o = p.original;
  const n = p.nor;
  for (const b of p.bordes) {
    if (!filtro(b)) continue;
    const ua = p.dirU.get(b.va);
    const ub = p.dirU.get(b.vb);
    const Q = (l, u, ad) => [o[3 * l] - n[3 * l] * prof + u[3] * ad, o[3 * l + 1] - n[3 * l + 1] * prof + u[4] * ad, o[3 * l + 2] - n[3 * l + 2] * prof + u[5] * ad];
    f.cara([Q(b.a, ua, d1), Q(b.b, ub, d1), Q(b.b, ub, d2), Q(b.a, ua, d2)]);
  }
}

// Las coordenadas de una lámpara: u de la punta de adentro a la de afuera, v hacia arriba, y para
// cada u, dónde queda el borde de arriba y el de abajo. `fu` y `fv` son una proyección, como si se
// mirara la lámpara de tres cuartos: la parte que se envuelve hacia el costado no sale aplastada.
function coordenadas(p, fu, fv, bins = 14) {
  const o = p.original;
  const n = o.length / 3;
  const U = new Float32Array(n);
  const V = new Float32Array(n);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = Math.abs(o[3 * i]);
    U[i] = fu(x, o[3 * i + 1], o[3 * i + 2]);
    V[i] = fv(x, o[3 * i + 1], o[3 * i + 2]);
    if (U[i] < u0) u0 = U[i];
    if (U[i] > u1) u1 = U[i];
    if (V[i] < v0) v0 = V[i];
    if (V[i] > v1) v1 = V[i];
  }
  const du = u1 - u0 || 1;
  const dv = v1 - v0 || 1;
  const arriba = new Float32Array(bins).fill(-Infinity);
  const abajo = new Float32Array(bins).fill(Infinity);
  const uv = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const a = (U[i] - u0) / du;
    const b = (V[i] - v0) / dv;
    uv[2 * i] = a;
    uv[2 * i + 1] = b;
    const k = Math.min(bins - 1, Math.floor(a * bins));
    if (b > arriba[k]) arriba[k] = b;
    if (b < abajo[k]) abajo[k] = b;
  }
  // Una columna sin vértices copia a su vecina; y el contorno se suaviza un poco, porque viene de
  // puntos sueltos, y un trazo que los siga al pie de la letra sale temblando.
  for (let k = 1; k < bins; k++) {
    if (arriba[k] === -Infinity) arriba[k] = arriba[k - 1];
    if (abajo[k] === Infinity) abajo[k] = abajo[k - 1];
  }
  for (let k = bins - 2; k >= 0; k--) {
    if (arriba[k] === -Infinity) arriba[k] = arriba[k + 1];
    if (abajo[k] === Infinity) abajo[k] = abajo[k + 1];
  }
  const suave = (t) => t.map((x, k) => (t[Math.max(0, k - 1)] + 2 * x + t[Math.min(bins - 1, k + 1)]) / 4);
  const ar = suave(arriba);
  const ab = suave(abajo);
  const interp = (t, a) => {
    const f = Math.max(0, Math.min(bins - 1.001, a * bins - 0.5));
    const i = Math.floor(f);
    return lerp(t[i], t[Math.min(bins - 1, i + 1)], f - i);
  };
  return {
    uv,
    du,
    dv,
    tope: (a) => interp(ar, a),
    piso: (a) => interp(ab, a),
    // La altura de un trazo en la lámpara: `f` es la fracción entre el borde de abajo y el de arriba.
    v: (a, f) => lerp(interp(ab, a), interp(ar, a), f),
  };
}

function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texturaDe(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Un trazador sobre el lienzo: una línea dada por f(u), con su brillo.
function trazador(x, W, H, co) {
  return (fDeU, ancho, color, desde = 0, hasta = 1, brillo = 0) => {
    x.save();
    x.strokeStyle = color;
    x.lineWidth = ancho;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.shadowColor = color;
    x.shadowBlur = brillo;
    x.beginPath();
    for (let k = 0; k <= 40; k++) {
      const a = lerp(desde, hasta, k / 40);
      const px = a * W;
      // Una curva suave por tres puntos del contorno: si el trazo siguiera el contorno al pie de la
      // letra, saldría ondulado, y una línea de LED ondulada parece hecha a mano.
      const m = (desde + hasta) / 2;
      const y0 = co.v(desde, fDeU(desde));
      const y1 = co.v(m, fDeU(m));
      const y2 = co.v(hasta, fDeU(hasta));
      const s = (a - desde) / (hasta - desde || 1);
      const py = (1 - (y0 * (1 - s) * (1 - 2 * s) + 4 * y1 * s * (1 - s) + y2 * s * (2 * s - 1))) * H;
      if (k === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
    x.restore();
  };
}

// ---- El faro ----
// Un lente claro, y detrás una carcasa gris con sus reflectores de cromo y su direccional: así es el faro de
// casi todo lo que rueda en Colombia. La carcasa negra con una línea de LED es la de un carro de vitrina de
// hoy, y repetida en las cuatro carrocerías se leía como ojos maquillados con antifaz.
//
// El gesto de cada carrocería sale de cuatro cosas: la silueta del faro (la jaula), cuántos reflectores lleva
// y de qué forma, dónde va el ámbar, y la parrilla y la boca (detalle.js y jaula.js).
//   ambar: [a0, a1, f0, f1], el rectángulo de la direccional en coordenadas de la lámpara.
//   cuencos: los reflectores [a, f, k, ancho], con k la fracción de la altura de la lámpara en ese punto que
//   ocupa y ancho cuánto más ancho que alto es. Uno redondo en el centro de una lámpara larga es un iris en un
//   ojo; uno alargado que la llena, una lámpara.
//   cuadrado: reflectores de esquinas redondas en vez de redondos.
const FAROS = {
  // Dos reflectores en fila, el de afuera mayor, con el ámbar en la punta que se va hacia el costado.
  sedan: { ambar: [0.84, 1, 0.08, 0.92], cuencos: [[0.63, 0.5, 0.74, 1], [0.32, 0.53, 0.62, 1]] },
  // Dos chicos, el de afuera mayor. Uno solo y grande, en una lámpara ya de por sí grande, era un huevo gris con
  // pupila: de frente, cara de sapo, en 213 de las 1.137 líneas del catálogo. El ámbar, en la punta de afuera: en una
  // tira a lo largo del pie de la lámpara se leía como un párpado amarillo.
  hatchback: { ambar: [0.82, 1, 0.1, 0.9], cuencos: [[0.6, 0.52, 0.62, 1.05], [0.3, 0.52, 0.52, 1.05]] },
  // Dos cuadrados: la cara alta de un campero. El ámbar, abajo y afuera.
  suv: { ambar: [0.74, 1, 0.08, 0.34], cuencos: [[0.6, 0.62, 0.66, 1], [0.27, 0.56, 0.66, 1]], cuadrado: true },
  // Grande y de trabajo: un reflector mayor y uno menor, y la direccional de arriba abajo en el costado.
  camioneta: { ambar: [0.85, 1, 0.08, 0.92], cuencos: [[0.62, 0.5, 0.76, 1], [0.3, 0.5, 0.66, 1]], cuadrado: true },
  // El camioncito: uno solo, en el centro de un faro cuadrado, y la direccional aparte en la esquina.
  adelantada: { ambar: [0.8, 1, 0.08, 0.92], cuencos: [[0.41, 0.52, 0.72, 1.5]], cuadrado: true },
};

// El camino de un reflector: círculo, o rectángulo de esquinas redondas con `cuadrado` (una superelipse).
function caminoCuenco(x, cx, cy, rx, ry, cuadrado) {
  const e = cuadrado ? 0.42 : 1;
  x.beginPath();
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e);
    const py = cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e);
    if (k === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.closePath();
}

// Un cuenco de cromo. Es cóncavo: refleja al revés, el piso arriba y el cielo abajo, y por eso la luna clara va
// abajo. Esa asimetría es lo que lo lee como cuenco; con anillos concéntricos y un punto en el centro, a
// 20 píxeles de faro, era un ojo de caricatura. Las estrías son las del reflector: de cerca lo vuelven pieza,
// y de lejos se pierden.
function dibujarCuenco(x, cx, cy, rx, ry, cuadrado) {
  x.save();
  // La sombra alrededor: hunde el cuenco en la carcasa.
  x.shadowColor = 'rgba(0,0,0,0.75)';
  x.shadowBlur = 12;
  caminoCuenco(x, cx, cy, rx, ry, cuadrado);
  x.fillStyle = '#17191c';
  x.fill();
  x.restore();
  x.save();
  caminoCuenco(x, cx, cy, rx * 0.95, ry * 0.95, cuadrado);
  x.clip();
  const g = x.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, '#34373c');
  g.addColorStop(0.34, '#686d73');
  g.addColorStop(0.58, '#b9bdc1');
  g.addColorStop(0.8, '#fbfcfd');
  g.addColorStop(1, '#a6aab0');
  x.fillStyle = g;
  x.fillRect(cx - rx, cy - ry, 2 * rx, 2 * ry);
  x.globalAlpha = 0.16;
  x.fillStyle = '#000000';
  for (let q = -rx; q < rx; q += 8) x.fillRect(cx + q, cy - ry, 2.5, 2 * ry);
  x.globalAlpha = 1;
  // La caperuza del bombillo: chica y clara, y sin borde oscuro, que era la pupila.
  const rc = Math.min(rx, ry) * 0.2;
  const b = x.createRadialGradient(cx - rc * 0.2, cy - rc * 0.3, rc * 0.1, cx, cy, rc);
  b.addColorStop(0, '#ffffff');
  b.addColorStop(0.8, '#c9cdd1');
  b.addColorStop(1, '#7c8187');
  x.fillStyle = b;
  x.beginPath();
  x.arc(cx, cy, rc, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

function texturaFaro(co, receta) {
  const W = 512;
  const H = 192;
  const c = lienzo(W, H);
  const x = c.getContext('2d');
  // La carcasa: gris medio, con luz arriba. No es metal de verdad, porque a este tamaño lo que se lee es el
  // tono. Clara, el faro era un huevo gris: lo que hace ver el cromo es que lo de alrededor sea más oscuro.
  const fondo = x.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, '#5c6066');
  fondo.addColorStop(0.5, '#83878d');
  fondo.addColorStop(1, '#5a5e63');
  x.fillStyle = fondo;
  x.fillRect(0, 0, W, H);
  for (const [a, f, k, ancho] of receta.cuencos) {
    const alto = co.tope(a) - co.piso(a);
    const r = (alto * k) / 2;
    dibujarCuenco(x, a * W, (1 - co.v(a, f)) * H, ((ancho * r * co.dv) / co.du) * W, r * H, receta.cuadrado);
  }
  // La direccional apagada: ámbar claro, con las estrías que la hacen pieza y no pintura.
  const [a0, a1, f0, f1] = receta.ambar;
  const ambar = x.createLinearGradient(0, (1 - f1) * H, 0, (1 - f0) * H);
  ambar.addColorStop(0, '#f2b050');
  ambar.addColorStop(1, '#c97f1e');
  x.fillStyle = ambar;
  x.beginPath();
  const paso = 10;
  for (let k = 0; k <= paso; k++) {
    const a = lerp(a0, a1, k / paso);
    const py = (1 - co.v(a, f1)) * H;
    if (k === 0) x.moveTo(a * W, py);
    else x.lineTo(a * W, py);
  }
  for (let k = paso; k >= 0; k--) {
    const a = lerp(a0, a1, k / paso);
    x.lineTo(a * W, (1 - co.v(a, f0)) * H);
  }
  x.closePath();
  x.fill();
  x.save();
  x.clip();
  x.globalAlpha = 0.22;
  x.fillStyle = '#6e3c00';
  for (let q = a0 * W; q < a1 * W; q += 9) x.fillRect(q, 0, 3, H);
  x.restore();
  // La orilla: un filo oscuro y una sombra corta hacia adentro. Es lo que hunde la carcasa detrás del lente
  // y separa el faro de la lata; más ancho es otra vez el antifaz.
  x.save();
  x.strokeStyle = '#26292d';
  x.lineWidth = 9;
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = 16;
  x.beginPath();
  for (let k = 0; k <= 40; k++) {
    const a = k / 40;
    if (k === 0) x.moveTo(a * W, (1 - co.tope(a)) * H);
    else x.lineTo(a * W, (1 - co.tope(a)) * H);
  }
  for (let k = 40; k >= 0; k--) {
    const a = k / 40;
    x.lineTo(a * W, (1 - co.piso(a)) * H);
  }
  x.closePath();
  x.stroke();
  x.restore();
  return texturaDe(c);
}

export function armarFaro(p, mats, destino, tipo, adelantada = false) {
  // Poco hondo: con 3 cm, desde arriba se veía la pared como una ceja gruesa encima del faro.
  const prof = 0.018;
  const receta = (adelantada && FAROS.adelantada) || FAROS[tipo] || FAROS.sedan;
  const co = coordenadas(
    p,
    (x, _y, z) => x + 0.55 * z,
    (_x, y, z) => y + 0.3 * z,
  );
  // El lente para el dedo, como el vidrio: si no, un toque en el faro atraviesa y marca el vano.
  destino.add(capa(p, 0, mats.de('faroLente'), false));
  let material = mats.de('faroCaja');
  if (hayLienzo()) {
    // Con algo de luz propia, para que la carcasa no se apague cuando el frente queda en sombra.
    const map = texturaFaro(co, receta);
    material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.34, metalness: 0, roughness: 0.6 });
  }
  destino.add(capa(p, prof, material, true, co.uv));
  const pared = new Fundidor();
  paredAdentro(p, prof, pared);
  if (pared.n) {
    const malla = new THREE.Mesh(pared.geometria(), mats.de('faroCaja'));
    malla.userData.decorativo = true;
    destino.add(malla);
  }
}

// ---- El stop ----
// El rojo tiene que leerse como luz, también apagado: un stop negro con rayas parece fundido.
const COLAS = {
  sedan: (t) => {
    // Dos líneas de LED, y el tramo claro de la reversa hacia adentro.
    t(() => 0.66, 13, '#ff2630', 0.12, 0.97, 11);
    t(() => 0.66, 4, '#ffb0a8', 0.14, 0.95);
    t(() => 0.3, 6, '#e0141c', 0.34, 0.94, 7);
  },
  hatchback: (t) => {
    // Una C que abraza la reversa.
    t(() => 0.76, 11, '#ff2630', 0.2, 0.92, 11);
    t(() => 0.24, 11, '#ff2630', 0.2, 0.92, 11);
    t((a) => lerp(0.76, 0.24, (a - 0.92) / 0.05), 11, '#ff2630', 0.92, 0.97, 9);
    t(() => 0.76, 3, '#ffb0a8', 0.22, 0.9);
    t(() => 0.24, 3, '#ffb0a8', 0.22, 0.9);
  },
  suv: (t) => {
    // Tres barras apiladas: de lejos se ve como una lámpara alta.
    for (const f of [0.78, 0.5, 0.22]) {
      t(() => f, 9, '#ff2630', 0.3, 0.95, 9);
      t(() => f, 3, '#ffb0a8', 0.32, 0.93);
    }
  },
};

function texturaStop(co, tipo) {
  const W = 512;
  const H = 192;
  const c = lienzo(W, H);
  const x = c.getContext('2d');
  const fondo = x.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, '#8a0a10');
  fondo.addColorStop(0.5, '#5f060b');
  fondo.addColorStop(1, '#8a0a10');
  x.fillStyle = fondo;
  x.fillRect(0, 0, W, H);
  if (tipo === 'camioneta') {
    // De arriba abajo: rojo, claro (reversa), ámbar y rojo. La lámpara de una camioneta es vertical,
    // y aquí el lienzo va por alturas.
    const banda = (f0, f1, color) => {
      x.fillStyle = color;
      x.fillRect(0, (1 - f1) * H, W, (f1 - f0) * H);
    };
    banda(0.68, 0.97, '#c5101a');
    banda(0.46, 0.65, '#b8bcc2');
    banda(0.33, 0.44, '#d5851a');
    banda(0.03, 0.31, '#c5101a');
    x.globalAlpha = 0.3;
    for (let q = 0; q < H; q += 10) {
      x.fillStyle = '#000000';
      x.fillRect(0, q, W, 3);
    }
    x.globalAlpha = 1;
    return texturaDe(c);
  }
  // Las estrías del reflector, muy tenues: lo que hace que el rojo no sea un plástico.
  x.globalAlpha = 0.14;
  for (let q = 0; q < W; q += 7) {
    x.fillStyle = q % 14 ? '#000000' : '#d3121c';
    x.fillRect(q, 0, 2, H);
  }
  x.globalAlpha = 1;
  const t = trazador(x, W, H, co);
  // El tramo claro de la reversa, hacia adentro: es lo que más dice "lámpara de verdad".
  x.save();
  x.beginPath();
  const hastaReversa = tipo === 'suv' ? 0.26 : 0.18;
  for (let k = 0; k <= 12; k++) {
    const a = lerp(0.015, hastaReversa, k / 12);
    const py = (1 - co.v(a, 0.88)) * H;
    if (k === 0) x.moveTo(a * W, py);
    else x.lineTo(a * W, py);
  }
  for (let k = 12; k >= 0; k--) {
    const a = lerp(0.015, hastaReversa, k / 12);
    x.lineTo(a * W, (1 - co.v(a, 0.12)) * H);
  }
  x.closePath();
  const claro = x.createLinearGradient(0, 0, hastaReversa * W, 0);
  claro.addColorStop(0, '#a2a5aa');
  claro.addColorStop(1, '#6e7176');
  x.fillStyle = claro;
  x.fill();
  x.restore();
  (COLAS[tipo] || COLAS.sedan)(t);
  return texturaDe(c);
}

export function armarCalavera(p, mats, destino, tipo) {
  const co = coordenadas(
    p,
    (x, _y, z) => x - 0.6 * z,
    (_x, y, z) => y - 0.12 * z,
  );
  let material;
  if (hayLienzo()) {
    const map = texturaStop(co, tipo);
    // La textura brilla sola: el stop no puede apagarse en la sombra. Sin laca aparte: era un programa
    // de sombreado entero para un reflejo que apenas se veía; con menos rugosidad lo da el mismo que
    // usa el faro.
    material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.22 });
  } else {
    material = mats.de('calaveraFondo');
  }
  destino.add(capa(p, 0.0015, material, false, co.uv));
  const pared = new Fundidor();
  paredAdentro(p, 0.02, pared);
  if (pared.n) {
    const m = new THREE.Mesh(pared.geometria(), mats.de('junta'));
    m.userData.decorativo = true;
    destino.add(m);
  }
}

// ---- La exploradora ----
// Un lente de vidrio sobre un reflector, apagado: gris plata, con el brillo de un lado. Un disco blanco con
// un punto en el centro se lee como un ojo, y lo que hay en un carro de verdad es un vidrio que casi no se
// nota. `ancho` > 1 la vuelve rectangular, la de un campero.
export function exploradora(fAro, fLente, c, n, r, ancho = 1) {
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const ux = ref[1] * n[2] - ref[2] * n[1];
  const uy = ref[2] * n[0] - ref[0] * n[2];
  const uz = ref[0] * n[1] - ref[1] * n[0];
  const lu = Math.hypot(ux, uy, uz) || 1;
  const u = [ux / lu, uy / lu, uz / lu];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  // Una superelipse: círculo con ancho 1, rectángulo de esquinas redondas con más.
  const rad = (a) => {
    const co = Math.cos(a);
    const se = Math.sin(a);
    const k = ancho > 1 ? Math.pow(Math.pow(Math.abs(co) / ancho, 4) + Math.pow(Math.abs(se), 4), -0.25) : 1;
    return [u[0] * co * k + v[0] * se * k, u[1] * co * k + v[1] * se * k, u[2] * co * k + v[2] * se * k];
  };
  const seg = 18;
  const anillo = (f, rr, h, inclinar) => {
    const base = f.n;
    for (let i = 0; i <= seg; i++) {
      const q = rad((i / seg) * Math.PI * 2);
      const nx = n[0] + q[0] * inclinar;
      const ny = n[1] + q[1] * inclinar;
      const nz = n[2] + q[2] * inclinar;
      const l = Math.hypot(nx, ny, nz) || 1;
      f.vertice(c[0] + q[0] * rr + n[0] * h, c[1] + q[1] * rr + n[1] * h, c[2] + q[2] * rr + n[2] * h, nx / l, ny / l, nz / l);
    }
    return base;
  };
  const coser = (f, adentro, afuera) => {
    for (let i = 0; i < seg; i++) f.idx.push(adentro + i, afuera + i, afuera + i + 1, adentro + i, afuera + i + 1, adentro + i + 1);
  };
  coser(fAro, anillo(fAro, r * 0.94, 0.002, 0.35), anillo(fAro, r * 1.22, -0.006, 0.8));
  coser(fLente, anillo(fLente, r * 0.05, 0.0035, 0.02), anillo(fLente, r * 0.94, 0.002, 0.28));
}
