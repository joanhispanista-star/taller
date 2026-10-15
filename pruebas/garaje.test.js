// El registro de carros, probado en Node: el modelo (puro) y el almacén
// contra fake-indexeddb, una IndexedDB de mentira que se comporta como la
// del navegador (transacciones, índices, autoincremento, Blobs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { PIEZAS } from '../js/piezas.js';
import { textoParaAsistente } from '../js/estado.js';
import {
  ESTADOS,
  NOMBRE_ESTADO,
  abrirAlmacen,
  alternarPieza,
  crearCarro,
  deserializarCarro,
  estadoParaOrden,
  fechaCorta,
  fijarEstado,
  piezasDelCarro,
  quitarTodas,
  resumen,
  serializarCarro,
  siguienteEstado,
  tienePieza,
} from '../js/garaje.js';

const AHORA = '2026-10-15T15:00:00.000Z';
const DESPUES = '2026-10-15T16:30:00.000Z';

// Cada prueba abre su propia base vacía: ninguna ve los carros de otra.
function almacenLimpio() {
  return abrirAlmacen({ indexedDB: new IDBFactory() });
}

function fotoFalsa(bytes = 1000) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

// ---------- Modelo ----------

test('los tres estados tienen nombre para la pantalla', () => {
  assert.deepEqual(ESTADOS, ['pendiente', 'en-proceso', 'terminada']);
  for (const estado of ESTADOS) assert.ok(NOMBRE_ESTADO[estado].length > 3, estado);
});

test('crearCarro normaliza la placa, recorta la marca y descarta piezas inventadas', () => {
  const carro = crearCarro(
    {
      placa: 'abc-123',
      marca: 'Chevrolet Onix con un nombre larguísimo que no cabe en la pantalla',
      piezas: { capo: { estado: 'terminada', desde: AHORA }, 'aleron-fantasma': { estado: 'pendiente' }, techo: { estado: 'volando' } },
    },
    DESPUES,
  );
  assert.equal(carro.placa, 'ABC123');
  assert.equal(carro.marca.length, 40);
  assert.deepEqual(Object.keys(carro.piezas).sort(), ['capo', 'techo']);
  assert.deepEqual(carro.piezas.capo, { estado: 'terminada', desde: AHORA });
  // Un estado inventado cae a pendiente y una fecha ausente toma la de ahora.
  assert.deepEqual(carro.piezas.techo, { estado: 'pendiente', desde: DESPUES });
  assert.equal(carro.creado, DESPUES);
  assert.equal(carro.actualizado, DESPUES);
});

test('crearCarro entiende el borrador viejo del visor (seleccion como lista)', () => {
  const carro = crearCarro({ placa: 'XYZ789', marca: 'Renault Logan', seleccion: ['capo', 'estribo-izq', 'nada'] }, AHORA);
  assert.deepEqual(carro.piezas, {
    capo: { estado: 'pendiente', desde: AHORA },
    'estribo-izq': { estado: 'pendiente', desde: AHORA },
  });
  assert.equal(carro.marca, 'Renault Logan');
});

test('crearCarro con nada da un carro vacío sin placa', () => {
  const carro = crearCarro();
  assert.equal(carro.placa, '');
  assert.equal(carro.marca, '');
  assert.deepEqual(carro.piezas, {});
  assert.ok(!Number.isNaN(Date.parse(carro.creado)));
});

test('alternarPieza marca como pendiente, quita, e ignora piezas inventadas', () => {
  const carro = crearCarro();
  assert.equal(alternarPieza(carro, 'capo', AHORA), true);
  assert.deepEqual(carro.piezas.capo, { estado: 'pendiente', desde: AHORA });
  assert.equal(tienePieza(carro, 'capo'), true);
  assert.equal(alternarPieza(carro, 'capo'), false);
  assert.equal(tienePieza(carro, 'capo'), false);
  assert.equal(alternarPieza(carro, 'ala-delta'), false);
  assert.deepEqual(carro.piezas, {});
});

test('fijarEstado cambia estado y fecha; marca la pieza si no estaba; rechaza lo inventado', () => {
  const carro = crearCarro({ piezas: { capo: { estado: 'pendiente', desde: AHORA } } }, AHORA);
  assert.equal(fijarEstado(carro, 'capo', 'en-proceso', DESPUES), true);
  assert.deepEqual(carro.piezas.capo, { estado: 'en-proceso', desde: DESPUES });
  // El mismo estado otra vez no cuenta como cambio (y no mueve la fecha).
  assert.equal(fijarEstado(carro, 'capo', 'en-proceso', '2026-10-16T00:00:00.000Z'), false);
  assert.equal(carro.piezas.capo.desde, DESPUES);
  // Una pieza sin marcar se marca directamente con ese estado.
  assert.equal(fijarEstado(carro, 'techo', 'terminada', DESPUES), true);
  assert.equal(carro.piezas.techo.estado, 'terminada');
  assert.equal(fijarEstado(carro, 'capo', 'pintada-a-medias'), false);
  assert.equal(fijarEstado(carro, 'aleron', 'terminada'), false);
  assert.deepEqual(Object.keys(carro.piezas).sort(), ['capo', 'techo']);
});

test('siguienteEstado da la vuelta completa', () => {
  assert.equal(siguienteEstado('pendiente'), 'en-proceso');
  assert.equal(siguienteEstado('en-proceso'), 'terminada');
  assert.equal(siguienteEstado('terminada'), 'pendiente');
});

test('quitarTodas deja el carro sin piezas', () => {
  const carro = crearCarro({ seleccion: ['capo', 'techo'] });
  quitarTodas(carro);
  assert.deepEqual(carro.piezas, {});
});

test('piezasDelCarro sale en el orden del catálogo con nombre y estado', () => {
  const carro = crearCarro({ piezas: { 'espejo-der': { estado: 'terminada' }, capo: { estado: 'en-proceso' }, 'puerta-del-izq': {} } }, AHORA);
  const lista = piezasDelCarro(carro);
  assert.deepEqual(
    lista.map((p) => p.id),
    ['capo', 'puerta-del-izq', 'espejo-der'],
  );
  assert.equal(lista[0].nombre, 'Capó');
  assert.equal(lista[0].estado, 'en-proceso');
  assert.equal(lista[1].estado, 'pendiente');
  assert.equal(lista[2].desde, AHORA);
});

test('resumen cuenta por estado', () => {
  const carro = crearCarro({
    piezas: {
      capo: { estado: 'pendiente' },
      techo: { estado: 'pendiente' },
      baul: { estado: 'en-proceso' },
      'bomper-del': { estado: 'terminada' },
      'bomper-tras': { estado: 'terminada' },
      'estribo-izq': { estado: 'terminada' },
    },
  });
  assert.deepEqual(resumen(carro), { total: 6, pendientes: 2, enProceso: 1, terminadas: 3 });
  assert.deepEqual(resumen(crearCarro()), { total: 0, pendientes: 0, enProceso: 0, terminadas: 0 });
});

test('la orden para el asistente sale del carro del registro, con todas las piezas marcadas', () => {
  const carro = crearCarro({
    placa: 'abc123',
    marca: 'Chevrolet Onix',
    piezas: { techo: { estado: 'terminada' }, capo: { estado: 'en-proceso' } },
  });
  const lineas = textoParaAsistente(estadoParaOrden(carro)).split(String.fromCharCode(10));
  assert.equal(lineas[0], 'ORDEN DE PINTURA - Chevrolet Onix, placa ABC123');
  assert.equal(lineas[1], '2 piezas para pintar:');
  assert.equal(lineas[2], '1. Capó');
  assert.equal(lineas[3], '2. Techo');
});

test('serializar y deserializar conservan placa, marca, fechas y estados', () => {
  const carro = crearCarro(
    { placa: 'XYZ789', marca: 'Renault Logan', piezas: { capo: { estado: 'terminada', desde: AHORA } } },
    AHORA,
  );
  const copia = deserializarCarro(serializarCarro(carro));
  assert.deepEqual(copia, carro);
});

test('deserializarCarro nunca revienta', () => {
  assert.deepEqual(deserializarCarro('esto no es json').piezas, {});
  assert.equal(deserializarCarro(null).placa, '');
  assert.equal(deserializarCarro('null').placa, '');
  assert.equal(deserializarCarro('[1,2,3]').placa, '');
  const viejo = deserializarCarro(JSON.stringify({ placa: 'AAA111', seleccion: ['capo', 'aleron-fantasma'] }));
  assert.deepEqual(Object.keys(viejo.piezas), ['capo']);
  assert.equal(viejo.placa, 'AAA111');
});

test('fechaCorta: hoy con hora, ayer con hora, este año sin año, otro año con año', () => {
  const ahora = new Date(2026, 9, 15, 18, 0); // 15 de octubre de 2026, hora local
  assert.equal(fechaCorta(new Date(2026, 9, 15, 10, 5).toISOString(), ahora), 'hoy 10:05');
  assert.equal(fechaCorta(new Date(2026, 9, 14, 23, 59).toISOString(), ahora), 'ayer 23:59');
  assert.equal(fechaCorta(new Date(2026, 9, 2, 9, 0).toISOString(), ahora), '2 oct');
  assert.equal(fechaCorta(new Date(2025, 11, 24, 9, 0).toISOString(), ahora), '24 dic 2025');
  assert.equal(fechaCorta('no es fecha', ahora), '');
});

// ---------- Almacén ----------

test('abrirOCrear crea el carro y la segunda vez abre el que había', async () => {
  const almacen = await almacenLimpio();
  const primera = await almacen.abrirOCrear('abc-123', 'Kia Picanto');
  assert.equal(primera.nuevo, true);
  assert.equal(primera.carro.placa, 'ABC123');
  assert.equal(primera.carro.marca, 'Kia Picanto');

  const segunda = await almacen.abrirOCrear('ABC 123', 'Otra marca');
  assert.equal(segunda.nuevo, false);
  // La marca que ya tenía no se pisa.
  assert.equal(segunda.carro.marca, 'Kia Picanto');
  assert.equal(segunda.carro.creado, primera.carro.creado);
  assert.equal((await almacen.listar()).length, 1);
  almacen.cerrar();
});

test('abrirOCrear le pone la marca al carro que no tenía', async () => {
  const almacen = await almacenLimpio();
  await almacen.abrirOCrear('ABC123');
  const { carro } = await almacen.abrirOCrear('ABC123', 'Mazda 3');
  assert.equal(carro.marca, 'Mazda 3');
  assert.equal((await almacen.obtener('abc123')).marca, 'Mazda 3');
  almacen.cerrar();
});

test('abrirOCrear sin placa falla, y obtener sin placa da null', async () => {
  const almacen = await almacenLimpio();
  await assert.rejects(almacen.abrirOCrear('---'), /Falta la placa/);
  assert.equal(await almacen.obtener(''), null);
  assert.equal(await almacen.obtener('NOEXISTE'), null);
  almacen.cerrar();
});

test('guardar conserva el estado de cada pieza y listar ordena por actualización', async () => {
  const almacen = await almacenLimpio();
  const viejo = crearCarro({ placa: 'VIE111', marca: 'Viejo' });
  const nuevo = crearCarro({ placa: 'NUE222', marca: 'Nuevo' });
  fijarEstado(nuevo, 'capo', 'en-proceso', AHORA);
  fijarEstado(nuevo, 'techo', 'terminada', AHORA);
  alternarPieza(nuevo, 'baul', AHORA);
  await almacen.guardar(viejo, AHORA);
  await almacen.guardar(nuevo, DESPUES);

  const lista = await almacen.listar();
  assert.deepEqual(
    lista.map((c) => c.placa),
    ['NUE222', 'VIE111'],
  );
  assert.deepEqual(lista[0].piezas, {
    capo: { estado: 'en-proceso', desde: AHORA },
    techo: { estado: 'terminada', desde: AHORA },
    baul: { estado: 'pendiente', desde: AHORA },
  });
  assert.equal(lista[0].actualizado, DESPUES);
  // guardar también deja la fecha en el objeto que se le pasó.
  assert.equal(nuevo.actualizado, DESPUES);

  // Tocar el viejo lo sube.
  await almacen.guardar(viejo, '2026-10-16T08:00:00.000Z');
  assert.equal((await almacen.listar())[0].placa, 'VIE111');
  almacen.cerrar();
});

test('un carro sin placa no entra al registro', async () => {
  const almacen = await almacenLimpio();
  await assert.rejects(almacen.guardar(crearCarro({ marca: 'Sin placa' })), /sin placa/);
  assert.deepEqual(await almacen.listar(), []);
  almacen.cerrar();
});

test('las fotos se guardan por carro y pieza, salen en orden y se van con el carro', async () => {
  const almacen = await almacenLimpio();
  await almacen.abrirOCrear('ABC123');
  await almacen.abrirOCrear('XYZ789');
  const id1 = await almacen.guardarFoto({ placa: 'abc123', pieza: 'capo', foto: fotoFalsa(1000), miniatura: fotoFalsa(100), ancho: 1280, alto: 960 }, AHORA);
  const id2 = await almacen.guardarFoto({ placa: 'ABC123', pieza: 'capo', foto: fotoFalsa(1100) }, DESPUES);
  const id3 = await almacen.guardarFoto({ placa: 'ABC123', pieza: 'techo', foto: fotoFalsa(1200) }, DESPUES);
  await almacen.guardarFoto({ placa: 'XYZ789', pieza: 'baul', foto: fotoFalsa(1300) }, DESPUES);
  assert.ok(id1 < id2 && id2 < id3);

  const fotos = await almacen.listarFotos('ABC123');
  assert.deepEqual(
    fotos.map((f) => [f.id, f.pieza]),
    [
      [id1, 'capo'],
      [id2, 'capo'],
      [id3, 'techo'],
    ],
  );
  assert.equal(fotos[0].foto.size, 1000);
  assert.equal(fotos[0].miniatura.size, 100);
  assert.equal(fotos[0].ancho, 1280);
  assert.equal(fotos[0].creado, AHORA);
  // Sin miniatura, la miniatura es la misma foto: la lista nunca queda sin imagen.
  assert.equal(fotos[1].miniatura.size, 1100);
  assert.equal((await almacen.listarFotos('XYZ789')).length, 1);
  assert.deepEqual(await almacen.listarFotos(''), []);

  await almacen.borrar('ABC123');
  assert.equal(await almacen.obtener('ABC123'), null);
  assert.deepEqual(await almacen.listarFotos('ABC123'), []);
  // Las del otro carro siguen ahí.
  assert.equal((await almacen.listarFotos('XYZ789')).length, 1);
  assert.equal((await almacen.listar()).length, 1);
  almacen.cerrar();
});

test('borrarFoto quita solo esa foto', async () => {
  const almacen = await almacenLimpio();
  await almacen.abrirOCrear('ABC123');
  const id1 = await almacen.guardarFoto({ placa: 'ABC123', pieza: 'capo', foto: fotoFalsa() });
  const id2 = await almacen.guardarFoto({ placa: 'ABC123', pieza: 'capo', foto: fotoFalsa() });
  await almacen.borrarFoto(id1);
  assert.deepEqual(
    (await almacen.listarFotos('ABC123')).map((f) => f.id),
    [id2],
  );
  almacen.cerrar();
});

test('guardarFoto exige placa, pieza del catálogo y foto', async () => {
  const almacen = await almacenLimpio();
  await assert.rejects(almacen.guardarFoto({ placa: '', pieza: 'capo', foto: fotoFalsa() }), /placa/);
  await assert.rejects(almacen.guardarFoto({ placa: 'ABC123', pieza: 'aleron', foto: fotoFalsa() }), /catálogo/);
  await assert.rejects(almacen.guardarFoto({ placa: 'ABC123', pieza: 'capo' }), /Falta la foto/);
  almacen.cerrar();
});

test('borrar un carro que no existe no falla', async () => {
  const almacen = await almacenLimpio();
  await almacen.borrar('NADA00');
  await almacen.borrar('');
  almacen.cerrar();
});

test('abrirAlmacen sin IndexedDB falla con un mensaje claro, no con una excepción muda', async () => {
  await assert.rejects(abrirAlmacen({ indexedDB: undefined }), /IndexedDB/);
});

test('el catálogo que usa el registro es el de piezas.js', () => {
  const carro = crearCarro();
  for (const p of PIEZAS) assert.equal(alternarPieza(carro, p.id), true);
  assert.equal(resumen(carro).total, PIEZAS.length);
});
