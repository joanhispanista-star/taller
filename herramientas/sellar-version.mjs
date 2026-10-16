// Sella el service worker: escribe en sw.js la lista de archivos que se
// guardan en el teléfono y una versión calculada del CONTENIDO de esos
// archivos (una huella SHA-256 recortada).
//
//   npm run sellar        (antes de cada commit que se vaya a publicar)
//
// Por qué una huella y no un número a mano: el service worker sirve la app
// desde su caché sin mirar la red, y solo se renueva cuando sw.js cambia.
// Si alguien edita garaje.html, hace push y no toca sw.js, los teléfonos
// siguen con la versión vieja para siempre y nadie se entera. Con la huella,
// cualquier cambio en un archivo cambia sw.js; y la prueba
// `pruebas/instalable.test.js` falla si el sello no coincide, que es la
// forma de que no se olvide.
//
// Dos huellas: la de la app (lo que se baja al instalar) y la del motor del
// reconocedor (los ort-*.wasm/.mjs, que se guardan al primer uso). Van en
// cachés distintas para que una versión nueva de la app no obligue a bajar
// otra vez los 27 MB del motor.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MARCA_INICIO = '/* SELLO-INICIO';
const MARCA_FIN = '/* SELLO-FIN */';

function listar(raiz, carpeta, filtro) {
  const dir = path.join(raiz, carpeta);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => filtro(n) && fs.statSync(path.join(dir, n)).isFile())
    .map((n) => (carpeta ? carpeta + '/' + n : n));
}

// Lo que la app necesita para abrir sin internet: las tres páginas (y "./",
// que es como GitHub Pages y el servidor sirven index.html), el CSS, los
// módulos propios, las etiquetas del reconocedor, Three.js, el bundle de
// Transformers.js (medio MB; el motor pesado va aparte), el manifest y los
// iconos. Ordenado para que la huella no dependa del sistema de archivos.
export function archivosApp(raiz = RAIZ) {
  return [
    './',
    ...listar(raiz, '', (n) => /^(index|garaje|tablero)\.html$/.test(n) || n === 'manifest.webmanifest'),
    ...listar(raiz, 'css', (n) => n.endsWith('.css')),
    ...listar(raiz, 'js', (n) => n.endsWith('.js') || n.endsWith('.json')),
    ...listar(raiz, 'js/vendor', (n) => n.endsWith('.js')),
    ...listar(raiz, 'js/vendor/transformers', (n) => n === 'transformers.min.js'),
    ...listar(raiz, 'iconos', (n) => n.endsWith('.png')),
  ].sort();
}

// El motor ONNX: se guarda al primer uso, no al instalar (ver sw.js).
export function archivosMotor(raiz = RAIZ) {
  return listar(raiz, 'js/vendor/transformers', (n) => n.startsWith('ort-') && /\.(wasm|mjs)$/.test(n)).sort();
}

export function rutaEnDisco(archivo) {
  return archivo === './' ? 'index.html' : archivo;
}

// Los archivos de texto se huellan con finales de línea LF: git en Windows
// (autocrlf) los deja en CRLF al hacer checkout y en LF al commitear, y sin
// esto el mismo commit daría una versión distinta en cada máquina.
function contenidoParaHuella(ruta) {
  const bytes = fs.readFileSync(ruta);
  if (/\.(png|wasm)$/.test(ruta)) return bytes;
  return Buffer.from(bytes.toString('utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)), 'utf8');
}

export function huella(raiz, archivos) {
  const h = crypto.createHash('sha256');
  for (const a of archivos) {
    h.update(a);
    h.update(String.fromCharCode(0));
    h.update(contenidoParaHuella(path.join(raiz, rutaEnDisco(a))));
    h.update(String.fromCharCode(0));
  }
  return h.digest('hex').slice(0, 12);
}

export function sellos(raiz = RAIZ) {
  const archivos = archivosApp(raiz);
  const motor = archivosMotor(raiz);
  return { version: huella(raiz, archivos), versionMotor: huella(raiz, motor), archivos, motor };
}

// Lee el sello que hay escrito en el texto de sw.js (o null si no hay).
export function leerSello(textoSw) {
  const inicio = textoSw.indexOf(MARCA_INICIO);
  const fin = textoSw.indexOf(MARCA_FIN);
  if (inicio < 0 || fin < 0) return null;
  const bloque = textoSw.slice(inicio, fin);
  const version = /const VERSION = '([0-9a-f]+)'/.exec(bloque);
  const versionMotor = /const VERSION_MOTOR = '([0-9a-f]+)'/.exec(bloque);
  const lista = /const ARCHIVOS = (\[[^\]]*\]);/.exec(bloque);
  if (!version || !versionMotor || !lista) return null;
  return { version: version[1], versionMotor: versionMotor[1], archivos: JSON.parse(lista[1]) };
}

export function textoDelSello({ version, versionMotor, archivos }) {
  return (
    MARCA_INICIO +
    ': lo escribe `npm run sellar` (herramientas/sellar-version.mjs). No editar a mano. */' +
    String.fromCharCode(10) +
    "const VERSION = '" + version + "';" + String.fromCharCode(10) +
    "const VERSION_MOTOR = '" + versionMotor + "';" + String.fromCharCode(10) +
    'const ARCHIVOS = ' + JSON.stringify(archivos, null, 2) + ';' + String.fromCharCode(10) +
    MARCA_FIN
  );
}

export function sellar(raiz = RAIZ) {
  const rutaSw = path.join(raiz, 'sw.js');
  const texto = fs.readFileSync(rutaSw, 'utf8');
  const inicio = texto.indexOf(MARCA_INICIO);
  const fin = texto.indexOf(MARCA_FIN);
  if (inicio < 0 || fin < 0) throw new Error('sw.js no tiene las marcas SELLO-INICIO / SELLO-FIN');
  const nuevo = sellos(raiz);
  const salida = texto.slice(0, inicio) + textoDelSello(nuevo) + texto.slice(fin + MARCA_FIN.length);
  const cambio = salida !== texto;
  if (cambio) fs.writeFileSync(rutaSw, salida);
  return { ...nuevo, cambio };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const r = sellar();
  console.log((r.cambio ? 'sw.js sellado' : 'sw.js ya estaba sellado') + ': app ' + r.version + ' (' + r.archivos.length + ' archivos), motor ' + r.versionMotor + ' (' + r.motor.length + ' archivos)');
}
