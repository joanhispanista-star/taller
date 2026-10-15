// Reconocer la MARCA por el logo: la parte pura, sin modelo ni DOM, que
// comparten el reconocedor del navegador (reconocer.js), la herramienta
// que calcula las etiquetas (calcular-etiquetas.mjs) y la que mide
// (medir-logo.mjs). CLIP mira la foto entera y el emblema le queda en un
// 2 %: no lo ve. Recortado alrededor del punto que la persona toca, el
// logo llena el recorte y sí lo reconoce.

// Las marcas del catálogo como las conoce CLIP (aprendió con pies de foto
// en inglés): sin las aclaraciones del catálogo y con el nombre del logo.
// Dos marcas del catálogo pueden compartir logo (Changan y Changan Chana).
export const NOMBRE_CLIP_DE_MARCA = {
  'SsangYong / KGM': 'SsangYong',
  'GWM / Haval': 'Haval',
  'GWM / Tank': 'Tank',
  'GWM / Ora': 'Ora',
  'GWM / Poer': 'Great Wall',
  'Deepal (Changan)': 'Deepal',
  'Changan (Chana)': 'Changan',
};

// Varias frases por marca, promediadas: a CLIP le va mejor con un conjunto
// de plantillas que con una sola frase.
export const PLANTILLAS_LOGO = [
  'the {m} logo',
  'a close-up photo of the {m} car badge',
  'the {m} emblem on the front grille of a car',
  'a {m} logo on a car',
];

// Cómo es el logo, para las marcas que más ruedan en Colombia. Medido el
// 15-oct-2026: con solo el nombre, el corbatín de Chevrolet y el rombo de
// Renault salían con un 8 % (la palabra "Chevrolet" le suena a CLIP a
// carro entero, no a emblema); describir la forma es lo que los separa.
export const DESCRIPCION_LOGO = {
  Chevrolet: ['the gold Chevrolet bowtie emblem', 'a golden bowtie-shaped car badge, the Chevrolet logo'],
  Renault: ['the Renault diamond logo', 'a silver rhombus-shaped car badge, the Renault logo'],
  Mazda: ['the Mazda winged M logo inside a circle', 'the chrome Mazda emblem with stylized wings'],
  Kia: ['the KIA letters logo', 'the Kia badge with the letters KIA in an oval'],
  Hyundai: ['the Hyundai slanted H logo inside an oval', 'the chrome Hyundai H emblem'],
  Toyota: ['the Toyota logo of three overlapping ellipses', 'the chrome Toyota emblem'],
  Nissan: ['the Nissan logo, a circle with a horizontal bar and the word NISSAN', 'the chrome Nissan emblem'],
  Ford: ['the blue oval Ford logo', 'the Ford blue oval badge with the Ford script'],
  Volkswagen: ['the Volkswagen VW logo in a circle', 'the VW roundel emblem'],
  Suzuki: ['the Suzuki S logo', 'the chrome Suzuki S emblem'],
  Honda: ['the Honda H logo', 'the chrome Honda H emblem in a rounded rectangle'],
  'Mercedes-Benz': ['the Mercedes-Benz three-pointed star logo', 'the Mercedes star emblem'],
  BMW: ['the BMW blue and white roundel logo', 'the BMW propeller badge'],
  Audi: ['the Audi four rings logo', 'the four interlocking rings of Audi'],
  Peugeot: ['the Peugeot lion logo', 'the Peugeot lion head emblem'],
  Citroën: ['the Citroën double chevron logo', 'the two chevrons emblem of Citroën'],
  Fiat: ['the Fiat logo, red badge with the letters FIAT', 'the Fiat emblem'],
  Jeep: ['the Jeep logo, the word JEEP', 'the Jeep lettering badge'],
  Mitsubishi: ['the Mitsubishi three diamonds logo', 'the three red diamonds emblem of Mitsubishi'],
  Subaru: ['the Subaru six stars logo', 'the Subaru emblem with stars in a blue oval'],
  Chery: ['the Chery logo', 'the Chery emblem, a circle with a stylized C and A'],
  JAC: ['the JAC Motors logo', 'the JAC emblem, a circle with a stylized star'],
  BYD: ['the BYD logo, the letters BYD in an oval', 'the BYD emblem'],
  'Land Rover': ['the Land Rover green oval logo', 'the Land Rover badge'],
  Volvo: ['the Volvo iron mark logo, a circle with an arrow', 'the Volvo emblem'],
  MG: ['the MG octagon logo', 'the MG badge, letters MG in an octagon'],
  Changan: ['the Changan V-shaped logo', 'the Changan emblem'],
  Haval: ['the Haval logo, the word HAVAL', 'the Haval lettering badge'],
  SsangYong: ['the SsangYong logo, two wings in a circle', 'the SsangYong emblem'],
  DFSK: ['the DFSK logo', 'the DFSK emblem with two swallows'],
  Lexus: ['the Lexus L logo in an oval', 'the Lexus emblem'],
  Mini: ['the MINI winged logo', 'the MINI badge with wings'],
  Porsche: ['the Porsche crest logo', 'the Porsche shield emblem with a horse'],
  Skoda: ['the Skoda winged arrow logo', 'the Skoda emblem'],
  Dodge: ['the Dodge logo', 'the Dodge badge with two red stripes'],
  RAM: ['the RAM logo with a ram head', 'the RAM trucks emblem'],
  Opel: ['the Opel lightning bolt logo', 'the Opel emblem, a lightning bolt in a circle'],
  Seat: ['the SEAT S logo', 'the Seat emblem'],
  Tesla: ['the Tesla T logo', 'the Tesla emblem'],
  Jaguar: ['the Jaguar leaping cat logo', 'the Jaguar emblem'],
  Daihatsu: ['the Daihatsu D logo', 'the Daihatsu emblem'],
  Chrysler: ['the Chrysler winged logo', 'the Chrysler wings emblem'],
  'Great Wall': ['the Great Wall Motors logo', 'the Great Wall emblem'],
  Foton: ['the Foton logo', 'the Foton emblem'],
};

// Las frases con que se calcula el vector del logo de una marca: las
// plantillas con el nombre y, si la hay, la descripción de la forma.
export function frasesDeLogo(nombre) {
  return [...PLANTILLAS_LOGO.map((p) => p.replace('{m}', nombre)), ...(DESCRIPCION_LOGO[nombre] || [])];
}

// Tres recortes alrededor del toque, como fracción del lado mayor de la
// foto: el logo de una foto de cerca es grande y el de una foto de lejos,
// chico; con tres tamaños alguno lo llena.
export const ESCALAS_RECORTE = [0.1, 0.16, 0.25];

// El cuadrado de recorte alrededor de un punto (fracciones del ancho y del
// alto), de lado `escala` × el lado mayor, metido dentro de la foto.
// Devuelve bordes en píxeles, inclusivos (como los pide RawImage.crop).
export function recorteAlrededor(ancho, alto, fx, fy, escala) {
  const lado = Math.max(8, Math.min(Math.round(Math.max(ancho, alto) * escala), ancho, alto));
  let x1 = Math.round(fx * ancho - lado / 2);
  let y1 = Math.round(fy * alto - lado / 2);
  x1 = Math.max(0, Math.min(x1, ancho - lado));
  y1 = Math.max(0, Math.min(y1, alto - lado));
  return { x1, y1, x2: x1 + lado - 1, y2: y1 + lado - 1, lado };
}

// Agrupa las marcas del catálogo por el nombre con que CLIP las reconoce,
// con un prior por presencia: una marca común en Colombia parte con
// ventaja frente a una rara que se le parezca.
const PESO_PRESENCIA = { 'muy comun': 1, comun: 0.7, 'poco comun': 0.45 };

export function marcasConLogo(catalogo) {
  const porNombre = new Map();
  for (const e of catalogo) {
    const nombre = NOMBRE_CLIP_DE_MARCA[e.marca] || e.marca;
    const previa = porNombre.get(nombre) || { nombre, marcas: [], prior: 0 };
    if (!previa.marcas.includes(e.marca)) previa.marcas.push(e.marca);
    previa.prior = Math.max(previa.prior, PESO_PRESENCIA[e.presencia] || 0.45);
    porNombre.set(nombre, previa);
  }
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function softmax(valores) {
  const mayor = Math.max(...valores);
  const exp = valores.map((v) => Math.exp(v - mayor));
  const suma = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / suma);
}

function punto(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// De los vectores de varios recortes a la lista de marcas ordenada: por
// recorte, probabilidades contra cada logo (temperatura 100, la de CLIP),
// por el prior de presencia; luego el promedio de los recortes. Devuelve
// [{ nombre, marcas, p }] de más a menos probable.
export function clasificarLogo(vectoresRecortes, etiquetasMarcas, { escala = 100, conPrior = true } = {}) {
  if (vectoresRecortes.length === 0 || etiquetasMarcas.length === 0) return [];
  const suma = new Array(etiquetasMarcas.length).fill(0);
  for (const vector of vectoresRecortes) {
    let p = softmax(etiquetasMarcas.map((m) => escala * punto(vector, m.e)));
    if (conPrior) {
      p = p.map((x, i) => x * (etiquetasMarcas[i].prior || 1));
      const total = p.reduce((a, b) => a + b, 0);
      p = p.map((x) => x / total);
    }
    for (let i = 0; i < p.length; i++) suma[i] += p[i] / vectoresRecortes.length;
  }
  return etiquetasMarcas
    .map((m, i) => ({ nombre: m.nombre, marcas: m.marcas, p: suma[i] }))
    .sort((a, b) => b.p - a.p);
}

// Un logo "reconocido" es uno que gana con claridad: probabilidad alta y
// ventaja sobre el segundo. Por debajo, la pantalla pide tocar más cerca o
// elegir la marca a mano, en vez de afirmar una marca por un pelo. Los
// umbrales salen de medir diez fotos (15-oct-2026): siete de las ocho
// marcas acertadas salían con 20-90 % y 10+ puntos de ventaja (la octava,
// un Tucson al 12 % contra 7 %, queda fuera a propósito: ahí se pregunta);
// las equivocadas, con 5-10 % y uno o dos puntos. Son 70 marcas: un 29 %
// ya es ganar por mucho.
export function logoSeguro(lista, { minimo = 0.15, ventaja = 0.07 } = {}) {
  if (lista.length === 0) return false;
  const [a, b] = lista;
  return a.p >= minimo && (!b || a.p - b.p >= ventaja);
}

// Del toque en la pantalla al punto de la foto, como fracciones. La foto se
// muestra entera dentro de una caja (object-fit: contain), así que puede
// tener franjas vacías a los lados o arriba y abajo: un toque en la franja
// devuelve null. `caja` es el rectángulo del <img> en pantalla y `natural`
// el tamaño real de la foto.
export function puntoEnFoto(cx, cy, caja, natural) {
  if (!caja.width || !caja.height || !natural.width || !natural.height) return null;
  const escala = Math.min(caja.width / natural.width, caja.height / natural.height);
  const anchoVisto = natural.width * escala;
  const altoVisto = natural.height * escala;
  const izquierda = caja.left + (caja.width - anchoVisto) / 2;
  const arriba = caja.top + (caja.height - altoVisto) / 2;
  const x = (cx - izquierda) / anchoVisto;
  const y = (cy - arriba) / altoVisto;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
