// Prueba en el PC el lector de placas fast-plate-ocr (modelo cct_xs_v2_global,
// MIT, 3,3 MB en ONNX) sobre la placa de la Captiva enderezada por
// placa-foto.js, y sobre las placas colombianas de ejemplo que trae el
// mismo proyecto (pruebas/datos-externos/fast-plate-ocr/colombia_dataset_example.zip,
// descomprimido en .../colombia/). Compara con Tesseract, que leía la X
// como K.
//
//   node herramientas/medir-placa-onnx.mjs
//
// Entrada del modelo (según su plate_config.yaml): la placa entera a
// img_width × img_height, en gris o RGB según `image_color_mode`, uint8,
// NHWC. Salida: (1, max_plate_slots, alfabeto) → el carácter de más
// probabilidad por hueco, quitando el relleno.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RawImage } from '@huggingface/transformers';
import * as ort from 'onnxruntime-node';
import { buscarPlaca, cerrarMascara, esquinasDePlaca, mascaraAmarilla, rectificarPlaca, textoAPlaca } from '../js/placa-foto.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = path.join(RAIZ, 'pruebas', 'datos-externos', 'fast-plate-ocr');

// El yaml del modelo es plano (clave: valor): no hace falta una librería.
function leerYaml(ruta) {
  const salida = {};
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^([a-z_]+):\s*(.*)$/i.exec(linea.trim());
    if (m) salida[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return salida;
}
const config = leerYaml(path.join(CARPETA, 'cct_xs_v2_global_plate_config.yaml'));
const ANCHO = Number(config.img_width);
const ALTO = Number(config.img_height);
const ALFABETO = config.alphabet;
const HUECOS = Number(config.max_plate_slots);
const RELLENO = config.pad_char;
const GRIS = config.image_color_mode === 'grayscale';
console.log('modelo:', ANCHO + 'x' + ALTO, GRIS ? 'gris' : 'color', 'huecos', HUECOS, 'alfabeto', ALFABETO.length, 'relleno', JSON.stringify(RELLENO));

const sesion = await ort.InferenceSession.create(path.join(CARPETA, 'cct_xs_v2_global.onnx'));
const nombreEntrada = sesion.inputNames[0];
console.log('entrada:', nombreEntrada, 'salida:', sesion.outputNames[0]);

// RGBA → tensor uint8 NHWC (1, ALTO, ANCHO, 1 o 3).
async function leerPlaca(rgba, ancho, alto) {
  const imagen = await new RawImage(rgba, ancho, alto, 4).resize(ANCHO, ALTO);
  const canales = GRIS ? 1 : 3;
  const datos = new Uint8Array(ANCHO * ALTO * canales);
  for (let i = 0; i < ANCHO * ALTO; i++) {
    const r = imagen.data[i * imagen.channels], g = imagen.data[i * imagen.channels + 1], b = imagen.data[i * imagen.channels + 2];
    if (GRIS) datos[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    else {
      datos[i * 3] = r;
      datos[i * 3 + 1] = g;
      datos[i * 3 + 2] = b;
    }
  }
  const t0 = Date.now();
  const salida = await sesion.run({ [nombreEntrada]: new ort.Tensor('uint8', datos, [1, ALTO, ANCHO, canales]) });
  const tensor = salida[sesion.outputNames[0]];
  const n = ALFABETO.length;
  let texto = '';
  let confianzaMinima = 1;
  for (let h = 0; h < HUECOS; h++) {
    let mejor = 0;
    for (let k = 1; k < n; k++) if (tensor.data[h * n + k] > tensor.data[h * n + mejor]) mejor = k;
    const c = ALFABETO[mejor];
    if (c !== RELLENO) {
      texto += c;
      confianzaMinima = Math.min(confianzaMinima, tensor.data[h * n + mejor]);
    }
  }
  return { texto, confianzaMinima, ms: Date.now() - t0 };
}

// 1. La Captiva de Joan, enderezada por sus esquinas.
const original = await RawImage.read(path.join(RAIZ, 'pruebas', 'fotos-reconocer', 'captiva-joan.jpg'));
const chica = await original.resize(640, Math.round((original.height * 640) / original.width));
const placa = buscarPlaca(chica.data, chica.width, chica.height, chica.channels);
const mascara = cerrarMascara(mascaraAmarilla(chica.data, chica.width, chica.height, chica.channels), chica.width, chica.height, 2);
const caja = { x1: Math.round(placa.x * chica.width), y1: Math.round(placa.y * chica.height), x2: Math.round((placa.x + placa.w) * chica.width) - 1, y2: Math.round((placa.y + placa.h) * chica.height) - 1 };
const esquinas = esquinasDePlaca(mascara, chica.width, chica.height, caja);
const fuente = await original.rgba();
for (const [w, h] of [[660, 320], [256, 128]]) {
  const plana = rectificarPlaca(fuente.data, fuente.width, fuente.height, 4, esquinas, w, h);
  const r = await leerPlaca(plana.pixeles, plana.ancho, plana.alto);
  console.log(`captiva-joan plana ${w}x${h}: "${r.texto}" → ${textoAPlaca(r.texto) || '(nada)'} ${textoAPlaca(r.texto) === 'JRX248' ? 'BIEN' : 'mal'} (conf mín ${r.confianzaMinima.toFixed(2)}, ${r.ms} ms)`);
}

// 2. Las placas colombianas de ejemplo del proyecto (ya recortadas), si
// están descomprimidas: el nombre del archivo trae la placa real.
const colombia = path.join(CARPETA, 'colombia');
if (fs.existsSync(colombia)) {
  const archivos = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) recorrer(path.join(d, e.name));
      else if (/\.(jpe?g|png)$/i.test(e.name)) archivos.push(path.join(d, e.name));
    }
  };
  recorrer(colombia);
  let bien = 0;
  const muestra = archivos.slice(0, 60);
  for (const ruta of muestra) {
    const im = await (await RawImage.read(ruta)).rgba();
    const r = await leerPlaca(im.data, im.width, im.height);
    const esperada = (path.basename(ruta).toUpperCase().match(/[A-Z]{3}[0-9]{2}[A-Z0-9]/) || [''])[0];
    const leida = textoAPlaca(r.texto);
    if (leida && leida === esperada) bien += 1;
    else console.log('  ' + path.basename(ruta) + ': "' + r.texto + '" → ' + (leida || '(nada)') + (esperada ? ' (real ' + esperada + ')' : ''));
  }
  console.log('colombia: ' + bien + ' de ' + muestra.length + ' bien');
} else {
  console.log('(sin carpeta colombia/: descomprimir colombia_dataset_example.zip para medir más placas)');
}
