// Los números del taller (nómina, historial, indicadores), los empleados
// y la demostración, probados en Node. Las fechas se fijan con un "ahora"
// de referencia: la nómina depende de en qué semana cayó cada pieza, y
// una prueba que dependa del reloj real falla el lunes siguiente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  TARIFA_PIEZA,
  abrirAlmacen,
  asignarPintor,
  crearCarro,
  crearEmpleado,
  entregarCarro,
  fijarEstado,
} from '../js/garaje.js';
import {
  etiquetaDeSemana,
  historial,
  indicadores,
  inicioDeSemana,
  nominaSemanal,
  pagoDePieza,
  pesos,
  semanaDe,
} from '../js/tablero.js';
import { EMPLEADOS_DEMO, cargarDemo, carrosDemo, empleadosDemo } from '../js/demo.js';

// Jueves 15 de octubre de 2026, 10:00 hora local.
const HOY = new Date(2026, 9, 15, 10, 0, 0);
const iso = (d) => d.toISOString();
const dia = (dias, horas = 10) => {
  const d = new Date(HOY.getTime() - dias * 86400000);
  d.setHours(horas, 0, 0, 0);
  return iso(d);
};

const CARLOS = crearEmpleado({ id: 'carlos', nombre: 'Carlos', rol: 'pintor' });
const YEISON = crearEmpleado({ id: 'yeison', nombre: 'Yeison', rol: 'pintor' });

test('la semana del taller va de lunes a domingo y se etiqueta con sus días', () => {
  const lunes = inicioDeSemana(HOY);
  assert.equal(lunes.getDay(), 1);
  assert.equal(lunes.getDate(), 12);
  assert.equal(lunes.getHours(), 0);
  const semana = semanaDe(HOY);
  assert.equal(etiquetaDeSemana(semana), '12 oct al 18 oct');
  assert.equal(etiquetaDeSemana(semanaDe(HOY, -1)), '5 oct al 11 oct');
  // Un domingo pertenece a la semana que empezó el lunes anterior.
  assert.equal(inicioDeSemana(new Date(2026, 9, 18, 23)).getDate(), 12);
});

test('pesos escribe los miles con punto y el signo adelante', () => {
  assert.equal(pesos(90000), '$ 90.000');
  assert.equal(pesos(1350000), '$ 1.350.000');
  assert.equal(pesos(0), '$ 0');
  assert.equal(pesos(-45000), '-$ 45.000');
});

test('toda pieza terminada paga la misma tarifa: pintura o latonería, exterior o interior', () => {
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'pintura' }, 'capo'), TARIFA_PIEZA);
  assert.equal(pagoDePieza({ estado: 'en-proceso', trabajo: 'pintura' }, 'capo'), 0);
  assert.equal(pagoDePieza({ estado: 'pendiente', trabajo: 'latoneria' }, 'capo'), 0);
  // Decisión de Joan (15-oct-2026): la latonería y el interior pagan igual.
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'latoneria' }, 'capo'), TARIFA_PIEZA);
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'pintura' }, 'capo-int'), TARIFA_PIEZA);
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'pintura' }, 'vano-motor'), TARIFA_PIEZA);
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'pintura' }, 'base-puertas-izq'), TARIFA_PIEZA);
  // Una pieza que no existe en el catálogo no paga, venga de donde venga.
  assert.equal(pagoDePieza({ estado: 'terminada', trabajo: 'pintura' }, 'aleta-magica'), 0);
  assert.equal(pagoDePieza(undefined, 'capo'), 0);
});

test('asignarPintor pone y quita el pintor, marca la pieza si hacía falta, y entregarCarro guarda cobro y fecha', () => {
  const carro = crearCarro({ placa: 'abc123' }, dia(5));
  assert.equal(asignarPintor(carro, 'capo', 'carlos', dia(4)), true);
  assert.deepEqual(carro.piezas.capo, { estado: 'pendiente', desde: dia(4), trabajo: 'pintura', pintor: 'carlos' });
  assert.equal(asignarPintor(carro, 'capo', 'carlos'), false);
  assert.equal(asignarPintor(carro, 'capo', ''), true);
  assert.equal(carro.piezas.capo.pintor, '');
  assert.equal(asignarPintor(carro, 'aleta-magica', 'carlos'), false);
  // Cambiar el estado conserva el pintor.
  asignarPintor(carro, 'capo', 'yeison');
  fijarEstado(carro, 'capo', 'terminada', dia(3));
  assert.equal(carro.piezas.capo.pintor, 'yeison');

  entregarCarro(carro, { cobro: '850000.4', fecha: dia(1) });
  assert.equal(carro.cobro, 850000);
  assert.equal(carro.entregado, dia(1));
  // Reabrir: queda sin fecha de entrega pero el cobro se conserva.
  entregarCarro(carro, { fecha: null });
  assert.equal(carro.entregado, '');
  assert.equal(carro.cobro, 850000);
  // crearCarro limpia: cobro negativo o basura es 0, fecha inválida es ''.
  const sucio = crearCarro({ placa: 'xyz', cobro: -5, entregado: 'ayer' });
  assert.equal(sucio.cobro, 0);
  assert.equal(sucio.entregado, '');
  assert.equal(sucio.demo, false);
});

test('la nómina semanal paga 90.000 por pieza terminada a su pintor, en la semana en que se terminó', () => {
  const a = crearCarro({ placa: 'aaa111' }, dia(10));
  asignarPintor(a, 'capo', 'carlos');
  fijarEstado(a, 'capo', 'terminada', dia(2)); // martes: cuenta
  asignarPintor(a, 'techo', 'carlos');
  fijarEstado(a, 'techo', 'terminada', dia(1)); // miércoles: cuenta
  asignarPintor(a, 'baul', 'carlos');
  fijarEstado(a, 'baul', 'terminada', dia(8)); // semana pasada: no cuenta
  asignarPintor(a, 'bomper-del', 'yeison');
  fijarEstado(a, 'bomper-del', 'en-proceso', dia(1)); // sin terminar: no paga
  asignarPintor(a, 'puerta-del-izq', 'yeison');
  a.piezas['puerta-del-izq'].trabajo = 'latoneria';
  fijarEstado(a, 'puerta-del-izq', 'terminada', dia(0)); // latonería: paga igual
  asignarPintor(a, 'capo-int', 'yeison');
  fijarEstado(a, 'capo-int', 'terminada', dia(0)); // interior: paga igual
  fijarEstado(a, 'espejo-der', 'terminada', dia(0)); // terminada sin pintor

  const nomina = nominaSemanal([a], [CARLOS, YEISON], semanaDe(HOY));
  assert.equal(nomina.filas.length, 2);
  // Empatados a dos piezas: el orden es por nombre.
  assert.equal(nomina.filas[0].empleado.id, 'carlos');
  assert.equal(nomina.filas[0].piezas.length, 2);
  assert.equal(nomina.filas[0].total, 2 * TARIFA_PIEZA);
  assert.equal(nomina.filas[1].empleado.id, 'yeison');
  assert.equal(nomina.filas[1].piezas.length, 2);
  assert.equal(nomina.filas[1].total, 2 * TARIFA_PIEZA);
  assert.equal(nomina.total, 360000);
  // La del espejo la pintó alguien y nadie la cobra: se lista aparte, con su valor.
  assert.equal(nomina.sinPintor.length, 1);
  assert.equal(nomina.sinPintor[0].id, 'espejo-der');
  assert.equal(nomina.sinPintor[0].pago, TARIFA_PIEZA);
  assert.equal(nomina.porDefinir, undefined);

  const pasada = nominaSemanal([a], [CARLOS, YEISON], semanaDe(HOY, -1));
  assert.equal(pasada.total, TARIFA_PIEZA);
  assert.equal(pasada.filas[0].piezas[0].id, 'baul');
  // Un empleado inactivo sin piezas no aparece; con piezas sí.
  const retirado = crearEmpleado({ id: 'carlos', nombre: 'Carlos', activo: false });
  assert.equal(nominaSemanal([a], [retirado], semanaDe(HOY, -3)).filas.length, 0);
  assert.equal(nominaSemanal([a], [retirado], semanaDe(HOY, -1)).filas.length, 1);
});

test('el historial lista los entregados del más reciente al más viejo, con cobro, pagado y margen', () => {
  const a = crearCarro({ placa: 'aaa111', cobro: 500000, entregado: dia(3) }, dia(9));
  asignarPintor(a, 'capo', 'carlos');
  fijarEstado(a, 'capo', 'terminada', dia(4));
  asignarPintor(a, 'techo', 'carlos');
  fijarEstado(a, 'techo', 'terminada', dia(4));
  a.piezas.techo.trabajo = 'latoneria';
  fijarEstado(a, 'baul', 'pendiente', dia(4)); // salió sin hacer
  const b = crearCarro({ placa: 'bbb222', cobro: 300000, entregado: dia(1) }, dia(2));
  const enTaller = crearCarro({ placa: 'ccc333' }, dia(1));

  const filas = historial([a, b, enTaller]);
  assert.deepEqual(filas.map((f) => f.placa), ['BBB222', 'AAA111']);
  const fa = filas[1];
  assert.equal(fa.piezas, 3);
  assert.equal(fa.terminadas, 2);
  assert.equal(fa.pendientes, 1);
  assert.equal(fa.latoneria, 1);
  assert.equal(fa.cobro, 500000);
  assert.equal(fa.pagado, 2 * TARIFA_PIEZA); // el techo con latonería paga igual; el baúl sin hacer no paga
  assert.equal(fa.margen, 500000 - 2 * TARIFA_PIEZA);
});

test('los indicadores juntan carros, piezas, cobrado, pagado y una serie por semana', () => {
  const a = crearCarro({ placa: 'aaa111', cobro: 500000, entregado: dia(3) }, dia(9));
  asignarPintor(a, 'capo', 'carlos');
  fijarEstado(a, 'capo', 'terminada', dia(8)); // semana pasada
  asignarPintor(a, 'techo', 'carlos');
  fijarEstado(a, 'techo', 'terminada', dia(2)); // esta semana
  const b = crearCarro({ placa: 'bbb222' }, dia(1));
  fijarEstado(b, 'baul', 'en-proceso', dia(0));
  fijarEstado(b, 'baul-int', 'pendiente', dia(0));
  fijarEstado(b, 'bomper-del', 'terminada', dia(0));
  b.piezas['bomper-del'].trabajo = 'latoneria';

  const ind = indicadores([a, b], { ahora: HOY, semanas: 4 });
  assert.deepEqual(ind.carros, { entrados: 2, entregados: 1, enTaller: 1, total: 2 });
  assert.deepEqual(ind.piezas, { pendientes: 1, enProceso: 1, terminadas: 3, latoneria: 1, interior: 1 });
  assert.equal(ind.cobrado, 500000);
  assert.equal(ind.pagado, 3 * TARIFA_PIEZA); // las tres terminadas, la de latonería incluida
  assert.equal(ind.margen, 500000 - 3 * TARIFA_PIEZA);
  assert.equal(ind.porDefinir, undefined);
  assert.equal(ind.enTaller[0].placa, 'BBB222');
  assert.equal(ind.serie.length, 4);
  const [, , pasada, actual] = ind.serie;
  assert.equal(pasada.etiqueta, '5 oct al 11 oct');
  assert.equal(pasada.terminadas, 1);
  assert.equal(pasada.pagado, TARIFA_PIEZA);
  assert.equal(pasada.cobrado, 0);
  assert.equal(actual.terminadas, 2);
  assert.equal(actual.cobrado, 500000);

  // Con rango: solo lo que cae adentro.
  const soloEstaSemana = indicadores([a, b], { ahora: HOY, desde: semanaDe(HOY).inicio, semanas: 1 });
  assert.equal(soloEstaSemana.carros.entregados, 1);
  assert.equal(soloEstaSemana.carros.entrados, 1);
  assert.equal(soloEstaSemana.piezas.terminadas, 2);
});

test('la demostración trae carros de marcas y colores distintos, entregados y en taller, y empleados con piezas', () => {
  const carros = carrosDemo(HOY);
  assert.equal(carros.length, 5);
  assert.ok(carros.every((c) => c.demo));
  assert.equal(new Set(carros.map((c) => c.marca)).size, 5);
  assert.equal(new Set(carros.map((c) => c.color)).size, 5);
  assert.equal(new Set(carros.map((c) => c.carroceria)).size, 4);
  const entregados = carros.filter((c) => c.entregado);
  assert.equal(entregados.length, 3);
  assert.ok(entregados.every((c) => c.cobro > 0));
  assert.ok(carros.some((c) => Object.values(c.piezas).some((p) => p.estado === 'en-proceso')));
  // Ninguna pieza inventada: crearCarro las habría descartado en silencio.
  assert.deepEqual(carros.map((c) => Object.keys(c.piezas).length), [3, 5, 4, 3, 2]);
  const empleados = empleadosDemo(HOY);
  assert.equal(empleados.length, EMPLEADOS_DEMO.length);
  assert.ok(empleados.every((e) => e.demo && e.nombre));
  // Cada pintor citado en las piezas existe.
  const ids = new Set(empleados.map((e) => e.id));
  for (const c of carros) for (const p of Object.values(c.piezas)) if (p.pintor) assert.ok(ids.has(p.pintor), p.pintor);
  // La nómina de esta semana tiene plata para los dos pintores.
  const nomina = nominaSemanal(carros, empleados, semanaDe(HOY));
  assert.ok(nomina.total >= 2 * TARIFA_PIEZA);
  assert.ok(nomina.filas.filter((f) => f.total > 0).length >= 2);
});

test('el almacén guarda empleados, carga la demostración sin pisar lo real y la quita en bloque', async () => {
  const almacen = await abrirAlmacen({ indexedDB: new IDBFactory() });
  const real = crearCarro({ placa: 'DEM001', marca: 'Fiat' });
  await almacen.guardar(real);
  const cargado = await cargarDemo(almacen, HOY);
  assert.equal(cargado.carros, 4); // DEM001 era real: no se pisa
  assert.equal(cargado.empleados, 3);
  assert.equal((await almacen.obtener('DEM001')).marca, 'Fiat');
  const empleados = await almacen.listarEmpleados();
  assert.deepEqual(empleados.map((e) => e.nombre), ['Andrés Mora', 'Carlos Pérez', 'Yeison Rojas']);

  const nuevo = await almacen.guardarEmpleado({ nombre: '  Marta Díaz ', rol: 'pintor' });
  assert.ok(nuevo.id.startsWith('emp-'));
  assert.equal(nuevo.nombre, 'Marta Díaz');
  assert.equal(nuevo.demo, false);
  await assert.rejects(() => almacen.guardarEmpleado({ nombre: '   ' }));

  const quitado = await almacen.quitarDemo();
  assert.deepEqual(quitado, { carros: 4, empleados: 3 });
  assert.equal((await almacen.listar()).length, 1);
  assert.deepEqual((await almacen.listarEmpleados()).map((e) => e.nombre), ['Marta Díaz']);
  almacen.cerrar();
});

test('la base de datos sube de versión sin perder los carros que ya estaban', async () => {
  const fabrica = new IDBFactory();
  // Simula un teléfono con la versión 1 (solo carros y fotos).
  await new Promise((resolver, rechazar) => {
    const p = fabrica.open('taller-pintura', 1);
    p.onupgradeneeded = () => {
      p.result.createObjectStore('carros', { keyPath: 'placa' });
      p.result.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true }).createIndex('placa', 'placa');
    };
    p.onsuccess = () => {
      const tx = p.result.transaction('carros', 'readwrite');
      tx.objectStore('carros').put({ placa: 'VIE123', marca: 'Renault', piezas: { capo: { estado: 'terminada', desde: dia(1), trabajo: 'pintura' } } });
      tx.oncomplete = () => { p.result.close(); resolver(); };
      tx.onerror = () => rechazar(tx.error);
    };
    p.onerror = () => rechazar(p.error);
  });
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  const viejo = await almacen.obtener('VIE123');
  assert.equal(viejo.marca, 'Renault');
  assert.equal(viejo.piezas.capo.pintor, '');
  assert.deepEqual(await almacen.listarEmpleados(), []);
  almacen.cerrar();
});
