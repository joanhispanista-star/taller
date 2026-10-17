// Mide en el PC la cadena completa "una sola foto" tal como la corre el
// teléfono (garaje-pantalla.js, leerPlacaYLogo): ubicar la placa amarilla
// (tres pasadas, como ubicarPlaca), buscar el logo encima de ella; si no
// quedó seguro, o si no hay placa, barrer la foto (reconocerMarcaBarriendo)
// y quedarse con el que gane (logoQueQueda); y leer la placa. Las
// constantes (rejilla, criterios) salen de js/logo.js, las mismas que usa
// la app.
//
// Fotos: pruebas/fotos-reconocer/ (las 10 de Joan y de la web) y
// pruebas/datos-externos/commons-colombia/ (las de Commons, con la marca
// en el nombre; bajar-fotos-commons.mjs). Las de interior se saltan.
//
//   node herramientas/medir-cadena.mjs             → todo, foto por foto
//   node herramientas/medir-cadena.mjs --resumen   → solo los totales
//   node herramientas/medir-cadena.mjs --sin-barrido → como antes del 17-oct
//   node herramientas/medir-cadena.mjs --reducir=1280 → fotos como las de WhatsApp
//
// Imprime por foto: dónde se encontró la placa (o no), la marca que quedó,
// por qué camino (encima de la placa o barriendo), si es "segura", y la
// placa leída. Al final, los totales. Tarda unos 5 minutos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-node';
import { CRITERIO_BARRIDO, CRITERIO_ZONA, ESCALAS_RECORTE, FONDO_AL_DECIDIR, REJILLA_BARRIDO, clasificarLogo, decidirBarrido, logoQueQueda, logoSeguro, recorteAlrededor, rejillaDeBarrido } from '../js/logo.js';
import { buscarPlaca, cerrarMascara, esquinasDePlaca, mascaraAmarilla, rectificarPlaca, textoAPlaca, zonaDelLogo } from '../js/placa-foto.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const ESCALA = 100;
const SOLO_RESUMEN = process.argv.includes('--resumen');
const SIN_BARRIDO = process.argv.includes('--sin-barrido');
// --reducir=1280: cada foto se achica primero a ese lado mayor, como llega
// una foto reenviada por WhatsApp (17-oct: con la miniatura de 1280 px del
// Fiat Pulse el logo encima de la placa ya no se ve; con la de 1920, sí).
const REDUCIR = Number((process.argv.find((a) => a.startsWith('--reducir=')) || '').slice(10)) || 0;

// Las etiquetas que viajan con la app (frases por logo y de fondo, Int8 en base64).
function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}
const crudo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'etiquetas-clip.json'), 'utf8'));
const etiquetas = {
  marcas: crudo.marcas.map((m) => ({ ...m, e: desdeBase64(m.e) })),
  fondo: (crudo.fondo || []).map((f) => ({ ...f, e: desdeBase64(f.e) })),
};
if (!etiquetas.fondo.length) console.warn('OJO: etiquetas-clip.json no trae fondo; el barrido elige por top1 (corre calcular-etiquetas.mjs)');

// La marca real: de la lista para las fotos de Joan, del nombre para Commons.
const MARCAS = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen', 'Honda', 'Mitsubishi', 'Fiat', 'Peugeot', 'Citroen', 'Jeep', 'Subaru', 'BYD', 'Chery', 'JAC', 'Audi', 'BMW', 'Mercedes', 'Volvo', 'MG', 'Changan', 'Haval', 'Lexus', 'Mini', 'Porsche', 'Skoda', 'Dodge', 'Opel', 'Seat', 'Tesla', 'Jaguar'];
const ALIAS = { Citroen: 'Citroën', Mercedes: 'Mercedes-Benz' };
function marcaReal(nombre) {
  const m = MARCAS.find((x) => new RegExp('(^|[_ -])' + x + '([_ -]|$)', 'i').test(nombre));
  return m ? ALIAS[m] || m : '';
}
const DE_JOAN = { 'captiva-joan': 'Chevrolet', duster: 'Renault', frontier: 'Nissan', logan: 'Renault', mazda3: 'Mazda', onix: 'Chevrolet', picanto: 'Kia', spark: 'Chevrolet', tucson: 'Hyundai', versa: 'Nissan' };
const fotos = [];
for (const [f, marca] of Object.entries(DE_JOAN)) fotos.push({ nombre: f, marca, ruta: path.join(RAIZ, 'pruebas', 'fotos-reconocer', f + '.jpg') });
const CARPETA = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
if (fs.existsSync(CARPETA)) {
  for (const a of fs.readdirSync(CARPETA).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort()) {
    fotos.push({ nombre: a.replace(/\.[^.]+$/, ''), marca: marcaReal(a), ruta: path.join(CARPETA, a) });
  }
}

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
let pasadasClip = 0;
const vistosPorImagen = new WeakMap();
async function vectorRecorte(imagen, r) {
  // Como reconocerMarcaBarriendo: el mismo recorte no se paga dos veces.
  const clave = r.x1 + ',' + r.y1 + ',' + r.lado;
  const vistos = vistosPorImagen.get(imagen) || new Map();
  vistosPorImagen.set(imagen, vistos);
  if (vistos.has(clave)) return vistos.get(clave);
  const { image_embeds } = await vision(await procesador(await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
  pasadasClip += 1;
  const v = Array.from(image_embeds.data);
  const n = Math.hypot(...v);
  vistos.set(clave, v.map((x) => x / n));
  return vistos.get(clave);
}
// Como puntajeDeLogo de reconocer.js.
function puntajeDeLogo(vector, criterio) {
  if (criterio === 'logo' && etiquetas.fondo.length) return 1 - clasificarLogo([vector], etiquetas.marcas, { escala: ESCALA, fondo: etiquetas.fondo }).fondo;
  return clasificarLogo([vector], etiquetas.marcas, { escala: ESCALA })[0].p;
}
const fondoAlDecidir = FONDO_AL_DECIDIR ? etiquetas.fondo : [];

// Como reconocerMarcaCercaDePlaca.
async function logoEncimaDePlaca(imagen, placa) {
  const zona = zonaDelLogo(placa);
  if (zona.puntos.length === 0) return null;
  const escalaChica = Math.max(0.06, Math.min(0.12, zona.escala * 0.7));
  let mejor = null;
  for (const punto of zona.puntos) {
    const vector = await vectorRecorte(imagen, recorteAlrededor(imagen.width, imagen.height, punto.x, punto.y, escalaChica));
    const puntaje = puntajeDeLogo(vector, CRITERIO_ZONA);
    if (!mejor || puntaje > mejor.puntaje) mejor = { punto, puntaje, vector };
  }
  const vectores = [mejor.vector];
  for (const escala of [escalaChica * 1.6, escalaChica * 2.5]) vectores.push(await vectorRecorte(imagen, recorteAlrededor(imagen.width, imagen.height, mejor.punto.x, mejor.punto.y, Math.min(0.3, escala))));
  const marcas = clasificarLogo(vectores, etiquetas.marcas, { escala: ESCALA, fondo: fondoAlDecidir });
  return { marcas, seguro: logoSeguro(marcas), punto: mejor.punto, camino: 'placa' };
}

// Como reconocerMarcaBarriendo.
async function logoBarriendo(imagen) {
  const candidatos = [];
  for (const punto of rejillaDeBarrido(REJILLA_BARRIDO)) {
    const vector = await vectorRecorte(imagen, recorteAlrededor(imagen.width, imagen.height, punto.x, punto.y, REJILLA_BARRIDO.escala));
    candidatos.push({ punto, puntaje: puntajeDeLogo(vector, CRITERIO_BARRIDO) });
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  const elegidos = candidatos.slice(0, REJILLA_BARRIDO.refinar);
  const refinados = [];
  for (const c of elegidos) {
    const vectores = [];
    for (const escala of ESCALAS_RECORTE) vectores.push(await vectorRecorte(imagen, recorteAlrededor(imagen.width, imagen.height, c.punto.x, c.punto.y, escala)));
    refinados.push(clasificarLogo(vectores, etiquetas.marcas, { escala: ESCALA, fondo: fondoAlDecidir }));
  }
  const decision = decidirBarrido(refinados);
  return decision ? { marcas: decision.marcas, seguro: decision.seguro, punto: elegidos[decision.indice].punto, camino: 'barrido' } : null;
}

// Como ubicarPlaca: 640 normal, 640 relajado, 960 normal y relajado solo
// chicas; el lado MAYOR a esa medida, desde la foto original y sin agrandar
// (pixelesDe en placa-ocr.js), y sin repetir si la foto no da para más.
async function ubicar(original) {
  let anterior = 0;
  for (const lado of [640, 960]) {
    const factor = Math.min(1, lado / Math.max(original.width, original.height));
    const chica = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
    const mayor = Math.max(chica.width, chica.height);
    if (mayor <= anterior) break;
    anterior = mayor;
    for (const relajado of [false, true]) {
      const placa = buscarPlaca(chica.data, chica.width, chica.height, chica.channels, { relajado, soloChicas: lado !== 640 });
      if (!placa) continue;
      const mascara = cerrarMascara(mascaraAmarilla(chica.data, chica.width, chica.height, chica.channels, relajado), chica.width, chica.height, 2);
      const caja = { x1: Math.round(placa.x * chica.width), y1: Math.round(placa.y * chica.height), x2: Math.round((placa.x + placa.w) * chica.width) - 1, y2: Math.round((placa.y + placa.h) * chica.height) - 1 };
      return { placa, esquinas: esquinasDePlaca(mascara, chica.width, chica.height, caja), pasada: (relajado ? 'sombra' : 'normal') + (lado !== 640 ? ' 960' : '') };
    }
  }
  return null;
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

const totales = { fotos: 0, conMarcaReal: 0, conPlaca: 0, bien: 0, seguraBien: 0, seguraMal: 0, porPlaca: 0, porBarrido: 0, placaLeida: 0, pasadasPorFoto: [] };
const t0 = Date.now();
for (const foto of fotos) {
  let original = await RawImage.read(foto.ruta);
  if (REDUCIR && Math.max(original.width, original.height) > REDUCIR) {
    const k = REDUCIR / Math.max(original.width, original.height);
    original = await original.resize(Math.round(original.width * k), Math.round(original.height * k));
  }
  // Como en el teléfono: 1600 px para el logo (leerFoto), 2000 para leer la placa.
  const factor = Math.min(1, 1600 / Math.max(original.width, original.height));
  const imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
  totales.fotos += 1;
  if (foto.marca) totales.conMarcaReal += 1;
  const antes = pasadasClip;
  const donde = await ubicar(original);
  let logo = null;
  if (donde) {
    totales.conPlaca += 1;
    logo = await logoEncimaDePlaca(imagen, donde.placa);
  }
  if (!SIN_BARRIDO && !(logo && logo.seguro)) logo = logoQueQueda(logo, await logoBarriendo(imagen));
  totales.pasadasPorFoto.push(pasadasClip - antes);
  let leida = '';
  let crudoLeido = '';
  if (donde && donde.esquinas) {
    const factorL = Math.min(1, 2000 / Math.max(original.width, original.height));
    const grande = factorL < 1 ? await original.resize(Math.round(original.width * factorL), Math.round(original.height * factorL)) : original;
    const fuente = await grande.rgba();
    const plana = rectificarPlaca(fuente.data, fuente.width, fuente.height, 4, donde.esquinas, 660, 320);
    crudoLeido = plana ? await leerPlana(plana) : '';
    leida = textoAPlaca(crudoLeido);
    if (leida) totales.placaLeida += 1;
  }
  const bien = Boolean(logo && foto.marca && logo.marcas[0].nombre === foto.marca);
  if (bien) totales.bien += 1;
  if (logo && logo.seguro && bien) totales.seguraBien += 1;
  if (logo && logo.seguro && foto.marca && !bien) totales.seguraMal += 1;
  if (logo && logo.seguro) totales[logo.camino === 'placa' ? 'porPlaca' : 'porBarrido'] += 1;
  if (!SOLO_RESUMEN) {
    const marca = logo ? logo.marcas[0].nombre + ' ' + Math.round(logo.marcas[0].p * 100) + '%' + (logo.seguro ? ' seguro' : '') + ' (' + logo.camino + ')' : '-';
    console.log(foto.nombre.slice(0, 44).padEnd(45) + (foto.marca || '?').padEnd(11) + (donde ? 'placa ' + donde.pasada : 'sin placa').padEnd(14) + marca.padEnd(34) + (bien ? 'BIEN ' : foto.marca ? 'mal  ' : '?    ') + (donde ? 'placa: ' + (leida || '(' + crudoLeido + ')') : ''));
  }
}
const pasadas = totales.pasadasPorFoto.sort((a, b) => a - b);
console.log('\n' + totales.fotos + ' fotos (sin interiores), ' + Math.round((Date.now() - t0) / 1000) + ' s' + (SIN_BARRIDO ? ', SIN barrido' : '') + (REDUCIR ? ', fotos reducidas a ' + REDUCIR + ' px' : ''));
console.log('  placa encontrada: ' + totales.conPlaca);
console.log('  marca bien de primera: ' + totales.bien + ' de ' + totales.conMarcaReal + '; segura y bien: ' + totales.seguraBien + '; segura y MAL: ' + totales.seguraMal);
console.log('  seguras por el logo encima de la placa: ' + totales.porPlaca + '; por el barrido: ' + totales.porBarrido);
console.log('  placa con formato leída: ' + totales.placaLeida + ' (la real hay que mirarla)');
console.log('  pasadas de CLIP por foto: mediana ' + pasadas[Math.floor(pasadas.length / 2)] + ', máximo ' + pasadas[pasadas.length - 1]);
