// Segunda medición del barrido (16-oct-2026), después de que
// medir-barrido.mjs dijera que la rejilla fina con el criterio "menos
// fondo" es la que acierta (27 de 46) sin regalar "seguros" falsos (2):
// aquí se afina el costo. Se comparan franjas más angostas, pasos y
// cuántos puntos se refinan, y se guarda la probabilidad de fondo del
// punto elegido para ver si sirve de freno a los "seguros" equivocados.
//
//   node herramientas/medir-barrido-fino.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { ESCALAS_RECORTE, FRASES_FONDO, clasificarLogo, logoSeguro, recorteAlrededor, rejillaDeBarrido } from '../js/logo.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const ESCALA = 100;
const VARIANTES = {
  'fina 0.3-0.8 r3': { escala: 0.16, paso: 0.09, y1: 0.3, y2: 0.8, refinar: 3 },
  'fina 0.3-0.8 r2': { escala: 0.16, paso: 0.09, y1: 0.3, y2: 0.8, refinar: 2 },
  'fina 0.35-0.75 r3': { escala: 0.16, paso: 0.09, y1: 0.35, y2: 0.75, refinar: 3 },
  'fina 0.35-0.75 r2': { escala: 0.16, paso: 0.09, y1: 0.35, y2: 0.75, refinar: 2 },
  'paso 0.1 0.35-0.75 r3': { escala: 0.16, paso: 0.1, y1: 0.35, y2: 0.75, refinar: 3 },
  'paso 0.1 0.35-0.75 r2': { escala: 0.16, paso: 0.1, y1: 0.35, y2: 0.75, refinar: 2 },
  'paso 0.11 0.35-0.75 r3': { escala: 0.16, paso: 0.11, y1: 0.35, y2: 0.75, refinar: 3 },
  'esc 0.14 paso 0.09 r3': { escala: 0.14, paso: 0.09, y1: 0.35, y2: 0.75, refinar: 3 },
  'esc 0.18 paso 0.1 r3': { escala: 0.18, paso: 0.1, y1: 0.35, y2: 0.75, refinar: 3 },
};

function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}
const etiquetas = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'etiquetas-clip.json'), 'utf8')).marcas.map((m) => ({ ...m, e: desdeBase64(m.e) }));
const MARCAS = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen', 'Honda', 'Mitsubishi', 'Fiat', 'Peugeot', 'Citroen', 'Jeep', 'Subaru', 'BYD', 'Chery', 'JAC', 'Audi', 'BMW', 'Mercedes', 'Volvo', 'MG', 'Changan', 'Haval', 'Lexus', 'Mini', 'Porsche', 'Skoda', 'Dodge', 'Opel', 'Seat', 'Tesla', 'Jaguar'];
const ALIAS = { Citroen: 'Citroën', Mercedes: 'Mercedes-Benz' };
const marcaReal = (n) => {
  const m = MARCAS.find((x) => new RegExp('(^|[_ -])' + x + '([_ -]|$)', 'i').test(n));
  return m ? ALIAS[m] || m : '';
};
const fotos = [];
for (const [f, marca] of [['captiva-joan', 'Chevrolet'], ['duster', 'Renault'], ['frontier', 'Nissan'], ['logan', 'Renault'], ['mazda3', 'Mazda'], ['onix', 'Chevrolet'], ['picanto', 'Kia'], ['spark', 'Chevrolet'], ['tucson', 'Hyundai'], ['versa', 'Nissan']]) {
  fotos.push({ f, marca, ruta: path.join(RAIZ, 'pruebas', 'fotos-reconocer', f + '.jpg') });
}
const carpeta = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
for (const a of fs.readdirSync(carpeta).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort()) {
  fotos.push({ f: a.replace(/\.[^.]+$/, '').slice(0, 36), marca: marcaReal(a), ruta: path.join(carpeta, a) });
}

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
const tokenizador = await AutoTokenizer.from_pretrained(MODELO);
const modeloTexto = await CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
const normalizar = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
async function vectorTexto(frases) {
  const { text_embeds } = await modeloTexto(tokenizador(frases, { padding: true, truncation: true }));
  const vs = text_embeds.tolist().map(normalizar);
  return normalizar(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));
}
const fondo = [];
for (const [nombre, frases] of Object.entries(FRASES_FONDO)) fondo.push({ nombre, e: await vectorTexto(frases) });

let inferencias = 0;
async function vectorRecorte(foto, r) {
  const clave = r.x1 + ',' + r.y1 + ',' + r.lado;
  if (!foto.cache.has(clave)) {
    const { image_embeds } = await vision(await procesador(await foto.imagen.crop([r.x1, r.y1, r.x2, r.y2])));
    foto.cache.set(clave, normalizar(Array.from(image_embeds.data)));
    inferencias += 1;
  }
  return foto.cache.get(clave);
}

const resultados = [];
const t0 = Date.now();
for (const foto of fotos) {
  const original = await RawImage.read(foto.ruta);
  const factor = Math.min(1, 1600 / Math.max(original.width, original.height));
  foto.imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
  foto.cache = new Map();
  const fila = { f: foto.f, marca: foto.marca };
  for (const [nombre, v] of Object.entries(VARIANTES)) {
    const puntos = rejillaDeBarrido(v);
    const candidatos = [];
    for (const punto of puntos) {
      const vec = await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, punto.x, punto.y, v.escala));
      candidatos.push({ punto, logo: 1 - clasificarLogo([vec], etiquetas, { escala: ESCALA, fondo }).fondo });
    }
    candidatos.sort((a, b) => b.logo - a.logo);
    let ganador = null;
    for (const c of candidatos.slice(0, v.refinar)) {
      const vectores = [];
      for (const escala of ESCALAS_RECORTE) vectores.push(await vectorRecorte(foto, recorteAlrededor(foto.imagen.width, foto.imagen.height, c.punto.x, c.punto.y, escala)));
      const lista = clasificarLogo(vectores, etiquetas, { escala: ESCALA });
      const conFondo = clasificarLogo(vectores, etiquetas, { escala: ESCALA, fondo });
      const r = { punto: c.punto, nombre: lista[0].nombre, p: lista[0].p, seguro: logoSeguro(lista), fondo: conFondo.fondo, logoChico: c.logo };
      if (!ganador || r.p > ganador.p) ganador = r;
    }
    fila[nombre] = { ...ganador, recortes: puntos.length + v.refinar * 3 };
  }
  resultados.push(fila);
  process.stdout.write('.');
}
console.log('\n' + fotos.length + ' fotos, ' + inferencias + ' inferencias, ' + Math.round((Date.now() - t0) / 1000) + ' s\n');
const con = resultados.filter((r) => r.marca);
for (const nombre of Object.keys(VARIANTES)) {
  let bien = 0, sb = 0, sm = 0;
  const malos = [];
  for (const r of con) {
    const x = r[nombre];
    if (x.nombre === r.marca) bien += 1;
    if (x.seguro && x.nombre === r.marca) sb += 1;
    if (x.seguro && x.nombre !== r.marca) {
      sm += 1;
      malos.push(r.f.slice(0, 24) + '→' + x.nombre + ' ' + Math.round(x.p * 100) + '% fondo ' + Math.round(x.fondo * 100) + '%');
    }
  }
  console.log(nombre.padEnd(24) + '(' + con[0][nombre].recortes + ' recortes) bien ' + bien + '/' + con.length + ', segura bien ' + sb + ', segura MAL ' + sm + '  ' + malos.join('; '));
}
// ¿El fondo separa los seguros buenos de los malos? (variante fina 0.35-0.75 r3)
const clave = 'fina 0.35-0.75 r3';
console.log('\nSEGUROS de ' + clave + ' con su fondo (para buscar un tope):');
for (const r of con.filter((x) => x[clave].seguro).sort((a, b) => b[clave].fondo - a[clave].fondo)) {
  const x = r[clave];
  console.log('  fondo ' + Math.round(x.fondo * 100).toString().padStart(3) + ' %  ' + (x.nombre === r.marca ? 'BIEN ' : 'MAL  ') + r.f.slice(0, 30).padEnd(31) + x.nombre + ' ' + Math.round(x.p * 100) + '%');
}
fs.writeFileSync(path.join(RAIZ, 'pruebas', 'datos-externos', 'medir-barrido-fino.resultado.json'), JSON.stringify(resultados, null, 1));
