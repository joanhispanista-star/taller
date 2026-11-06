// El visor: dibuja el carro, lo deja girar con el dedo y marca piezas al tocarlas.
//
// Desde el registro (semana del 19 de octubre) el carro que se ve es uno del
// Garaje: llega por la URL (?placa=ABC123) o es el último que se abrió. Las
// piezas marcadas, el estado de cada una y sus fotos se guardan en el
// teléfono con garaje.js; la hoja de abajo la pinta hoja.js. El 3D se
// construye con la carrocería, el color y las medidas de la línea del carro
// (carro.js y carrocerias.js): no es el carro exacto, es uno del mismo tipo,
// tamaño y color, y la ficha de arriba lo dice. Desde el 22-oct, si el
// carro tiene ESCANEO (escaneo-pantalla.js), lo que se ve es el escaneo: el
// carro real a su tamaño, partido en las piezas del genérico ajustado a sus
// medidas; "Ver las piezas por dentro" vuelve al genérico, a esas medidas.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { construirCarro, resaltar } from './carro.js';
import { CARROCERIAS, nombreDePiezaEn, normalizarCarroceria } from './carrocerias.js';
import { ALTURA_DE_LA_MIRA, LENTE, VISTAS, distanciaQueEncuadra, medidasDeEncuadre } from './encuadre.js';
import { piezaTocada } from './toque.js';
import { CLAVE_GUARDADO, formatearPlaca, normalizarPlaca, textoParaAsistente } from './estado.js';
import {
  abrirAlmacen,
  alternarPieza,
  asignarPintor,
  avisoDeBorrador,
  crearCarro,
  deserializarCarro,
  estadoParaOrden,
  fechaCorta,
  fijarEstado,
  fijarTrabajo,
  mensajeDelRegistro,
  mensajeParaLaPantalla,
  nombreCompletoDelCarro,
  nombreDePiezaEnOrden,
  PIEZA_CARRO,
  nombreDelCarro,
  piezasDelCarro,
  quitarTodas,
  serializarCarro,
} from './garaje.js';
import { crearHoja } from './hoja.js';
import { crearFichaCarro } from './ficha-carro.js';
import { reducirFoto } from './fotos.js';
import { modeloDesdeEscaneo } from './escaneo.js';
import { crearPisoVitrina } from './piso-vitrina.js';
import { crearMedidor, iniciarPrueba } from './generico/en-prueba.js';
import { crearEscaneoPantalla, textoDeMedidas } from './escaneo-pantalla.js';

const COLOR_BASE = 0xcfd4da;

// Un color por estado de pieza, leído de las variables de css/estilos.css:
// la chapa en 3D y el chip de la lista salen del mismo tono sin tener el
// número escrito dos veces. Si una variable faltara, queda el de aquí.
const COLOR_ESTADO = leerColoresDeEstado({ pendiente: 0xff7a1a, 'en-proceso': 0xffd23f, terminada: 0x3ddc84 });
function leerColoresDeEstado(siFaltan) {
  const estilos = getComputedStyle(document.documentElement);
  const colores = {};
  for (const [estado, color] of Object.entries(siFaltan)) {
    const valor = estilos.getPropertyValue('--estado-' + estado).trim();
    colores[estado] = valor ? new THREE.Color(valor).getHex() : color;
  }
  return colores;
}

const ui = {
  escena: document.getElementById('escena'),
  lienzo: document.getElementById('lienzo'),
  pista: document.getElementById('pista'),
  ficha: document.getElementById('ficha'),
  error: document.getElementById('error'),
  placa: document.getElementById('placa'),
  datos: document.getElementById('datos'),
  limpiar: document.getElementById('limpiar'),
  enviar: document.getElementById('enviar'),
  vistas: document.querySelectorAll('[data-vista]'),
};

// ---------- El carro del registro ----------

// El borrador en localStorage es lo que reabre el mismo carro al recargar y
// lo que guarda un carro que todavía no tiene placa. En cuanto hay placa,
// manda el registro (IndexedDB, garaje.js): ahí están la historia y las
// fotos. El borrador se sigue escribiendo como espejo, por si el registro
// no abre (entonces el visor funciona como antes de que existiera).
let carro = cargarBorrador();
let fotos = [];
let almacen = null; // null hasta que abra; si no abre, se sigue con el borrador
let registroCaido = false; // abrió o no abrió, y no responde: ya se le dijo a la persona
let empleados = []; // los del taller, para asignar pintor a cada pieza

function cargarBorrador() {
  try {
    return deserializarCarro(localStorage.getItem(CLAVE_GUARDADO));
  } catch {
    return crearCarro();
  }
}

function guardarBorrador() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, serializarCarro(carro));
  } catch {
    // Sin almacenamiento (modo incógnito, cuota llena) el visor sigue
    // funcionando; solo pierde la selección al recargar.
  }
}

function persistir() {
  carro.actualizado = new Date().toISOString();
  guardarBorrador();
  if (carro.placa && almacen) {
    almacen.guardar(carro).catch((e) => hoja.avisar('No se pudo guardar en el teléfono: ' + mensajeDelRegistro(e, 'vuelve a marcar la pieza')));
  }
}

function mostrarError(mensaje) {
  ui.error.textContent = mensaje;
  ui.error.hidden = false;
  ui.pista.hidden = true;
}

// ---------- Escena ----------

let renderizador;
try {
  renderizador = new THREE.WebGLRenderer({ canvas: ui.lienzo, antialias: true, powerPreference: 'high-performance' });
} catch {
  mostrarError('Este navegador no puede mostrar el carro en 3D. Abre la página en Chrome.');
  throw new Error('WebGL no disponible');
}
renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderizador.toneMapping = THREE.ACESFilmicToneMapping;
renderizador.toneMappingExposure = 1.05;

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x1a1e24);

// Un "cuarto" de luz suave reflejado en la pintura: es lo que hace que la
// chapa se vea como metal pintado y no como plástico mate.
function crearEntorno() {
  if (escena.environment) escena.environment.dispose();
  const pmrem = new THREE.PMREMGenerator(renderizador);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}
crearEntorno();

// En Android, al irse a WhatsApp y volver, Chrome puede haber tirado el
// contexto WebGL: three.js lo recupera, pero el entorno (una textura
// dibujada en la GPU) se pierde y nadie pide un cuadro nuevo. Sin esto el
// carro volvía negro o mate hasta que la persona arrastrara.
ui.lienzo.addEventListener('webglcontextrestored', () => {
  crearEntorno();
  pedirCuadro();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pedirCuadro();
});
escena.add(new THREE.HemisphereLight(0xffffff, 0x3a4048, 0.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.1);
sol.position.set(3, 6, -4);
escena.add(sol);
// Una luz de relleno baja y desde atrás: dentro de un vano abierto o detrás
// de una puerta, el sol de arriba no entra y el interior salía negro.
const relleno = new THREE.DirectionalLight(0xffffff, 0.4);
relleno.position.set(-4, 1.5, 5);
escena.add(relleno);

// El plano lejano no sale de un carro sino del archivo más grande que entra como medido (hasta
// 40 m, ajustarEscala): con 80, uno de 37 m quedaba a 115 m de la cámara y el lienzo salía vacío,
// con Guardar al lado. Casi no le cuesta precisión al carro normal: esa la decide el plano cercano.
const camara = new THREE.PerspectiveCamera(LENTE, 1, 0.1, 400);

// Las vistas son direcciones; la distancia se calcula para que el carro quepa en el
// lienzo de ahora, sea cual sea su tamaño (encuadre.js): el lienzo se encoge cuando se
// marcan piezas, y en un celular en vertical el que manda es el ancho.
function distanciaDeEncuadre(direccion) {
  const medidas = medidasDeEncuadre(escaneoVisto, verPiezasEscaneo, modelo.disposicion);
  const distancia = distanciaQueEncuadra({ direccion, medidas, mira: controles.target, fov: camara.fov, aspecto: camara.aspect });
  // OrbitControls recorta la cámara a su tope: un archivo de 12,40 m pide 39 m de costado en
  // 412×915, y con el tope de 34 volvía a salir cortado. Solo sube: este cálculo también se
  // hace para la portada, a otra forma de lienzo, con la cámara de la pantalla más lejos.
  controles.maxDistance = Math.max(controles.maxDistance, distancia);
  return distancia;
}
function posicionDeVista(nombre) {
  const direccion = new THREE.Vector3(...VISTAS[nombre]).sub(controles.target).normalize();
  return direccion.multiplyScalar(distanciaDeEncuadre(direccion)).add(controles.target).toArray();
}
camara.position.set(...VISTAS.inicio);

const controles = new OrbitControls(camara, ui.lienzo);
controles.target.set(0, 0.65, 0);
controles.enableDamping = true;
controles.dampingFactor = 0.08;
controles.enablePan = false;
controles.minDistance = 2.4;
controles.maxDistance = 34;
controles.minPolarAngle = 0.15;
controles.maxPolarAngle = Math.PI / 2 - 0.05; // nunca por debajo del piso
// En el celular, UN dedo es para las piezas (tocar marca, arrastrar abre) y
// DOS dedos para el carro: girar, y pellizcar para acercar o alejar. Con el
// mouse del computador el arrastre sigue girando.
controles.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE };
controles.update();

const piso = crearPisoVitrina(renderizador, escena);
escena.add(piso.malla);

// `modelo` es el carro en 3D; `carro` (arriba) es el registro: placa, marca
// y el estado de cada pieza. Dos cosas distintas con dos nombres. El modelo
// se vuelve a construir cuando cambia lo que lo define: carrocería, color o
// medidas de la línea, o el escaneo que se está viendo.
let escaneoVisto = null; // el escaneo del carro (guardado o en vista previa), o null
let escaneoEsPrevia = false;
let verPiezasEscaneo = false;
let versionEscaneo = 0; // sube cada vez que cambia lo que se ve del escaneo
function opcionesDelModelo() {
  // Con escaneo, el genérico (el de "ver las piezas") va a las medidas
  // medidas y con la carrocería con que se etiquetó el escaneo.
  return {
    colorBase: carro.color || COLOR_BASE,
    carroceria: escaneoVisto ? escaneoVisto.carroceria : carro.carroceria || 'sedan',
    medidas: escaneoVisto ? escaneoVisto.medidasDibujo : carro.medidas || undefined,
    placa: formatearPlaca(carro.placa),
    // Con lo medido en el escaneo (ejes, capó, juntas): el genérico de "ver las piezas"
    // tiene que quedar sobre el mismo carro.
    ajustes: escaneoVisto ? escaneoVisto.ajustes || {} : undefined,
  };
}
function firmaDelModelo() {
  // El escaneo no dibuja la placa: ponérsela no cambia el modelo. El genérico de "ver
  // las piezas" sí la lleva.
  const sinPlaca = escaneoVisto && !verPiezasEscaneo ? { placa: '' } : {};
  return JSON.stringify({ ...opcionesDelModelo(), ...sinPlaca, escaneo: escaneoVisto ? versionEscaneo : 0, verPiezas: verPiezasEscaneo });
}
// El carro nuevo se enciende con un enlace, solo en el teléfono de quien lo abre (js/generico/en-prueba.js).
let prueba = null;
let medidor = null;
function construirModelo() {
  if (escaneoVisto && !verPiezasEscaneo) {
    const conFoto = modeloDesdeEscaneo(escaneoVisto, { colorBase: carro.color || COLOR_BASE });
    // La foto llega un momento después, y aquí solo se dibuja cuando algo cambia:
    // sin pedir el cuadro, el carro se quedaba en su color por vértice (pálido y a
    // manchas) hasta el primer toque. Y cambia de material: hay que volver a teñir.
    if (conFoto.texturaLista) {
      conFoto.texturaLista.then((foto) => {
        if (modelo !== conFoto) return;
        // El escaneo tiene su foto guardada y no abrió (poca memoria, o la imagen dañada):
        // sin decirlo, el carro se ve en manchas y parece que así salió el escaneo.
        if (!foto) hoja.avisar('No se pudo abrir la foto de este escaneo: se ve sin ella. Cierra otras apps y vuelve a abrir el carro; si sigue igual, súbelo otra vez.');
        for (const malla of modelo.seleccionables) tenir(malla.userData.piezaId);
        pedirCuadro();
      });
    }
    return conFoto;
  }
  // Con escaneo se queda el de hoy: sus piezas tienen que quedar sobre lo medido, y la junta
  // trasera del nuevo todavía no sigue esas medidas (el arco la frena).
  const armar = !escaneoVisto && prueba && prueba.construir ? prueba.construir : construirCarro;
  const inicio = performance.now();
  const armado = armar(opcionesDelModelo());
  if (medidor) medidor.armado(performance.now() - inicio);
  return armado;
}
let modelo = construirModelo();
let firmaModelo = firmaDelModelo();
escena.add(modelo.grupo);
apuntarAlCarro();
piso.ponerHuella(modelo.grupo, modelo.disposicion);

function apuntarAlCarro() {
  controles.target.set(0, modelo.disposicion.alto * ALTURA_DE_LA_MIRA, 0);
}

function reconstruirModelo() {
  const firma = firmaDelModelo();
  if (firma === firmaModelo) return;
  // Primero el nuevo y su huella: armarlos puede reventar (un escaneo dañado, falta de
  // memoria). Con el viejo ya soltado, la pantalla se quedaba sin carro y sin cómo volver,
  // porque `firmaModelo` seguía diciendo que el viejo estaba puesto. De aquí en adelante ya
  // nada revienta: quien llama puede dar por hecho que lo de antes sigue en pantalla.
  const nuevo = construirModelo();
  piso.ponerHuella(nuevo.grupo, nuevo.disposicion);
  escena.remove(modelo.grupo);
  // Liberar la GPU: cada carro son unas cuarenta geometrías y materiales.
  // La placa con número lleva un material por cara (una lista): dispose
  // sobre la lista reventaba al cambiar de carro con la placa puesta.
  modelo.grupo.traverse((objeto) => {
    if (objeto.geometry) objeto.geometry.dispose();
    const materiales = Array.isArray(objeto.material) ? objeto.material : objeto.material ? [objeto.material] : [];
    for (const material of materiales) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
  });
  // La foto del escaneo vive también fuera de la GPU (hasta 64 MB). Solo se cierra al
  // abandonar el modelo: si se pierde el contexto de WebGL, se vuelve a subir de ahí.
  modelo.soltado = true;
  if (modelo.textura && modelo.textura.image && modelo.textura.image.close) modelo.textura.image.close();
  modelo = nuevo;
  firmaModelo = firma;
  escena.add(modelo.grupo);
  apuntarAlCarro();
  // Otro carro, otro largo: la cámara vuelve a la vista de inicio a la
  // distancia que le toca, para que no aparezca cortado.
  camara.position.set(...posicionDeVista('inicio'));
  controles.update();
  pedirCuadro();
}

// Se dibuja solo cuando algo cambió (un giro, un toque, un cambio de
// tamaño): en un celular, dibujar 60 veces por segundo una escena quieta
// es batería tirada.
//
// Este bloque va ANTES de ajustarTamano(): esa función pide un cuadro al
// arrancar, y `let` no existe hasta su línea (la primera versión reventaba
// aquí en cualquier pantalla con tamaño, y solo se vio en una prueba).
let cuadroPedido = true;
let enMovimiento = false; // la cámara cambió en el último cuadro (giro o inercia)
function pedirCuadro() {
  cuadroPedido = true;
}
function dibujar() {
  cuadroPedido = false;
  piso.actualizar(camara, modelo.disposicion);
  renderizador.render(escena, camara);
}
function bucle(ahora) {
  requestAnimationFrame(bucle);
  const seMovio = controles.update();
  enMovimiento = seMovio;
  if (seMovio || cuadroPedido) dibujar();
  if (medidor) medidor.cuadro(ahora, seMovio);
}
bucle();

// Sin espera en el arranque: primero sale el carro de hoy y, si este teléfono pidió el nuevo, se
// cambia cuando lleguen sus módulos. Un `await` arriba dejaba el visor entero colgado de esos
// módulos, también para quien no abrió el enlace. Se llama aquí y no después porque lee ?carro=
// de la URL, y refrescar() la limpia al abrir el carro.
iniciarPrueba().then((pedida) => {
  if (!pedida) return;
  prueba = pedida;
  medidor = crearMedidor(ui.escena, pedida.estado);
  if (!pedida.construir || escaneoVisto) return;
  try {
    firmaModelo = '';
    reconstruirModelo();
    aplicarSeleccion();
  } catch (e) {
    // Una prueba no puede dejar la app sin carro: reconstruirModelo deja en pantalla lo de antes.
    console.warn(e);
    prueba = null;
    firmaModelo = firmaDelModelo();
  }
});

let primerTamano = true;
function ajustarTamano() {
  const ancho = ui.escena.clientWidth;
  const alto = ui.escena.clientHeight;
  if (!ancho || !alto) return;
  // Lo que se había acercado o alejado la persona, respecto de lo que da el encuadre.
  const haciaCamara = camara.position.clone().sub(controles.target);
  const proporcion = haciaCamara.length() / distanciaDeEncuadre(haciaCamara);
  renderizador.setSize(ancho, alto, false);
  camara.aspect = ancho / alto;
  camara.updateProjectionMatrix();
  piso.ajustar();
  // La primera vez que se sabe el tamaño real de la pantalla, la vista
  // inicial se recalcula para ese tamaño y ese carro. Después, si el lienzo cambia
  // (al marcar piezas se encoge), la misma vista, para que el carro siga cabiendo.
  if (primerTamano) {
    primerTamano = false;
    camara.position.set(...posicionDeVista('inicio'));
  } else {
    camara.position.copy(controles.target).addScaledVector(haciaCamara.normalize(), distanciaDeEncuadre(haciaCamara) * proporcion);
  }
  controles.update();
  // Aquí mismo y no en el cuadro siguiente: este observador corre después del
  // requestAnimationFrame de este cuadro, y setSize acaba de vaciar el lienzo. Pedirlo
  // dejaba pintar un cuadro sin carro (la hoja ya en su alto nuevo, el piso y el reflejo
  // no) cada vez que cambiaba de alto: 4 de 4 al tocar Limpiar, y en un celular dura lo
  // que tarde en dibujarse el escaneo dos veces.
  dibujar();
}
new ResizeObserver(ajustarTamano).observe(ui.escena);
ajustarTamano();

// ---------- Tocar una pieza ----------

// Devuelve el id de la pieza bajo el dedo, o null (la lógica del anillo de
// rayos vive en toque.js, donde se prueba con la cámara y el carro reales).
function piezaBajo(xPantalla, yPantalla) {
  const r = ui.lienzo.getBoundingClientRect();
  return piezaTocada({
    camara,
    grupo: modelo.grupo,
    x: xPantalla - r.left,
    y: yPantalla - r.top,
    ancho: r.width,
    alto: r.height,
  });
}

// _sphericalDelta es la inercia interna de OrbitControls 0.169 (js/vendor).
// Si una versión futura lo renombra, el freno deja de actuar pero nada se
// rompe: por eso la comprobación.
function frenarInercia() {
  if (controles._sphericalDelta) controles._sphericalDelta.set(0, 0, 0);
}

// Un toque es un dedo que baja y sube casi en el mismo sitio y rápido;
// cualquier otra cosa es un giro y lo maneja OrbitControls.
const TOQUE_PX = 10;
const TOQUE_MS = 400;
let toque = null;
let dedos = 0;
ui.lienzo.addEventListener('pointerdown', (e) => {
  dedos += 1;
  // Si el carro venía girando por inercia, este dedo es para frenarlo, no
  // para marcar lo que pasaba por debajo: se corta la inercia y el toque
  // no cuenta. Pero sigue siendo un toque para el temblor: sin `toque`, sus 2 px le llegaban
  // a OrbitControls, que le creaba inercia nueva, y el toque siguiente caía otra vez aquí y
  // no marcaba nada (6 de 6, con 2, 3 y 5 px).
  if (enMovimiento) {
    frenarInercia();
    toque = dedos === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), freno: true } : null;
    return;
  }
  toque = dedos === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
ui.lienzo.addEventListener('pointerup', (e) => {
  dedos = Math.max(0, dedos - 1);
  if (!toque || !controles.enabled) return;
  const { x, y, t, freno } = toque;
  toque = null;
  if (!freno && Math.hypot(e.clientX - x, e.clientY - y) < TOQUE_PX && performance.now() - t < TOQUE_MS) {
    alTocar(e.clientX, e.clientY);
  }
});
ui.lienzo.addEventListener('pointercancel', () => {
  dedos = 0;
  toque = null;
});

function alTocar(x, y) {
  const id = piezaBajo(x, y);
  if (!id) return;
  alternar(id);
  ui.pista.hidden = true;
  mostrarNombreDePieza(id, x, y);
}

// El nombre de la pieza junto al dedo, un momento: se tiñe y aparece un renglón abajo,
// pero con siete renglones hay que buscarlo, y el dedo tapa lo que acaba de tocar.
let etiquetaDePieza = null;
let plazoEtiqueta = 0;
function mostrarNombreDePieza(id, x, y) {
  if (!carro.piezas[id]) {
    if (etiquetaDePieza) etiquetaDePieza.hidden = true;
    return;
  }
  if (!etiquetaDePieza) {
    etiquetaDePieza = document.createElement('div');
    etiquetaDePieza.className = 'nombre-de-pieza';
    ui.escena.append(etiquetaDePieza);
  }
  const r = ui.escena.getBoundingClientRect();
  etiquetaDePieza.textContent = nombreDePiezaEn(carro.carroceria, id);
  etiquetaDePieza.hidden = false; // visible antes de medirla: escondida mide 0
  // Su mitad más un margen, y no un tope fijo: «Guardafango delantero izquierdo» mide
  // 216 px, y con 90 px de tope se leía «uardafango…» al tocar cerca del borde.
  const margen = etiquetaDePieza.offsetWidth / 2 + 6;
  etiquetaDePieza.style.left = Math.min(r.width - margen, Math.max(margen, x - r.left)) + 'px';
  etiquetaDePieza.style.top = Math.max(30, y - r.top - 46) + 'px';
  clearTimeout(plazoEtiqueta);
  plazoEtiqueta = setTimeout(() => (etiquetaDePieza.hidden = true), 1600);
}

// La pista de arriba se va sola: es lo primero que se lee y después solo estorba.
let plazoPista = 0;
function ponerPista(texto) {
  ui.pista.textContent = texto;
  ui.pista.hidden = false;
  clearTimeout(plazoPista);
  plazoPista = setTimeout(() => (ui.pista.hidden = true), 6000);
}

// ---------- Abrir puertas, capó y compuerta ----------
//
// Arrastrar una pieza con bisagra la abre o la cierra siguiendo el dedo;
// al soltar queda abierta o cerrada, lo que esté más cerca. Un toque sin
// arrastre la marca, como a cualquier pieza. Arrastrar en otra parte (una
// pieza fija, el piso, el vidrio) gira el carro, como siempre.
//
// Estos manejadores van en fase de captura para correr ANTES que los de
// OrbitControls (que escuchan el mismo lienzo): así, al apagar los
// controles aquí, el giro no arranca con este dedo.
let gesto = null; // { art, x0, y0, angulo0, direccion, arrastro }

function posicionEnPantalla(vector) {
  const r = ui.lienzo.getBoundingClientRect();
  const p = vector.clone().project(camara);
  return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
}

// Hacia dónde se mueve en la pantalla el borde libre de la pieza al
// abrirse del todo. Mover el dedo en esa dirección abre; en la contraria,
// cierra. Se mide con la cámara de ahora: depende de desde dónde se mira.
function direccionDeApertura(art) {
  const anguloActual = art.angulo;
  const punto = (angulo) => {
    art.fijar(angulo);
    art.pivote.updateMatrixWorld(true);
    return posicionEnPantalla(art.pivote.localToWorld(art.referencia.clone()));
  };
  const cerrada = punto(0);
  const abierta = punto(art.max);
  art.fijar(anguloActual);
  art.pivote.updateMatrixWorld(true);
  const dx = abierta.x - cerrada.x;
  const dy = abierta.y - cerrada.y;
  const distancia = Math.max(60, Math.hypot(dx, dy));
  return { x: dx / distancia, y: dy / distancia, distancia };
}

// Cada bisagra lleva su propio contador de animación: con uno solo para
// todas, abrir el capó y una puerta a la vez cancelaba la primera.
function animarArticulacion(art, destino) {
  const desde = art.angulo;
  const inicio = performance.now();
  const id = (art.animacion = (art.animacion || 0) + 1);
  function cuadro(ahora) {
    if (id !== art.animacion) return;
    const k = Math.min(1, (ahora - inicio) / 180);
    art.fijar(desde + (destino - desde) * k * (2 - k));
    pedirCuadro();
    if (k < 1) requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
}

function abrirPieza(id, angulo) {
  const art = modelo.articulaciones.get(id);
  if (!art) return false;
  animarArticulacion(art, angulo == null ? (art.angulo > 0 ? 0 : art.max) : angulo);
  return true;
}

ui.lienzo.addEventListener(
  'pointerdown',
  (e) => {
    // Si un botón de vista tiene la cámara en camino, el dedo manda: la animación termina
    // ya y el arrastre se atiende al instante. Tiene que ser aquí, en la captura: los
    // controles van apagados durante la animación y OrbitControls recibe el dedo antes
    // que el manejador de marcar, así que lo tiraba. Medido: la cámara saltaba al destino
    // y 120 px de arrastre no la movían nada.
    const veniaEnCamino = Boolean(animacionActiva);
    if (veniaEnCamino) terminarAnimacion();
    if (gesto) {
      // Llegó otro dedo: el gesto se suelta donde iba y los controles
      // vuelven (será un pellizco para acercar).
      gesto = null;
      controles.enabled = !animacionActiva;
      return;
    }
    if (dedos !== 0 || enMovimiento || veniaEnCamino) return;
    // Sin bisagras (un escaneo) no hay nada que abrir: no se gastan rayos en preguntar.
    // Eran la mitad de lo que tardaba un toque.
    if (!modelo.articulaciones.size) return;
    const id = piezaBajo(e.clientX, e.clientY);
    const art = id && modelo.articulaciones.get(id);
    if (!art) return;
    gesto = { art, x0: e.clientX, y0: e.clientY, angulo0: art.angulo, direccion: direccionDeApertura(art), arrastro: false };
    // Con un dedo los controles ya no giran (touches.ONE), así que solo
    // hay que apagarlos para el mouse; y así, si llega un segundo dedo,
    // OrbitControls ya tiene el primero y el pellizco funciona.
    if (e.pointerType === 'mouse') controles.enabled = false;
  },
  true,
);
ui.lienzo.addEventListener(
  'pointermove',
  (e) => {
    if (!gesto) return;
    const dx = e.clientX - gesto.x0;
    const dy = e.clientY - gesto.y0;
    if (!gesto.arrastro && Math.hypot(dx, dy) < 8) return;
    gesto.arrastro = true;
    toque = null; // ya no es un toque: no se marca la pieza al soltar
    const avance = (dx * gesto.direccion.x + dy * gesto.direccion.y) / gesto.direccion.distancia;
    gesto.art.fijar(gesto.angulo0 + avance * gesto.art.max);
    pedirCuadro();
  },
  true,
);
// Un dedo nunca baja quieto: 2 px de temblor al tocar ya giraban el escaneo 1,1° (9 px,
// 5,4°) y le dejaban inercia unos 35 cuadros, y el toque siguiente caía en «este dedo es
// para frenarlo» y no marcaba nada. Mientras pueda ser un toque, OrbitControls no se entera
// del movimiento. Este manejador va después del de las bisagras, para no quitárselo.
ui.lienzo.addEventListener(
  'pointermove',
  (e) => {
    if (!toque || dedos !== 1) return;
    if (Math.hypot(e.clientX - toque.x, e.clientY - toque.y) < TOQUE_PX && performance.now() - toque.t < TOQUE_MS) {
      e.stopImmediatePropagation();
      return;
    }
    // Ya es un giro, con su inercia de siempre. Arranca desde aquí y no desde donde bajó
    // el dedo: lo que se le ocultó sería un salto de 14° en un lienzo de 250 px de alto.
    toque = null;
    if (controles._rotateStart) controles._rotateStart.set(e.clientX, e.clientY);
  },
  true,
);
ui.lienzo.addEventListener(
  'pointerup',
  () => {
    if (!gesto) return;
    const { art, arrastro } = gesto;
    gesto = null;
    controles.enabled = !animacionActiva;
    if (!arrastro) return; // fue un toque: lo atiende el manejador de marcar
    // Al soltar, a lo que esté más cerca: abierta o cerrada.
    animarArticulacion(art, art.angulo > art.max * 0.4 ? art.max : 0);
    ui.pista.hidden = true;
  },
  true,
);
ui.lienzo.addEventListener(
  'pointercancel',
  () => {
    if (!gesto) return;
    gesto = null;
    controles.enabled = !animacionActiva;
  },
  true,
);

function tenir(id) {
  const malla = modelo.porId.get(id);
  if (!malla) return;
  const pieza = carro.piezas[id];
  resaltar(malla, pieza ? COLOR_ESTADO[pieza.estado] : null);
}

function alternar(id) {
  if (!modelo.porId.has(id)) return;
  alternarPieza(carro, id);
  tenir(id);
  pedirCuadro();
  persistir();
  pintarHoja();
}

function fijar(id, estado) {
  if (!modelo.porId.has(id) || !fijarEstado(carro, id, estado)) return;
  tenir(id);
  pedirCuadro();
  persistir();
  pintarHoja();
}

function fijarTrabajoDe(id, trabajo) {
  if (!modelo.porId.has(id) || !fijarTrabajo(carro, id, trabajo)) return;
  tenir(id); // por si la pieza no estaba marcada y acaba de entrar
  pedirCuadro();
  persistir();
  pintarHoja();
}

function asignarPintorDe(id, pintor) {
  if (!modelo.porId.has(id) || !asignarPintor(carro, id, pintor)) return;
  tenir(id);
  pedirCuadro();
  persistir();
  pintarHoja();
}

function aplicarSeleccion() {
  for (const malla of modelo.seleccionables) tenir(malla.userData.piezaId);
  pedirCuadro();
}

// ---------- Panel de abajo ----------

const hoja = crearHoja({
  alAlternar: alternar,
  alFijarEstado: fijar,
  alFijarTrabajo: fijarTrabajoDe,
  alAsignarPintor: asignarPintorDe,
  alAgregarFoto: agregarFoto,
  alBorrarFoto: borrarFoto,
});

// La ficha de datos (marca, línea, versión, carrocería, color): al guardar,
// el carro se vuelve a limpiar con crearCarro (placa y piezas no cambian),
// se guarda y el 3D se reconstruye si cambió lo que lo define.
// El escaneo: el botón, sus opciones, el escáner y la vista previa. Le
// dice al visor qué mostrar; el visor reconstruye y vuelve a teñir.
const pantallaEscaneo = crearEscaneoPantalla({
  obtenerCarro: () => carro,
  avisar: (texto) => hoja.avisar(texto),
  registroCaido: () => registroCaido,
  alGuardarEscaneo: (placa) => ponerPortadaDelEscaneo(placa),
  // Sin el escaneo, su cuadro ya no es este carro: el Garaje seguiría mostrando lo que se
  // quitó, y la hoja no deja borrarlo a mano porque las automáticas no salen en la lista.
  // Si falla no se pide reintentar: el escaneo ya no está y no queda un Quitar que tocar.
  alQuitarEscaneo: (placa) => {
    if (almacen) almacen.borrarPortadasAutomaticas(placa).catch(() => hoja.avisar('El escaneo se quitó, pero su foto sigue en el Garaje: se va cuando guardes otro escaneo o borres el carro.'));
  },
  mostrar(escaneo, { previa, verPiezas, mismaMalla }) {
    // Guardar y volver a pintar la misma malla no reconstruye nada: rehacerla son 2
    // soldaduras, abrir otra vez la foto y subirla a la GPU (segundos en un celular), y
    // además la cámara volvía a la vista de inicio justo después de que la persona giró
    // el carro para revisarlo.
    const igual = mismaMalla || (escaneo || null) === escaneoVisto;
    const antes = [escaneoVisto, escaneoEsPrevia, verPiezasEscaneo, versionEscaneo];
    escaneoVisto = escaneo || null;
    escaneoEsPrevia = Boolean(previa);
    verPiezasEscaneo = Boolean(verPiezas);
    if (!igual) versionEscaneo += 1;
    // Si no se pudo armar, en pantalla sigue lo de antes, y esto tiene que seguir diciéndolo.
    try {
      reconstruirModelo();
    } catch (error) {
      [escaneoVisto, escaneoEsPrevia, verPiezasEscaneo, versionEscaneo] = antes;
      throw error;
    }
    aplicarSeleccion();
    pintarFicha();
    // Un escaneo no abre puertas: es una sola superficie, así que el dedo que en el
    // carro genérico arrastra una puerta aquí gira el carro. Es el primer gesto de
    // cualquiera, y en el taller se tiene una mano ocupada.
    const esSuperficie = escaneoVisto && !verPiezasEscaneo;
    controles.touches.ONE = esSuperficie ? THREE.TOUCH.ROTATE : -1;
    ponerPista(esSuperficie ? 'Toca una pieza para marcarla · Arrastra para girar' : 'Toca una pieza para marcarla · Arrastra una puerta para abrirla · Dos dedos para girar');
  },
});

const fichaCarro = crearFichaCarro({
  alGuardar(datos) {
    carro = crearCarro({ ...carro, ...datos });
    persistir();
    refrescar();
  },
});
ui.datos.addEventListener('click', () => fichaCarro.abrir(carro));
ui.ficha.addEventListener('click', () => fichaCarro.abrir(carro));

// Al guardar un escaneo, si el carro no tiene foto en el Garaje, su portada es él mismo:
// lo que se guarda a la vista no puede ser un cuadro gris al lado de un renglón de texto.
// El cuadro se saca del lienzo en el mismo turno de dibujarlo: después el navegador ya
// lo borró.
//
// Se dibuja aparte, a 4:3 y con su propio encuadre, y no se recorta de lo que hay en
// pantalla: con el celular acostado (lienzo 844×195) o en el computador, un recorte del
// lienzo o aplastaba el carro o le dejaba la trompa afuera (15 % de su largo). Todo va en un
// solo turno: la pantalla nunca ve ni este tamaño ni esta cámara.
async function ponerPortadaDelEscaneo(placa) {
  if (!almacen) return;
  try {
    // Una foto de verdad se queda. La que sacó la app de un escaneo anterior, no, ni siquiera
    // escondida debajo de esa foto: al borrarla volvía a salir, y era otro carro (un Moskvitch
    // en la tarjeta de un carro cuyo 3D es el Kona).
    const anterior = await almacen.portada(placa);
    if (anterior && !anterior.automatica) {
      await almacen.borrarPortadasAutomaticas(placa);
      return;
    }
    const esteModelo = modelo;
    if (esteModelo.texturaLista) await esteModelo.texturaLista;
    // Solo del escaneo: con «ver las piezas» en pantalla el modelo es el genérico gris, y
    // quedaría de portada algo que no es este carro.
    if (carro.placa !== placa || modelo !== esteModelo || !modelo.escaneado) return;
    const salida = Object.assign(document.createElement('canvas'), { width: 480, height: 360 });
    const lapiz = salida.getContext('2d');
    const antes = camara.position.clone();
    const aspectoAntes = camara.aspect;
    const tamano = renderizador.getSize(new THREE.Vector2());
    renderizador.setSize(480, 360, false);
    camara.aspect = 4 / 3;
    camara.updateProjectionMatrix();
    camara.position.fromArray(posicionDeVista('inicio'));
    camara.lookAt(controles.target);
    piso.ajustar();
    // La portada es el carro, no el trabajo de hoy: con los velos o el tinte puestos se
    // quedaba en el Garaje con parches naranja aunque las piezas se terminaran después.
    for (const malla of modelo.seleccionables) resaltar(malla, null);
    dibujar();
    lapiz.drawImage(renderizador.domElement, 0, 0, 480, 360);
    aplicarSeleccion();
    renderizador.setSize(tamano.x, tamano.y, false);
    camara.aspect = aspectoAntes;
    camara.updateProjectionMatrix();
    camara.position.copy(antes);
    camara.lookAt(controles.target);
    piso.ajustar();
    dibujar();
    const foto = await new Promise((listo) => salida.toBlob(listo, 'image/jpeg', 0.85));
    if (foto) {
      if (anterior) await almacen.borrarFoto(anterior.id);
      await almacen.guardarFoto({ placa, pieza: PIEZA_CARRO, foto, miniatura: foto, ancho: 480, alto: 360, automatica: true });
    }
  } catch {
    // Sin portada se sigue viendo el cuadro de color: no vale la pena un aviso.
  }
}

function pintarHoja() {
  hoja.pintar({ carro, fotos: fotos.filter((f) => !f.automatica), empleados, conRegistro: Boolean(carro.placa && almacen) });
  const hayPiezas = Object.keys(carro.piezas).length > 0;
  ui.enviar.disabled = !hayPiezas;
  ui.limpiar.disabled = !hayPiezas;
}

// La ficha de arriba dice qué carro es y que el 3D es una carrocería de
// referencia (del mismo tipo, tamaño y color), no el carro exacto. Sin
// datos del catálogo no dice nada: no hay que inventar.
function pintarFicha() {
  const nombre = nombreCompletoDelCarro(carro);
  ui.datos.textContent = nombreDelCarro(carro) || 'Datos del carro';
  if (!nombre && !carro.carroceria && !escaneoVisto) {
    ui.ficha.hidden = true;
    return;
  }
  // Si nadie la ha dicho, no se dice: "Sedán" encima de una camioneta le quita la
  // confianza a todo lo que viene después.
  const tipo = carro.carroceria ? CARROCERIAS[normalizarCarroceria(carro.carroceria)].nombre : '';
  const largo = !escaneoVisto && carro.medidas && carro.medidas.largo ? (carro.medidas.largo / 1000).toFixed(2).replace('.', ',') + ' m' : '';
  // Un carro entregado lo dice aquí arriba: lo que se le marque ya no
  // entra en la nómina como trabajo nuevo sin que alguien se dé cuenta.
  const entrega = carro.entregado ? 'entregado ' + fechaCorta(carro.entregado) : '';
  // Lo que es el 3D, sin adornarlo: la carrocería de referencia, el
  // escaneo (con lo que midió), o las piezas a las medidas del escaneo.
  let queEs = 'carrocería de referencia';
  if (escaneoVisto) {
    const medidas = textoDeMedidas(escaneoVisto);
    queEs = escaneoEsPrevia ? 'escaneo sin guardar: ' + medidas : verPiezasEscaneo ? 'piezas a las medidas del escaneo (' + medidas + ')' : 'escaneado: ' + medidas;
  }
  ui.ficha.textContent = [nombre, tipo, largo, entrega, queEs].filter(Boolean).join(' · ');
  ui.ficha.hidden = false;
}

ui.limpiar.addEventListener('click', () => {
  quitarTodas(carro);
  aplicarSeleccion();
  persistir();
  pintarHoja();
});

async function agregarFoto(id, archivo) {
  if (!carro.placa || !almacen) {
    hoja.avisar('Ponle placa al carro para guardarle fotos.');
    return;
  }
  const placa = carro.placa;
  hoja.avisar('Guardando la foto…');
  try {
    const reducida = await reducirFoto(archivo);
    await almacen.guardarFoto({ placa, pieza: id, ...reducida });
    if (carro.placa !== placa) return; // cambió de carro mientras se guardaba
    fotos = await almacen.listarFotos(placa);
    hoja.avisar('');
    pintarHoja();
  } catch (e) {
    hoja.avisar('No se pudo guardar la foto: ' + mensajeDelRegistro(e, 'vuelve a tomarla'));
  }
}

async function borrarFoto(idFoto) {
  if (!almacen) return;
  try {
    await almacen.borrarFoto(idFoto);
    fotos = await almacen.listarFotos(carro.placa);
    pintarHoja();
  } catch (e) {
    hoja.avisar('No se pudo borrar la foto: ' + mensajeParaLaPantalla(e, 'vuelve a intentarlo.'));
  }
}

// Sin cuenta ni servidor todavía, el canal que ya tiene el asistente es
// WhatsApp. La hoja de compartir del teléfono (navigator.share) solo existe
// por https o en localhost: cuando la app esté publicada aparece la hoja
// con WhatsApp dentro; abierta por http en la red Wi-Fi del taller, se va
// directo a WhatsApp por wa.me. Las dos llevan la misma orden. Cuando haya
// registro en la nube, esto será además un aviso dentro de la app.
ui.enviar.addEventListener('click', async () => {
  const texto = textoParaAsistente(estadoParaOrden(carro), (id) => nombreDePiezaEnOrden(carro, id, nombreDePiezaEn(carro.carroceria, id)));
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // la persona cerró la hoja
    }
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
});

// ---------- Placa y marca ----------

// Pone en el visor el carro con esa placa. Si está en el registro, manda el
// registro: tiene la historia y las fotos. Si no está, se crea a partir de
// `base`. Cuando `base` es un borrador sin placa (el dueño marcó primero y
// escribió la placa después), sus piezas se conservan: si el carro ya
// existía se le suman como pendientes, y si no, son las del carro nuevo.
async function abrirCarro(placa, base) {
  const esBorrador = base.placa === '';
  let cambio = false;
  if (!almacen) {
    carro = crearCarro({ ...base, placa });
    fotos = [];
    guardarBorrador();
    return;
  }
  const existente = await almacen.obtener(placa);
  // El borrador más nuevo que el registro: se marcaron piezas mientras el registro no respondía
  // (un iPhone, por ejemplo). Eso pasa al registro, en vez de perderse: son piezas que se pagan.
  if (existente && base.placa === placa && base.actualizado > existente.actualizado) {
    carro = crearCarro({ ...existente, ...base, placa });
    await almacen.guardar(carro);
    guardarBorrador();
    fotos = await almacen.listarFotos(placa);
    return;
  }
  if (existente) {
    if (esBorrador) {
      for (const [id, pieza] of Object.entries(base.piezas)) {
        if (!existente.piezas[id]) {
          existente.piezas[id] = pieza;
          cambio = true;
        }
      }
      if (!existente.marca && base.marca) {
        existente.marca = base.marca;
        cambio = true;
      }
    }
    carro = existente;
  } else {
    carro = crearCarro({ ...base, placa });
    cambio = true;
  }
  if (cambio) await almacen.guardar(carro);
  guardarBorrador();
  fotos = await almacen.listarFotos(placa);
}

function refrescar() {
  ui.placa.value = carro.placa;
  // Primero el escaneo de esta placa (si cambió de carro, lo del anterior se
  // suelta ya, antes de reconstruir: que no se vea ni un momento sobre este).
  pantallaEscaneo.cargar(carro.placa);
  reconstruirModelo();
  aplicarSeleccion();
  pintarHoja();
  pintarFicha();
  // La URL dice qué carro está abierto: recargar o volver atrás trae el
  // mismo, y no el que decía la URL antes de cambiar la placa.
  const buscado = carro.placa ? '?placa=' + carro.placa : '';
  if (location.search !== buscado) history.replaceState(null, '', location.pathname + buscado);
}

ui.placa.value = carro.placa;
// La placa se toma al salir del campo (change), no en cada tecla:
// reescribir el campo mientras la persona escribe manda el cursor al final
// y en Android duplica letras. El CSS ya la muestra en mayúsculas mientras
// tanto, y al tocar cualquier botón el campo pierde el foco primero.
ui.placa.addEventListener('change', async () => {
  const nueva = normalizarPlaca(ui.placa.value);
  ui.placa.value = nueva;
  if (nueva === carro.placa) return;
  if (nueva === '') {
    // Borrarle la placa no borra el carro del registro: es empezar otro
    // carro, sin placa, como antes de que existiera el Garaje.
    carro = crearCarro();
    fotos = [];
    guardarBorrador();
  } else {
    // De "sin placa" a una placa: el mismo carro, que ahora tiene nombre.
    // De una placa a otra: otro carro (las marcas eran del anterior).
    await abrirCarro(nueva, carro.placa === '' ? carro : crearCarro());
  }
  refrescar();
});

// ---------- Botones de vista ----------

let animacion = 0;
let animacionActiva = null;
function irA(nombre) {
  if (!VISTAS[nombre]) return;
  const destino = posicionDeVista(nombre);
  const objetivo = controles.target.clone();
  const desde = new THREE.Spherical().setFromVector3(camara.position.clone().sub(objetivo));
  const hasta = new THREE.Spherical().setFromVector3(new THREE.Vector3(...destino).sub(objetivo));
  // Girar por el camino corto alrededor del carro, nunca atravesándolo.
  let giro = hasta.theta - desde.theta;
  if (giro > Math.PI) giro -= 2 * Math.PI;
  if (giro < -Math.PI) giro += 2 * Math.PI;
  const inicio = performance.now();
  const duracion = 550;
  const paso = new THREE.Spherical();
  const id = ++animacion;
  controles.enabled = false;
  animacionActiva = { destino: new THREE.Vector3(...destino), objetivo };
  function cuadro(ahora) {
    if (id !== animacion) return; // otra vista pedida en medio, o un dedo la cortó
    const k = Math.min(1, (ahora - inicio) / duracion);
    const s = k * k * (3 - 2 * k);
    paso.set(
      desde.radius + (hasta.radius - desde.radius) * s,
      desde.phi + (hasta.phi - desde.phi) * s,
      desde.theta + giro * s,
    );
    camara.position.setFromSpherical(paso).add(objetivo);
    camara.lookAt(objetivo);
    pedirCuadro();
    if (k < 1) {
      requestAnimationFrame(cuadro);
    } else {
      terminarAnimacion();
    }
  }
  requestAnimationFrame(cuadro);
}

// Deja la cámara en el destino y devuelve el mando al dedo. Se llama al
// acabar la animación y también si el dueño toca la pantalla a mitad de
// camino: con los controles apagados su arrastre se perdería y un toque
// marcaría una pieza con la cámara a medio girar.
function terminarAnimacion() {
  if (!animacionActiva) return;
  camara.position.copy(animacionActiva.destino);
  camara.lookAt(animacionActiva.objetivo);
  animacionActiva = null;
  animacion += 1;
  controles.enabled = true;
  controles.update();
  pedirCuadro();
}
for (const boton of ui.vistas) {
  boton.addEventListener('click', () => irA(boton.dataset.vista));
}

// ---------- Arranque ----------

// Primero el borrador, que está a mano: el carro aparece teñido al instante.
// Luego el registro, que tarda unos milisegundos en abrir; si la URL trae
// otra placa, o la placa del borrador tiene historia guardada, se refresca.
aplicarSeleccion();
pintarHoja();
pintarFicha();

async function arrancar() {
  const sinFotoAlEntrar = new URL(location.href).searchParams.has('sinfoto');
  try {
    almacen = await abrirAlmacen();
    empleados = await almacen.listarEmpleados();
  } catch (e) {
    registroCaido = true;
    hoja.avisar(avisoDeBorrador(e));
  }
  const placaURL = normalizarPlaca(new URL(location.href).searchParams.get('placa') || '');
  try {
    if (placaURL && placaURL !== carro.placa) {
      await abrirCarro(placaURL, crearCarro());
    } else if (carro.placa) {
      await abrirCarro(carro.placa, carro);
    }
  } catch (e) {
    // El registro no responde ni reconectando. Sin esto, el visor quedaba en otro carro, sin su
    // escaneo. Se sigue con el que se pidió, como borrador: una sola vez el aviso, y no uno por
    // cada pieza que se marque.
    almacen = null;
    registroCaido = true;
    if (placaURL && placaURL !== carro.placa) carro = crearCarro({ placa: placaURL });
    guardarBorrador();
    hoja.avisar(avisoDeBorrador(e));
  }
  refrescar();
  // Lo que no se pudo hacer en la pantalla de antes. Va después de refrescar, que limpia la URL.
  if (sinFotoAlEntrar) hoja.avisar('El carro quedó creado, pero su foto no se pudo guardar en este celular. Para ponerla, vuelve a «Nuevo carro con foto» con esta placa.');
}

// Gancho para las pruebas automáticas: deja marcar piezas, cambiar estados,
// meter fotos y mover la cámara sin simular dedos sobre la pantalla.
window.__visor = {
  get carro() {
    return carro;
  },
  get fotos() {
    return fotos;
  },
  get almacen() {
    return almacen;
  },
  get modelo() {
    return modelo;
  },
  get escaneo() {
    return { visto: escaneoVisto, previa: escaneoEsPrevia, verPiezas: verPiezasEscaneo };
  },
  pantallaEscaneo,
  camara,
  depurar: () => ({ enMovimiento, dedos, animacionActiva: Boolean(animacionActiva), gesto: Boolean(gesto), controles: controles.enabled }),
  alternar,
  fijar,
  fijarTrabajo: fijarTrabajoDe,
  asignarPintor: asignarPintorDe,
  get empleados() {
    return empleados;
  },
  abrirPieza,
  abrirDatos: () => fichaCarro.abrir(carro),
  agregarFoto,
  borrarFoto,
  irA,
  piezaBajo,
  refrescar,
  listo: arrancar(),
  marcadas: () => piezasDelCarro(carro).map((p) => p.id),
};
