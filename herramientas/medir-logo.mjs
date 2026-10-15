// Mide en el PC si CLIP reconoce la MARCA por el logo cuando se le da un
// recorte alrededor del emblema (lo que la app hace cuando la persona toca
// el logo en la foto). Con el carro entero el logo mide 2 % de la foto y
// CLIP no lo ve; recortado, lo llena.
//
//   node herramientas/medir-logo.mjs            → marca por toque, 3 escalas
//   node herramientas/medir-logo.mjs --auto     → además, barrido sin toque
//
// Las fotos viven en pruebas/fotos-reconocer/ (fuera de git); las
// coordenadas del logo (fracción del ancho y del alto) se tomaron a ojo el
// 15-oct-2026. Necesita internet la primera vez (baja el modelo de visión a
// node_modules/.cache). Tarda uno o dos minutos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { CATALOGO } from '../js/catalogo-carros.js';
import { NOMBRE_CLIP_DE_MARCA, PLANTILLAS_LOGO, ESCALAS_RECORTE, frasesDeLogo, recorteAlrededor } from '../js/logo.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const AUTO = process.argv.includes('--auto');

const FOTOS = [
  { f: 'captiva-joan', marca: 'Chevrolet', x: 0.062, y: 0.47 },
  { f: 'duster', marca: 'Renault', x: 0.77, y: 0.45 },
  { f: 'frontier', marca: 'Nissan', x: 0.27, y: 0.51 },
  { f: 'logan', marca: 'Renault', x: 0.086, y: 0.57 },
  { f: 'mazda3', marca: 'Mazda', x: 0.09, y: 0.56 },
  { f: 'onix', marca: 'Chevrolet', x: 0.32, y: 0.69 }, // de lado: solo el tapacubos
  { f: 'picanto', marca: 'Kia', x: 0.82, y: 0.52 },
  { f: 'spark', marca: 'Chevrolet', x: 0.83, y: 0.63 },
  { f: 'tucson', marca: 'Hyundai', x: 0.865, y: 0.46 },
  { f: 'versa', marca: 'Nissan', x: 0.71, y: 0.61 },
];

const PESO = { 'muy comun': 1, comun: 0.7, 'poco comun': 0.45 };

// Las marcas del catálogo como las conoce CLIP (SsangYong, no "SsangYong / KGM").
const marcas = new Map();
for (const e of CATALOGO) {
  const nombre = NOMBRE_CLIP_DE_MARCA[e.marca] || e.marca;
  const previa = marcas.get(nombre) || { nombre, prior: 0 };
  previa.prior = Math.max(previa.prior, PESO[e.presencia] || 0.45);
  marcas.set(nombre, previa);
}
const lista = [...marcas.values()];
console.log(lista.length + ' marcas con logo');

function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
function promedio(vs) {
  return normalizar(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));
}
function softmax(valores) {
  const mayor = Math.max(...valores);
  const exp = valores.map((v) => Math.exp(v - mayor));
  const suma = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / suma);
}
const punto = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorTexto(frases) {
  const entradas = tokenizador(frases, { padding: true, truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  return promedio(text_embeds.tolist().map(normalizar));
}

// "conjunto": las plantillas con el nombre más la descripción del logo
// (frasesDeLogo, lo que usa la app); "nombre": solo las plantillas.
const CONJUNTOS = {
  conjunto: (m) => frasesDeLogo(m),
  nombre: (m) => PLANTILLAS_LOGO.map((p) => p.replace('{m}', m)),
};
const vectores = {};
for (const [nombre, frases] of Object.entries(CONJUNTOS)) {
  vectores[nombre] = [];
  for (const m of lista) vectores[nombre].push(await vectorTexto(frases(m.nombre)));
}
console.log('frases listas');

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorImagen(imagen) {
  const entradas = await procesador(imagen);
  const { image_embeds } = await vision(entradas);
  return normalizar(Array.from(image_embeds.data));
}

function clasificar(vector, conjunto, conPrior) {
  const sims = vectores[conjunto].map((e) => 100 * punto(vector, e));
  let p = softmax(sims);
  if (conPrior) {
    p = p.map((x, i) => x * lista[i].prior);
    const s = p.reduce((a, b) => a + b, 0);
    p = p.map((x) => x / s);
  }
  return p;
}
const top = (p, n = 3) => p.map((x, i) => ({ marca: lista[i].nombre, p: x })).sort((a, b) => b.p - a.p).slice(0, n);
const fmt = (t) => t.map((x) => x.marca + ' ' + Math.round(x.p * 100) + '%').join(', ');

const aciertos = {};
const cuenta = (clave, ok) => (aciertos[clave] = (aciertos[clave] || 0) + (ok ? 1 : 0));
const t0 = Date.now();
for (const foto of FOTOS) {
  const imagen = await RawImage.read(path.join(RAIZ, 'pruebas', 'fotos-reconocer', foto.f + '.jpg'));
  console.log('\n== ' + foto.f + ' (' + foto.marca + ') ' + imagen.width + 'x' + imagen.height);
  const porEscala = [];
  for (const escala of ESCALAS_RECORTE) {
    const r = recorteAlrededor(imagen.width, imagen.height, foto.x, foto.y, escala);
    const recorte = await imagen.crop([r.x1, r.y1, r.x2, r.y2]);
    const v = await vectorImagen(recorte);
    porEscala.push(v);
    for (const conjunto of Object.keys(CONJUNTOS)) {
      const p = clasificar(v, conjunto, false);
      const t = top(p);
      cuenta(conjunto + ' escala ' + escala, t[0].marca === foto.marca);
      if (conjunto === 'conjunto') console.log('  escala ' + escala + ': ' + fmt(t));
    }
  }
  // Promedio de las tres escalas (con y sin prior de presencia).
  for (const conjunto of Object.keys(CONJUNTOS)) {
    for (const conPrior of [false, true]) {
      const ps = porEscala.map((v) => clasificar(v, conjunto, conPrior));
      const media = ps[0].map((_, i) => ps.reduce((s, p) => s + p[i], 0) / ps.length);
      const t = top(media);
      const clave = conjunto + ' media' + (conPrior ? ' +prior' : '');
      cuenta(clave, t[0].marca === foto.marca);
      cuenta(clave + ' top3', t.some((x) => x.marca === foto.marca));
      if (conjunto === 'conjunto') console.log('  ' + clave + ': ' + fmt(t));
    }
  }
  if (AUTO) {
    // Barrido sin toque: rejilla de recortes en la franja central baja; gana
    // el recorte cuyo mejor logo sale con más seguridad.
    let mejor = null;
    const escala = 0.16;
    for (let fy = 0.3; fy <= 0.85; fy += 0.14) {
      for (let fx = 0.1; fx <= 0.9; fx += 0.14) {
        const r = recorteAlrededor(imagen.width, imagen.height, fx, fy, escala);
        const v = await vectorImagen(await imagen.crop([r.x1, r.y1, r.x2, r.y2]));
        const p = clasificar(v, 'conjunto', true);
        const t = top(p, 1)[0];
        if (!mejor || t.p > mejor.p) mejor = { ...t, fx: fx.toFixed(2), fy: fy.toFixed(2) };
      }
    }
    cuenta('auto rejilla', mejor.marca === foto.marca);
    console.log('  auto: ' + mejor.marca + ' ' + Math.round(mejor.p * 100) + '% en (' + mejor.fx + ', ' + mejor.fy + ')');
  }
}
console.log('\n== aciertos de ' + FOTOS.length + ' fotos, ' + Math.round((Date.now() - t0) / 1000) + ' s ==');
for (const [k, v] of Object.entries(aciertos).sort()) console.log('  ' + k + ': ' + v);
