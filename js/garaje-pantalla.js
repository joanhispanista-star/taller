// La pantalla Garaje: todos los carros del registro, la puerta por placa y
// la puerta con foto (la app propone qué carro es, de qué color y qué
// carrocería; la persona confirma).
//
// Esta pantalla no sabe de Three.js: lee el registro (garaje.js), pinta
// filas y manda al visor con ?placa=. El reconocedor (reconocer.js, con su
// motor de 28 MB y su modelo de 89 MB) se carga solo cuando alguien toca
// "Nuevo carro con foto": el Garaje tiene que abrir al instante.
import { CLAVE_GUARDADO, normalizarPlaca } from './estado.js';
import { PIEZA_CARRO, abrirAlmacen, deserializarCarro, fechaCorta, nombreCompletoDelCarro, resumen } from './garaje.js';
import { CARROCERIAS, normalizarCarroceria } from './carrocerias.js';
import { catalogoOrdenado, datosDeEntrada, entradaEscrita, familiaDe, marcaDelCatalogo, mejorDeFamilia, nombreDeLinea } from './catalogo.js';
import { colorDeFoto, nombreDeColor } from './color-foto.js';
import { reducirFoto } from './fotos.js';
import { cargarDemo, estadoDemo } from './demo.js';
import { pesos } from './tablero.js';
import { puntoEnFoto } from './logo.js';
import { zonaDelLogo } from './placa-foto.js';

const ui = {
  demo: document.getElementById('demo'),
  demoTexto: document.getElementById('demo-texto'),
  demoBoton: document.getElementById('demo-boton'),
  formulario: document.getElementById('registro'),
  placa: document.getElementById('placa'),
  marca: document.getElementById('marca'),
  lista: document.getElementById('carros'),
  vacio: document.getElementById('vacio'),
  borrador: document.getElementById('borrador'),
  aviso: document.getElementById('aviso'),
  nuevoConFoto: document.getElementById('nuevo-con-foto'),
  fotoCarro: document.getElementById('foto-carro'),
  ficha: {
    dialogo: document.getElementById('ficha-nueva'),
    foto: document.getElementById('ficha-foto'),
    marco: document.getElementById('ficha-foto-marco'),
    toque: document.getElementById('ficha-toque'),
    pistaLogo: document.getElementById('ficha-pista-logo'),
    marcaTexto: document.getElementById('ficha-marca-texto'),
    marcas: document.getElementById('ficha-marcas'),
    fotoLogo: document.getElementById('ficha-foto-logo'),
    archivoLogo: document.getElementById('foto-logo'),
    ayuda: document.getElementById('ficha-ayuda'),
    placaNota: document.getElementById('ficha-placa-nota'),
    progreso: document.getElementById('ficha-progreso'),
    estado: document.getElementById('ficha-estado'),
    placa: document.getElementById('ficha-placa'),
    color: document.getElementById('ficha-color'),
    colorNombre: document.getElementById('ficha-color-nombre'),
    ayuda: document.getElementById('ficha-ayuda'),
    sugerencias: document.getElementById('ficha-sugerencias'),
    linea: document.getElementById('ficha-linea'),
    version: document.getElementById('ficha-version'),
    lineas: document.getElementById('lineas-catalogo'),
    carrocerias: document.getElementById('ficha-carrocerias'),
    cancelar: document.querySelector('#ficha-nueva [data-accion="cancelar"]'),
    abrir: document.querySelector('#ficha-nueva [data-accion="abrir"]'),
  },
};

let almacen = null;

function avisar(texto) {
  ui.aviso.textContent = texto;
  ui.aviso.hidden = !texto;
}

function enlaceAlVisor(placa) {
  return 'index.html?placa=' + encodeURIComponent(placa);
}

// ---------- La lista ----------

// El borrador del visor (un carro sin placa, en localStorage) no está en el
// registro, pero existe: si tiene piezas marcadas se le dice al dueño, para
// que no crea que se perdieron al venir al Garaje.
function leerBorrador() {
  try {
    return deserializarCarro(localStorage.getItem(CLAVE_GUARDADO));
  } catch {
    return null;
  }
}

function pintarBorrador() {
  const borrador = leerBorrador();
  const cuantas = borrador && !borrador.placa ? Object.keys(borrador.piezas).length : 0;
  ui.borrador.hidden = cuantas === 0;
  if (cuantas) {
    ui.borrador.querySelector('span').textContent =
      'Hay un carro sin placa con ' + (cuantas === 1 ? '1 pieza marcada' : cuantas + ' piezas marcadas') + '.';
  }
}

function cuenta(estado, n, singular, plural) {
  const s = document.createElement('span');
  s.className = 'cuenta estado-' + estado + (n === 0 ? ' vacia' : '');
  s.textContent = n + ' ' + (n === 1 ? singular : plural);
  return s;
}

let urlsPortadas = [];

function fila(carro) {
  const item = document.createElement('li');

  const enlace = document.createElement('a');
  enlace.className = 'carro';
  enlace.href = enlaceAlVisor(carro.placa);

  // La foto del carro (si la hay) o un cuadro con su color.
  const portada = document.createElement('div');
  portada.className = 'carro-portada';
  if (carro.color) portada.style.background = carro.color;
  if (almacen) {
    almacen.portada(carro.placa).then((foto) => {
      if (!foto) return;
      const imagen = document.createElement('img');
      const url = URL.createObjectURL(foto.miniatura || foto.foto);
      urlsPortadas.push(url);
      imagen.src = url;
      imagen.alt = '';
      portada.replaceChildren(imagen);
    });
  }

  const placa = document.createElement('strong');
  placa.textContent = carro.placa;
  if (carro.demo) {
    const insignia = document.createElement('small');
    insignia.className = 'insignia-demo';
    insignia.textContent = 'demo';
    placa.append(' ', insignia);
  }
  const fecha = document.createElement('time');
  // Un carro entregado muestra su fecha de entrega, no la del último toque.
  fecha.dateTime = carro.entregado || carro.actualizado;
  fecha.textContent = carro.entregado ? 'entregado ' + fechaCorta(carro.entregado) : fechaCorta(carro.actualizado);

  const descripcion = document.createElement('span');
  descripcion.className = 'carro-marca';
  const partes = [nombreCompletoDelCarro(carro) || 'Sin marca'];
  if (carro.carroceria) partes.push(CARROCERIAS[normalizarCarroceria(carro.carroceria)].nombre);
  if (carro.color) partes.push(nombreDeColor(carro.color));
  descripcion.textContent = partes.join(' · ');

  const cuentas = document.createElement('div');
  cuentas.className = 'cuentas';
  const r = resumen(carro);
  if (r.total === 0) {
    cuentas.textContent = 'Sin piezas marcadas';
  } else {
    cuentas.append(
      cuenta('pendiente', r.pendientes, 'pendiente', 'pendientes'),
      cuenta('en-proceso', r.enProceso, 'en proceso', 'en proceso'),
      cuenta('terminada', r.terminadas, 'terminada', 'terminadas'),
    );
    if (r.latoneria > 0) {
      const l = document.createElement('span');
      l.className = 'cuenta cuenta-latoneria';
      l.textContent = r.latoneria + ' con latonería';
      cuentas.append(l);
    }
  }
  if (carro.entregado) {
    const cobro = document.createElement('span');
    cobro.className = 'cuenta cuenta-latoneria';
    cobro.textContent = carro.cobro ? 'cobrado ' + pesos(carro.cobro) : 'entregado sin cobro anotado';
    cuentas.append(cobro);
  }

  enlace.append(portada, placa, fecha, descripcion, cuentas);

  const borrar = document.createElement('button');
  borrar.type = 'button';
  borrar.className = 'borrar';
  borrar.textContent = '×';
  borrar.setAttribute('aria-label', 'Borrar el carro ' + carro.placa);
  borrar.title = 'Borrar el carro ' + carro.placa;
  borrar.addEventListener('click', () => borrarCarro(carro.placa));

  item.append(enlace, borrar);
  return item;
}

async function pintar() {
  pintarBorrador();
  if (!almacen) return;
  for (const url of urlsPortadas) URL.revokeObjectURL(url);
  urlsPortadas = [];
  const carros = await almacen.listar();
  ui.vacio.hidden = carros.length > 0;
  ui.lista.replaceChildren(...carros.map(fila));
  await pintarDemo();
}

// ---------- Demostración ----------

async function pintarDemo() {
  const estado = await estadoDemo(almacen);
  if (estado.carros + estado.empleados > 0) {
    ui.demoTexto.textContent = 'Los carros marcados «demo» son de demostración (' + estado.carros + '), con sus empleados (' + estado.empleados + '). Lo real no se toca al quitarlos.';
    ui.demoBoton.textContent = 'Quitar la demostración';
    ui.demoBoton.dataset.accion = 'quitar';
    ui.demo.hidden = false;
  } else {
    ui.demoTexto.textContent = 'Para ver la app con algo adentro puedes cargar 5 carros de demostración (marcas y colores distintos, con piezas arregladas y en reparación) y 3 empleados.';
    ui.demoBoton.textContent = 'Cargar demostración';
    ui.demoBoton.dataset.accion = 'cargar';
    ui.demo.hidden = false;
  }
}

ui.demoBoton.addEventListener('click', async () => {
  if (!almacen) return;
  ui.demoBoton.disabled = true;
  try {
    if (ui.demoBoton.dataset.accion === 'quitar') {
      if (!confirm('¿Quitar los carros y empleados de demostración? Lo real se queda.')) return;
      await almacen.quitarDemo();
    } else {
      await cargarDemo(almacen);
    }
    await pintar();
  } catch (e) {
    avisar('No se pudo: ' + e.message);
  } finally {
    ui.demoBoton.disabled = false;
  }
});

async function borrarCarro(placa) {
  if (!confirm('¿Borrar el carro ' + placa + ' con sus piezas y sus fotos? No se puede deshacer.')) return;
  try {
    await almacen.borrar(placa);
    // Si el visor tenía ese carro abierto, su borrador lo volvería a crear
    // al entrar: se limpia también.
    const borrador = leerBorrador();
    if (borrador && borrador.placa === placa) localStorage.removeItem(CLAVE_GUARDADO);
    await pintar();
  } catch (e) {
    avisar('No se pudo borrar: ' + e.message);
  }
}

// ---------- Por placa ----------

ui.formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  const placa = normalizarPlaca(ui.placa.value);
  ui.placa.value = placa;
  if (!placa) {
    ui.placa.focus();
    return;
  }
  // Sin registro (navegador sin IndexedDB) el visor igual abre la placa
  // como borrador.
  if (!almacen) {
    location.href = enlaceAlVisor(placa);
    return;
  }
  try {
    const { carro } = await almacen.abrirOCrear(placa, ui.marca.value);
    location.href = enlaceAlVisor(carro.placa);
  } catch (error) {
    avisar('No se pudo abrir el carro: ' + error.message);
  }
});

// ---------- Con foto ----------

// Lo que la persona va confirmando en la ficha. La regla de la casa: lo
// hecho a mano manda sobre lo que la app propone. Por eso cada dato lleva
// de dónde salió: `lineaPor` y `carroceriaPor` son 'mano' (tocó o escribió)
// o 'app' (propuesta automática) o ''; `marcaPor` es 'logo' (tocó el
// emblema y se reconoció), 'mano' (la eligió o la escribió) o ''.
// `marcasLineas` son las marcas del catálogo cuyas líneas se proponen
// (vacío = todas). La app solo elige sola donde la persona no ha elegido,
// y solo reemplaza lo que ella misma propuso.
let ficha = null;
let urlFicha = '';
let reconocedor = null; // el módulo, importado la primera vez que hace falta

// El reconocedor se importa aquí y no arriba: su motor pesa 28 MB y solo
// hace falta cuando hay una foto.
function cargarReconocedor() {
  if (!reconocedor) reconocedor = import('./reconocer.js');
  return reconocedor;
}

function estadoFicha(texto, porcentaje) {
  ui.ficha.estado.textContent = texto;
  ui.ficha.estado.hidden = !texto;
  if (typeof porcentaje === 'number') ui.ficha.progreso.style.width = Math.max(0, Math.min(100, porcentaje)) + '%';
}

function chip(texto, detalle, activo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip-sugerencia' + (activo ? ' activo' : '');
  b.textContent = texto;
  if (detalle) {
    const s = document.createElement('small');
    s.textContent = detalle;
    b.append(s);
  }
  return b;
}

function pintarCarrocerias() {
  ui.ficha.carrocerias.replaceChildren(
    ...Object.entries(CARROCERIAS).map(([tipo, info]) => {
      const b = chip(info.nombre, '', ficha.carroceria === tipo);
      b.setAttribute('aria-pressed', String(ficha.carroceria === tipo));
      b.addEventListener('click', () => {
        ficha.carroceria = tipo;
        ficha.carroceriaPor = 'mano';
        pintarCarrocerias();
      });
      return b;
    }),
  );
}

// `por`: 'mano' (tocó un chip o la escribió) o 'app' (propuesta automática).
function elegirEntrada(entrada, por = 'mano') {
  const datos = datosDeEntrada(entrada);
  ficha.marca = datos.marca;
  ficha.linea = datos.linea;
  ficha.medidas = datos.medidas;
  ficha.entrada = entrada;
  ficha.lineaPor = por;
  ui.ficha.linea.value = nombreDeLinea(entrada);
  ficha.ultimoTexto = ui.ficha.linea.value;
  // La carrocería: la que la persona tocó manda. Si no tocó, la que votó
  // la foto (desde el frente un sedán y un hatchback se parecen, y ahí la
  // foto sabe más que el catálogo) y, si la foto no votó, la del catálogo.
  if (ficha.carroceriaPor !== 'mano') ficha.carroceria = ficha.carroceriaVotada || datos.carroceria;
  pintarCarrocerias();
  pintarSugerencias();
}

function pintarSugerencias() {
  const lista = ficha.sugerencias || [];
  ui.ficha.sugerencias.replaceChildren(
    ...lista.map((s) => {
      // La sugerencia es una familia (Logan); se abre su entrada más común y reciente.
      const entrada = mejorDeFamilia(s.marca, s.linea);
      const activo = Boolean(ficha.entrada && entrada && ficha.entrada === entrada);
      // Con la marca ya sabida, el chip no la repite: "Captiva", no "Chevrolet Captiva".
      const texto = ficha.marcasLineas.length ? s.linea : s.marca + ' ' + s.linea;
      const b = chip(texto, CARROCERIAS[normalizarCarroceria(s.carroceria)].nombre, activo);
      b.addEventListener('click', () => {
        if (entrada) elegirEntrada(entrada, 'mano');
      });
      return b;
    }),
  );
}

// ---- La marca ----

// La marca NO sale de la foto entera: medido, con la Captiva de Joan
// proponía Hyundai, y decir "parece Hyundai" con el corbatín a la vista
// hizo que la app pareciera equivocada (16-oct). La marca la da el logo
// (tocado en la foto o fotografiado de cerca) o la persona.
function pintarMarcaTexto() {
  const t = ui.ficha.marcaTexto;
  const logo = ficha.logo && ficha.logoSeguro ? ficha.logo[0] : null;
  if (ficha.marcaPor === 'logo') {
    t.textContent = 'Marca por el logo: ' + ficha.marca + '. Abajo van solo las líneas de ' + ficha.marca + '; si no es, toca otra.';
  } else if (ficha.marcaPor === 'mano' && ficha.marca) {
    const contradice = logo && !logo.marcas.includes(ficha.marca) ? ' El logo parecía ' + logo.nombre + '; si es, tócala arriba.' : '';
    t.textContent = 'Marca: ' + ficha.marca + (ficha.marcasLineas.length ? '. Abajo van solo sus líneas.' : ' (escrita).') + contradice;
  } else if (ficha.marcaSoltada) {
    t.textContent = 'Sin marca fija: escribe la marca y la línea, o toca una marca abajo.';
  } else if (ficha.logo && !ficha.logoSeguro) {
    const nombres = ficha.logo.slice(0, 3).map((m) => m.nombre);
    t.textContent = 'El logo no se ve claro. ¿Es ' + nombres.slice(0, -1).join(', ') + ' o ' + nombres[nombres.length - 1] + '? Toca una, tómale una foto de cerca, o toca el logo otra vez.';
  } else {
    t.textContent = 'Marca: toca el logo en la foto, tómale una foto de cerca, o elige abajo.';
  }
}

// Las marcas que más ruedan en Colombia, para elegir con un toque sin
// esperar al reconocedor.
const MARCAS_COMUNES = ['Chevrolet', 'Renault', 'Mazda', 'Kia', 'Hyundai', 'Toyota', 'Nissan', 'Ford', 'Suzuki', 'Volkswagen'];

// Los chips de marca: las tres que más votó el logo (o, sin logo, las más
// comunes de Colombia), la elegida si no está entre ellas, y "Otra".
function pintarMarcas() {
  const candidatas = [];
  const agregar = (nombre, marcas, detalle) => {
    if (!candidatas.some((c) => c.nombre === nombre)) candidatas.push({ nombre, marcas, detalle });
  };
  if (ficha.logo) for (const m of ficha.logo.slice(0, 3)) agregar(m.nombre, m.marcas, Math.round(m.p * 100) + ' %');
  else for (const m of MARCAS_COMUNES) agregar(m, [m], '');
  if (ficha.marca && !candidatas.some((c) => c.marcas.includes(ficha.marca))) {
    candidatas.unshift({ nombre: ficha.marca, marcas: [ficha.marca], detalle: '' });
  }
  const chips = candidatas.map((c) => {
    const activo = ficha.marcasLineas.length > 0 && c.marcas.includes(ficha.marca);
    const b = chip(c.nombre, c.detalle, activo);
    b.setAttribute('aria-pressed', String(activo));
    b.addEventListener('click', () => elegirMarca(c.marcas, 'mano'));
    return b;
  });
  const otra = chip('Otra marca', '', false);
  otra.addEventListener('click', soltarMarca);
  ui.ficha.marcas.replaceChildren(...chips, otra);
}

function soltarLinea() {
  ficha.entrada = null;
  ficha.linea = '';
  ficha.medidas = null;
  ficha.lineaPor = '';
  ui.ficha.linea.value = '';
  ficha.ultimoTexto = '';
}

// Fija la marca (una o varias del catálogo que comparten logo): el buscador
// de líneas y las sugerencias pasan a ser solo de esa marca. Si la marca
// viene del logo y la persona ya había escrito o tocado una línea de OTRA
// marca, lo suyo manda: el logo queda en los chips, sin aplicarse.
async function elegirMarca(marcas, por) {
  const marcaActual = ficha.entrada ? ficha.entrada.marca : ficha.marca;
  if (por === 'logo' && ficha.lineaPor === 'mano' && marcaActual && !marcas.includes(marcaActual)) {
    pintarMarcaTexto();
    pintarMarcas();
    return;
  }
  ficha.marcasLineas = marcas;
  ficha.marcaPor = por;
  ficha.marcaSoltada = false;
  ficha.marca = marcas[0];
  // Una línea de otra marca ya no vale (la persona acaba de decir que la
  // marca es otra, o el logo lo dijo y ella no había elegido nada).
  if (ficha.entrada && !marcas.includes(ficha.entrada.marca)) soltarLinea();
  llenarCatalogo(marcas);
  pintarMarcaTexto();
  pintarMarcas();
  await actualizarSugerencias();
}

// "Otra marca": quita el filtro. Lo que propuso la app se suelta (el campo
// queda vacío para escribir); lo que la persona escribió o tocó se queda.
function soltarMarca() {
  ficha.marcasLineas = [];
  ficha.marcaPor = '';
  ficha.marcaSoltada = true;
  if (ficha.lineaPor !== 'mano') {
    soltarLinea();
    ficha.marca = '';
  } else if (ficha.entrada) {
    ficha.marca = ficha.entrada.marca;
  }
  llenarCatalogo([]);
  ficha.sugerencias = [];
  pintarMarcaTexto();
  pintarMarcas();
  pintarSugerencias();
  ui.ficha.linea.focus();
}

// Las familias de una marca por lo común que son, para proponer algo
// mientras el reconocedor no ha mirado la foto (o si no pudo).
function familiasComunesDe(marcas) {
  const vistas = new Set();
  const salida = [];
  for (const e of catalogoOrdenado()) {
    if (!marcas.includes(e.marca)) continue;
    const familia = familiaDe(e);
    const clave = e.marca + '|' + familia;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({ marca: e.marca, linea: familia, carroceria: e.carroceria, presencia: e.presencia });
  }
  const PESO = { 'muy comun': 0, comun: 1, 'poco comun': 2 };
  return salida.sort((a, b) => PESO[a.presencia] - PESO[b.presencia]);
}

// Las sugerencias de línea solo cuando se sabe la marca: con la foto ya
// mirada, las familias de la marca que más se parecen a la foto; sin foto
// mirada todavía, las más comunes de la marca. Sin marca no se propone
// ninguna línea: lo que votaba la foto entera traía marcas equivocadas
// (Hyundai Kona para una Captiva) y eso confundía más de lo que ayudaba.
// La app elige sola la primera solo si la persona no ha elegido ni escrito
// nada; lo que la propia app eligió antes se reemplaza por lo mejor de
// ahora (una marca nueva trae otra mejor línea).
async function actualizarSugerencias() {
  const sesion = ficha;
  if (ficha.marcasLineas.length && ficha.vector) {
    const { lineasDeMarca } = await cargarReconocedor();
    const lineas = await lineasDeMarca(ficha.vector, ficha.marcasLineas, ficha.carroceriaVotada);
    if (ficha !== sesion) return;
    ficha.sugerencias = lineas.slice(0, 6);
  } else if (ficha.marcasLineas.length) {
    ficha.sugerencias = familiasComunesDe(ficha.marcasLineas).slice(0, 6);
  } else {
    ficha.sugerencias = [];
  }
  ui.ficha.ayuda.textContent = ficha.marcasLineas.length ? 'La app propone; tú confirmas con un toque.' : 'Las líneas salen cuando se sepa la marca.';
  if (ficha.lineaPor !== 'mano' && ficha.sugerencias[0]) {
    const mejor = mejorDeFamilia(ficha.sugerencias[0].marca, ficha.sugerencias[0].linea);
    if (mejor && mejor !== ficha.entrada) elegirEntrada(mejor, 'app');
  }
  pintarSugerencias();
}

// Lo que sale del reconocedor del logo (por toque o por foto de cerca):
// si gana con claridad, la marca queda puesta; si no, se dice y se dejan
// las tres más probables para tocar una.
async function aplicarLogo(r, sesion) {
  ficha.logo = r.marcas;
  ficha.logoSeguro = r.seguro;
  if (r.seguro) {
    ui.ficha.pistaLogo.textContent = r.marcas[0].nombre + ' · ' + (r.milisegundos / 1000).toFixed(1) + ' s';
    await elegirMarca(r.marcas[0].marcas, 'logo');
  } else {
    ui.ficha.pistaLogo.textContent = 'No se ve claro · toca el logo otra vez o tómale foto de cerca';
    pintarMarcaTexto();
    pintarMarcas();
  }
  return sesion === ficha;
}

// ---- La placa, y el logo encima de ella, sin que la persona haga nada ----

// Pone el anillo sobre un punto de la foto (fracciones), descontando las
// franjas de object-fit: contain.
function anilloEn(punto) {
  const foto = ui.ficha.foto;
  if (!foto.naturalWidth) return;
  const rc = foto.getBoundingClientRect();
  const escala = Math.min(rc.width / foto.naturalWidth, rc.height / foto.naturalHeight);
  const w = foto.naturalWidth * escala;
  const h = foto.naturalHeight * escala;
  ui.ficha.toque.style.left = (rc.width - w) / 2 + punto.x * w + 'px';
  ui.ficha.toque.style.top = (rc.height - h) / 2 + punto.y * h + 'px';
  ui.ficha.toque.hidden = false;
}

function pintarPlacaLeida() {
  const p = ficha.placaFoto;
  const nota = ui.ficha.placaNota;
  if (!p) {
    nota.hidden = true;
    return;
  }
  nota.hidden = false;
  if (p.estado === 'leyendo') nota.textContent = 'Vi la placa en la foto; la estoy leyendo…';
  else if (p.estado === 'error') nota.textContent = 'Vi la placa en la foto pero no pude leerla: escríbela.';
  else if (!p.leida) nota.textContent = 'Vi la placa en la foto pero no entendí el número' + (p.crudo ? ' (leí "' + p.crudo + '")' : '') + ': escríbela.';
  else if (ficha.placaPor === 'mano' && ui.ficha.placa.value.trim().toUpperCase() !== p.leida) nota.textContent = 'La foto decía ' + p.leida + '; queda la que escribiste.';
  else nota.textContent = 'Placa leída de la foto: ' + p.leida + '. Revísala: el lector se equivoca en una letra de vez en cuando.';
}

// La placa amarilla se ubica por color en un instante. Con ella: el
// emblema va encima (en la parrilla), así que se busca ahí sin que nadie
// toque nada; y la placa se endereza y se lee. Si la persona ya tocó el
// logo o eligió marca mientras tanto, lo suyo manda y lo automático no lo
// pisa. Sin placa a la vista (foto de lado), queda el toque de siempre.
async function leerPlacaYLogo(archivo) {
  const sesion = ficha;
  let ubicacion = null;
  try {
    const { ubicarPlaca } = await import('./placa-ocr.js');
    ubicacion = await ubicarPlaca(archivo);
  } catch (e) {
    console.warn('No se pudo buscar la placa:', e);
  }
  if (ficha !== sesion) return;
  if (!ubicacion) {
    ficha.placaFoto = null;
    pintarPlacaLeida();
    return;
  }
  ficha.placaFoto = { ubicacion, leida: '', crudo: '', estado: 'leyendo' };
  pintarPlacaLeida();

  // 1. El logo encima de la placa.
  if (!ficha.marcasLineas.length && !ficha.logo && ficha.toqueN === 0) {
    try {
      ui.ficha.pistaLogo.textContent = 'Buscando el logo encima de la placa…';
      const { reconocerMarcaCercaDePlaca } = await cargarReconocedor();
      const r = await reconocerMarcaCercaDePlaca(archivo, zonaDelLogo(ubicacion.placa), (texto, pct) => estadoFicha(texto, 10 + pct * 0.8));
      if (ficha !== sesion) return;
      if (r && ficha.toqueN === 0 && !ficha.marcasLineas.length) {
        anilloEn(r.punto);
        await aplicarLogo(r, sesion);
        if (!r.seguro) ui.ficha.pistaLogo.textContent = 'El logo encima de la placa no se ve claro · tócalo tú';
      } else if (!r) {
        ui.ficha.pistaLogo.textContent = 'Toca el logo de la marca';
      }
    } catch (e) {
      if (ficha !== sesion) return;
      console.warn('No se pudo buscar el logo encima de la placa:', e);
      ui.ficha.pistaLogo.textContent = 'Toca el logo de la marca';
    }
  }

  // 2. Leer la placa.
  try {
    const { leerPlacaDeFoto } = await import('./placa-ocr.js');
    // El avance de la lectura va en la nota de la placa, no en la línea de
    // estado general (que es la del reconocedor del carro).
    const lectura = await leerPlacaDeFoto(archivo, ubicacion, (texto) => {
      if (ficha === sesion) ui.ficha.placaNota.textContent = texto;
    });
    if (ficha !== sesion) return;
    ficha.placaFoto = { ubicacion, leida: (lectura && lectura.placa) || '', crudo: (lectura && lectura.crudo) || '', estado: 'leida' };
    if (ficha.placaFoto.leida && ficha.placaPor !== 'mano') {
      ui.ficha.placa.value = ficha.placaFoto.leida;
      ficha.placaPor = 'foto';
    }
    pintarPlacaLeida();
  } catch (e) {
    if (ficha !== sesion) return;
    console.warn('No se pudo leer la placa:', e);
    ficha.placaFoto = { ...ficha.placaFoto, estado: 'error' };
    pintarPlacaLeida();
  }
}

// Una foto tomada de cerca al emblema: el camino más seguro, porque el
// logo llena la imagen y no depende de dónde cayó el dedo.
async function fotoDelLogo(archivo) {
  if (!ficha) return;
  const sesion = ficha;
  const n = ++ficha.toqueN;
  ui.ficha.toque.hidden = true;
  ui.ficha.pistaLogo.textContent = 'Mirando la foto del logo…';
  ui.ficha.marcaTexto.textContent = 'Mirando la foto del logo…';
  try {
    const { reconocerMarcaEnFotoDeCerca } = await cargarReconocedor();
    const r = await reconocerMarcaEnFotoDeCerca(archivo, (texto, pct) => estadoFicha(texto, 10 + pct * 0.8));
    if (ficha !== sesion || ficha.toqueN !== n) return;
    await aplicarLogo(r, sesion);
  } catch (err) {
    if (ficha !== sesion) return;
    ui.ficha.pistaLogo.textContent = 'No pude mirar el logo';
    ui.ficha.marcaTexto.textContent = 'No pude mirar la foto del logo (' + err.message + '). Elige la marca abajo o escríbela.';
  }
}

// El toque sobre la foto: se convierte a un punto de la foto real, se
// marca con el anillo y se manda al reconocedor con el recorte del logo.
async function tocarLogo(e) {
  if (!ficha) return;
  const foto = ui.ficha.foto;
  if (!foto.naturalWidth) {
    ui.ficha.pistaLogo.textContent = 'Espera a que cargue la foto…';
    return;
  }
  const punto = puntoEnFoto(e.clientX, e.clientY, foto.getBoundingClientRect(), { width: foto.naturalWidth, height: foto.naturalHeight });
  if (!punto) {
    // La franja negra al lado de la foto no es foto.
    ui.ficha.pistaLogo.textContent = 'Toca encima del emblema, dentro de la foto';
    return;
  }
  const sesion = ficha;
  const n = ++ficha.toqueN;
  const marco = ui.ficha.marco.getBoundingClientRect();
  ui.ficha.toque.style.left = e.clientX - marco.left + 'px';
  ui.ficha.toque.style.top = e.clientY - marco.top + 'px';
  ui.ficha.toque.hidden = false;
  ui.ficha.toque.classList.add('mirando');
  ui.ficha.pistaLogo.textContent = 'Mirando el logo…';
  ui.ficha.marcaTexto.textContent = 'Mirando el logo…';
  try {
    const { reconocerMarcaPorLogo } = await cargarReconocedor();
    const r = await reconocerMarcaPorLogo(ficha.archivo, punto, (texto, pct) => estadoFicha(texto, 10 + pct * 0.8));
    if (ficha !== sesion || ficha.toqueN !== n) return; // otro toque, u otra foto
    ui.ficha.toque.classList.remove('mirando');
    await aplicarLogo(r, sesion);
  } catch (err) {
    if (ficha !== sesion) return;
    ui.ficha.toque.classList.remove('mirando');
    ui.ficha.pistaLogo.textContent = 'No pude mirar el logo';
    ui.ficha.marcaTexto.textContent = 'No pude mirar el logo (' + err.message + '). Elige la marca abajo o escríbela.';
  }
}

// Fija la marca a partir de lo escrito (sin tocar la línea, que ya quedó:
// actualizarSugerencias no elige sola porque la línea es de la persona).
function fijarMarcaEscrita(marcas) {
  ficha.marcasLineas = marcas;
  ficha.marcaPor = 'mano';
  ficha.marcaSoltada = false;
  llenarCatalogo(marcas);
  pintarMarcaTexto();
  pintarMarcas();
  actualizarSugerencias();
}

// Lo que escribió la persona en "Marca y línea". Si casa con el catálogo
// (nombre completo, marca + familia, o solo la línea cuando la marca ya se
// sabe), se toma la entrada entera, carrocería y medidas incluidas; si no,
// queda como texto libre. Lo escrito manda sobre la marca del logo: si
// escribe "Renault Logan" con la marca en Chevrolet, la marca pasa a
// Renault. Vaciar el campo es dejar el carro sin línea, y la app no lo
// vuelve a llenar. Y si el campo no cambió, no se toca nada: "Abrir en 3D"
// vuelve a llamar aquí y no debe pisar lo elegido.
function tomarLineaEscrita() {
  const texto = ui.ficha.linea.value.trim();
  if (texto === ficha.ultimoTexto) return;
  ficha.ultimoTexto = texto;
  if (!texto) {
    ficha.entrada = null;
    ficha.linea = '';
    ficha.medidas = null;
    ficha.lineaPor = 'mano';
    if (!ficha.marcasLineas.length) ficha.marca = '';
    pintarSugerencias();
    return;
  }
  const encontrada = entradaEscrita(texto, ficha.marcasLineas);
  if (encontrada) {
    elegirEntrada(encontrada, 'mano');
    if (!ficha.marcasLineas.includes(encontrada.marca)) fijarMarcaEscrita([encontrada.marca]);
    return;
  }
  // Texto libre: con la marca ya sabida y sin marca al inicio, es solo la
  // línea; si empieza por una marca, esa es la marca y el resto la línea.
  const [primera, ...resto] = texto.split(/\s+/);
  const marcaEscrita = marcaDelCatalogo(primera);
  ficha.entrada = null;
  ficha.medidas = null;
  ficha.lineaPor = 'mano';
  if (ficha.marcasLineas.length && !marcaEscrita) {
    ficha.linea = texto;
  } else {
    ficha.marca = marcaEscrita || primera;
    ficha.linea = resto.join(' ');
    if (marcaEscrita && !ficha.marcasLineas.includes(marcaEscrita)) fijarMarcaEscrita([marcaEscrita]);
    else if (!marcaEscrita) fijarMarcaEscrita([]);
  }
  pintarSugerencias();
}

async function abrirFicha(archivo) {
  if (urlFicha) URL.revokeObjectURL(urlFicha);
  urlFicha = URL.createObjectURL(archivo);
  ficha = {
    archivo,
    color: '',
    marca: '',
    linea: '',
    carroceria: '',
    medidas: null,
    entrada: null,
    sugerencias: [],
    lineaPor: '',
    carroceriaPor: '',
    marcasLineas: [],
    marcaPor: '',
    marcaSoltada: false,
    logo: null,
    logoSeguro: false,
    vector: null,
    carroceriaVotada: '',
    toqueN: 0,
    ultimoTexto: '',
    placaFoto: null, // { ubicacion, leida, crudo, estado }
    placaPor: '', // 'foto' (la leyó la app) o 'mano' (la escribió la persona)
  };
  ui.ficha.foto.src = urlFicha;
  ui.ficha.toque.hidden = true;
  ui.ficha.toque.classList.remove('mirando');
  ui.ficha.pistaLogo.textContent = 'Toca el logo de la marca';
  ui.ficha.placa.value = '';
  ui.ficha.linea.value = '';
  ui.ficha.version.value = '';
  ui.ficha.color.value = '#cfd4da';
  ui.ficha.colorNombre.textContent = 'plateado';
  ui.ficha.abrir.disabled = false;
  llenarCatalogo([]);
  pintarCarrocerias();
  pintarSugerencias();
  pintarMarcaTexto();
  pintarMarcas();
  pintarPlacaLeida();
  estadoFicha('Mirando el color…', 5);
  ui.ficha.dialogo.showModal();

  // La placa y el logo encima, en paralelo con el color y el carro entero.
  leerPlacaYLogo(archivo);

  try {
    const color = await colorDeFoto(archivo);
    ficha.color = color.hex;
    ui.ficha.color.value = color.hex;
    ui.ficha.colorNombre.textContent = color.nombre;
  } catch {
    // Sin color no pasa nada: la persona lo elige.
  }

  try {
    estadoFicha('Reconociendo el carro…', 10);
    const { reconocerCarro } = await cargarReconocedor();
    const resultado = await reconocerCarro(archivo, (texto, pct) => estadoFicha(texto, 10 + pct * 0.8));
    if (!ficha || ficha.archivo !== archivo) return; // la persona cerró o abrió otra foto
    ficha.vector = resultado.vector;
    if (resultado.carrocerias[0] && resultado.carrocerias[0].p > 0.6) {
      ficha.carroceriaVotada = resultado.carrocerias[0].tipo;
      if (ficha.carroceriaPor !== 'mano') {
        ficha.carroceria = ficha.carroceriaVotada;
        pintarCarrocerias();
      }
    }
    // Si ya tocó el logo (o eligió marca) mientras cargaba, las líneas de
    // esa marca se ordenan ahora por parecido con la foto; sin marca no se
    // propone ninguna (la marca por la foto entera no es de fiar).
    await actualizarSugerencias();
    pintarMarcaTexto();
    pintarMarcas();
    estadoFicha('Esto propone la app (' + (resultado.milisegundos / 1000).toFixed(1) + ' s). Corrige lo que no sea.', 100);
  } catch (e) {
    estadoFicha('No pude reconocer el carro (' + e.message + '). Escribe la marca y la línea.', 100);
  }
}

ui.nuevoConFoto.addEventListener('click', () => ui.fotoCarro.click());
ui.fotoCarro.addEventListener('change', () => {
  const archivo = ui.fotoCarro.files && ui.fotoCarro.files[0];
  ui.fotoCarro.value = '';
  if (archivo) abrirFicha(archivo);
});
ui.ficha.foto.addEventListener('click', tocarLogo);
// Lo que la persona escriba en la placa manda sobre lo leído.
ui.ficha.placa.addEventListener('input', () => {
  if (!ficha) return;
  ficha.placaPor = 'mano';
  pintarPlacaLeida();
});
ui.ficha.fotoLogo.addEventListener('click', () => ui.ficha.archivoLogo.click());
ui.ficha.archivoLogo.addEventListener('change', () => {
  const archivo = ui.ficha.archivoLogo.files && ui.ficha.archivoLogo.files[0];
  ui.ficha.archivoLogo.value = '';
  if (archivo) fotoDelLogo(archivo);
});

ui.ficha.color.addEventListener('input', () => {
  ficha.color = ui.ficha.color.value;
  ui.ficha.colorNombre.textContent = nombreDeColor(ficha.color);
});
ui.ficha.linea.addEventListener('change', tomarLineaEscrita);
ui.ficha.cancelar.addEventListener('click', () => ui.ficha.dialogo.close());
ui.ficha.dialogo.addEventListener('close', () => {
  ficha = null;
  ui.ficha.foto.removeAttribute('src');
  if (urlFicha) URL.revokeObjectURL(urlFicha);
  urlFicha = '';
});

ui.ficha.abrir.addEventListener('click', async () => {
  if (!ficha) return;
  tomarLineaEscrita();
  const placa = normalizarPlaca(ui.ficha.placa.value);
  ui.ficha.placa.value = placa;
  if (!placa) {
    ui.ficha.placa.focus();
    estadoFicha('Falta la placa.', 100);
    return;
  }
  if (!almacen) {
    estadoFicha('Este navegador no guarda el registro; no se puede crear el carro aquí.', 100);
    return;
  }
  ui.ficha.abrir.disabled = true;
  try {
    const datos = {
      marca: ficha.marca,
      linea: ficha.linea,
      version: ui.ficha.version.value.trim(),
      carroceria: ficha.carroceria,
      color: ficha.color,
      medidas: ficha.medidas,
    };
    const { carro } = await almacen.abrirOCrear(placa, datos);
    // La foto del carro se guarda como portada (reducida, como las demás) si
    // el carro no tenía una.
    estadoFicha('Guardando la foto…', 100);
    if (!(await almacen.portada(carro.placa))) {
      const reducida = await reducirFoto(ficha.archivo);
      await almacen.guardarFoto({ placa: carro.placa, pieza: PIEZA_CARRO, ...reducida });
    }
    location.href = enlaceAlVisor(carro.placa);
  } catch (e) {
    ui.ficha.abrir.disabled = false;
    estadoFicha('No se pudo crear el carro: ' + e.message, 100);
  }
});

// ---------- Arranque ----------

// El buscador de líneas: todo el catálogo, o solo las líneas de las marcas
// dadas cuando la marca ya se sabe (así "Captiva" no compite con 1.100).
function llenarCatalogo(marcas = []) {
  const entradas = marcas.length ? catalogoOrdenado().filter((e) => marcas.includes(e.marca)) : catalogoOrdenado();
  ui.ficha.lineas.replaceChildren(
    ...entradas.map((e) => {
      const opcion = document.createElement('option');
      opcion.value = nombreDeLinea(e);
      opcion.label = CARROCERIAS[normalizarCarroceria(e.carroceria)].nombre;
      return opcion;
    }),
  );
}

async function arrancar() {
  llenarCatalogo();
  try {
    almacen = await abrirAlmacen();
  } catch (e) {
    avisar('Este navegador no guarda el registro (' + e.message + '). Los carros no se pueden listar aquí.');
  }
  await pintar();
}

// Gancho para las pruebas automáticas.
window.__garaje = {
  listo: arrancar(),
  pintar,
  abrirFicha,
  get almacen() {
    return almacen;
  },
  get ficha() {
    return ficha;
  },
};
