// Mide en el PC la cadena completa "una sola foto": encontrar la placa
// amarilla, buscar el logo encima y decir la marca (como hace el teléfono
// sin que nadie toque nada), y leer la placa. Sobre las fotos libres de
// carros en Colombia bajadas de Wikimedia Commons
// (pruebas/datos-externos/commons-colombia/, con bajar-fotos-commons.mjs),
// cuyo nombre trae la marca real. Las de interior se saltan.
//
//   node herramientas/medir-cadena.mjs
//
// Imprime por foto: placa encontrada o no, marca que da el logo encima de
// la placa (y si es "segura"), y la placa leída. Al final, los totales.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-node';
import { clasificarLogo, logoSeguro, recorteAlrededor } from '../js/logo.js';
import { buscarPlaca, cerrarMascara, esquinasDePlaca, mascaraAmarilla, rectificarPlaca, textoAPlaca, zonaDelLogo } from '../js/placa-foto.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const CARPETA = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
const ESCALA = 100;
const REFINAR = process.argv.includes('--refinar');
const FILAS = (process.argv.find((a) => a.startsWith('--filas=')) || '').slice(8).split(',').filter(Boolean).map(Number);
const SOLO_RESUMEN = process.argv.includes('--resumen');

// Las etiquetas que viajan con la app (frases por logo, Int8 en base64).
function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}
const etiquetas = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'etiquetas-clip.json'), 'utf8')).marcas.map((m) => ({ ...m, e: desdeBase64(m.e) }));

// La marca real, del nombre del archivo.
const MARCAS = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen', 'Honda', 'Mitsubishi', 'Fiat', 'Peugeot', 'Citroen', 'Jeep', 'Subaru', 'BYD', 'Chery', 'JAC', 'Audi', 'BMW', 'Mercedes', 'Volvo', 'MG', 'Changan', 'Haval', 'Lexus', 'Mini', 'Porsche', 'Skoda', 'Dodge', 'Opel', 'Seat', 'Tesla', 'Jaguar'];
const ALIAS = { Citroen: 'Citroën', Mercedes: 'Mercedes-Benz' };
function marcaReal(nombre) {
  const m = MARCAS.find((x) => new RegExp('(^|[_ -])' + x + '([_ -]|$)', 'i').test(nombre));
  return m ? ALIAS[m] || m : '';
}

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorImagen(imagen) {
  const { image_embeds } = await vision(await procesador(imagen));
  const v = Array.from(image_embeds.data);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const lector = await ort.InferenceSession.create(path.join(RAIZ, 'js', 'vendor', 'placa', 'cct_xs_v2_global.onnx'));
const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
async function leerPlana(plana) {
  const chica = await new RawImage(plana.pixeles, plana.ancho, plana.alto, 4).resize(128, 64);
  const rgb = new Uint8Array(128 * 64 * 3);
  for (let i = 0; i < 128 * 64; i++) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = chica.data[i * chica.channels + k];
  const salida = await lector.run({ [lector.inputNames[0]]: new ort.Tensor('uint8', rgb, [1, 64, 128, 3]) });
  const datos = salida[lector.outputNames[0]].data;
  let texto = '';
  for (let h = 0; h < 10; h++) {
    let mejor = 0;
    for (let k = 1; k < 37; k++) if (datos[h * 37 + k] > datos[h * 37 + mejor]) mejor = k;
    if (ALFABETO[mejor] !== '_') texto += ALFABETO[mejor];
  }
  return texto;
}

const totales = { fotos: 0, conPlaca: 0, marcaBien: 0, marcaSegura: 0, marcaSeguraMal: 0, placaLeida: 0, marcaDeTexto: 0 };
const archivos = fs.readdirSync(CARPETA).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort();
const t0 = Date.now();
for (const archivo of archivos) {
  const real = marcaReal(archivo);
  const original = await RawImage.read(path.join(CARPETA, archivo));
  // Como en el teléfono: 1600 px para el logo, 640 para ubicar la placa.
  const factor = Math.min(1, 1600 / Math.max(original.width, original.height));
  const imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
  const chica = await imagen.resize(640, Math.round((imagen.height * 640) / imagen.width));
  const placa = buscarPlaca(chica.data, chica.width, chica.height, chica.channels);
  totales.fotos += 1;
  let linea = archivo.replace(/\.[^.]+$/, '').slice(0, 52).padEnd(53) + (real || '?').padEnd(11);
  if (!placa) {
    console.log(linea + 'sin placa');
    continue;
  }
  totales.conPlaca += 1;
  // El logo encima de la placa, como reconocerMarcaCercaDePlaca.
  const zona = zonaDelLogo(placa, FILAS.length ? { filas: FILAS } : {});
  const escalaChica = Math.max(0.06, Math.min(0.12, zona.escala * 0.7));
  const candidatos = [];
  for (const punto of zona.puntos) {
    const r = recorteAlrededor(imagen.width, imagen.height, punto.x, punto.y, escalaChica);
    const v = await vectorImagen(await imagen.crop([r.x1, r.y1, r.x2, r.y2]));
    const lista = clasificarLogo([v], etiquetas, { escala: ESCALA });
    candidatos.push({ punto, p: lista[0].p, v });
  }
  candidatos.sort((a, b) => b.p - a.p);
  if (candidatos.length === 0) {
    console.log(linea + 'placa pegada al borde: sin zona encima');
    continue;
  }
  // Las tres escalas en la mejor posición (la app hoy) o en las tres
  // mejores, quedándose con la que gana con más fuerza (--refinar).
  let marcas = null;
  for (const c of candidatos.slice(0, REFINAR ? 3 : 1)) {
    const vectores = [c.v];
    for (const escala of [escalaChica * 1.6, escalaChica * 2.5]) {
      const r = recorteAlrededor(imagen.width, imagen.height, c.punto.x, c.punto.y, Math.min(0.3, escala));
      vectores.push(await vectorImagen(await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
    }
    const lista = clasificarLogo(vectores, etiquetas, { escala: ESCALA });
    if (!marcas || lista[0].p > marcas[0].p) marcas = lista;
  }
  const seguro = logoSeguro(marcas);
  const bien = real && marcas[0].nombre === real;
  if (bien) totales.marcaBien += 1;
  if (seguro && bien) totales.marcaSegura += 1;
  if (seguro && real && !bien) totales.marcaSeguraMal += 1;
  // La placa leída.
  const mascara = cerrarMascara(mascaraAmarilla(chica.data, chica.width, chica.height, chica.channels), chica.width, chica.height, 2);
  const caja = { x1: Math.round(placa.x * chica.width), y1: Math.round(placa.y * chica.height), x2: Math.round((placa.x + placa.w) * chica.width) - 1, y2: Math.round((placa.y + placa.h) * chica.height) - 1 };
  const esquinas = esquinasDePlaca(mascara, chica.width, chica.height, caja);
  const fuente = await imagen.rgba();
  const plana = rectificarPlaca(fuente.data, fuente.width, fuente.height, 4, esquinas, 660, 320);
  const crudo = plana ? await leerPlana(plana) : '';
  const leida = textoAPlaca(crudo);
  if (leida) totales.placaLeida += 1;
  linea += (marcas[0].nombre + ' ' + Math.round(marcas[0].p * 100) + '%' + (seguro ? ' seguro' : '')).padEnd(26) + (bien ? 'BIEN ' : real ? 'mal  ' : '?    ') + 'placa: ' + (leida || '(' + crudo + ')');
  if (!SOLO_RESUMEN) console.log(linea);
}
console.log('\n' + totales.fotos + ' fotos (sin interiores), ' + Math.round((Date.now() - t0) / 1000) + ' s');
console.log('  con placa encontrada: ' + totales.conPlaca);
console.log('  marca bien de primera (de las que tienen placa): ' + totales.marcaBien + '; segura y bien: ' + totales.marcaSegura + '; segura y MAL: ' + totales.marcaSeguraMal);
console.log('  placa con formato leída: ' + totales.placaLeida + ' (la real no se sabe: hay que mirarlas)');
