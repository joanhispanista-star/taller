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
import { PIEZAS_POR_ID } from './piezas.js';
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
export function disposicion(carroceria, medidas) {
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
  d.techo = m.alto - 0.055; // cara inferior del techo; el panel mide 5,5 cm

  if (tipo === 'sedan') {
    d.piso = 0.3; // la chapa empieza a 30 cm del suelo
    d.estriboAlto = 0.42;
    d.radioRueda = 0.32;
    d.arco = 0.4; // radio del pase de rueda: 8 cm de aire sobre la llanta
    d.cintura = m.alto - 0.505; // donde termina la chapa y empieza el vidrio
    d.ejeDel = d.punta + (m.largo - m.entreEjes) * 0.545;
    d.ejeTras = d.ejeDel + m.entreEjes;
    d.bomperDel = d.punta + 0.23; // donde termina el bómper y empieza la chapa
    d.capoDel = d.punta + 0.25;
    d.capoTras = d.ejeDel + 0.79; // base del parabrisas
    d.puertaDel = d.capoTras - 0.04;
    d.puertaTras = d.ejeTras - 0.43;
    d.puertaMedia = d.puertaDel + (d.puertaTras - d.puertaDel) * 0.569;
    d.parabrisasAlto = d.capoTras + 0.71;
    d.techoTras = d.ejeTras - 0.2;
    d.vidrioTras = d.ejeTras + 0.26; // base del vidrio trasero
    d.baulDel = d.vidrioTras + 0.01;
    d.baulTras = d.cola - 0.22;
    d.bomperTras = d.cola - 0.23;
    d.finCostado = d.bomperTras;
  } else if (tipo === 'camioneta') {
    d.piso = 0.48;
    d.estriboAlto = 0.58;
    d.radioRueda = 0.38;
    d.arco = 0.47;
    d.cintura = m.alto - 0.68;
    // Las camionetas llevan la cabina adelante y un voladizo trasero largo.
    d.ejeDel = d.punta + (m.largo - m.entreEjes) * 0.42;
    d.ejeTras = d.ejeDel + m.entreEjes;
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
    d.piso = alta ? 0.42 : 0.3;
    d.estriboAlto = alta ? 0.52 : 0.42;
    d.radioRueda = alta ? 0.35 : 0.3;
    d.arco = alta ? 0.44 : 0.38;
    d.cintura = m.alto - (alta ? 0.6 : 0.52);
    d.ejeDel = d.punta + (m.largo - m.entreEjes) * 0.56;
    d.ejeTras = d.ejeDel + m.entreEjes;
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

function materialNegro() {
  return new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.2, roughness: 0.75 });
}

function materialVidrio() {
  return new THREE.MeshStandardMaterial({
    color: 0x24323f,
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.55,
  });
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

function perfilCapo(d) {
  return (f) => {
    f.moveTo(d.capoDel, yCapo(d, d.capoDel));
    f.lineTo(d.capoTras, yCapo(d, d.capoTras));
    f.lineTo(d.capoTras, yCapo(d, d.capoTras) - 0.07);
    f.lineTo(d.capoDel, yCapo(d, d.capoDel) - 0.07);
    f.closePath();
  };
}

function perfilTecho(d) {
  return (f) => {
    // Arranca 5 mm por debajo del vidrio para taparlo sin compartir cara con él.
    f.moveTo(d.parabrisasAlto, d.techo - 0.005);
    f.lineTo(d.techoTras, d.techo - 0.005);
    f.lineTo(d.techoTras, d.techo + 0.055);
    f.lineTo(d.parabrisasAlto, d.techo + 0.055);
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

// La cabina de vidrio: parabrisas, laterales y vidrio trasero en un solo
// volumen translúcido. No se pinta, así que no se puede seleccionar.
function perfilVidrio(d) {
  return (f) => {
    f.moveTo(d.capoTras, d.cintura);
    f.lineTo(d.parabrisasAlto, d.techo);
    f.lineTo(d.techoTras, d.techo);
    if (d.tipo === 'sedan') {
      f.lineTo(d.vidrioTras, d.cintura + 0.02);
      f.lineTo(d.vidrioTras, d.cintura);
    } else if (d.tipo === 'camioneta') {
      f.lineTo(d.cabinaTras, d.techo - 0.02);
      f.lineTo(d.cabinaTras, d.cintura);
    } else {
      f.lineTo(d.compuertaZ, d.compuertaArriba);
      f.lineTo(d.compuertaZ, d.cintura);
    }
    f.closePath();
  };
}

// El bloque oscuro de adelante sigue la pendiente del capó por debajo.
function perfilNucleoDelantero(d) {
  return (f) => {
    f.moveTo(d.bomperDel, d.radioRueda);
    f.lineTo(d.bomperDel, d.piso + 0.4);
    f.lineTo(d.capoTras, d.cintura - 0.09);
    f.lineTo(d.capoTras, d.radioRueda);
    f.closePath();
  };
}

// ---- Piezas que no son perfiles ----

function rueda(d, x, z) {
  const grupo = new THREE.Group();
  const llanta = new THREE.Mesh(
    new THREE.CylinderGeometry(d.radioRueda, d.radioRueda, 0.22, 28),
    new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9, metalness: 0 }),
  );
  const rin = new THREE.Mesh(
    new THREE.CylinderGeometry(d.radioRueda - 0.12, d.radioRueda - 0.12, 0.225, 20),
    new THREE.MeshStandardMaterial({ color: 0xc3c7cc, roughness: 0.35, metalness: 0.8 }),
  );
  // El cilindro nace vertical; girado 90° sobre Z queda con el eje a lo ancho.
  llanta.rotation.z = Math.PI / 2;
  rin.rotation.z = Math.PI / 2;
  grupo.add(llanta, rin);
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

function placa(x, y, z, inclinacion = 0) {
  const malla = caja(0.34, 0.13, 0.02, new THREE.MeshStandardMaterial({ color: 0xf2e9b4, roughness: 0.6 }), x, y, z);
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

// Construye el carro. Sin argumentos es el sedán original; con `carroceria`
// y `medidas` (del catálogo) sale el tipo y el tamaño de la línea del cliente.
export function construirCarro({ colorBase = 0xcfd4da, carroceria = 'sedan', medidas } = {}) {
  const d = disposicion(carroceria, medidas);
  const grupo = new THREE.Group();
  grupo.name = 'carro';
  const base = new THREE.Color(colorBase);
  const seleccionables = [];
  const porId = new Map();

  // Cada pieza pintable lleva su propio material: así se tiñe una sin
  // teñir a las demás.
  function registrar(id, malla) {
    if (!PIEZAS_POR_ID.has(id)) throw new Error('Pieza fuera del catálogo: ' + id);
    malla.name = id;
    malla.userData.piezaId = id;
    malla.userData.colorBase = base.clone();
    seleccionables.push(malla);
    porId.set(id, malla);
    grupo.add(malla);
    return malla;
  }

  function panelLateral(id, perfil, lado) {
    const xDesde = lado === 'der' ? d.medio : -d.medio + CHAPA;
    registrar(id, extruirPerfil(perfil, { xDesde, grosor: CHAPA, material: materialPintura(base) }));
  }

  function panelAncho(id, perfil, { bisel = BISEL, biselHaciaAdentro = false, ancho = d.ancho } = {}) {
    registrar(
      id,
      extruirPerfil(perfil, { xDesde: ancho / 2, grosor: ancho, bisel, biselHaciaAdentro, material: materialPintura(base) }),
    );
  }

  panelAncho('capo', perfilCapo(d));
  panelAncho('techo', perfilTecho(d), { ancho: d.anchoTecho });
  panelAncho('baul', perfilTrasera(d), d.tipo === 'sedan' ? {} : { ancho: d.ancho - 0.02 });
  panelAncho('bomper-del', perfilBomperDelantero(d), { bisel: 0.03, biselHaciaAdentro: true });
  panelAncho('bomper-tras', perfilBomperTrasero(d), { bisel: 0.03, biselHaciaAdentro: true });

  const espejo = d.tipo === 'camioneta' ? [0.12, 0.1, 0.2] : [0.1, 0.08, 0.16];
  for (const lado of ['izq', 'der']) {
    panelLateral('guardafango-del-' + lado, perfilGuardafangoDelantero(d), lado);
    panelLateral('puerta-del-' + lado, perfilPuerta(d, d.puertaDel, d.puertaMedia), lado);
    panelLateral('puerta-tras-' + lado, perfilPuerta(d, d.puertaMedia, d.puertaTras), lado);
    panelLateral('costado-' + lado, perfilCostado(d), lado);
    panelLateral('estribo-' + lado, perfilEstribo(d), lado);

    const signo = lado === 'der' ? 1 : -1;
    const zEspejo = d.puertaDel + 0.18;
    registrar('espejo-' + lado, caja(...espejo, materialPintura(base), signo * (d.medio + 0.07), d.cintura + 0.07, zEspejo));
    grupo.add(caja(0.09, 0.03, 0.06, materialNegro(), signo * (d.medio - 0.02), d.cintura + 0.035, zEspejo));

    grupo.add(rueda(d, signo * d.ruedaX, d.ejeDel));
    grupo.add(rueda(d, signo * d.ruedaX, d.ejeTras));

    const xPilar = signo * (d.anchoVidrio / 2 + 0.005);
    grupo.add(pilar(xPilar, d.capoTras, d.cintura, d.parabrisasAlto, d.techo));
    grupo.add(pilar(xPilar, d.puertaMedia + 0.01, d.cintura, d.puertaMedia + 0.01, d.techo));
    if (d.tipo === 'sedan') {
      grupo.add(pilar(xPilar, d.techoTras, d.techo, d.vidrioTras, d.cintura + 0.02));
    } else if (d.tipo === 'camioneta') {
      grupo.add(pilar(xPilar, d.cabinaTras - 0.01, d.cintura, d.cabinaTras - 0.01, d.techo));
    } else {
      grupo.add(pilar(xPilar, d.techoTras, d.techo, d.compuertaZ, d.compuertaArriba));
    }
  }

  // Vidrio y bloques interiores (no se pintan, no se seleccionan).
  const vidrio = extruirPerfil(perfilVidrio(d), { xDesde: d.anchoVidrio / 2, grosor: d.anchoVidrio, bisel: 0, material: materialVidrio() });
  vidrio.name = 'vidrio';
  grupo.add(vidrio);
  grupo.add(extruirPerfil(perfilNucleoDelantero(d), { xDesde: d.anchoNucleo / 2, grosor: d.anchoNucleo, bisel: 0, material: materialNegro() }));

  // El bloque del medio llena el carro bajo la cintura; lo que haya detrás
  // depende de la carrocería (el baúl, la cola del hatchback o el platón).
  const bloque = (desde, hasta, arriba) =>
    caja(d.anchoNucleo, arriba - d.radioRueda, hasta - desde, materialNegro(), 0, (arriba + d.radioRueda) / 2, (desde + hasta) / 2);
  if (d.tipo === 'sedan') {
    grupo.add(bloque(d.capoTras, d.baulDel, d.cintura - 0.01));
    grupo.add(bloque(d.baulDel, d.bomperTras, d.piso + 0.51));
  } else if (d.tipo === 'camioneta') {
    grupo.add(bloque(d.capoTras, d.cabinaTras, d.cintura - 0.01));
    // El platón: el piso de carga va más bajo que los costados, para que
    // desde arriba se vea que es una caja abierta.
    grupo.add(bloque(d.platonDel, d.finCostado, d.cintura - 0.28));
  } else {
    grupo.add(bloque(d.capoTras, d.finCostado, d.cintura - 0.01));
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

  // Luces, parrilla y placas, acostadas sobre la cara del bómper que las
  // lleva. Las de adelante van sobre caras inclinadas (30° la de los faros,
  // 27° la de la placa); las de atrás sobre caras casi verticales.
  const xLuz = d.ancho * 0.326;
  const inclinacionFaro = Math.atan2(0.08, 0.14);
  grupo.add(luz(-xLuz, d.piso + 0.425, d.punta + 0.035, 0.42, 0.11, 0xfff1cc, inclinacionFaro));
  grupo.add(luz(xLuz, d.piso + 0.425, d.punta + 0.035, 0.42, 0.11, 0xfff1cc, inclinacionFaro));
  const parrilla = caja(0.72, 0.18, 0.04, materialNegro(), 0, d.piso + 0.22, d.punta - 0.015);
  parrilla.name = 'parrilla';
  grupo.add(parrilla);
  grupo.add(placa(0, d.piso + 0.1, d.punta - 0.005, -Math.atan2(0.05, 0.1)));
  if (d.tipo === 'sedan') {
    grupo.add(luz(-xLuz, d.piso + 0.59, d.cola - 0.195, 0.38, 0.09, 0xe0262e));
    grupo.add(luz(xLuz, d.piso + 0.59, d.cola - 0.195, 0.38, 0.09, 0xe0262e));
    grupo.add(placa(0, d.piso + 0.3, d.cola + 0.007));
  } else if (d.tipo === 'camioneta') {
    // Las luces van en las esquinas del platón y la placa en la compuerta.
    grupo.add(luz(-(d.medio - 0.2), d.cintura - 0.3, d.compuertaZ + 0.03, 0.14, 0.3, 0xe0262e));
    grupo.add(luz(d.medio - 0.2, d.cintura - 0.3, d.compuertaZ + 0.03, 0.14, 0.3, 0xe0262e));
    grupo.add(placa(0, d.piso + 0.5, d.compuertaZ + 0.025));
  } else {
    grupo.add(luz(-xLuz, d.piso + 0.62, d.compuertaZ + 0.03, 0.34, 0.1, 0xe0262e));
    grupo.add(luz(xLuz, d.piso + 0.62, d.compuertaZ + 0.03, 0.34, 0.1, 0xe0262e));
    grupo.add(placa(0, d.piso + 0.82, d.compuertaZ + 0.03));
  }

  return { grupo, seleccionables, porId, disposicion: d };
}
