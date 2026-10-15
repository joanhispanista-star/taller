// La pantalla del tablero: tres pestañas sobre el mismo registro. Empleados
// (la nómina de la semana), Historial (los carros entregados y lo que se
// cobró) e Indicadores (todo junto, para el dueño). Los números los calcula
// tablero.js (puro y probado); aquí solo se lee el almacén y se pinta. Sin
// Three.js: esta pantalla tiene que abrir al instante.
import { NOMBRE_ROL, abrirAlmacen, fechaCorta, nombreCompletoDelCarro, resumen } from './garaje.js';
import { CARROCERIAS, nombreDePiezaEn, normalizarCarroceria } from './carrocerias.js';
import { nombreDeColor } from './color-foto.js';
import { etiquetaDeSemana, historial, indicadores, nominaSemanal, pesos, semanaDe } from './tablero.js';
import { cargarDemo, estadoDemo } from './demo.js';

const $ = (id) => document.getElementById(id);
const ui = {
  subtitulo: $('subtitulo'),
  aviso: $('aviso'),
  pestanas: document.querySelector('.pestanas'),
  // Empleados
  semanaAntes: $('semana-antes'),
  semanaDespues: $('semana-despues'),
  semanaHoy: $('semana-hoy'),
  semanaEtiqueta: $('semana-etiqueta'),
  nominaTotal: $('nomina-total'),
  nominaPiezas: $('nomina-piezas'),
  nomina: $('nomina'),
  nominaVacia: $('nomina-vacia'),
  sinPintor: $('sin-pintor'),
  sinPintorLista: document.querySelector('#sin-pintor ul'),
  nuevoEmpleado: $('nuevo-empleado'),
  empleadoNombre: $('empleado-nombre'),
  empleadoRol: $('empleado-rol'),
  // Historial
  histCarros: $('hist-carros'),
  histCobrado: $('hist-cobrado'),
  histVacio: $('hist-vacio'),
  histLista: $('hist-lista'),
  // Indicadores
  rangos: document.querySelector('.rangos'),
  indEnTaller: $('ind-en-taller'),
  indEntregados: $('ind-entregados'),
  indTerminadas: $('ind-terminadas'),
  indCobrado: $('ind-cobrado'),
  indPagado: $('ind-pagado'),
  indMargen: $('ind-margen'),
  indNota: $('ind-nota'),
  seriePiezas: $('serie-piezas'),
  serieCobrado: $('serie-cobrado'),
  indTallerVacio: $('ind-taller-vacio'),
  indTaller: $('ind-taller'),
  // Demo
  demo: $('demo'),
  demoTexto: $('demo-texto'),
  demoBoton: $('demo-boton'),
};

const PESTANAS = ['empleados', 'historial', 'indicadores'];
const TITULOS = { empleados: 'Empleados', historial: 'Historial', indicadores: 'Indicadores' };

let almacen = null;
let carros = [];
let empleados = [];
let pestana = 'empleados';
let desplazamiento = 0; // semanas respecto a la actual (0 = esta, -1 = la pasada)
let rango = 'todo';

function avisar(texto) {
  ui.aviso.textContent = texto;
  ui.aviso.hidden = !texto;
}

function enlaceAlVisor(placa) {
  return 'index.html?placa=' + encodeURIComponent(placa);
}

function elemento(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function insigniaDemo() {
  return elemento('small', 'insignia-demo', 'demo');
}

function descripcionDe(carro) {
  const partes = [nombreCompletoDelCarro(carro) || 'Sin marca'];
  if (carro.carroceria) partes.push(CARROCERIAS[normalizarCarroceria(carro.carroceria)].nombre);
  if (carro.color) partes.push(nombreDeColor(carro.color));
  return partes.join(' · ');
}

// ---------- Pestañas ----------

function mostrar(nombre) {
  pestana = PESTANAS.includes(nombre) ? nombre : 'empleados';
  for (const seccion of document.querySelectorAll('.pestana')) seccion.hidden = seccion.id !== pestana;
  for (const a of ui.pestanas.querySelectorAll('a')) {
    if (a.dataset.pestana === pestana) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  ui.subtitulo.textContent = TITULOS[pestana];
  document.title = 'Taller de Pintura · ' + TITULOS[pestana];
  const url = new URL(location.href);
  url.searchParams.set('p', pestana);
  history.replaceState(null, '', url);
  return pintar();
}

ui.pestanas.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-pestana]');
  if (!a) return;
  e.preventDefault();
  mostrar(a.dataset.pestana);
});

// ---------- Empleados ----------

function pintarEmpleados() {
  const semana = semanaDe(new Date(), desplazamiento);
  const prefijo = desplazamiento === 0 ? 'Esta semana · ' : desplazamiento === -1 ? 'Semana pasada · ' : '';
  ui.semanaEtiqueta.textContent = prefijo + etiquetaDeSemana(semana);
  ui.semanaHoy.hidden = desplazamiento === 0;
  ui.semanaDespues.disabled = desplazamiento >= 0;

  const nomina = nominaSemanal(carros, empleados, semana);
  ui.nominaTotal.textContent = pesos(nomina.total);
  const terminadas = nomina.filas.reduce((s, f) => s + f.piezas.length, 0) + nomina.sinPintor.length;
  ui.nominaPiezas.textContent = String(terminadas) + (nomina.porDefinir ? ' · ' + nomina.porDefinir + ' por definir' : '');
  ui.nominaVacia.hidden = empleados.length > 0;
  ui.nomina.replaceChildren(...nomina.filas.map(filaEmpleado));

  ui.sinPintor.hidden = nomina.sinPintor.length === 0;
  ui.sinPintorLista.replaceChildren(
    ...nomina.sinPintor.map((d) => {
      const li = elemento('li');
      const a = elemento('a', '', d.placa);
      a.href = enlaceAlVisor(d.placa);
      li.append(a, ' · ' + nombreDePiezaEn(d.carro.carroceria, d.id) + ' · ' + fechaCorta(d.pieza.desde));
      return li;
    }),
  );
}

function filaEmpleado(fila) {
  const { empleado } = fila;
  const li = elemento('li', 'empleado' + (empleado.activo ? '' : ' retirado'));
  const detalles = elemento('details');
  const cabecera = elemento('summary');

  const nombre = elemento('span', 'empleado-nombre', empleado.nombre);
  if (empleado.demo) nombre.append(insigniaDemo());
  const rol = elemento('span', 'empleado-rol', NOMBRE_ROL[empleado.rol] + (empleado.activo ? '' : ' · retirado'));
  const total = elemento('span', 'empleado-total', pesos(fila.total));
  const cuantas = fila.piezas.length;
  const nota = elemento('small', '', cuantas === 0 ? 'sin piezas' : cuantas === 1 ? '1 pieza' : cuantas + ' piezas');
  if (fila.porDefinir) nota.textContent += ' · ' + fila.porDefinir + ' por definir';
  total.append(nota);
  cabecera.append(nombre, rol, total);

  const lista = elemento('ul', 'piezas-pagadas');
  if (fila.piezas.length === 0) {
    lista.append(elemento('li', 'vacia', 'Sin piezas terminadas esta semana.'));
  }
  for (const d of fila.piezas) {
    const item = elemento('li');
    const placa = elemento('a', '', d.placa);
    placa.href = enlaceAlVisor(d.placa);
    const pieza = elemento('span', 'pieza-nombre', nombreDePiezaEn(d.carro.carroceria, d.id));
    const fecha = elemento('time', '', fechaCorta(d.pieza.desde));
    fecha.dateTime = d.pieza.desde;
    const pago = elemento('span', 'pago' + (d.pago ? '' : ' por-definir'));
    pago.textContent = d.pago ? pesos(d.pago) : d.pieza.trabajo === 'latoneria' ? 'latonería · por definir' : 'interior · por definir';
    item.append(placa, pieza, fecha, pago);
    lista.append(item);
  }

  const acciones = elemento('div', 'empleado-acciones');
  const retirar = elemento('button', '', empleado.activo ? 'Retirar' : 'Reincorporar');
  retirar.type = 'button';
  retirar.addEventListener('click', async () => {
    await almacen.guardarEmpleado({ ...empleado, activo: !empleado.activo });
    await recargar();
  });
  const borrar = elemento('button', '', 'Borrar');
  borrar.type = 'button';
  borrar.addEventListener('click', async () => {
    const aviso = '¿Borrar a ' + empleado.nombre + '? Sus piezas quedan sin pintor asignado. No se puede deshacer.';
    if (!confirm(aviso)) return;
    await almacen.borrarEmpleado(empleado.id);
    await recargar();
  });
  acciones.append(retirar, borrar);

  detalles.append(cabecera, lista, acciones);
  li.append(detalles);
  return li;
}

ui.semanaAntes.addEventListener('click', () => {
  desplazamiento -= 1;
  pintarEmpleados();
});
ui.semanaDespues.addEventListener('click', () => {
  if (desplazamiento >= 0) return;
  desplazamiento += 1;
  pintarEmpleados();
});
ui.semanaHoy.addEventListener('click', () => {
  desplazamiento = 0;
  pintarEmpleados();
});

ui.nuevoEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = ui.empleadoNombre.value.trim();
  if (!nombre) {
    ui.empleadoNombre.focus();
    return;
  }
  if (!almacen) {
    avisar('Este navegador no guarda el registro; no se pueden agregar empleados aquí.');
    return;
  }
  try {
    await almacen.guardarEmpleado({ nombre, rol: ui.empleadoRol.value });
    ui.empleadoNombre.value = '';
    await recargar();
  } catch (error) {
    avisar('No se pudo guardar: ' + error.message);
  }
});

// ---------- Historial ----------

function pintarHistorial() {
  const filas = historial(carros);
  ui.histCarros.textContent = String(filas.length);
  ui.histCobrado.textContent = pesos(filas.reduce((s, f) => s + f.cobro, 0));
  ui.histVacio.hidden = filas.length > 0;
  ui.histLista.replaceChildren(...filas.map(filaHistorial));
}

function cuenta(estado, n, singular, plural) {
  return elemento('span', 'cuenta estado-' + estado + (n === 0 ? ' vacia' : ''), n + ' ' + (n === 1 ? singular : plural));
}

function cuadroColor(carro) {
  const portada = elemento('div', 'carro-portada');
  if (carro.color) portada.style.background = carro.color;
  return portada;
}

function filaHistorial(f) {
  const { carro } = f;
  const li = elemento('li');
  const enlace = elemento('a', 'carro');
  enlace.href = enlaceAlVisor(carro.placa);

  const placa = elemento('strong', '', carro.placa);
  if (carro.demo) placa.append(' ', insigniaDemo());
  const fecha = elemento('time', '', 'entregado ' + fechaCorta(f.fecha));
  fecha.dateTime = f.fecha;
  const descripcion = elemento('span', 'carro-marca', descripcionDe(carro));

  const cuentas = elemento('div', 'cuentas');
  cuentas.append(
    elemento('span', 'cuenta cuenta-latoneria', f.piezas + (f.piezas === 1 ? ' pieza' : ' piezas')),
    cuenta('terminada', f.terminadas, 'terminada', 'terminadas'),
  );
  if (f.pendientes) cuentas.append(cuenta('pendiente', f.pendientes, 'sin hacer', 'sin hacer'));
  if (f.latoneria) cuentas.append(elemento('span', 'cuenta cuenta-latoneria', f.latoneria + ' con latonería'));

  const plata = elemento('div', 'plata');
  const cobro = elemento('span', '', 'Cobrado ');
  cobro.append(elemento('b', '', pesos(f.cobro)));
  const pagado = elemento('span', '', 'Pintores ');
  pagado.append(elemento('b', '', pesos(f.pagado)));
  const queda = elemento('span', '', 'Queda ');
  queda.append(elemento('b', f.margen >= 0 ? 'queda' : 'falta', pesos(f.margen)));
  plata.append(cobro, pagado, queda);

  enlace.append(cuadroColor(carro), placa, fecha, descripcion, cuentas, plata);
  li.append(enlace);
  return li;
}

// ---------- Indicadores ----------

function rangoActual() {
  const ahora = new Date();
  if (rango === 'semana') return { desde: semanaDe(ahora).inicio };
  if (rango === 'mes') return { desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1) };
  return {};
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pintarIndicadores() {
  const { desde } = rangoActual();
  const ind = indicadores(carros, { desde, semanas: 8 });
  ui.indEnTaller.textContent = String(ind.carros.enTaller);
  ui.indEntregados.textContent = String(ind.carros.entregados);
  ui.indTerminadas.textContent = String(ind.piezas.terminadas);
  ui.indCobrado.textContent = pesos(ind.cobrado);
  ui.indPagado.textContent = pesos(ind.pagado);
  ui.indMargen.textContent = pesos(ind.margen);

  const partes = [];
  if (desde) {
    partes.push(
      'Entregas, piezas terminadas y plata desde el ' + desde.getDate() + ' de ' + MESES_LARGOS[desde.getMonth()] + '; los carros en el taller se cuentan siempre.',
    );
  } else {
    partes.push('Todo lo registrado.');
  }
  partes.push(ind.piezas.enProceso + ' en proceso y ' + ind.piezas.pendientes + ' pendientes en el taller.');
  if (ind.porDefinir) {
    partes.push(
      ind.porDefinir + (ind.porDefinir === 1 ? ' pieza terminada' : ' piezas terminadas') + ' de latonería o interior sin tarifa todavía: no están en "pagado".',
    );
  }
  partes.push('"Queda" no descuenta materiales.');
  ui.indNota.textContent = partes.join(' ');

  pintarSerie(ui.seriePiezas, ind.serie, (s) => s.terminadas, (n) => String(n));
  pintarSerie(ui.serieCobrado, ind.serie, (s) => s.cobrado, (n) => (n ? pesos(n).replace('$ ', '') : '0'));

  ui.indTallerVacio.hidden = ind.enTaller.length > 0;
  ui.indTaller.replaceChildren(...ind.enTaller.map(filaEnTaller));
}

// Barras a mano (sin librería): ocho columnas, alto proporcional al máximo.
function pintarSerie(contenedor, serie, valorDe, formato) {
  const max = Math.max(1, ...serie.map(valorDe));
  contenedor.replaceChildren(
    ...serie.map((s) => {
      const valor = valorDe(s);
      const columna = elemento('div', 'columna' + (valor === 0 ? ' vacia' : ''));
      columna.title = s.etiqueta + ': ' + formato(valor);
      const cifra = elemento('b', '', formato(valor));
      const barra = elemento('div', 'barra');
      barra.style.height = Math.max(2, Math.round((valor / max) * 100)) + '%';
      const inicio = s.semana.inicio;
      const etiqueta = elemento('small', '', inicio.getDate() + ' ' + MESES[inicio.getMonth()]);
      columna.append(cifra, barra, etiqueta);
      return columna;
    }),
  );
}

function filaEnTaller(carro) {
  const li = elemento('li');
  const enlace = elemento('a', 'carro');
  enlace.href = enlaceAlVisor(carro.placa);
  const placa = elemento('strong', '', carro.placa);
  if (carro.demo) placa.append(' ', insigniaDemo());
  const fecha = elemento('time', '', fechaCorta(carro.actualizado));
  fecha.dateTime = carro.actualizado;
  const descripcion = elemento('span', 'carro-marca', descripcionDe(carro));
  const cuentas = elemento('div', 'cuentas');
  const r = resumen(carro);
  if (r.total === 0) cuentas.textContent = 'Sin piezas marcadas';
  else {
    cuentas.append(
      cuenta('pendiente', r.pendientes, 'pendiente', 'pendientes'),
      cuenta('en-proceso', r.enProceso, 'en proceso', 'en proceso'),
      cuenta('terminada', r.terminadas, 'terminada', 'terminadas'),
    );
    if (r.latoneria) cuentas.append(elemento('span', 'cuenta cuenta-latoneria', r.latoneria + ' con latonería'));
  }
  enlace.append(cuadroColor(carro), placa, fecha, descripcion, cuentas);
  li.append(enlace);
  return li;
}

ui.rangos.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rango]');
  if (!b) return;
  rango = b.dataset.rango;
  for (const otro of ui.rangos.querySelectorAll('button')) otro.setAttribute('aria-pressed', String(otro === b));
  pintarIndicadores();
});

// ---------- Demostración ----------

async function pintarDemo() {
  if (!almacen) {
    ui.demo.hidden = true;
    return;
  }
  const estado = await estadoDemo(almacen);
  if (estado.carros + estado.empleados > 0) {
    ui.demoTexto.textContent =
      'Hay ' + estado.carros + ' carros y ' + estado.empleados + ' empleados de demostración (los marcados «demo»). Lo real no se toca al quitarlos.';
    ui.demoBoton.textContent = 'Quitar la demostración';
    ui.demoBoton.dataset.accion = 'quitar';
    ui.demo.hidden = false;
  } else {
    ui.demoTexto.textContent =
      'Para ver estas pestañas con algo adentro puedes cargar 5 carros y 3 empleados de demostración. Se quitan en bloque cuando quieras.';
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
    await recargar();
  } catch (e) {
    avisar('No se pudo: ' + e.message);
  } finally {
    ui.demoBoton.disabled = false;
  }
});

// ---------- Arranque ----------

async function cargar() {
  if (!almacen) return;
  carros = await almacen.listar();
  empleados = await almacen.listarEmpleados();
}

async function pintar() {
  if (pestana === 'empleados') pintarEmpleados();
  else if (pestana === 'historial') pintarHistorial();
  else pintarIndicadores();
  await pintarDemo();
}

async function recargar() {
  await cargar();
  await pintar();
}

async function arrancar() {
  try {
    almacen = await abrirAlmacen();
  } catch (e) {
    avisar('Este navegador no guarda el registro (' + e.message + '). Aquí no hay nada que mostrar.');
  }
  await cargar();
  await mostrar(new URL(location.href).searchParams.get('p') || 'empleados');
}

// Gancho para las pruebas automáticas.
window.__tablero = {
  listo: arrancar(),
  mostrar,
  recargar,
  get carros() {
    return carros;
  },
  get empleados() {
    return empleados;
  },
  get almacen() {
    return almacen;
  },
};
