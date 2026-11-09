// La pantalla del tablero: cuatro pestañas sobre el mismo registro. Vehículos
// (los modelos que la app ya trae en 3D), Empleados (la nómina de la semana),
// Historial (los carros entregados y lo que se cobró) e Indicadores (todo
// junto, para el dueño). Los números los calcula tablero.js (puro y
// probado); aquí solo se lee el almacén y se pinta. Sin Three.js: esta
// pantalla tiene que abrir al instante.
import { NOMBRE_ROL, TARIFA_PIEZA, abrirAlmacen, crearCarro, fechaCorta, mensajeParaLaPantalla, nombreCompletoDelCarro, resumen, serializarCarro } from './garaje.js';
import { CARROCERIAS, nombreDePiezaEn, normalizarCarroceria } from './carrocerias.js';
import { datosDeEntrada, entradaDe } from './catalogo.js';
import { CATALOGO } from './catalogo-carros.js';
import { nombreDeColor } from './color-foto.js';
import { CLAVE_GUARDADO, normalizarPlaca } from './estado.js';
import { MODELOS, MODELOS_EN_OBRA, anosDelModelo, colorQueSeVe, datosParaUsarModelo, modeloParecido, modeloQueLeToca, textoDelCredito, textosDeLaTarjeta } from './modelos-catalogo.js';
import { etiquetaDeSemana, historial, indicadores, nominaSemanal, pesos, semanaDe } from './tablero.js';
import { asegurarCarroDeMuestra, cargarDemo, carroDeMuestra, estadoDemo, ofertaDeLaDemo, quitarLaDemostracion } from './demo.js';
import { porQueNoSeVeria } from './enlace-prueba.js';

const $ = (id) => document.getElementById(id);
const ui = {
  subtitulo: $('subtitulo'),
  aviso: $('aviso'),
  pestanas: document.querySelector('.pestanas'),
  // Vehículos
  vehiculosLista: $('vehiculos-lista'),
  vehiculosEnObra: $('vehiculos-en-obra'),
  vehiculosEnObraLista: document.querySelector('#vehiculos-en-obra ul'),
  vehiculosDemas: $('vehiculos-demas'),
  vehiculosEnlace: $('vehiculos-enlace'),
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
  demoQuitar: $('demo-quitar'),
};

const PESTANAS = ['vehiculos', 'empleados', 'historial', 'indicadores'];
const TITULOS = { vehiculos: 'Vehículos', empleados: 'Empleados', historial: 'Historial', indicadores: 'Indicadores' };

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
  const color = colorQueSeVe(carro);
  if (color) partes.push(nombreDeColor(color));
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

// ---------- Vehículos ----------

// "1.136", como se escriben las cifras aquí.
const conPuntos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Autor, licencia con su enlace, lo que se les hizo a las fotos y que no es oficial: la miniatura sale de esas fotos (CC BY 3.0),
// y donde va ella va su crédito. Como en el diálogo de Escanear (escaneo-pantalla.js), con nodos y no innerHTML.
function creditoDe(modelo) {
  const c = modelo.credito;
  const enlace = (texto, href) => Object.assign(elemento('a', '', texto), { href, target: '_blank', rel: 'noopener' });
  const [antes, despues] = textoDelCredito(modelo).split(c.licencia);
  const caja = elemento('div', 'ayuda credito-modelo');
  const parrafo = elemento('span');
  parrafo.append(antes, enlace(c.licencia, c.enlaceLicencia), despues);
  const fotos = elemento('details');
  const lista = elemento('ul');
  lista.append(...c.fotos.map((f) => {
    const renglon = elemento('li');
    renglon.append(enlace(f.nombre, f.enlace));
    return renglon;
  }));
  fotos.append(elemento('summary', '', c.fotos.length === 1 ? 'La foto' : 'Las ' + c.fotos.length + ' fotos'), lista);
  caja.append(parrafo, fotos);
  return caja;
}

function tarjetaDeModelo(modelo) {
  const t = textosDeLaTarjeta(modelo);
  const muestra = carroDeMuestra(modelo);
  const tarjeta = elemento('article', 'vehiculo');
  const foto = elemento('img', 'vehiculo-foto');
  foto.src = modelo.miniatura;
  foto.alt = t.nombre + ' en 3D';
  foto.width = 700;
  foto.height = 380;
  const cuerpo = elemento('div', 'vehiculo-cuerpo');
  const ver = elemento('button', 'primario', 'Ver en 3D');
  ver.type = 'button';
  ver.addEventListener('click', () => verEn3D(modelo, ver));
  // El segundo botón de la maqueta A aprobada: ponerle este modelo a un carro del taller sin pasar por Datos del carro, que en
  // un carro creado como "Chevrolet Captiva" dejaba la carrocería de cajas (ver textosDeLaTarjeta).
  const usar = elemento('button', 'secundario', 'Usar en un carro');
  usar.type = 'button';
  usar.setAttribute('aria-expanded', 'false');
  const caja = elemento('div', 'usar-en');
  caja.hidden = true;
  usar.addEventListener('click', () => alternarUsar(modelo, usar, caja));
  const botones = elemento('div', 'vehiculo-botones');
  botones.append(ver, usar);
  cuerpo.append(elemento('span', 'chip-3d', 'En 3D de verdad'), elemento('strong', '', t.nombre), elemento('span', 'vehiculo-detalle', t.detalle), botones);
  // Lo que pasa al tocarlo, antes de tocarlo: aparece un carro en el Garaje, y se tiene que saber de dónde salió y cómo se va.
  if (muestra) cuerpo.append(elemento('p', 'ayuda', 'Abre ' + muestra.placa + ', un carro de demostración que se quita en bloque.'));
  // La lista de "Usar en un carro" va debajo de esa nota, que es del primer botón, y encima de lo que explica el segundo.
  cuerpo.append(caja, elemento('p', 'ayuda', t.uso), creditoDe(modelo));
  tarjeta.append(foto, cuerpo);
  return { tarjeta, usar, caja };
}

// "Usar en un carro": los carros del taller de este teléfono (los de demostración no: esos se quitan en bloque), cada uno con
// lo que va a pasar. `placaPedida`: la del enlace de prueba, que puede no estar en este teléfono; entonces se ofrece crearla.
async function alternarUsar(modelo, boton, caja, placaPedida = '') {
  const abrir = caja.hidden;
  caja.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  if (abrir) await pintarUsar(modelo, caja, placaPedida);
}

// Los carros que tienen su propio escaneo: en ellos manda el escaneo (escaneo-pantalla.js) y la línea nueva no cambia lo que
// se ve, así que se dice. Si la base de los escaneos no contesta en 3 s, no se dice nada: no se sabe.
async function placasConEscaneo() {
  let escaneos = null;
  try {
    escaneos = await Promise.race([import('./escaneos.js').then((m) => m.abrirEscaneos()), new Promise((_, no) => setTimeout(() => no(new Error('tarde')), 3000))]);
    return new Set(await escaneos.placas());
  } catch {
    return new Set();
  } finally {
    if (escaneos) escaneos.cerrar();
  }
}

async function pintarUsar(modelo, caja, placaPedida) {
  const linea = modelo.marca + ' ' + modelo.linea;
  if (!almacen) {
    caja.replaceChildren(elemento('p', 'ayuda', 'El registro de este celular no abre: aquí no hay carros del taller a los que ponérsela.'));
    return;
  }
  const reales = carros.filter((c) => !c.demo);
  const escaneados = await placasConEscaneo();
  const opciones = reales.map((carro) => {
    const li = elemento('li');
    const yaLaTiene = modeloQueLeToca(carro) === modelo;
    const escaneado = escaneados.has(carro.placa);
    // Con la línea puesta y su propio escaneo, al abrirlo sale el escaneo y no este modelo: "ya la tiene" a secas
    // prometería algo que no se ve.
    const textoYa = escaneado ? 'tiene la línea, pero se ve su escaneo: abrir' : 'ya la tiene: abrir';
    const b = elemento('button', '', carro.placa + ' · ' + (yaLaTiene ? textoYa : nombreCompletoDelCarro(carro) || 'sin marca ni línea'));
    b.type = 'button';
    b.addEventListener('click', () => (yaLaTiene ? (location.href = enlaceAlVisor(carro.placa)) : usarEn(modelo, carro, b)));
    li.append(b);
    if (!yaLaTiene && escaneado) li.append(elemento('small', '', 'Tiene su propio escaneo, y se sigue viendo el escaneo.'));
    if (carro.placa === placaPedida) li.className = 'pedido';
    return li;
  });
  if (placaPedida && !carros.some((c) => c.placa === placaPedida)) {
    const li = elemento('li', 'pedido');
    const b = elemento('button', '', 'Crear ' + placaPedida + ' como ' + linea);
    b.type = 'button';
    b.addEventListener('click', () => crearCon(modelo, placaPedida, b));
    li.append(b);
    opciones.unshift(li);
  }
  if (!opciones.length) {
    caja.replaceChildren(elemento('p', 'ayuda', 'No hay carros del taller en este celular. Se agregan en el Garaje, por placa o con foto.'));
    return;
  }
  const lista = elemento('ul');
  lista.append(...opciones);
  // Con solo la placa del enlace por crear, "las piezas se quedan" no tendría de qué hablar.
  const intro = reales.length ? '¿En cuál? Le pone la línea «' + linea + '» con su carrocería y sus medidas. Las piezas marcadas y el color se quedan.' : 'Se crea con la línea «' + linea + '», su carrocería y sus medidas.';
  caja.replaceChildren(elemento('p', 'ayuda', intro), lista);
}

// Como "Es de esos años: usar ese modelo" en el visor (datosParaUsarModelo): la línea del catálogo, y lo que tenía escrito de
// más pasa a la versión. Se pregunta antes: cambia los datos de un carro real.
async function usarEn(modelo, carro, boton) {
  const linea = modelo.marca + ' ' + modelo.linea;
  if (!confirm('¿Ponerle a ' + carro.placa + ' la línea «' + linea + '»? Cambian su marca, línea, carrocería y medidas; las piezas marcadas y el color se quedan.')) return;
  boton.disabled = true;
  try {
    await almacen.guardar(crearCarro({ ...carro, ...datosParaUsarModelo(carro, modelo) }));
    location.href = enlaceAlVisor(carro.placa);
  } catch (e) {
    avisar('No se pudo: ' + mensajeParaLaPantalla(e, 'vuelve a intentarlo.'));
    boton.disabled = false;
  }
}

async function crearCon(modelo, placa, boton) {
  boton.disabled = true;
  try {
    const { carro } = await almacen.abrirOCrear(placa, datosDeEntrada(entradaDe(modelo.marca, modelo.linea)));
    location.href = enlaceAlVisor(carro.placa);
  } catch (e) {
    avisar('No se pudo: ' + mensajeParaLaPantalla(e, 'vuelve a intentarlo.'));
    boton.disabled = false;
  }
}

// Llegó del enlace de prueba (probar-carro.html?placa=...) con una placa que en este teléfono no se vería: se dice por qué,
// con sus palabras, y se abre "Usar en un carro" con esa placa a mano (js/enlace-prueba.js).
function pintarEnlace(tarjetas) {
  const placa = normalizarPlaca(new URL(location.href).searchParams.get('placa') || '');
  const carro = placa ? carros.find((c) => c.placa === placa) : null;
  const porQue = placa ? porQueNoSeVeria(carro) : '';
  ui.vehiculosEnlace.hidden = !porQue;
  if (!porQue) return;
  const modelo = (carro && modeloParecido(carro)) || MODELOS[0];
  const i = MODELOS.indexOf(modelo);
  const salia = ', y por eso el enlace mostraba el carro de siempre';
  const motivo =
    porQue === 'no-esta'
      ? 'En este celular no hay ningún carro ' + placa + salia + ' (Safari y la app de la pantalla de inicio guardan los carros aparte).'
      : porQue === 'sin-datos'
        ? placa + ' está en este celular sin marca ni línea' + salia + '.'
        : placa + ' dice «' + nombreCompletoDelCarro(carro) + '», sin decir si es la ' + anosDelModelo(modelo) + salia + '.';
  ui.vehiculosEnlace.textContent = motivo + ' «Ver en 3D» muestra ' + modelo.corto + ', y abajo puedes ' + (porQue === 'no-esta' ? 'crear ' + placa + ' con ella.' : 'ponérsela a ' + placa + '.');
  if (tarjetas[i]) alternarUsar(modelo, tarjetas[i].usar, tarjetas[i].caja, placa);
}

function pintarVehiculos() {
  const tarjetas = MODELOS.map(tarjetaDeModelo);
  ui.vehiculosLista.replaceChildren(...tarjetas.map((t) => t.tarjeta));
  pintarEnlace(tarjetas);
  ui.vehiculosEnObra.hidden = MODELOS_EN_OBRA.length === 0;
  ui.vehiculosEnObraLista.replaceChildren(
    ...MODELOS_EN_OBRA.map((m) => {
      const li = elemento('li');
      li.append(elemento('strong', '', m.nombre), elemento('span', '', m.de));
      return li;
    }),
  );
  // Lo que hay para un carro exacto, sin prometer un camino que el teléfono no tiene: el escáner de la app pide un Android con
  // ARCore (en un iPhone sale apagado), y subir un archivo de RealityScan todavía no se ha probado con uno sacado de un celular.
  ui.vehiculosDemas.textContent =
    'Las demás líneas del catálogo (' + conPuntos(CATALOGO.length - MODELOS.length) + ') se ven con la carrocería de referencia. Para un carro exacto hay que escanearlo: con la app, en un Android con ARCore, o con RealityScan subiendo el archivo, que todavía no se ha probado con uno sacado de un celular. En el carro, «Escanear» dice cómo.';
}

// Sin registro, el carro va como borrador, que es de donde lee el visor cuando el registro no abre (lo mismo que hace el
// Garaje). Da false si tampoco hay dónde dejarlo.
function dejarBorrador(carro) {
  try {
    localStorage.setItem(CLAVE_GUARDADO, serializarCarro(carro));
    return true;
  } catch {
    return false;
  }
}

// "Ver en 3D" abre el carro de muestra del modelo (DEM006 para la Captiva), y no una placa del taller: así se ve el modelo sin
// depender de cómo esté guardado otro carro en este teléfono. Si no está, se crea solo él (asegurarCarroDeMuestra); nada más
// de la demostración, y nada real. Si esa placa la tiene un carro del taller, no se abre: sería abrir ese carro (con la
// carrocería que le toque) mientras la tarjeta promete uno de demostración.
async function verEn3D(modelo, boton) {
  const muestra = carroDeMuestra(modelo);
  if (!muestra) return;
  boton.disabled = true;
  avisar('');
  try {
    if (almacen) {
      try {
        const { carro, como } = await asegurarCarroDeMuestra(almacen, modelo);
        if (como === 'real') {
          avisar('Ya hay un carro del taller con la placa ' + carro.placa + ', que es la de la muestra de ' + modelo.corto + ': no se abre, para no tocar ese carro. Para verla en uno tuyo, toca «Usar en un carro».');
          if (ui.aviso.scrollIntoView) ui.aviso.scrollIntoView({ block: 'nearest' });
          return;
        }
        location.href = enlaceAlVisor(carro.placa);
        return;
      } catch (error) {
        console.warn(error);
      }
    }
    if (dejarBorrador(muestra)) {
      location.href = enlaceAlVisor(muestra.placa);
      return;
    }
    avisar('Este navegador no deja guardar nada, ni el carro de muestra: el 3D abriría sin el modelo. Puede ser una ventana de incógnito.');
  } finally {
    boton.disabled = false;
  }
}

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
  ui.nominaPiezas.textContent = String(terminadas) + (nomina.sinPintor.length ? ' · ' + nomina.sinPintor.length + ' sin pintor' : '');
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
    // El nombre de la pieza y, si llevó latonería, se dice: paga igual, pero
    // es más trabajo y el dueño quiere verlo.
    const pieza = elemento('span', 'pieza-nombre', nombreDePiezaEn(d.carro.carroceria, d.id) + (d.pieza.trabajo === 'latoneria' ? ' · latonería' : ''));
    const fecha = elemento('time', '', fechaCorta(d.pieza.desde));
    fecha.dateTime = d.pieza.desde;
    const pago = elemento('span', 'pago', pesos(d.pago));
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
    avisar('No se pudo guardar: ' + mensajeParaLaPantalla(error, 'vuelve a intentarlo.'));
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
  const color = colorQueSeVe(carro);
  if (color) portada.style.background = color;
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
  partes.push('"Pagado a pintores" es cada pieza terminada a ' + pesos(TARIFA_PIEZA) + ', latonería e interior incluidos. "Queda" no descuenta materiales.');
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

// En el tablero se ofrece siempre, también con carros reales: aquí no hay una lista de carros debajo que haga dudar.
async function pintarDemo() {
  if (!almacen) {
    ui.demo.hidden = true;
    return;
  }
  const oferta = ofertaDeLaDemo(await estadoDemo(almacen));
  ui.demoTexto.textContent = oferta.texto;
  ui.demoBoton.textContent = oferta.boton;
  ui.demoBoton.dataset.accion = oferta.accion;
  ui.demoQuitar.hidden = !oferta.quitarAparte;
  ui.demo.hidden = false;
}

async function demoHacer(accion, boton) {
  if (!almacen) return;
  boton.disabled = true;
  try {
    if (accion === 'quitar') {
      if (!confirm('¿Quitar los carros y empleados de demostración? Lo real se queda.')) return;
      await quitarLaDemostracion(almacen);
    } else {
      await cargarDemo(almacen);
    }
    await recargar();
  } catch (e) {
    avisar('No se pudo: ' + mensajeParaLaPantalla(e, 'vuelve a intentarlo.'));
  } finally {
    boton.disabled = false;
  }
}

ui.demoBoton.addEventListener('click', () => demoHacer(ui.demoBoton.dataset.accion, ui.demoBoton));
ui.demoQuitar.addEventListener('click', () => demoHacer('quitar', ui.demoQuitar));

// ---------- Arranque ----------

async function cargar() {
  if (!almacen) return;
  carros = await almacen.listar();
  empleados = await almacen.listarEmpleados();
}

async function pintar() {
  if (pestana === 'vehiculos') pintarVehiculos();
  else if (pestana === 'empleados') pintarEmpleados();
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
    // En Vehículos sí hay algo: la tarjeta, y "Ver en 3D" abre la muestra como borrador. "Nada que mostrar" encima de ella mentía.
    const enVehiculos = new URL(location.href).searchParams.get('p') === 'vehiculos';
    avisar('Este navegador no guarda el registro: ' + mensajeParaLaPantalla(e, 'puede ser una ventana de incógnito o que falte espacio') + (enVehiculos ? '. «Ver en 3D» abre la muestra como borrador, sin quedar en el Garaje.' : '. Aquí no hay nada que mostrar.'));
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
