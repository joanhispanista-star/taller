// Genera los iconos de la app instalable (carpeta iconos/) a partir de un
// dibujo propio en SVG: un carro de perfil en el naranja de la app, con la
// línea de la puerta (la app es de piezas) y una gota de pintura cayendo.
// Nada de marcas ajenas.
//
//   node herramientas/generar-iconos.mjs
//
// Usa `sharp`, que ya está en node_modules porque lo trae Transformers.js;
// no es una dependencia nueva. Dos variantes porque Android y iPhone no
// piden lo mismo:
//
//  - "maskable" (Android): el dibujo ocupa TODO el cuadrado y el sistema lo
//    recorta a su forma (círculo, gota, cuadrado redondeado). Por eso el
//    carro cabe en el círculo central del 80 %: lo que queda fuera de ese
//    círculo puede desaparecer en el recorte.
//  - "any" (lo demás, y el icono de la pestaña): cuadrado redondeado sobre
//    fondo transparente, que es lo que se ve bien cuando nadie recorta.
//  - 180 px para iPhone (apple-touch-icon): iOS no lee los iconos del
//    manifest; redondea las esquinas él mismo, así que va con fondo entero.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = path.join(RAIZ, 'iconos');

const FONDO = '#1a1e24'; // el mismo --fondo y theme-color de la app
const ACENTO = '#ff7a1a'; // --acento
const CLARO = '#eef1f4'; // --texto
const GOTA = '#ffd23f'; // --estado-en-proceso

// El dibujo, en un lienzo de 512. Todo lo importante está dentro del círculo
// de radio 205 centrado en (256, 256): la "zona segura" de los maskable.
function dibujo({ fondoRedondeado }) {
  const fondo = fondoRedondeado
    ? `<rect width="512" height="512" rx="96" fill="${FONDO}"/>`
    : `<rect width="512" height="512" fill="${FONDO}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${fondo}
  <!-- la gota de pintura, cayendo sobre el techo -->
  <path fill="${GOTA}" d="M300 86 C300 86 272 126 272 146 A28 28 0 0 0 328 146 C328 126 300 86 300 86 Z"/>
  <!-- la carrocería: capó bajo adelante (izquierda), cabina, baúl atrás -->
  <path fill="${ACENTO}" d="M96 330 L96 288 Q96 266 120 260 L184 248 L224 200 Q234 188 250 188 L326 188 Q344 188 356 202 L392 250 L410 256 Q430 262 430 288 L430 330 Q430 344 416 344 L110 344 Q96 344 96 330 Z"/>
  <!-- vidrios -->
  <path fill="${FONDO}" d="M238 204 L316 204 L316 246 L206 246 Z"/>
  <path fill="${FONDO}" d="M330 204 L348 204 L380 248 L330 248 Z"/>
  <!-- la línea de la puerta y la manija: la app marca piezas -->
  <rect x="254" y="254" width="5" height="76" fill="${FONDO}"/>
  <rect x="264" y="270" width="22" height="7" rx="3" fill="${FONDO}"/>
  <!-- faros -->
  <rect x="98" y="276" width="20" height="12" rx="4" fill="${GOTA}"/>
  <rect x="408" y="276" width="20" height="12" rx="4" fill="#ff3b30"/>
  <!-- ruedas: el pasarruedas oscuro, la llanta clara y el rin -->
  <circle cx="176" cy="338" r="42" fill="${FONDO}"/>
  <circle cx="176" cy="338" r="29" fill="${CLARO}"/>
  <circle cx="176" cy="338" r="13" fill="${FONDO}"/>
  <circle cx="350" cy="338" r="42" fill="${FONDO}"/>
  <circle cx="350" cy="338" r="29" fill="${CLARO}"/>
  <circle cx="350" cy="338" r="13" fill="${FONDO}"/>
</svg>`;
}

const SALIDAS = [
  { archivo: 'icono-192.png', tamano: 192, fondoRedondeado: true },
  { archivo: 'icono-512.png', tamano: 512, fondoRedondeado: true },
  { archivo: 'icono-192-maskable.png', tamano: 192, fondoRedondeado: false },
  { archivo: 'icono-512-maskable.png', tamano: 512, fondoRedondeado: false },
  { archivo: 'icono-180.png', tamano: 180, fondoRedondeado: false },
];

fs.mkdirSync(CARPETA, { recursive: true });
// El SVG también se guarda: es el original, por si hay que retocar el dibujo.
fs.writeFileSync(path.join(CARPETA, 'icono.svg'), dibujo({ fondoRedondeado: true }));
for (const s of SALIDAS) {
  const png = await sharp(Buffer.from(dibujo(s))).resize(s.tamano, s.tamano).png().toBuffer();
  fs.writeFileSync(path.join(CARPETA, s.archivo), png);
  console.log(s.archivo, s.tamano + ' px', png.length + ' bytes');
}
