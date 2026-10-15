// La pantalla Garaje: todos los carros del registro y la puerta para abrir
// uno por placa (si existe se abre el que había; si no, se crea).
//
// Esta pantalla no sabe de Three.js: lee el registro (garaje.js), pinta
// filas y manda al visor con ?placa=. Lo demás pasa allá.
import { CLAVE_GUARDADO, normalizarPlaca } from './estado.js';
import { abrirAlmacen, deserializarCarro, fechaCorta, resumen } from './garaje.js';

const ui = {
  formulario: document.getElementById('registro'),
  placa: document.getElementById('placa'),
  marca: document.getElementById('marca'),
  lista: document.getElementById('carros'),
  vacio: document.getElementById('vacio'),
  borrador: document.getElementById('borrador'),
  aviso: document.getElementById('aviso'),
};

let almacen = null;

function avisar(texto) {
  ui.aviso.textContent = texto;
  ui.aviso.hidden = !texto;
}

function enlaceAlVisor(placa) {
  return 'index.html?placa=' + encodeURIComponent(placa);
}

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

function fila(carro) {
  const item = document.createElement('li');

  const enlace = document.createElement('a');
  enlace.className = 'carro';
  enlace.href = enlaceAlVisor(carro.placa);

  const placa = document.createElement('strong');
  placa.textContent = carro.placa;
  const fecha = document.createElement('time');
  fecha.dateTime = carro.actualizado;
  fecha.textContent = fechaCorta(carro.actualizado);
  const marca = document.createElement('span');
  marca.className = 'carro-marca';
  marca.textContent = carro.marca || 'Sin marca';

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

  enlace.append(placa, fecha, marca, cuentas);

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

async function arrancar() {
  try {
    almacen = await abrirAlmacen();
  } catch (e) {
    avisar('Este navegador no guarda el registro (' + e.message + '). Los carros no se pueden listar aquí.');
  }
  await pintar();
}

// Gancho para las pruebas automáticas.
window.__garaje = { listo: arrancar(), pintar, get almacen() { return almacen; } };
