// Calcula, una sola vez y en el PC, los PROTOTIPOS DE IMAGEN de los logos:
// el vector CLIP promedio de fotos reales del emblema de cada marca. A CLIP
// le va mucho mejor comparar un recorte de logo con otros recortes de logo
// que con una frase ("the Chevrolet logo"): la frase le suena a carro
// entero. Los prototipos se suman a las frases en etiquetas-clip.json.
//
//   node herramientas/calcular-prototipos.mjs
//     → escribe herramientas/prototipos-logos.json (va al repo: 25 KB)
//
// Fuente: Vehicle Logos Dataset de General Blockchain (CC BY 4.0, 34 marcas,
// 16 recortes por marca), descomprimido en
// pruebas/datos-externos/vehicle-logos/vehicle-logos-dataset-master/ (fuera
// del repo; ver LEEME). Al teléfono solo viajan los vectores.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const DATASET = path.join(RAIZ, 'pruebas', 'datos-externos', 'vehicle-logos', 'vehicle-logos-dataset-master');

// Nombres del dataset → nombre del logo como lo conoce la app (js/logo.js).
// El dataset numera versiones del emblema ("Chevrolet 2", "Kia 1"): el
// número sobra. Las marcas que no ruedan en Colombia (Acura, GMC, Lancia,
// Dacia) se calculan igual y calcular-etiquetas las ignora.
const NOMBRE = { Mercedes: 'Mercedes-Benz', Citroen: 'Citroën', VW: 'Volkswagen' };
const nombreDe = (crudo) => {
  const sinNumero = crudo.trim().replace(/\s+\d$/, '');
  return NOMBRE[sinNumero] || sinNumero;
};

function normalizar(v) {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
function aBase64(vector) {
  const bytes = new Int8Array(vector.map((x) => Math.max(-127, Math.min(127, Math.round(x * 127)))));
  return Buffer.from(bytes.buffer).toString('base64');
}

const filas = fs
  .readFileSync(path.join(DATASET, 'structure.csv'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((l) => l.split(','))
  .map(([, nombre, imagen]) => ({ nombre: nombreDe(nombre), imagen: path.join(DATASET, 'Images', path.basename(imagen)) }));
console.log(filas.length + ' recortes de ' + new Set(filas.map((f) => f.nombre)).size + ' marcas');

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
const porMarca = new Map();
let n = 0;
for (const fila of filas) {
  if (!fs.existsSync(fila.imagen)) continue;
  const imagen = await (await RawImage.read(fila.imagen)).rgb();
  const { image_embeds } = await vision(await procesador(imagen));
  const v = normalizar(Array.from(image_embeds.data));
  const lista = porMarca.get(fila.nombre) || [];
  lista.push(v);
  porMarca.set(fila.nombre, lista);
  n += 1;
  if (n % 100 === 0) console.log(n + ' recortes...');
}

const salida = { modelo: MODELO, fuente: 'GeneralBlockchain/vehicle-logos-dataset (CC BY 4.0)', dim: 512, marcas: [] };
const todos = [...porMarca.values()].flat();
const punto = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const prototipos = [...porMarca.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, vectores]) => ({
  nombre,
  vectores,
  media: normalizar(vectores[0].map((_, i) => vectores.reduce((s, v) => s + v[i], 0) / vectores.length)),
}));
// El "sesgo" de cada prototipo: qué tan parecido le resulta CUALQUIER
// recorte de logo (el promedio contra los 544 del dataset, menos el
// promedio general). Un óvalo cromado (Hyundai, Honda) se parece a todo y
// sin esta corrección se lleva recortes ajenos: medido el 16-oct-2026, con
// el prototipo sin corregir la Captiva salía Hyundai.
const parecidoGeneral = prototipos.map((p) => todos.reduce((s, v) => s + punto(v, p.media), 0) / todos.length);
const promedioGeneral = parecidoGeneral.reduce((s, x) => s + x, 0) / parecidoGeneral.length;
prototipos.forEach((p, i) => {
  const cohesion = p.vectores.reduce((s, v) => s + punto(v, p.media), 0) / p.vectores.length;
  const sesgo = parecidoGeneral[i] - promedioGeneral;
  salida.marcas.push({ nombre: p.nombre, recortes: p.vectores.length, cohesion: Number(cohesion.toFixed(3)), sesgo: Number(sesgo.toFixed(4)), e: aBase64(p.media) });
  console.log(p.nombre.padEnd(14) + p.vectores.length + ' recortes, cohesión ' + cohesion.toFixed(3) + ', sesgo ' + (sesgo >= 0 ? '+' : '') + sesgo.toFixed(3));
});
const destino = path.join(RAIZ, 'herramientas', 'prototipos-logos.json');
fs.writeFileSync(destino, JSON.stringify(salida));
console.log('Escrito ' + destino + ': ' + salida.marcas.length + ' marcas, ' + Math.round(fs.statSync(destino).size / 1024) + ' KB');
