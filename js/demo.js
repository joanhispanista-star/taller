// Carros y empleados de demostración: para ver el Garaje, la nómina, el
// historial y los indicadores con algo adentro antes de que el taller los
// llene. Todo lo que crea lleva `demo: true` y se quita en bloque desde el
// tablero; lo real nunca se toca. Las fechas se calculan hacia atrás desde
// hoy, así la demostración siempre cae en las últimas semanas.
//
// Sin DOM: lo usan el Garaje, el tablero y las pruebas.
import { crearCarro, crearEmpleado } from './garaje.js';

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
  ];
}

export function empleadosDemo(ahora = new Date()) {
  return EMPLEADOS_DEMO.map((e) => crearEmpleado({ ...e, demo: true }, ahora.toISOString()));
}

// Mete la demostración en el almacén. No pisa un carro real con la misma
// placa (las placas DEM0xx no existen en Colombia, pero por si acaso).
export async function cargarDemo(almacen, ahora = new Date()) {
  let carros = 0;
  for (const carro of carrosDemo(ahora)) {
    const existente = await almacen.obtener(carro.placa);
    if (existente && !existente.demo) continue;
    await almacen.guardar(carro, carro.actualizado);
    carros += 1;
  }
  let empleados = 0;
  for (const e of empleadosDemo(ahora)) {
    await almacen.guardarEmpleado(e);
    empleados += 1;
  }
  return { carros, empleados };
}

// Qué hay de demostración en el almacén, para el botón de cargar/quitar:
// cuántos carros y empleados demo, y si el registro está vacío del todo.
export async function estadoDemo(almacen) {
  const carros = await almacen.listar();
  const empleados = await almacen.listarEmpleados();
  return {
    carros: carros.filter((c) => c.demo).length,
    empleados: empleados.filter((e) => e.demo).length,
    vacio: carros.length === 0 && empleados.length === 0,
  };
}
