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
  // Renault y Kia cambiaron de logo en 2021: el rombo pasó a dos chevrones
  // enfrentados en línea, y el óvalo KIA a letras estilizadas sin óvalo.
  // Medido el 16-oct-2026 con fotos de Commons: con solo el logo viejo, un
  // Kwid 2023 salía Chevrolet y un K3 2024 salía Volkswagen.
  Renault: ['the Renault diamond logo', 'a silver rhombus-shaped car badge, the Renault logo', 'the new Renault logo, two interlocking chevrons forming a diamond outline'],
  Mazda: ['the Mazda winged M logo inside a circle', 'the chrome Mazda emblem with stylized wings'],
  Kia: ['the KIA letters logo', 'the Kia badge with the letters KIA in an oval', 'the new Kia logo, stylized angular KIA lettering without an oval'],
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
  Citroën: ['the Citroën double chevron logo', 'the two chevrons emblem of Citroën', 'the new Citroën logo, two stacked chevrons inside an oval'],
  Fiat: ['the Fiat logo, red badge with the letters FIAT', 'the Fiat emblem', 'the FIAT lettering badge, chrome letters F I A T on the grille'],
  Jeep: ['the Jeep logo, the word JEEP', 'the Jeep lettering badge'],
  Mitsubishi: ['the Mitsubishi three diamonds logo', 'the three red diamonds emblem of Mitsubishi'],
  Subaru: ['the Subaru six stars logo', 'the Subaru emblem with stars in a blue oval'],
  Chery: ['the Chery logo', 'the Chery emblem, a circle with a stylized C and A', 'the CHERY lettering badge'],
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
//
// Si una marca trae PROTOTIPO DE IMAGEN (`ep`: el vector promedio de fotos
// reales de su emblema; herramientas/calcular-prototipos.mjs), su logit
// suma `pesoImagen` veces el parecido con ese prototipo, centrado en el
// parecido medio con todos los prototipos (así una marca sin prototipo
// queda en cero, ni favorecida ni castigada). MEDIDO el 16-oct-2026 con el
// dataset de General Blockchain (34 marcas, 16 recortes cada una): no
// ayuda. Con peso 0,5 subía la probabilidad media de la marca correcta de
// 36 a 44-47 %, pero bajaba los aciertos de 8 a 5-6 de 10 y aparecían
// "seguros" equivocados (un Logan como Mercedes al 58 %): los óvalos
// cromados (Mercedes, Hyundai, Honda) atraen recortes ajenos, con y sin
// corregir el sesgo. Por eso el peso por defecto es 0 y las etiquetas no
// llevan prototipos; el código queda para medir con un dataset mejor.
//
// Con `fondo` ([{ nombre, e }], los vectores de FRASES_FONDO), lo que no
// es logo compite en la misma softmax: la lista que sale sigue siendo solo
// de marcas, pero sus probabilidades ya no suman 1; lo que falta es la
// probabilidad de que el recorte no tenga ningún logo, y viene en la
// propiedad `fondo` de la lista. Así un recorte de parrilla no le regala
// un 9 % a una marca cualquiera.
export function clasificarLogo(vectoresRecortes, etiquetasMarcas, { escala = 100, conPrior = true, pesoImagen = 0, fondo = [] } = {}) {
  if (vectoresRecortes.length === 0 || etiquetasMarcas.length === 0) return [];
  const suma = new Array(etiquetasMarcas.length).fill(0);
  let sumaFondo = 0;
  const conPrototipo = etiquetasMarcas.filter((m) => m.ep);
  for (const vector of vectoresRecortes) {
    let extra = () => 0;
    if (pesoImagen > 0 && conPrototipo.length > 0) {
      // Menos el sesgo del prototipo (cuánto se parece a cualquier logo):
      // sin eso, un óvalo cromado se lleva recortes ajenos.
      const parecidos = new Map(conPrototipo.map((m) => [m, punto(vector, m.ep) - (m.sesgo || 0)]));
      const media = [...parecidos.values()].reduce((s, x) => s + x, 0) / parecidos.size;
      extra = (m) => (parecidos.has(m) ? pesoImagen * escala * (parecidos.get(m) - media) : 0);
    }
    let p = softmax([...etiquetasMarcas.map((m) => escala * punto(vector, m.e) + extra(m)), ...fondo.map((f) => escala * punto(vector, f.e))]);
    if (conPrior) {
      // El prior dice qué marca es más probable ENTRE MARCAS, no si hay logo
      // o no: se reparte solo la parte de las marcas y el fondo queda como
      // salió. Antes se renormalizaba todo junto y, como el prior es menor
      // que 1, el fondo crecía más en los recortes de marcas poco comunes
      // (BYD, Chery): el barrido los descartaba por "parecer fondo"
      // (revisión del 17-oct).
      const n = etiquetasMarcas.length;
      const parteMarcas = p.slice(0, n).reduce((a, b) => a + b, 0);
      const conPeso = p.slice(0, n).map((x, i) => x * (etiquetasMarcas[i].prior || 1));
      const totalPeso = conPeso.reduce((a, b) => a + b, 0);
      p = [...conPeso.map((x) => (totalPeso > 0 ? (x / totalPeso) * parteMarcas : 0)), ...p.slice(n)];
    }
    for (let i = 0; i < etiquetasMarcas.length; i++) suma[i] += p[i] / vectoresRecortes.length;
    for (let i = etiquetasMarcas.length; i < p.length; i++) sumaFondo += p[i] / vectoresRecortes.length;
  }
  const lista = etiquetasMarcas
    .map((m, i) => ({ nombre: m.nombre, marcas: m.marcas, p: suma[i] }))
    .sort((a, b) => b.p - a.p);
  lista.fondo = sumaFondo;
  return lista;
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

// ---- Encontrar el logo sin que nadie lo toque ----

// Lo que NO es un logo pero sale en los recortes de una foto de carro:
// parrilla, faro, placa, chapa, llanta, vidrio, el entorno y las letras
// del modelo. Entran en la misma softmax que los logos (ver clasificarLogo
// con `fondo`): un recorte de parrilla reparte su probabilidad entre
// setenta logos y parece que "algo" gana con un 9 %; con el fondo en la
// lista, esa misma parrilla se va al fondo y el recorte queda en nada,
// que es lo que es. Sirve para elegir, entre muchos recortes, el que de
// verdad tiene un emblema. Un vector por grupo (calcular-etiquetas.mjs).
export const FRASES_FONDO = {
  parrilla: ['a close-up photo of a car radiator grille', 'the black mesh grille of a car', 'a photo of a car front grille with horizontal slats'],
  faro: ['a close-up photo of a car headlight', 'a photo of a car tail light', 'a photo of a fog lamp on a car bumper'],
  placa: ['a close-up photo of a yellow license plate with black letters', 'a photo of a car number plate', 'a license plate'],
  chapa: ['a close-up photo of a painted car body panel', 'a photo of a car bumper', 'a photo of a car door', 'a photo of a car hood'],
  llanta: ['a photo of a car wheel and tire', 'a close-up photo of a tire', 'a photo of a wheel rim'],
  vidrio: ['a photo of a car windshield', 'a photo of a car window reflecting the sky', 'a photo of the side mirror of a car'],
  entorno: ['a photo of a brick wall', 'a photo of asphalt pavement', 'a photo of trees and leaves', 'a photo of a building', 'a photo of the sky', 'a photo of a parking lot'],
  letras: ['a photo of a model name badge with chrome letters on a car', 'chrome lettering on the back of a car'],
  borroso: ['a blurry photo', 'a dark photo of nothing in particular'],
};

// Los puntos de una rejilla para barrer la foto buscando el logo cuando no
// hay placa que diga dónde está. Solo la franja donde puede haber un
// emblema (ni el cielo ni el piso): de `y1` a `y2` del alto y de `x1` a
// `x2` del ancho, cada `paso`. Devuelve puntos en fracciones, del centro
// hacia afuera, para que el avance en pantalla empiece por lo probable.
export function rejillaDeBarrido({ paso = 0.12, x1 = 0.1, x2 = 0.9, y1 = 0.3, y2 = 0.8 } = {}) {
  const eje = (a, b) => {
    const n = Math.max(1, Math.round((b - a) / paso));
    const real = (b - a) / n;
    return Array.from({ length: n + 1 }, (_, i) => a + i * real);
  };
  const puntos = [];
  for (const y of eje(y1, y2)) for (const x of eje(x1, x2)) puntos.push({ x, y });
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return puntos.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

// Cómo busca la app el logo sola (reconocer.js) y cómo lo mide el PC
// (herramientas/medir-cadena.mjs): las dos usan estas constantes, para que
// lo medido sea lo que corre en el teléfono.
// Medido el 16-oct-2026 con 46 fotos (las 10 de Joan y de la web, y 36 de
// Commons en Colombia; herramientas/medir-barrido.mjs y -fino.mjs):
//  - Encima de la placa manda 'top1': elegir por "menos fondo" bajaba los
//    aciertos de 17 a 14 de 29.
//  - En el barrido manda 'logo': con 'top1' una llanta o un faro se llevan
//    un 20 % de "BMW" o "Ford" y salían 6 a 9 "seguros" equivocados; con
//    'logo', 2.
//  - Que el fondo compita también al DECIDIR la marca no sirve: los
//    seguros equivocados tienen tan poco fondo (8-10 %) como los buenos.
export const CRITERIO_ZONA = 'top1';
export const CRITERIO_BARRIDO = 'logo';
export const FONDO_AL_DECIDIR = false;
// La rejilla del barrido sin placa (ver rejillaDeBarrido): recortes del
// 16 % del lado mayor cada 9 %, en la franja del 30 al 80 % del alto y del
// 10 al 90 % del ancho (70 puntos), y los 3 que más parecen logo se miran
// a las tres escalas del toque (9 más): 79 pasadas de CLIP. Medido: 27 de
// 46 bien, 22 seguras y bien, 2 seguras y mal. Más barato se pierde:
// franja del 35 al 75 %, 23 de 46 y 4 seguras mal; paso de 10 %, 21 de 46;
// recortes del 20 % cada 12 %, 17 de 46. En el teléfono son decenas de
// segundos: corre de fondo, avisa cuánto va y se aborta si la persona toca.
export const REJILLA_BARRIDO = { escala: 0.16, paso: 0.09, x1: 0.1, x2: 0.9, y1: 0.3, y2: 0.8, refinar: 3 };

// Entre el logo que ya se tenía (el de encima de la placa, que no quedó
// seguro) y el del barrido, cuál se muestra: el barrido si salió seguro,
// o si su mejor marca tiene más probabilidad; si no, se queda el anterior
// (la zona encima de la placa es donde casi siempre está el emblema).
// Cada uno es { marcas: [{ nombre, p }], seguro } o null.
export function logoQueQueda(anterior, barrido) {
  if (!barrido) return anterior || null;
  if (!anterior || barrido.seguro) return barrido;
  if (anterior.seguro) return anterior;
  return barrido.marcas[0].p > anterior.marcas[0].p ? barrido : anterior;
}

// Si el barrido puede decir la marca "segura": el punto ganador (el de más
// probabilidad entre los refinados) tiene que ser seguro por sí mismo Y su
// marca tiene que salir primera en al menos 2 de los puntos refinados. Un
// emblema de verdad se ve desde recortes vecinos (se solapan: recorte del
// 16 %, paso del 9 %); una textura que engaña a CLIP (la llanta del Onix de
// lado que salía Daihatsu al 36 %) sale en uno solo. Medido el 17-oct-2026
// con 46 fotos (herramientas/medir-barrido-acuerdo.mjs): seguras y mal en
// el barrido de 3 a 1, seguras y bien de 21 a 18; mínimo de 20 % en vez de
// esto: 2 mal y 18 bien. `refinados` es [[{ nombre, p }, ...], ...], una
// lista ordenada por punto. Devuelve { marcas, seguro, indice }.
export function decidirBarrido(refinados) {
  if (!refinados.length) return null;
  let indice = 0;
  refinados.forEach((lista, i) => {
    if (lista[0].p > refinados[indice][0].p) indice = i;
  });
  const marcas = refinados[indice];
  const votos = refinados.filter((lista) => lista[0].nombre === marcas[0].nombre).length;
  return { marcas, seguro: logoSeguro(marcas) && votos >= 2, indice };
}
