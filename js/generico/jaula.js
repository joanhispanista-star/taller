// La jaula de control del carro: una malla gruesa, escrita a mano, relativa a los puntos de
// referencia de `disposicion` (ejes, cintura, techo, puertas...). Con eso cualquier medida del
// catálogo deforma la jaula sin romperla, y Catmull-Clark se encarga de que quede lisa.
//
// La topología es la de un cubo con esquinas redondeadas, como arranca un modelador de carros:
//
//   - la REJILLA DE ARRIBA va de la nariz a la cola (filas) y del centro al hombro (columnas
//     j0..j7). Capó, parabrisas, techo, vidrio trasero y baúl son filas de la misma rejilla;
//     los pilares y las ventanas laterales son columnas: las líneas que en el capó son el
//     corte con el guardafango suben por el parabrisas como pilar A y siguen por el techo.
//   - la REJILLA DEL LADO va con las mismas filas, del hombro al estribo (k0..k7). Las
//     celdas de los pases de rueda se quitan, y los nudos alrededor se colocan en polares.
//   - la del FRENTE y la de la COLA cierran el cubo: comparten columnas con la de arriba y
//     renglones con la del lado. Donde se juntan las tres queda un vértice de valencia 3: ahí
//     cae el faro, que por eso se envuelve de la nariz al costado sin ninguna costura rara.
//
// Solo se escribe la mitad (x >= 0, lado derecho) y se refleja: la fila central se comparte
// para que el capó y el techo sigan lisos al cruzar el centro.

const lerp = (a, b, t) => a + (b - a) * t;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const RAD = Math.PI / 180;

// Interpolación por tramos con tangentes de Catmull-Rom: las líneas maestras del carro (hombro,
// capó) son curvas suaves dadas por unos pocos puntos, y no se salen de los extremos.
function curva(puntos) {
  const n = puntos.length;
  return (z) => {
    if (z <= puntos[0][0]) return puntos[0][1];
    if (z >= puntos[n - 1][0]) return puntos[n - 1][1];
    let i = 0;
    while (i < n - 2 && z > puntos[i + 1][0]) i++;
    const [z0, y0] = puntos[i];
    const [z1, y1] = puntos[i + 1];
    const h = z1 - z0 || 1e-6;
    const t = (z - z0) / h;
    const m0 = i > 0 ? ((y1 - puntos[i - 1][1]) / (z1 - puntos[i - 1][0])) * h : y1 - y0;
    const m1 = i < n - 2 ? ((puntos[i + 2][1] - y0) / (puntos[i + 2][0] - z0)) * h : y1 - y0;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  };
}

// Los retoques a la disposición típica. `disposicion()` nació para un carro de cajas, y con ella
// la cabina cae 15 cm demasiado atrás: capó de deportivo y baúl de 40 cm, que de perfil se lee
// como un cupé de los noventa. Lo que venga MEDIDO en `ajustes` no se toca: manda el escaneo.
// (Para integrar esto habría que llevar estos números a disposicion() de js/carro.js.)
//
// Una pick-up de cabina adelantada (Super Carry, DFSK, las van de carga) no tiene capó: la puerta
// queda encima de la rueda de adelante, y con la proporción de una Hilux salía un capó larguísimo y
// una cabina de juguete. El catálogo todavía no dice cuáles son: mientras no traiga esa marca
// (ajustes.cabinaAdelantada), se deduce de las medidas.
export function esCabinaAdelantada(d) {
  if (d.tipo === 'camioneta') return d.largo < 4.3;
  // Una van de carga: alta para su largo, y con los ejes casi en las puntas. Lo segundo es lo que la
  // separa de un campero corto (un Jimny, un Wrangler), que es igual de alto pero sí tiene capó.
  if (d.tipo === 'suv') return d.alto / d.largo > 0.44 && (d.entreEjes / d.largo > 0.63 || d.largo < 3.4) && d.alto > 1.75 && d.largo < 4.5;
  return false;
}

export function retocar(d0, ajustes = {}) {
  const d = { ...d0 };
  const wb = d.ejeTras - d.ejeDel;
  const vidrio = d.alto - d.cintura;
  const fijar = (k, v) => {
    if (ajustes[k] == null) d[k] = v;
  };
  d.adelantada = ajustes.cabinaAdelantada ?? esCabinaAdelantada(d);
  if (d.adelantada) {
    d.piso = ajustes.piso ?? 0.33;
    fijar('capoTras', d.ejeDel - 0.26);
    fijar('puertaDel', d.ejeDel);
    fijar('parabrisasAlto', d.capoTras + 0.3);
    if (d.tipo === 'camioneta') {
      const zCab = d.ejeDel + Math.min(1.12, 0.62 * wb);
      d.cabinaTras = zCab;
      d.techoTras = zCab - 0.02;
      d.platonDel = zCab + 0.06;
      fijar('puertaTras', zCab - 0.12);
      // Una sola puerta de verdad: lo de atrás es el costado de la cabina, y por contrato sigue
      // siendo la pieza "puerta trasera".
      fijar('puertaMedia', d.puertaDel + (d.puertaTras - d.puertaDel) * 0.74);
      // Y el platón llega casi hasta atrás, con un bómper angosto: el escalón de 22 cm de una Hilux, en
      // un carro de 3,3 m, se veía de lado como un cajón pegado detrás.
      d.compuertaZ = d.cola - 0.075;
      d.finCostado = d.compuertaZ - 0.1;
    } else {
      fijar('puertaMedia', d.puertaDel + (d.puertaTras - d.puertaDel) * 0.52);
      d.compuertaArriba = d.cintura + 0.11;
    }
    return d;
  }
  if (d.tipo === 'camioneta') {
    // La pared de la cabina y el platón no pueden caer dentro del pase de rueda: en las
    // camionetas grandes del catálogo el anillo se comía la esquina de la cabina.
    const tope = d.ejeTras - proporciones(d, ajustes).ro - 0.065;
    if (d.cabinaTras > tope) {
      d.cabinaTras = tope;
      d.techoTras = tope - 0.02;
      d.platonDel = tope + 0.06;
      fijar('puertaTras', tope - 0.12);
    }
  }
  // El hatchback lleva la cabina adelante y el capó corto: es lo que lo separa de un sedán sin
  // baúl.
  fijar('capoTras', d.ejeDel + { sedan: 0.215, hatchback: 0.195, suv: 0.25, camioneta: 0.245 }[d.tipo] * wb);
  // Detrás del arco, siempre: en un carro de 2,7 m la base del parabrisas cae encima de la rueda, y una
  // puerta que arrancara ahí cruzaría las filas del arco.
  fijar('puertaDel', Math.max(d.capoTras - 0.02, d.ejeDel + proporciones(d, ajustes).ro + 0.035));
  fijar('puertaMedia', d.puertaDel + (d.puertaTras - d.puertaDel) * 0.535);
  // El parabrisas corre según lo alto que es el vidrio, pero en un carro de 2,7 m (un Fortwo)
  // eso lo manda detrás del pilar B: se topa.
  const carrera = { sedan: 1.46, hatchback: 1.42, suv: 1.14, camioneta: 1.08 }[d.tipo] * (d.tipo === 'suv' ? vidrio - 0.06 : vidrio);
  fijar('parabrisasAlto', d.capoTras + Math.min(carrera, 0.86 * (d.puertaMedia - d.capoTras)));
  if (d.tipo === 'sedan') {
    fijar('techoTras', d.ejeTras - 0.145 * wb);
    d.vidrioTras = Math.max(d.ejeTras + 0.1, d.techoTras + 0.5);
    d.vidrioTras = Math.min(d.vidrioTras, d.cola - 0.42);
    d.baulDel = d.vidrioTras + 0.01;
  } else if (d.tipo === 'hatchback') {
    d.compuertaArriba = d.cintura + 0.13;
  } else if (d.tipo === 'suv') {
    d.compuertaArriba = d.cintura + 0.11;
  }
  return d;
}

// Las proporciones que no trae `disposicion` y que son las que separan un carro de un juguete:
// la lata baja hasta donde baja en un carro de verdad (la `piso` de disposición es 10 cm más
// alta, porque el carro viejo no sabía esconder la rueda) y el pase de rueda deja 5 cm de aire.
export function proporciones(d, ajustes = {}) {
  const tipo = d.tipo;
  const W = d.medio;
  const B = d.cintura;
  const H = tipo === 'suv' ? d.alto - 0.06 : d.alto;
  // Una pick-up baja (Saveiro, Strada, Oroch) sale de un carro: la lata va más cerca del piso y la llanta es de
  // carro. Con los 41 cm de una Hilux, a la compuerta de una Saveiro de 1,52 m le quedaban 13 cm, y las puertas
  // eran una tira: en 27 de las 77 camionetas del catálogo no le cabían ni la placa y la manija juntas.
  const baja = tipo === 'camioneta' && !d.adelantada ? cl((d.alto - 1.52) / 0.26) : 1;
  const piso = ajustes.piso ?? (d.adelantada ? 0.33 : tipo === 'camioneta' ? lerp(0.27, 0.41, baja) : { sedan: 0.185, hatchback: 0.185, suv: 0.265 }[tipo]);
  const tipico = { sedan: 4.5, hatchback: 4.16, suv: 4.34, camioneta: 5.33 }[tipo];
  // Un carro de 3,6 m no lleva el mismo rin que uno de 4,2 m. Sin esto el "carro chico" del
  // catálogo salía con ruedas de camioneta.
  // Un camioncito de 3,3 a 3,9 m lleva rin de 12 o 13: con la regla de los demás salía con radio de 32 cm
  // en un carro de 1,82 de alto, y una rueda así de grande es la mitad del juguete.
  const escalaRueda = d.adelantada ? cl(lerp(0.78, d.largo / tipico, 0.5), 0.72, 1) : cl(lerp(1, d.largo / tipico, 0.55), 0.84, 1.08);
  const R = d.radioRueda * escalaRueda * lerp(0.87, 1, baja);
  const aire = d.adelantada ? 0.05 : { sedan: 0.048, hatchback: 0.048, suv: 0.06, camioneta: 0.075 }[tipo];
  const ra = R + aire;
  const anilloArco = d.adelantada ? 0.04 : { sedan: 0.042, hatchback: 0.042, suv: 0.056, camioneta: 0.056 }[tipo];
  const anchoLlanta = (d.adelantada ? 0.175 : { sedan: 0.205, hatchback: 0.185, suv: 0.225, camioneta: 0.265 }[tipo]) * cl(d.ancho / 1.8, 0.85, 1.1);
  // En la cabina adelantada la cara llega casi hasta el parabrisas: el capó es apenas una repisa.
  const fH = d.adelantada ? 0.97 : { sedan: 0.75, hatchback: 0.8, suv: 0.85, camioneta: 0.9 }[tipo];
  return {
    tipo,
    W,
    B,
    H,
    P: piso,
    E: piso + (tipo === 'suv' ? 0.13 : tipo === 'camioneta' ? 0.12 : 0.1),
    R,
    ra,
    ro: ra + anilloArco,
    anchoLlanta,
    // En la cabina adelantada la rueda va metida: la lata cae casi derecha, y con el ras de los demás la
    // llanta se salía 4 cm de la esquina, justo donde el frente se ve de tres cuartos.
    ruedaX: W - anchoLlanta / 2 - (d.adelantada ? 0.042 : 0.012),
    yCapoDel: piso + (B - piso) * fH,
    yCapoTras: B + (tipo === 'sedan' ? 0.025 : 0.005),
    voladizoDel: d.ejeDel - d.punta,
    voladizoTras: d.cola - d.ejeTras,
  };
}

// Dónde van las columnas de la cola de la pick-up, como fracción del ancho: la compuerta hasta 0,845 y
// de ahí la lámpara, unos 14 cm de cara y 8 de vuelta por el costado, como en las de verdad.
const FRAC_COMPUERTA = [0, 0.274, 0.548, 0.74, 0.8, 0.845, 0.955];

// La etiqueta de una celda: material, pieza del catálogo y grupo (qué bisagra la lleva). El "$"
// se vuelve 'der' o 'izq' al reflejar.
const pint = (id, grupo = 'cuerpo') => `pintura|${id}|${grupo}`;
const mat = (m, grupo = 'cuerpo') => `${m}||${grupo}`;

export function armarJaula(d, g) {
  const { W, B, H, P, E, R, ra, ro, yCapoDel, yCapoTras } = g;
  const tipo = g.tipo;
  const camioneta = tipo === 'camioneta';
  const sedan = tipo === 'sedan';
  const suv = tipo === 'suv';
  const cerrado = tipo === 'hatchback' || suv;
  const adelantada = Boolean(d.adelantada);
  // Una camioneta de trabajo de cabina adelantada no lleva pasarruedas de plástico: es lata pintada.
  const conMoldura = (suv || camioneta) && !adelantada; // pasarruedas de plástico
  // Y es un cajón: el costado cae casi derecho y la nariz apenas se recoge. Con el perfil de un carro,
  // la esquina de adelante quedaba 8 cm por dentro de la llanta.
  const plano = adelantada ? 0.35 : 1;
  const eW = W / 0.92;
  const volD = g.voladizoDel;
  const volT = g.voladizoTras;

  // ---- Líneas maestras ----
  // Qué tan redonda es la nariz en planta: la de un sedán se va en flecha, la de una camioneta
  // es casi un muro.
  const fNariz = { sedan: 0.32, hatchback: 0.3, suv: 0.3, camioneta: 0.27 }[tipo];
  const zEsqDel = Math.min(d.punta + volD * fNariz, d.ejeDel - ro - 0.03);
  const zEsqTras = camioneta ? Math.max(d.cola - volT * 0.1, d.ejeTras + ro + 0.04) : Math.min(d.cola - 0.05, Math.max(d.cola - volT * 0.22, d.ejeTras + ro + 0.03));
  const zPm = d.puertaMedia;
  // Una junta medida en un escaneo puede caer encima del arco: se topa, para que las filas de la
  // jaula sigan en orden y la lata no se doble sobre sí misma.
  const zPt = camioneta ? Math.min(d.puertaTras, d.cabinaTras - 0.06) : Math.min(d.puertaTras, d.ejeTras - ro * 0.5 - 0.03);
  const finHombro = camioneta ? B : B + (sedan ? 0.04 : 0.05);
  const yHombro = curva([
    [zEsqDel, yCapoDel - 0.05],
    [d.ejeDel, lerp(yCapoDel, yCapoTras, 0.6) - 0.045],
    [d.capoTras, B - 0.012],
    [zPm, B],
    [zPt, B + 0.012],
    [Math.max(zPt + 0.3, d.ejeTras + 0.15), lerp(B, finHombro, 0.8)],
    [d.cola, finHombro],
  ]);
  // Ancho máximo en planta: el carro se angosta hacia las puntas y se recoge entre las ruedas.
  const anchoPlanta = (z) => {
    const inicioD = d.ejeDel + 0.1;
    const inicioT = d.ejeTras - 0.1;
    let k = 1;
    if (z < inicioD) k = 1 - (suv || camioneta ? 0.05 : 0.062) * plano * Math.pow(cl((inicioD - z) / (inicioD - zEsqDel), 0, 1.3), 2.3);
    if (z > inicioT) k = 1 - (camioneta ? 0.015 : 0.05) * Math.pow(cl((z - inicioT) / (zEsqTras - inicioT), 0, 1.3), 2.3);
    const talle = 0.008 * Math.sin(Math.PI * cl((z - d.ejeDel) / (d.ejeTras - d.ejeDel)));
    return W * k - talle * eW;
  };
  // El perfil del lado, visto de frente: lo que la lata se aparta del ancho máximo según la
  // altura. Es lo que hace que el costado no sea un plano: la parte de arriba mira al cielo y la
  // de abajo al piso, y entre las dos corre el filo que parte el reflejo en una franja clara y
  // otra oscura. Es lo primero que dice "lata" en una foto de un carro.
  const PERFIL = [
    [0, -0.086],
    [0.1, -0.066],
    [0.22, -0.04],
    [0.36, -0.02],
    [0.52, -0.008],
    [0.74, 0],
    [0.93, -0.024],
    [1, -0.052],
  ];
  const offPerfil = (u) => {
    u = cl(u);
    for (let i = 0; i < PERFIL.length - 1; i++) {
      const [a, va] = PERFIL[i];
      const [b, vb] = PERFIL[i + 1];
      if (u <= b) return lerp(va, vb, (u - a) / (b - a));
    }
    return 0;
  };
  // El abombado alrededor de cada rueda: es lo que le da hombros al carro visto de frente.
  const fuerzaAbomb = { sedan: 0.014, hatchback: 0.014, suv: 0.014, camioneta: 0.012 }[tipo];
  const abomb = (z, y) => {
    const r = Math.min(Math.hypot(z - d.ejeDel, y - R), Math.hypot(z - d.ejeTras, y - R));
    return fuerzaAbomb * eW * Math.exp(-Math.pow(Math.max(0, r - ra) / 0.17, 2));
  };
  const xLado = (z, y) => anchoPlanta(z) + (offPerfil((y - P) / (yHombro(z) - P)) * eW + abomb(z, y)) * plano;
  const zCentro = (d.ejeDel + d.ejeTras) / 2;

  // ---- Un renglón del lado en la zona de las puertas ----
  // k1 es el hombro; k2 el filo que parte el reflejo, y va subiendo hacia atrás, como en todos
  // los carros de hoy: ese "subir" es la mitad de la sensación de movimiento.
  const alturasLado = (z) => {
    const ys = yHombro(z);
    const h = ys - P;
    return [ys - 0.05, P + 0.74 * h + 0.022 * (z - zCentro), P + 0.56 * h + 0.012 * (z - zCentro), P + 0.36 * h + 0.03 * (z - zCentro), E, P];
  };
  const ladoRecto = (z) => {
    const salida = alturasLado(z).map((y) => [xLado(z, y), y, z]);
    salida.push([xLado(z, P) - 0.11, P - 0.008, z]);
    return salida;
  };

  // ---- Arcos ----
  const dxBorde = conMoldura ? 0.02 : 0.003; // el borde del pase sale tantito: pestaña
  const dxFuera = conMoldura ? 0.012 : 0.001;
  const angPiso = Math.asin(cl((P - R) / ra, -0.9, 0.9)) / RAD;
  // De aquí para abajo el faldón es negro: a la altura del de la cara, para que la línea corra
  // pareja de la nariz al arco. Más alto, se ve como un guardabarros pegado.
  const angFaldon = (r) => Math.asin(cl((P + (conMoldura ? 0.14 : 0.075) - R) / r, -0.9, 0.9)) / RAD;
  const polar = (eje, r, grados) => [eje - r * Math.cos(grados * RAD), R + r * Math.sin(grados * RAD)];
  const puntoLado = (z, y, dx = 0) => [xLado(z, y) + dx, y, z];
  const RIM = [45, 67.5, 90, 112.5, 135];
  const FUERA = [60, 75, 90, 105, 120];
  // La fila m del arco, de adelante hacia atrás: la 0 y la 4 llevan además los nudos que bajan
  // por el pase hasta el estribo.
  const filaArco = (eje, m) => {
    const fuera = polar(eje, ro, FUERA[m]);
    const borde = polar(eje, ra, RIM[m]);
    const z = fuera[0];
    const ys = yHombro(z);
    const y1 = ys - 0.05;
    const y3 = Math.min(fuera[1], y1 - 0.025);
    const y2 = lerp(y1, y3, 0.5);
    const salida = [puntoLado(z, y1), puntoLado(z, y2), puntoLado(z, y3, dxFuera), puntoLado(borde[0], borde[1], dxBorde)];
    if (m === 0 || m === 4) {
      const a5 = angFaldon(ra);
      const p5 = polar(eje, ra, m === 0 ? a5 : 180 - a5);
      const p6 = polar(eje, ra, m === 0 ? angPiso : 180 - angPiso);
      salida.push(puntoLado(p5[0], p5[1], dxBorde), puntoLado(p6[0], p6[1], dxBorde), [xLado(p6[0], P) - 0.11, P - 0.008, p6[0]]);
    } else {
      salida.push(null, null, null);
    }
    return salida;
  };
  // La fila de afuera del anillo (lado = -1 delante del arco, +1 detrás). La junta del bómper o
  // de la puerta trasera va por ella: por eso la puerta trasera le da la vuelta al pase, como en
  // un carro de verdad, y no se monta encima de la llanta.
  const filaAnillo = (eje, lado, zArriba, seguirArriba = false) => {
    const ang = (a) => (lado < 0 ? a : 180 - a);
    const esquina = polar(eje, ro * 1.08, ang(45));
    const k4 = polar(eje, ro, ang(30));
    const a5 = angFaldon(ro);
    const k5 = polar(eje, ro, ang(a5));
    const zP = eje + lado * Math.sqrt(Math.max(0.01, ro * ro - (P - R) * (P - R)));
    const zTope = zArriba ?? esquina[0] + lado * 0.02;
    // En la puerta trasera del sedán la junta baja recta; delante del arco delantero la esquina
    // se queda pegada al arco, aunque arriba la línea se adelante hasta el faro.
    const zEsquina = !seguirArriba ? esquina[0] : lado < 0 ? Math.min(esquina[0], zTope) : Math.max(esquina[0], zTope);
    const ys = yHombro(zTope);
    const y1 = ys - 0.05;
    const y3 = Math.min(esquina[1], y1 - 0.05);
    const y2 = lerp(y1, y3, 0.5);
    return [puntoLado(zTope, y1), puntoLado(lerp(zTope, zEsquina, 0.6), y2), puntoLado(zEsquina, y3, dxFuera), puntoLado(k4[0], k4[1], dxFuera), puntoLado(k5[0], k5[1], dxFuera), puntoLado(zP, P, dxFuera), [xLado(zP, P) - 0.11, P - 0.008, zP]];
  };

  // ---- Una sección de arriba ----
  // c = [y, z] del centro; las columnas 3 a 7 explícitas; las 1 y 2 caen en parábola entre el
  // centro y la 3: eso le da la comba al capó, al techo y a los vidrios.
  const sec = (c, j3, j4, j5, j6, j7, ajuste2 = 0) => {
    const p = (f, dy = 0) => [j3[0] * f, c[0] + (j3[1] - c[0]) * f * f + dy, c[1] + (j3[2] - c[1]) * f * f];
    return [[0, c[0], c[1]], p(0.37), p(0.74, ajuste2), j3, j4, j5, j6, j7];
  };

  // Capó: s = 0 en su borde delantero, 1 en su borde trasero. Lleva dos nervios: el capó plano
  // que cae parejo es otra de las cosas que delatan.
  const xCapo0 = W * 0.555;
  const xCapo1 = W * 0.8;
  const zC0 = Math.min(d.punta + volD * { sedan: 0.15, hatchback: 0.14, suv: 0.12, camioneta: 0.085 }[tipo], zEsqDel - 0.03);
  const zC1 = d.capoTras - 0.235;
  const yCapo = (s) => lerp(yCapoDel, yCapoTras, 1 - Math.pow(1 - s, 1.75));
  const secCapo = (s, zs) => {
    const yc = yCapo(s);
    const zc = lerp(zC0, zC1, s);
    const x3 = lerp(xCapo0, xCapo1, Math.pow(s, 0.8));
    const y3 = yc - lerp(0.026, 0.024, s);
    const z3 = zc + lerp(0.06, 0.16, s);
    const y7 = yHombro(zs);
    const x7 = xLado(zs, y7);
    const j4 = [lerp(x3, x7, 0.28), lerp(y3, y7, 0.02) + 0.003, lerp(z3, zs, 0.5)];
    const j5 = [lerp(x3, x7, 0.6), lerp(y3, y7, 0.22), lerp(z3, zs, 0.85)];
    const j6 = [lerp(x3, x7, 0.86), lerp(y3, y7, 0.66), zs];
    return sec([yc, zc], [x3, y3, z3], j4, j5, j6, [x7, y7, zs], 0.006);
  };

  // ---- Las filas ----
  const filas = [];
  const fila = (n, t, s) => {
    filas.push({ n, t, s });
    return filas.length - 1;
  };
  const I = {};

  // Fila 0: el canto delantero del capó, encima de la parrilla y de los faros. Los nudos del
  // lado de esta fila son la esquina de la nariz.
  const altoCara = yCapoDel - P;
  const xEsqD = anchoPlanta(zEsqDel) - 0.01 * eW;
  // El hatchback lleva el faro más largo y la parrilla más angosta: con la de los demás, era un
  // antifaz negro de lado a lado.
  const frac0 = adelantada ? [0, 0.2, 0.36, 0.56, 0.68, 0.82, 0.93, 1] : tipo === 'hatchback' ? [0, 0.22, 0.38, 0.48, 0.64, 0.8, 0.93, 1] : [0, 0.26, 0.46, 0.58, 0.7, 0.82, 0.93, 1];
  const yEsqD = yCapoDel - 0.05;
  {
    const t = frac0.map((f, j) => {
      const y = lerp(yCapoDel, yEsqD, Math.pow(f, 2.4));
      const z = zC0 + (zEsqDel - zC0) * Math.pow(f, 2.6);
      return j === 0 ? [0, y, z] : [xEsqD * f, y, z];
    });
    const fy = suv ? [0.7, 0.57, 0.43, 0.2, 0.085, 0] : camioneta ? [0.69, 0.54, 0.41, 0.21, 0.085, 0] : sedan ? [0.74, 0.6, 0.45, 0.26, 0.125, 0] : [0.72, 0.61, 0.46, 0.25, 0.125, 0];
    const dxE = [0.0, 0.0, 0.002, 0.012, 0.032, 0.066].map((v) => v * plano);
    const dzE = [-0.01, -0.015, -0.01, 0.01, 0.03, 0.065];
    // En un carro de voladizo muy corto (un Fortwo) la esquina se quedaba detrás del arco.
    const topeZ = d.ejeDel - ro - 0.012;
    const s = fy.map((f, k) => [xEsqD - dxE[k] * eW, P + altoCara * f, Math.min(zEsqDel + dzE[k], topeZ)]);
    s.push([xEsqD - 0.17 * eW, P - 0.008, Math.min(zEsqDel + 0.12, topeZ)]);
    I.r0 = fila('r0', t, s);
  }
  // pdel: fin del capó y junta delantera de la puerta. cowl: base del parabrisas.
  // En la cabina adelantada la puerta arranca encima de la rueda, y su borde baja hasta el pase.
  const zPd = adelantada ? d.ejeDel : d.puertaDel;
  const xPb0 = W * 0.805;
  const yCowlC = B + (sedan ? 0.055 : 0.03);
  const yCowlE = B + (sedan ? 0.04 : 0.016);
  const bowPb0 = 0.17;
  const zCw = d.capoTras;
  const secFinCapo = (zs) => {
    const y7 = yHombro(zs);
    const x7 = xLado(zs, y7);
    const y3 = yCapoTras - 0.024;
    const z3 = zC1 + 0.16;
    return sec([yCapoTras, zC1], [xCapo1, y3, z3], [lerp(xCapo1, x7, 0.3), y3 + 0.004, z3 + 0.03], [lerp(xCapo1, x7, 0.6), lerp(y3, y7, 0.22), zs - 0.005], [x7 - 0.032 * eW, y7 + 0.012, zs], [x7, y7, zs], 0.006);
  };
  // El parabrisas: t = 0 en la base, 1 en el tope. La columna 3 es el borde del vidrio, la 4 el
  // filo de afuera del pilar A y la 5 la orilla de arriba de la ventana lateral.
  const anchoB = 0.048; // medio pilar B
  const zHd = Math.min(d.parabrisasAlto, zPm - 0.1);
  const zsCw = Math.max(d.capoTras + 0.05, zPd + 0.05);
  const zsHd = Math.min(Math.max(zsCw + 0.2, zHd + 0.075), zPm - anchoB - 0.05);
  const xTe = W * (sedan ? 0.7 : 0.735); // borde del techo
  const caidaRiel = 0.055; // lo que el borde del techo cae respecto de la cumbre
  const yTe = H - caidaRiel;
  const secPb = (t, zsFijo = null) => {
    const zs = zsFijo ?? lerp(zsCw, zsHd, t);
    const y7 = yHombro(zs);
    const x7 = xLado(zs, y7);
    // Una leve panza en el vidrio: un parabrisas plano es lo primero que se ve falso.
    const panza = 0.018 * Math.sin(Math.PI * t);
    const yc = lerp(yCowlC, H - 0.028, t) + panza;
    const zc = lerp(zCw - bowPb0, zHd - 0.08, t);
    const x3 = lerp(xPb0, xTe, t);
    const y3 = lerp(yCowlE, yTe - 0.002, t) + panza * 0.7;
    const z3 = lerp(zCw, zHd, t);
    const j4 = [x3 + lerp(0.052, 0.068, t) * eW, y3 - lerp(0.018, 0.032, t), z3 + 0.012];
    const j5 = [x3 + lerp(0.08, 0.098, t) * eW, lerp(B + 0.022, H - 0.122, t), zsFijo ?? lerp(zsCw - 0.005, zsHd, t)];
    const j6 = [x7 - 0.03 * eW, y7 + 0.014, zs];
    return { t: sec([yc, zc], [x3, y3, z3], j4, j5, j6, [x7, y7, zs]), s: ladoRecto(zs) };
  };

  // ---- Del tope del parabrisas para atrás, según la carrocería ----
  const zTe1 = d.techoTras;
  const yTecho = (q) => {
    // La cumbre del techo va un poco delante de la mitad, y atrás cae más que adelante.
    const a = 0.36;
    return q < a ? H - 0.022 * Math.pow((a - q) / a, 2) : H - (sedan ? 0.045 : 0.03) * Math.pow((q - a) / (1 - a), 2);
  };
  const xVentana = W * (sedan ? 0.805 : 0.83);
  const yVentana = (q) => yTecho(q) - 0.122;
  const anilloSup = (x3, y3, z3, zs) => [x3 + 0.068 * eW, y3 - 0.032, lerp(z3, zs, 0.6)];
  const secTecho = (q, zs, op = {}) => {
    const y7 = yHombro(zs);
    const x7 = xLado(zs, y7);
    const yc = yTecho(q);
    const zc = lerp(zHd - 0.08, zTe1 + 0.03, q);
    const z3 = lerp(zHd, zTe1 - 0.015, q);
    const x3 = xTe + 0.012 * eW * Math.sin(Math.PI * q);
    const y3 = yc - caidaRiel;
    const j6 = [x7 - 0.03 * eW, y7 + 0.014, zs];
    const j5 = [op.x5 ?? xVentana + 0.012 * eW * Math.sin(Math.PI * q), op.y5 ?? yVentana(q), zs];
    return sec([yc, zc], [x3, y3, z3], anilloSup(x3, y3, z3, zs), j5, j6, [x7, y7, zs]);
  };
  const filasPuerta = [
    ['pmA', zPm - anchoB],
    ['pm', zPm],
    ['pmB', zPm + anchoB],
    ['td1', lerp(zPm + anchoB, zPt - 0.05, 0.36)],
    ['td2', lerp(zPm + anchoB, zPt - 0.05, 0.72)],
    ['ptA', zPt - 0.05],
    ['pt', zPt],
  ];
  // En la cabina adelantada, las filas que en un carro normal son capó y parabrisas ya son techo:
  // el parabrisas se come las filas del arco, y lo que sigue hasta el pilar B es puerta.
  const extraTecho = adelantada ? 6 : 0;
  const totalTecho = filasPuerta.length + extraTecho + (sedan ? 1 : camioneta ? 0 : 5);

  // r1: detrás del faro arriba, anillo del arco delantero abajo.
  const zFaroCola = Math.max(zEsqDel + 0.12, d.ejeDel - ro * 0.98);
  if (!adelantada) {
    I.r1 = fila('r1', secCapo(0.1, zFaroCola + 0.02), filaAnillo(d.ejeDel, -1, zFaroCola));
    // El arco delantero.
    const nHood = 8.9;
    for (let m = 0; m < 5; m++) {
      const lado = filaArco(d.ejeDel, m);
      I['a' + m] = fila('a' + m, secCapo((m + 2) / nHood, lado[0][2]), lado);
    }
    {
      const lado = filaAnillo(d.ejeDel, 1);
      I.b1 = fila('b1', secCapo(7 / nHood, lado[0][2]), lado);
      const zF1 = Math.max((lado[3][2] + d.puertaDel) / 2, lado[5][2] + 0.012);
      I.f1 = fila('f1', secCapo(8 / nHood, zF1), ladoRecto(zF1));
    }
    I.pdel = fila('pdel', secFinCapo(zPd), ladoRecto(zPd));
    for (const [n, t] of [
      ['cowl', 0],
      ['pb1', 0.34],
      ['pb2', 0.68],
      ['head', 1],
    ]) {
      const q = secPb(t);
      I[n] = fila(n, q.t, q.s);
    }
  } else {
    // El capó es un muñón: se acaba sobre la rueda, y encima del arco ya va el parabrisas.
    I.r1 = fila('r1', secCapo(0.45, zFaroCola + 0.02), filaAnillo(d.ejeDel, -1, zFaroCola));
    const ladoA = [0, 1, 2, 3, 4].map((m) => filaArco(d.ejeDel, m));
    I.a0 = I.pdel = fila('a0', secFinCapo(ladoA[0][0][2]), ladoA[0]);
    I.a1 = I.cowl = fila('a1', secPb(0, ladoA[1][0][2]).t, ladoA[1]);
    I.a2 = I.pb1 = fila('a2', secPb(0.34, ladoA[2][0][2]).t, ladoA[2]);
    I.a3 = I.pb2 = fila('a3', secPb(0.68, ladoA[3][0][2]).t, ladoA[3]);
    I.a4 = I.head = fila('a4', secPb(1, ladoA[4][0][2]).t, ladoA[4]);
    const ladoB = filaAnillo(d.ejeDel, 1);
    const qDe = (e) => (e + 1) / totalTecho;
    I.b1 = fila('b1', secTecho(qDe(0), ladoB[0][2]), ladoB);
    const zF1 = Math.max(ladoB[3][2] + 0.03, ladoB[5][2] + 0.012);
    I.f1 = fila('f1', secTecho(qDe(1), zF1), ladoRecto(zF1));
    for (let e = 2; e < extraTecho; e++) {
      const z = lerp(zF1, zPm - anchoB, (e - 1) / (extraTecho - 1));
      fila('x' + e, secTecho(qDe(e), z), ladoRecto(z));
    }
  }
  // En hatchback y SUV la puerta trasera termina encima del arco: abajo, la junta le da la vuelta
  // por delante. Las filas de esa puerta tienen que bajar igual, recogiéndose hacia adelante; si
  // no, se cruzan con la junta y la lata se dobla sobre sí misma justo sobre el estribo.
  const ladoPt = camioneta ? null : filaAnillo(d.ejeTras, -1, zPt, true);
  const margenes = { td1: 0.2, td2: 0.12, ptA: 0.055 };
  filasPuerta.forEach(([n, zs], idx) => {
    const q = (idx + 1 + extraTecho) / totalTecho;
    let lado;
    if (n === 'pt' && !camioneta) {
      lado = ladoPt;
    } else {
      lado = ladoRecto(zs);
      if (ladoPt && margenes[n]) {
        lado = lado.map((p, k) => {
          const tope = ladoPt[k][2] - margenes[n];
          if (p[2] <= tope) return p;
          return k === 6 ? [xLado(tope, P) - 0.11, p[1], tope] : [xLado(tope, p[1]), p[1], tope];
        });
      }
    }
    I[n] = fila(n, secTecho(q, zs), lado);
  });

  let finTecho;
  let baseVidrio;
  let puntaFila;
  let zBisagraBaul = d.cola;
  let yBisagraBaul = P;
  let zBtCola = d.cola;
  let zFinCola = d.cola;

  if (!camioneta) {
    // ---- Sedán, hatchback y SUV ----
    const zVb = sedan ? d.vidrioTras : d.compuertaZ;
    const yVb = sedan ? B + 0.085 : d.compuertaArriba;
    const xB0 = W * (sedan ? 0.755 : 0.77);
    // Con un voladizo muy largo (una van de 5 m), una fracción del voladizo cae delante de la base del
    // vidrio, y las filas se cruzarían.
    const zCantoC = Math.max(d.cola - volT * (sedan ? 0.15 : 0.19), zVb + 0.07);
    const yCantoC = sedan ? yVb + 0.018 : B + 0.035;
    // Etapa v: 0 = fin del techo, 1 = base del vidrio trasero, 2 = canto de atrás.
    const etapa = (v) => {
      if (v <= 1) {
        const yc = lerp(yTecho(1), yVb + 0.012, v) + 0.018 * Math.sin(Math.PI * v);
        const zc = lerp(zTe1 + 0.03, zVb + 0.05, v);
        const x3 = lerp(xTe, xB0, v);
        const y3 = lerp(yTecho(1) - caidaRiel, yVb - 0.012, v) + 0.012 * Math.sin(Math.PI * v);
        const z3 = lerp(zTe1 - 0.015, zVb - (sedan ? 0.075 : 0.03), v);
        return { yc, zc, x3, y3, z3 };
      }
      const w = v - 1;
      const yc = lerp(yVb + 0.012, yCantoC, w);
      const zc = lerp(zVb + 0.05, zCantoC, w);
      const x3 = lerp(xB0, W * 0.745, w);
      const y3 = yc - lerp(0.024, 0.02, w);
      const z3 = zc - lerp(sedan ? 0.125 : 0.08, 0.05, w);
      return { yc, zc, x3, y3, z3 };
    };
    const arcos = [];
    for (let m = 0; m < 5; m++) arcos.push(filaArco(d.ejeTras, m));
    const finAnillo = filaAnillo(d.ejeTras, 1);
    // La esquina de la cola, renglón por renglón: faro, bómper y faldón.
    const yT = yHombro(zEsqTras);
    const xT = xLado(zEsqTras, yT - 0.1) - 0.006 * eW;
    // Lo que le da a cada carrocería su cola: el hatchback lleva el stop bajo y ancho, la SUV alto.
    const bajaK2 = sedan ? 0.15 : suv ? 0.26 : 0.165;
    // El filo del bómper va más abajo de lo natural: parte la cola en dos franjas, una que mira
    // al cielo y otra al piso. Sin él, la cola es una tabla roja.
    const y2T = yT - bajaK2;
    const y4T = P + (suv ? 0.26 : 0.195);
    const yK = [yT - 0.075, y2T, lerp(y2T, y4T, 0.42), y4T, P + 0.105, P + 0.04];
    const dxK = [0.0, 0.0, 0.0, 0.006, 0.018, 0.05];
    const dzK = [-0.01, -0.005, 0, 0, -0.012, -0.035];
    // En un voladizo muy corto la esquina no alcanza a salir del arco: se corre lo justo.
    const ladoTail = yK.map((y, k) => [xT - dxK[k] * eW, y, Math.max(zEsqTras + dzK[k], finAnillo[k][2] + 0.012)]);
    ladoTail.push([xT - 0.15 * eW, P + 0.028, Math.max(zEsqTras - 0.06, finAnillo[6][2] + 0.012)]);
    const ladoBt = finAnillo.map((p, k) => {
      const q = ladoTail[k];
      const z = lerp(p[2], q[2], 0.5);
      const y = lerp(p[1], q[1], k === 0 ? 0.5 : 0.62);
      return k === 6 ? [lerp(p[0], q[0], 0.5), y, z] : [lerp(p[0], q[0], 0.3) + 0.004, y, z];
    });
    const lados = [...arcos, finAnillo, ladoBt, ladoTail];
    const nombres = ['c0', 'c1', 'c2', 'c3', 'c4', 'e1', 'bt', 'tail'];
    const plan = sedan ? [0, 0.34, 0.68, 1, 1.25, 1.52, 1.76, 2] : [null, null, null, null, 0, 0.5, 1, 2];
    // Índice de la fila donde muere la ventana lateral, y desde cuál empieza a caer su orilla.
    const punta = sedan ? 2 : suv ? 4 : 3;
    const caeDesde = sedan ? -1 : suv ? 1 : 0;
    nombres.forEach((n, idx) => {
      const lado = lados[idx];
      const zs = lado[0][2];
      const y7 = idx === 7 ? yT : yHombro(zs);
      const x7 = idx === 7 ? xT : xLado(zs, y7);
      const j6 = [x7 - 0.03 * eW, y7 + 0.014, zs];
      // La orilla de arriba de la ventana: baja hasta la punta, y de ahí se reparte.
      const qFila = plan[idx] === null ? (filasPuerta.length + extraTecho + 1 + idx) / totalTecho : 1;
      const avance = cl((idx - caeDesde) / (punta - caeDesde));
      const j5Ventana = [lerp(xVentana + 0.01 * eW, j6[0] - 0.012 * eW, Math.pow(avance, 1.8)), lerp(yVentana(qFila), j6[1] + 0.012, Math.pow(avance, 1.5)), zs];
      let t;
      if (plan[idx] === null) {
        t = secTecho(qFila, zs, { x5: j5Ventana[0], y5: j5Ventana[1] });
      } else {
        const e = etapa(plan[idx]);
        const j3 = [e.x3, e.y3, e.z3];
        const reparto = cl((idx - punta) / 2);
        const j4 = [lerp(lerp(e.x3, j5Ventana[0], 0.45), lerp(e.x3, x7, 0.34), reparto), lerp(lerp(e.y3, j5Ventana[1], 0.4), lerp(e.y3, y7, 0.2), reparto), lerp(e.z3, zs, 0.7)];
        const j5 = [lerp(j5Ventana[0], lerp(e.x3, x7, 0.66), reparto), lerp(j5Ventana[1], lerp(e.y3, y7, 0.55), reparto), zs];
        const j6b = [lerp(j6[0], lerp(e.x3, x7, 0.88), reparto), lerp(j6[1], lerp(e.y3, y7, 0.84), reparto), zs];
        t = sec([e.yc, e.zc], j3, j4, j5, j6b, [x7, y7, zs]);
      }
      I[n] = fila(n, t, lado);
    });
    finTecho = sedan ? I.c0 : I.c4;
    baseVidrio = sedan ? I.c3 : I.bt;
    puntaFila = sedan ? I.c2 : suv ? I.c4 : I.c3;
    zBisagraBaul = sedan ? filas[I.c3].t[3][2] : d.techoTras;
  } else {
    // ---- La camioneta: la cabina termina en cabinaTras, y detrás va el platón abierto ----
    // Encima de la llanta: si no, la llanta se asoma por el piso del platón.
    const yPisoCarga = Math.max(P + 0.34, B - 0.46, Math.min(B - 0.28, 2 * R + 0.025));
    const zCab = d.cabinaTras;
    const zPla = Math.max(zCab + 0.03, Math.min(d.platonDel, zCab + 0.035));
    const zComp = d.compuertaZ;
    const xBarIn = W * 0.84;
    const xFondo = W * 0.8;
    {
      const y7 = yHombro(zCab);
      const x7 = xLado(zCab, y7);
      const yV = B + 0.03;
      const j6 = [x7 - 0.03 * eW, y7 + 0.014, zCab];
      I.cabA = fila('cabA', sec([yV, zCab + 0.03], [W * 0.73, yV - 0.005, zCab + 0.012], [W * 0.8, yV - 0.005, zCab + 0.005], [W * 0.87, y7 + 0.02, zCab], j6, [x7, y7, zCab]), ladoRecto(zCab));
    }
    // La baranda del platón: el piso (j0..j2), la pared de adentro (j3..j4) y la tapa (j4..j7).
    const baranda = (zs, yCarga, zIn, y7 = yHombro(zs)) => {
      const x7 = xLado(zs, y7);
      const j3 = [xFondo, yCarga, zIn];
      const j4 = [xBarIn - 0.006, y7 - 0.035, zs];
      const j5 = [xBarIn + 0.006, y7 + 0.006, zs];
      const j6 = [lerp(xBarIn, x7, 0.8), y7 + 0.012, zs];
      return sec([yCarga + 0.004, zIn], j3, j4, j5, j6, [x7, y7, zs]);
    };
    I.plat = fila('plat', baranda(zPla, yPisoCarga, zCab + 0.05), ladoRecto(zPla));
    const antes = filaAnillo(d.ejeTras, -1);
    const zAnt = antes[0][2];
    if (zAnt > zPla + 0.1) {
      const zM = (zPla + zAnt) / 2;
      const lado = ladoRecto(zM).map((p, k) => {
        const tope = (zPla + antes[k][2]) / 2;
        if (p[2] <= tope) return p;
        return k === 6 ? [xLado(tope, P) - 0.11, p[1], tope] : [xLado(tope, p[1]), p[1], tope];
      });
      I.pl1 = fila('pl1', baranda(zM, yPisoCarga, (zCab + 0.05 + zAnt) / 2), lado);
    }
    I.ca = fila('ca', baranda(zAnt, yPisoCarga, zAnt), antes);
    for (let m = 0; m < 5; m++) {
      const lado = filaArco(d.ejeTras, m);
      I['c' + m] = fila('c' + m, baranda(lado[0][2], yPisoCarga, lado[0][2]), lado);
    }
    const finAnillo = filaAnillo(d.ejeTras, 1);
    const zE1 = finAnillo[0][2];
    I.e1 = fila('e1', baranda(zE1, yPisoCarga, zE1), finAnillo);
    const ladoCola = (z, ancho = 0) => {
      const y7 = yHombro(z);
      const yK = [y7 - 0.05, lerp(y7, P + 0.3, 0.5), P + 0.3, P + 0.24, P + 0.12, P + 0.03];
      const dxK = [0, 0, 0, 0.004, 0.012, 0.03];
      const s = yK.map((y, k) => [xLado(z, Math.max(y, P + 0.25)) - dxK[k] * eW - ancho, y, z]);
      s.push([xLado(z, P + 0.25) - 0.13 * eW, P + 0.018, z - 0.03]);
      return s;
    };
    const zFinPiso = zComp - 0.075;
    const zBt = Math.max(zE1 + 0.05, Math.min(d.finCostado, zFinPiso - 0.012));
    zBtCola = zBt;
    I.bt = fila('bt', baranda(zBt, yPisoCarga, zFinPiso), ladoCola(zBt));
    // Cara de adentro de la compuerta y su canto de arriba.
    const zTgi = zBt + 0.03;
    const y7i = yHombro(zTgi);
    I.tgi = fila('tgi', baranda(zTgi, y7i - 0.012, zFinPiso + 0.008, y7i), ladoCola(zTgi));
    // La cola es un cajón: compuerta y lámparas a ras, y todas las columnas derechas de arriba abajo.
    // Con la esquina 8,5 cm detrás de la compuerta (zEsqTras) y las columnas de arriba corridas contra
    // las de abajo, la línea entre compuerta y lámpara salía en diagonal, y la esquina se leía como lata
    // pellizcada: justo lo que un latonero mira primero.
    const zFin = Math.max(zComp + 0.02, zTgi + 0.03);
    zFinCola = zFin;
    const y7f = yHombro(zFin);
    const x7f = xLado(zFin, y7f) - 0.008;
    const xCol = (c) => FRAC_COMPUERTA[c] * x7f;
    I.tail = fila(
      'tail',
      sec([y7f - 0.004, zComp + 0.004], [xCol(3), y7f - 0.004, zComp + 0.004], [xCol(4), y7f - 0.004, zComp + 0.004], [xCol(5), y7f - 0.002, zFin], [xCol(6), y7f - 0.002, zFin], [x7f, y7f - 0.006, zFin]),
      ladoCola(zFin, 0.006),
    );
    finTecho = I.pt;
    baseVidrio = I.cabA;
    puntaFila = I.cabA;
    yBisagraBaul = P + 0.3;
  }

  const NI = filas.length - 1;
  const ult = filas[NI];

  // La junta del bómper baja derecha del faro al pase de rueda (o de la calavera, atrás). Con los
  // nudos donde los ponen los anillos, hacía una escalera: subía por encima de la rueda y volvía
  // a bajar, como una bandera negra pintada sobre el guardafango.
  if (!conMoldura) {
    const sobreLaRecta = (a, b, t) => {
      const z = lerp(a[2], b[2], t);
      const y = lerp(a[1], b[1], t);
      return [xLado(z, y), y, z];
    };
    const faro = filas[I.r1].s[0];
    const bordeD = filas[I.a0].s[3];
    filas[I.r1].s[1] = sobreLaRecta(faro, bordeD, 0.36);
    filas[I.r1].s[2] = sobreLaRecta(faro, bordeD, 0.7);
    filas[I.a0].s[2] = sobreLaRecta(faro, bordeD, 0.87);
    const cola = filas[I.e1].s[1];
    const bordeT = filas[I.c4].s[3];
    filas[I.e1].s[2] = sobreLaRecta(cola, bordeT, 0.5);
    filas[I.c4].s[2] = sobreLaRecta(cola, bordeT, 0.76);
  }

  // ---- Rejilla del frente ----
  // Las columnas y las alturas de cada renglón. Lo más adelantado es k2, el filo del bómper.
  // La cara de la cabina adelantada es casi un plano: con la inclinación de la nariz de un carro, le corrían
  // arcos de luz alrededor de la parrilla.
  // Y la cara de los demás, casi derecha de la parrilla para abajo: la laca enciende su franja donde la lata se
  // inclina 9° o más hacia arriba, y con 5 cm de recogida salía en Frente un bigote de luz alrededor de la parrilla.
  const zArribaCara = { sedan: 0.03, hatchback: 0.024, suv: 0.02, camioneta: 0.02 }[tipo];
  const zNariz = adelantada ? [null, 0.022, 0.006, 0.012, 0.02, 0.034, 0.08, 0.21] : [null, zArribaCara, 0.004, 0.012, 0.032, 0.056, 0.1, 0.21];
  const escalaNariz = Math.min(1, volD / 0.85);
  const COL = [
    null,
    adelantada ? [0, 0.2, 0.36, 0.56, 0.7, 0.83, 0.93] : tipo === 'hatchback' ? [0, 0.17, 0.33, 0.48, 0.65, 0.81, 0.93] : [0, 0.2, camioneta ? 0.46 : 0.4, 0.58, 0.71, 0.83, 0.93], // k1: abajo de la parrilla (se cierra) y del faro
    // En la cabina adelantada, con las columnas de k1: es el borde de la tapa, y corrido hacia afuera le salían puntas
    // debajo de los faros, un trapecio.
    adelantada ? [0, 0.2, 0.36, 0.56, 0.72, 0.84, 0.94] : [0, 0.24, 0.45, 0.6, 0.72, 0.84, 0.94], // k2
    [0, 0.27, 0.495, 0.565, 0.7, 0.815, 0.93], // k3: arriba de la toma
    [0, 0.3, 0.545, 0.605, 0.72, 0.8, 0.935], // k4: abajo de la toma
    [0, 0.28, 0.52, 0.62, 0.74, 0.85, 0.94],
    [0, 0.28, 0.52, 0.62, 0.74, 0.85, 0.94],
    [0, 0.28, 0.52, 0.62, 0.74, 0.85, 0.94],
  ];
  const CARA = {
    // Parrilla angosta y boca grande abajo, como un compacto. El faro, en gota: 13 cm de alto, que es lo
    // que mide el de un sedán común. La ranura de 7 cm de antes es de un carro de vitrina.
    sedan: [
      [0.8, 0.8, 0.79, 0.76, 0.72, 0.7, 0.69],
      [0.595, 0.595, 0.595, 0.605, 0.61, 0.61, 0.61],
      [0.49, 0.49, 0.485, 0.48, 0.49, 0.49, 0.465],
      [0.215, 0.215, 0.215, 0.21, 0.22, 0.255, 0.265],
    ],
    // El hatchback, de faro grande y parrilla mínima: la cara de un carro de ciudad. El faro se cierra hacia adentro,
    // en gota: con el pie parejo era un huevo.
    hatchback: [
      [0.85, 0.85, 0.85, 0.79, 0.7, 0.67, 0.68],
      [0.61, 0.61, 0.61, 0.615, 0.62, 0.62, 0.62],
      [0.5, 0.5, 0.495, 0.49, 0.5, 0.5, 0.475],
      [0.2, 0.2, 0.2, 0.195, 0.205, 0.245, 0.255],
    ],
    // La SUV y la camioneta llevan la cara alta: mucha parrilla y faros más grandes.
    suv: [
      [0.68, 0.68, 0.69, 0.7, 0.68, 0.67, 0.665],
      [0.565, 0.565, 0.565, 0.575, 0.58, 0.58, 0.58],
      [0.42, 0.42, 0.415, 0.41, 0.42, 0.42, 0.405],
      [0.175, 0.175, 0.175, 0.17, 0.18, 0.205, 0.215],
    ],
    camioneta: [
      [0.66, 0.66, 0.66, 0.69, 0.67, 0.66, 0.65],
      [0.53, 0.53, 0.53, 0.54, 0.545, 0.55, 0.55],
      [0.4, 0.4, 0.395, 0.39, 0.4, 0.4, 0.39],
      [0.165, 0.165, 0.165, 0.16, 0.17, 0.195, 0.21],
    ],
    // La cara plana de un camioncito: una ranura de parrilla entre dos faros bajos y cuadrados, separada
    // de ellos por lata. Con la parrilla de una Hilux, la cabina se leía como una Hilux de juguete.
    adelantada: [
      [0.84, 0.84, 0.84, 0.7, 0.69, 0.68, 0.67],
      [0.56, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56],
      [0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42],
      [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
    ],
  };
  const caraTipo = adelantada ? CARA.adelantada : CARA[tipo] || CARA.sedan;
  const altoFaldon = conMoldura ? 0.085 : 0.125;
  const ALTO_F = [null, ...caraTipo, Array(7).fill(altoFaldon), [0, 0, 0, 0, 0, 0, 0], [-0.015, -0.015, -0.015, -0.015, -0.015, -0.015, -0.015]];
  const F = [];
  for (let j = 0; j < 7; j++) {
    F.push([null]);
    for (let k = 1; k <= 7; k++) {
      const c = filas[0].s[k - 1];
      const f = COL[k][j];
      const zn = d.punta + zNariz[k] * escalaNariz;
      const z = zn + (c[2] - zn) * Math.pow(f, 2.6);
      const y = P + altoCara * ALTO_F[k][j];
      F[j].push(j === 0 ? [0, y, z] : [c[0] * f, y, z]);
    }
  }

  // ---- Rejilla de la cola ----
  const fracC = camioneta ? FRAC_COMPUERTA : suv ? [0, 0.3, 0.56, 0.71, 0.8, 0.88, 0.96] : [0, 0.28, 0.5, 0.62, 0.74, 0.85, 0.95];
  const C = [];
  const yK0 = ult.s[0][1];
  const yCola = [null, yK0 - 0.012, ult.s[1][1] - (sedan ? 0.1 : 0.03), ult.s[2][1] - (sedan ? 0.012 : 0.008), ult.s[3][1] - 0.005, P + 0.1, P + 0.035, P + 0.024];
  const zCola = [null, d.cola - volT * 0.095, d.cola - volT * 0.05, d.cola, d.cola - 0.022, d.cola - 0.045, d.cola - 0.09, d.cola - 0.2];
  // En la pick-up, la compuerta es una lámina con un quiebre a media altura (la mitad de arriba mira al
  // cielo y la de abajo al piso, y ahí se parte el reflejo), y lo de más abajo es el chasis, que queda
  // oculto detrás del bómper. El bómper es una pieza aparte (ver ponerBomperAcero).
  const zCompuerta = [null, d.compuertaZ + 0.008, d.compuertaZ + 0.017, d.compuertaZ + 0.007, d.compuertaZ, d.compuertaZ + 0.03, d.compuertaZ + 0.03, d.compuertaZ];
  for (let j = 0; j < 7; j++) {
    C.push([null]);
    for (let k = 1; k <= 7; k++) {
      const c = ult.s[k - 1];
      const f = fracC[j];
      if (camioneta) {
        // De la lámpara para afuera, a ras de la esquina; abajo de ella, también.
        const z = j >= 5 && k <= 4 ? zFinCola : zCompuerta[k];
        C[j].push(j === 0 ? [0, c[1], z] : [c[0] * f, c[1], z]);
        continue;
      }
      const z = zCola[k] + (c[2] - zCola[k]) * Math.pow(f, 2.8);
      const y = yCola[k] + (c[1] - yCola[k]) * Math.pow(f, 2.6);
      C[j].push(j === 0 ? [0, y, z] : [c[0] * f, y, z]);
    }
  }

  // ---- Numeración ----
  const pos = [];
  const usar = (p) => {
    pos.push(p[0], p[1], p[2]);
    return pos.length / 3 - 1;
  };
  const idT = filas.map((f) => f.t.map(usar));
  const idS = filas.map((f, i) => [idT[i][7], ...f.s.map((p) => (p ? usar(p) : -1))]);
  const idF = F.map((col, j) => col.map((p, k) => (k === 0 ? idT[0][j] : usar(p))));
  idF.push(idS[0]);
  const idC = C.map((col, j) => col.map((p, k) => (k === 0 ? idT[NI][j] : usar(p))));
  idC.push(idS[NI]);

  // ---- Etiquetas ----
  const iniPlaton = camioneta ? I.plat : -1;
  const iPuerta = adelantada ? I.a2 : I.pdel;
  // El borde del techo y el pilar A son otra chapa que el panel: entre los dos corre la canaleta
  // del techo, esa línea oscura que todo carro tiene y un juguete no.
  const riel = 'pintura|techo|cuerpo|riel';

  const tagArriba = (i, j) => {
    if (j < 3) {
      // En la cabina adelantada, lo de encima de la cara es la repisa bajo el parabrisas, de plástico: la tapa es solo la
      // cara. Con la repisa pegada a la tapa, abierta se doblaba como una aleta.
      if (i < I.pdel) return adelantada ? mat('plastico') : pint('capo', 'capo');
      if (i < I.cowl) return mat('plastico');
      if (i < I.head) return mat('vidrio');
      if (i < finTecho) return pint('techo');
      if (camioneta) {
        if (i < I.cabA) return mat('vidrio');
        if (i < I.bt) return pint('vano-baul');
        if (i < I.tgi) return pint('baul-int', 'baul');
        return pint('baul', 'baul');
      }
      if (i < baseVidrio) return mat('vidrio', cerrado ? 'baul' : 'cuerpo');
      return pint('baul', 'baul');
    }
    // Columnas de afuera. En la cabina adelantada el faro no se sube al capó, que ahí es una tapita casi
    // vertical: subido, le salía al faro una lengua hacia el centro de la cara.
    if (i < I.r1) return adelantada ? pint('guardafango-del-$') : mat('faro');
    if (i < iPuerta) return pint('guardafango-del-$');
    if (i < I.pm) {
      // La puerta delantera: triángulo del espejo, marco y ventana.
      if (j === 3) return riel;
      if (i < I.cowl) return j === 6 ? pint('puerta-del-$', 'puerta-del-$') : mat('negro', 'puerta-del-$');
      if (j === 4 || j === 6) return mat('negro', 'puerta-del-$');
      return i < I.pmA ? mat('vidrio', 'puerta-del-$') : mat('negro', 'puerta-del-$');
    }
    if (i < I.pt) {
      if (j === 3) return riel;
      if (j === 4 || j === 6) return mat('negro', 'puerta-tras-$');
      if (i < I.pmB || i >= I.ptA) return mat('negro', 'puerta-tras-$');
      return mat('vidrio', 'puerta-tras-$');
    }
    if (camioneta) {
      if (i < I.cabA) return j === 5 ? mat('negro') : pint('techo');
      // Entre la cabina y el platón: lo de la esquina es pared del platón. Toda hueco, salía una cuña negra
      // de la baranda al piso, a cada lado, que sobre el piso claro se leía como un colmillo.
      if (i < iniPlaton) return j === 3 ? pint('vano-baul') : mat('hueco');
      // La pared de adentro del platón va con su piso: la baranda es lo único pintado por dentro.
      if (j === 3 && i < I.tgi) return pint('vano-baul');
      // La tapa de la baranda sigue derecha hasta el final. Encima de la lámpara va lata: montada sobre
      // la baranda, la lámpara parecía una oreja.
      if (i >= I.tgi) return j >= 5 ? pint('costado-$') : pint('baul', 'baul');
      return pint('costado-$');
    }
    // La parte de atrás de los carros cerrados. La calavera no se sube a la tapa: arriba solo ocupa la
    // esquina. Montada sobre la tapa, de cola recta se veía como una oreja.
    if (i >= I.bt) return j >= (sedan ? 6 : 5) ? mat('calavera') : pint('costado-$');
    if (j === 5 && i < puntaFila) return mat('vidrio');
    return pint('costado-$');
  };

  const anillo = (i, k) => {
    if (k < 3) return false;
    if (k === 3) return (i >= I.r1 && i < I.b1) || (i >= (camioneta ? I.ca : I.pt) && i < I.e1);
    return (i >= I.r1 && i < I.a0) || (i >= I.a4 && i < I.b1) || (i >= (camioneta ? I.ca : I.pt) && i < I.c0) || (i >= I.c4 && i < I.e1);
  };
  const tagLado = (i, k) => {
    // k es la celda entre el renglón k y el k+1.
    if (conMoldura && anillo(i, k)) return mat('plastico');
    // En la cabina adelantada, el bómper le da la vuelta a la esquina hasta el arco, a su misma altura.
    if (adelantada && i < I.a0 && k === 4) return mat('parachoques');
    if (i < I.r1) return k === 0 ? mat('faro') : k >= 5 ? mat('plastico') : pint('bomper-del');
    if (i < I.a0) return k >= 5 ? mat('plastico') : k >= 3 ? pint('bomper-del') : pint('guardafango-del-$');
    if (i < iPuerta) return pint('guardafango-del-$');
    if (i < I.pm) return k >= 5 ? pint('estribo-$') : pint('puerta-del-$', 'puerta-del-$');
    if (i < I.pt) return k >= 5 ? pint('estribo-$') : pint('puerta-tras-$', 'puerta-tras-$');
    if (camioneta) {
      // La esquina de atrás de la cabina es una sola chapa con el techo: en una camioneta, la
      // cabina va soldada y el platón atornillado. Pintar el costado del platón no la toca.
      if (i < I.cabA) return k >= 5 ? mat('plastico') : pint('techo');
      if (i < iniPlaton) return mat('hueco');
      if (i >= I.bt) {
        // Lámpara arriba, lata debajo de ella hasta el bómper, y de ahí el chasis.
        if (k >= 4) return mat('plastico');
        return i >= I.tgi && (k === 1 || k === 2) ? mat('calavera') : pint('costado-$');
      }
      return pint('costado-$');
    }
    if (i < I.c4) return suv && k >= 5 ? mat('plastico') : pint('costado-$');
    if (i < I.e1) return k >= 5 ? mat('plastico') : k >= 3 ? pint('bomper-tras') : pint('costado-$');
    if (i < I.bt) return k >= 5 ? mat('plastico') : k >= 2 ? pint('bomper-tras') : pint('costado-$');
    if (k <= 1) return mat('calavera');
    return k >= 5 ? mat('plastico') : pint('bomper-tras');
  };

  // Una sola boca ancha abajo en el sedán y la camioneta; en el hatchback y la SUV, una boca al centro
  // y las exploradoras en su propio nicho a los lados.
  const bocaAncha = (sedan || camioneta) && !adelantada;
  const tagFrente = (j, k) => {
    if (adelantada) {
      // El capó de un camioncito es la tapa de la cara, entre los faros, con la parrilla: se levanta y deja ver los
      // niveles. Como tira encima del parabrisas era una tapita que al abrir parecía una visera, y toda la cara,
      // del parabrisas al piso, era "bómper": un plano rojo enorme, sin una sola junta.
      if (k === 0) return j < 2 ? mat('parrilla', 'capo') : j === 2 ? pint('capo', 'capo') : mat('faro');
      if (k === 1 && j < 3) return pint('capo', 'capo');
      // El bómper de un camioncito es una lámina gris plana de lado a lado, y debajo solo el chasis. La boca en
      // trapecio de un carro, encima de un rollo negro de 30 cm, le ponía a la cabina una cara de juguete.
      if (k === 4) return mat('parachoques');
      if (k >= 5) return mat('plastico');
      return pint('bomper-del');
    }
    // La de ciudad lleva la parrilla chica, con lata entre ella y los faros. Es lo que más la separa de un
    // sedán, y lo que le quita el antifaz de lado a lado. Abajo, la boca y dos ranuras a los lados, sin exploradoras:
    // sin las ranuras, el bómper era un plano rojo de lado a lado, sin un solo dibujo.
    if (k === 0) return j < (tipo === 'hatchback' ? 2 : 3) ? mat('parrilla') : j < 3 ? pint('bomper-del') : mat('faro');
    if (k === 3) {
      if (bocaAncha ? j < 5 : tipo === 'hatchback' ? j < 3 || j === 4 : j < 2 || j === 3 || j === 4) return mat('toma');
    }
    if (k === 4 && conMoldura) return j < 3 ? mat('plata') : mat('plastico');
    if (k >= 5) return mat('plastico');
    if (k === 4 && j < 4) return mat('plastico');
    return pint('bomper-del');
  };

  const tagCola = (j, k) => {
    if (camioneta) {
      if (k === 0) return j >= 5 ? pint('costado-$') : pint('baul', 'baul');
      if (k <= 2) return j >= 5 ? mat('calavera') : pint('baul', 'baul');
      if (k === 3) return j >= 5 ? pint('costado-$') : mat('hueco');
      return mat('plastico');
    }
    if (k <= 1) return j >= 3 ? mat('calavera') : pint('baul', 'baul');
    if (k >= 5) return mat('plastico');
    // El faldón negro va al centro, y las esquinas del bómper siguen pintadas.
    if (k === 4) return conMoldura && j < 3 ? mat('plata') : j < 5 ? mat('plastico') : pint('bomper-tras');
    return pint('bomper-tras');
  };

  // ---- Caras de la mitad ----
  const caras = [];
  const etiquetas = [];
  const sinForro = [];
  const cara = (vs, t, forrar = true) => {
    caras.push(vs);
    etiquetas.push(t);
    sinForro.push(!forrar);
  };
  // Alrededor de los arcos no va forro: la jaula ahí da vueltas cerradas, y corrida hacia adentro
  // se sale por la lata como una raya oscura encima de la rueda.
  const iniArcoT = camioneta ? I.ca : I.pt;
  // Y en la camioneta, del platón para atrás tampoco: la compuerta mide 7 cm, y su forro corrido
  // 10 cm hacia adentro se sale por el otro lado como una franja negra.
  const cercaDeArco = (i, k) => (camioneta && i >= I.plat) || (k >= 2 && ((i >= I.r1 && i < I.b1) || (i >= iniArcoT && i < I.e1)));
  for (let i = 0; i < NI; i++) {
    // Ni en el pilar de atrás de los de compuerta: es angosto y muy curvo, y corrido 10 cm hacia adentro el forro se
    // salía por la lata. En un Spark era una mancha negra en el pilar; en un carro de 2,7 m, una raya a lo largo de
    // él. Ahí tapa la pared de plástico de atrás de las puertas (detalle.js).
    // Ni en la repisa de la cabina adelantada: corrido hacia abajo caía en el hueco de la tapa, como un rayón negro.
    for (let j = 0; j < 7; j++) cara([idT[i][j], idT[i + 1][j], idT[i + 1][j + 1], idT[i][j + 1]], tagArriba(i, j), !(camioneta && i >= I.plat) && !(cerrado && i >= I.pt && j >= 3) && !(adelantada && i < I.cowl && j < 3));
    for (let k = 0; k < 7; k++) {
      if (idS[i][k] < 0 || idS[i][k + 1] < 0 || idS[i + 1][k] < 0 || idS[i + 1][k + 1] < 0) continue;
      // La celda k3 (del anillo al borde del pase) se queda: es la lata encima de la rueda.
      const enArcoD = i >= I.a0 && i < I.a4 && k >= 4;
      const enArcoT = i >= I.c0 && i < I.c4 && k >= 4;
      if (enArcoD || enArcoT) continue;
      cara([idS[i][k + 1], idS[i][k], idS[i + 1][k], idS[i + 1][k + 1]], tagLado(i, k), !cercaDeArco(i, k));
    }
  }
  for (let j = 0; j < 7; j++) {
    for (let k = 0; k < 7; k++) {
      cara([idF[j][k + 1], idF[j][k], idF[j + 1][k], idF[j + 1][k + 1]], tagFrente(j, k));
      // En la pick-up, lo de abajo de la cola queda detrás del bómper: son 900 triángulos que nadie ve.
      if (!(camioneta && k >= 5)) cara([idC[j][k + 1], idC[j + 1][k + 1], idC[j + 1][k], idC[j][k]], tagCola(j, k), !camioneta);
    }
  }

  // ---- Labio del pase de rueda ----
  // Una tira que dobla hacia adentro desde el borde del arco: es lo que hace ver el pase como
  // una lata doblada y no como un hueco recortado. Por el pliegue, el reflejo muere en el canto.
  const pliegues = [];
  const labio = (iA, iB, tagDe) => {
    const camino = [];
    for (let k = 7; k >= 4; k--) camino.push(idS[iA][k]);
    for (let i = iA + 1; i <= iB; i++) camino.push(idS[i][4]);
    for (let k = 5; k <= 7; k++) camino.push(idS[iB][k]);
    const adentro = camino.map((v) => usar([pos[3 * v] - 0.024, pos[3 * v + 1] + 0.003, pos[3 * v + 2]]));
    for (let m = 0; m < camino.length - 1; m++) {
      cara([camino[m], camino[m + 1], adentro[m + 1], adentro[m]], tagDe(m), false);
      pliegues.push([camino[m], camino[m + 1], 3]);
    }
  };
  if (conMoldura) {
    labio(I.a0, I.a4, () => mat('plastico'));
    labio(I.c0, I.c4, () => mat('plastico'));
  } else {
    // En la cabina adelantada, de la mitad del arco para atrás lo de arriba es la puerta, que se abre: un labio
    // pintado ahí se queda en el cuerpo, y salía detrás de la llanta como una lengua del color del carro.
    labio(I.a0, I.a4, (m) => (m < (adelantada ? 3 : 2) || (adelantada && m >= 5) ? mat('plastico') : m < 3 ? pint('bomper-del') : pint('guardafango-del-$')));
    // En la pick-up, de lata no hay bómper de atrás: el suyo es el de acero, y con este pedacito la pieza se registraba
    // dos veces (DFSK K01, las dos Carry): al marcar el bómper, este retazo se quedaba sin teñir.
    labio(I.c0, I.c4, (m) => (m >= 8 ? mat('plastico') : m >= 7 && !camioneta ? pint('bomper-tras') : pint('costado-$')));
  }

  // ---- Pliegues ----
  const duro = (a, b, s) => pliegues.push([a, b, s]);
  // El hombro, suave, y el filo de la puerta, nítido: de detrás del faro a la calavera.
  for (let i = I.r1; i < I.bt; i++) duro(idS[i][1], idS[i + 1][1], 0.8);
  // El filo nace y muere suave: sobre los arcos la lata se aprieta, y un filo entero ahí se lee
  // como una raya negra pintada encima del guardafango.
  const iniFilo = camioneta ? I.pt : I.c1;
  for (let i = I.a3; i < iniFilo; i++) {
    const s = i < I.b1 ? 0.35 : i < I.f1 ? 0.7 : i >= I.pt ? 0.6 : 1.25;
    duro(idS[i][2], idS[i + 1][2], s);
  }
  // Abajo de la puerta: el canto del estribo, y la línea baja que recoge la puerta.
  for (let i = I.f1; i < I.pt; i++) {
    duro(idS[i][5], idS[i + 1][5], 1);
    duro(idS[i][4], idS[i + 1][4], 0.55);
  }
  // La junta del bómper va en recta por nudos que en la rejilla hacen escalera: el pliegue los
  // deja donde están. Sin él, la subdivisión los jala hacia sus vecinos y la escalera reaparece.
  if (!conMoldura) {
    // Filo 2 exacto: duro en los dos niveles (la junta se queda en la recta) y cero en el último
    // (la normal sigue lisa, y la lata no se quiebra a lado y lado de la junta).
    duro(idS[I.r1][1], idS[I.r1][2], 2);
    duro(idS[I.r1][2], idS[I.r1][3], 2);
    duro(idS[I.r1][3], idS[I.a0][3], 2);
    duro(idS[I.a0][3], idS[I.a0][4], 2);
    duro(idS[I.e1][2], idS[I.e1][3], 2);
    duro(idS[I.e1][3], idS[I.c4][3], 2);
    duro(idS[I.c4][3], idS[I.c4][4], 2);
  }
  // Los dos nervios del capó, y el canto del guardafango que sigue la cintura hacia adelante:
  // sin él, el frente es una barra de jabón.
  for (let i = I.r1; i < I.pdel; i++) {
    duro(idT[i][2], idT[i + 1][2], 0.8);
    duro(idT[i][6], idT[i + 1][6], 0.8);
  }
  // El mismo canto atrás, sobre la tapa del baúl o la compuerta.
  if (!camioneta) for (let i = puntaFila + 1; i < I.bt; i++) duro(idT[i][6], idT[i + 1][6], 0.8);
  // El filo del bómper delantero y el canto de atrás.
  for (let j = 0; j < 7; j++) {
    duro(idF[j][2], idF[j + 1][2], 0.9);
    duro(idC[j][0], idC[j + 1][0], camioneta ? 2 : 1.4);
    duro(idC[j][3], idC[j + 1][3], 1.1);
    if (camioneta) duro(idC[j][2], idC[j + 1][2], 1.2);
  }
  duro(idS[0][2], idS[I.r1][2], 0.9);
  // El bómper de la cabina adelantada: arriba y abajo en canto vivo, de punta a punta, para que sea una lámina y
  // no un rollo. Hasta el arco, porque le da la vuelta a la esquina.
  if (adelantada) {
    for (let j = 0; j < 7; j++) {
      duro(idF[j][4], idF[j + 1][4], 3);
      duro(idF[j][5], idF[j + 1][5], 2);
    }
    // El borde de la tapa: derecho y con las esquinas vivas. Dejado a la subdivisión, se redondeaba 10 cm y se leía
    // como una lengua en la cara.
    for (let j = 0; j < 3; j++) duro(idF[j][2], idF[j + 1][2], 2);
    duro(idF[3][0], idF[3][1], 2);
    duro(idF[3][1], idF[3][2], 2);
    for (const k of [4, 5]) duro(idS[0][k], idS[I.r1][k], k === 4 ? 3 : 2);
  }
  if (camioneta) {
    // La baranda del platón: dos cantos que la leen como una caja y no como una panza.
    for (let i = I.plat; i < I.tgi; i++) {
      duro(idT[i][4], idT[i + 1][4], 2);
      duro(idT[i][5], idT[i + 1][5], 1);
      duro(idT[i][3], idT[i + 1][3], 2);
    }
    // La tapa de la baranda termina en un canto, no en una almohada.
    duro(idS[I.tgi][0], idS[I.tail][0], 2);
    for (const k of [0, 1, 2, 3, 4]) duro(idS[I.tail][k], idS[I.tail][k + 1], 1);
  }

  // Las esquinas que no se redondean: la boca del bómper y las tomas de los lados. Redondas se
  // leen como una cara de caricatura.
  const esquinas = bocaAncha ? [idF[2][1], idF[5][3], idF[5][4], idC[3][2]] : tipo === 'hatchback' ? [idF[2][1], idF[3][3], idF[3][4], idF[4][3], idF[4][4], idF[5][3], idF[5][4], idC[3][2]] : [idF[2][1], idF[2][3], idF[2][4], idF[3][3], idF[3][4], idF[5][3], idF[5][4], idC[3][2]];
  // Y las de las ventanas: un marco con las puntas redondas de 15 cm parece el ojo de buey de
  // un barco. Un carro las tiene casi vivas.
  for (const n of ['pmA', 'pmB', 'ptA', 'pt']) esquinas.push(idT[I[n]][5], idT[I[n]][6]);
  if (!camioneta) esquinas.push(idT[puntaFila][5]);
  // Las cuatro esquinas de la lámpara de la pick-up: vivas, como una pieza que va atornillada.
  if (camioneta) esquinas.push(idC[5][1], idC[5][3]);
  // El faro de los de trabajo es cuadrado: con las esquinas redondas, el del camioncito era un ojo saltón.
  if (suv || camioneta) esquinas.push(idT[0][3], idF[3][1], idS[I.r1][1], adelantada ? idT[0][7] : idT[I.r1][3]);
  if (adelantada) esquinas.push(idF[3][2]);

  return {
    sinForro,
    esquinas,
    pos,
    caras,
    etiquetas,
    pliegues,
    I,
    NI,
    filas,
    idT,
    idS,
    idF,
    idC,
    xLado,
    yHombro,
    zsCw,
    zsHd,
    zPd,
    zBisagraBaul,
    yBisagraBaul,
    zBtCola,
    // Dónde está la bisagra de la tapa de la cabina adelantada, y dónde queda su borde de abajo, que va un poco más adelante.
    tapa: adelantada ? { y: filas[0].t[0][1], z: filas[0].t[0][2], alto: filas[0].t[0][1] - F[0][2][1], avance: filas[0].t[0][2] - F[0][2][2] } : null,
    finTecho,
    F,
    C,
    yCapo,
  };
}
