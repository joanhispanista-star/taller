// Convierte el resultado de la investigación (un JSON con la lista de
// líneas por grupo de marcas, con medidas y fuente) en js/catalogo-carros.js.
//
//   node herramientas/generar-catalogo.mjs <resultado.json>
//
// Reglas: una entrada por marca + línea (si la investigación trae dos
// generaciones, se queda la más reciente, que es la que más rueda); las
// medidas se guardan en milímetros enteros o 0 si no se confirmaron (el
// visor usa entonces las típicas de la carrocería); la fuente se conserva
// para poder revisar un dato raro sin volver a investigar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: node herramientas/generar-catalogo.mjs <resultado.json>');
  process.exit(1);
}
const crudo = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const lista = Array.isArray(crudo) ? crudo : crudo.result ? crudo.result.catalogo : crudo.catalogo;
if (!Array.isArray(lista)) throw new Error('No encuentro la lista "catalogo" en ' + entrada);

const CARROCERIAS = new Set(['sedan', 'hatchback', 'suv', 'camioneta', 'van', 'coupe', 'otro']);
const PRESENCIAS = new Set(['muy comun', 'comun', 'poco comun']);

function mm(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 100 ? Math.round(n) : 0;
}

function anoFinal(anos) {
  const texto = String(anos || '');
  if (/hoy|actual|presente/i.test(texto)) return 9999;
  const numeros = texto.match(/\d{4}/g);
  return numeros ? Math.max(...numeros.map(Number)) : 0;
}

const porClave = new Map();
for (const e of lista) {
  if (!e || !e.marca || !e.linea) continue;
  const marca = String(e.marca).trim();
  const linea = String(e.linea).trim();
  const clave = (marca + ' ' + linea).toLowerCase();
  const limpia = {
    marca,
    linea,
    carroceria: CARROCERIAS.has(e.carroceria) ? e.carroceria : 'otro',
    largo: mm(e.largo_mm ?? e.largo),
    ancho: mm(e.ancho_mm ?? e.ancho),
    alto: mm(e.alto_mm ?? e.alto),
    entreEjes: mm(e.entre_ejes_mm ?? e.entreEjes),
    anos: String(e.anos || '').trim(),
    presencia: PRESENCIAS.has(e.presencia) ? e.presencia : 'comun',
    notas: String(e.notas || '').trim().slice(0, 120),
    fuente: String(e.fuente || '').trim().slice(0, 200),
  };
  const previa = porClave.get(clave);
  if (!previa || anoFinal(limpia.anos) > anoFinal(previa.anos)) porClave.set(clave, limpia);
}

const PESO = { 'muy comun': 0, comun: 1, 'poco comun': 2 };
const catalogo = [...porClave.values()].sort(
  (a, b) => PESO[a.presencia] - PESO[b.presencia] || a.marca.localeCompare(b.marca, 'es') || a.linea.localeCompare(b.linea, 'es'),
);

const lineas = catalogo.map((e) => '  ' + JSON.stringify(e) + ',');
const cuerpo = [
  '// GENERADO por herramientas/generar-catalogo.mjs el ' + new Date().toISOString().slice(0, 10) + '. No se edita a mano:',
  '// se corrige el JSON de la investigación y se vuelve a generar.',
  '//',
  '// Carros que ruedan en Colombia: marca, línea, carrocería, medidas en',
  '// milímetros (0 = sin confirmar; el visor usa las típicas de la',
  '// carrocería), años en que se vendieron, qué tan comunes son y la fuente de',
  '// las medidas. ' + catalogo.length + ' líneas.',
  'export const CATALOGO = [',
  ...lineas,
  '];',
  '',
];
const destino = path.join(RAIZ, 'js', 'catalogo-carros.js');
fs.writeFileSync(destino, cuerpo.join(String.fromCharCode(10)));
const sinMedidas = catalogo.filter((e) => !e.largo).length;
console.log('Escrito ' + destino + ': ' + catalogo.length + ' líneas (' + sinMedidas + ' sin medidas confirmadas)');
