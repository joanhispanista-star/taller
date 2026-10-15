// Estado del visor: qué carro es y qué piezas están marcadas para pintar.
//
// Es lógica pura, sin DOM ni Three.js, para poder probarla en Node y para
// que el registro por placa (la siguiente fase) la reutilice tal cual.
import { PIEZAS, PIEZAS_POR_ID } from './piezas.js';

export const CLAVE_GUARDADO = 'taller-pintura:visor';

// Salto de línea construido así y no con una secuencia de escape: en el
// equipo donde se escribe este código las herramientas se comen las barras
// invertidas al escribir archivos (ver LEEME.md), y un texto de WhatsApp
// con los saltos rotos llega como un solo renglón.
const NL = String.fromCharCode(10);

export function crearEstado(inicial = {}) {
  const ids = Array.isArray(inicial.seleccion) ? inicial.seleccion : [];
  return {
    placa: normalizarPlaca(inicial.placa),
    marca: typeof inicial.marca === 'string' ? inicial.marca.slice(0, 40) : '',
    seleccion: new Set(ids.filter((id) => PIEZAS_POR_ID.has(id))),
  };
}

// Devuelve true si la pieza quedó marcada, false si quedó desmarcada o no existe.
export function alternarPieza(estado, id) {
  if (!PIEZAS_POR_ID.has(id)) return false;
  if (estado.seleccion.has(id)) {
    estado.seleccion.delete(id);
    return false;
  }
  estado.seleccion.add(id);
  return true;
}

export function limpiarSeleccion(estado) {
  estado.seleccion.clear();
}

// Placas colombianas: tres letras y tres números en carros (ABC123), tres
// letras, dos números y una letra en motos (ABC12D). Aquí solo se limpia lo
// que escribe la persona; la validación estricta llega con el registro.
export function normalizarPlaca(texto) {
  if (typeof texto !== 'string') return '';
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

// En el orden del catálogo, no en el orden en que se tocaron: así la lista
// que recibe el pintor siempre se lee igual (capó, techo, baúl, bómperes,
// lado izquierdo, lado derecho).
export function piezasSeleccionadas(estado) {
  return PIEZAS.filter((p) => estado.seleccion.has(p.id));
}

export function textoParaAsistente(estado) {
  const piezas = piezasSeleccionadas(estado);
  const carro = [estado.marca.trim(), estado.placa ? 'placa ' + estado.placa : '']
    .filter(Boolean)
    .join(', ');
  const lineas = ['ORDEN DE PINTURA' + (carro ? ' - ' + carro : '')];
  if (piezas.length === 0) {
    lineas.push('Sin piezas marcadas.');
  } else {
    lineas.push(piezas.length === 1 ? '1 pieza para pintar:' : piezas.length + ' piezas para pintar:');
    piezas.forEach((p, i) => lineas.push(i + 1 + '. ' + p.nombre));
  }
  lineas.push('', 'Enviado desde Taller de Pintura');
  return lineas.join(NL);
}

export function serializar(estado) {
  return JSON.stringify({
    placa: estado.placa,
    marca: estado.marca,
    seleccion: [...estado.seleccion],
  });
}

// Nunca revienta: un guardado corrupto o de una versión vieja devuelve un
// estado vacío en vez de dejar la pantalla en blanco.
export function deserializar(texto) {
  try {
    const datos = JSON.parse(texto);
    return crearEstado(datos && typeof datos === 'object' ? datos : {});
  } catch {
    return crearEstado();
  }
}
