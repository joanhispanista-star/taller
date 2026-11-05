// Un lector de OBJ sobre los bytes, para la ruta del iPhone: el OBJ suelto y el del ZIP.
//
// OBJLoader arma una cadena por línea, arreglos de JavaScript y tres vértices por triángulo:
// con la misma Kona de 546.584 triángulos daba 1.317.408 vértices y +748 MB de pico, contra
// 155.075 y +366 MB del GLB, y al simplificar cada triángulo era su propia isla de foto. Aquí
// hay un vértice por cada (v, vt, material) distinto, los que escribió la app que exportó, y
// arreglos tipados desde el principio.
//
// Lo que no sepa leer no lo adivina: devuelve null y quien llama usa OBJLoader, que sí entiende
// el color por vértice, los archivos de solo puntos y las líneas raras. Mejor lento que un
// carro roto.

const TAB = 9;
const LF = 10;
const CR = 13;
const ESPACIO = 32;
const MAS = 43;
const MENOS = 45;
const PUNTO = 46;
const BARRA = 47;
const CERO = 48;
const E_MAYUSCULA = 69;
const CONTINUACION = 92;
const E_MINUSCULA = 101;
const LETRA_F = 102;
const LETRA_L = 108;
const LETRA_M = 109;
const LETRA_N = 110;
const LETRA_P = 112;
const LETRA_T = 116;
const LETRA_U = 117;
const LETRA_V = 118;

// Un entero menor que 2^53 y una potencia de diez hasta 10^22 son doubles exactos, y una sola
// multiplicación o división entre ellos sale bien redondeada: da lo mismo que parseFloat.
// Sumar los decimales de a 0,1 acumula error, y sobre un límite de redondeo de 32 bits cambia
// el número (el prototipo de este lector lo hacía).
const LIMITE_EXACTO = 2 ** 53;
const POTENCIAS_DE_DIEZ = Array.from({ length: 23 }, (_, k) => Number('1e' + k));

const decodificador = new TextDecoder();

// Cuánto hay que reservar, sin pasar por cadenas. Null si hay algo que solo OBJLoader entiende.
function contar(b, desde) {
  const n = b.length;
  let vertices = 0;
  let coordenadas = 0;
  let esquinas = 0;
  let triangulos = 0;
  for (let i = desde; i < n; ) {
    let fin = b.indexOf(LF, i);
    if (fin < 0) fin = n;
    // Una barra al final une la línea con la siguiente: OBJLoader sí sabe.
    if (b[fin - 1] === CONTINUACION || (b[fin - 1] === CR && b[fin - 2] === CONTINUACION)) return null;
    let j = i;
    while (j < fin && (b[j] === ESPACIO || b[j] === TAB)) j++;
    if (j < fin) {
      const c0 = b[j];
      const c1 = b[j + 1];
      if (c0 === LETRA_V) {
        if (c1 === ESPACIO || c1 === TAB) {
          vertices++;
        } else {
          // vn y vp no se usan; cualquier otra cosa que empiece por v es desconocida.
          const c2 = b[j + 2];
          if (c1 !== LETRA_T && c1 !== LETRA_N && c1 !== LETRA_P) return null;
          if (c2 !== ESPACIO && c2 !== TAB) return null;
          if (c1 === LETRA_T) coordenadas++;
        }
      } else if (c0 === LETRA_F) {
        if (c1 !== ESPACIO && c1 !== TAB) return null;
        let enLaLinea = 0;
        let dentro = false;
        for (let k = j + 1; k < fin; k++) {
          const c = b[k];
          const blanco = c === ESPACIO || c === TAB || c === CR;
          if (!blanco && !dentro) enLaLinea++;
          dentro = !blanco;
        }
        if (enLaLinea < 3) return null;
        esquinas += enLaLinea;
        triangulos += enLaLinea - 2;
      } else if (c0 === LETRA_L || c0 === LETRA_P) {
        // Líneas y puntos sueltos: los arma OBJLoader.
        return null;
      }
    }
    i = fin + 1;
  }
  // Sin caras es una nube de puntos: también la arma OBJLoader.
  return triangulos ? { vertices, coordenadas, esquinas, triangulos } : null;
}

// De los bytes de un OBJ a { posiciones, uvs, indices, materiales, grupos, bibliotecas }, o
// null si hay algo que no sabe leer. `uvs` es null si las caras no traen coordenadas.
// `materiales` son los nombres de los usemtl que tienen caras; `grupos`, los tramos de `indices`
// de cada uno: { inicio, cuenta, material }. `bibliotecas`, lo que dicen los mtllib.
export function leerObj(b) {
  const n = b.length;
  // Con la marca de UTF-8 al principio, el primer "v" se quedaría sin leer y todos los índices
  // saldrían corridos.
  const desde = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  const conteo = contar(b, desde);
  if (!conteo) return null;
  const leidos = new Float32Array(conteo.vertices * 3);
  const leidas = new Float32Array(conteo.coordenadas * 2);
  const indices = new Uint32Array(conteo.triangulos * 3);
  // Los vértices de salida de cada `v`, en lista enlazada: casi siempre son menos de seis, así
  // que basta recorrerla. Un Map pedía un objeto por vértice. Las esquinas son el tope; las
  // páginas que no se tocan no ocupan memoria de verdad.
  const primero = new Int32Array(conteo.vertices).fill(-1);
  const siguiente = new Int32Array(conteo.esquinas);
  const verticeDe = new Int32Array(conteo.esquinas);
  const coordenadaDe = new Int32Array(conteo.esquinas);
  const materialDe = new Int32Array(conteo.esquinas);
  const materiales = [];
  const grupos = [];
  const bibliotecas = [];
  let nombreMaterial = '';
  let material = -1;
  let cuantos = 0;
  let ip = 0;
  let it = 0;
  let ii = 0;
  let conCoordenadas = false;
  let sinCoordenadas = false;
  let i = desde;

  const finDeToken = (c) => c === ESPACIO || c === TAB || c === CR || c === LF || c === undefined;

  // Un número como parseFloat, pero sin cadena. NaN si no es un número.
  const numero = () => {
    while (b[i] === ESPACIO || b[i] === TAB) i++;
    const inicio = i;
    const negativo = b[i] === MENOS;
    if (negativo || b[i] === MAS) i++;
    let mantisa = 0;
    let digitos = 0;
    let decimales = 0;
    for (let d = b[i] - CERO; d >= 0 && d <= 9; d = b[++i] - CERO) {
      mantisa = mantisa * 10 + d;
      digitos++;
    }
    if (b[i] === PUNTO) {
      i++;
      for (let d = b[i] - CERO; d >= 0 && d <= 9; d = b[++i] - CERO) {
        mantisa = mantisa * 10 + d;
        digitos++;
        decimales++;
      }
    }
    if (!digitos) return NaN;
    let exponente = -decimales;
    if (b[i] === E_MINUSCULA || b[i] === E_MAYUSCULA) {
      i++;
      const bajo = b[i] === MENOS;
      if (bajo || b[i] === MAS) i++;
      let valor = 0;
      let cifras = 0;
      for (let d = b[i] - CERO; d >= 0 && d <= 9; d = b[++i] - CERO) {
        valor = valor * 10 + d;
        cifras++;
      }
      if (!cifras) return NaN;
      exponente += bajo ? -valor : valor;
    }
    if (!finDeToken(b[i])) return NaN;
    if (mantisa < LIMITE_EXACTO && exponente >= -22 && exponente <= 22) {
      const valor = exponente < 0 ? mantisa / POTENCIAS_DE_DIEZ[-exponente] : mantisa * POTENCIAS_DE_DIEZ[exponente];
      return negativo ? -valor : valor;
    }
    // Más cifras de las que caben (un exportador con 17 decimales): ahí sí, parseFloat.
    return parseFloat(decodificador.decode(b.subarray(inicio, i)));
  };

  // Un índice con signo; 0 si no hay cifras (y 0 tampoco es un índice válido en un OBJ).
  const entero = () => {
    const negativo = b[i] === MENOS;
    if (negativo) i++;
    let valor = 0;
    for (let d = b[i] - CERO; d >= 0 && d <= 9; d = b[++i] - CERO) valor = valor * 10 + d;
    return negativo ? -valor : valor;
  };

  // v, v/t, v//n o v/t/n: el vértice de salida de esa esquina, o -1 si no sabe leerla. El índice
  // negativo cuenta desde lo que va leído en ese punto del archivo, no desde el total.
  const esquina = () => {
    while (b[i] === ESPACIO || b[i] === TAB) i++;
    let v = entero();
    const vistos = ip / 3;
    if (v < 0) v += vistos + 1;
    if (v < 1 || v > vistos) return -1;
    let t = 0;
    if (b[i] === BARRA) {
      i++;
      if (b[i] !== BARRA && !finDeToken(b[i])) {
        t = entero();
        const vistas = it / 2;
        if (t < 0) t += vistas + 1;
        if (t < 1 || t > vistas) return -1;
      }
      if (b[i] === BARRA) {
        i++;
        // La normal se ignora (nada la usa), pero tiene que ser un número.
        if (!finDeToken(b[i]) && !entero()) return -1;
      }
    }
    if (!finDeToken(b[i])) return -1;
    if (t) conCoordenadas = true;
    else sinCoordenadas = true;
    for (let g = primero[v - 1]; g >= 0; g = siguiente[g]) {
      if (coordenadaDe[g] === t && materialDe[g] === material) return g;
    }
    const g = cuantos++;
    verticeDe[g] = v - 1;
    coordenadaDe[g] = t;
    materialDe[g] = material;
    siguiente[g] = primero[v - 1];
    primero[v - 1] = g;
    return g;
  };

  // Lo que queda de la línea son solo blancos.
  const alFinal = () => {
    while (b[i] === ESPACIO || b[i] === TAB) i++;
    if (b[i] === CR) i++;
    return i >= n || b[i] === LF;
  };

  const esPalabra = (palabra) => {
    for (let k = 0; k < palabra.length; k++) if (b[i + k] !== palabra.charCodeAt(k)) return false;
    const c = b[i + palabra.length];
    return c === ESPACIO || c === TAB;
  };

  const restoDeLinea = () => {
    let fin = b.indexOf(LF, i);
    if (fin < 0) fin = n;
    return decodificador.decode(b.subarray(i, fin)).trim();
  };

  while (i < n) {
    while (b[i] === ESPACIO || b[i] === TAB) i++;
    const c0 = b[i];
    const c1 = b[i + 1];
    if (c0 === LETRA_V && (c1 === ESPACIO || c1 === TAB)) {
      i += 2;
      const x = numero();
      const y = numero();
      const z = numero();
      // Un número de más es color por vértice (o un w): de eso se encarga OBJLoader.
      if (x !== x || y !== y || z !== z || !alFinal()) return null;
      leidos[ip++] = x;
      leidos[ip++] = y;
      leidos[ip++] = z;
    } else if (c0 === LETRA_V && c1 === LETRA_T) {
      i += 3;
      const u = numero();
      const v = numero();
      if (u !== u || v !== v) return null;
      // La tercera coordenada de textura (hay exportadores que la escriben) no se usa.
      if (!alFinal()) {
        const w = numero();
        if (w !== w || !alFinal()) return null;
      }
      leidas[it++] = u;
      leidas[it++] = v;
    } else if (c0 === LETRA_F) {
      if (material < 0) {
        material = materiales.indexOf(nombreMaterial);
        if (material < 0) material = materiales.push(nombreMaterial) - 1;
        grupos.push({ inicio: ii, cuenta: 0, material });
      }
      i += 2;
      const a = esquina();
      let anterior = esquina();
      if (a < 0 || anterior < 0) return null;
      // En abanico, como OBJLoader: los mismos triángulos, en el mismo orden.
      for (;;) {
        while (b[i] === ESPACIO || b[i] === TAB) i++;
        if (i >= n || b[i] === LF || b[i] === CR) break;
        const c = esquina();
        if (c < 0) return null;
        indices[ii++] = a;
        indices[ii++] = anterior;
        indices[ii++] = c;
        anterior = c;
      }
      if (!alFinal()) return null;
      grupos[grupos.length - 1].cuenta = ii - grupos[grupos.length - 1].inicio;
    } else if (c0 === LETRA_U && esPalabra('usemtl')) {
      i += 7;
      const nombre = restoDeLinea();
      if (nombre !== nombreMaterial) {
        nombreMaterial = nombre;
        material = -1;
      }
    } else if (c0 === LETRA_M && esPalabra('mtllib')) {
      i += 7;
      bibliotecas.push(restoDeLinea());
    }
    const fin = b.indexOf(LF, i);
    i = fin < 0 ? n : fin + 1;
  }
  // Caras con y sin coordenadas en el mismo archivo: OBJLoader decide por objeto qué hacer.
  if (conCoordenadas && sinCoordenadas) return null;
  const posiciones = new Float32Array(cuantos * 3);
  const uvs = conCoordenadas ? new Float32Array(cuantos * 2) : null;
  for (let g = 0; g < cuantos; g++) {
    const p = verticeDe[g] * 3;
    posiciones[g * 3] = leidos[p];
    posiciones[g * 3 + 1] = leidos[p + 1];
    posiciones[g * 3 + 2] = leidos[p + 2];
    if (uvs) {
      const t = (coordenadaDe[g] - 1) * 2;
      uvs[g * 2] = leidas[t];
      uvs[g * 2 + 1] = leidas[t + 1];
    }
  }
  return { posiciones, uvs, indices, materiales, grupos, bibliotecas };
}
