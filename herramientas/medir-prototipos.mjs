// Mide cuánto suman los PROTOTIPOS DE IMAGEN (herramientas/prototipos-logos.json)
// a la marca por el logo: las mismas diez fotos y toques de medir-logo.mjs,
// clasificadas con las frases solas (pesoImagen 0) y con las frases más el
// prototipo a varios pesos. Imprime aciertos, "seguros" y la probabilidad
// media que recibe la marca correcta (lo que la pantalla muestra).
//
//   node herramientas/medir-prototipos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { CATALOGO } from '../js/catalogo-carros.js';
import { ESCALAS_RECORTE, clasificarLogo, frasesDeLogo, logoSeguro, marcasConLogo, recorteAlrededor } from '../js/logo.js';

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
const PESOS = [0, 0.3, 0.5, 0.7, 1];

function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
function promedio(vs) {
  return normalizar(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));
}
function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}

const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorTexto(frases) {
  const entradas = tokenizador(frases, { padding: true, truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  return promedio(text_embeds.tolist().map(normalizar));
}
const prototipos = new Map(JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas', 'prototipos-logos.json'), 'utf8')).marcas.map((m) => [m.nombre, { ep: desdeBase64(m.e), sesgo: m.sesgo || 0 }]));
const etiquetas = [];
for (const m of marcasConLogo(CATALOGO)) { const p = prototipos.get(m.nombre); etiquetas.push({ ...m, e: await vectorTexto(frasesDeLogo(m.nombre)), ep: p ? p.ep : null, sesgo: p ? p.sesgo : 0 }); }
console.log(etiquetas.length + ' logos, ' + etiquetas.filter((m) => m.ep).length + ' con prototipo de imagen');

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vectorImagen(imagen) {
  const { image_embeds } = await vision(await procesador(imagen));
  return normalizar(Array.from(image_embeds.data));
}

const resultados = Object.fromEntries(PESOS.map((p) => [p, { aciertos: 0, segurosBien: 0, segurosMal: 0, pCorrecta: 0 }]));
for (const foto of FOTOS) {
  const imagen = await RawImage.read(path.join(RAIZ, 'pruebas', 'fotos-reconocer', foto.f + '.jpg'));
  const vectores = [];
  for (const escala of ESCALAS_RECORTE) {
    const r = recorteAlrededor(imagen.width, imagen.height, foto.x, foto.y, escala);
    vectores.push(await vectorImagen(await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
  }
  const linea = [foto.f.padEnd(13)];
  for (const peso of PESOS) {
    const lista = clasificarLogo(vectores, etiquetas, { pesoImagen: peso });
    const bien = lista[0].nombre === foto.marca;
    const r = resultados[peso];
    if (bien) r.aciertos += 1;
    if (logoSeguro(lista)) bien ? (r.segurosBien += 1) : (r.segurosMal += 1);
    const correcta = lista.find((m) => m.nombre === foto.marca);
    r.pCorrecta += correcta ? correcta.p : 0;
    linea.push(('p' + peso + ':' + lista[0].nombre.slice(0, 8) + ' ' + Math.round(lista[0].p * 100) + '%').padEnd(22));
  }
  console.log(linea.join(''));
}
console.log('\npeso   aciertos  seguros bien/mal  p media de la correcta');
for (const peso of PESOS) {
  const r = resultados[peso];
  console.log(String(peso).padEnd(7) + String(r.aciertos).padEnd(10) + (r.segurosBien + ' / ' + r.segurosMal).padEnd(18) + Math.round((r.pCorrecta / FOTOS.length) * 100) + ' %');
}
