// La pantalla Garaje: todos los carros del registro, la puerta por placa y
// la puerta con foto (la app propone qué carro es, de qué color y qué
// carrocería; la persona confirma).
//
// Esta pantalla no sabe de Three.js: lee el registro (garaje.js), pinta
// filas y manda al visor con ?placa=. El reconocedor (reconocer.js, con su
// motor de 28 MB y su modelo de 89 MB) se carga solo cuando alguien toca
// "Nuevo carro con foto": el Garaje tiene que abrir al instante.
import { CLAVE_GUARDADO, normalizarPlaca } from './estado.js';
import { PIEZA_CARRO, abrirAlmacen, deserializarCarro, fechaCorta, nombreDelCarro, resumen } from './garaje.js';
import { CARROCERIAS, normalizarCarroceria } from './carrocerias.js';
import { buscarLinea, catalogoOrdenado, datosDeEntrada, mejorDeFamilia, nombreDeLinea } from './catalogo.js';
import { colorDeFoto, nombreDeColor } from './color-foto.js';
import { reducirFoto } from './fotos.js';

const ui = {
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
    progreso: document.getElementById('ficha-progreso'),
    estado: document.getElementById('ficha-estado'),
    placa: document.getElementById('ficha-placa'),
    color: document.getElementById('ficha-color'),
    colorNombre: document.getElementById('ficha-color-nombre'),
    ayuda: document.getElementById('ficha-ayuda'),
    sugerencias: document.getElementById('ficha-sugerencias'),
    linea: document.getElementById('ficha-linea'),
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
  const fecha = document.createElement('time');
  fecha.dateTime = carro.actualizado;
  fecha.textContent = fechaCorta(carro.actualizado);

  const descripcion = document.createElement('span');
  descripcion.className = 'carro-marca';
  const partes = [nombreDelCarro(carro) || 'Sin marca'];
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
}

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

// Lo que la persona va confirmando en la ficha.
let ficha = null;
let urlFicha = '';

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
        pintarCarrocerias();
      });
      return b;
    }),
  );
}

function elegirEntrada(entrada) {
  const datos = datosDeEntrada(entrada);
  ficha.marca = datos.marca;
  ficha.linea = datos.linea;
  ficha.carroceria = datos.carroceria;
  ficha.medidas = datos.medidas;
  ficha.entrada = entrada;
  ui.ficha.linea.value = nombreDeLinea(entrada);
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
      const b = chip(s.marca + ' ' + s.linea, CARROCERIAS[normalizarCarroceria(s.carroceria)].nombre, activo);
      b.addEventListener('click', () => {
        if (entrada) elegirEntrada(entrada);
      });
      return b;
    }),
  );
}

// Lo que escribió la persona en "Marca y línea": si casa con el catálogo,
// se toma la entrada entera (carrocería y medidas incluidas); si no, queda
// como texto libre: primera palabra la marca, el resto la línea.
function tomarLineaEscrita() {
  const texto = ui.ficha.linea.value.trim();
  if (!texto) return;
  const encontrada = buscarLinea(texto, 1)[0];
  if (encontrada && nombreDeLinea(encontrada).toLowerCase() === texto.toLowerCase()) {
    elegirEntrada(encontrada);
    return;
  }
  const [marca, ...resto] = texto.split(/\s+/);
  ficha.marca = marca;
  ficha.linea = resto.join(' ');
  ficha.entrada = null;
  ficha.medidas = null;
  pintarSugerencias();
}

async function abrirFicha(archivo) {
  if (urlFicha) URL.revokeObjectURL(urlFicha);
  urlFicha = URL.createObjectURL(archivo);
  ficha = { archivo, color: '', marca: '', linea: '', carroceria: '', medidas: null, entrada: null, sugerencias: [] };
  ui.ficha.foto.src = urlFicha;
  ui.ficha.placa.value = '';
  ui.ficha.linea.value = '';
  ui.ficha.color.value = '#cfd4da';
  ui.ficha.colorNombre.textContent = 'plateado';
  ui.ficha.abrir.disabled = false;
  pintarCarrocerias();
  pintarSugerencias();
  estadoFicha('Mirando el color…', 5);
  ui.ficha.dialogo.showModal();

  try {
    const color = await colorDeFoto(archivo);
    ficha.color = color.hex;
    ui.ficha.color.value = color.hex;
    ui.ficha.colorNombre.textContent = color.nombre;
  } catch {
    // Sin color no pasa nada: la persona lo elige.
  }

  // El reconocedor se importa aquí y no arriba: su motor pesa 28 MB y solo
  // hace falta en este momento.
  try {
    estadoFicha('Reconociendo el carro…', 10);
    const { reconocerCarro } = await import('./reconocer.js');
    const resultado = await reconocerCarro(archivo, (texto, pct) => estadoFicha(texto, 10 + pct * 0.8));
    if (!ficha || ficha.archivo !== archivo) return; // la persona cerró o abrió otra foto
    ficha.sugerencias = resultado.lineas.slice(0, 6);
    const mejor = resultado.lineas[0] && mejorDeFamilia(resultado.lineas[0].marca, resultado.lineas[0].linea);
    if (mejor) elegirEntrada(mejor);
    // La carrocería que más votos tiene manda sobre la de la línea: desde el
    // frente, un sedán y un hatchback se parecen, y ahí la foto sabe más.
    if (resultado.carrocerias[0] && resultado.carrocerias[0].p > 0.6) {
      ficha.carroceria = resultado.carrocerias[0].tipo;
      pintarCarrocerias();
    }
    pintarSugerencias();
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
    const datos = { marca: ficha.marca, linea: ficha.linea, carroceria: ficha.carroceria, color: ficha.color, medidas: ficha.medidas };
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

function llenarCatalogo() {
  ui.ficha.lineas.replaceChildren(
    ...catalogoOrdenado().map((e) => {
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
