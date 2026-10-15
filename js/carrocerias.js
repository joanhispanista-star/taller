// Los tipos de carrocería que dibuja el visor y lo que cambia entre ellos.
//
// Un taller no necesita el Onix exacto: necesita que el 3D sea del mismo
// TIPO que el carro (un hatchback no tiene baúl, una camioneta tiene platón)
// y que las piezas se llamen como las llama el pintor. Las medidas reales de
// cada línea vienen del catálogo (catalogo-carros.js) y escalan la
// carrocería; si no hay medidas, se usan las típicas de aquí.
//
// Sin DOM ni Three.js: lo usan el visor, el Garaje y las pruebas.
import { PIEZAS, nombreDePieza } from './piezas.js';

// Medidas típicas en metros (largo, ancho de chapa sin espejos, alto,
// distancia entre ejes). Las del sedán son las del visor original.
export const CARROCERIAS = {
  sedan: {
    nombre: 'Sedán',
    descripcion: 'Baúl separado, cuatro puertas.',
    medidas: { largo: 4.5, ancho: 1.84, alto: 1.455, entreEjes: 2.85 },
  },
  hatchback: {
    nombre: 'Hatchback',
    descripcion: 'Compuerta trasera en vez de baúl.',
    medidas: { largo: 4.16, ancho: 1.73, alto: 1.47, entreEjes: 2.55 },
  },
  suv: {
    nombre: 'SUV / camioneta cerrada',
    descripcion: 'Más alta, con compuerta trasera.',
    medidas: { largo: 4.34, ancho: 1.8, alto: 1.69, entreEjes: 2.67 },
  },
  camioneta: {
    nombre: 'Pick-up (platón)',
    descripcion: 'Doble cabina y platón atrás.',
    medidas: { largo: 5.33, ancho: 1.86, alto: 1.82, entreEjes: 3.09 },
  },
};

export const CARROCERIA_POR_DEFECTO = 'sedan';

// Lo que dice el catálogo (o la foto) se reduce a las cuatro carrocerías
// que el visor sabe dibujar: una van se parece más a una SUV, un coupé a
// un sedán.
const EQUIVALENTES = {
  sedan: 'sedan',
  sedán: 'sedan',
  hatchback: 'hatchback',
  hatch: 'hatchback',
  suv: 'suv',
  van: 'suv',
  camioneta: 'camioneta',
  'pick-up': 'camioneta',
  pickup: 'camioneta',
  coupe: 'sedan',
  coupé: 'sedan',
  otro: 'sedan',
};

export function normalizarCarroceria(valor) {
  if (typeof valor !== 'string') return CARROCERIA_POR_DEFECTO;
  return EQUIVALENTES[valor.trim().toLowerCase()] || CARROCERIA_POR_DEFECTO;
}

// Medidas válidas para dibujar: las de la línea si vienen completas y
// razonables (en milímetros del catálogo o en metros), si no las típicas de
// la carrocería. Un número fuera de rango (un "largo" de 43 m por un error
// de tecleo) no deforma el carro: cae al valor típico.
const RANGO = {
  largo: [2.6, 6.5],
  ancho: [1.4, 2.3],
  alto: [1.2, 2.3],
  entreEjes: [1.8, 4.0],
};

export function medidasParaDibujar(carroceria, medidas = {}) {
  const tipo = normalizarCarroceria(carroceria);
  const tipicas = CARROCERIAS[tipo].medidas;
  const salida = {};
  for (const campo of Object.keys(tipicas)) {
    let valor = Number(medidas[campo]);
    if (valor > 100) valor = valor / 1000; // venía en milímetros
    const [min, max] = RANGO[campo];
    salida[campo] = valor >= min && valor <= max ? valor : tipicas[campo];
  }
  // La distancia entre ejes nunca puede acercarse al largo total: un carro
  // así no tendría bómperes. Si el catálogo trae una rareza, se recorta.
  if (salida.entreEjes > salida.largo - 1.0) salida.entreEjes = salida.largo - 1.0;
  return salida;
}

// El nombre de cada pieza según la carrocería. Los ids no cambian (el
// registro, los estados y la nómina siguen hablando de 'baul' y 'costado'),
// cambia lo que ve la persona: en un hatchback el pintor pinta la
// compuerta, no el baúl; en una camioneta, los costados son los del platón.
const NOMBRES = {
  hatchback: { baul: 'Compuerta trasera', 'vano-baul': 'Vano de la compuerta' },
  suv: { baul: 'Compuerta trasera', 'vano-baul': 'Vano de la compuerta' },
  camioneta: {
    baul: 'Compuerta del platón',
    'costado-izq': 'Costado del platón izquierdo',
    'costado-der': 'Costado del platón derecho',
    'vano-baul': 'Piso del platón',
  },
};

export function nombreDePiezaEn(carroceria, id) {
  const tipo = normalizarCarroceria(carroceria);
  return (NOMBRES[tipo] && NOMBRES[tipo][id]) || nombreDePieza(id);
}

// El catálogo de piezas con los nombres de esa carrocería, en el mismo orden.
export function piezasDe(carroceria) {
  return PIEZAS.map((p) => ({ ...p, nombre: nombreDePiezaEn(carroceria, p.id) }));
}
