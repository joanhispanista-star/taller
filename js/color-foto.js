// El color del carro, sacado de la foto.
//
// No hace falta una IA: el carro ocupa el centro de la foto que toma el
// dueño, así que el color que más se repite en esa zona es la pintura.
// Se agrupan los colores (k-medias con semillas fijas, para que la misma
// foto dé siempre el mismo resultado) y se descarta lo que es vidrio o
// llanta (muy oscuro y azulado) a menos que el carro sea negro de verdad.
//
// `colorDominante` es pura (recibe los píxeles) y se prueba en Node;
// `colorDeFoto` usa el canvas del navegador.

// Colores que dice la gente en un taller colombiano, en vez de un hex.
export const PALETA = [
  { nombre: 'blanco', hex: '#f2f2f0' },
  { nombre: 'plateado', hex: '#c8cccf' },
  { nombre: 'gris', hex: '#6d7278' },
  { nombre: 'negro', hex: '#1b1d21' },
  { nombre: 'rojo', hex: '#b8232a' },
  { nombre: 'vinotinto', hex: '#5e1a26' },
  { nombre: 'azul', hex: '#1f4e9c' },
  { nombre: 'azul oscuro', hex: '#1b2a4a' },
  { nombre: 'verde', hex: '#2e7d4f' },
  { nombre: 'amarillo', hex: '#e8c21a' },
  { nombre: 'naranja', hex: '#e2671a' },
  { nombre: 'café', hex: '#5a3a24' },
  { nombre: 'beige', hex: '#c9b48c' },
];

export function hexARgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbAHex([r, g, b]) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function distancia2(a, b) {
  // Ponderación aproximada a cómo ve el ojo: el verde pesa más que el azul.
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

export function nombreDeColor(hex) {
  const rgb = hexARgb(hex);
  let mejor = PALETA[0];
  let menor = Infinity;
  for (const color of PALETA) {
    const d = distancia2(rgb, hexARgb(color.hex));
    if (d < menor) {
      menor = d;
      mejor = color;
    }
  }
  return mejor.nombre;
}

// `pixeles` es un Uint8ClampedArray RGBA (lo que da getImageData) de
// `ancho` x `alto`. Devuelve { hex, nombre, proporcion }.
export function colorDominante(pixeles, ancho, alto, { recorte = 0.5, grupos = 6 } = {}) {
  const puntos = [];
  const x0 = Math.floor((ancho * (1 - recorte)) / 2);
  const y0 = Math.floor((alto * (1 - recorte)) / 2);
  const x1 = ancho - x0;
  const y1 = alto - y0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * ancho + x) * 4;
      if (pixeles[i + 3] < 128) continue; // transparente
      puntos.push([pixeles[i], pixeles[i + 1], pixeles[i + 2]]);
    }
  }
  if (puntos.length === 0) return { hex: '#cfd4da', nombre: 'plateado', proporcion: 0 };

  // Semillas repartidas por el recorte, no al azar: mismo resultado siempre.
  let centros = [];
  for (let k = 0; k < grupos; k++) centros.push([...puntos[Math.floor(((k + 0.5) * puntos.length) / grupos)]]);
  let asignacion = new Int32Array(puntos.length);
  for (let paso = 0; paso < 8; paso++) {
    const suma = centros.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < puntos.length; p++) {
      let mejor = 0;
      let menor = Infinity;
      for (let k = 0; k < centros.length; k++) {
        const d = distancia2(puntos[p], centros[k]);
        if (d < menor) {
          menor = d;
          mejor = k;
        }
      }
      asignacion[p] = mejor;
      const s = suma[mejor];
      s[0] += puntos[p][0];
      s[1] += puntos[p][1];
      s[2] += puntos[p][2];
      s[3] += 1;
    }
    centros = suma.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centros[k]));
  }
  const cuentas = centros.map((_, k) => 0);
  for (let p = 0; p < puntos.length; p++) cuentas[asignacion[p]] += 1;

  // Vidrios y llantas son casi negros y tiran a azul: se descartan salvo que
  // dominen de lejos (entonces el carro es negro).
  const candidatos = centros
    .map((c, k) => ({ c, n: cuentas[k] }))
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n);
  const esOscuro = (c) => c[0] + c[1] + c[2] < 3 * 40;
  let elegido = candidatos.find((g) => !esOscuro(g.c));
  if (!elegido || (esOscuro(candidatos[0].c) && candidatos[0].n > 0.6 * puntos.length)) elegido = candidatos[0];
  const hex = rgbAHex(elegido.c);
  return { hex, nombre: nombreDeColor(hex), proporcion: elegido.n / puntos.length };
}

// Lee el archivo de la cámara, lo reduce a un cuadrito (el color no
// necesita más) y saca el dominante del centro.
//
// Se decodifica con createImageBitmap y no con un <img>: el decode() de la
// imagen depende de que la página esté dibujando, y en una pestaña tapada
// (o en el panel de pruebas oculto) se quedaba esperando para siempre.
export async function colorDeFoto(archivo, { lado = 96 } = {}) {
  const imagen = await cargarParaColor(archivo, lado);
  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imagen, 0, 0, lado, lado);
    const { data } = ctx.getImageData(0, 0, lado, lado);
    return colorDominante(data, lado, lado);
  } finally {
    if (imagen.close) imagen.close();
  }
}

async function cargarParaColor(archivo, lado) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo, { resizeWidth: lado, resizeHeight: lado, resizeQuality: 'medium' });
    } catch {
      // Sigue con el <img> de abajo.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    return imagen;
  } finally {
    URL.revokeObjectURL(url);
  }
}
