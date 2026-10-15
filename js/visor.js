// El visor: dibuja el carro, lo deja girar con el dedo y marca piezas al tocarlas.
//
// Desde el registro (semana del 19 de octubre) el carro que se ve es uno del
// Garaje: llega por la URL (?placa=ABC123) o es el último que se abrió. Las
// piezas marcadas, el estado de cada una y sus fotos se guardan en el
// teléfono con garaje.js; la hoja de abajo la pinta hoja.js. Aquí queda la
// escena y el pegamento entre las dos.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { construirCarro, resaltar } from './carro.js';
import { piezaTocada } from './toque.js';
import { CLAVE_GUARDADO, normalizarPlaca, textoParaAsistente } from './estado.js';
import {
  abrirAlmacen,
  alternarPieza,
  crearCarro,
  deserializarCarro,
  estadoParaOrden,
  fijarEstado,
  piezasDelCarro,
  quitarTodas,
  serializarCarro,
} from './garaje.js';
import { crearHoja } from './hoja.js';
import { reducirFoto } from './fotos.js';

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

// Posiciones de cámara de los botones de vista. "Izquierdo" es el lado del
// conductor (-X). "Arriba" no está en la vertical exacta porque OrbitControls
// no deja pasar de cierto ángulo y la cámara saltaría al soltarla.
const VISTAS = {
  inicio: [-4.6, 2.1, -4.9],
  frente: [0, 1.3, -6.2],
  izquierdo: [-6.4, 1.4, 0],
  derecho: [6.4, 1.4, 0],
  atras: [0, 1.3, 6.2],
  arriba: [0, 7.3, -1.4],
};

const ui = {
  escena: document.getElementById('escena'),
  lienzo: document.getElementById('lienzo'),
  pista: document.getElementById('pista'),
  error: document.getElementById('error'),
  placa: document.getElementById('placa'),
  marca: document.getElementById('marca'),
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
    almacen.guardar(carro).catch((e) => hoja.avisar('No se pudo guardar en el teléfono: ' + e.message));
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
escena.add(new THREE.HemisphereLight(0xffffff, 0x3a4048, 0.45));
const sol = new THREE.DirectionalLight(0xffffff, 1.1);
sol.position.set(3, 6, -4);
escena.add(sol);

const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
camara.position.set(...VISTAS.inicio);

const controles = new OrbitControls(camara, ui.lienzo);
controles.target.set(0, 0.65, 0);
controles.enableDamping = true;
controles.dampingFactor = 0.08;
controles.enablePan = false;
controles.minDistance = 3.2;
controles.maxDistance = 11;
controles.minPolarAngle = 0.15;
controles.maxPolarAngle = Math.PI / 2 - 0.05; // nunca por debajo del piso
controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controles.update();

// `modelo` es el sedán en 3D; `carro` (arriba) es el registro: placa, marca
// y el estado de cada pieza. Dos cosas distintas con dos nombres.
const modelo = construirCarro({ colorBase: COLOR_BASE });
escena.add(modelo.grupo, ...crearPiso());

function crearPiso() {
  const piso = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.95, metalness: 0 }),
  );
  piso.rotation.x = -Math.PI / 2;

  // Sombra pintada en un degradado: más barata que una sombra real y en un
  // celular se ve igual de bien.
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 256;
  const ctx = lienzo.getContext('2d');
  const degradado = ctx.createRadialGradient(128, 128, 24, 128, 128, 128);
  degradado.addColorStop(0, 'rgba(0,0,0,0.62)');
  degradado.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, 256, 256);
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 5.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lienzo), transparent: true, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.01;
  return [piso, sombra];
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
function bucle() {
  requestAnimationFrame(bucle);
  const seMovio = controles.update();
  enMovimiento = seMovio;
  if (seMovio || cuadroPedido) {
    cuadroPedido = false;
    renderizador.render(escena, camara);
  }
}
bucle();

function ajustarTamano() {
  const ancho = ui.escena.clientWidth;
  const alto = ui.escena.clientHeight;
  if (!ancho || !alto) return;
  renderizador.setSize(ancho, alto, false);
  camara.aspect = ancho / alto;
  camara.updateProjectionMatrix();
  pedirCuadro();
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
let toque = null;
let dedos = 0;
ui.lienzo.addEventListener('pointerdown', (e) => {
  dedos += 1;
  // Si un botón de vista tiene la cámara en camino, el dedo manda: la
  // animación termina ya y el arrastre se atiende al instante.
  if (animacionActiva) terminarAnimacion();
  // Si el carro venía girando por inercia, este dedo es para frenarlo, no
  // para marcar lo que pasaba por debajo: se corta la inercia y el toque
  // no cuenta.
  if (enMovimiento) {
    frenarInercia();
    toque = null;
    return;
  }
  toque = dedos === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
ui.lienzo.addEventListener('pointerup', (e) => {
  dedos = Math.max(0, dedos - 1);
  if (!toque || !controles.enabled) return;
  const { x, y, t } = toque;
  toque = null;
  if (Math.hypot(e.clientX - x, e.clientY - y) < 10 && performance.now() - t < 400) {
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
}

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

function aplicarSeleccion() {
  for (const malla of modelo.seleccionables) tenir(malla.userData.piezaId);
  pedirCuadro();
}

// ---------- Panel de abajo ----------

const hoja = crearHoja({
  alAlternar: alternar,
  alFijarEstado: fijar,
  alAgregarFoto: agregarFoto,
  alBorrarFoto: borrarFoto,
});

function pintarHoja() {
  hoja.pintar({ carro, fotos, conRegistro: Boolean(carro.placa && almacen) });
  const hayPiezas = Object.keys(carro.piezas).length > 0;
  ui.enviar.disabled = !hayPiezas;
  ui.limpiar.disabled = !hayPiezas;
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
    hoja.avisar('No se pudo guardar la foto: ' + e.message);
  }
}

async function borrarFoto(idFoto) {
  if (!almacen) return;
  try {
    await almacen.borrarFoto(idFoto);
    fotos = await almacen.listarFotos(carro.placa);
    pintarHoja();
  } catch (e) {
    hoja.avisar('No se pudo borrar la foto: ' + e.message);
  }
}

// Sin cuenta ni servidor todavía, el canal que ya tiene el asistente es
// WhatsApp. La hoja de compartir del teléfono (navigator.share) solo existe
// por https o en localhost: cuando la app esté publicada aparece la hoja
// con WhatsApp dentro; abierta por http en la red Wi-Fi del taller, se va
// directo a WhatsApp por wa.me. Las dos llevan la misma orden. Cuando haya
// registro en la nube, esto será además un aviso dentro de la app.
ui.enviar.addEventListener('click', async () => {
  const texto = textoParaAsistente(estadoParaOrden(carro));
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
  ui.marca.value = carro.marca;
  aplicarSeleccion();
  pintarHoja();
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
ui.marca.value = carro.marca;
ui.marca.addEventListener('input', () => {
  carro.marca = ui.marca.value.slice(0, 40);
  persistir();
});

// ---------- Botones de vista ----------

let animacion = 0;
let animacionActiva = null;
function irA(nombre) {
  const destino = VISTAS[nombre];
  if (!destino) return;
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

async function arrancar() {
  try {
    almacen = await abrirAlmacen();
  } catch (e) {
    hoja.avisar('Este navegador no guarda el registro (' + e.message + '). El carro queda solo como borrador.');
  }
  const placaURL = normalizarPlaca(new URL(location.href).searchParams.get('placa') || '');
  if (placaURL && placaURL !== carro.placa) {
    await abrirCarro(placaURL, crearCarro());
  } else if (carro.placa) {
    await abrirCarro(carro.placa, carro);
  }
  refrescar();
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
  modelo,
  alternar,
  fijar,
  agregarFoto,
  borrarFoto,
  irA,
  piezaBajo,
  listo: arrancar(),
  marcadas: () => piezasDelCarro(carro).map((p) => p.id),
};
