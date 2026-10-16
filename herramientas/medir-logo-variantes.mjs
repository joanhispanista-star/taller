// Mide lo que pasa en el TELÉFONO con la marca por el logo: la foto se
// reduce (1600 px en la app; 1000 simula una foto tomada de lejos), el dedo
// no cae exacto sobre el emblema (desvío del 3 % del ancho), y compara
// formas de aguantar eso: más escalas de recorte, quedarse con el recorte
// más seguro en vez del promedio, y buscar alrededor del toque.
//
//   node herramientas/medir-logo-variantes.mjs
//
// Mismas fotos y coordenadas que medir-logo.mjs. Tarda dos o tres minutos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { CATALOGO } from '../js/catalogo-carros.js';
import { clasificarLogo, frasesDeLogo, logoSeguro, marcasConLogo, recorteAlrededor } from '../js/logo.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');

const FOTOS = [
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
const LADOS = [1600, 1000];
const DESVIOS = [
  { nombre: 'exacto', dx: 0, dy: 0 },
  { nombre: 'dedo +x 3%', dx: 0.03, dy: 0 },
  { nombre: 'dedo +y 3%', dx: 0, dy: 0.03 },
];
const ESCALAS = [0.06, 0.1, 0.16, 0.25];

function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
function promedio(vs) {
  return normalizar(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));
}

const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorTexto(frases) {
  const entradas = tokenizador(frases, { padding: true, truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  return promedio(text_embeds.tolist().map(normalizar));
}
const etiquetas = [];
for (const m of marcasConLogo(CATALOGO)) etiquetas.push({ ...m, e: await vectorTexto(frasesDeLogo(m.nombre)) });
console.log(etiquetas.length + ' logos');

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
let inferencias = 0;
async function vectorImagen(imagen) {
  inferencias += 1;
  const entradas = await procesador(imagen);
  const { image_embeds } = await vision(entradas);
  return normalizar(Array.from(image_embeds.data));
}

// Vector del recorte en (fx, fy) a `escala`, con caché por foto reducida.
function recortador(imagen) {
  const cache = new Map();
  return async (fx, fy, escala) => {
    const clave = fx.toFixed(4) + ',' + fy.toFixed(4) + ',' + escala;
    if (!cache.has(clave)) {
      const r = recorteAlrededor(imagen.width, imagen.height, fx, fy, escala);
      cache.set(clave, await vectorImagen(await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
    }
    return cache.get(clave);
  };
}

const resultados = {};
function anotar(clave, lista, marca) {
  const r = (resultados[clave] = resultados[clave] || { aciertos: 0, segurosBien: 0, segurosMal: 0 });
  const bien = lista[0] && lista[0].nombre === marca;
  if (bien) r.aciertos += 1;
  if (logoSeguro(lista)) {
    if (bien) r.segurosBien += 1;
    else r.segurosMal += 1;
  }
}

const t0 = Date.now();
for (const foto of FOTOS) {
  const original = await RawImage.read(path.join(RAIZ, 'pruebas', 'fotos-reconocer', foto.f + '.jpg'));
  for (const lado of LADOS) {
    const factor = lado / Math.max(original.width, original.height);
    const imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
    const vectorEn = recortador(imagen);
    for (const d of DESVIOS) {
      const fx = Math.min(0.999, foto.x + d.dx);
      const fy = Math.min(0.999, foto.y + d.dy);
      const base = 'lado ' + lado + ' · ' + d.nombre;
      const porEscala = {};
      for (const escala of ESCALAS) porEscala[escala] = await vectorEn(fx, fy, escala);
      // Promedio de 3 escalas (la app hoy) y de 4 (con una más chica).
      anotar(base + ' · media 3', clasificarLogo([0.1, 0.16, 0.25].map((e) => porEscala[e]), etiquetas), foto.marca);
      anotar(base + ' · media 4', clasificarLogo(ESCALAS.map((e) => porEscala[e]), etiquetas), foto.marca);
      // La escala más segura en vez del promedio.
      const porSeguridad = ESCALAS.map((e) => clasificarLogo([porEscala[e]], etiquetas)).sort((a, b) => b[0].p - a[0].p)[0];
      anotar(base + ' · la escala mas segura', porSeguridad, foto.marca);
      // Búsqueda alrededor del toque: cinco posiciones a la escala 0,1
      // (centro y ± medio recorte), se queda con la más segura y ahí
      // promedia las tres escalas. Siete inferencias por toque.
      const paso = 0.05;
      const posiciones = [[0, 0], [paso, 0], [-paso, 0], [0, paso], [0, -paso]];
      let mejor = null;
      for (const [ox, oy] of posiciones) {
        const px = Math.max(0, Math.min(0.999, fx + ox));
        const py = Math.max(0, Math.min(0.999, fy + oy));
        const lista = clasificarLogo([await vectorEn(px, py, 0.1)], etiquetas);
        if (!mejor || lista[0].p > mejor.p) mejor = { px, py, p: lista[0].p };
      }
      const enMejor = [0.1, 0.16, 0.25].map((e) => vectorEn(mejor.px, mejor.py, e));
      anotar(base + ' · busqueda alrededor', clasificarLogo(await Promise.all(enMejor), etiquetas), foto.marca);
    }
  }
  console.log(foto.f + ' listo (' + inferencias + ' inferencias, ' + Math.round((Date.now() - t0) / 1000) + ' s)');
}

console.log('\n== aciertos de ' + FOTOS.length + ' fotos (seguros bien / seguros mal) ==');
for (const [k, v] of Object.entries(resultados).sort()) {
  console.log('  ' + k.padEnd(48) + v.aciertos + '  (' + v.segurosBien + ' / ' + v.segurosMal + ')');
}
console.log(inferencias + ' inferencias en ' + Math.round((Date.now() - t0) / 1000) + ' s');
