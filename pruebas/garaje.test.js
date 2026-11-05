// El registro de carros, probado en Node: el modelo (puro) y el almacén
// contra fake-indexeddb, una IndexedDB de mentira que se comporta como la
// del navegador (transacciones, índices, autoincremento, Blobs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { IDBFactory } from 'fake-indexeddb';
import { PIEZAS } from '../js/piezas.js';
import { textoParaAsistente } from '../js/estado.js';
import { avisoDeLargo, crearEscaneoPantalla } from '../js/escaneo-pantalla.js';
import {
  ESTADOS,
  NOMBRE_ESTADO,
  abrirAlmacen,
  alternarPieza,
  crearCarro,
  deserializarCarro,
  estadoParaOrden,
  faltaFotoDeVerdad,
  fechaCorta,
  fijarEstado,
  fijarTrabajo,
  mensajeParaLaPantalla,
  nombreCompletoDelCarro,
  nombreDePiezaEnOrden,
  nombreDelCarro,
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
  assert.deepEqual(carro.piezas.capo, { estado: 'terminada', desde: AHORA, trabajo: 'pintura', pintor: '' });
  // Un estado inventado cae a pendiente y una fecha ausente toma la de ahora.
  assert.deepEqual(carro.piezas.techo, { estado: 'pendiente', desde: DESPUES, trabajo: 'pintura', pintor: '' });
  assert.equal(carro.creado, DESPUES);
  assert.equal(carro.actualizado, DESPUES);
});

test('crearCarro entiende el borrador viejo del visor (seleccion como lista)', () => {
  const carro = crearCarro({ placa: 'XYZ789', marca: 'Renault Logan', seleccion: ['capo', 'estribo-izq', 'nada'] }, AHORA);
  assert.deepEqual(carro.piezas, {
    capo: { estado: 'pendiente', desde: AHORA, trabajo: 'pintura', pintor: '' },
    'estribo-izq': { estado: 'pendiente', desde: AHORA, trabajo: 'pintura', pintor: '' },
  });
  assert.equal(carro.marca, 'Renault Logan');
});

test('cada pieza lleva su trabajo: solo pintura o latonería y pintura', () => {
  const carro = crearCarro({ piezas: { capo: { estado: 'pendiente', trabajo: 'latoneria', pintor: '' }, techo: { estado: 'pendiente', trabajo: 'soldadura' } } }, AHORA);
  assert.equal(carro.piezas.capo.trabajo, 'latoneria');
  assert.equal(carro.piezas.techo.trabajo, 'pintura', 'un trabajo inventado cae a pintura');
  // Cambiar el trabajo no mueve la fecha ni el estado.
  fijarEstado(carro, 'capo', 'en-proceso', DESPUES);
  assert.equal(fijarTrabajo(carro, 'capo', 'pintura'), true);
  assert.deepEqual(carro.piezas.capo, { estado: 'en-proceso', desde: DESPUES, trabajo: 'pintura', pintor: '' });
  assert.equal(fijarTrabajo(carro, 'capo', 'pintura'), false, 'el mismo trabajo no es un cambio');
  // Sobre una pieza sin marcar, la marca pendiente con ese trabajo.
  assert.equal(fijarTrabajo(carro, 'baul', 'latoneria', AHORA), true);
  assert.deepEqual(carro.piezas.baul, { estado: 'pendiente', desde: AHORA, trabajo: 'latoneria', pintor: '' });
  assert.equal(fijarTrabajo(carro, 'baul', 'soldadura'), false);
  assert.equal(fijarTrabajo(carro, 'aleron', 'latoneria'), false);
  // El estado conserva el trabajo, y el resumen cuenta la latonería.
  fijarEstado(carro, 'baul', 'terminada', DESPUES);
  assert.equal(carro.piezas.baul.trabajo, 'latoneria');
  assert.equal(resumen(carro).latoneria, 1);
  // En la orden, la pieza con latonería lo dice.
  assert.equal(nombreDePiezaEnOrden(carro, 'baul', 'Baúl'), 'Baúl (latonería y pintura)');
  assert.equal(nombreDePiezaEnOrden(carro, 'capo', 'Capó'), 'Capó');
  assert.equal(nombreDePiezaEnOrden(carro, 'espejo-izq', 'Espejo'), 'Espejo');
});

test('la versión del carro es texto libre y entra en el nombre completo', () => {
  const carro = crearCarro({ marca: 'Chevrolet', linea: 'Captiva (nueva)', version: '5 puestos, 2023' });
  assert.equal(carro.version, '5 puestos, 2023');
  assert.equal(nombreCompletoDelCarro(carro), 'Chevrolet Captiva (nueva) · 5 puestos, 2023');
  assert.equal(nombreCompletoDelCarro(crearCarro({ marca: 'Kia' })), 'Kia');
  assert.equal(crearCarro({ version: 42 }).version, '');
});

test('crearCarro guarda línea, carrocería, color y medidas, y limpia lo que no sirve', () => {
  const carro = crearCarro({
    placa: 'abc123',
    marca: 'Chevrolet',
    linea: 'Onix',
    carroceria: 'HATCHBACK',
    color: '#C8102E',
    medidas: { largo: 4163, ancho: 1730, alto: 'x', entreEjes: 2551 },
  });
  assert.equal(carro.linea, 'Onix');
  assert.equal(carro.carroceria, 'hatchback');
  assert.equal(carro.color, '#c8102e');
  assert.deepEqual(carro.medidas, { largo: 4163, ancho: 1730, entreEjes: 2551 });
  assert.equal(nombreDelCarro(carro), 'Chevrolet Onix');
  const vacio = crearCarro({ carroceria: 'nave', color: 'rojo', medidas: 'grande' });
  assert.equal(vacio.carroceria, 'sedan', 'una carrocería inventada cae al sedán');
  assert.equal(vacio.color, '');
  assert.equal(vacio.medidas, null);
  assert.equal(crearCarro().carroceria, '', 'sin carrocería no se inventa una');
  assert.equal(nombreDelCarro(crearCarro({ marca: ' Kia ' })), 'Kia');
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
  assert.deepEqual(carro.piezas.capo, { estado: 'pendiente', desde: AHORA, trabajo: 'pintura', pintor: '' });
  assert.equal(tienePieza(carro, 'capo'), true);
  assert.equal(alternarPieza(carro, 'capo'), false);
  assert.equal(tienePieza(carro, 'capo'), false);
  assert.equal(alternarPieza(carro, 'ala-delta'), false);
  assert.deepEqual(carro.piezas, {});
});

test('fijarEstado cambia estado y fecha; marca la pieza si no estaba; rechaza lo inventado', () => {
  const carro = crearCarro({ piezas: { capo: { estado: 'pendiente', desde: AHORA } } }, AHORA);
  assert.equal(fijarEstado(carro, 'capo', 'en-proceso', DESPUES), true);
  assert.deepEqual(carro.piezas.capo, { estado: 'en-proceso', desde: DESPUES, trabajo: 'pintura', pintor: '' });
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
  assert.deepEqual(resumen(carro), { total: 6, pendientes: 2, enProceso: 1, terminadas: 3, latoneria: 0 });
  assert.deepEqual(resumen(crearCarro()), { total: 0, pendientes: 0, enProceso: 0, terminadas: 0, latoneria: 0 });
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
  // Con línea y versión, la orden dice el carro completo.
  const captiva = crearCarro({ placa: 'JRX248', marca: 'Chevrolet', linea: 'Captiva (nueva)', version: '5 puestos', piezas: { capo: {} } });
  assert.equal(textoParaAsistente(estadoParaOrden(captiva)).split(String.fromCharCode(10))[0], 'ORDEN DE PINTURA - Chevrolet Captiva (nueva) · 5 puestos, placa JRX248');
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

test('abrirOCrear con los datos de la foto crea el carro completo y completa el que ya existía', async () => {
  const almacen = await almacenLimpio();
  const datos = { marca: 'Renault', linea: 'Duster', carroceria: 'suv', color: '#1f4e9c', medidas: { largo: 4341, ancho: 1804, alto: 1693, entreEjes: 2673 } };
  const { carro, nuevo } = await almacen.abrirOCrear('xyz789', datos);
  assert.equal(nuevo, true);
  assert.equal(carro.linea, 'Duster');
  assert.equal(carro.carroceria, 'suv');
  assert.equal(carro.color, '#1f4e9c');
  assert.equal(carro.medidas.largo, 4341);
  // Un carro viejo sin línea la toma; la que ya tenía no se pisa.
  await almacen.guardar(crearCarro({ placa: 'VIE111', marca: 'Kia', linea: 'Picanto' }));
  const viejo = await almacen.abrirOCrear('VIE111', { marca: 'Hyundai', linea: 'Accent', carroceria: 'sedan', color: '#f2f2f0' });
  assert.equal(viejo.nuevo, false);
  assert.equal(viejo.carro.marca, 'Kia');
  assert.equal(viejo.carro.linea, 'Picanto');
  assert.equal(viejo.carro.carroceria, 'sedan');
  assert.equal(viejo.carro.color, '#f2f2f0');
  // La foto del carro entero se guarda como la pieza especial 'carro'.
  const id = await almacen.guardarFoto({ placa: 'xyz789', pieza: 'carro', foto: fotoFalsa() });
  assert.equal((await almacen.portada('XYZ789')).id, id);
  assert.equal(await almacen.portada('VIE111'), null);
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
    capo: { estado: 'en-proceso', desde: AHORA, trabajo: 'pintura', pintor: '' },
    techo: { estado: 'terminada', desde: AHORA, trabajo: 'pintura', pintor: '' },
    baul: { estado: 'pendiente', desde: AHORA, trabajo: 'pintura', pintor: '' },
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

test('la portada automática del escaneo cede el puesto a una foto de verdad', async () => {
  const almacen = await abrirAlmacen({ indexedDB: new IDBFactory(), nombre: 'portada-' + Math.random() });
  const foto = new Blob(['x']);
  await almacen.guardar(crearCarro({ placa: 'POR123' }));
  await almacen.guardarFoto({ placa: 'POR123', pieza: 'carro', foto, automatica: true });
  assert.equal((await almacen.portada('POR123')).automatica, true);
  await almacen.guardarFoto({ placa: 'POR123', pieza: 'carro', foto });
  assert.equal((await almacen.portada('POR123')).automatica, false);
});

// La prueba de arriba llama a guardarFoto directo y pasaba en verde con el camino real roto:
// «Nuevo carro con foto» preguntaba si había portada, y la automática decía que sí.
test('«Nuevo carro con foto» le gana a la portada automática, no a una foto de verdad', async () => {
  const almacen = await almacenLimpio();
  const foto = fotoFalsa();
  await almacen.guardar(crearCarro({ placa: 'POR124' }));
  assert.equal(faltaFotoDeVerdad(await almacen.portada('POR124')), true, 'sin portada');
  await almacen.guardarFoto({ placa: 'POR124', pieza: 'carro', foto, automatica: true });
  assert.equal(faltaFotoDeVerdad(await almacen.portada('POR124')), true, 'con la automática');
  await almacen.guardarFoto({ placa: 'POR124', pieza: 'carro', foto });
  assert.equal(faltaFotoDeVerdad(await almacen.portada('POR124')), false, 'con una de verdad');
  almacen.cerrar();
});

test('la pantalla del Garaje decide con esa misma pregunta', () => {
  const fuente = fs.readFileSync(new URL('../js/garaje-pantalla.js', import.meta.url), 'utf8');
  assert.match(fuente, /if \(!faltaFotoDeVerdad\(await almacen\.portada\(carro\.placa\)\)\) return true;/);
});

test('quitar el escaneo se lleva su portada automática, escondida o no, y nada más', async () => {
  const almacen = await almacenLimpio();
  const foto = fotoFalsa();
  await almacen.guardarFoto({ placa: 'AUT111', pieza: 'carro', foto, automatica: true });
  await almacen.borrarPortadasAutomaticas('AUT111');
  assert.equal(await almacen.portada('AUT111'), null);

  // Con una de verdad encima, la automática no se ve; si se quedara, volvería al borrar esa.
  await almacen.guardarFoto({ placa: 'AUT222', pieza: 'carro', foto, automatica: true });
  const real = await almacen.guardarFoto({ placa: 'AUT222', pieza: 'carro', foto });
  const dePieza = await almacen.guardarFoto({ placa: 'AUT222', pieza: 'capo', foto });
  await almacen.guardarFoto({ placa: 'OTR333', pieza: 'carro', foto, automatica: true });
  await almacen.borrarPortadasAutomaticas('AUT222');
  assert.deepEqual((await almacen.listarFotos('AUT222')).map((f) => f.id), [real, dePieza]);
  await almacen.borrarFoto(real);
  assert.equal(await almacen.portada('AUT222'), null);
  assert.equal((await almacen.portada('OTR333')).automatica, true, 'la de otro carro no se toca');
  almacen.cerrar();
});

// ---------- Lo que se le dice a la persona ----------

test('un error técnico en inglés nunca llega a la pantalla', (t) => {
  t.mock.method(console, 'warn', () => {}); // ahí sí va, para quien lo vaya a arreglar
  const SI_NO = 'vuelve a intentarlo';
  const tecnicos = [
    'invalid zip data',
    'THREE.GLTFLoader: No DRACOLoader instance provided.',
    'Failed to load buffer "scene.bin".',
    "Cannot read properties of null (reading 'indexOf')",
    'Array buffer allocation failed',
    'The source image could not be decoded.',
    'The quota has been exceeded.',
    'Failed to fetch dynamically imported module: http://localhost:8310/js/escaneo.js',
    "Unexpected token '<', \"<!doctype \"... is not valid JSON",
    'Maximum call stack size exceeded',
    'Internal error',
    'NetworkError when attempting to fetch resource.',
    'No space left on device',
    'A mutation operation was attempted on a database that did not allow mutations.',
    'WebGL context lost',
    'Unsupported file format',
  ];
  for (const mensaje of tecnicos) assert.equal(mensajeParaLaPantalla(new Error(mensaje), SI_NO), SI_NO, mensaje);
  assert.equal(mensajeParaLaPantalla(new Error(''), SI_NO), SI_NO);
  assert.equal(mensajeParaLaPantalla(null, SI_NO), SI_NO);
  assert.equal(mensajeParaLaPantalla(undefined, SI_NO), SI_NO);
});

test('lo que escribió la app en español sí llega, tal cual: todos los Error del código', () => {
  const SI_NO = 'CAMBIADO';
  const carpeta = new URL('../js/', import.meta.url);
  const mensajes = [];
  for (const nombre of fs.readdirSync(carpeta)) {
    if (!nombre.endsWith('.js')) continue;
    const fuente = fs.readFileSync(new URL(nombre, carpeta), 'utf8');
    for (const [, texto] of fuente.matchAll(/new (?:Error|ArchivoNoSirve)\('([^']+)'/g)) {
      // Los que no llevan espacios son códigos ('sin-profundidad'): el que los recibe los
      // compara y escribe su propio texto. Nunca se muestran. Y con 'WebGL no disponible' el
      // visor solo se detiene, con su propio texto ya puesto en la pantalla.
      if (texto.trim().includes(' ') && texto !== 'WebGL no disponible') mensajes.push(texto.trim());
    }
  }
  assert.ok(mensajes.length > 15, 'el barrido no encontró los errores: ' + mensajes.length);
  for (const mensaje of mensajes) assert.equal(mensajeParaLaPantalla(new Error(mensaje), SI_NO), mensaje);
});

test('el largo medido contra el catálogo: se avisa desde 25 cm, en metros o en milímetros', () => {
  const catalogo = { largo: 4200, ancho: 1800, alto: 1550 };
  assert.equal(avisoDeLargo({ largo: 4.2 }, catalogo), '');
  assert.equal(avisoDeLargo({ largo: 4.45 }, catalogo), '', 'justo 25 cm no');
  assert.equal(avisoDeLargo({ largo: 3.95 }, catalogo), '');
  const mas = avisoDeLargo({ largo: 4.51 }, catalogo);
  assert.match(mas, /31 cm más/);
  assert.match(mas, /parte del piso o del entorno/);
  const menos = avisoDeLargo({ largo: 3.8 }, { largo: 4.2, ancho: 1.8, alto: 1.55 });
  assert.match(menos, /40 cm menos/);
  assert.match(menos, /parte del piso o del entorno/);
  assert.doesNotMatch(mas + menos, /error|culpa|mal/i);
  assert.equal(avisoDeLargo({ largo: 9 }, null), '', 'sin catálogo no hay contra qué');
  assert.equal(avisoDeLargo(null, catalogo), '');
});

// ---------- La pantalla del escaneo ----------

// crearEscaneoPantalla solo le pide al DOM botones con su texto y si están escondidos. Lo demás
// es de verdad: el importador, escaneo.js y la base (fake-indexeddb). `mostrar` hace de visor,
// y como el de verdad, si no pudo armar el modelo deja en pantalla lo que había.
function elementoFalso() {
  const oyentes = {};
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    value: '',
    files: [],
    classList: { toggle() {} },
    addEventListener(tipo, oyente) {
      (oyentes[tipo] ||= []).push(oyente);
    },
    // Con su promesa: un manejador que revienta hace fallar la prueba. En el navegador sería
    // un error sin atender, y la pantalla a medias.
    disparar: (tipo) => Promise.all((oyentes[tipo] || []).map((oyente) => oyente({}))),
    click() {},
    close() {},
    showModal() {},
  };
}

// Una caja de 4,30 × 1,80 × 1,40 m sobre un piso: el escaneo más barato que el importador
// reconoce como un carro, y sale a un tamaño normal.
function archivoDeUnaCaja() {
  const lineas = [];
  let base = 1;
  for (const malla of [new THREE.BoxGeometry(1.8, 1.4, 4.3, 8, 8, 16).translate(0, 0.7, 0), new THREE.PlaneGeometry(8, 8, 16, 16).rotateX(-Math.PI / 2)]) {
    const { position: p } = malla.attributes;
    for (let i = 0; i < p.count; i++) lineas.push('v ' + p.getX(i) + ' ' + p.getY(i) + ' ' + p.getZ(i));
    for (let i = 0; i < malla.index.count; i += 3) lineas.push('f ' + (malla.index.getX(i) + base) + ' ' + (malla.index.getX(i + 1) + base) + ' ' + (malla.index.getX(i + 2) + base));
    base += p.count;
  }
  return new File([lineas.join('\n') + '\n'], 'caja.obj');
}

function pantallaDeEscaneo(t, carro) {
  t.mock.method(console, 'warn', () => {});
  globalThis.indexedDB = new IDBFactory();
  t.after(() => delete globalThis.indexedDB);
  const elementos = new Map();
  const elemento = (clave) => {
    if (!elementos.has(clave)) elementos.set(clave, elementoFalso());
    return elementos.get(clave);
  };
  const avisos = [];
  const visor = { visto: null, rechaza: () => false };
  // Solo mientras se crea: es lo único que lo pide, y lo demás no debe creer que hay navegador.
  globalThis.document = { getElementById: elemento, querySelector: elemento };
  const pantalla = crearEscaneoPantalla({
    obtenerCarro: () => carro,
    avisar: (texto) => avisos.push(texto),
    mostrar(escaneo) {
      if (visor.rechaza(escaneo)) throw new RangeError('Array buffer allocation failed');
      visor.visto = escaneo || null;
    },
  });
  delete globalThis.document;
  const accion = (nombre) => elemento(`#previa-escaneo [data-accion="${nombre}"]`);
  return {
    pantalla,
    avisos,
    visor,
    panel: elemento('previa-escaneo'),
    texto: elemento('previa-escaneo-texto'),
    boton: elemento('escanear'),
    estado: elemento('escaneo-estado'),
    guardar: accion('guardar'),
    voltear: accion('voltear'),
    descartar: accion('descartar'),
    subir() {
      elemento('archivo-escaneo').files = [archivoDeUnaCaja()];
      return elemento('archivo-escaneo').disparar('change');
    },
    // «Frente al revés» no devuelve su promesa: mientras trabaja, el botón va apagado.
    async hastaQueTermine() {
      for (let i = 0; i < 500 && elemento('escanear').disabled; i++) await new Promise((listo) => setTimeout(listo, 20));
      assert.equal(elemento('escanear').disabled, false);
    },
  };
}

test('si no se pudo armar el modelo, lo que nadie vio no queda para Guardar', async (t) => {
  const p = pantallaDeEscaneo(t, crearCarro({ placa: 'MEM001' }));
  await p.pantalla.cargar('MEM001');

  // Sin vista previa antes: no se ofrece nada.
  p.visor.rechaza = (escaneo) => Boolean(escaneo);
  await p.subir();
  assert.equal(p.pantalla.previa, null);
  assert.equal(p.panel.hidden, true);
  assert.equal(p.boton.textContent, 'Escanear');
  // Y no se le achaca al archivo: el archivo está bueno y exportarlo otra vez no arregla nada.
  assert.match(p.avisos.at(-1), /memoria/);
  assert.doesNotMatch(p.avisos.at(-1), /se ve dañado/);

  // Con una buena en pantalla: esa sigue, con sus botones.
  p.visor.rechaza = () => false;
  await p.subir();
  const buena = p.pantalla.previa;
  assert.ok(buena);
  assert.equal(p.visor.visto, buena);
  p.visor.rechaza = (escaneo) => escaneo !== buena;
  await p.subir();
  assert.equal(p.pantalla.previa, buena);
  assert.equal(p.visor.visto, buena);
  assert.equal(p.guardar.hidden, false);

  // «Frente al revés» que no se pudo mostrar no deja volteado lo que se guardaría.
  await p.voltear.disparar('click');
  await p.hastaQueTermine();
  assert.equal(p.pantalla.previa, buena);
  assert.equal(p.guardar.hidden, false);
  assert.match(p.avisos.at(-1), /^No se pudo: /);

  // Lo que se guarda es lo que se ve.
  p.visor.rechaza = () => false;
  await p.guardar.disparar('click');
  assert.equal(p.pantalla.guardado.volteado, false);
  assert.equal(p.pantalla.guardado.posiciones.length, buena.posiciones.length);
  assert.equal(p.pantalla.previa, null);
});

test('corregir la línea en la ficha repinta lo que el panel dice del catálogo', async (t) => {
  const carro = crearCarro({ placa: 'LIN001', medidas: { largo: 4800, ancho: 1800, alto: 1550, entreEjes: 2700 } });
  const p = pantallaDeEscaneo(t, carro);
  await p.pantalla.cargar('LIN001');
  await p.subir();
  assert.match(p.texto.textContent, /Mide 50 cm menos de largo/);

  carro.medidas = { largo: 4300, ancho: 1800, alto: 1400, entreEjes: 2700 };
  await p.pantalla.cargar('LIN001');
  assert.match(p.texto.textContent, /catálogo: 4,30/);
  assert.doesNotMatch(p.texto.textContent, /de largo/);

  // A mitad de un Guardar no le devuelve los botones: con la base lenta, tocar uno cambiaba
  // lo que se estaba guardando.
  const guardando = p.guardar.disparar('click');
  await p.pantalla.cargar('LIN001');
  assert.equal(p.guardar.hidden, true);
  await guardando;
  assert.ok(p.pantalla.guardado);
});

test('poner la placa de un carro que ya tenía otra línea también repinta el panel', async (t) => {
  const carro = crearCarro({ medidas: { largo: 4800, ancho: 1800, alto: 1550, entreEjes: 2700 } });
  const p = pantallaDeEscaneo(t, carro);
  await p.subir();
  assert.match(p.texto.textContent, /catálogo: 4,80/);
  carro.placa = 'LIN002';
  carro.medidas = { largo: 4300, ancho: 1800, alto: 1400, entreEjes: 2700 };
  await p.pantalla.cargar('LIN002');
  assert.match(p.texto.textContent, /catálogo: 4,30/);
  assert.doesNotMatch(p.texto.textContent, /de largo/);
  assert.equal(p.guardar.hidden, false);
});

test('con la placa puesta o al descartar, «Ponle placa» ya no queda en pantalla', async (t) => {
  const carro = crearCarro();
  const conPlaca = pantallaDeEscaneo(t, carro);
  await conPlaca.subir();
  await conPlaca.guardar.disparar('click');
  assert.match(conPlaca.avisos.at(-1), /^Ponle placa/);
  carro.placa = 'GUA111';
  await conPlaca.pantalla.cargar('GUA111');
  assert.equal(conPlaca.avisos.at(-1), '');
  assert.ok(conPlaca.pantalla.previa, 'la vista previa sigue, como prometía');

  const sinPlaca = pantallaDeEscaneo(t, crearCarro());
  await sinPlaca.subir();
  await sinPlaca.guardar.disparar('click');
  await sinPlaca.descartar.disparar('click');
  assert.equal(sinPlaca.avisos.at(-1), '');
});

test('abrir un carro con placa no se lleva el aviso del arranque', async (t) => {
  // El visor avisa «Este navegador no guarda el registro…» antes de este primer cargar.
  const p = pantallaDeEscaneo(t, crearCarro({ placa: 'ARR111' }));
  await p.pantalla.cargar('ARR111');
  assert.deepEqual(p.avisos, []);
});

test('Descartar con un registro dañado debajo avisa, y lo descartado no se queda en pantalla', async (t) => {
  const p = pantallaDeEscaneo(t, crearCarro({ placa: 'DAN001' }));
  await p.pantalla.cargar('DAN001');
  await p.subir();
  await p.guardar.disparar('click');
  const danado = p.pantalla.guardado;
  // Sano, vuelve a lo guardado.
  await p.subir();
  await p.descartar.disparar('click');
  assert.equal(p.visor.visto, danado);
  // Dañado, a la carrocería de referencia.
  await p.subir();
  p.visor.rechaza = (escaneo) => escaneo === danado;
  await p.descartar.disparar('click');
  assert.equal(p.visor.visto, null);
  assert.equal(p.panel.hidden, true);
  assert.match(p.avisos.at(-1), /^No se pudo abrir el escaneo guardado/);
});

test('con una vista previa, el diálogo no dice que el 3D es la carrocería de referencia', async (t) => {
  const p = pantallaDeEscaneo(t, crearCarro({ placa: 'DIA001' }));
  await p.pantalla.cargar('DIA001');
  await p.subir();
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /vista previa, sin guardar/);
  assert.doesNotMatch(p.estado.textContent, /carrocería de referencia/);
  await p.descartar.disparar('click');
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /carrocería de referencia/);
});
