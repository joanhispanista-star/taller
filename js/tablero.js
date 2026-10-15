// Los números del taller: la nómina de la semana por empleado, el historial
// de carros entregados con lo cobrado, y los indicadores del dueño. Todo
// son funciones puras sobre los carros y los empleados del registro: sin
// DOM, probadas en Node. La pantalla (tablero-pantalla.js) solo las pinta.
//
// Regla de plata (LEEME, decisión 3; la 9 la cerró Joan el 15-oct-2026):
// toda pieza que queda terminada paga TARIFA_PIEZA al pintor que la tiene
// asignada, sea de pintura o de latonería, exterior o de interior. Una sola
// tarifa, pareja.
import { PIEZAS_POR_ID, esInterior } from './piezas.js';
import { TARIFA_PIEZA } from './garaje.js';

// ---------- Semanas ----------

// La semana del taller va de lunes a domingo. `inicioDeSemana` da el lunes
// a las 0:00 (hora local) de la semana que contiene la fecha.
export function inicioDeSemana(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  return d;
}

export function finDeSemana(inicio) {
  const d = new Date(inicio);
  d.setDate(d.getDate() + 7);
  return d; // exclusivo: el lunes siguiente a las 0:00
}

export function semanaDe(fecha = new Date(), desplazamiento = 0) {
  const inicio = inicioDeSemana(fecha);
  inicio.setDate(inicio.getDate() + desplazamiento * 7);
  return { inicio, fin: finDeSemana(inicio) };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function etiquetaDeSemana({ inicio, fin }) {
  const ultimo = new Date(fin);
  ultimo.setDate(ultimo.getDate() - 1);
  const dia = (d) => d.getDate() + ' ' + MESES[d.getMonth()];
  return dia(inicio) + ' al ' + dia(ultimo);
}

function enRango(iso, { inicio, fin }) {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= inicio.getTime() && t < fin.getTime();
}

// Pesos colombianos como los escribe la gente: $ 1.350.000.
export function pesos(n) {
  const entero = Math.round(Math.abs(n || 0));
  const texto = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-$ ' : '$ ') + texto;
}

// ---------- Nómina ----------

// Lo que paga una pieza: la tarifa si quedó terminada, nada si no. El id
// se recibe por si algún día la tarifa depende de la pieza (decisión 3).
export function pagoDePieza(pieza, id) {
  if (!pieza || pieza.estado !== 'terminada' || !PIEZAS_POR_ID.has(id)) return 0;
  return TARIFA_PIEZA;
}

// La nómina de una semana: por empleado, qué piezas terminó (las que
// tienen su id como pintor y pasaron a terminada dentro de la semana) y lo
// que se le paga. Las piezas terminadas sin pintor asignado se listan
// aparte: alguien las pintó y nadie va a cobrar.
export function nominaSemanal(carros, empleados, semana) {
  const porEmpleado = new Map(empleados.map((e) => [e.id, { empleado: e, piezas: [], total: 0 }]));
  const sinPintor = [];
  for (const carro of carros) {
    for (const [id, pieza] of Object.entries(carro.piezas)) {
      if (pieza.estado !== 'terminada' || !enRango(pieza.desde, semana)) continue;
      const pago = pagoDePieza(pieza, id);
      const detalle = { placa: carro.placa, carro, id, pieza, pago };
      const fila = porEmpleado.get(pieza.pintor);
      if (!fila) {
        sinPintor.push(detalle);
        continue;
      }
      fila.piezas.push(detalle);
      fila.total += pago;
    }
  }
  const filas = [...porEmpleado.values()]
    .filter((f) => f.empleado.activo || f.piezas.length > 0)
    .sort((a, b) => b.total - a.total || a.empleado.nombre.localeCompare(b.empleado.nombre, 'es'));
  return {
    semana,
    filas,
    sinPintor,
    total: filas.reduce((s, f) => s + f.total, 0),
  };
}

// ---------- Historial ----------

// Un carro entra al historial cuando se entregó. Lo que se pagó a los
// pintores por ese carro sale de sus piezas terminadas (tarifa de pintura),
// y lo que quedó pendiente se dice, no se esconde.
export function historial(carros) {
  return carros
    .filter((c) => c.entregado)
    .map((c) => {
      const piezas = Object.entries(c.piezas);
      const terminadas = piezas.filter(([, p]) => p.estado === 'terminada');
      const pagado = piezas.reduce((s, [id, p]) => s + pagoDePieza(p, id), 0);
      return {
        placa: c.placa,
        carro: c,
        fecha: c.entregado,
        piezas: piezas.length,
        terminadas: terminadas.length,
        pendientes: piezas.length - terminadas.length,
        latoneria: piezas.filter(([, p]) => p.trabajo === 'latoneria').length,
        cobro: c.cobro,
        pagado,
        margen: c.cobro - pagado,
      };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

// ---------- Indicadores ----------

// Los números juntos, para el dueño: cuántos carros entraron y se
// entregaron, piezas por estado, lo cobrado, lo pagado a pintores y el
// margen, en el rango pedido (por defecto todo), más una serie por semana
// (las últimas `semanas`) para ver la tendencia.
export function indicadores(carros, { desde = null, hasta = null, ahora = new Date(), semanas = 8 } = {}) {
  const rango = { inicio: desde ? new Date(desde) : new Date(0), fin: hasta ? new Date(hasta) : new Date(8640000000000000) };
  const entregados = carros.filter((c) => c.entregado && enRango(c.entregado, rango));
  const entrados = carros.filter((c) => enRango(c.creado, rango));
  const enTaller = carros.filter((c) => !c.entregado);
  const piezas = { pendientes: 0, enProceso: 0, terminadas: 0, latoneria: 0, interior: 0 };
  let pagado = 0;
  for (const c of carros) {
    for (const [id, p] of Object.entries(c.piezas)) {
      if (p.estado === 'pendiente') piezas.pendientes += 1;
      else if (p.estado === 'en-proceso') piezas.enProceso += 1;
      else if (enRango(p.desde, rango)) {
        piezas.terminadas += 1;
        pagado += pagoDePieza(p, id);
      }
      if (p.trabajo === 'latoneria') piezas.latoneria += 1;
      if (esInterior(id)) piezas.interior += 1;
    }
  }
  const cobrado = entregados.reduce((s, c) => s + c.cobro, 0);

  const serie = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const semana = semanaDe(ahora, -i);
    let terminadas = 0;
    let pagadoSemana = 0;
    for (const c of carros) {
      for (const [id, p] of Object.entries(c.piezas)) {
        if (p.estado === 'terminada' && enRango(p.desde, semana)) {
          terminadas += 1;
          pagadoSemana += pagoDePieza(p, id);
        }
      }
    }
    const cobradoSemana = carros.filter((c) => c.entregado && enRango(c.entregado, semana)).reduce((s, c) => s + c.cobro, 0);
    serie.push({ semana, etiqueta: etiquetaDeSemana(semana), terminadas, pagado: pagadoSemana, cobrado: cobradoSemana });
  }

  return {
    carros: { entrados: entrados.length, entregados: entregados.length, enTaller: enTaller.length, total: carros.length },
    piezas,
    cobrado,
    pagado,
    margen: cobrado - pagado,
    serie,
    enTaller: enTaller.sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)),
  };
}

export function nombreDePiezaDe(id) {
  const p = PIEZAS_POR_ID.get(id);
  return p ? p.nombre : id;
}
