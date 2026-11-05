// La base en un iPhone: lo que pasa cuando iOS mata el proceso de la base con la página abierta. La
// conexión se simula muerta como la deja Safari: sin avisar, y fallando en cada operación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { aBlob, aBytes, conTope, conexionViva, seCayoLaConexion } from '../js/conexion-bd.js';
import { abrirAlmacen, avisoDeBorrador, detalleDelError, mensajeDelRegistro } from '../js/garaje.js';
import { abrirEscaneos } from '../js/escaneos.js';

const PERDIDA = () => new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');

// Una fábrica que deja ver las conexiones que abrió, y matar la que se quiera.
function fabricaEspia() {
  const real = new IDBFactory();
  const abiertas = [];
  return {
    abiertas,
    open(...datos) {
      const peticion = real.open(...datos);
      peticion.addEventListener('success', () => abiertas.push(peticion.result));
      return peticion;
    },
    matarUltima() {
      const conexion = abiertas[abiertas.length - 1];
      conexion.transaction = () => {
        throw PERDIDA();
      };
    },
  };
}

test('el registro se levanta solo cuando iOS le mata la conexión, y el carro se crea', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  assert.equal(fabrica.abiertas.length, 1);
  fabrica.matarUltima();
  const { carro, nuevo } = await almacen.abrirOCrear('JPX248', { marca: 'Chevrolet' });
  assert.equal(carro.placa, 'JPX248');
  assert.equal(nuevo, true);
  assert.equal(fabrica.abiertas.length, 2, 'abrió una conexión nueva');
  assert.equal((await almacen.obtener('JPX248')).marca, 'Chevrolet');
});

test('también si la conexión se cerró de verdad', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  fabrica.abiertas[0].close();
  await almacen.guardar({ placa: 'ABC123', piezas: {} });
  assert.equal((await almacen.listar()).length, 1);
  assert.equal(fabrica.abiertas.length, 2);
});

test('la foto del carro también entra con la conexión recién caída', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  await almacen.abrirOCrear('JPX248', {});
  fabrica.matarUltima();
  await almacen.guardarFoto({ placa: 'JPX248', pieza: 'carro', foto: new Blob(['foto'], { type: 'image/jpeg' }) });
  assert.equal(await (await almacen.portada('JPX248')).foto.text(), 'foto');
});

test('los escaneos se levantan igual', async () => {
  const fabrica = fabricaEspia();
  const escaneos = await abrirEscaneos({ indexedDB: fabrica });
  fabrica.matarUltima();
  assert.deepEqual(await escaneos.placas(), []);
  assert.equal(fabrica.abiertas.length, 2);
});

test('un error de datos no se repite ni abre otra conexión: reconectar no lo arregla', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  await assert.rejects(almacen.abrirOCrear('', {}), /Falta la placa/);
  assert.equal(fabrica.abiertas.length, 1);
  assert.equal(seCayoLaConexion(new DOMException('no se puede copiar', 'DataCloneError')), false);
  assert.equal(seCayoLaConexion(new DOMException('sin espacio', 'QuotaExceededError')), false);
  assert.equal(seCayoLaConexion(new Error('Falta la placa')), false);
  assert.equal(seCayoLaConexion(PERDIDA()), true);
  assert.equal(seCayoLaConexion(new DOMException('The database connection is closing', 'InvalidStateError')), true);
});

test('si la base no vuelve, el error sale: la pantalla tiene que poder decidir', async () => {
  let intentos = 0;
  const conexion = conexionViva({ close() {} }, async () => {
    intentos++;
    throw PERDIDA();
  }, { esperas: [0, 0] });
  await assert.rejects(conexion.protegida(async () => {
    throw PERDIDA();
  })(), /server lost/);
  assert.equal(intentos, 2);
});

test('una operación que nunca responde no deja la pantalla colgada para siempre', async () => {
  let abiertas = 0;
  const conexion = conexionViva({ close() {} }, async () => {
    abiertas++;
    return { close() {} };
  }, { esperas: [0], tope: 20 });
  await assert.rejects(conexion.protegida(() => new Promise(() => {}))(), (e) => e.name === 'TimeoutError');
  assert.equal(abiertas, 1, 'probó con una conexión nueva antes de rendirse');
  await assert.rejects(conTope(new Promise(() => {}), 5), (e) => e.name === 'TimeoutError');
  assert.equal(await conTope(Promise.resolve(7), 50), 7);
});

test('dos operaciones que caen a la vez comparten la reconexión', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  fabrica.matarUltima();
  await Promise.all([almacen.listar(), almacen.listarEmpleados()]);
  assert.equal(fabrica.abiertas.length, 2);
});

test('las fotos van a la base como bytes y salen como Blob, con su tipo', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  const grande = new Blob(['grande'], { type: 'image/jpeg' });
  const chica = new Blob(['chica'], { type: 'image/webp' });
  const id = await almacen.guardarFoto({ placa: 'AAA111', pieza: 'carro', foto: grande, miniatura: chica, ancho: 10, alto: 20 });

  const bruto = await new Promise((listo) => {
    const peticion = fabrica.abiertas[0].transaction('fotos').objectStore('fotos').get(id);
    peticion.onsuccess = () => listo(peticion.result);
  });
  assert.ok(!(bruto.foto instanceof Blob), 'en la base no hay un Blob');
  assert.ok(bruto.foto.bytes instanceof ArrayBuffer);

  const [leida] = await almacen.listarFotos('AAA111');
  assert.ok(leida.foto instanceof Blob);
  assert.equal(await leida.foto.text(), 'grande');
  assert.equal(leida.foto.type, 'image/jpeg');
  assert.equal(await leida.miniatura.text(), 'chica');
  assert.equal(leida.miniatura.type, 'image/webp');
});

test('sin miniatura aparte, la foto no se guarda dos veces', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  const foto = new Blob(['una'], { type: 'image/jpeg' });
  const id = await almacen.guardarFoto({ placa: 'AAA111', pieza: 'carro', foto, miniatura: foto });
  const bruto = await new Promise((listo) => {
    const peticion = fabrica.abiertas[0].transaction('fotos').objectStore('fotos').get(id);
    peticion.onsuccess = () => listo(peticion.result);
  });
  assert.equal(bruto.miniatura.bytes, bruto.foto.bytes, 'el mismo arreglo de bytes');
});

test('una foto vieja, guardada como Blob, se sigue leyendo', async () => {
  const fabrica = fabricaEspia();
  const almacen = await abrirAlmacen({ indexedDB: fabrica });
  await new Promise((listo) => {
    const tx = fabrica.abiertas[0].transaction('fotos', 'readwrite');
    tx.objectStore('fotos').add({ placa: 'VIE111', pieza: 'carro', foto: new Blob(['vieja']), miniatura: new Blob(['mini']), ancho: 1, alto: 1, creado: '2026-10-15T00:00:00.000Z' });
    tx.oncomplete = listo;
  });
  const portada = await almacen.portada('VIE111');
  assert.equal(await portada.foto.text(), 'vieja');
  assert.equal(await portada.miniatura.text(), 'mini');
});

test('la foto de un escaneo va como bytes, y quien guarda sigue con su Blob', async () => {
  const fabrica = fabricaEspia();
  const escaneos = await abrirEscaneos({ indexedDB: fabrica });
  const textura = new Blob(['jpeg'], { type: 'image/jpeg' });
  const devuelto = await escaneos.guardar('TEX111', {
    posiciones: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    uvs: new Float32Array(6),
    textura,
    etiquetas: new Uint8Array(3),
    nombres: ['nada'],
    medidas: { largo: 4, ancho: 2, alto: 1 },
    medidasDibujo: { largo: 4, ancho: 2, alto: 1 },
  });
  assert.equal(devuelto.textura, textura);
  const bruto = await new Promise((listo) => {
    const peticion = fabrica.abiertas[0].transaction('escaneos').objectStore('escaneos').get('TEX111');
    peticion.onsuccess = () => listo(peticion.result);
  });
  assert.ok(bruto.textura.bytes instanceof ArrayBuffer);
  const leido = await escaneos.obtener('TEX111');
  assert.ok(leido.textura instanceof Blob);
  assert.equal(await leido.textura.text(), 'jpeg');
});

test('un escaneo sin foto sigue sin foto', async () => {
  const escaneos = await abrirEscaneos({ indexedDB: new IDBFactory() });
  await escaneos.guardar('SIN111', {
    posiciones: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    etiquetas: new Uint8Array(3),
    nombres: ['nada'],
    medidas: { largo: 4, ancho: 2, alto: 1 },
    medidasDibujo: { largo: 4, ancho: 2, alto: 1 },
  });
  assert.equal((await escaneos.obtener('SIN111')).textura, null);
  assert.equal(await escaneos.obtener('NOHAY1'), null);
});

test('aBytes y aBlob dejan pasar lo que no es una imagen', async () => {
  assert.equal(await aBytes(null), null);
  assert.equal(aBlob(null), null);
  assert.equal(aBlob(undefined), undefined);
  const blob = new Blob(['x']);
  assert.equal(aBlob(blob), blob);
});

test('el espacio solo se nombra cuando es el espacio', () => {
  // Era el texto de cualquier error: en un iPhone con espacio de sobra, una mentira.
  const perdida = mensajeDelRegistro(PERDIDA(), 'vuelve a intentarlo');
  assert.doesNotMatch(perdida, /espacio/i);
  assert.match(perdida, /Recarga la página y vuelve a intentarlo/);
  // Sin el original no hay cómo arreglarlo desde lejos.
  assert.match(perdida, /UnknownError: Connection to Indexed Database server lost/);

  const sinEspacio = mensajeDelRegistro(new DOMException('over quota', 'QuotaExceededError'), 'vuelve a intentarlo');
  assert.match(sinEspacio, /espacio/);
  assert.doesNotMatch(sinEspacio, /over quota/);

  // Lo que ya escribe la app en español pasa tal cual.
  assert.equal(mensajeDelRegistro(new Error('Falta la placa'), 'vuelve a intentarlo'), 'Falta la placa');

  // Un lienzo sin memoria en Safari: lo que no se entiende tampoco culpa al espacio.
  const lienzo = mensajeDelRegistro(new TypeError("null is not an object (evaluating 'ctx.imageSmoothingQuality = \"high\"')"), 'vuelve a intentarlo');
  assert.doesNotMatch(lienzo, /espacio/i);
  assert.match(lienzo, /TypeError: null is not an object/);
});

test('el aviso de borrador dice qué hacer y trae el dato', () => {
  const aviso = avisoDeBorrador(PERDIDA());
  assert.match(aviso, /borrador/);
  assert.match(aviso, /reinicia el celular/);
  assert.match(aviso, /UnknownError/);
  assert.doesNotMatch(aviso, /espacio/i);
});

test('el dato del error no se desborda', () => {
  assert.ok(detalleDelError(new Error('x'.repeat(500))).length <= 160);
  assert.equal(detalleDelError(null), 'Error: ');
  assert.equal(detalleDelError(new DOMException('uy', 'UnknownError')), 'UnknownError: uy');
});
