// El carro genérico, construido pieza por pieza, en cuatro carrocerías.
//
// Por qué un carro dibujado por código y no un modelo escaneado o
// descargado: lo que necesita el taller es que CADA pieza pintable sea un
// objeto aparte, con su nombre, para poderla tocar y marcar. Un escaneo
// del celular (y casi todos los modelos gratuitos) llegan como una sola
// masa sin piezas. Aquí cada panel nace ya separado, con una junta visible
// entre uno y otro, como en el carro real.
//
// Desde el catálogo (15-oct-2026) el carro se dibuja a las MEDIDAS de la
// línea del cliente (largo, ancho, alto, distancia entre ejes) y con la
// carrocería que le toca: sedán, hatchback, SUV o camioneta de platón. No es
// el Onix exacto, es un carro del mismo tipo, del mismo tamaño y del mismo
// color; para marcar piezas es lo que hace falta, y es lo que usan los
// peritos de seguros.
//
// El carro mira hacia -Z: así el lado izquierdo, el del conductor en
// Colombia, queda en -X, y el nombre que ve el dueño en la pantalla es el
// que usa el pintor cuando camina alrededor del carro.
//
// Este módulo no toca el DOM: se construye igual en el navegador y en las
// pruebas de Node.
import * as THREE from 'three';
import { PIEZAS_POR_ID, esInterior } from './piezas.js';
import { medidasParaDibujar, normalizarCarroceria } from './carrocerias.js';

const CHAPA = 0.08; // grosor de un panel lateral
const BISEL = 0.012; // redondeo de los bordes de cada pieza
// Cada borde compartido entre dos piezas se retranquea esta distancia. Con
// el bisel sumado deja una junta de unos 2,4 cm: exagerada frente a los 5 mm
// de un carro real, pero es lo que hace que las piezas se distingan en la
// pantalla de un celular.
const H = 0.012 + BISEL;

// ---------- Disposición ----------
//
// Todos los bordes (eje Z, a lo largo) y alturas (eje Y) de una carrocería,
// en metros. Cada número del sedán original (4,50 × 1,84 × 1,455 m, 2,85 m
// entre ejes) está expresado como una distancia a un eje, a la punta o a la
// cola: al cambiar las medidas el carro se estira donde se estira un carro
// de verdad (entre los ejes y en los voladizos), no como una foto escalada.
// `ajustes` (opcional) trae lo que se MIDIÓ en un escaneo y manda sobre las
// proporciones típicas de la carrocería: dónde están los ejes (z), a qué
// altura empieza la lata por abajo (piso) y dónde termina y empieza el
// vidrio (cintura). Sin ellos, las piezas del genérico caían corridas sobre
// el carro real: en el Kona escaneado la lata baja hasta 20 cm (el genérico
// SUV la empezaba en 42) y el vidrio empieza a 1 m (el genérico, a 86 cm), y
// media puerta quedaba como "nada" (27-oct-2026).
export function disposicion(carroceria, medidas, ajustes = {}) {
  const tipo = normalizarCarroceria(carroceria);
  const m = medidasParaDibujar(tipo, medidas);
  const d = { tipo, ...m };
  d.punta = -m.largo / 2;
  d.cola = m.largo / 2;
  d.medio = m.ancho / 2; // cara exterior de la chapa
  d.anchoVidrio = m.ancho - 0.1; // la cabina es un poco más angosta que la chapa
  d.anchoNucleo = m.ancho - 0.16; // el bloque oscuro que rellena por dentro
  d.anchoTecho = m.ancho - 0.08;
  d.ruedaX = m.ancho / 2 - 0.12;
  // Cara inferior del techo; el panel mide 5,5 cm. En la SUV el alto del
  // catálogo incluye las barras del techo (6 cm), así que la chapa va más abajo.
  d.techo = m.alto - 0.055 - (tipo === 'suv' ? 0.06 : 0);

  if (tipo === 'sedan') {
    d.piso = ajustes.piso ?? 0.3; // la chapa empieza a 30 cm del suelo
    d.estriboAlto = d.piso + 0.12;
    d.radioRueda = 0.32;
    d.arco = 0.4; // radio del pase de rueda: 8 cm de aire sobre la llanta
    d.cintura = ajustes.cintura ?? m.alto - 0.505; // donde termina la chapa y empieza el vidrio
    d.ejeDel = ajustes.ejeDel ?? d.punta + (m.largo - m.entreEjes) * 0.545;
    d.ejeTras = ajustes.ejeTras ?? d.ejeDel + m.entreEjes;
    d.bomperDel = d.punta + 0.23; // donde termina el bómper y empieza la chapa
    d.capoDel = d.punta + 0.25;
    d.capoTras = d.ejeDel + 0.79; // base del parabrisas
    d.puertaDel = d.capoTras - 0.04;
    d.puertaTras = d.ejeTras - 0.43;
    d.puertaMedia = d.puertaDel + (d.puertaTras - d.puertaDel) * 0.569;
    d.parabrisasAlto = d.capoTras + 0.71;
    // El techo termina antes del eje trasero y el vidrio cae hasta poco
    // después: así la tapa del baúl mide unos 40 cm, como en un sedán de
    // verdad, y al abrirse se nota.
    d.techoTras = d.ejeTras - 0.3;
    d.vidrioTras = d.ejeTras + 0.1; // base del vidrio trasero
    d.baulDel = d.vidrioTras + 0.01;
    d.baulTras = d.cola - 0.22;
    d.bomperTras = d.cola - 0.23;
    d.finCostado = d.bomperTras;
  } else if (tipo === 'camioneta') {
    d.piso = ajustes.piso ?? 0.48;
    d.estriboAlto = d.piso + 0.1;
    d.radioRueda = 0.38;
    d.arco = 0.47;
    d.cintura = ajustes.cintura ?? m.alto - 0.68;
    // Las camionetas llevan la cabina adelante y un voladizo trasero largo.
    d.ejeDel = ajustes.ejeDel ?? d.punta + (m.largo - m.entreEjes) * 0.42;
    d.ejeTras = ajustes.ejeTras ?? d.ejeDel + m.entreEjes;
    d.bomperDel = d.punta + 0.25;
    d.capoDel = d.punta + 0.27;
    d.capoTras = d.ejeDel + 1.05; // capó largo
    d.puertaDel = d.capoTras - 0.04;
    d.puertaTras = d.ejeTras - 0.65; // doble cabina: la puerta trasera termina antes del eje
    d.puertaMedia = d.puertaDel + (d.puertaTras - d.puertaDel) * 0.55;
    d.parabrisasAlto = d.capoTras + 0.75;
    d.cabinaTras = d.puertaTras + 0.12; // pared trasera de la cabina
    d.techoTras = d.cabinaTras - 0.02;
    d.platonDel = d.cabinaTras + 0.06;
    d.bomperTras = d.cola - 0.22;
    d.compuertaZ = d.cola - 0.22; // cara exterior de la compuerta del platón
    d.finCostado = d.cola - 0.32; // el costado del platón termina donde empieza la compuerta
  } else {
    // hatchback y SUV: mismo dibujo, la SUV más alta y con más aire abajo.
    const alta = tipo === 'suv';
    d.piso = ajustes.piso ?? (alta ? 0.42 : 0.3);
    d.estriboAlto = d.piso + (alta ? 0.1 : 0.12);
    d.radioRueda = alta ? 0.35 : 0.3;
    d.arco = alta ? 0.44 : 0.38;
    d.cintura = ajustes.cintura ?? m.alto - (alta ? 0.6 : 0.52);
    d.ejeDel = ajustes.ejeDel ?? d.punta + (m.largo - m.entreEjes) * 0.56;
    d.ejeTras = ajustes.ejeTras ?? d.ejeDel + m.entreEjes;
    d.bomperDel = d.punta + 0.23;
    d.capoDel = d.punta + 0.25;
    d.capoTras = d.ejeDel + (alta ? 0.85 : 0.75);
    d.puertaDel = d.capoTras - 0.04;
    d.puertaTras = d.ejeTras - 0.3;
    d.puertaMedia = d.puertaDel + (d.puertaTras - d.puertaDel) * 0.56;
    d.parabrisasAlto = d.capoTras + 0.7;
    d.techoTras = d.cola - (alta ? 0.42 : 0.5); // el techo llega casi hasta la cola
    d.compuertaArriba = d.cintura + (alta ? 0.22 : 0.2); // donde termina la chapa de la compuerta y empieza su vidrio
    d.compuertaZ = d.cola - 0.24; // cara exterior de la compuerta, arriba
    d.bomperTras = d.cola - 0.23;
    d.finCostado = d.cola - 0.32;
  }
  d.entreEjes = d.ejeTras - d.ejeDel;
  return d;
}

// Línea del capó: sube desde el bómper hasta la cintura en la base del parabrisas.
function yCapo(d, s) {
  const desde = d.piso + 0.5;
  return desde + ((s - d.capoDel) * (d.cintura - desde)) / (d.capoTras - d.capoDel);
}

export function materialPintura(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 });
}

// Las piezas de interior: el mismo color pero más claro y mate. Dentro de
// un vano o detrás de una puerta llega poca luz, y con la pintura oscura
// de afuera no se distinguían del hueco.
export function materialInterior(color) {
  const claro = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  return new THREE.MeshStandardMaterial({ color: claro, metalness: 0.2, roughness: 0.6 });
}

function materialNegro() {
  return new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.2, roughness: 0.75 });
}

function materialVidrio() {
  // Oscuro y con el reflejo del entorno a la mitad: con el reflejo entero
  // el parabrisas salía blanco en la vista de frente.
  return new THREE.MeshStandardMaterial({
    color: 0x151c24,
    metalness: 0.1,
    roughness: 0.12,
    transparent: true,
    opacity: 0.7,
    envMapIntensity: 0.45,
  });
}

// Un carro de verdad se angosta hacia las puntas visto desde arriba: el
// frente y la cola no son el rectángulo de la chapa. Una zona de afinado
// va de `inicio` (donde el ancho es el entero) a `punta`, donde queda en
// `factor` del ancho, con una curva suave: casi todo el estrechamiento
// ocurre cerca de la punta, como en un bómper redondeado.
function kEn(z, zona) {
  const t = (z - zona.inicio) / (zona.punta - zona.inicio);
  if (t <= 0) return 1;
  const tt = Math.min(1, t);
  return 1 - (1 - zona.factor) * tt * tt;
}

// Acerca al eje los vértices de una malla ya construida, según su z en el
// carro (la geometría extruida ya está en coordenadas del carro; una caja
// lleva su z en `position`). Solo para mallas simétricas respecto al eje.
function afinarMalla(malla, zona) {
  const posiciones = malla.geometry.attributes.position;
  for (let i = 0; i < posiciones.count; i++) {
    const k = kEn(posiciones.getZ(i) + malla.position.z, zona);
    if (k < 1) posiciones.setX(i, posiciones.getX(i) * k);
  }
  posiciones.needsUpdate = true;
  malla.geometry.computeVertexNormals();
  return malla;
}

function materialPlastico() {
  return new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.85, metalness: 0.05 });
}

function materialCromo() {
  return new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.2, metalness: 0.9 });
}

// Los adornos (manijas, molduras, pasarruedas, barras del techo) no se
// pintan ni se tocan: el dedo los atraviesa y marca la pieza que hay
// debajo (toque.js los salta). Sin esto, tocar la manija no marcaba la puerta.
function decorativo(malla) {
  malla.userData.decorativo = true;
  return malla;
}

// El pasarrueda de plástico negro que rodea la llanta en SUV y camioneta:
// un aro de 6 cm que sigue el arco del guardafango o del costado.
function perfilPasarrueda(d, eje) {
  return (f) => {
    const interno = d.arco + 0.005;
    const externo = d.arco + 0.065;
    const y = d.radioRueda;
    f.moveTo(eje - externo, y - 0.03);
    f.lineTo(eje - externo, y);
    f.absarc(eje, y, externo, Math.PI, 0, true);
    f.lineTo(eje + externo, y - 0.03);
    f.lineTo(eje + interno, y - 0.03);
    f.lineTo(eje + interno, y);
    f.absarc(eje, y, interno, 0, Math.PI, false);
    f.lineTo(eje - interno, y - 0.03);
    f.closePath();
  };
}

// Dibuja un perfil (eje horizontal = Z del carro, eje vertical = Y) y lo
// extruye a lo ancho. `xDesde` es la cara exterior de la pieza y la pieza
// crece hacia -X `grosor` metros. La misma función sirve para una puerta
// de 8 cm y para el capó, que cruza el carro entero.
//
// El bisel agranda el perfil hacia afuera `bisel` metros (en los paneles
// finos ya está descontado en H). Con `biselHaciaAdentro` el bisel se
// labra hacia adentro y el cuerpo coincide con el perfil dibujado: lo usan
// los bómperes, cuyo bisel de 3 cm se tragaba las placas y la parrilla.
function extruirPerfil(dibujar, { xDesde, grosor, bisel = BISEL, biselHaciaAdentro = false, material }) {
  const forma = new THREE.Shape();
  dibujar(forma);
  const geometria = new THREE.ExtrudeGeometry(forma, {
    depth: Math.max(0.001, grosor - 2 * bisel),
    bevelEnabled: bisel > 0,
    bevelThickness: bisel,
    bevelSize: bisel,
    bevelOffset: biselHaciaAdentro ? -bisel : 0,
    bevelSegments: 2,
    curveSegments: 18,
  });
  // ExtrudeGeometry extruye en +Z local. Girar -90° sobre Y manda el eje
  // horizontal del perfil al eje Z del mundo y la extrusión hacia -X.
  geometria.rotateY(-Math.PI / 2);
  geometria.translate(xDesde - bisel, 0, 0);
  return new THREE.Mesh(geometria, material);
}

function caja(ancho, alto, largo, material, x, y, z) {
  const malla = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, largo), material);
  malla.position.set(x, y, z);
  return malla;
}

// ---- Perfiles de los paneles laterales (iguales en los dos lados) ----

function perfilGuardafangoDelantero(d) {
  return (f) => {
    const a = d.bomperDel + H;
    const b = d.puertaDel - H;
    const abajo = d.radioRueda; // el panel termina a la altura del eje; la llanta asoma por debajo
    f.moveTo(a, abajo);
    f.lineTo(d.ejeDel - d.arco, abajo);
    f.absarc(d.ejeDel, abajo, d.arco, Math.PI, 0, true); // por encima de la llanta
    f.lineTo(b, abajo);
    // El borde de arriba va 8,5 cm por debajo de la línea del capó para no
    // compartir cara con él (dos caras en el mismo plano titilan en pantalla).
    f.lineTo(b, yCapo(d, b) - 0.085);
    f.lineTo(a, yCapo(d, a) - 0.085);
    f.closePath();
  };
}

function perfilPuerta(d, desde, hasta) {
  return (f) => {
    const a = desde + H;
    const b = hasta - H;
    const abajo = d.estriboAlto + H;
    const arriba = d.cintura - 0.01 - H;
    f.moveTo(a, abajo);
    f.lineTo(b, abajo);
    f.lineTo(b, arriba);
    f.lineTo(a, arriba);
    f.closePath();
  };
}

function perfilEstribo(d) {
  return (f) => {
    const a = d.puertaDel + H;
    const b = d.puertaTras - H;
    f.moveTo(a, d.piso);
    f.lineTo(b, d.piso);
    f.lineTo(b, d.estriboAlto - H);
    f.lineTo(a, d.estriboAlto - H);
    f.closePath();
  };
}

// El costado trasero rodea la llanta. En el sedán sigue por debajo del baúl
// hasta el bómper (por eso tiene forma de L); en hatchback y SUV sube
// hasta la cintura de punta a punta; en la camioneta es el costado del
// platón, que arranca detrás de la cabina.
function perfilCostado(d) {
  return (f) => {
    const a = (d.tipo === 'camioneta' ? d.platonDel : d.puertaTras) + H;
    const b = d.finCostado - H;
    const abajo = d.radioRueda;
    const arriba = d.cintura - 0.01 - H;
    f.moveTo(a, abajo);
    f.lineTo(d.ejeTras - d.arco, abajo);
    f.absarc(d.ejeTras, abajo, d.arco, Math.PI, 0, true);
    f.lineTo(b, abajo);
    if (d.tipo === 'sedan') {
      f.lineTo(b, d.piso + 0.5 - H);
      f.lineTo(d.baulDel - H, d.piso + 0.5 - H);
      f.lineTo(d.baulDel - H, arriba);
    } else {
      f.lineTo(b, arriba);
    }
    f.lineTo(a, arriba);
    f.closePath();
  };
}

// ---- Perfiles de las piezas que cruzan el carro de lado a lado ----

// El capó y el techo van levemente abombados (3 cm en el centro): una
// chapa plana se ve de cartón; la curva es lo que hace que el reflejo
// corra por la pintura como en un carro de verdad.
const COMBA = 0.03;

function perfilCapo(d) {
  return (f) => {
    const y0 = yCapo(d, d.capoDel);
    const y1 = yCapo(d, d.capoTras);
    const medio = (d.capoDel + d.capoTras) / 2;
    f.moveTo(d.capoDel, y0);
    f.quadraticCurveTo(medio, (y0 + y1) / 2 + 2 * COMBA, d.capoTras, y1);
    f.lineTo(d.capoTras, y1 - 0.07);
    f.quadraticCurveTo(medio, (y0 + y1) / 2 + 2 * COMBA - 0.07, d.capoDel, y0 - 0.07);
    f.closePath();
  };
}

// La cara interior del capó: una lámina de 12 mm pegada por debajo, con la
// misma comba, que viaja con él y se pinta aparte.
function perfilCapoInterior(d) {
  return (f) => {
    const a = d.capoDel + 0.05;
    const b = d.capoTras - 0.04;
    const medio = (a + b) / 2;
    const comba = 2 * COMBA;
    f.moveTo(a, yCapo(d, a) - 0.073);
    f.quadraticCurveTo(medio, yCapo(d, medio) - 0.073 + comba, b, yCapo(d, b) - 0.073);
    f.lineTo(b, yCapo(d, b) - 0.085);
    f.quadraticCurveTo(medio, yCapo(d, medio) - 0.085 + comba, a, yCapo(d, a) - 0.085);
    f.closePath();
  };
}

function perfilTecho(d) {
  return (f) => {
    const medio = (d.parabrisasAlto + d.techoTras) / 2;
    // Arranca 5 mm por debajo del vidrio para taparlo sin compartir cara con él.
    f.moveTo(d.parabrisasAlto, d.techo - 0.005);
    f.quadraticCurveTo(medio, d.techo - 0.005 + 2 * COMBA, d.techoTras, d.techo - 0.005);
    f.lineTo(d.techoTras, d.techo + 0.055);
    f.quadraticCurveTo(medio, d.techo + 0.055 + 2 * COMBA, d.parabrisasAlto, d.techo + 0.055);
    f.closePath();
  };
}

// La pieza trasera del medio: baúl en el sedán, compuerta en hatchback y
// SUV (la chapa de abajo; el vidrio va aparte), compuerta del platón en la
// camioneta. Las tres se registran como 'baul' para que el registro y la
// nómina no cambien; el nombre en pantalla lo pone carrocerias.js.
function perfilTrasera(d) {
  return (f) => {
    if (d.tipo === 'sedan') {
      f.moveTo(d.baulDel, d.cintura + 0.05);
      f.lineTo(d.baulTras, d.cintura + 0.01);
      f.lineTo(d.baulTras, d.piso + 0.52);
      f.lineTo(d.baulDel, d.piso + 0.52);
    } else if (d.tipo === 'camioneta') {
      // Del borde del bómper bajo hasta la cintura: la compuerta de un platón
      // mide casi medio metro.
      f.moveTo(d.compuertaZ - 0.08, d.piso + 0.2);
      f.lineTo(d.compuertaZ, d.piso + 0.2);
      f.lineTo(d.compuertaZ, d.cintura - 0.01);
      f.lineTo(d.compuertaZ - 0.08, d.cintura - 0.01);
    } else {
      // Ligeramente inclinada: arriba (en el vidrio) está 2 cm más adentro.
      f.moveTo(d.compuertaZ - 0.06, d.piso + 0.5);
      f.lineTo(d.compuertaZ + 0.02, d.piso + 0.5);
      f.lineTo(d.compuertaZ, d.compuertaArriba);
      f.lineTo(d.compuertaZ - 0.08, d.compuertaArriba);
    }
    f.closePath();
  };
}

function perfilBomperDelantero(d) {
  return (f) => {
    f.moveTo(d.bomperDel, d.piso);
    f.lineTo(d.bomperDel, d.piso + 0.5);
    f.lineTo(d.punta + 0.09, d.piso + 0.5);
    f.lineTo(d.punta + 0.01, d.piso + 0.36);
    f.lineTo(d.punta, d.piso + 0.1);
    f.lineTo(d.punta + 0.05, d.piso);
    f.closePath();
  };
}

function perfilBomperTrasero(d) {
  return (f) => {
    if (d.tipo === 'camioneta') {
      // Bómper bajo y sencillo, como el de una camioneta de trabajo.
      f.moveTo(d.bomperTras, d.piso - 0.06);
      f.lineTo(d.bomperTras, d.piso + 0.26);
      f.lineTo(d.cola - 0.07, d.piso + 0.26);
      f.lineTo(d.cola, d.piso + 0.12);
      f.lineTo(d.cola - 0.04, d.piso - 0.06);
    } else {
      f.moveTo(d.bomperTras, d.piso);
      f.lineTo(d.bomperTras, d.piso + 0.5);
      f.lineTo(d.cola - 0.09, d.piso + 0.5);
      f.lineTo(d.cola - 0.01, d.piso + 0.36);
      f.lineTo(d.cola, d.piso + 0.1);
      f.lineTo(d.cola - 0.05, d.piso);
    }
    f.closePath();
  };
}

// El bloque oscuro de adelante sigue la pendiente del capó por debajo, pero
// 30 cm más abajo: entre él y el capó queda el vano del motor (la bandeja
// pintada y el motor), que se ve al abrir el capó.
function perfilNucleoDelantero(d) {
  return (f) => {
    f.moveTo(d.bomperDel, d.radioRueda);
    f.lineTo(d.bomperDel, d.piso + 0.2);
    f.lineTo(d.capoTras, d.cintura - 0.36);
    f.lineTo(d.capoTras, d.radioRueda);
    f.closePath();
  };
}

// ---- Piezas que no son perfiles ----

// La rueda: llanta negra, rin oscuro y cinco rayos claros con su copa. Se
// arma con el eje vertical (como nace el cilindro) y al final se acuesta
// 90° sobre Z para que el eje quede a lo ancho del carro.
function rueda(d, x, z) {
  const grupo = new THREE.Group();
  const radioRin = d.radioRueda - 0.11;
  const llanta = new THREE.Mesh(
    new THREE.CylinderGeometry(d.radioRueda, d.radioRueda, 0.22, 28),
    new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9, metalness: 0 }),
  );
  const rin = new THREE.Mesh(
    new THREE.CylinderGeometry(radioRin, radioRin, 0.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 }),
  );
  grupo.add(llanta, rin);
  for (let i = 0; i < 5; i++) {
    const pivote = new THREE.Group();
    const rayo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.23, radioRin - 0.02), materialCromo());
    rayo.position.z = (radioRin - 0.02) / 2;
    pivote.add(rayo);
    pivote.rotation.y = (i * 2 * Math.PI) / 5;
    grupo.add(pivote);
  }
  grupo.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.235, 16), materialCromo()));
  grupo.rotation.z = Math.PI / 2;
  grupo.position.set(x, d.radioRueda, z);
  grupo.name = 'rueda';
  return grupo;
}

// Un pilar es una caja inclinada que une dos puntos del perfil de la cabina.
function pilar(x, s1, y1, s2, y2) {
  const largo = Math.hypot(s2 - s1, y2 - y1);
  const malla = new THREE.Mesh(new THREE.BoxGeometry(0.05, largo, 0.07), materialNegro());
  malla.position.set(x, (y1 + y2) / 2, (s1 + s2) / 2);
  malla.rotation.x = Math.atan2(s2 - s1, y2 - y1);
  return malla;
}

// `inclinacion` (radianes sobre X) acuesta la luz o la placa sobre la cara
// inclinada del bómper, para que no quede flotando por arriba ni enterrada
// por abajo.
function luz(x, y, z, ancho, alto, color, inclinacion = 0) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const malla = caja(ancho, alto, 0.05, material, x, y, z);
  malla.rotation.x = inclinacion;
  malla.name = 'luz';
  return malla;
}

// La placa colombiana: fondo amarillo y el número en negro, pintados en un
// canvas que se pega como textura. Sin número (o en Node, donde no hay
// canvas) queda la placa amarilla lisa de siempre.
function materialPlaca(texto) {
  // Amarillo más claro que antes y con algo de luz propia (emissive): la
  // placa queda en la sombra del bomper y se veía apagada. Joan pidió que
  // se viera más clara (15-oct-2026).
  const AMARILLO = '#ffd83d';
  const liso = { color: 0xffd83d, roughness: 0.5, emissive: 0xffd83d, emissiveIntensity: 0.35 };
  if (!texto || typeof document === 'undefined') return new THREE.MeshStandardMaterial(liso);
  // El doble de resolución que antes: de cerca las letras se veían borrosas.
  const lienzo = document.createElement('canvas');
  lienzo.width = 680;
  lienzo.height = 300;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = AMARILLO;
  ctx.fillRect(0, 0, 680, 300);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 14;
  ctx.strokeRect(12, 12, 656, 276);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 200px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 340, 158);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  // Solo la cara que mira hacia afuera lleva el número; las otras cinco
  // caras de la caja van amarillas lisas. La cara con número también
  // emite su propia textura: así el negro sigue negro y el amarillo no
  // se apaga en la sombra.
  const frente = new THREE.MeshStandardMaterial({ map: textura, roughness: 0.5, emissive: 0xffffff, emissiveMap: textura, emissiveIntensity: 0.35 });
  return { frente, lados: new THREE.MeshStandardMaterial(liso) };
}

// `mirandoA` es +1 cuando la cara con el número mira hacia +Z (la placa de
// atrás) y -1 cuando mira hacia -Z (la de adelante).
function placa(x, y, z, inclinacion = 0, texto = '', mirandoA = -1) {
  const material = materialPlaca(texto);
  let materiales = material;
  if (material.frente) {
    // Orden de caras de BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
    const l = material.lados;
    materiales = mirandoA > 0 ? [l, l, l, l, material.frente, l] : [l, l, l, l, l, material.frente];
  }
  // 33 × 15 cm: la placa colombiana real mide 33 × 16; un poco más alta
  // que antes para que el número se lea desde más lejos.
  const malla = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.15, 0.02), materiales);
  malla.position.set(x, y, z);
  malla.rotation.x = inclinacion;
  malla.name = 'placa';
  return malla;
}

// Cambia la tinta de una pieza marcada. `acento` en null la devuelve a su
// color. El cambio es a propósito moderado (mitad de camino hacia el
// acento más un brillo leve): la pieza tiene que seguir pareciendo parte
// del carro, pero distinguirse de un vistazo.
export function resaltar(malla, acento) {
  const material = malla.material;
  const base = malla.userData.colorBase;
  if (acento == null) {
    material.color.copy(base);
    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 1;
  } else {
    material.color.copy(base).lerp(new THREE.Color(acento), 0.5);
    material.emissive.set(acento);
    material.emissiveIntensity = 0.18;
  }
}

// ---- Vidrios: un panel por ventana ----
//
// Antes la cabina era un solo bloque translúcido. Al abrir una puerta, su
// ventana tiene que irse con ella: por eso cada ventana es un panel aparte,
// y el parabrisas y el vidrio trasero son losas inclinadas. Ninguno se
// pinta ni se toca (el dedo no los atraviesa: parar el rayo evita marcar la
// puerta del otro lado).

// Una losa de vidrio entre dos puntos del perfil (z1,y1) y (z2,y2), de
// `ancho` a lo ancho del carro: como un pilar, pero ancha y delgada.
function vidrioPlano(z1, y1, z2, y2, ancho) {
  const largo = Math.hypot(z2 - z1, y2 - y1);
  const malla = new THREE.Mesh(new THREE.BoxGeometry(ancho, largo, 0.012), materialVidrio());
  malla.position.set(0, (y1 + y2) / 2, (z1 + z2) / 2);
  malla.rotation.x = Math.atan2(z2 - z1, y2 - y1);
  malla.name = 'vidrio';
  return malla;
}

// Una ventana lateral: un perfil (z, y) extruido 12 mm en la cara de la
// cabina de ese lado.
function ventanaLateral(d, lado, dibujar) {
  const xDesde = lado === 'der' ? d.anchoVidrio / 2 : -d.anchoVidrio / 2 + 0.012;
  const malla = extruirPerfil(dibujar, { xDesde, grosor: 0.012, bisel: 0, material: materialVidrio() });
  malla.name = 'vidrio';
  return malla;
}

function perfilVentanaDelantera(d) {
  return (f) => {
    const abajo = d.cintura + 0.005;
    const arriba = d.techo - 0.02;
    f.moveTo(d.puertaDel + H + 0.02, abajo);
    f.lineTo(d.puertaMedia - H - 0.01, abajo);
    f.lineTo(d.puertaMedia - H - 0.01, arriba);
    // El borde delantero baja inclinado, siguiendo el pilar del parabrisas.
    f.lineTo(d.parabrisasAlto + 0.04, arriba);
    f.closePath();
  };
}

function perfilVentanaTrasera(d) {
  return (f) => {
    const abajo = d.cintura + 0.005;
    const arriba = d.techo - 0.02;
    f.moveTo(d.puertaMedia + H + 0.01, abajo);
    f.lineTo(d.puertaTras - H - 0.02, abajo);
    f.lineTo(d.puertaTras - H - 0.02, arriba);
    f.lineTo(d.puertaMedia + H + 0.01, arriba);
    f.closePath();
  };
}

// La ventanilla fija detrás de la puerta trasera, hasta el pilar trasero
// (sedán) o hasta la compuerta (hatchback y SUV). La camioneta no tiene:
// la cabina termina justo detrás de la puerta.
function perfilVentanilla(d) {
  return (f) => {
    const abajo = d.cintura + 0.005;
    const arriba = d.techo - 0.02;
    const a = d.puertaTras + H + 0.01;
    f.moveTo(a, abajo);
    if (d.tipo === 'sedan') {
      f.lineTo(d.vidrioTras - 0.03, d.cintura + 0.02);
      f.lineTo(d.techoTras - 0.03, arriba);
    } else {
      f.lineTo(d.compuertaZ - 0.1, abajo);
      f.lineTo(d.compuertaZ - 0.08, d.compuertaArriba - 0.02);
      f.lineTo(d.techoTras - 0.03, arriba);
    }
    f.lineTo(a, arriba);
    f.closePath();
  };
}

// ---- Piezas de interior ----
//
// Lo que se pinta cuando algo se abre: la bandeja y las paredes del vano del
// motor bajo el capó, el marco de las puertas (el umbral y los pilares por
// dentro) y el piso del baúl o del platón. Son piezas del catálogo como las
// demás; solo se ven con algo abierto.

// La bandeja del vano del motor, inclinada como el capó pero 26 cm más abajo.
function perfilVanoMotor(d) {
  return (f) => {
    const a = d.capoDel + 0.06;
    const b = d.capoTras - 0.03;
    f.moveTo(a, yCapo(d, a) - 0.28);
    f.lineTo(b, yCapo(d, b) - 0.28);
    f.lineTo(b, yCapo(d, b) - 0.26);
    f.lineTo(a, yCapo(d, a) - 0.26);
    f.closePath();
  };
}

// ---- Bisagras ----
//
// Una pieza articulada cuelga de un pivote puesto en su bisagra: girar el
// pivote la abre. La geometría se corre al origen del pivote (restándole la
// bisagra) para que gire alrededor de ella y no del centro del carro. Lo
// que viaja con la pieza (la ventana y el espejo con la puerta; el vidrio,
// la placa y el alerón con la compuerta) entra en el mismo pivote.
function articular(grupo, articulaciones, id, { bisagra, eje, signo, max, referencia, mallas }) {
  const pivote = new THREE.Group();
  pivote.name = 'bisagra-' + id;
  pivote.position.set(...bisagra);
  const desplazo = new THREE.Vector3(...bisagra);
  for (const malla of mallas) {
    if (!malla) continue;
    if (malla.parent) malla.parent.remove(malla);
    // Las mallas extruidas tienen su geometría en coordenadas del carro;
    // las cajas y losas viven en `position`.
    if (malla.position.lengthSq() === 0 && malla.rotation.x === 0 && malla.rotation.y === 0) {
      malla.geometry.translate(-desplazo.x, -desplazo.y, -desplazo.z);
    } else {
      malla.position.sub(desplazo);
    }
    pivote.add(malla);
  }
  grupo.add(pivote);
  articulaciones.set(id, {
    pivote,
    eje,
    signo,
    max,
    referencia: new THREE.Vector3(...referencia),
    get angulo() {
      return Math.abs(pivote.rotation[eje]);
    },
    fijar(angulo) {
      pivote.rotation[eje] = signo * Math.max(0, Math.min(max, angulo));
    },
  });
}

// Construye el carro. Sin argumentos es el sedán original; con `carroceria`
// y `medidas` (del catálogo) sale el tipo y el tamaño de la línea del
// cliente. Devuelve las piezas pintables (`seleccionables`, `porId`) y las
// bisagras (`articulaciones`: puertas, capó, baúl o compuerta).
export function construirCarro({ colorBase = 0xcfd4da, carroceria = 'sedan', medidas, placa: numeroPlaca = '', ajustes = {} } = {}) {
  const d = disposicion(carroceria, medidas, ajustes);
  const grupo = new THREE.Group();
  grupo.name = 'carro';
  const base = new THREE.Color(colorBase);
  const seleccionables = [];
  const porId = new Map();
  const articulaciones = new Map();

  // Cada pieza pintable lleva su propio material: así se tiñe una sin
  // teñir a las demás. Las de interior nacen con su tono claro y mate; el
  // color base que guarda cada pieza es el de su propio material, para que
  // al quitarle la marca vuelva a su tono y no al de la chapa.
  function registrar(id, malla) {
    if (!PIEZAS_POR_ID.has(id)) throw new Error('Pieza fuera del catálogo: ' + id);
    if (esInterior(id)) malla.material = materialInterior(base);
    malla.name = id;
    malla.userData.piezaId = id;
    malla.userData.colorBase = malla.material.color.clone();
    seleccionables.push(malla);
    porId.set(id, malla);
    grupo.add(malla);
    return malla;
  }

  // Una malla más de la misma pieza (las paredes del vano con su bandeja):
  // comparte material, así se tiñe junta, y responde al toque con el mismo id.
  function acompanar(id, malla) {
    malla.material = porId.get(id).material;
    malla.userData.piezaId = id;
    malla.name = id;
    grupo.add(malla);
    return malla;
  }

  function panelLateral(id, perfil, lado) {
    const xDesde = lado === 'der' ? d.medio : -d.medio + CHAPA;
    return registrar(id, extruirPerfil(perfil, { xDesde, grosor: CHAPA, material: materialPintura(base) }));
  }

  function panelAncho(id, perfil, { bisel = BISEL, biselHaciaAdentro = false, ancho = d.ancho } = {}) {
    return registrar(
      id,
      extruirPerfil(perfil, { xDesde: ancho / 2, grosor: ancho, bisel, biselHaciaAdentro, material: materialPintura(base) }),
    );
  }

  panelAncho('capo', perfilCapo(d));
  panelAncho('techo', perfilTecho(d), { ancho: d.anchoTecho });
  panelAncho('baul', perfilTrasera(d), d.tipo === 'sedan' ? {} : { ancho: d.ancho - 0.02 });
  panelAncho('bomper-del', perfilBomperDelantero(d), { bisel: 0.03, biselHaciaAdentro: true });
  panelAncho('bomper-tras', perfilBomperTrasero(d), { bisel: 0.03, biselHaciaAdentro: true });

  // Las zonas de afinado de las puntas y las mallas que se afinan al final
  // (las que llegan hasta el frente o hasta la cola). Las luces, que no son
  // simétricas, se acercan al eje por su posición.
  const zonaDel = { inicio: d.ejeDel - 0.25, punta: d.punta, factor: 0.86 };
  const zonaTras = { inicio: d.ejeTras + 0.25, punta: d.cola, factor: d.tipo === 'camioneta' ? 0.95 : 0.9 };
  const afinarDel = [porId.get('bomper-del'), porId.get('capo')];
  const afinarTras = [porId.get('bomper-tras'), porId.get('baul')];
  const luces = [];

  // El vano del motor: la bandeja pintada bajo el capó, sus dos paredes
  // (los guardafangos por dentro) y el torpedo; encima, el motor en negro.
  const vanoMotor = registrar(
    'vano-motor',
    extruirPerfil(perfilVanoMotor(d), { xDesde: (d.anchoNucleo - 0.04) / 2, grosor: d.anchoNucleo - 0.04, bisel: 0, material: materialPintura(base) }),
  );
  afinarDel.push(vanoMotor);
  const altoVano = 0.19;
  const largoVano = d.capoTras - d.capoDel - 0.09;
  const zVano = (d.capoDel + 0.06 + d.capoTras - 0.03) / 2;
  const yVano = yCapo(d, zVano) - 0.27 + altoVano / 2;
  for (const signo of [-1, 1]) {
    afinarDel.push(acompanar('vano-motor', caja(0.02, altoVano, largoVano, materialPintura(base), signo * (d.anchoNucleo / 2 - 0.03), yVano, zVano)));
  }
  acompanar('vano-motor', caja(d.anchoNucleo - 0.04, altoVano, 0.02, materialPintura(base), 0, yVano, d.capoTras - 0.04));
  grupo.add(decorativo(caja(0.9, 0.2, Math.min(0.8, largoVano - 0.2), materialPlastico(), 0, yCapo(d, zVano) - 0.26 + 0.1, zVano + 0.05)));

  const espejo = d.tipo === 'camioneta' ? [0.12, 0.1, 0.2] : [0.1, 0.08, 0.16];
  const puertas = { izq: {}, der: {} }; // lo que viaja con cada puerta
  for (const lado of ['izq', 'der']) {
    panelLateral('guardafango-del-' + lado, perfilGuardafangoDelantero(d), lado);
    const puertaDel = panelLateral('puerta-del-' + lado, perfilPuerta(d, d.puertaDel, d.puertaMedia), lado);
    const puertaTras = panelLateral('puerta-tras-' + lado, perfilPuerta(d, d.puertaMedia, d.puertaTras), lado);
    panelLateral('costado-' + lado, perfilCostado(d), lado);
    panelLateral('estribo-' + lado, perfilEstribo(d), lado);
    afinarDel.push(porId.get('guardafango-del-' + lado));
    afinarTras.push(porId.get('costado-' + lado));

    const signo = lado === 'der' ? 1 : -1;
    const zEspejo = d.puertaDel + 0.18;
    const espejoMalla = registrar('espejo-' + lado, caja(...espejo, materialPintura(base), signo * (d.medio + 0.07), d.cintura + 0.07, zEspejo));
    const baseEspejo = caja(0.09, 0.03, 0.06, materialNegro(), signo * (d.medio - 0.02), d.cintura + 0.035, zEspejo);
    grupo.add(baseEspejo);

    grupo.add(rueda(d, signo * d.ruedaX, d.ejeDel));
    grupo.add(rueda(d, signo * d.ruedaX, d.ejeTras));

    const xPilar = signo * (d.anchoVidrio / 2 + 0.005);
    grupo.add(pilar(xPilar, d.capoTras, d.cintura, d.parabrisasAlto, d.techo));
    grupo.add(pilar(xPilar, d.puertaMedia + 0.01, d.cintura, d.puertaMedia + 0.01, d.techo + COMBA));
    if (d.tipo === 'sedan') {
      grupo.add(pilar(xPilar, d.techoTras, d.techo, d.vidrioTras, d.cintura + 0.02));
    } else if (d.tipo === 'camioneta') {
      grupo.add(pilar(xPilar, d.cabinaTras - 0.01, d.cintura, d.cabinaTras - 0.01, d.techo));
    } else {
      grupo.add(pilar(xPilar, d.techoTras, d.techo, d.compuertaZ, d.compuertaArriba));
    }

    // Las ventanas: la de cada puerta viaja con su puerta; la ventanilla
    // trasera es fija.
    const ventanaDel = ventanaLateral(d, lado, perfilVentanaDelantera(d));
    const ventanaTras = ventanaLateral(d, lado, perfilVentanaTrasera(d));
    grupo.add(ventanaDel, ventanaTras);
    if (d.tipo !== 'camioneta') grupo.add(ventanaLateral(d, lado, perfilVentanilla(d)));

    // El marco de las puertas: el umbral y los pilares vistos desde afuera
    // con las puertas abiertas. Una pared pintada detrás de las puertas.
    registrar(
      'marco-' + lado,
      caja(0.02, d.cintura - d.estriboAlto - 0.02, d.puertaTras - d.puertaDel - 0.02, materialPintura(base), signo * (d.medio - 0.13), (d.cintura + d.estriboAlto) / 2, (d.puertaDel + d.puertaTras) / 2),
    );

    // La base de las puertas: la losa horizontal del umbral, desde el marco
    // hasta casi el borde del estribo, 6 mm por encima de él (como la
    // chapa del umbral real). Con las puertas cerradas queda dentro del
    // panel; abiertas, es la franja clara donde uno pisa al entrar. Antes
    // ahí se veía el piso a través del hueco entre el marco y el estribo.
    registrar(
      'base-puertas-' + lado,
      caja(0.115, 0.03, d.puertaTras - d.puertaDel - 0.02, materialPintura(base), signo * (d.medio - 0.0675), d.estriboAlto - 0.009, (d.puertaDel + d.puertaTras) / 2),
    );

    // La cara interior de cada puerta: una lámina pegada por dentro del
    // panel, que gira con él y se pinta aparte.
    const xInterior = signo * (d.medio - CHAPA - 0.008);
    const puertaDelInt = registrar(
      'puerta-del-' + lado + '-int',
      caja(0.012, d.cintura - d.estriboAlto - 0.07, d.puertaMedia - d.puertaDel - 0.08, materialPintura(base), xInterior, (d.cintura + d.estriboAlto) / 2 - 0.005, (d.puertaDel + d.puertaMedia) / 2),
    );
    const puertaTrasInt = registrar(
      'puerta-tras-' + lado + '-int',
      caja(0.012, d.cintura - d.estriboAlto - 0.07, d.puertaTras - d.puertaMedia - 0.08, materialPintura(base), xInterior, (d.cintura + d.estriboAlto) / 2 - 0.005, (d.puertaMedia + d.puertaTras) / 2),
    );

    // Detalles del costado: la moldura negra en la cintura (donde la chapa
    // encuentra el vidrio), las manijas cromadas de las dos puertas y, en
    // SUV y camioneta, los pasarruedas y el faldón negro bajo las puertas.
    const xFuera = signo * (d.medio + 0.005);
    const molduraDel = decorativo(caja(0.015, 0.03, d.puertaMedia - d.puertaDel - 0.02, materialPlastico(), xFuera, d.cintura + 0.004, (d.puertaDel + d.puertaMedia) / 2));
    const molduraTras = decorativo(caja(0.015, 0.03, d.puertaTras - d.puertaMedia - 0.02, materialPlastico(), xFuera, d.cintura + 0.004, (d.puertaMedia + d.puertaTras) / 2));
    grupo.add(molduraDel, molduraTras);
    const manijaDel = decorativo(caja(0.025, 0.028, 0.13, materialCromo(), signo * (d.medio + 0.01), d.cintura - 0.15, d.puertaDel + (d.puertaMedia - d.puertaDel) * 0.72));
    const manijaTras = decorativo(caja(0.025, 0.028, 0.13, materialCromo(), signo * (d.medio + 0.01), d.cintura - 0.15, d.puertaMedia + (d.puertaTras - d.puertaMedia) * 0.72));
    grupo.add(manijaDel, manijaTras);
    if (d.tipo === 'suv' || d.tipo === 'camioneta') {
      const xDesde = lado === 'der' ? d.medio + 0.035 : -d.medio + 0.015;
      for (const eje of [d.ejeDel, d.ejeTras]) {
        const aro = decorativo(extruirPerfil(perfilPasarrueda(d, eje), { xDesde, grosor: 0.05, bisel: 0, material: materialPlastico() }));
        grupo.add(aro);
        (eje === d.ejeDel ? afinarDel : afinarTras).push(aro);
      }
      grupo.add(decorativo(caja(0.02, 0.07, d.puertaTras - d.puertaDel - 0.02, materialPlastico(), xFuera, d.estriboAlto + 0.045, (d.puertaDel + d.puertaTras) / 2)));
    }

    puertas[lado] = {
      signo,
      delantera: [puertaDel, puertaDelInt, ventanaDel, espejoMalla, baseEspejo, molduraDel, manijaDel],
      trasera: [puertaTras, puertaTrasInt, ventanaTras, molduraTras, manijaTras],
    };
  }

  // Las caras interiores del capó y de la pieza trasera.
  const capoInt = registrar(
    'capo-int',
    extruirPerfil(perfilCapoInterior(d), { xDesde: (d.ancho - 0.16) / 2, grosor: d.ancho - 0.16, bisel: 0, material: materialPintura(base) }),
  );
  afinarDel.push(capoInt);
  let baulInt;
  if (d.tipo === 'sedan') {
    baulInt = registrar('baul-int', caja(d.ancho - 0.3, 0.012, d.baulTras - d.baulDel - 0.06, materialPintura(base), 0, d.piso + 0.51, (d.baulDel + d.baulTras) / 2));
  } else if (d.tipo === 'camioneta') {
    baulInt = registrar('baul-int', caja(d.ancho - 0.3, d.cintura - 0.01 - (d.piso + 0.2) - 0.06, 0.012, materialPintura(base), 0, (d.cintura - 0.01 + d.piso + 0.2) / 2, d.compuertaZ - 0.088));
  } else {
    baulInt = registrar('baul-int', caja(d.ancho - 0.3, d.compuertaArriba - (d.piso + 0.5) - 0.06, 0.012, materialPintura(base), 0, (d.compuertaArriba + d.piso + 0.5) / 2, d.compuertaZ - 0.075));
  }
  afinarTras.push(baulInt);

  // Parabrisas, vidrio trasero y el forro oscuro bajo el techo.
  grupo.add(vidrioPlano(d.capoTras, d.cintura, d.parabrisasAlto, d.techo, d.anchoVidrio - 0.02));
  let vidrioTrasero = null;
  if (d.tipo === 'sedan') {
    grupo.add(vidrioPlano(d.techoTras, d.techo, d.vidrioTras, d.cintura + 0.02, d.anchoVidrio - 0.02));
  } else if (d.tipo === 'camioneta') {
    grupo.add(vidrioPlano(d.techoTras, d.techo - 0.02, d.cabinaTras, d.cintura, d.anchoVidrio - 0.02));
  } else {
    vidrioTrasero = vidrioPlano(d.techoTras, d.techo, d.compuertaZ, d.compuertaArriba, d.anchoVidrio - 0.06);
    grupo.add(vidrioTrasero);
  }
  const finCabina = d.tipo === 'camioneta' ? d.cabinaTras : d.techoTras;
  const forro = caja(d.anchoVidrio - 0.06, 0.015, finCabina - d.parabrisasAlto - 0.08, materialPlastico(), 0, d.techo - 0.012, (d.parabrisasAlto + finCabina) / 2);
  // Relleno: no se ve desde afuera. Lo marca para que el escaneo no le
  // reparta puntos (escaneo.js, muestrasDelGenerico): a 1 cm del techo,
  // se robaba la mitad del techo escaneado y lo dejaba como "nada".
  forro.userData.relleno = true;
  grupo.add(forro);

  // Bajo el capó, el bloque oscuro del motor baja hasta la bandeja; su
  // frente sigue la pendiente del capó.
  const nucleoDelantero = extruirPerfil(perfilNucleoDelantero(d), { xDesde: d.anchoNucleo / 2, grosor: d.anchoNucleo, bisel: 0, material: materialNegro() });
  nucleoDelantero.userData.relleno = true;
  grupo.add(nucleoDelantero);
  afinarDel.push(nucleoDelantero);

  // El bloque del medio llena el carro bajo la cintura; lo que haya detrás
  // depende de la carrocería (el baúl, la cola del hatchback o el platón).
  const bloque = (desde, hasta, arriba) => {
    const b = caja(d.anchoNucleo, arriba - d.radioRueda, hasta - desde, materialNegro(), 0, (arriba + d.radioRueda) / 2, (desde + hasta) / 2);
    b.userData.relleno = true;
    grupo.add(b);
    afinarTras.push(b);
    return b;
  };
  // El piso del baúl (o de la compuerta, o del platón): pintado, y por
  // debajo el bloque oscuro que lo sostiene.
  function pisoPintado(desde, hasta, y, ancho = d.anchoNucleo - 0.06) {
    const p = registrar('vano-baul', caja(ancho, 0.02, hasta - desde - 0.08, materialPintura(base), 0, y, (desde + hasta) / 2));
    afinarTras.push(p);
    return p;
  }
  if (d.tipo === 'sedan') {
    bloque(d.capoTras, d.baulDel, d.cintura - 0.01);
    bloque(d.baulDel, d.bomperTras, d.piso + 0.36);
    pisoPintado(d.baulDel, d.bomperTras, d.piso + 0.37);
  } else if (d.tipo === 'camioneta') {
    bloque(d.capoTras, d.cabinaTras, d.cintura - 0.01);
    // El platón: el piso de carga va más bajo que los costados, para que
    // desde arriba se vea que es una caja abierta.
    bloque(d.platonDel, d.finCostado, d.cintura - 0.28);
    pisoPintado(d.platonDel, d.finCostado, d.cintura - 0.27);
  } else {
    bloque(d.capoTras, d.puertaTras + 0.15, d.cintura - 0.01);
    bloque(d.puertaTras + 0.15, d.finCostado, d.cintura - 0.38);
    pisoPintado(d.puertaTras + 0.15, d.finCostado, d.cintura - 0.37);
    // El umbral de la compuerta, pintado, cierra el vano por atrás.
    afinarTras.push(acompanar('vano-baul', caja(d.anchoNucleo - 0.06, 0.1, 0.02, materialPintura(base), 0, d.cintura - 0.32, d.compuertaZ - 0.1)));
  }

  // Sillas y tablero: un bloque oscuro dentro de la cabina para que el
  // vidrio no deje ver un carro hueco. Arranca medio metro detrás de la base
  // del parabrisas, donde el vidrio ya va alto, y termina antes del vidrio
  // trasero (o de la pared de la cabina): un bloque más largo asomaba como
  // una franja negra a través del vidrio.
  const interiorDesde = d.puertaDel + 0.5;
  const interiorHasta = Math.min(d.puertaDel + 2.0, (d.tipo === 'camioneta' ? d.cabinaTras : d.techoTras + 0.1) - 0.05);
  const interior = caja(d.ancho - 0.4, 0.22, interiorHasta - interiorDesde, materialNegro(), 0, d.cintura + 0.11, (interiorDesde + interiorHasta) / 2);
  interior.name = 'interior';
  grupo.add(interior);

  // Lo que distingue la silueta de cada carrocería desde lejos: las barras
  // del techo de la SUV, y el alerón sobre la compuerta en hatchback y SUV.
  if (d.tipo === 'suv') {
    const largoBarra = (d.techoTras - d.parabrisasAlto) * 0.72;
    const zBarra = (d.parabrisasAlto + d.techoTras) / 2 + 0.05;
    for (const signo of [-1, 1]) {
      grupo.add(decorativo(caja(0.05, 0.05, largoBarra, materialPlastico(), signo * (d.anchoTecho / 2 - 0.09), d.techo + 0.055 + COMBA + 0.03, zBarra)));
    }
  }
  let aleron = null;
  if (d.tipo === 'suv' || d.tipo === 'hatchback') {
    aleron = decorativo(caja(d.anchoTecho - 0.2, 0.045, 0.2, materialPlastico(), 0, d.techo + 0.04, d.techoTras + 0.04));
    grupo.add(aleron);
    afinarTras.push(aleron);
  }

  // Luces, parrilla y placas, acostadas sobre la cara del bómper que las
  // lleva. Las de adelante van sobre caras inclinadas (30° la de los faros,
  // 27° la de la placa); las de atrás sobre caras casi verticales.
  // El frente de un carro de hoy: faros con una tira LED fina arriba y el
  // farol principal debajo, una parrilla grande con su barra cromada, una
  // toma de aire baja detrás de la placa, exploradores a los lados y un
  // protector cromado en el filo del bómper.
  const xLuz = d.ancho * 0.326;
  const inclinacionFaro = Math.atan2(0.08, 0.14);
  for (const signo of [-1, 1]) {
    luces.push(luz(signo * xLuz, d.piso + 0.48, d.punta + 0.03, 0.4, 0.035, 0xf4f8ff, inclinacionFaro));
    luces.push(luz(signo * xLuz, d.piso + 0.405, d.punta + 0.036, 0.26, 0.1, 0xfff1cc, inclinacionFaro));
    luces.push(decorativo(caja(0.16, 0.09, 0.03, materialPlastico(), signo * d.ancho * 0.36, d.piso + 0.2, d.punta - 0.005)));
  }
  const parrilla = caja(0.9, 0.2, 0.04, materialNegro(), 0, d.piso + 0.24, d.punta - 0.015);
  parrilla.name = 'parrilla';
  grupo.add(parrilla);
  afinarDel.push(parrilla);
  const barra = decorativo(caja(0.96, 0.03, 0.03, materialCromo(), 0, d.piso + 0.355, d.punta - 0.012));
  grupo.add(barra);
  afinarDel.push(barra);
  const tomaDeAire = decorativo(caja(1.0, 0.11, 0.03, materialPlastico(), 0, d.piso + 0.1, d.punta + 0.002));
  grupo.add(tomaDeAire);
  afinarDel.push(tomaDeAire);
  const protector = decorativo(caja(1.0, 0.035, 0.03, materialCromo(), 0, d.piso + 0.025, d.punta - 0.008));
  grupo.add(protector);
  afinarDel.push(protector);

  // El "techo flotante": un canal oscuro a lo largo del borde del techo, por
  // encima de las puertas, que separa el techo de la chapa como en las SUV
  // de ahora.
  const finTecho = d.tipo === 'camioneta' ? d.techoTras : d.techoTras;
  for (const signo of [-1, 1]) {
    grupo.add(decorativo(caja(0.03, 0.03, finTecho - d.parabrisasAlto - 0.04, materialPlastico(), signo * (d.anchoTecho / 2 + 0.005), d.techo + 0.02, (d.parabrisasAlto + finTecho) / 2)));
  }
  grupo.add(placa(0, d.piso + 0.1, d.punta - 0.005, -Math.atan2(0.05, 0.1), numeroPlaca, -1));
  let placaTrasera;
  let barraLuz = null;
  if (d.tipo === 'sedan') {
    luces.push(luz(-xLuz, d.piso + 0.59, d.cola - 0.195, 0.38, 0.09, 0xe0262e));
    luces.push(luz(xLuz, d.piso + 0.59, d.cola - 0.195, 0.38, 0.09, 0xe0262e));
    placaTrasera = placa(0, d.piso + 0.3, d.cola + 0.007, 0, numeroPlaca, 1);
  } else if (d.tipo === 'camioneta') {
    // Las luces van en las esquinas del platón y la placa en la compuerta.
    luces.push(luz(-(d.medio - 0.2), d.cintura - 0.3, d.compuertaZ + 0.03, 0.14, 0.3, 0xe0262e));
    luces.push(luz(d.medio - 0.2, d.cintura - 0.3, d.compuertaZ + 0.03, 0.14, 0.3, 0xe0262e));
    placaTrasera = placa(0, d.piso + 0.5, d.compuertaZ + 0.025, 0, numeroPlaca, 1);
  } else {
    luces.push(luz(-xLuz, d.piso + 0.62, d.compuertaZ + 0.03, 0.34, 0.1, 0xe0262e));
    luces.push(luz(xLuz, d.piso + 0.62, d.compuertaZ + 0.03, 0.34, 0.1, 0xe0262e));
    // La barra de luz que une los dos stops, en la compuerta, de un lado a
    // otro: un sello de las SUV recientes. Viaja con la compuerta.
    barraLuz = luz(0, d.piso + 0.66, d.compuertaZ + 0.028, d.ancho - 0.9, 0.025, 0xa8151c);
    grupo.add(barraLuz);
    afinarTras.push(barraLuz);
    placaTrasera = placa(0, d.piso + 0.82, d.compuertaZ + 0.03, 0, numeroPlaca, 1);
  }
  grupo.add(placaTrasera);

  // Afinar las puntas: las mallas simétricas por su geometría; las luces y
  // los exploradores, que están a un lado, acercándolos al eje. Va ANTES de
  // las bisagras: el afinado se calcula con la z en el carro, y al colgar
  // una pieza de su bisagra la geometría cambia de origen.
  for (const malla of afinarDel) afinarMalla(malla, zonaDel);
  for (const malla of afinarTras) afinarMalla(malla, zonaTras);
  for (const malla of luces) {
    const zona = malla.position.z < 0 ? zonaDel : zonaTras;
    malla.position.x *= kEn(malla.position.z, zona);
    grupo.add(malla);
  }

  // ---- Bisagras ----
  // Puertas: giran sobre la vertical en su borde delantero, hacia afuera.
  // Capó: sobre su borde trasero, levantando el frente. Baúl del sedán:
  // sobre su borde delantero. Compuerta de hatchback y SUV: sobre el fin
  // del techo, con su vidrio, su placa y su alerón. Compuerta del platón:
  // sobre su borde de abajo, cayendo hacia atrás.
  for (const lado of ['izq', 'der']) {
    const { signo, delantera, trasera } = puertas[lado];
    const yBisagra = (d.estriboAlto + d.cintura) / 2;
    articular(grupo, articulaciones, 'puerta-del-' + lado, {
      bisagra: [signo * d.medio, yBisagra, d.puertaDel + H],
      eje: 'y',
      signo,
      max: 1.05,
      referencia: [0, 0, d.puertaMedia - d.puertaDel - 2 * H],
      mallas: delantera,
    });
    articular(grupo, articulaciones, 'puerta-tras-' + lado, {
      bisagra: [signo * d.medio, yBisagra, d.puertaMedia + H],
      eje: 'y',
      signo,
      max: 1.05,
      referencia: [0, 0, d.puertaTras - d.puertaMedia - 2 * H],
      mallas: trasera,
    });
  }
  articular(grupo, articulaciones, 'capo', {
    bisagra: [0, yCapo(d, d.capoTras) - 0.035, d.capoTras],
    eje: 'x',
    signo: 1,
    max: 0.8,
    referencia: [0, 0, -(d.capoTras - d.capoDel)],
    mallas: [porId.get('capo'), capoInt],
  });
  if (d.tipo === 'sedan') {
    articular(grupo, articulaciones, 'baul', {
      bisagra: [0, d.cintura + 0.03, d.baulDel],
      eje: 'x',
      signo: -1,
      max: 1.0,
      referencia: [0, 0, d.baulTras - d.baulDel],
      mallas: [porId.get('baul'), baulInt],
    });
  } else if (d.tipo === 'camioneta') {
    articular(grupo, articulaciones, 'baul', {
      bisagra: [0, d.piso + 0.2, d.compuertaZ - 0.04],
      eje: 'x',
      signo: 1,
      max: 1.5,
      referencia: [0, d.cintura - 0.01 - (d.piso + 0.2), 0],
      mallas: [porId.get('baul'), baulInt, placaTrasera],
    });
  } else {
    articular(grupo, articulaciones, 'baul', {
      bisagra: [0, d.techo, d.techoTras],
      eje: 'x',
      signo: -1,
      max: 1.2,
      referencia: [0, -(d.techo - (d.piso + 0.5)), d.compuertaZ - d.techoTras],
      mallas: [porId.get('baul'), baulInt, vidrioTrasero, placaTrasera, aleron, barraLuz],
    });
  }

  grupo.updateMatrixWorld(true);
  return { grupo, seleccionables, porId, articulaciones, disposicion: d };
}
