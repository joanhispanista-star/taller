// Escanear el carro con la cámara del celular, desde la app, sin instalar
// nada: WebXR en Chrome de Android (ARCore). La persona camina alrededor
// del carro con el celular; cada cuadro trae la profundidad (de unos
// 160 × 120 puntos) y dónde estaba la cámara; la app la funde en una TSDF
// (escaneo.js) y al terminar sale la malla del carro a su tamaño real.
//
// Lo que se sabe de esto (investigado el 22-oct-2026, leyendo el código de
// Chrome; NADA de esto se ha probado todavía en un celular de verdad):
//  - Chrome para Android da profundidad desde la versión 90, solo
//    'cpu-optimized', en 'luminance-alpha' o 'unsigned-short' (no
//    'float32'), en milímetros, y solo la "suavizada": no hay confianza por
//    píxel, así que vidrios y pintura brillante no salen como huecos sino
//    como profundidad rellenada. Error típico de ARCore: 6-7 cm (ISPRS
//    2022). Sirve para el tamaño y la silueta, no para una abolladura.
//  - Más del 88 % de los Android activos tienen la Depth API (Google, mayo
//    2026), pero no todos (Galaxy A14 5G, A24, A25 5G, A34 5G no). Por eso
//    la profundidad se pide como OPCIONAL: si no viene, se dice.
//  - iPhone no tiene WebXR: ahí se sube un escaneo de otra app.
//  - La profundidad sale del MOVIMIENTO: con el celular quieto el relieve
//    se aplana. Hay que caminar.
//  - Three.js 0.169 (el de la app) revienta en cada cuadro si la sesión
//    trae 'depth-sensing' (llama getDepthInformation de la GPU sin mirar el
//    modo; se arregló en la r173). Por eso aquí NO se usa renderer.xr: un
//    lienzo WebGL propio que solo limpia la pantalla (la cámara la pinta el
//    sistema detrás) y la profundidad se lee en la CPU.
//  - 'local-floor' en Chrome es una altura fija de 1,2 m, no el piso: se
//    usa 'local' y el piso sale de los datos (estimarPiso).
import { crearTSDF, puntosDeCuadro } from './escaneo.js';

// Si este navegador puede intentar escanear: { si, motivo }. Que diga que
// sí no garantiza profundidad (eso se sabe al abrir la sesión).
export async function puedeEscanear() {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return { si: false, motivo: 'Este navegador no puede escanear (hace falta Chrome en un Android con ARCore; en iPhone no se puede desde el navegador).' };
  }
  try {
    if (await navigator.xr.isSessionSupported('immersive-ar')) return { si: true, motivo: '' };
  } catch {
    // cae abajo
  }
  return { si: false, motivo: 'Aquí no hay realidad aumentada: hace falta un Android con ARCore ("Servicios de Google Play para RA") y Chrome.' };
}

// Cuántos "lados" del carro se han visto: la vuelta se parte en 12 y cada
// cámara que mira al carro desde 0,5-4,5 m marca el suyo. El centro es el
// promedio de lo medido a menos de 2,5 m de altura (el carro, más o menos).
export function crearVuelta(partes = 12) {
  const vistos = new Uint8Array(partes);
  let sx = 0;
  let sz = 0;
  let n = 0;
  return {
    agregarPuntos(puntos) {
      for (let k = 0; k < puntos.length; k += 9) {
        sx += puntos[k];
        sz += puntos[k + 2];
        n++;
      }
    },
    marcarCamara(x, z) {
      if (n < 50) return;
      const dx = x - sx / n;
      const dz = z - sz / n;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 || d > 4.5) return;
      const a = (Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI);
      vistos[Math.min(partes - 1, Math.floor(a * partes))] = 1;
    },
    get vistos() {
      return vistos.reduce((s, v) => s + v, 0);
    },
    partes,
  };
}

// Escanea. `hud` es el elemento que se ve encima de la cámara durante la
// sesión (dom-overlay): lleva las instrucciones, el avance y los botones.
// `alAvanzar({ segundos, cuadros, lados, partes, memoria, sinPose, lleno })`
// cuenta cómo va. Devuelve { escaneo: { terminar(), cancelar() }, fin }:
// `fin` se resuelve con { tsdf, cuadros, segundos } al terminar, o se
// rechaza si se cancela, si el celular no da profundidad o si falla.
export async function escanear({ hud, alAvanzar = () => {}, voxel = 0.03 } = {}) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['local'],
    optionalFeatures: ['depth-sensing', 'dom-overlay'],
    domOverlay: { root: hud },
    depthSensing: {
      usagePreference: ['cpu-optimized'],
      dataFormatPreference: ['luminance-alpha', 'unsigned-short'],
      depthTypeRequest: ['smooth'],
      // Que el mapa de profundidad coincida con la vista: el IDL de Chrome no
      // le da valor por defecto, y sin eso getDepthInMeters(u, v) y la
      // proyección dejan de ser coherentes.
      matchDepthView: true,
    },
  });
  // Un toque en un botón del HUD no es un "select" en la escena.
  const sinSelect = (e) => e.preventDefault();
  hud.addEventListener('beforexrselect', sinSelect);

  const habilitadas = session.enabledFeatures || null;
  const lienzo = document.createElement('canvas');
  const gl = lienzo.getContext('webgl2', { xrCompatible: true, alpha: true }) || lienzo.getContext('webgl', { xrCompatible: true, alpha: true });
  if (gl && gl.makeXRCompatible) await gl.makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
  const ref = await session.requestReferenceSpace('local');

  const tsdf = crearTSDF({ voxel });
  const vuelta = crearVuelta();
  const inicio = performance.now();
  let cuadros = 0;
  let sinPose = 0;
  let cuadrosConPose = 0;
  // La pose del último cuadro que se integró: solo se integra uno nuevo si
  // la cámara se movió 10 cm o giró 5°. Con el celular quieto, ARCore
  // aplana el relieve (la profundidad sale del movimiento) y repetir el
  // mismo cuadro solo lo refuerza; además, fundir cada cuadro le costaría
  // a un celular de gama media más de los 33 ms que dura uno.
  let ultimaPose = null;
  const SE_MOVIO = 0.1;
  const GIRO = Math.cos((5 * Math.PI) / 180);
  let ultimoAviso = 0;
  let resolver;
  let rechazar;
  let razonFin = null; // 'terminar' | 'cancelar' | Error
  const fin = new Promise((a, b) => {
    resolver = a;
    rechazar = b;
  });

  const avisar = (forzar = false) => {
    const ahora = performance.now();
    if (!forzar && ahora - ultimoAviso < 250) return;
    ultimoAviso = ahora;
    alAvanzar({
      segundos: (ahora - inicio) / 1000,
      cuadros,
      lados: vuelta.vistos,
      partes: vuelta.partes,
      memoria: tsdf.megabytes,
      lleno: tsdf.lleno,
      sinPose,
    });
  };

  function cuadro(tiempo, frame) {
    if (razonFin) return;
    session.requestAnimationFrame(cuadro);
    const capa = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, capa.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const pose = frame.getViewerPose(ref);
    if (!pose) {
      sinPose++;
      avisar();
      return;
    }
    cuadrosConPose++;
    const vista = pose.views[0];
    let d = null;
    try {
      d = frame.getDepthInformation(vista);
    } catch {
      d = null;
    }
    // Sin profundidad todavía. Si Chrome no dijo qué concedió, a los 10 s
    // con el celular ubicado se concluye que este no la da. Si dijo que SÍ
    // la concedió, no se acusa al celular: se espera hasta 30 s (ARCore solo
    // la da después de mover el celular, y con poca luz tarda) y se dice
    // otra cosa (revisión del 22-oct-2026). El avance sigue: el HUD pide
    // mover el celular.
    if (!d) {
      if (cuadros === 0) {
        if (!habilitadas && cuadrosConPose > 300) terminarCon(new Error('sin-profundidad'));
        else if (habilitadas && cuadrosConPose > 900) terminarCon(new Error('profundidad-no-llega'));
      }
      avisar();
      return;
    }
    const P = d.projectionMatrix || vista.projectionMatrix;
    const M = (d.transform || vista.transform).matrix;
    if (ultimaPose) {
      const movio = Math.hypot(M[12] - ultimaPose[12], M[13] - ultimaPose[13], M[14] - ultimaPose[14]);
      // El coseno entre la dirección a la que miraba (-z de la cámara) y la de ahora.
      const coseno = M[8] * ultimaPose[8] + M[9] * ultimaPose[9] + M[10] * ultimaPose[10];
      if (movio < SE_MOVIO && coseno > GIRO) return;
    }
    ultimaPose = Float32Array.from(M);
    const puntos = puntosDeCuadro((u, v) => d.getDepthInMeters(u, v), P, M);
    // Lo de más de 2,6 m de alto (techos del taller) o muy por debajo de la
    // cámara (un hueco) no es del carro: no se gasta memoria en ello.
    const yCamara = M[13];
    tsdf.integrar([M[12], M[13], M[14]], puntos, (x, y) => y < yCamara + 1.3 && y > yCamara - 2.6);
    vuelta.agregarPuntos(puntos);
    vuelta.marcarCamara(M[12], M[14]);
    cuadros++;
    avisar();
  }

  function terminarCon(razon) {
    if (razonFin) return;
    razonFin = razon;
    session.end().catch(() => {});
  }

  session.addEventListener('end', () => {
    hud.removeEventListener('beforexrselect', sinSelect);
    avisar(true);
    if (razonFin === 'terminar') {
      resolver({ tsdf, cuadros, segundos: (performance.now() - inicio) / 1000, lados: vuelta.vistos });
    } else if (razonFin instanceof Error) {
      rechazar(razonFin);
    } else {
      // 'cancelar', o el sistema cerró la sesión (botón atrás, llamada).
      const e = new Error(razonFin === 'cancelar' ? 'cancelado' : 'interrumpido');
      e.parcial = cuadros > 0 ? { tsdf, cuadros, segundos: (performance.now() - inicio) / 1000, lados: vuelta.vistos } : null;
      rechazar(e);
    }
  });

  // Si Chrome dijo qué concedió y la profundidad no está, no hay escaneo.
  if (habilitadas && !habilitadas.includes('depth-sensing')) {
    terminarCon(new Error('sin-profundidad'));
  } else {
    session.requestAnimationFrame(cuadro);
  }

  return {
    escaneo: {
      terminar: () => terminarCon('terminar'),
      cancelar: () => terminarCon('cancelar'),
    },
    fin,
  };
}
