// Buscar en el catálogo de carros de Colombia (catalogo-carros.js, que se
// genera solo y no se edita a mano). Sin DOM: lo usan el Garaje, el
// reconocedor y las pruebas.
import { CATALOGO } from './catalogo-carros.js';
import { normalizarCarroceria } from './carrocerias.js';

const PESO_PRESENCIA = { 'muy comun': 0, comun: 1, 'poco comun': 2 };

function sinTildes(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function nombreDeLinea(entrada) {
  return entrada.marca + ' ' + entrada.linea;
}

// El catálogo ordenado como lo lee una persona: las más comunes primero,
// luego por marca y línea.
export function catalogoOrdenado() {
  return [...CATALOGO].sort((a, b) => {
    const p = (PESO_PRESENCIA[a.presencia] ?? 1) - (PESO_PRESENCIA[b.presencia] ?? 1);
    if (p !== 0) return p;
    return nombreDeLinea(a).localeCompare(nombreDeLinea(b), 'es');
  });
}

// Busca lo que escribió la persona ("onix", "chevrolet onix", "Onix sedán").
// Devuelve las entradas que casan, mejores primero (las que empiezan igual
// ganan a las que solo contienen el texto). Sin texto, ninguna.
export function buscarLinea(texto, maximo = 8) {
  const q = sinTildes(texto);
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  const puntuadas = [];
  for (const entrada of CATALOGO) {
    const nombre = sinTildes(nombreDeLinea(entrada));
    const linea = sinTildes(entrada.linea);
    if (!palabras.every((p) => nombre.includes(p))) continue;
    let puntos = 0;
    if (nombre === q || linea === q) puntos = 3;
    else if (nombre.startsWith(q) || linea.startsWith(q)) puntos = 2;
    else puntos = 1;
    puntuadas.push({ entrada, puntos: puntos * 10 - (PESO_PRESENCIA[entrada.presencia] ?? 1) });
  }
  return puntuadas
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, maximo)
    .map((p) => p.entrada);
}

// La entrada exacta para "Marca Línea" (lo que se guardó en el carro), o null.
export function entradaDe(marca, linea) {
  const m = sinTildes(marca);
  const l = sinTildes(linea);
  return CATALOGO.find((e) => sinTildes(e.marca) === m && sinTildes(e.linea) === l) || null;
}

// La familia de una línea: "Logan I" y "Logan II" son Logan; "Hilux (AN120)
// doble cabina" y "Hilux Vigo" son Hilux y Hilux Vigo. El reconocedor
// trabaja por familias (si no, las generaciones de un mismo carro se
// reparten el voto y gana cualquier otro), y al elegir una familia se toma
// su entrada más común y más reciente (mejorDeFamilia).
const SOBRAN_AL_FINAL = new Set([
  'i', 'ii', 'iii', 'iv', 'hatchback', 'hatch', 'sedan', 'sedán', 'doble', 'cabina', 'sencilla',
  'larga', 'corta', 'largo', 'corto', 'clasico', 'clásico', 'clasica', 'clásica', 'facelift',
  'restyling', 'wagon', 'coupe', 'coupé', '5p', '3p', '4p', 'pick-up', 'pickup',
]);
const SOBRAN_AL_INICIO = new Set(['new', 'nueva', 'nuevo', 'all', 'the']);

export function familiaDe(entrada) {
  let texto = String(entrada.linea || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\/.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const marca = String(entrada.marca || '').trim();
  if (marca && texto.toLowerCase().startsWith(marca.toLowerCase() + ' ')) texto = texto.slice(marca.length + 1);
  const palabras = texto.split(' ').filter(Boolean);
  while (palabras.length > 1 && SOBRAN_AL_INICIO.has(palabras[0].toLowerCase())) palabras.shift();
  while (palabras.length > 1 && SOBRAN_AL_FINAL.has(palabras[palabras.length - 1].toLowerCase())) palabras.pop();
  return palabras.join(' ') || texto;
}

function anoFinal(anos) {
  const texto = String(anos || '');
  if (/hoy|actual|presente/i.test(texto)) return 9999;
  const numeros = texto.match(/\d{4}/g);
  return numeros ? Math.max(...numeros.map(Number)) : 0;
}

// Las entradas de una familia, la más común y más reciente primero.
export function entradasDeFamilia(marca, familia) {
  const m = sinTildes(marca);
  const f = sinTildes(familia);
  return CATALOGO.filter((e) => sinTildes(e.marca) === m && sinTildes(familiaDe(e)) === f).sort(
    (a, b) => (PESO_PRESENCIA[a.presencia] ?? 1) - (PESO_PRESENCIA[b.presencia] ?? 1) || anoFinal(b.anos) - anoFinal(a.anos),
  );
}

export function mejorDeFamilia(marca, familia) {
  return entradasDeFamilia(marca, familia)[0] || null;
}

// Lo que el carro del registro guarda de una entrada del catálogo.
export function datosDeEntrada(entrada) {
  return {
    marca: entrada.marca,
    linea: entrada.linea,
    carroceria: normalizarCarroceria(entrada.carroceria),
    medidas: {
      largo: entrada.largo || 0,
      ancho: entrada.ancho || 0,
      alto: entrada.alto || 0,
      entreEjes: entrada.entreEjes || 0,
    },
  };
}
