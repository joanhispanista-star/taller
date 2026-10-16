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
import { familiaDe } from '../js/catalogo.js';
import { frasesDeLogo, marcasConLogo } from '../js/logo.js';

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

const salida = { modelo: MODELO, dim: 512, carrocerias: {}, marcas: [], lineas: [] };
for (const [tipo, frases] of Object.entries(FRASES_CARROCERIA)) {
  salida.carrocerias[tipo] = aBase64(await vectorDe(frases));
}

// Un vector por LOGO de marca (15-oct-2026): con un recorte alrededor del
// emblema que la persona toca, CLIP reconoce la marca; las frases y el
// agrupamiento viven en js/logo.js, que también usa el teléfono. Con
// `--con-prototipos`, y si existe herramientas/prototipos-logos.json
// (calcular-prototipos.mjs), la marca lleva también el prototipo de imagen
// (`ep`). Apagado por defecto: medido el 16-oct-2026, los prototipos del
// dataset disponible bajaban los aciertos (ver clasificarLogo en logo.js).
const rutaPrototipos = path.join(RAIZ, 'herramientas', 'prototipos-logos.json');
const usarPrototipos = process.argv.includes('--con-prototipos') && fs.existsSync(rutaPrototipos);
const prototipos = usarPrototipos ? new Map(JSON.parse(fs.readFileSync(rutaPrototipos, 'utf8')).marcas.map((m) => [m.nombre, m])) : new Map();
let conPrototipo = 0;
for (const m of marcasConLogo(CATALOGO)) {
  const vector = await vectorDe(frasesDeLogo(m.nombre));
  const etiqueta = { nombre: m.nombre, marcas: m.marcas, prior: m.prior, e: aBase64(vector) };
  const p = prototipos.get(m.nombre);
  if (p) {
    etiqueta.ep = p.e; // ya viene en Int8 base64
    etiqueta.sesgo = p.sesgo || 0;
    conPrototipo += 1;
  }
  salida.marcas.push(etiqueta);
}
console.log(salida.marcas.length + ' logos de marca, ' + conPrototipo + ' con prototipo de imagen');

// Al reconocedor van FAMILIAS (Logan, Hilux, Kona), no cada generación:
// medido el 15-oct-2026, con 604 líneas sueltas las generaciones de un
// mismo carro se repartían el voto y ganaba cualquier otro. Solo las
// familias con algún miembro común: con mil candidatos CLIP se confunde
// más, y un carro raro igual se escoge a mano en la lista. Las aclaraciones
// del catálogo ("2ª generación", "AN120") no le dicen nada a CLIP, que
// aprendió con pies de foto en inglés: la familia ya viene sin ellas.
const PESO = { 'muy comun': 0, comun: 1, 'poco comun': 2 };
const familias = new Map();
for (const entrada of CATALOGO) {
  const familia = familiaDe(entrada);
  const clave = (entrada.marca + ' ' + familia).toLowerCase();
  const previa = familias.get(clave);
  if (!previa) {
    familias.set(clave, { marca: entrada.marca, familia, carrocerias: {}, presencia: entrada.presencia });
  } else if (PESO[entrada.presencia] < PESO[previa.presencia]) {
    previa.presencia = entrada.presencia;
  }
  const f = familias.get(clave);
  // La carrocería de la familia: la de sus miembros más comunes.
  f.carrocerias[entrada.carroceria] = (f.carrocerias[entrada.carroceria] || 0) + (3 - PESO[entrada.presencia]);
}

// Van TODAS las familias, cada una con su presencia. El reconocedor del
// carro entero sigue comparando solo contra las "muy común" (89 el
// 15-oct-2026: con las 400 que tienen algún miembro común, la línea
// acertaba 3 de 9 fotos; con 89, 4 de 9 y la carrocería 6 de 9). Las demás
// sirven cuando ya se sabe la MARCA por el logo: entre las 20 familias de
// Chevrolet elegir es fácil, entre 700 no.
let n = 0;
for (const f of familias.values()) {
  const nombre = f.marca + ' ' + f.familia;
  const carroceria = Object.entries(f.carrocerias).sort((a, b) => b[1] - a[1])[0][0];
  const tipo = EN_INGLES[carroceria] || 'car';
  const vector = await vectorDe(['a photo of a ' + nombre, 'a photo of a ' + nombre + ' ' + tipo, 'a ' + nombre + ' car parked on the street']);
  salida.lineas.push({ marca: f.marca, linea: f.familia, carroceria, presencia: f.presencia, e: aBase64(vector) });
  n += 1;
  if (n % 50 === 0) console.log(n + ' familias...');
}
const destino = path.join(RAIZ, 'js', 'etiquetas-clip.json');
fs.writeFileSync(destino, JSON.stringify(salida));
console.log('Escrito ' + destino + ': ' + Object.keys(salida.carrocerias).length + ' carrocerías y ' + salida.lineas.length + ' líneas, ' + Math.round(fs.statSync(destino).size / 1024) + ' KB');
