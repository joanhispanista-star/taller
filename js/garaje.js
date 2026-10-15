// El registro de carros del taller: cada carro por placa, con el estado de
// cada pieza, guardado en el teléfono.
//
// Dos mitades a propósito:
//
// - El MODELO (crearCarro, alternarPieza, fijarEstado, resumen...): funciones
//   puras sobre un objeto plano, sin DOM ni base de datos, probadas en Node.
//   Es el mismo objeto que guarda el almacén y el que la semana del 26 viaja
//   a la nube; por eso no tiene clases ni Sets, solo lo que cabe en JSON.
// - El ALMACÉN (abrirAlmacen): ese objeto en IndexedDB. IndexedDB y no
//   localStorage porque las fotos de las piezas pesan unos 200 KB cada una
//   y localStorage tope en unos 5 MB en total: con veinte fotos se llena.
//
// La placa es la llave: si la placa ya existe se abre el que había. El visor
// sigue aceptando un carro sin placa (un borrador en localStorage, como
// antes), pero sin placa no entra al registro ni puede tener fotos.
import { PIEZAS, PIEZAS_POR_ID } from './piezas.js';
import { crearEstado, normalizarPlaca } from './estado.js';
import { normalizarCarroceria } from './carrocerias.js';

// Las fotos van por pieza; esta "pieza" especial es la foto del carro
// entero (la que toma el dueño al registrarlo).
export const PIEZA_CARRO = 'carro';

export const ESTADOS = ['pendiente', 'en-proceso', 'terminada'];
export const NOMBRE_ESTADO = {
  pendiente: 'Pendiente',
  'en-proceso': 'En proceso',
  terminada: 'Terminada',
};

// Qué trabajo lleva la pieza: solo pintura, o latonería (enderezar el
// golpe) y después pintura. La nómina de la semana del 26 lo necesita:
// la latonería se paga aparte de los 90.000 de la pintura.
export const TRABAJOS = ['pintura', 'latoneria'];
export const NOMBRE_TRABAJO = {
  pintura: 'Solo pintura',
  latoneria: 'Latonería y pintura',
};

export const NOMBRE_BD = 'taller-pintura';
export const VERSION_BD = 1;

// ---------- Modelo ----------

function fechaValida(valor) {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor)) ? valor : null;
}

function limpiarMarca(valor) {
  return typeof valor === 'string' ? valor.slice(0, 40) : '';
}

function limpiarColor(valor) {
  return typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor.toLowerCase() : '';
}

// Medidas de la línea (del catálogo), en milímetros. Solo las que vengan
// como número positivo; si no viene ninguna, null y el visor usa las
// típicas de la carrocería.
function limpiarMedidas(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const medidas = {};
  let alguna = false;
  for (const campo of ['largo', 'ancho', 'alto', 'entreEjes']) {
    const n = Number(valor[campo]);
    if (n > 0) {
      medidas[campo] = n;
      alguna = true;
    }
  }
  return alguna ? medidas : null;
}

// Las piezas se guardan como objeto { id: { estado, desde } } y no como
// lista: así "¿está marcado el capó?" es una mirada y el JSON se lee solo.
// Acepta también el formato viejo del borrador (`seleccion: [ids]`, el del
// visor del 15 de octubre): esas piezas entran como pendientes.
function limpiarPiezas(piezas, seleccion, ahora) {
  const limpias = {};
  if (piezas && typeof piezas === 'object' && !Array.isArray(piezas)) {
    for (const [id, datos] of Object.entries(piezas)) {
      if (!PIEZAS_POR_ID.has(id)) continue;
      const estado = datos && ESTADOS.includes(datos.estado) ? datos.estado : ESTADOS[0];
      const trabajo = datos && TRABAJOS.includes(datos.trabajo) ? datos.trabajo : TRABAJOS[0];
      limpias[id] = { estado, desde: (datos && fechaValida(datos.desde)) || ahora, trabajo };
    }
  } else if (Array.isArray(seleccion)) {
    for (const id of seleccion) {
      if (PIEZAS_POR_ID.has(id)) limpias[id] = { estado: ESTADOS[0], desde: ahora, trabajo: TRABAJOS[0] };
    }
  }
  return limpias;
}

// Un carro limpio a partir de lo que sea (un registro guardado, un borrador
// viejo, nada). Nunca lanza: lo que no sirve se descarta.
export function crearCarro(datos = {}, ahora = new Date().toISOString()) {
  const creado = fechaValida(datos.creado) || ahora;
  return {
    placa: normalizarPlaca(datos.placa),
    marca: limpiarMarca(datos.marca),
    // Línea (Onix, Logan...), carrocería y color vienen del catálogo y de la
    // foto; vacíos significan "no se sabe", y el visor dibuja el sedán gris.
    linea: limpiarMarca(datos.linea),
    // La versión es texto libre del dueño ("5 puestos", "LT 2023"): el
    // catálogo no distingue versiones y es lo que diferencia dos carros de
    // la misma línea.
    version: limpiarMarca(datos.version),
    carroceria: typeof datos.carroceria === 'string' && datos.carroceria ? normalizarCarroceria(datos.carroceria) : '',
    color: limpiarColor(datos.color),
    medidas: limpiarMedidas(datos.medidas),
    creado,
    actualizado: fechaValida(datos.actualizado) || creado,
    piezas: limpiarPiezas(datos.piezas, datos.seleccion, ahora),
  };
}

// Lo que se ve en una fila o en una ficha: "Chevrolet Onix" o solo la marca.
export function nombreDelCarro(carro) {
  return [carro.marca, carro.linea].map((t) => (t || '').trim()).filter(Boolean).join(' ');
}

// Con la versión, si la hay: "Chevrolet Captiva (nueva) · 5 puestos".
export function nombreCompletoDelCarro(carro) {
  return [nombreDelCarro(carro), (carro.version || '').trim()].filter(Boolean).join(' · ');
}

export function tienePieza(carro, id) {
  return Object.hasOwn(carro.piezas, id);
}

// Marca la pieza (pendiente) o la quita. Devuelve true si quedó marcada.
export function alternarPieza(carro, id, ahora = new Date().toISOString()) {
  if (!PIEZAS_POR_ID.has(id)) return false;
  if (tienePieza(carro, id)) {
    delete carro.piezas[id];
    return false;
  }
  carro.piezas[id] = { estado: ESTADOS[0], desde: ahora, trabajo: TRABAJOS[0] };
  return true;
}

// Cambia el estado de una pieza; si no estaba marcada, la marca con ese
// estado. `desde` es la fecha del último cambio: la nómina de la semana
// del 26 necesita saber cuándo se terminó cada pieza. Devuelve true si
// algo cambió.
export function fijarEstado(carro, id, estado, ahora = new Date().toISOString()) {
  if (!PIEZAS_POR_ID.has(id) || !ESTADOS.includes(estado)) return false;
  const actual = carro.piezas[id];
  if (actual && actual.estado === estado) return false;
  carro.piezas[id] = { trabajo: TRABAJOS[0], ...actual, estado, desde: ahora };
  return true;
}

// Cambia el trabajo de una pieza (solo pintura, o latonería y pintura); si
// no estaba marcada, la marca pendiente con ese trabajo. No mueve `desde`:
// decir que una pieza necesita latonería no es avanzar en ella.
export function fijarTrabajo(carro, id, trabajo, ahora = new Date().toISOString()) {
  if (!PIEZAS_POR_ID.has(id) || !TRABAJOS.includes(trabajo)) return false;
  const actual = carro.piezas[id];
  if (actual && actual.trabajo === trabajo) return false;
  carro.piezas[id] = actual ? { ...actual, trabajo } : { estado: ESTADOS[0], desde: ahora, trabajo };
  return true;
}

export function siguienteEstado(estado) {
  const i = ESTADOS.indexOf(estado);
  return ESTADOS[(i + 1) % ESTADOS.length];
}

export function quitarTodas(carro) {
  carro.piezas = {};
}

// En el orden del catálogo, con el estado de cada una (en estado.js está el
// porqué del orden: la lista siempre se lee igual).
export function piezasDelCarro(carro) {
  return PIEZAS.filter((p) => tienePieza(carro, p.id)).map((p) => ({ ...p, ...carro.piezas[p.id] }));
}

export function resumen(carro) {
  const cuenta = { total: 0, pendientes: 0, enProceso: 0, terminadas: 0, latoneria: 0 };
  for (const { estado, trabajo } of Object.values(carro.piezas)) {
    cuenta.total += 1;
    if (estado === 'pendiente') cuenta.pendientes += 1;
    else if (estado === 'en-proceso') cuenta.enProceso += 1;
    else cuenta.terminadas += 1;
    if (trabajo === 'latoneria') cuenta.latoneria += 1;
  }
  return cuenta;
}

// El nombre de la pieza como va en la orden al asistente: con "(latonería y
// pintura)" cuando hay que enderezar antes de pintar.
export function nombreDePiezaEnOrden(carro, id, nombreBase) {
  const pieza = carro.piezas[id];
  return pieza && pieza.trabajo === 'latoneria' ? nombreBase + ' (latonería y pintura)' : nombreBase;
}

// La orden para el asistente sale del mismo texto de siempre
// (textoParaAsistente, en estado.js); esto convierte el carro del registro
// al estado que esa función entiende.
export function estadoParaOrden(carro) {
  // La orden lleva el carro completo ("Chevrolet Captiva (nueva) · 5
  // puestos"), no solo la marca: el asistente tiene que saber cuál es.
  return crearEstado({ placa: carro.placa, marca: nombreCompletoDelCarro(carro), seleccion: Object.keys(carro.piezas) });
}

export function serializarCarro(carro) {
  return JSON.stringify(crearCarro(carro));
}

// Nunca revienta: un borrador corrupto, vacío o del formato viejo devuelve
// un carro limpio en vez de dejar el visor en blanco.
export function deserializarCarro(texto) {
  try {
    const datos = JSON.parse(texto);
    return crearCarro(datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {});
  } catch {
    return crearCarro();
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "hoy 10:32", "ayer 16:05", "12 oct" o "12 oct 2025": lo que cabe en la
// fila del Garaje y le dice al dueño cuándo se movió el carro por última vez.
export function fechaCorta(iso, ahora = new Date()) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const inicio = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicio(ahora) - inicio(fecha)) / 86400000);
  const hora = fecha.getHours() + ':' + String(fecha.getMinutes()).padStart(2, '0');
  if (dias === 0) return 'hoy ' + hora;
  if (dias === 1) return 'ayer ' + hora;
  const dia = fecha.getDate() + ' ' + MESES[fecha.getMonth()];
  return fecha.getFullYear() === ahora.getFullYear() ? dia : dia + ' ' + fecha.getFullYear();
}

// ---------- Almacén (IndexedDB) ----------

// Una petición de IndexedDB como promesa. Las peticiones de una misma
// transacción se pueden encadenar con await: la transacción sigue viva
// mientras cada respuesta encole la siguiente petición sin esperar nada
// externo (un fetch o un setTimeout en medio sí la cerrarían).
function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error || new Error('IndexedDB falló'));
  });
}

function esperarTransaccion(tx) {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error || new Error('La transacción falló'));
    tx.onabort = () => rechazar(tx.error || new Error('La transacción se canceló'));
  });
}

// Abre (o crea) la base de datos y devuelve el almacén. `indexedDB` se
// inyecta para probarlo en Node con fake-indexeddb; en el navegador se toma
// el de verdad.
export function abrirAlmacen({ indexedDB: fabrica = globalThis.indexedDB, nombre = NOMBRE_BD } = {}) {
  if (!fabrica) return Promise.reject(new Error('Este navegador no tiene IndexedDB'));
  return new Promise((resolver, rechazar) => {
    let peticion;
    try {
      peticion = fabrica.open(nombre, VERSION_BD);
    } catch (e) {
      rechazar(e);
      return;
    }
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('carros')) {
        bd.createObjectStore('carros', { keyPath: 'placa' });
      }
      if (!bd.objectStoreNames.contains('fotos')) {
        const fotos = bd.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
        fotos.createIndex('placa', 'placa');
      }
    };
    peticion.onsuccess = () => resolver(crearAlmacen(peticion.result));
    peticion.onerror = () => rechazar(peticion.error || new Error('No se pudo abrir el registro'));
    peticion.onblocked = () => rechazar(new Error('El registro está abierto en otra pestaña con una versión vieja'));
  });
}

function crearAlmacen(bd) {
  // Si otra pestaña sube la versión de la base, esta se cierra para no
  // bloquearla; la siguiente operación aquí fallará y la pantalla lo dirá.
  bd.onversionchange = () => bd.close();

  const carros = (modo = 'readonly') => bd.transaction('carros', modo).objectStore('carros');
  const fotos = (modo = 'readonly') => bd.transaction('fotos', modo).objectStore('fotos');

  async function obtener(placa) {
    const clave = normalizarPlaca(placa);
    if (!clave) return null;
    const registro = await pedir(carros().get(clave));
    return registro ? crearCarro(registro) : null;
  }

  // Guarda el carro (lo pisa si ya estaba) con la fecha de actualización.
  // Devuelve la copia limpia que quedó guardada.
  async function guardar(carro, ahora = new Date().toISOString()) {
    const limpio = crearCarro({ ...carro, actualizado: ahora });
    if (!limpio.placa) throw new Error('Un carro sin placa no se puede guardar en el registro');
    carro.actualizado = limpio.actualizado;
    await pedir(carros('readwrite').put(limpio));
    return limpio;
  }

  // El registro por placa: si existe, se abre el que había (y toma los datos
  // que no tenía: marca, línea, carrocería, color, medidas); si no, se crea.
  // `datos` puede ser solo la marca (texto) o un objeto con esos campos.
  // Devuelve { carro, nuevo }.
  async function abrirOCrear(placa, datos = '') {
    const clave = normalizarPlaca(placa);
    if (!clave) throw new Error('Falta la placa');
    const nuevos = crearCarro(typeof datos === 'string' ? { marca: datos } : datos);
    const existente = await obtener(clave);
    if (existente) {
      let cambio = false;
      for (const campo of ['marca', 'linea', 'version', 'carroceria', 'color', 'medidas']) {
        if (!existente[campo] && nuevos[campo]) {
          existente[campo] = nuevos[campo];
          cambio = true;
        }
      }
      if (cambio) await guardar(existente);
      return { carro: existente, nuevo: false };
    }
    const nuevo = await guardar(crearCarro({ ...nuevos, placa: clave, piezas: {} }));
    return { carro: nuevo, nuevo: true };
  }

  // Del más reciente al más viejo: el carro que se tocó hoy va arriba.
  async function listar() {
    const todos = await pedir(carros().getAll());
    return todos
      .map((registro) => crearCarro(registro))
      .sort((a, b) => (a.actualizado < b.actualizado ? 1 : a.actualizado > b.actualizado ? -1 : 0));
  }

  // Borra el carro y todas sus fotos en una sola transacción: o se va todo
  // o no se va nada.
  async function borrar(placa) {
    const clave = normalizarPlaca(placa);
    if (!clave) return;
    const tx = bd.transaction(['carros', 'fotos'], 'readwrite');
    const fin = esperarTransaccion(tx);
    tx.objectStore('carros').delete(clave);
    const claves = await pedir(tx.objectStore('fotos').index('placa').getAllKeys(clave));
    for (const id of claves) tx.objectStore('fotos').delete(id);
    await fin;
  }

  // Una foto de una pieza de un carro. `foto` es la imagen reducida (1280 px
  // de lado mayor) y `miniatura` la pequeña para la lista; las dos son
  // Blobs y van tal cual a IndexedDB. Devuelve el id de la foto.
  async function guardarFoto({ placa, pieza, foto, miniatura, ancho = 0, alto = 0 }, ahora = new Date().toISOString()) {
    const clave = normalizarPlaca(placa);
    if (!clave) throw new Error('Una foto necesita la placa del carro');
    if (!PIEZAS_POR_ID.has(pieza) && pieza !== PIEZA_CARRO) throw new Error('Pieza fuera del catálogo: ' + pieza);
    if (!foto) throw new Error('Falta la foto');
    return pedir(fotos('readwrite').add({ placa: clave, pieza, foto, miniatura: miniatura || foto, ancho, alto, creado: ahora }));
  }

  // Las fotos de un carro, de la más vieja a la más nueva (el id crece con
  // cada foto).
  async function listarFotos(placa) {
    const clave = normalizarPlaca(placa);
    if (!clave) return [];
    const lista = await pedir(fotos().index('placa').getAll(clave));
    return lista.sort((a, b) => a.id - b.id);
  }

  async function borrarFoto(id) {
    await pedir(fotos('readwrite').delete(id));
  }

  // La foto del carro entero (la del registro), o null si no la hay.
  async function portada(placa) {
    const lista = await listarFotos(placa);
    return lista.find((f) => f.pieza === PIEZA_CARRO) || null;
  }

  return {
    obtener,
    guardar,
    abrirOCrear,
    listar,
    borrar,
    guardarFoto,
    listarFotos,
    borrarFoto,
    portada,
    cerrar: () => bd.close(),
  };
}
