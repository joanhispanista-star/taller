// ¿Cómo frenar los "seguros" equivocados del barrido? (17-oct-2026)
// medir-cadena.mjs dio, con el barrido, 25 seguras bien y 4 seguras mal
// (sin barrido: 14 y 1). Aquí se guarda, por foto, lo que vio cada uno de
// los 3 puntos refinados del barrido y se prueban reglas para decir
// "seguro": la de hoy (logoSeguro del ganador), que al menos 2 de los 3
// puntos coincidan en la marca, un mínimo más alto, y combinaciones.
//
//   node herramientas/medir-barrido-acuerdo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { CRITERIO_BARRIDO, ESCALAS_RECORTE, REJILLA_BARRIDO, clasificarLogo, logoSeguro, recorteAlrededor, rejillaDeBarrido } from '../js/logo.js';

const MODELO = 'Xenova/clip-vit-base-patch32';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(RAIZ, 'node_modules', '.cache', 'transformers');
const ESCALA = 100;
function desdeBase64(texto) {
  const bytes = Buffer.from(texto, 'base64');
  return Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)).map((b) => b / 127);
}
const crudo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'js', 'etiquetas-clip.json'), 'utf8'));
const marcasE = crudo.marcas.map((m) => ({ ...m, e: desdeBase64(m.e) }));
const fondo = (crudo.fondo || []).map((f) => ({ ...f, e: desdeBase64(f.e) }));
const MARCAS = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen', 'Honda', 'Mitsubishi', 'Fiat', 'Peugeot', 'Citroen', 'Jeep', 'Subaru', 'BYD', 'Chery', 'JAC', 'Audi', 'BMW', 'Mercedes', 'Volvo', 'MG', 'Changan', 'Haval', 'Lexus', 'Mini', 'Porsche', 'Skoda', 'Dodge', 'Opel', 'Seat', 'Tesla', 'Jaguar'];
const ALIAS = { Citroen: 'Citroën', Mercedes: 'Mercedes-Benz' };
const marcaReal = (n) => {
  const m = MARCAS.find((x) => new RegExp('(^|[_ -])' + x + '([_ -]|$)', 'i').test(n));
  return m ? ALIAS[m] || m : '';
};
const DE_JOAN = { 'captiva-joan': 'Chevrolet', duster: 'Renault', frontier: 'Nissan', logan: 'Renault', mazda3: 'Mazda', onix: 'Chevrolet', picanto: 'Kia', spark: 'Chevrolet', tucson: 'Hyundai', versa: 'Nissan' };
const fotos = Object.entries(DE_JOAN).map(([f, marca]) => ({ nombre: f, marca, ruta: path.join(RAIZ, 'pruebas', 'fotos-reconocer', f + '.jpg') }));
const CARPETA = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
for (const a of fs.readdirSync(CARPETA).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort()) fotos.push({ nombre: a.replace(/\.[^.]+$/, '').slice(0, 40), marca: marcaReal(a), ruta: path.join(CARPETA, a) });

const procesador = await AutoProcessor.from_pretrained(MODELO);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' });
async function vector(imagen, r) {
  const { image_embeds } = await vision(await procesador(await imagen.crop([r.x1, r.y1, r.x2, r.y2])));
  const v = Array.from(image_embeds.data);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const puntaje = (v) => (CRITERIO_BARRIDO === 'logo' && fondo.length ? 1 - clasificarLogo([v], marcasE, { escala: ESCALA, fondo }).fondo : clasificarLogo([v], marcasE, { escala: ESCALA })[0].p);

const filas = [];
for (const foto of fotos) {
  const original = await RawImage.read(foto.ruta);
  const factor = Math.min(1, 1600 / Math.max(original.width, original.height));
  const imagen = factor < 1 ? await original.resize(Math.round(original.width * factor), Math.round(original.height * factor)) : original;
  const candidatos = [];
  for (const p of rejillaDeBarrido(REJILLA_BARRIDO)) candidatos.push({ p, s: puntaje(await vector(imagen, recorteAlrededor(imagen.width, imagen.height, p.x, p.y, REJILLA_BARRIDO.escala))) });
  candidatos.sort((a, b) => b.s - a.s);
  const refinados = [];
  for (const c of candidatos.slice(0, REJILLA_BARRIDO.refinar)) {
    const vs = [];
    for (const e of ESCALAS_RECORTE) vs.push(await vector(imagen, recorteAlrededor(imagen.width, imagen.height, c.p.x, c.p.y, e)));
    const lista = clasificarLogo(vs, marcasE, { escala: ESCALA });
    refinados.push({ nombre: lista[0].nombre, p: lista[0].p, seguro: logoSeguro(lista), segundo: lista[1].p, puntaje: c.s });
  }
  filas.push({ ...foto, refinados });
  process.stdout.write('.');
}
console.log('');

// Las reglas: cada una devuelve { nombre, seguro } a partir de los 3 refinados.
const ganador = (r) => r.reduce((a, b) => (b.p > a.p ? b : a));
const votos = (r, nombre) => r.filter((x) => x.nombre === nombre).length;
const REGLAS = {
  'hoy (seguro del ganador)': (r) => ({ nombre: ganador(r).nombre, seguro: ganador(r).seguro }),
  'ganador seguro y 2 de 3 coinciden': (r) => ({ nombre: ganador(r).nombre, seguro: ganador(r).seguro && votos(r, ganador(r).nombre) >= 2 }),
  'ganador seguro y p >= 0,2': (r) => ({ nombre: ganador(r).nombre, seguro: ganador(r).seguro && ganador(r).p >= 0.2 }),
  'ganador seguro y (2 de 3 o p >= 0,4)': (r) => ({ nombre: ganador(r).nombre, seguro: ganador(r).seguro && (votos(r, ganador(r).nombre) >= 2 || ganador(r).p >= 0.4) }),
  'ganador seguro y ventaja >= 0,1': (r) => ({ nombre: ganador(r).nombre, seguro: ganador(r).seguro && ganador(r).p - ganador(r).segundo >= 0.1 }),
};
for (const [nombre, regla] of Object.entries(REGLAS)) {
  let bien = 0, sb = 0, sm = 0;
  const malos = [];
  const perdidos = [];
  for (const f of filas) {
    const r = regla(f.refinados);
    if (r.nombre === f.marca) bien += 1;
    if (r.seguro && r.nombre === f.marca) sb += 1;
    if (r.seguro && r.nombre !== f.marca) {
      sm += 1;
      malos.push(f.nombre.slice(0, 22) + '→' + r.nombre);
    }
    const hoy = REGLAS['hoy (seguro del ganador)'](f.refinados);
    if (hoy.seguro && hoy.nombre === f.marca && !r.seguro) perdidos.push(f.nombre.slice(0, 22));
  }
  console.log(nombre.padEnd(40) + 'bien ' + bien + ', segura bien ' + sb + ', segura MAL ' + sm + (malos.length ? '  mal: ' + malos.join('; ') : '') + (perdidos.length ? '  | buenas que pierde: ' + perdidos.join('; ') : ''));
}
console.log('\nPor foto (marca real: los 3 refinados):');
for (const f of filas) console.log('  ' + f.nombre.slice(0, 34).padEnd(35) + f.marca.padEnd(11) + f.refinados.map((r) => r.nombre + ' ' + Math.round(r.p * 100) + '%' + (r.seguro ? '!' : '')).join(' | '));
fs.writeFileSync(path.join(RAIZ, 'pruebas', 'datos-externos', 'medir-barrido-acuerdo.resultado.json'), JSON.stringify(filas, null, 1));
