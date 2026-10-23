// El escáner del celular (escaneo-ar.js) con un WebXR de mentira, como lo
// entrega Chrome en Android según su código (investigación del 22-oct-2026):
// profundidad solo en algunos cuadros (null en los demás), distancia al
// PLANO de la cámara, la sesión que puede no conceder 'depth-sensing'. La
// "escena" es una caja de carro de 4,30 × 1,80 × 1,60 m sobre el piso. No
// reemplaza probar en un celular: prueba que el pegamento hace lo que debe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { aislarCarro, estimarPiso, mallaDesdeTSDF, procesarEscaneo } from '../js/escaneo.js';

const L = 4.3;
const W = 1.8;
const H = 1.6;

// La profundidad (distancia al plano de la cámara) de la caja y el piso.
function profundidadDe(camara, u, v) {
  const dir = new THREE.Vector3(u * 2 - 1, -(v * 2 - 1), 0.5).unproject(camara).sub(camara.position).normalize();
  const o = camara.position;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [oi, di, lo, hi] of [[o.x, dir.x, -W / 2, W / 2], [o.y, dir.y, 0, H], [o.z, dir.z, -L / 2, L / 2]]) {
    if (Math.abs(di) < 1e-9) {
      if (oi < lo || oi > hi) {
        t0 = Infinity;
        break;
      }
      continue;
    }
    let a = (lo - oi) / di;
    let b = (hi - oi) / di;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  let t = t0 <= t1 && t0 > 0 ? t0 : dir.y < -1e-6 ? -o.y / dir.y : 0;
  if (!t || t > 8) return 0;
  const punto = o.clone().addScaledVector(dir, t).applyMatrix4(camara.matrixWorldInverse);
  return -punto.z;
}

// Un navigator.xr de mentira. `conProfundidad`: si la sesión la concede;
// `cadaCuantos`: un cuadro con profundidad de cada tantos (Chrome devuelve
// null en los demás); `quieto`: la cámara no se mueve (para el filtro).
function webxrDeMentira({ conProfundidad = true, cadaCuantos = 3, quieto = false, diceQueConcedio = true } = {}) {
  const sesiones = [];
  const camara = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 20);
  const xr = {
    async isSessionSupported(modo) {
      return modo === 'immersive-ar';
    },
    async requestSession(modo, opciones) {
      const oyentes = {};
      const sesion = {
        opciones,
        // Un Chrome viejo no dice qué concedió (enabledFeatures no existe).
        enabledFeatures: diceQueConcedio ? ['local', 'dom-overlay', ...(conProfundidad ? ['depth-sensing'] : [])] : undefined,
        renderState: {},
        cuadro: null,
        terminada: false,
        updateRenderState(estado) {
          Object.assign(this.renderState, estado);
        },
        async requestReferenceSpace(tipo) {
          return { tipo };
        },
        requestAnimationFrame(cb) {
          this.cuadro = cb;
          return 1;
        },
        addEventListener(tipo, fn) {
          oyentes[tipo] = fn;
        },
        async end() {
          this.terminada = true;
          if (oyentes.end) oyentes.end();
        },
      };
      sesiones.push(sesion);
      return sesion;
    },
  };
  // Mueve la "cámara" por la vuelta y le da un cuadro a la sesión.
  let n = 0;
  function cuadro(sesion) {
    const k = quieto ? 0 : n;
    const vuelta = (k / 240) * Math.PI * 2;
    const alto = Math.floor(k / 240) % 2 === 0 ? 1.9 : 0.8;
    camara.position.set(Math.sin(vuelta) * 3.2, alto, Math.cos(vuelta) * 3.9);
    camara.lookAt(0, 0.6, 0);
    camara.updateMatrixWorld(true);
    const vista = {
      projectionMatrix: Float32Array.from(camara.projectionMatrix.elements),
      transform: { matrix: Float32Array.from(camara.matrixWorld.elements) },
    };
    const conDato = conProfundidad && Number.isFinite(cadaCuantos) && n % cadaCuantos === 0;
    const frame = {
      getViewerPose: () => ({ views: [vista] }),
      getDepthInformation: () => (conDato ? { getDepthInMeters: (u, v) => profundidadDe(camara, u, v) } : null),
    };
    n++;
    const cb = sesion.cuadro;
    sesion.cuadro = null;
    if (cb) cb(n * 33, frame);
  }
  return { xr, sesiones, cuadro };
}

function prepararGlobales(xr) {
  Object.defineProperty(globalThis, 'navigator', { value: { xr }, configurable: true, writable: true });
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({ bindFramebuffer() {}, clearColor() {}, clear() {}, async makeXRCompatible() {}, FRAMEBUFFER: 1, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2 }),
    }),
  };
  globalThis.XRWebGLLayer = class {
    constructor() {
      this.framebuffer = null;
    }
  };
}

const hud = { addEventListener() {}, removeEventListener() {} };

test('puedeEscanear dice que no sin WebXR y que sí con realidad aumentada', async () => {
  const { puedeEscanear } = await import('../js/escaneo-ar.js');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  const no = await puedeEscanear();
  assert.equal(no.si, false);
  assert.match(no.motivo, /Android|iPhone/);
  prepararGlobales(webxrDeMentira().xr);
  assert.equal((await puedeEscanear()).si, true);
});

test('una vuelta con el WebXR de mentira: pide lo que Chrome da, integra solo al moverse, y la caja sale con sus medidas', async () => {
  const { escanear } = await import('../js/escaneo-ar.js');
  const mentira = webxrDeMentira();
  prepararGlobales(mentira.xr);
  const avances = [];
  const { escaneo, fin } = await escanear({ hud, alAvanzar: (a) => avances.push(a) });
  const sesion = mentira.sesiones[0];
  // Lo que se le pidió a Chrome: profundidad opcional, en CPU, en los
  // formatos que da, suavizada, y la vista coincidente.
  assert.deepEqual(sesion.opciones.requiredFeatures, ['local']);
  assert.ok(sesion.opciones.optionalFeatures.includes('depth-sensing'));
  assert.deepEqual(sesion.opciones.depthSensing.usagePreference, ['cpu-optimized']);
  assert.ok(!sesion.opciones.depthSensing.dataFormatPreference.includes('float32'));
  assert.equal(sesion.opciones.depthSensing.matchDepthView, true);
  // Dos vueltas (una alta y una baja), 240 cuadros cada una.
  for (let i = 0; i < 480; i++) mentira.cuadro(sesion);
  escaneo.terminar();
  const r = await fin;
  // Profundidad en 1 de cada 3 cuadros (160); entre uno y otro la cámara
  // ya anduvo ~27 cm, así que entran todos (el filtro de movimiento se
  // prueba aparte, con el celular quieto).
  assert.ok(r.cuadros > 40 && r.cuadros <= 160, 'cuadros integrados: ' + r.cuadros);
  assert.ok(avances.length > 0 && avances[avances.length - 1].lados >= 10, 'lados vistos: ' + (avances.length && avances[avances.length - 1].lados));
  // Lo mismo que hace escaneo-pantalla.js con el resultado.
  const superficie = r.tsdf.puntosDeSuperficie();
  const piso = estimarPiso(superficie);
  const mascara = aislarCarro(superficie, { piso });
  const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i]) continue;
    for (let k = 0; k < 3; k++) {
      caja.min[k] = Math.min(caja.min[k], superficie[i * 3 + k] - 0.15);
      caja.max[k] = Math.max(caja.max[k], superficie[i * 3 + k] + 0.15);
    }
  }
  caja.min[1] = piso - 0.1;
  const e = procesarEscaneo(mallaDesdeTSDF(r.tsdf, caja), { carroceria: 'suv', suavizar: true });
  assert.ok(Math.abs(e.medidas.largo - L) < 0.06, 'largo ' + e.medidas.largo.toFixed(3));
  assert.ok(Math.abs(e.medidas.ancho - W) < 0.06, 'ancho ' + e.medidas.ancho.toFixed(3));
  assert.ok(Math.abs(e.medidas.alto - H) < 0.06, 'alto ' + e.medidas.alto.toFixed(3));
});

test('con el celular quieto no se vuelve a integrar el mismo cuadro', async () => {
  const { escanear } = await import('../js/escaneo-ar.js');
  const mentira = webxrDeMentira({ quieto: true, cadaCuantos: 1 });
  prepararGlobales(mentira.xr);
  const { escaneo, fin } = await escanear({ hud });
  for (let i = 0; i < 60; i++) mentira.cuadro(mentira.sesiones[0]);
  escaneo.terminar();
  const r = await fin;
  assert.equal(r.cuadros, 1, 'solo el primero');
});

test('sin profundidad: si no la concede, "sin-profundidad"; si la concedió y no llega, se espera 30 s; si no dice, 10 s; cancelar es cancelar', async () => {
  const { escanear } = await import('../js/escaneo-ar.js');
  // Chrome dice qué concedió y no está la profundidad.
  let mentira = webxrDeMentira({ conProfundidad: false });
  prepararGlobales(mentira.xr);
  let s = await escanear({ hud });
  await assert.rejects(s.fin, /sin-profundidad/);
  // Concedida pero no llega: a los 10 s NO se acusa al celular (ARCore
  // tarda si no hay movimiento o luz); a los 30 s, "profundidad-no-llega".
  mentira = webxrDeMentira({ cadaCuantos: Infinity });
  prepararGlobales(mentira.xr);
  s = await escanear({ hud });
  for (let i = 0; i < 320; i++) mentira.cuadro(mentira.sesiones[0]);
  assert.equal(mentira.sesiones[0].terminada, false, 'a los 10 s sigue esperando');
  for (let i = 0; i < 600; i++) mentira.cuadro(mentira.sesiones[0]);
  await assert.rejects(s.fin, /profundidad-no-llega/);
  // Un Chrome que no dice qué concedió y no la da: a los 10 s, "sin-profundidad".
  mentira = webxrDeMentira({ cadaCuantos: Infinity, diceQueConcedio: false });
  prepararGlobales(mentira.xr);
  s = await escanear({ hud });
  for (let i = 0; i < 320; i++) mentira.cuadro(mentira.sesiones[0]);
  await assert.rejects(s.fin, /sin-profundidad/);
  // Cancelar.
  mentira = webxrDeMentira();
  prepararGlobales(mentira.xr);
  s = await escanear({ hud });
  for (let i = 0; i < 10; i++) mentira.cuadro(mentira.sesiones[0]);
  s.escaneo.cancelar();
  await assert.rejects(s.fin, /cancelado/);
});
