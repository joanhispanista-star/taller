// El sedán genérico, construido pieza por pieza.
//
// Por qué un carro dibujado por código y no un modelo escaneado o
// descargado: lo que necesita el taller es que CADA pieza pintable sea un
// objeto aparte, con su nombre, para poderla tocar y marcar. Un escaneo
// del celular (y casi todos los modelos gratuitos) llegan como una sola
// masa sin piezas. Aquí cada panel nace ya separado, con una junta visible
// entre uno y otro, como en el carro real.
//
// Medidas en metros de un sedán compacto (un Onix o un Logan mide 4,3 a
// 4,5 m de largo y 1,75 a 1,85 m de ancho). El carro mira hacia -Z: así el
// lado izquierdo, el del conductor en Colombia, queda en -X, y el nombre
// que ve el dueño en la pantalla es el que usa el pintor cuando camina
// alrededor del carro.
//
// Este módulo no toca el DOM: se construye igual en el navegador y en las
// pruebas de Node.
import * as THREE from 'three';
import { PIEZAS_POR_ID } from './piezas.js';

const ANCHO = 1.84;
const MEDIO = ANCHO / 2; // 0,92: cara exterior de la chapa
const ANCHO_VIDRIO = 1.74; // la cabina es un poco más angosta que la chapa
const ANCHO_NUCLEO = 1.68; // el bloque oscuro que rellena por dentro
const CHAPA = 0.08; // grosor de un panel lateral
const BISEL = 0.012; // redondeo de los bordes de cada pieza
// Cada borde compartido entre dos piezas se retranquea esta distancia. Con
// el bisel sumado deja una junta de unos 2,4 cm: exagerada frente a los 5 mm
// de un carro real, pero es lo que hace que las piezas se distingan en la
// pantalla de un celular.
const H = 0.012 + BISEL;

const PISO = 0.30; // la chapa empieza a 30 cm del suelo
const ESTRIBO_ALTO = 0.42;
const CINTURA = 0.95; // donde termina la chapa y empieza el vidrio
const TECHO = 1.40;
const RADIO_RUEDA = 0.32;
const ARCO = 0.40; // radio del pase de rueda: 8 cm de aire sobre la llanta
const EJE_DEL = -1.35;
const EJE_TRAS = 1.50;
const RUEDA_X = 0.80;

// Bordes a lo largo del carro (eje Z). Compartidos por los paneles laterales
// y por el bloque interior, para que todo cuadre.
const PUNTA = -2.25;
const BOMPER_DEL = -2.02; // donde termina el bómper y empieza la chapa
const CAPO_DEL = -2.00;
const CAPO_TRAS = -0.56; // base del parabrisas
const PUERTA_DEL = -0.60; // borde delantero de la puerta delantera
const PUERTA_MEDIA = 0.35; // pilar entre las dos puertas
const PUERTA_TRAS = 1.07; // borde trasero de la puerta trasera
const PARABRISAS_ALTO = 0.15;
const TECHO_TRAS = 1.30;
const VIDRIO_TRAS = 1.76; // base del vidrio trasero
const BAUL_DEL = 1.77;
const BAUL_TRAS = 2.03;
const BOMPER_TRAS = 2.02;
const COLA = 2.25;

// Línea del capó: baja de 0,95 m en la base del parabrisas a 0,80 m en la punta.
function yCapo(s) {
  return 0.80 + ((s - CAPO_DEL) * (0.95 - 0.80)) / (CAPO_TRAS - CAPO_DEL);
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
function extruirPerfil(dibujar, { xDesde, grosor, bisel = BISEL, material }) {
  const forma = new THREE.Shape();
  dibujar(forma);
  const geometria = new THREE.ExtrudeGeometry(forma, {
    depth: Math.max(0.001, grosor - 2 * bisel),
    bevelEnabled: bisel > 0,
    bevelThickness: bisel,
    bevelSize: bisel,
    bevelOffset: 0,
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

function perfilGuardafangoDelantero(f) {
  const a = BOMPER_DEL + H;
  const b = PUERTA_DEL - H;
  const abajo = RADIO_RUEDA; // el panel termina a la altura del eje; la llanta asoma por debajo
  f.moveTo(a, abajo);
  f.lineTo(EJE_DEL - ARCO, abajo);
  f.absarc(EJE_DEL, abajo, ARCO, Math.PI, 0, true); // por encima de la llanta
  f.lineTo(b, abajo);
  // El borde de arriba va 8,5 cm por debajo de la línea del capó para no
  // compartir cara con él (dos caras en el mismo plano titilan en pantalla).
  f.lineTo(b, yCapo(b) - 0.085);
  f.lineTo(a, yCapo(a) - 0.085);
  f.closePath();
}

function perfilPuerta(desde, hasta) {
  return (f) => {
    const a = desde + H;
    const b = hasta - H;
    const abajo = ESTRIBO_ALTO + H;
    const arriba = CINTURA - 0.01 - H;
    f.moveTo(a, abajo);
    f.lineTo(b, abajo);
    f.lineTo(b, arriba);
    f.lineTo(a, arriba);
    f.closePath();
  };
}

function perfilEstribo(f) {
  const a = PUERTA_DEL + H;
  const b = PUERTA_TRAS - H;
  f.moveTo(a, PISO);
  f.lineTo(b, PISO);
  f.lineTo(b, ESTRIBO_ALTO - H);
  f.lineTo(a, ESTRIBO_ALTO - H);
  f.closePath();
}

// El costado trasero rodea la llanta y sigue por debajo del baúl hasta el
// bómper: por eso tiene forma de L.
function perfilCostado(f) {
  const a = PUERTA_TRAS + H;
  const b = BOMPER_TRAS - H;
  const abajo = RADIO_RUEDA;
  f.moveTo(a, abajo);
  f.lineTo(EJE_TRAS - ARCO, abajo);
  f.absarc(EJE_TRAS, abajo, ARCO, Math.PI, 0, true);
  f.lineTo(b, abajo);
  f.lineTo(b, 0.80 - H);
  f.lineTo(BAUL_DEL - H, 0.80 - H);
  f.lineTo(BAUL_DEL - H, CINTURA - 0.01 - H);
  f.lineTo(a, CINTURA - 0.01 - H);
  f.closePath();
}

// ---- Perfiles de las piezas que cruzan el carro de lado a lado ----

function perfilCapo(f) {
  f.moveTo(CAPO_DEL, yCapo(CAPO_DEL));
  f.lineTo(CAPO_TRAS, yCapo(CAPO_TRAS));
  f.lineTo(CAPO_TRAS, yCapo(CAPO_TRAS) - 0.07);
  f.lineTo(CAPO_DEL, yCapo(CAPO_DEL) - 0.07);
  f.closePath();
}

function perfilTecho(f) {
  // Arranca 5 mm por debajo del vidrio para taparlo sin compartir cara con él.
  f.moveTo(PARABRISAS_ALTO, TECHO - 0.005);
  f.lineTo(TECHO_TRAS, TECHO - 0.005);
  f.lineTo(TECHO_TRAS, TECHO + 0.055);
  f.lineTo(PARABRISAS_ALTO, TECHO + 0.055);
  f.closePath();
}

function perfilBaul(f) {
  f.moveTo(BAUL_DEL, 1.0);
  f.lineTo(BAUL_TRAS, 0.96);
  f.lineTo(BAUL_TRAS, 0.82);
  f.lineTo(BAUL_DEL, 0.82);
  f.closePath();
}

function perfilBomperDelantero(f) {
  f.moveTo(BOMPER_DEL, PISO);
  f.lineTo(BOMPER_DEL, 0.80);
  f.lineTo(-2.16, 0.80);
  f.lineTo(-2.24, 0.66);
  f.lineTo(PUNTA, 0.40);
  f.lineTo(-2.20, PISO);
  f.closePath();
}

function perfilBomperTrasero(f) {
  f.moveTo(BOMPER_TRAS, PISO);
  f.lineTo(BOMPER_TRAS, 0.80);
  f.lineTo(2.16, 0.80);
  f.lineTo(2.24, 0.66);
  f.lineTo(COLA, 0.40);
  f.lineTo(2.20, PISO);
  f.closePath();
}

// La cabina de vidrio: parabrisas, laterales y vidrio trasero en un solo
// volumen translúcido. No se pinta, así que no se puede seleccionar.
function perfilVidrio(f) {
  f.moveTo(CAPO_TRAS, CINTURA);
  f.lineTo(PARABRISAS_ALTO, TECHO);
  f.lineTo(TECHO_TRAS, TECHO);
  f.lineTo(VIDRIO_TRAS, 0.97);
  f.lineTo(VIDRIO_TRAS, CINTURA);
  f.closePath();
}

// El bloque oscuro de adelante sigue la pendiente del capó por debajo.
function perfilNucleoDelantero(f) {
  f.moveTo(BOMPER_DEL, RADIO_RUEDA);
  f.lineTo(BOMPER_DEL, 0.70);
  f.lineTo(CAPO_TRAS, 0.86);
  f.lineTo(CAPO_TRAS, RADIO_RUEDA);
  f.closePath();
}

// ---- Piezas que no son perfiles ----

function rueda(x, z) {
  const grupo = new THREE.Group();
  const llanta = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIO_RUEDA, RADIO_RUEDA, 0.22, 28),
    new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9, metalness: 0 }),
  );
  const rin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.20, 0.225, 20),
    new THREE.MeshStandardMaterial({ color: 0xc3c7cc, roughness: 0.35, metalness: 0.8 }),
  );
  // El cilindro nace vertical; girado 90° sobre Z queda con el eje a lo ancho.
  llanta.rotation.z = Math.PI / 2;
  rin.rotation.z = Math.PI / 2;
  grupo.add(llanta, rin);
  grupo.position.set(x, RADIO_RUEDA, z);
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

function luz(x, y, z, ancho, alto, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  return caja(ancho, alto, 0.05, material, x, y, z);
}

function placa(x, y, z) {
  return caja(0.34, 0.13, 0.02, new THREE.MeshStandardMaterial({ color: 0xf2e9b4, roughness: 0.6 }), x, y, z);
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

export function construirCarro({ colorBase = 0xcfd4da } = {}) {
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
    const xDesde = lado === 'der' ? MEDIO : -MEDIO + CHAPA;
    registrar(id, extruirPerfil(perfil, { xDesde, grosor: CHAPA, material: materialPintura(base) }));
  }

  function panelAncho(id, perfil, { bisel = BISEL, ancho = ANCHO } = {}) {
    registrar(id, extruirPerfil(perfil, { xDesde: ancho / 2, grosor: ancho, bisel, material: materialPintura(base) }));
  }

  panelAncho('capo', perfilCapo);
  panelAncho('techo', perfilTecho, { ancho: 1.76 });
  panelAncho('baul', perfilBaul);
  panelAncho('bomper-del', perfilBomperDelantero, { bisel: 0.03 });
  panelAncho('bomper-tras', perfilBomperTrasero, { bisel: 0.03 });

  for (const lado of ['izq', 'der']) {
    panelLateral('guardafango-del-' + lado, perfilGuardafangoDelantero, lado);
    panelLateral('puerta-del-' + lado, perfilPuerta(PUERTA_DEL, PUERTA_MEDIA), lado);
    panelLateral('puerta-tras-' + lado, perfilPuerta(PUERTA_MEDIA, PUERTA_TRAS), lado);
    panelLateral('costado-' + lado, perfilCostado, lado);
    panelLateral('estribo-' + lado, perfilEstribo, lado);

    const signo = lado === 'der' ? 1 : -1;
    registrar('espejo-' + lado, caja(0.10, 0.08, 0.16, materialPintura(base), signo * 0.99, 1.02, -0.42));
    grupo.add(caja(0.09, 0.03, 0.06, materialNegro(), signo * 0.90, 0.985, -0.42));

    grupo.add(rueda(signo * RUEDA_X, EJE_DEL));
    grupo.add(rueda(signo * RUEDA_X, EJE_TRAS));

    const xPilar = signo * (ANCHO_VIDRIO / 2 + 0.005);
    grupo.add(pilar(xPilar, CAPO_TRAS, CINTURA, PARABRISAS_ALTO, TECHO));
    grupo.add(pilar(xPilar, PUERTA_MEDIA + 0.01, CINTURA, PUERTA_MEDIA + 0.01, TECHO));
    grupo.add(pilar(xPilar, TECHO_TRAS, TECHO, VIDRIO_TRAS, 0.97));
  }

  // Vidrio y bloques interiores (no se pintan, no se seleccionan).
  grupo.add(extruirPerfil(perfilVidrio, { xDesde: ANCHO_VIDRIO / 2, grosor: ANCHO_VIDRIO, bisel: 0, material: materialVidrio() }));
  grupo.add(extruirPerfil(perfilNucleoDelantero, { xDesde: ANCHO_NUCLEO / 2, grosor: ANCHO_NUCLEO, bisel: 0, material: materialNegro() }));
  grupo.add(caja(ANCHO_NUCLEO, 0.94 - RADIO_RUEDA, BAUL_DEL - CAPO_TRAS, materialNegro(), 0, (0.94 + RADIO_RUEDA) / 2, (BAUL_DEL + CAPO_TRAS) / 2));
  grupo.add(caja(ANCHO_NUCLEO, 0.81 - RADIO_RUEDA, BOMPER_TRAS - BAUL_DEL, materialNegro(), 0, (0.81 + RADIO_RUEDA) / 2, (BOMPER_TRAS + BAUL_DEL) / 2));
  // Sillas y tablero: un bloque oscuro dentro de la cabina para que el
  // vidrio no deje ver un carro hueco.
  grupo.add(caja(1.44, 0.27, 1.6, materialNegro(), 0, CINTURA + 0.135, 0.6));

  // Luces, parrilla y placas.
  grupo.add(luz(-0.60, 0.75, -2.21, 0.42, 0.11, 0xfff1cc));
  grupo.add(luz(0.60, 0.75, -2.21, 0.42, 0.11, 0xfff1cc));
  grupo.add(caja(0.72, 0.18, 0.04, materialNegro(), 0, 0.52, -2.245));
  grupo.add(placa(0, 0.36, -2.235));
  grupo.add(luz(-0.60, 0.89, BAUL_TRAS, 0.38, 0.09, 0xe0262e));
  grupo.add(luz(0.60, 0.89, BAUL_TRAS, 0.38, 0.09, 0xe0262e));
  grupo.add(placa(0, 0.60, 2.245));

  return { grupo, seleccionables, porId };
}
