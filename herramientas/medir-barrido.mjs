// Mide en el PC dos cosas que la app hace sin que nadie toque la foto:
//
//  1. Encontrar la placa cuando la pasada normal no la ve (en sombra, con
//     poca luz, o chica porque el carro salió lejos): pasada "relajada" de
//     color y pasada a 960 px.
//  2. Encontrar el logo SIN placa: barrer la foto con una rejilla de
//     recortes, quedarse con los que más parecen un logo (y menos parecen
//     parrilla, faro, placa, llanta, pared...: las frases de "fondo") y
//     clasificar ahí a tres escalas. Y, con placa, si elegir el punto por
//     "menos fondo" mejora la búsqueda encima de la placa.
//
//   node herramientas/medir-barrido.mjs            → todo
//   node herramientas/medir-barrido.mjs --solo-placa
//   node herramientas/medir-barrido.mjs --solo-logo
//
// Fotos: pruebas/fotos-reconocer/ (10, con la marca y dónde está el logo,
// a ojo) y pruebas/datos-externos/commons-colombia/ (36 sin interiores,
// marca en el nombre). Tarda unos minutos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { ESCALAS_RECORTE, FRASES_FONDO, clasificarLogo, logoSeguro, recorteAlrededor, rejillaDeBarrido } from '../js/logo.js';
import { buscarPlaca, zonaDelLogo } from '../js/placa-foto.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const ESCALA = 100;
// Las rejillas que se comparan: cuántos recortes cuestan y cuánto aciertan.
const REJILLAS = {
  gruesa: { escala: 0.25, paso: 0.15, refinar: 2 },
  media: { escala: 0.2, paso: 0.12, refinar: 2 },
  fina: { escala: 0.16, paso: 0.09, refinar: 3 },
  chica: { escala: 0.12, paso: 0.07, refinar: 3 },
};
const SOLO_PLACA = process.argv.includes('--solo-placa');
const SOLO_LOGO = process.argv.includes('--solo-logo');

function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}
const crudo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'etiquetas-clip.json'), 'utf8'));
const etiquetas = crudo.marcas.map((m) => ({ ...m, e: desdeBase64(m.e) }));

// Las fotos con su marca real (y el logo, donde se sabe).
const MARCAS = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen', 'Honda', 'Mitsubishi', 'Fiat', 'Peugeot', 'Citroen', 'Jeep', 'Subaru', 'BYD', 'Chery', 'JAC', 'Audi', 'BMW', 'Mercedes', 'Volvo', 'MG', 'Changan', 'Haval', 'Lexus', 'Mini', 'Porsche', 'Skoda', 'Dodge', 'Opel', 'Seat', 'Tesla', 'Jaguar'];
const ALIAS = { Citroen: 'Citroën', Mercedes: 'Mercedes-Benz' };
function marcaReal(nombre) {
  const m = MARCAS.find((x) => new RegExp('(^|[_ -])' + x + '([_ -]|$)', 'i').test(nombre));
  return m ? ALIAS[m] || m : '';
}
const CON_LOGO = [
  { f: 'captiva-joan', marca: 'Chevrolet', x: 0.062, y: 0.47 },
  { f: 'duster', marca: 'Renault', x: 0.77, y: 0.45 },
  { f: 'frontier', marca: 'Nissan', x: 0.27, y: 0.51 },
  { f: 'logan', marca: 'Renault', x: 0.086, y: 0.57 },
  { f: 'mazda3', marca: 'Mazda', x: 0.09, y: 0.56 },
  { f: 'onix', marca: 'Chevrolet', x: 0.32, y: 0.69 },
  { f: 'picanto', marca: 'Kia', x: 0.82, y: 0.52 },
  { f: 'spark', marca: 'Chevrolet', x: 0.83, y: 0.63 },
  { f: 'tucson', marca: 'Hyundai', x: 0.865, y: 0.46 },
  { f: 'versa', marca: 'Nissan', x: 0.71, y: 0.61 },
];
const fotos = CON_LOGO.map((f) => ({ ...f, ruta: path.join(RAIZ, 'pruebas', 'fotos-reconocer', f.f + '.jpg'), grupo: 'toque' }));
const carpetaCommons = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
if (fs.existsSync(carpetaCommons)) {
  for (const a of fs.readdirSync(carpetaCommons).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort()) {
    fotos.push({ f: a.replace(/\.[^.]+$/, '').slice(0, 40), marca: marcaReal(a), ruta: path.join(carpetaCommons, a), grupo: 'commons' });
  }
}

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
async function vectorTexto(frases) {
  const { text_embeds } = await modeloTexto(tokenizador(frases, { padding: true, truncation: true }));
  const vs = text_embeds.tolist().map(normalizar);
  return normalizar(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));
}
// Las frases de fondo, un vector por grupo (como las escribirá calcular-etiquetas).
const fondo = [];
for (const [nombre, frases] of Object.entries(FRASES_FONDO)) fondo.push({ nombre, e: await vectorTexto(frases) });

let inferencias = 0;
const cacheVectores = new Map();
async function vectorRecorte(foto, r) {
  const clave = r.x1 + ',' + r.y1 + ',' + r.lado;
  if (!foto.cache.has(clave)) {
    const { image_embeds } = await vision(await procesador(await foto.imagen.crop([r.x1, r.y1, r.x2, r.y2])));
    const v = Array.from(image_embeds.data);
    const n = Math.hypot(...v);
    foto.cache.set(clave, v.map((x) => x / n));
    inferencias += 1;
  }
  return foto.cache.get(clave);
}

// Clasifica un punto a las tres escalas del toque.
async function marcaEnPunto(foto, p, opciones = {}) {
  const vectores = [];
  for (const escala of ESCALAS_RECORTE) vectores.push(await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, p.x, p.y, escala)));
  return clasificarLogo(vectores, etiquetas, { escala: ESCALA, ...opciones });
}

// Puntaje de "aquí hay un logo" de un recorte: la probabilidad del mejor
// logo (lo de hoy) o 1 - fondo (con las frases de fondo en la misma softmax).
function puntajes(vector) {
  const soloLogos = clasificarLogo([vector], etiquetas, { escala: ESCALA });
  const conFondo = clasificarLogo([vector], etiquetas, { escala: ESCALA, fondo });
  return { top1: soloLogos[0].p, logo: 1 - conFondo.fondo, top1ConFondo: conFondo[0].p };
}

const resultados = [];
const t0 = Date.now();
for (const foto of fotos) {
  const original = await RawImage.read(foto.ruta);
  const factor = Math.min(1, 1600 / Math.max(original.width, original.height));
  foto.imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
  foto.cache = new Map();
  const fila = { f: foto.f, grupo: foto.grupo, marca: foto.marca };

  // ---- La placa: normal, relajada, chica ----
  const chica = await foto.imagen.resize(640, Math.round((foto.imagen.height * 640) / foto.imagen.width));
  const normal = buscarPlaca(chica.data, chica.width, chica.height, chica.channels);
  const relajada = normal ? null : buscarPlaca(chica.data, chica.width, chica.height, chica.channels, { relajado: true });
  let enGrande = null;
  if (!normal && !relajada) {
    const grande = await foto.imagen.resize(960, Math.round((foto.imagen.height * 960) / foto.imagen.width));
    enGrande = buscarPlaca(grande.data, grande.width, grande.height, grande.channels) || buscarPlaca(grande.data, grande.width, grande.height, grande.channels, { relajado: true });
  }
  const placa = normal || relajada || enGrande;
  fila.placa = normal ? 'normal' : relajada ? 'relajada' : enGrande ? 'a 960' : '';
  if (placa) fila.placaCaja = placa;
  if (SOLO_PLACA) {
    resultados.push(fila);
    continue;
  }

  // ---- El logo encima de la placa: punto por top1 (hoy) o por menos fondo ----
  if (placa) {
    const zona = zonaDelLogo(placa);
    const escalaChica = Math.max(0.06, Math.min(0.12, zona.escala * 0.7));
    const candidatos = [];
    for (const punto of zona.puntos) {
      const v = await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, punto.x, punto.y, escalaChica));
      candidatos.push({ punto, ...puntajes(v), v });
    }
    for (const criterio of ['top1', 'logo']) {
      const mejor = [...candidatos].sort((a, b) => b[criterio] - a[criterio])[0];
      if (!mejor) continue;
      const vectores = [mejor.v];
      for (const escala of [escalaChica * 1.6, escalaChica * 2.5]) {
        vectores.push(await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, mejor.punto.x, mejor.punto.y, Math.min(0.3, escala))));
      }
      const lista = clasificarLogo(vectores, etiquetas, { escala: ESCALA });
      const listaFondo = clasificarLogo(vectores, etiquetas, { escala: ESCALA, fondo });
      fila['zona_' + criterio] = { nombre: lista[0].nombre, p: lista[0].p, seguro: logoSeguro(lista), conFondo: { nombre: listaFondo[0].nombre, p: listaFondo[0].p, seguro: logoSeguro(listaFondo), fondo: listaFondo.fondo } };
    }
  }

  // ---- El barrido sin placa ----
  for (const [nombre, config] of Object.entries(REJILLAS)) {
    const puntos = rejillaDeBarrido(config);
    const candidatos = [];
    for (const punto of puntos) {
      const v = await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, punto.x, punto.y, config.escala));
      candidatos.push({ punto, ...puntajes(v) });
    }
    for (const criterio of ['top1', 'logo']) {
      const mejores = [...candidatos].sort((a, b) => b[criterio] - a[criterio]).slice(0, config.refinar);
      let ganador = null;
      for (const c of mejores) {
        const lista = await marcaEnPunto(foto, c.punto);
        const listaFondo = await marcaEnPunto(foto, c.punto, { fondo });
        const r = { punto: c.punto, nombre: lista[0].nombre, p: lista[0].p, seguro: logoSeguro(lista), conFondo: { nombre: listaFondo[0].nombre, p: listaFondo[0].p, seguro: logoSeguro(listaFondo) } };
        if (!ganador || r.p > ganador.p) ganador = r;
      }
      fila['barrido_' + nombre + '_' + criterio] = { ...ganador, recortes: puntos.length + mejores.length * 3 };
    }
  }
  resultados.push(fila);
  process.stdout.write('.');
}
console.log('\n' + fotos.length + ' fotos, ' + inferencias + ' inferencias, ' + Math.round((Date.now() - t0) / 1000) + ' s\n');

// ---- Informe ----
const conMarca = resultados.filter((r) => r.marca);
console.log('PLACA: normal ' + resultados.filter((r) => r.placa === 'normal').length + ', relajada ' + resultados.filter((r) => r.placa === 'relajada').length + ', a 960 ' + resultados.filter((r) => r.placa === 'a 960').length + ', sin placa ' + resultados.filter((r) => !r.placa).length + ' de ' + resultados.length);
for (const r of resultados.filter((x) => x.placa && x.placa !== 'normal')) {
  const c = r.placaCaja;
  console.log('  ' + r.placa.padEnd(9) + r.f.padEnd(42) + 'x ' + c.x.toFixed(2) + ' y ' + c.y.toFixed(2) + ' w ' + c.w.toFixed(3) + ' h ' + c.h.toFixed(3) + ' oscuros ' + (c.oscuros || 0).toFixed(2) + ' huecos ' + c.huecos.toFixed(3));
}
if (SOLO_PLACA) process.exit(0);

function resumen(clave, lector) {
  const filas = conMarca.filter((r) => r[clave]);
  let bien = 0, segBien = 0, segMal = 0;
  for (const r of filas) {
    const x = lector(r[clave]);
    if (x.nombre === r.marca) bien += 1;
    if (x.seguro && x.nombre === r.marca) segBien += 1;
    if (x.seguro && x.nombre !== r.marca) segMal += 1;
  }
  return filas.length + ' fotos: bien ' + bien + ', segura bien ' + segBien + ', segura MAL ' + segMal;
}
console.log('\nLOGO ENCIMA DE LA PLACA (fotos con placa y marca conocida)');
for (const criterio of ['top1', 'logo']) {
  console.log('  punto por ' + criterio.padEnd(5) + ' · marcas sin fondo: ' + resumen('zona_' + criterio, (x) => x));
  console.log('  punto por ' + criterio.padEnd(5) + ' · marcas con fondo: ' + resumen('zona_' + criterio, (x) => x.conFondo));
}
console.log('\nBARRIDO SIN TOQUE (todas las fotos con marca conocida)');
for (const nombre of Object.keys(REJILLAS)) {
  for (const criterio of ['top1', 'logo']) {
    const clave = 'barrido_' + nombre + '_' + criterio;
    const recortes = (conMarca.find((r) => r[clave]) || {})[clave]?.recortes;
    console.log('  ' + nombre.padEnd(8) + criterio.padEnd(5) + ' (' + recortes + ' recortes) sin fondo: ' + resumen(clave, (x) => x) + ' | con fondo: ' + resumen(clave, (x) => x.conFondo));
  }
}
// Dónde cayó el barrido frente al logo real (las diez con coordenadas).
console.log('\nDISTANCIA DEL BARRIDO AL LOGO REAL (fracción de la foto; el toque admite ~0,03)');
for (const r of resultados.filter((x) => x.grupo === 'toque')) {
  const foto = CON_LOGO.find((f) => f.f === r.f);
  const partes = [];
  for (const nombre of Object.keys(REJILLAS)) {
    for (const criterio of ['top1', 'logo']) {
      const g = r['barrido_' + nombre + '_' + criterio];
      partes.push(nombre + '/' + criterio + ' ' + Math.hypot(g.punto.x - foto.x, g.punto.y - foto.y).toFixed(2) + ' ' + g.nombre.slice(0, 9) + ' ' + Math.round(g.p * 100) + '%');
    }
  }
  console.log('  ' + r.f.padEnd(14) + r.marca.padEnd(10) + partes.join(' | '));
}
console.log('\nPOR FOTO (marca real → zona por logo con fondo / barrido media por logo con fondo)');
for (const r of conMarca) {
  const z = r.zona_logo ? r.zona_logo.conFondo.nombre + ' ' + Math.round(r.zona_logo.conFondo.p * 100) + '%' + (r.zona_logo.conFondo.seguro ? '!' : '') : '-';
  const b = r.barrido_media_logo ? r.barrido_media_logo.conFondo.nombre + ' ' + Math.round(r.barrido_media_logo.conFondo.p * 100) + '%' + (r.barrido_media_logo.conFondo.seguro ? '!' : '') : '-';
  console.log('  ' + r.f.padEnd(42) + r.marca.padEnd(11) + (r.placa || 'sin placa').padEnd(10) + z.padEnd(22) + b);
}
// El detalle por foto, para mirarlo sin volver a correr (fuera de git: datos-externos).
fs.writeFileSync(path.join(RAIZ, 'pruebas', 'datos-externos', 'medir-barrido.resultado.json'), JSON.stringify(resultados, null, 1));
