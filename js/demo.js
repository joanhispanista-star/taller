// Carros y empleados de demostración: para ver el Garaje, la nómina, el
// historial y los indicadores con algo adentro antes de que el taller los
// llene. Todo lo que crea lleva `demo: true` y se quita en bloque desde el
// tablero; lo real nunca se toca. Las fechas se calculan hacia atrás desde
// hoy, así la demostración siempre cae en las últimas semanas.
//
// Sin DOM: lo usan el Garaje, el tablero y las pruebas.
import { datosDeEntrada, entradaDe } from './catalogo.js';
import { CLAVE_GUARDADO } from './estado.js';
import { crearCarro, crearEmpleado, deserializarCarro } from './garaje.js';
import { modeloDeLaLinea, modeloQueLeToca } from './modelos-catalogo.js';

const DIA = 86400000;

function hace(dias, horas = 10, ahora = new Date()) {
  const d = new Date(ahora.getTime() - dias * DIA);
  d.setHours(horas, 0, 0, 0);
  return d.toISOString();
}

export const EMPLEADOS_DEMO = [
  { id: 'demo-carlos', nombre: 'Carlos Pérez', rol: 'pintor' },
  { id: 'demo-yeison', nombre: 'Yeison Rojas', rol: 'pintor' },
  { id: 'demo-andres', nombre: 'Andrés Mora', rol: 'latonero' },
];

// Cada carro: datos del catálogo, color, piezas con estado, trabajo, pintor
// y fecha, cobro y entrega. Las piezas en los carros entregados quedan
// terminadas (menos una pendiente en uno, para que el historial muestre
// cómo se ve un carro que salió con algo sin hacer).
export function carrosDemo(ahora = new Date()) {
  const f = (dias, horas) => hace(dias, horas, ahora);
  return [
    crearCarro({
      placa: 'DEM001',
      marca: 'Chevrolet',
      linea: 'Onix (hatchback 2ª generación)',
      version: '2022',
      carroceria: 'hatchback',
      color: '#b8232a',
      medidas: { largo: 4163, ancho: 1730, alto: 1470, entreEjes: 2551 },
      cobro: 1250000,
      entregado: f(2, 16),
      demo: true,
      creado: f(9),
      actualizado: f(2, 16),
      piezas: {
        capo: { estado: 'terminada', desde: f(4, 15), trabajo: 'latoneria', pintor: 'demo-carlos' },
        'bomper-del': { estado: 'terminada', desde: f(3, 11), trabajo: 'pintura', pintor: 'demo-carlos' },
        'guardafango-del-izq': { estado: 'terminada', desde: f(3, 17), trabajo: 'pintura', pintor: 'demo-yeison' },
      },
    }),
    crearCarro({
      placa: 'DEM002',
      marca: 'Renault',
      linea: 'Logan II',
      version: '2019',
      carroceria: 'sedan',
      color: '#f2f2f0',
      medidas: { largo: 4359, ancho: 1733, alto: 1517, entreEjes: 2634 },
      cobro: 2100000,
      entregado: f(6, 17),
      demo: true,
      creado: f(14),
      actualizado: f(6, 17),
      piezas: {
        'puerta-del-der': { estado: 'terminada', desde: f(8, 10), trabajo: 'latoneria', pintor: 'demo-yeison' },
        'puerta-tras-der': { estado: 'terminada', desde: f(8, 14), trabajo: 'pintura', pintor: 'demo-yeison' },
        'costado-der': { estado: 'terminada', desde: f(7, 12), trabajo: 'pintura', pintor: 'demo-carlos' },
        'bomper-tras': { estado: 'terminada', desde: f(7, 16), trabajo: 'pintura', pintor: 'demo-carlos' },
        'espejo-der': { estado: 'pendiente', desde: f(14), trabajo: 'pintura', pintor: '' },
      },
    }),
    crearCarro({
      placa: 'DEM003',
      marca: 'Mazda',
      linea: 'CX-30',
      version: '2021',
      carroceria: 'suv',
      color: '#6d7278',
      medidas: { largo: 4395, ancho: 1795, alto: 1540, entreEjes: 2655 },
      cobro: 0,
      demo: true,
      creado: f(3),
      actualizado: f(0, 9),
      piezas: {
        techo: { estado: 'en-proceso', desde: f(1, 8), trabajo: 'pintura', pintor: 'demo-carlos' },
        capo: { estado: 'terminada', desde: f(1, 15), trabajo: 'pintura', pintor: 'demo-carlos' },
        'puerta-del-izq': { estado: 'pendiente', desde: f(3), trabajo: 'latoneria', pintor: 'demo-andres' },
        'puerta-del-izq-int': { estado: 'pendiente', desde: f(3), trabajo: 'pintura', pintor: '' },
      },
    }),
    crearCarro({
      placa: 'DEM004',
      marca: 'Toyota',
      linea: 'Hilux (AN120) doble cabina',
      version: '2018',
      carroceria: 'camioneta',
      color: '#1b1d21',
      medidas: { largo: 5325, ancho: 1855, alto: 1815, entreEjes: 3085 },
      cobro: 0,
      demo: true,
      creado: f(1),
      actualizado: f(1),
      piezas: {
        baul: { estado: 'pendiente', desde: f(1), trabajo: 'latoneria', pintor: '' },
        'costado-izq': { estado: 'pendiente', desde: f(1), trabajo: 'pintura', pintor: '' },
        'bomper-tras': { estado: 'en-proceso', desde: f(0, 8), trabajo: 'pintura', pintor: 'demo-yeison' },
      },
    }),
    crearCarro({
      placa: 'DEM005',
      marca: 'Kia',
      linea: 'Picanto (3ª gen JA) / New Picanto',
      version: '2020',
      carroceria: 'hatchback',
      color: '#1f4e9c',
      medidas: { largo: 3595, ancho: 1595, alto: 1485, entreEjes: 2400 },
      cobro: 780000,
      entregado: f(12, 18),
      demo: true,
      creado: f(16),
      actualizado: f(12, 18),
      piezas: {
        'puerta-tras-izq': { estado: 'terminada', desde: f(13, 11), trabajo: 'pintura', pintor: 'demo-yeison' },
        'estribo-izq': { estado: 'terminada', desde: f(13, 16), trabajo: 'pintura', pintor: 'demo-yeison' },
      },
    }),
    // La Captiva de la pestaña Vehículos: "Ver en 3D" abre este carro, y si no está lo crea solo a él. La línea, la
    // carrocería y las medidas salen del catálogo, tal cual: con otra cosa en la línea no le tocaría el modelo
    // (modelos-catalogo.js) y se vería la carrocería de referencia, que es justo lo que este carro viene a evitar.
    // Sin color elegido: sale en el café del modelo, el de la foto de verdad, y así lo nombran el Garaje y el Historial
    // (colorQueSeVe). Ninguna pieza terminada y ningún pintor, a propósito: "Ver en 3D" lo crea solo, sin los empleados
    // de la demostración, muchas veces dentro de un taller real. Con un pintor de la demostración que ahí no existe, el
    // menú del capó ofrecía solo a los pintores reales, y un toque en Terminada lo dejaba "sin pintor" pidiendo que se
    // lo asignaran a uno de ellos (revisión del 9-nov; la nómina además ya no le paga a nadie real un carro de
    // demostración, ver tablero.js). Lo pendiente y lo en proceso no entra a la nómina: el carro es el mismo con o sin el
    // resto de la demostración.
    crearCarro({
      placa: 'DEM006',
      ...datosDeEntrada(entradaDe('Chevrolet', 'Captiva (nueva)')),
      version: 'LT 2020',
      color: '',
      cobro: 0,
      demo: true,
      creado: f(2),
      actualizado: f(1, 16),
      piezas: {
        capo: { estado: 'en-proceso', desde: f(1, 15), trabajo: 'pintura', pintor: '' },
        'puerta-del-der': { estado: 'pendiente', desde: f(2), trabajo: 'latoneria', pintor: '' },
        'guardafango-del-der': { estado: 'pendiente', desde: f(2), trabajo: 'pintura', pintor: '' },
      },
    }),
  ];
}

export function empleadosDemo(ahora = new Date()) {
  return EMPLEADOS_DEMO.map((e) => crearEmpleado({ ...e, demo: true }, ahora.toISOString()));
}

// Mete en el almacén lo que falta de la demostración, y solo eso. No pisa
// un carro real con la misma placa (las placas DEM0xx no existen en
// Colombia, pero por si acaso), ni uno de demostración que ya esté: "Cargar
// el resto" le devolvía a DEM006 sus piezas de fábrica y se llevaba lo que
// alguien marcó para probar (revisión del 9-nov). Ni un empleado de la
// demostración que ya esté.
export async function cargarDemo(almacen, ahora = new Date()) {
  let carros = 0;
  for (const carro of carrosDemo(ahora)) {
    if (await almacen.obtener(carro.placa)) continue;
    await almacen.guardar(carro, carro.actualizado);
    carros += 1;
  }
  const ya = new Set((await almacen.listarEmpleados()).map((e) => e.id));
  let empleados = 0;
  for (const e of empleadosDemo(ahora)) {
    if (ya.has(e.id)) continue;
    await almacen.guardarEmpleado(e);
    empleados += 1;
  }
  return { carros, empleados };
}

// Qué hay de demostración en el almacén, para el botón de cargar/quitar:
// cuántos carros y empleados demo, si el registro está vacío del todo, y
// cuánto falta para tenerla entera. Falta desde el 9-nov: "Ver en 3D" de la
// pestaña Vehículos crea solo su carro, y con eso la demostración queda a
// medias. Una placa que ocupa un carro real no "falta": cargarDemo no la pisa.
export async function estadoDemo(almacen, ahora = new Date()) {
  const carros = await almacen.listar();
  const empleados = await almacen.listarEmpleados();
  const placas = new Set(carros.map((c) => c.placa));
  const ids = new Set(empleados.map((e) => e.id));
  return {
    carros: carros.filter((c) => c.demo).length,
    empleados: empleados.filter((e) => e.demo).length,
    vacio: carros.length === 0 && empleados.length === 0,
    hayCarros: carros.length > 0,
    faltanCarros: carrosDemo(ahora).filter((c) => !placas.has(c.placa)).length,
    placas: [...placas],
    faltanEmpleados: EMPLEADOS_DEMO.filter((e) => !ids.has(e.id)).length,
  };
}

const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

// Cómo se ven estos carros, dicho así: cuántos salen en 3D de verdad (con el modelo de su línea) y cuántos con la carrocería
// de referencia. Joan pidió carros "reales, no carritos de juguete", y de los 6 de la demostración solo la Captiva tiene modelo:
// cargarlos sin decirlo era prometerle lo contrario de lo que iba a ver (revisión del 9-nov).
export function comoSeVen(carros) {
  const deVerdad = carros.filter((c) => modeloQueLeToca(c));
  const resto = carros.length - deVerdad.length;
  if (!resto) return deVerdad.length === 1 ? 'sale en 3D de verdad' : 'salen todos en 3D de verdad';
  if (!deVerdad.length) return (resto === 1 ? 'se ve' : 'se ven') + ' con la carrocería de referencia, no en 3D de verdad';
  const nombres = [...new Set(deVerdad.map((c) => modeloQueLeToca(c).corto))].join(' y ');
  return deVerdad.length + ' en 3D de verdad (' + nombres + ') y ' + resto + ' con la carrocería de referencia';
}

// Lo que dice y ofrece el bloque de la demostración, igual en el Garaje y en
// el tablero: el texto, el botón principal (`accion` 'cargar' o 'quitar', con
// su `boton`) y si va además "Quitar la demostración" aparte (`quitarAparte`,
// solo a medias: el principal carga el resto). Se ofrece siempre, también
// con carros reales en el Garaje: es decisión de Joan (15-oct: "ya tiene su
// Captiva y aun así quiere ver los carros demo al lado"), y el 9-nov volvió
// a pedir "vehículos en garaje como demo de prueba". Una revisión la había
// escondido el 5-nov (db72438) sin que él lo decidiera.
export function ofertaDeLaDemo(estado, { ahora = new Date() } = {}) {
  const demo = carrosDemo(ahora);
  if (estado.carros + estado.empleados === 0) {
    return {
      texto: 'Para ver la app con algo adentro puedes cargar ' + plural(demo.length, 'carro', 'carros') + ' de demostración y ' + plural(EMPLEADOS_DEMO.length, 'empleado', 'empleados') + ', con piezas arregladas y en reparación: ' + comoSeVen(demo) + '. Se quitan en bloque cuando quieras.',
      accion: 'cargar',
      boton: 'Cargar demostración',
      quitarAparte: false,
    };
  }
  const lo = [estado.carros && plural(estado.carros, 'carro', 'carros'), estado.empleados && plural(estado.empleados, 'empleado', 'empleados')].filter(Boolean).join(' y ');
  const hay = 'Hay ' + lo + ' de demostración (' + (estado.carros + estado.empleados === 1 ? 'el marcado' : 'los marcados') + ' «demo»).';
  if (estado.faltanCarros + estado.faltanEmpleados === 0) {
    return { texto: hay + ' Lo real no se toca al quitarlos.', accion: 'quitar', boton: 'Quitar la demostración', quitarAparte: false };
  }
  const otros = [estado.faltanCarros && plural(estado.faltanCarros, 'carro', 'carros'), estado.faltanEmpleados && plural(estado.faltanEmpleados, 'empleado', 'empleados')].filter(Boolean).join(' y ');
  // Los carros que faltan, para decir cómo se ven: los que ya están no se vuelven a cargar (cargarDemo).
  const faltan = demo.filter((c) => !(estado.placas || []).includes(c.placa));
  const seVen = faltan.length && faltan.length === estado.faltanCarros ? ' (' + (faltan.length === 1 ? 'ese carro ' : 'esos carros ') + comoSeVen(faltan) + ')' : '';
  return {
    texto: hay + ' Puedes cargar ' + (estado.faltanCarros + estado.faltanEmpleados === 1 ? 'el otro' : 'los otros') + ': ' + otros + seVen + '. Lo real no se toca, ni al cargar ni al quitar.',
    accion: 'cargar',
    boton: 'Cargar el resto',
    quitarAparte: true,
  };
}

// Quita la demostración en bloque, con lo que cuelga de ella fuera del
// registro. Sus escaneos viven en otra base (escaneos.js): si se quedaran,
// volverían pegados al mismo DEM00x al cargarla otra vez; no se esperan, un
// escaneo huérfano solo ocupa espacio. Y el borrador del visor: si el último
// carro abierto era de demostración, abrir el visor sin placa lo volvía a
// crear, ya quitado. Lo real no se toca.
export async function quitarLaDemostracion(almacen, { local = globalThis.localStorage, abrirEscaneos = () => import('./escaneos.js').then((m) => m.abrirEscaneos()) } = {}) {
  const placas = (await almacen.listar()).filter((c) => c.demo).map((c) => c.placa);
  const quitado = await almacen.quitarDemo();
  try {
    const borrador = deserializarCarro(local.getItem(CLAVE_GUARDADO));
    if (borrador.demo || (borrador.placa && placas.includes(borrador.placa))) local.removeItem(CLAVE_GUARDADO);
  } catch {
    // Sin almacenamiento no hay borrador que lo vuelva a crear.
  }
  Promise.resolve()
    .then(abrirEscaneos)
    .then(async (escaneos) => {
      for (const placa of placas) await escaneos.borrar(placa);
    })
    .catch(() => {});
  return quitado;
}

// ---- El carro de muestra de cada modelo (pestaña Vehículos) ----

// El carro de demostración de la línea de este modelo (DEM006 para la
// Captiva), o null. Se busca por la línea y no con una placa escrita en la
// tabla MODELOS: así el carro y su modelo no se pueden desencontrar.
export function carroDeMuestra(modelo, ahora = new Date()) {
  return carrosDemo(ahora).find((c) => modeloDeLaLinea(c) === modelo) || null;
}

// "Ver en 3D": deja en el registro el carro de muestra del modelo, y SOLO ese
// (ni el resto de la demostración ni sus empleados). Si ya está, no lo pisa:
// puede tener piezas que alguien marcó para probar. Si es de demostración pero
// ya no le toca el modelo (le cambiaron la línea, o pidieron la carrocería de
// referencia), se le devuelve la línea con sus piezas: si no, "Ver en 3D"
// abriría otra cosa. Un carro real con esa placa no se toca nunca.
// `como`: 'creado', 'estaba', 'arreglado' o 'real'.
export async function asegurarCarroDeMuestra(almacen, modelo, ahora = new Date()) {
  const muestra = carroDeMuestra(modelo, ahora);
  if (!muestra) throw new Error('No hay carro de demostración para ' + modelo.nombre);
  const existente = await almacen.obtener(muestra.placa);
  if (!existente) return { carro: await almacen.guardar(muestra, muestra.actualizado), como: 'creado' };
  if (!existente.demo) return { carro: existente, como: 'real' };
  if (modeloQueLeToca(existente) === modelo) return { carro: existente, como: 'estaba' };
  const { marca, linea, carroceria, medidas } = muestra;
  return { carro: await almacen.guardar({ ...existente, marca, linea, carroceria, medidas, sinModeloDeCatalogo: false }), como: 'arreglado' };
}
