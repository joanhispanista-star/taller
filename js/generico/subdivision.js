// Catmull-Clark con pliegues semiafilados, sin Three.js y sin mapas de hash después del
// primer nivel. Va en su propio archivo porque es matemática pura: se puede probar en Node
// sin navegador, y el modelador del carro no tiene por qué saber cómo se subdivide.
//
// Por qué Catmull-Clark y no curvas o perfiles: una jaula gruesa de unos cientos de vértices
// se escribe a mano y se deforma con las medidas de cada línea del catálogo; la superficie
// que sale es lisa en las dos direcciones, que es justo lo que le falta al carro de juguete.
// Los pliegues (DeRose, Kass y Truong, 1998) son lo que permite tener lata lisa al lado de
// una línea de carácter nítida sin gastar triángulos en bucles de apoyo.
//
// La malla es de estructuras paralelas (arreglos tipados), no de objetos: el carro se
// construye en el celular del dueño del taller, cada vez que abre un carro, y con objetos por
// vértice se iba el presupuesto de 150 ms en recolector de basura.

// Arma el nivel 0. `caras` son listas de índices en sentido antihorario visto desde afuera;
// `pliegues` son tripletas [a, b, filo].
export function crearMalla(posiciones, caras, etiquetas, pliegues = [], esquinas = []) {
  const nV = posiciones.length / 3;
  const nF = caras.length;
  let total = 0;
  for (const c of caras) total += c.length;
  const fOff = new Int32Array(nF + 1);
  const fV = new Int32Array(total);
  const fE = new Int32Array(total);
  const mapa = new Map();
  const eV = [];
  const eF = [];
  let q = 0;
  for (let f = 0; f < nF; f++) {
    const c = caras[f];
    fOff[f] = q;
    for (let k = 0; k < c.length; k++) {
      const a = c[k];
      const b = c[(k + 1) % c.length];
      const clave = a < b ? a * nV + b : b * nV + a;
      let e = mapa.get(clave);
      if (e === undefined) {
        e = eV.length / 2;
        mapa.set(clave, e);
        eV.push(a, b);
        eF.push(f, -1);
      } else {
        // Una arista con tres caras no tiene subdivisión definida: que reviente aquí, en el
        // banco, y no como un agujero raro en el celular de un cliente.
        if (eF[2 * e + 1] !== -1) throw new Error(`Arista con más de dos caras: ${a}-${b}`);
        eF[2 * e + 1] = f;
      }
      fV[q] = a;
      fE[q] = e;
      q++;
    }
  }
  fOff[nF] = q;
  const nE = eV.length / 2;
  const eS = new Float32Array(nE);
  for (const [a, b, filo] of pliegues) {
    const e = mapa.get(a < b ? a * nV + b : b * nV + a);
    if (e !== undefined && filo > eS[e]) eS[e] = filo;
  }
  const vC = new Uint8Array(nV);
  for (const v of esquinas) vC[v] = 1;
  return {
    nV,
    nF,
    nE,
    P: Float64Array.from(posiciones),
    fOff,
    fV,
    fE,
    tag: Int32Array.from(etiquetas),
    eV: Int32Array.from(eV),
    eF: Int32Array.from(eF),
    eS,
    vC,
  };
}

// Un nivel de subdivisión. Numeración del hijo: primero los vértices viejos, luego un punto
// por arista y luego un punto por cara; una cara hija por cada esquina de la madre. Con esa
// numeración las aristas hijas salen directas, sin buscar nada.
export function subdividir(m) {
  const { nV, nF, nE, P, fOff, fV, fE, tag, eV, eF, eS, vC } = m;
  const baseE = nV;
  const baseF = nV + nE;
  const nV2 = nV + nE + nF;
  const P2 = new Float64Array(3 * nV2);

  // Puntos de cara.
  for (let f = 0; f < nF; f++) {
    let x = 0;
    let y = 0;
    let z = 0;
    const a = fOff[f];
    const b = fOff[f + 1];
    for (let q = a; q < b; q++) {
      const v = 3 * fV[q];
      x += P[v];
      y += P[v + 1];
      z += P[v + 2];
    }
    const n = b - a;
    const i = 3 * (baseF + f);
    P2[i] = x / n;
    P2[i + 1] = y / n;
    P2[i + 2] = z / n;
  }

  // Acumuladores por vértice para la regla de vértice.
  const val = new Int32Array(nV);
  const nCar = new Int32Array(nV);
  const nPli = new Int32Array(nV);
  const sumaR = new Float64Array(3 * nV);
  const sumaQ = new Float64Array(3 * nV);
  const sumaP = new Float64Array(3 * nV);
  const sumaS = new Float32Array(nV);

  // Puntos de arista.
  for (let e = 0; e < nE; e++) {
    const a = eV[2 * e];
    const b = eV[2 * e + 1];
    const f0 = eF[2 * e];
    const f1 = eF[2 * e + 1];
    const s = eS[e];
    const borde = f1 < 0;
    const ia = 3 * a;
    const ib = 3 * b;
    const ax = P[ia];
    const ay = P[ia + 1];
    const az = P[ia + 2];
    const bx = P[ib];
    const by = P[ib + 1];
    const bz = P[ib + 2];
    const i = 3 * (baseE + e);
    if (borde || s >= 1) {
      P2[i] = (ax + bx) / 2;
      P2[i + 1] = (ay + by) / 2;
      P2[i + 2] = (az + bz) / 2;
    } else {
      const c0 = 3 * (baseF + f0);
      const c1 = 3 * (baseF + f1);
      let x = (ax + bx + P2[c0] + P2[c1]) / 4;
      let y = (ay + by + P2[c0 + 1] + P2[c1 + 1]) / 4;
      let z = (az + bz + P2[c0 + 2] + P2[c1 + 2]) / 4;
      if (s > 0) {
        x += ((ax + bx) / 2 - x) * s;
        y += ((ay + by) / 2 - y) * s;
        z += ((az + bz) / 2 - z) * s;
      }
      P2[i] = x;
      P2[i + 1] = y;
      P2[i + 2] = z;
    }
    val[a]++;
    val[b]++;
    sumaR[ia] += bx;
    sumaR[ia + 1] += by;
    sumaR[ia + 2] += bz;
    sumaR[ib] += ax;
    sumaR[ib + 1] += ay;
    sumaR[ib + 2] += az;
    if (borde || s > 0) {
      const peso = borde ? 1 : Math.min(1, s);
      nPli[a]++;
      nPli[b]++;
      sumaS[a] += peso;
      sumaS[b] += peso;
      sumaP[ia] += bx;
      sumaP[ia + 1] += by;
      sumaP[ia + 2] += bz;
      sumaP[ib] += ax;
      sumaP[ib + 1] += ay;
      sumaP[ib + 2] += az;
    }
  }
  for (let f = 0; f < nF; f++) {
    const c = 3 * (baseF + f);
    for (let q = fOff[f]; q < fOff[f + 1]; q++) {
      const v = fV[q];
      nCar[v]++;
      sumaQ[3 * v] += P2[c];
      sumaQ[3 * v + 1] += P2[c + 1];
      sumaQ[3 * v + 2] += P2[c + 2];
    }
  }

  // Puntos de vértice.
  for (let v = 0; v < nV; v++) {
    const i = 3 * v;
    const px = P[i];
    const py = P[i + 1];
    const pz = P[i + 2];
    const n = val[v];
    const nq = Math.max(1, nCar[v]);
    // Regla suave: (Q + 2R + (n-3)V) / n, con Q el promedio de puntos de cara y R el de los
    // puntos medios de arista.
    const rx = (sumaR[i] / n + px) / 2;
    const ry = (sumaR[i + 1] / n + py) / 2;
    const rz = (sumaR[i + 2] / n + pz) / 2;
    let x = (sumaQ[i] / nq + 2 * rx + (n - 3) * px) / n;
    let y = (sumaQ[i + 1] / nq + 2 * ry + (n - 3) * py) / n;
    let z = (sumaQ[i + 2] / nq + 2 * rz + (n - 3) * pz) / n;
    const c = nPli[v];
    if (vC[v] || c > 2) {
      // Esquina: tres o más pliegues se cruzan aquí, y el vértice no se mueve.
      const peso = vC[v] ? 1 : Math.min(1, sumaS[v] / c);
      x += (px - x) * peso;
      y += (py - y) * peso;
      z += (pz - z) * peso;
    } else if (c === 2) {
      const peso = Math.min(1, sumaS[v] / 2);
      x += ((6 * px + sumaP[i]) / 8 - x) * peso;
      y += ((6 * py + sumaP[i + 1]) / 8 - y) * peso;
      z += ((6 * pz + sumaP[i + 2]) / 8 - z) * peso;
    }
    P2[i] = x;
    P2[i + 1] = y;
    P2[i + 2] = z;
  }

  // La topología del hijo.
  const nEsq = fV.length;
  const nE2 = 2 * nE + nEsq;
  const fV2 = new Int32Array(4 * nEsq);
  const fE2 = new Int32Array(4 * nEsq);
  const fOff2 = new Int32Array(nEsq + 1);
  const tag2 = new Int32Array(nEsq);
  const eV2 = new Int32Array(2 * nE2);
  const eF2 = new Int32Array(2 * nE2).fill(-1);
  const eS2 = new Float32Array(nE2);
  for (let e = 0; e < nE; e++) {
    const a = eV[2 * e];
    const b = eV[2 * e + 1];
    const medio = baseE + e;
    eV2[4 * e] = a;
    eV2[4 * e + 1] = medio;
    eV2[4 * e + 2] = medio;
    eV2[4 * e + 3] = b;
    const s = Math.max(0, eS[e] - 1);
    eS2[2 * e] = s;
    eS2[2 * e + 1] = s;
  }
  for (let f = 0; f < nF; f++) {
    const a = fOff[f];
    const b = fOff[f + 1];
    for (let q = a; q < b; q++) {
      const prev = q === a ? b - 1 : q - 1;
      const v = fV[q];
      const e = fE[q];
      const ep = fE[prev];
      const h = q; // la cara hija lleva el número de la esquina
      fOff2[h] = 4 * h;
      tag2[h] = tag[f];
      const k = 4 * h;
      fV2[k] = v;
      fV2[k + 1] = baseE + e;
      fV2[k + 2] = baseF + f;
      fV2[k + 3] = baseE + ep;
      const interior = 2 * nE + q;
      const interiorPrev = 2 * nE + prev;
      eV2[2 * interior] = baseE + e;
      eV2[2 * interior + 1] = baseF + f;
      fE2[k] = eV[2 * e] === v ? 2 * e : 2 * e + 1;
      fE2[k + 1] = interior;
      fE2[k + 2] = interiorPrev;
      fE2[k + 3] = eV[2 * ep] === v ? 2 * ep : 2 * ep + 1;
    }
  }
  fOff2[nEsq] = 4 * nEsq;
  for (let h = 0; h < nEsq; h++) {
    for (let c = 0; c < 4; c++) {
      const e = fE2[4 * h + c];
      if (eF2[2 * e] < 0) eF2[2 * e] = h;
      else eF2[2 * e + 1] = h;
    }
  }
  const vC2 = new Uint8Array(nV2);
  vC2.set(vC);
  return { nV: nV2, nF: nEsq, nE: nE2, P: P2, fOff: fOff2, fV: fV2, fE: fE2, tag: tag2, eV: eV2, eF: eF2, eS: eS2, vC: vC2 };
}

// Las normales se calculan por "sector": las esquinas de cara alrededor de un vértice se
// agrupan si la arista que las separa no es dura. Se calculan sobre la superficie ENTERA,
// antes de partirla en piezas: así dos piezas vecinas comparten la normal en la junta y el
// reflejo pasa de la puerta al guardafango sin escalón, como en un carro bien alineado.
// Solo se puede sobre un nivel de puros cuadriláteros (nivel 1 en adelante).
export function normalesPorSector(m) {
  const { nF, nE, P, fV, eV, eF, eS } = m;
  const nEsq = 4 * nF;
  const padre = new Int32Array(nEsq);
  for (let i = 0; i < nEsq; i++) padre[i] = i;
  const raiz = (i) => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]];
      i = padre[i];
    }
    return i;
  };
  const esquinaEn = (f, v) => {
    const k = 4 * f;
    if (fV[k] === v) return k;
    if (fV[k + 1] === v) return k + 1;
    if (fV[k + 2] === v) return k + 2;
    return k + 3;
  };
  for (let e = 0; e < nE; e++) {
    const f1 = eF[2 * e + 1];
    if (f1 < 0 || eS[e] > 0) continue;
    const f0 = eF[2 * e];
    const a = eV[2 * e];
    const b = eV[2 * e + 1];
    let r0 = raiz(esquinaEn(f0, a));
    let r1 = raiz(esquinaEn(f1, a));
    if (r0 !== r1) padre[r1] = r0;
    r0 = raiz(esquinaEn(f0, b));
    r1 = raiz(esquinaEn(f1, b));
    if (r0 !== r1) padre[r1] = r0;
  }
  // Normal de cara: el producto cruz de las diagonales ya pesa por el área del cuadrilátero.
  const nCara = new Float32Array(3 * nF);
  const acum = new Float32Array(3 * nEsq);
  for (let f = 0; f < nF; f++) {
    const k = 4 * f;
    const a = 3 * fV[k];
    const b = 3 * fV[k + 1];
    const c = 3 * fV[k + 2];
    const d = 3 * fV[k + 3];
    const ux = P[c] - P[a];
    const uy = P[c + 1] - P[a + 1];
    const uz = P[c + 2] - P[a + 2];
    const vx = P[d] - P[b];
    const vy = P[d + 1] - P[b + 1];
    const vz = P[d + 2] - P[b + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const i = 3 * f;
    nCara[i] = nx;
    nCara[i + 1] = ny;
    nCara[i + 2] = nz;
    for (let q = k; q < k + 4; q++) {
      const r = 3 * raiz(q);
      acum[r] += nx;
      acum[r + 1] += ny;
      acum[r + 2] += nz;
    }
  }
  const grupo = new Int32Array(nEsq);
  for (let q = 0; q < nEsq; q++) grupo[q] = raiz(q);
  for (let q = 0; q < nEsq; q++) {
    if (grupo[q] !== q) continue;
    const r = 3 * q;
    const l = Math.hypot(acum[r], acum[r + 1], acum[r + 2]) || 1;
    acum[r] /= l;
    acum[r + 1] /= l;
    acum[r + 2] /= l;
  }
  for (let f = 0; f < nF; f++) {
    const i = 3 * f;
    const l = Math.hypot(nCara[i], nCara[i + 1], nCara[i + 2]) || 1;
    nCara[i] /= l;
    nCara[i + 1] /= l;
    nCara[i + 2] /= l;
  }
  return { grupo, normal: acum, nCara };
}

// El reflejo de una laca es un examen de la superficie: una línea recta reflejada muestra cualquier
// onda de la normal, aumentada. Y las normales de una jaula a mano tienen ondas: alrededor de un
// vértice raro, en la curva de un arco. Sobre el arco de la SUV eso salía como un anillo brillante,
// que se lee como un golpe. La lata no hace falta tocarla, porque la silueta no las delata: lo que se
// alisa es el campo de normales, promediando cada una con las de sus vecinas. Los pliegues se
// respetan, porque a cada lado de un pliegue va un grupo aparte. `cuales(f)` dice qué caras entran.
function alisar(m, grupo, normal, cuales, vueltas, peso) {
  const { nF } = m;
  const pares = [];
  const usados = new Uint8Array(4 * nF);
  const cuenta = new Int32Array(4 * nF);
  for (let f = 0; f < nF; f++) {
    if (!cuales(f)) continue;
    for (let c = 0; c < 4; c++) {
      const a = grupo[4 * f + c];
      const b = grupo[4 * f + ((c + 1) & 3)];
      usados[a] = 1;
      usados[b] = 1;
      if (a !== b) {
        pares.push(a, b);
        cuenta[a]++;
        cuenta[b]++;
      }
    }
  }
  const lista = Int32Array.from(pares);
  const raices = [];
  for (let g = 0; g < usados.length; g++) if (usados[g]) raices.push(g);
  const suma = new Float32Array(3 * 4 * nF);
  for (let v = 0; v < vueltas; v++) {
    suma.fill(0);
    for (let i = 0; i < lista.length; i += 2) {
      const a = 3 * lista[i];
      const b = 3 * lista[i + 1];
      suma[a] += normal[b];
      suma[a + 1] += normal[b + 1];
      suma[a + 2] += normal[b + 2];
      suma[b] += normal[a];
      suma[b + 1] += normal[a + 1];
      suma[b + 2] += normal[a + 2];
    }
    for (let k = 0; k < raices.length; k++) {
      const g = raices[k];
      const c = cuenta[g];
      if (!c) continue;
      const r = 3 * g;
      const x = normal[r] + peso * (suma[r] / c - normal[r]);
      const y = normal[r + 1] + peso * (suma[r + 1] / c - normal[r + 1]);
      const z = normal[r + 2] + peso * (suma[r + 2] / c - normal[r + 2]);
      const l = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
      normal[r] = x * l;
      normal[r + 1] = y * l;
      normal[r + 2] = z * l;
    }
  }
}

// En dos niveles, porque en el fino sale caro: 48 vueltas sobre el nivel 2 costaban 30-60 ms en este
// PC, y un celular va seis veces más lento. Promediar es difundir, y la difusión avanza con el
// cuadrado del paso: una vuelta en el nivel 1 alisa como cuatro en el 2 y cuesta la cuarta parte.
// `gruesa` y `fina` son las vueltas en cada nivel. N2 queda con las normales nuevas; N1 no se toca,
// porque de ahí salen las piezas de adentro.
export function alisarNormales(m1, N1, m2, N2, cualesTag, gruesa = 12, fina = 3, peso = 0.6) {
  const n1 = Float32Array.from(N1.normal);
  const g1 = N1.grupo;
  alisar(m1, g1, n1, (f) => cualesTag(m1.tag[f]), gruesa, peso);
  // Del nivel 1 al 2: cada cara hija lleva el número de la esquina de su madre, con el vértice viejo,
  // el punto de la arista siguiente, el de la cara y el de la arista anterior, en ese orden.
  const { grupo: g2, normal: n2 } = N2;
  const vistas = new Uint8Array(4 * m2.nF);
  for (let f = 0; f < m1.nF; f++) {
    if (!cualesTag(m1.tag[f])) continue;
    for (let c = 0; c < 4; c++) {
      const k = 4 * (4 * f + c);
      for (let i = 0; i < 4; i++) {
        const g = 3 * g2[k + i];
        if (!vistas[g2[k + i]]) {
          vistas[g2[k + i]] = 1;
          n2[g] = n2[g + 1] = n2[g + 2] = 0;
        }
      }
      const a = 3 * g1[4 * f + c];
      const b = 3 * g1[4 * f + ((c + 1) & 3)];
      const d = 3 * g1[4 * f + ((c + 3) & 3)];
      const e = 3 * g1[4 * f + ((c + 2) & 3)];
      for (let j = 0; j < 3; j++) {
        n2[3 * g2[k] + j] += n1[a + j];
        n2[3 * g2[k + 1] + j] += 0.5 * (n1[a + j] + n1[b + j]);
        n2[3 * g2[k + 2] + j] += 0.25 * (n1[a + j] + n1[b + j] + n1[d + j] + n1[e + j]);
        n2[3 * g2[k + 3] + j] += 0.5 * (n1[a + j] + n1[d + j]);
      }
    }
  }
  for (let g = 0; g < vistas.length; g++) {
    if (!vistas[g]) continue;
    const r = 3 * g;
    const l = 1 / (Math.sqrt(n2[r] * n2[r] + n2[r + 1] * n2[r + 1] + n2[r + 2] * n2[r + 2]) || 1);
    n2[r] *= l;
    n2[r + 1] *= l;
    n2[r + 2] *= l;
  }
  if (fina) alisar(m2, g2, n2, (f) => cualesTag(m2.tag[f]), fina, peso);
}
