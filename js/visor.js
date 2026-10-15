// El visor: dibuja el carro, lo deja girar con el dedo y marca piezas al tocarlas.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { construirCarro, resaltar } from './carro.js';
import { piezaTocada } from './toque.js';
import {
  CLAVE_GUARDADO,
  alternarPieza,
  cambiarPlaca,
  crearEstado,
  deserializar,
  limpiarSeleccion,
  piezasSeleccionadas,
  serializar,
  textoParaAsistente,
} from './estado.js';

const COLOR_BASE = 0xcfd4da;
const ACENTO = 0xff7a1a;

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
  contador: document.getElementById('contador'),
  lista: document.getElementById('lista'),
  limpiar: document.getElementById('limpiar'),
  enviar: document.getElementById('enviar'),
  vistas: document.querySelectorAll('[data-vista]'),
};

let estado = cargar();

function cargar() {
  try {
    const guardado = localStorage.getItem(CLAVE_GUARDADO);
    return guardado ? deserializar(guardado) : crearEstado();
  } catch {
    return crearEstado();
  }
}

function guardar() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, serializar(estado));
  } catch {
    // Sin almacenamiento (modo incógnito, cuota llena) el visor sigue
    // funcionando; solo pierde la selección al recargar.
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

const carro = construirCarro({ colorBase: COLOR_BASE });
escena.add(carro.grupo, ...crearPiso());

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
    grupo: carro.grupo,
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

function alternar(id) {
  const malla = carro.porId.get(id);
  if (!malla) return;
  const marcada = alternarPieza(estado, id);
  resaltar(malla, marcada ? ACENTO : null);
  pedirCuadro();
  guardar();
  pintarLista();
}

function aplicarSeleccion() {
  for (const malla of carro.seleccionables) {
    resaltar(malla, estado.seleccion.has(malla.userData.piezaId) ? ACENTO : null);
  }
  pedirCuadro();
}

// ---------- Panel de abajo ----------

function pintarLista() {
  const piezas = piezasSeleccionadas(estado);
  ui.contador.textContent =
    piezas.length === 0
      ? 'Toca las piezas que necesitan pintura.'
      : piezas.length === 1
        ? '1 pieza marcada'
        : piezas.length + ' piezas marcadas';
  ui.lista.replaceChildren(
    ...piezas.map((p) => {
      const item = document.createElement('li');
      const nombre = document.createElement('span');
      nombre.textContent = p.nombre;
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '×';
      quitar.setAttribute('aria-label', 'Quitar ' + p.nombre);
      quitar.addEventListener('click', () => alternar(p.id));
      item.append(nombre, quitar);
      return item;
    }),
  );
  ui.enviar.disabled = piezas.length === 0;
  ui.limpiar.disabled = piezas.length === 0;
}

ui.limpiar.addEventListener('click', () => {
  limpiarSeleccion(estado);
  aplicarSeleccion();
  guardar();
  pintarLista();
});

// Sin cuenta ni servidor todavía, el canal que ya tiene el asistente es
// WhatsApp. La hoja de compartir del teléfono (navigator.share) solo existe
// por https o en localhost: cuando la app esté publicada aparece la hoja
// con WhatsApp dentro; abierta por http en la red Wi-Fi del taller, se va
// directo a WhatsApp por wa.me. Las dos llevan la misma orden. Cuando haya
// registro en la nube, esto será además un aviso dentro de la app.
ui.enviar.addEventListener('click', async () => {
  const texto = textoParaAsistente(estado);
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

ui.placa.value = estado.placa;
// La placa se toma al salir del campo (change), no en cada tecla:
// reescribir el campo mientras la persona escribe manda el cursor al final
// y en Android duplica letras. El CSS ya la muestra en mayúsculas mientras
// tanto, y al tocar cualquier botón el campo pierde el foco primero.
ui.placa.addEventListener('change', () => {
  const eraOtroCarro = cambiarPlaca(estado, ui.placa.value);
  ui.placa.value = estado.placa;
  if (eraOtroCarro) {
    ui.marca.value = estado.marca;
    aplicarSeleccion();
    pintarLista();
  }
  guardar();
});
ui.marca.value = estado.marca;
ui.marca.addEventListener('input', () => {
  estado.marca = ui.marca.value.slice(0, 40);
  guardar();
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

aplicarSeleccion();
pintarLista();

// Gancho para las pruebas automáticas: deja marcar piezas y mover la cámara
// sin simular dedos sobre la pantalla.
window.__visor = {
  estado,
  carro,
  alternar,
  irA,
  piezaBajo,
  marcadas: () => piezasSeleccionadas(estado).map((p) => p.id),
};
