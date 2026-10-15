// Catálogo de piezas pintables de un sedán.
//
// Son las piezas que un taller de latonería y pintura cotiza por separado en
// Colombia, con los nombres que usa el gremio (bómper, guardafango, costado,
// estribo) y no los del manual del fabricante: el pintor tiene que reconocer
// la lista sin que nadie se la traduzca.
//
// El `lado` se mira desde el asiento del conductor: izquierdo = lado del
// conductor. Es la convención de los talleres y de los peritos de seguros.
//
// Este archivo no depende de Three.js a propósito: lo lee el visor 3D, lo
// leerá el registro por placa y la nómina de los pintores, y se prueba en
// Node sin navegador.
export const PIEZAS = [
  { id: 'capo', nombre: 'Capó', lado: null },
  { id: 'techo', nombre: 'Techo', lado: null },
  { id: 'baul', nombre: 'Baúl', lado: null },
  { id: 'bomper-del', nombre: 'Bómper delantero', lado: null },
  { id: 'bomper-tras', nombre: 'Bómper trasero', lado: null },
  { id: 'guardafango-del-izq', nombre: 'Guardafango delantero izquierdo', lado: 'izq' },
  { id: 'guardafango-del-der', nombre: 'Guardafango delantero derecho', lado: 'der' },
  { id: 'puerta-del-izq', nombre: 'Puerta delantera izquierda', lado: 'izq' },
  { id: 'puerta-del-der', nombre: 'Puerta delantera derecha', lado: 'der' },
  { id: 'puerta-tras-izq', nombre: 'Puerta trasera izquierda', lado: 'izq' },
  { id: 'puerta-tras-der', nombre: 'Puerta trasera derecha', lado: 'der' },
  { id: 'costado-izq', nombre: 'Costado trasero izquierdo', lado: 'izq' },
  { id: 'costado-der', nombre: 'Costado trasero derecho', lado: 'der' },
  { id: 'estribo-izq', nombre: 'Estribo izquierdo', lado: 'izq' },
  { id: 'estribo-der', nombre: 'Estribo derecho', lado: 'der' },
  { id: 'espejo-izq', nombre: 'Espejo izquierdo', lado: 'izq' },
  { id: 'espejo-der', nombre: 'Espejo derecho', lado: 'der' },
  // Las de interior (15-oct-2026): se ven con algo abierto y también se
  // pintan. El marco es el umbral y los pilares por dentro de ese lado; el
  // vano del motor es la bandeja y las paredes bajo el capó; el vano del
  // baúl es el piso del baúl (o de la compuerta, o del platón).
  { id: 'marco-izq', nombre: 'Marco de puertas izquierdo', lado: 'izq' },
  { id: 'marco-der', nombre: 'Marco de puertas derecho', lado: 'der' },
  // La base de las puertas: el umbral por donde se entra, entre el estribo
  // y el marco. Con las puertas abiertas es lo primero que se ve, y en una
  // pintura general se pinta; por eso es pieza aparte (pedido de Joan,
  // 15-oct-2026).
  { id: 'base-puertas-izq', nombre: 'Base de puertas izquierda', lado: 'izq' },
  { id: 'base-puertas-der', nombre: 'Base de puertas derecha', lado: 'der' },
  { id: 'vano-motor', nombre: 'Vano del motor', lado: null },
  { id: 'vano-baul', nombre: 'Vano del baúl', lado: null },
  // La cara interior de lo que se abre es otra pieza: el capó por fuera y
  // el capó por dentro se cotizan y se pintan aparte.
  { id: 'capo-int', nombre: 'Capó por dentro', lado: null },
  { id: 'baul-int', nombre: 'Baúl por dentro', lado: null },
  { id: 'puerta-del-izq-int', nombre: 'Puerta delantera izquierda por dentro', lado: 'izq' },
  { id: 'puerta-del-der-int', nombre: 'Puerta delantera derecha por dentro', lado: 'der' },
  { id: 'puerta-tras-izq-int', nombre: 'Puerta trasera izquierda por dentro', lado: 'izq' },
  { id: 'puerta-tras-der-int', nombre: 'Puerta trasera derecha por dentro', lado: 'der' },
];

// Las piezas que solo se ven con algo abierto: se pintan de un tono más
// claro y mate para distinguirlas de la chapa de afuera.
export function esInterior(id) {
  return id.endsWith('-int') || id.startsWith('vano-') || id.startsWith('marco-') || id.startsWith('base-');
}

export const PIEZAS_POR_ID = new Map(PIEZAS.map((p) => [p.id, p]));

export function nombreDePieza(id) {
  const pieza = PIEZAS_POR_ID.get(id);
  return pieza ? pieza.nombre : id;
}
