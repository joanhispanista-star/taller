// Leer la placa de la foto, en el navegador: ubicarla por su amarillo,
// sacar sus esquinas, enderezarla (placa-foto.js) y pasársela al lector
// de placas fast-plate-ocr (modelo cct_xs_v2_global, MIT, 3,3 MB en ONNX,
// en js/vendor/placa), que corre con el mismo motor ONNX Runtime que ya
// usa el reconocedor de carros (js/vendor/transformers, la misma versión).
//
// Medido el 16-oct-2026: con 60 placas colombianas de ejemplo (del mismo
// proyecto) lee bien 56 en unos 8 ms cada una en el PC; las que falla son
// de un carácter (6 por 8, M por W). Con la foto de la Captiva de Joan
// (placa de tres cuartos, a 30°) lee "JRK248" por JRX248: la X en ángulo
// le parece K, igual que a Tesseract (que se probó y se descartó: 23 MB y
// peor). Por eso lo leído se muestra como propuesta ("Placa leída de la
// foto: revísala") y nunca se guarda sin que la persona la vea.
import { binarizarPlaca, buscarPlaca, cerrarMascara, esquinasDePlaca, mascaraAmarilla, rectificarPlaca, textoAPlaca } from './placa-foto.js';

const LADOS_BUSQUEDA = [640, 960]; // para ubicar la placa: 640 sobra; 960 solo si a 640 no sale (placa chica)
const LADO_LECTURA = 2000; // para leerla, cuanta más nitidez mejor
// Lo que espera el modelo (su plate_config.yaml): 128 × 64 en color, y
// diez huecos con este alfabeto; '_' es relleno.
const ANCHO_MODELO = 128;
const ALTO_MODELO = 64;
const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
const HUECOS = 10;

let lector = null; // la promesa de { ort, sesion }, una sola vez

async function prepararLector(alAvanzar = () => {}) {
  if (!lector) {
    lector = (async () => {
      alAvanzar('Abriendo el lector de placas…');
      const ort = await import('./vendor/placa/ort.wasm.min.mjs');
      // El motor wasm es el que ya viaja con el reconocedor; un solo hilo
      // por lo mismo que allá (sin cabeceras COOP/COEP).
      ort.env.wasm.wasmPaths = new URL('./vendor/transformers/', import.meta.url).href;
      // El modelo es chico (3 MB, 8 ms): con un hilo basta y no compite
      // con el reconocedor del carro, que sí usa varios.
      ort.env.wasm.numThreads = 1;
      const sesion = await ort.InferenceSession.create(new URL('./vendor/placa/cct_xs_v2_global.onnx', import.meta.url).href, { executionProviders: ['wasm'] });
      return { ort, sesion };
    })().catch((e) => {
      lector = null; // la próxima vez se vuelve a intentar
      throw e;
    });
  }
  return lector;
}

function lienzo(ancho, alto) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(ancho, alto);
  return Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
}

// Los píxeles de la foto a un lado máximo dado (RGBA), con el canvas.
async function pixelesDe(archivo, ladoMaximo) {
  const bitmap = await createImageBitmap(archivo);
  const factor = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * factor));
  const alto = Math.max(1, Math.round(bitmap.height * factor));
  const l = lienzo(ancho, alto);
  const ctx = l.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  return { datos: ctx.getImageData(0, 0, ancho, alto).data, ancho, alto };
}

// RGBA de cualquier tamaño → RGB uint8 de 128 × 64 (lo que come el modelo).
function reducirParaElModelo(pixeles, ancho, alto) {
  const origen = lienzo(ancho, alto);
  origen.getContext('2d').putImageData(new ImageData(pixeles, ancho, alto), 0, 0);
  const chico = lienzo(ANCHO_MODELO, ALTO_MODELO);
  const ctx = chico.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(origen, 0, 0, ANCHO_MODELO, ALTO_MODELO);
  const rgba = ctx.getImageData(0, 0, ANCHO_MODELO, ALTO_MODELO).data;
  const rgb = new Uint8Array(ANCHO_MODELO * ALTO_MODELO * 3);
  for (let i = 0; i < ANCHO_MODELO * ALTO_MODELO; i++) {
    rgb[i * 3] = rgba[i * 4];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return rgb;
}

// Corre el modelo sobre una placa ya plana. Devuelve el texto crudo y la
// confianza del carácter menos seguro (la del modelo, 0 a 1).
async function leerPlana(pixeles, ancho, alto, { ort, sesion }) {
  const rgb = reducirParaElModelo(pixeles, ancho, alto);
  const entrada = new ort.Tensor('uint8', rgb, [1, ALTO_MODELO, ANCHO_MODELO, 3]);
  const salida = await sesion.run({ [sesion.inputNames[0]]: entrada });
  const datos = salida[sesion.outputNames[0]].data;
  const n = ALFABETO.length;
  let texto = '';
  let confianza = 1;
  for (let h = 0; h < HUECOS; h++) {
    let mejor = 0;
    for (let k = 1; k < n; k++) if (datos[h * n + k] > datos[h * n + mejor]) mejor = k;
    if (ALFABETO[mejor] !== '_') {
      texto += ALFABETO[mejor];
      confianza = Math.min(confianza, datos[h * n + mejor]);
    }
  }
  return { texto, confianza };
}

// Ubica la placa en la foto (rápido, sin modelo). Devuelve { placa,
// esquinas } con todo en fracciones del ancho y del alto, o null si no hay
// placa amarilla. Sirve también para buscar el logo encima.
//
// Tres pasadas, de la más estricta a la más abierta, y se queda con la
// primera que encuentra algo: el amarillo normal a 640 px; el amarillo
// relajado (placa en sombra o bajo techo) a 640; y las dos otra vez a 960
// px para una placa chica (el carro salió lejos). `pasada` dice cuál fue,
// para el detalle de la ficha.
export async function ubicarPlaca(archivo) {
  let anterior = 0;
  for (const lado of LADOS_BUSQUEDA) {
    const { datos, ancho, alto } = await pixelesDe(archivo, lado);
    // Una foto chica da los mismos píxeles a 640 que "a 960": no se repite.
    const mayor = Math.max(ancho, alto);
    if (mayor <= anterior) break;
    anterior = mayor;
    for (const relajado of [false, true]) {
      // A 960 solo se buscan placas chicas (el carro lejos): lo grande ya
      // se habría visto a 640, y lo que aparece nuevo y grande no es placa.
      const placa = buscarPlaca(datos, ancho, alto, 4, { relajado, soloChicas: lado !== LADOS_BUSQUEDA[0] });
      if (!placa) continue;
      const mascara = cerrarMascara(mascaraAmarilla(datos, ancho, alto, 4, relajado), ancho, alto, 2);
      const caja = {
        x1: Math.round(placa.x * ancho),
        y1: Math.round(placa.y * alto),
        x2: Math.round((placa.x + placa.w) * ancho) - 1,
        y2: Math.round((placa.y + placa.h) * alto) - 1,
      };
      const pasada = (relajado ? 'amarillo en sombra' : 'amarillo normal') + (lado !== LADOS_BUSQUEDA[0] ? ', a ' + mayor + ' px' : '');
      return { placa, esquinas: esquinasDePlaca(mascara, ancho, alto, caja), pasada };
    }
  }
  return null;
}

// Lee la placa: endereza por las esquinas desde la foto a buena
// resolución y la manda al modelo; si lo leído no parece placa, prueba
// con la versión en blanco y negro. Devuelve { placa: 'JRX248' | '',
// crudo, confianza, milisegundos } o null si no hay placa en la foto.
export async function leerPlacaDeFoto(archivo, ubicacion = null, alAvanzar = () => {}) {
  const inicio = performance.now();
  const donde = ubicacion || (await ubicarPlaca(archivo));
  if (!donde || !donde.esquinas) return null;
  alAvanzar('Enderezando la placa…');
  const { datos, ancho, alto } = await pixelesDe(archivo, LADO_LECTURA);
  const plana = rectificarPlaca(datos, ancho, alto, 4, donde.esquinas, 660, 320);
  if (!plana) return null;
  const motor = await prepararLector(alAvanzar);
  alAvanzar('Leyendo la placa…');
  let lectura = await leerPlana(plana.pixeles, plana.ancho, plana.alto, motor);
  let placa = textoAPlaca(lectura.texto);
  if (!placa) {
    const { pixeles } = binarizarPlaca(plana.pixeles, plana.ancho, plana.alto, 4);
    const otra = await leerPlana(pixeles, plana.ancho, plana.alto, motor);
    const otraPlaca = textoAPlaca(otra.texto);
    if (otraPlaca) {
      lectura = otra;
      placa = otraPlaca;
    }
  }
  return { placa, crudo: lectura.texto, confianza: lectura.confianza, milisegundos: Math.round(performance.now() - inicio) };
}
