// Encontrar la placa en la foto del carro, sin IA: la placa colombiana de
// particular es amarilla (fondo amarillo, letras negras, 33 × 16 cm), y
// casi nada más en una foto de taller tiene ese amarillo en un rectángulo
// de esas proporciones. Con la placa ubicada se puede (1) leerla con OCR y
// (2) buscar el emblema justo encima: en Colombia la placa delantera va
// centrada en el bómper y el logo en la parrilla, arriba.
//
// Todo aquí es puro (recibe los píxeles) y se prueba en Node; la lectura
// de la foto la hace el navegador (ver leerPlacaDeFoto en el módulo del
// Garaje) o RawImage en las herramientas.

// Un píxel es "amarillo de placa" por tono (entre naranja y verde),
// saturación y luz: el amarillo normado es muy saturado, y en sombra baja
// la luz pero no el tono. Las rayas amarillas del parqueadero también
// pasan el filtro: las descarta la forma, no el color.
export function esAmarilloDePlaca(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 90) return false; // muy oscuro
  const saturacion = (max - min) / max;
  if (saturacion < 0.45) return false;
  // Tono en grados (0 rojo, 60 amarillo, 120 verde).
  let tono;
  if (max === r) tono = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) tono = 60 * ((b - r) / (max - min) + 2);
  else tono = 60 * ((r - g) / (max - min) + 4);
  if (tono < 0) tono += 360;
  // Medido en fotos reales: el amarillo de placa va de 37° (en sombra) a
  // 46° (al sol). Hasta 66° entraban hojas al sol (amarillo verdoso) y en
  // una foto de Commons un árbol pasó por placa.
  return tono >= 30 && tono <= 56;
}

// Máscara binaria (Uint8Array) de píxeles amarillos. `canales` es 4 para
// RGBA (getImageData) y 3 para RGB (RawImage).
export function mascaraAmarilla(pixeles, ancho, alto, canales = 4) {
  const mascara = new Uint8Array(ancho * alto);
  for (let i = 0, p = 0; i < ancho * alto; i++, p += canales) {
    if (esAmarilloDePlaca(pixeles[p], pixeles[p + 1], pixeles[p + 2])) mascara[i] = 1;
  }
  return mascara;
}

// Cierre morfológico: dilatar y luego erosionar con un cuadrado de
// (2·radio + 1). Las letras negras parten el amarillo de la placa en tiras
// y cada tira sola no parece placa; cerrando, la placa vuelve a ser una
// sola mancha (con las letras como huecos tapados) sin engordar el borde.
export function cerrarMascara(mascara, ancho, alto, radio = 1) {
  const pasada = (origen, valorQueManda) => {
    const salida = new Uint8Array(ancho * alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        let resultado = valorQueManda ? 0 : 1;
        for (let dy = -radio; dy <= radio && resultado !== valorQueManda; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= alto) {
            if (!valorQueManda) resultado = 0;
            continue;
          }
          for (let dx = -radio; dx <= radio; dx++) {
            const xx = x + dx;
            const v = xx < 0 || xx >= ancho ? 0 : origen[yy * ancho + xx];
            if (v === valorQueManda) {
              resultado = valorQueManda;
              break;
            }
          }
        }
        salida[y * ancho + x] = resultado;
      }
    }
    return salida;
  };
  return pasada(pasada(mascara, 1), 0); // dilatar (manda el 1), erosionar (manda el 0)
}

// Fracción del borde de la caja que es amarillo: en una placa, casi todo
// (el amarillo rodea las letras); en un número pintado en el piso o una
// raya, poco (los trazos tocan el asfalto por todos lados).
function bordeAmarillo(mascara, ancho, c) {
  let amarillos = 0;
  let total = 0;
  for (let x = c.x1; x <= c.x2; x++) {
    amarillos += mascara[c.y1 * ancho + x] + mascara[c.y2 * ancho + x];
    total += 2;
  }
  for (let y = c.y1 + 1; y < c.y2; y++) {
    amarillos += mascara[y * ancho + c.x1] + mascara[y * ancho + c.x2];
    total += 2;
  }
  return total ? amarillos / total : 0;
}

// Fracción de la caja que son huecos: píxeles NO amarillos (en la máscara
// original, sin cerrar) que no se conectan con el borde de la caja. En una
// placa, las letras son huecos: el amarillo las rodea. En un número pintado
// en el piso, el asfalto entre los trazos sale hasta el borde de la caja y
// no cuenta. Es lo que separa la placa de la Captiva de Joan del "243"
// pintado en su parqueadero (medido el 16-oct-2026).
function huecosEncerrados(mascara, ancho, c) {
  const w = c.x2 - c.x1 + 1;
  const h = c.y2 - c.y1 + 1;
  const fuera = new Uint8Array(w * h);
  const pila = [];
  const marcar = (x, y) => {
    const i = (y - c.y1) * w + (x - c.x1);
    if (!mascara[y * ancho + x] && !fuera[i]) {
      fuera[i] = 1;
      pila.push(x, y);
    }
  };
  for (let x = c.x1; x <= c.x2; x++) {
    marcar(x, c.y1);
    marcar(x, c.y2);
  }
  for (let y = c.y1; y <= c.y2; y++) {
    marcar(c.x1, y);
    marcar(c.x2, y);
  }
  while (pila.length) {
    const y = pila.pop();
    const x = pila.pop();
    if (x > c.x1) marcar(x - 1, y);
    if (x < c.x2) marcar(x + 1, y);
    if (y > c.y1) marcar(x, y - 1);
    if (y < c.y2) marcar(x, y + 1);
  }
  let huecos = 0;
  for (let y = c.y1; y <= c.y2; y++) {
    for (let x = c.x1; x <= c.x2; x++) {
      if (!mascara[y * ancho + x] && !fuera[(y - c.y1) * w + (x - c.x1)]) huecos += 1;
    }
  }
  return huecos / (w * h);
}

// Componentes conexas (4-vecinos) de la máscara, con su caja y su área.
function componentes(mascara, ancho, alto) {
  const visto = new Uint8Array(ancho * alto);
  const salida = [];
  const pila = new Int32Array(ancho * alto);
  for (let inicio = 0; inicio < ancho * alto; inicio++) {
    if (!mascara[inicio] || visto[inicio]) continue;
    let tope = 0;
    pila[tope++] = inicio;
    visto[inicio] = 1;
    let area = 0;
    let x1 = ancho, y1 = alto, x2 = -1, y2 = -1;
    while (tope > 0) {
      const i = pila[--tope];
      const x = i % ancho;
      const y = (i - x) / ancho;
      area += 1;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
      const vecinos = [i - 1, i + 1, i - ancho, i + ancho];
      if (x === 0) vecinos[0] = -1;
      if (x === ancho - 1) vecinos[1] = -1;
      for (const v of vecinos) {
        if (v >= 0 && v < ancho * alto && mascara[v] && !visto[v]) {
          visto[v] = 1;
          pila[tope++] = v;
        }
      }
    }
    salida.push({ x1, y1, x2, y2, area });
  }
  return salida;
}

// Fracción de píxeles oscuros dentro de una caja: las letras de la placa.
// Una raya pintada o un aviso amarillo liso no tienen.
function fraccionOscura(pixeles, ancho, canales, c) {
  if (!pixeles) return null;
  let oscuros = 0;
  let total = 0;
  for (let y = c.y1; y <= c.y2; y++) {
    for (let x = c.x1; x <= c.x2; x++) {
      const p = (y * ancho + x) * canales;
      if (Math.max(pixeles[p], pixeles[p + 1], pixeles[p + 2]) < 90) oscuros += 1;
      total += 1;
    }
  }
  return oscuros / total;
}

// Las candidatas a placa entre las manchas amarillas: proporción de placa
// (33 × 16 es 2,06, pero la placa de la Captiva de Joan, en una foto de
// tres cuartos, salía más alta que ancha, 0,56: se admite de 0,45 a 3,8), con
// bastante amarillo en su caja (las letras se comen una parte: desde
// 0,33), ni ínfima ni enorme, y con letras oscuras adentro si se dan los
// píxeles. Devuelve las cajas como fracciones del ancho y del alto,
// mejores primero: más grande, más abajo en la foto (la placa va en el
// bómper) y con letras gana.
// Todas las manchas amarillas con sus medidas y el motivo por el que no
// son placa (o '' si lo son). Lo usa candidatasAPlaca y la herramienta de
// medir, para ver por qué una placa real no salió.
export function diagnosticarManchas(mascara, ancho, alto, pixeles = null, canales = 4) {
  const total = ancho * alto;
  const cerrada = cerrarMascara(mascara, ancho, alto, 2);
  const salida = [];
  for (const c of componentes(cerrada, ancho, alto)) {
    const w = c.x2 - c.x1 + 1;
    const h = c.y2 - c.y1 + 1;
    if (w < 6 || h < 4) continue;
    const proporcion = w / h;
    const relleno = c.area / (w * h);
    const fraccion = c.area / total;
    const huecos = huecosEncerrados(mascara, ancho, c);
    const oscuros = fraccionOscura(pixeles, ancho, canales, c);
    const borde = bordeAmarillo(cerrada, ancho, c);
    const cy = (c.y1 + c.y2) / 2 / alto;
    const tocaElPiso = c.y2 >= alto - 3 ? 0.3 : 1;
    let motivo = '';
    if (proporcion < 0.45 || proporcion > 3.8) motivo = 'proporción';
    else if (relleno < 0.4) motivo = 'poco relleno';
    else if (fraccion < 0.0012 || fraccion > 0.12) motivo = 'tamaño';
    else if (huecos < 0.02) motivo = 'sin letras encerradas';
    else if (oscuros !== null && oscuros < 0.04) motivo = 'sin nada oscuro';
    // Hojas al sol: amarillo de placa, con sombras encerradas, pero en lo
    // alto de la foto y con más de la mitad oscura. Una placa va en el
    // bómper (en una foto de carro nunca queda en el 12 % de arriba) y sus
    // letras ocupan como un tercio (la Captiva 0,33; unos Audi de noche
    // con marco, 0,48; las hojas, 0,46 a 0,56: el tope va en 0,52 y las
    // hojas que quedan las saca la altura).
    else if (cy < 0.12 || c.y1 / alto < 0.05) motivo = 'muy arriba en la foto';
    else if (oscuros !== null && oscuros > 0.52) motivo = 'demasiado oscuro para ser placa';
    salida.push({
      x: c.x1 / ancho,
      y: c.y1 / alto,
      w: w / ancho,
      h: h / alto,
      relleno,
      proporcion,
      fraccion,
      borde,
      huecos,
      oscuros,
      motivo,
      // Tamaño manda; la altura en la foto, el borde amarillo, lo oscuro y
      // los huecos suman; tocar el borde de abajo (piso pintado) resta.
      puntaje: fraccion * (0.6 + 0.4 * cy) * relleno * (0.5 + borde) * (1 + (oscuros || 0)) * (1 + 10 * huecos) * tocaElPiso,
    });
  }
  return salida.sort((a, b) => b.puntaje - a.puntaje);
}

export function candidatasAPlaca(mascara, ancho, alto, pixeles = null, canales = 4) {
  return diagnosticarManchas(mascara, ancho, alto, pixeles, canales).filter((m) => !m.motivo);
}

// La placa más probable, o null. Pensado para una versión reducida de la
// foto de unos 640 px de ancho: a 360 las letras de una placa chica no se
// resuelven y los huecos no se ven; a 640 sí, y sigue tardando poco.
export function buscarPlaca(pixeles, ancho, alto, canales = 4) {
  const candidatas = candidatasAPlaca(mascaraAmarilla(pixeles, ancho, alto, canales), ancho, alto, pixeles, canales);
  return candidatas[0] || null;
}

// La caja de la placa con un margen alrededor (fracción de su alto), para
// recortarla y leerla: el marco y los bordes ayudan al OCR a enderezarla.
export function recorteDePlaca(placa, margen = 0.35) {
  const mx = placa.w * margen * 0.6;
  const my = placa.h * margen;
  return {
    x: Math.max(0, placa.x - mx),
    y: Math.max(0, placa.y - my),
    w: Math.min(1 - Math.max(0, placa.x - mx), placa.w + 2 * mx),
    h: Math.min(1 - Math.max(0, placa.y - my), placa.h + 2 * my),
  };
}

// Dónde buscar el emblema sabiendo dónde está la placa: encima, centrado
// con ella, hasta tres alturas de placa hacia arriba y una placa y media a
// cada lado (en una foto de tres cuartos el logo queda un poco corrido).
// Devuelve puntos (fracciones) para recortar alrededor, de centro hacia
// afuera, y la escala de recorte sugerida (el logo mide como la mitad del
// ancho de la placa).
export function zonaDelLogo(placa, { filas: alturas = [1.0, 1.9, 2.8] } = {}) {
  const cx = placa.x + placa.w / 2;
  const filas = alturas.map((k) => placa.y - k * placa.h);
  const columnas = [0, -0.7, 0.7, -1.4, 1.4].map((k) => cx + k * placa.w);
  const puntos = [];
  for (const y of filas) {
    for (const x of columnas) {
      if (x > 0.01 && x < 0.99 && y > 0.01 && y < 0.99) puntos.push({ x, y });
    }
  }
  return { puntos, escala: Math.max(0.06, Math.min(0.25, placa.w * 1.6)) };
}

// ---- Leer la placa ----

// Del texto que devuelve el OCR a una placa colombiana, o '' si no hay.
// Carros: tres letras y tres números (ABC123). Motos: tres letras, dos
// números y una letra (ABC12D). El OCR confunde letras con números que se
// parecen; como la posición dice qué va en cada sitio, se corrige: en las
// letras un 0 es O, un 1 es I, un 8 es B, un 5 es S, un 2 es Z, un 6 es G;
// en los números al revés.
const A_LETRA = { 0: 'O', 1: 'I', 8: 'B', 5: 'S', 2: 'Z', 6: 'G', 4: 'A', 7: 'T' };
const A_NUMERO = { O: '0', Q: '0', D: '0', I: '1', L: '1', B: '8', S: '5', Z: '2', G: '6', T: '7', A: '4' };

export function textoAPlaca(texto) {
  const limpio = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.length < 6) return '';
  // Se prueba cada ventana de seis caracteres (el OCR mete basura al
  // lado: el marco, "FUNZA", "COLOMBIA") y gana la que menos corrige.
  let mejor = '';
  let menosCambios = Infinity;
  for (let i = 0; i + 6 <= limpio.length; i++) {
    const v = limpio.slice(i, i + 6);
    const letras = v.slice(0, 3).split('').map((c) => (/[A-Z]/.test(c) ? c : A_LETRA[c] || null));
    const numeros = v.slice(3, 5).split('').map((c) => (/[0-9]/.test(c) ? c : A_NUMERO[c] || null));
    const esMoto = /[A-Z]/.test(v[5]);
    // Carro: el último también es número (corregible). Moto: el último es
    // letra tal cual, y los dos números tienen que venir como números: si
    // no, "CAPTIVA" pasaría por la moto CAP71V.
    const ultimo = esMoto ? v[5] : /[0-9]/.test(v[5]) ? v[5] : A_NUMERO[v[5]] || null;
    if (letras.includes(null) || numeros.includes(null) || ultimo === null) continue;
    if (esMoto && !/^[0-9]{2}$/.test(v.slice(3, 5))) continue;
    const candidata = letras.join('') + numeros.join('') + ultimo;
    let cambios = 0;
    for (let k = 0; k < 6; k++) if (candidata[k] !== v[k]) cambios += 1;
    if (cambios < menosCambios) {
      menosCambios = cambios;
      mejor = candidata;
    }
  }
  return menosCambios <= 2 ? mejor : '';
}

// Deja la placa en blanco y negro para el OCR: gris por el canal con más
// contraste entre el amarillo y las letras (el azul: el amarillo casi no
// tiene azul y las letras negras tampoco, así que se usa la luz), y umbral
// de Otsu (el que mejor separa dos grupos). Devuelve RGBA del mismo tamaño,
// letras negras sobre blanco, que es lo que Tesseract espera.
export function binarizarPlaca(pixeles, ancho, alto, canales = 4) {
  const n = ancho * alto;
  const gris = new Uint8Array(n);
  const histograma = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += canales) {
    // Luz percibida; el amarillo sale claro y las letras oscuras.
    const v = Math.round(0.299 * pixeles[p] + 0.587 * pixeles[p + 1] + 0.114 * pixeles[p + 2]);
    gris[i] = v;
    histograma[v] += 1;
  }
  // Otsu.
  let suma = 0;
  for (let t = 0; t < 256; t++) suma += t * histograma[t];
  let sumaB = 0;
  let pesoB = 0;
  let mejorVarianza = -1;
  let desde = 128;
  let hasta = 128;
  for (let t = 0; t < 256; t++) {
    pesoB += histograma[t];
    if (pesoB === 0) continue;
    const pesoF = n - pesoB;
    if (pesoF === 0) break;
    sumaB += t * histograma[t];
    const mediaB = sumaB / pesoB;
    const mediaF = (suma - sumaB) / pesoF;
    const varianza = pesoB * pesoF * (mediaB - mediaF) * (mediaB - mediaF);
    // Con dos grupos bien separados la varianza es igual para todo el
    // hueco entre ellos: el umbral va al medio del hueco, no a su borde.
    if (varianza > mejorVarianza) {
      mejorVarianza = varianza;
      desde = t;
      hasta = t;
    } else if (varianza === mejorVarianza) {
      hasta = t;
    }
  }
  const umbral = Math.round((desde + hasta) / 2);
  const salida = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const v = gris[i] > umbral ? 255 : 0;
    salida[i * 4] = v;
    salida[i * 4 + 1] = v;
    salida[i * 4 + 2] = v;
    salida[i * 4 + 3] = 255;
  }
  return { pixeles: salida, umbral };
}

// ---- Enderezar la placa ----

// Las cuatro esquinas de la placa a partir de su mancha amarilla (la
// máscara cerrada, dentro de la caja `c` en píxeles): el punto más arriba a
// la izquierda es el que minimiza x+y, el de arriba a la derecha el que
// maximiza x−y, y así. Vale mientras la placa no esté girada más de 45°,
// que en una foto de carro no pasa. Devuelve [arribaIzq, arribaDer,
// abajoDer, abajoIzq] como fracciones del ancho y del alto.
export function esquinasDePlaca(mascara, ancho, alto, c) {
  let ai = null, ad = null, bd = null, bi = null;
  for (let y = c.y1; y <= c.y2; y++) {
    for (let x = c.x1; x <= c.x2; x++) {
      if (!mascara[y * ancho + x]) continue;
      if (!ai || x + y < ai.x + ai.y) ai = { x, y };
      if (!ad || x - y > ad.x - ad.y) ad = { x, y };
      if (!bd || x + y > bd.x + bd.y) bd = { x, y };
      if (!bi || x - y < bi.x - bi.y) bi = { x, y };
    }
  }
  if (!ai) return null;
  return [ai, ad, bd, bi].map((p) => ({ x: p.x / ancho, y: p.y / alto }));
}

// Resuelve la homografía que lleva las esquinas del rectángulo de salida
// (0,0)-(W,0)-(W,H)-(0,H) a las cuatro esquinas de origen: ocho incógnitas,
// ocho ecuaciones, eliminación de Gauss. Devuelve la matriz 3×3 (h33 = 1).
function homografia(destino, origen) {
  // Para cada par (u,v) → (x,y): x = (a u + b v + c) / (g u + h v + 1), y = (d u + e v + f) / (g u + h v + 1).
  const A = [];
  const B = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = destino[i];
    const { x, y } = origen[i];
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    B.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    B.push(y);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let fila = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[fila][col])) fila = r;
    [A[col], A[fila]] = [A[fila], A[col]];
    [B[col], B[fila]] = [B[fila], B[col]];
    const pivote = A[col][col];
    if (Math.abs(pivote) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / pivote;
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[r][k] -= f * A[col][k];
      B[r] -= f * B[col];
    }
  }
  const h = B.map((b, i) => b / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// Endereza la placa: toma las cuatro esquinas (fracciones) en la foto y
// devuelve RGBA de `anchoSalida` × `altoSalida` con la placa plana y de
// frente, muestreando con interpolación bilineal. Es lo que le pasa el OCR:
// Tesseract no lee texto inclinado, y la placa de la Captiva de Joan salía
// a 30° en su foto de tres cuartos.
export function rectificarPlaca(pixeles, ancho, alto, canales, esquinas, anchoSalida = 660, altoSalida = 320) {
  const destino = [{ x: 0, y: 0 }, { x: anchoSalida, y: 0 }, { x: anchoSalida, y: altoSalida }, { x: 0, y: altoSalida }];
  const origen = esquinas.map((e) => ({ x: e.x * ancho, y: e.y * alto }));
  const H = homografia(destino, origen);
  if (!H) return null;
  const salida = new Uint8ClampedArray(anchoSalida * altoSalida * 4);
  const leer = (x, y, k) => pixeles[(y * ancho + x) * canales + k];
  for (let v = 0; v < altoSalida; v++) {
    for (let u = 0; u < anchoSalida; u++) {
      const w = H[6] * u + H[7] * v + 1;
      const x = (H[0] * u + H[1] * v + H[2]) / w;
      const y = (H[3] * u + H[4] * v + H[5]) / w;
      const i = (v * anchoSalida + u) * 4;
      if (x < 0 || y < 0 || x >= ancho - 1 || y >= alto - 1) {
        salida[i] = salida[i + 1] = salida[i + 2] = 255;
        salida[i + 3] = 255;
        continue;
      }
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      for (let k = 0; k < 3; k++) {
        const arriba = leer(x0, y0, k) * (1 - fx) + leer(x0 + 1, y0, k) * fx;
        const abajo = leer(x0, y0 + 1, k) * (1 - fx) + leer(x0 + 1, y0 + 1, k) * fx;
        salida[i + k] = arriba * (1 - fy) + abajo * fy;
      }
      salida[i + 3] = 255;
    }
  }
  return { pixeles: salida, ancho: anchoSalida, alto: altoSalida };
}
