// Calcula, una sola vez y en el computador, los vectores de texto con los
// que el teléfono compara la foto del carro: uno por carrocería y uno por
// línea del catálogo. Así al teléfono solo le hace falta el modelo de
// VISIÓN de CLIP (89 MB) y no el de texto (otros 60 MB), y la lista de
// líneas puede crecer sin que el teléfono haga más trabajo.
//
//   node herramientas/calcular-etiquetas.mjs   → escribe js/etiquetas-clip.json
//
// Necesita internet la primera vez (baja el modelo de texto a
// node_modules/.cache). Hay que volver a correrlo cada vez que cambie el
// catálogo o las frases de aquí.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers';
import { CATALOGO } from '../js/catalogo-carros.js';
import { CARROCERIAS } from '../js/carrocerias.js';

export const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');

// Varias frases por clase y se promedian: a CLIP le va mejor con un
// "conjunto de plantillas" que con una sola frase (lo midió OpenAI en el
// paper original y lo comprobamos con fotos reales el 15-oct-2026).
const FRASES_CARROCERIA = {
  sedan: ['a photo of a sedan', 'a photo of a four-door sedan car with a trunk', 'a saloon car', 'a photo of a compact sedan parked on the street'],
  hatchback: ['a photo of a hatchback', 'a photo of a small five-door hatchback city car', 'a photo of a subcompact hatchback car with a rear hatch instead of a trunk'],
  suv: ['a photo of an SUV', 'a photo of a crossover SUV', 'a photo of a sport utility vehicle with high ground clearance and a tall body', 'a photo of a compact SUV parked on the street'],
  camioneta: ['a photo of a pickup truck', 'a photo of a double cab pickup truck with an open cargo bed'],
};
const EN_INGLES = { sedan: 'sedan', hatchback: 'hatchback', suv: 'SUV', camioneta: 'pickup truck', van: 'van', coupe: 'coupe', otro: 'car' };

function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

function promedio(vectores) {
  return normalizar(vectores[0].map((_, i) => vectores.reduce((s, v) => s + v[i], 0) / vectores.length));
}

// Int8 en base64: 512 bytes por vector en vez de 512 números con decimales.
// La pérdida de precisión no cambia ningún resultado que importe (el
// producto punto se mueve en la tercera cifra).
function aBase64(vector) {
  const bytes = new Int8Array(vector.map((x) => Math.max(-127, Math.min(127, Math.round(x * 127)))));
  return Buffer.from(bytes.buffer).toString('base64');
}

const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });

async function vectorDe(frases) {
  const entradas = tokenizador(frases, { padding: true, truncation: true });
  const { text_embeds } = await modeloTexto(entradas);
  return promedio(text_embeds.tolist().map(normalizar));
}

const salida = { modelo: MODELO, dim: 512, carrocerias: {}, lineas: [] };
for (const [tipo, frases] of Object.entries(FRASES_CARROCERIA)) {
  salida.carrocerias[tipo] = aBase64(await vectorDe(frases));
}
let n = 0;
for (const entrada of CATALOGO) {
  const nombre = entrada.marca + ' ' + entrada.linea;
  const tipo = EN_INGLES[entrada.carroceria] || 'car';
  const vector = await vectorDe(['a photo of a ' + nombre, 'a photo of a ' + nombre + ' ' + tipo, 'a ' + nombre + ' car parked on the street']);
  salida.lineas.push({ marca: entrada.marca, linea: entrada.linea, carroceria: entrada.carroceria, e: aBase64(vector) });
  n += 1;
  if (n % 50 === 0) console.log(n + ' líneas...');
}
const destino = path.join(RAIZ, 'js', 'etiquetas-clip.json');
fs.writeFileSync(destino, JSON.stringify(salida));
console.log('Escrito ' + destino + ': ' + Object.keys(salida.carrocerias).length + ' carrocerías y ' + salida.lineas.length + ' líneas, ' + Math.round(fs.statSync(destino).size / 1024) + ' KB');
