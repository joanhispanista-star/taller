// Los modelos de catálogo que la app ya trae (js/modelos-catalogo.js): el archivo de verdad se lee, se baja una sola vez,
// y sale solo al abrir un carro de su línea, sin pasarle por encima a nada que mande más. La pantalla se prueba con
// un DOM, una caché y una red de mentira; lo demás es de verdad: el lector, la tubería del escaneo y la base (fake-indexeddb).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { IDBFactory } from 'fake-indexeddb';
import { archivosApp } from '../herramientas/sellar-version.mjs';
import { normalizarCarroceria } from '../js/carrocerias.js';
import { entradaDe, entradaExacta } from '../js/catalogo.js';
import { ALTURA_DE_LA_MIRA, LENTE, VISTAS, distanciaQueEncuadra } from '../js/encuadre.js';
import { ajustesDelEscaneo, modeloDesdeEscaneo } from '../js/escaneo.js';
import { escaneoDeCatalogo } from '../js/escaneo-catalogo.js';
import { leerArchivoDeEscaneo } from '../js/escaneo-importar.js';
import { crearEscaneoPantalla } from '../js/escaneo-pantalla.js';
import { abrirEscaneos } from '../js/escaneos.js';
import { abrirAlmacen, crearCarro, deserializarCarro, serializarCarro } from '../js/garaje.js';
import { CAJA_DE_MODELOS, FOTO_COMPLETA, FOTO_LIVIANA, MODELOS, OPCIONES_LIVIANAS, SIN_CUPO, anosDelModelo, bajarModelo, colorElegido, colorQueSeVe, creditoDeCatalogo, datosParaUsarModelo, fijarCupo, hexDeColor, leerModeloGlb, marcarAbriendo, modeloDeLaLinea, modeloDelCatalogo, modeloParecido, modeloQueLeToca, nivelDeCupo, pareceGlb, quitarMarcaDeAbriendo, revisarIntentoAnterior, textoDeLaLista, textoDelCredito } from '../js/modelos-catalogo.js';
import { nombreDeColor } from '../js/color-foto.js';
import { crearMedidor } from '../js/generico/en-prueba.js';
import { crearPisoVitrina } from '../js/piso-vitrina.js';
import { campoDePieza, campoGuardado } from '../js/escaneo-velo.js';
import FDBObjectStore from 'fake-indexeddb/lib/FDBObjectStore';
import { PIEZAS } from '../js/piezas.js';
import { piezaTocada } from '../js/toque.js';

// Para leer la máscara del brillo sin un navegador. sharp llega con el reconocedor (@huggingface/transformers), y ya lo usa herramientas/generar-iconos.mjs;
// si un día no está, esa prueba no corre, y no es razón para que caigan las demás de este archivo.
const sharp = await import('sharp').then((m) => m.default, () => null);

const CAPTIVA = MODELOS[0];
const ruta = (modelo) => new URL('../' + modelo.archivo, import.meta.url);
const crudo = fs.readFileSync(ruta(CAPTIVA));
const BYTES = crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength);
const copiaDeBytes = () => BYTES.slice(0);

// Las 17 de afuera del catálogo de piezas: las que tiene un carro de catálogo. Las de adentro no están en el archivo.
const DE_AFUERA = PIEZAS.slice(0, 17).map((p) => p.id);

function primeraDiferencia(a, b) {
  if (a.length !== b.length) return 'largos ' + a.length + ' y ' + b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 'en ' + i + ': ' + a[i] + ' y ' + b[i];
  return null;
}

// ---------- La tabla y el archivo de verdad ----------

test('la Captiva del catálogo: se vende en Colombia desde finales de 2018, y lo de la trompa de 2024 no se da por cierto para Colombia', () => {
  const entrada = entradaDe('Chevrolet', 'Captiva (nueva)');
  assert.equal(entrada.anos, '2019-hoy');
  assert.match(entrada.notas, /trompa nueva hacia 2024 \(Colombia sin confirmar\)/);
});

test('cada entrada de la tabla está completa, su línea existe en el catálogo y su archivo pesa lo que dice', () => {
  assert.ok(MODELOS.length >= 1);
  for (const m of MODELOS) {
    const entrada = entradaDe(m.marca, m.linea);
    assert.ok(entrada, 'no está en el catálogo: ' + m.marca + ' ' + m.linea);
    assert.equal(entrada.linea, m.linea, 'tal como la guarda el catálogo');
    assert.equal(modeloDeLaLinea({ marca: entrada.marca, linea: entrada.linea }), m);
    const peso = fs.statSync(ruta(m)).size;
    assert.ok(peso < 8e6, 'pesa ' + peso);
    assert.ok(Math.abs(peso / 1e6 - m.megas) < 0.1, 'la tabla dice ' + m.megas + ' MB y son ' + peso / 1e6);
    assert.equal(typeof m.colorFoto, 'number');
    assert.ok(m.corto && m.nombre);
    assert.ok(m.credito.autor && m.credito.licencia && m.credito.enlaceLicencia.startsWith('https://') && m.credito.cambios);
    assert.ok(m.credito.fotos.length > 0);
    for (const f of m.credito.fotos) assert.match(f.enlace, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  }
});

test('cada archivo de verdad se lee sin lienzos: las 17 piezas de afuera, en metros, con su foto JPEG', () => {
  for (const m of MODELOS) {
    const crudos = fs.readFileSync(ruta(m));
    assert.equal(crudos.subarray(0, 4).toString('latin1'), 'glTF');
    const malla = leerModeloGlb(crudos);
    assert.equal(malla.colores, null, 'el color por vértice sale de un lienzo, y aquí no hay ninguno');
    const triangulos = malla.indices.length / 3;
    assert.ok(triangulos < 150000, triangulos + ' triángulos');
    assert.ok(Number.isInteger(triangulos) && triangulos > 1000);
    for (let i = 0; i < malla.indices.length; i++) assert.ok(malla.indices[i] < malla.posiciones.length / 3);
    assert.equal(malla.textura.type, 'image/jpeg');

    const e = escaneoDeCatalogo(malla, ajustesDelEscaneo);
    const ficha = entradaDe(m.marca, m.linea);
    assert.equal(e.carroceria, normalizarCarroceria(ficha.carroceria));
    assert.equal(e.catalogo.origen, 'catalogo');
    // Medidas en metros: las de la ficha, y la malla de verdad a esa escala y centrada, con el piso abajo.
    assert.deepEqual(e.medidas, { largo: ficha.largo / 1000, ancho: ficha.ancho / 1000, alto: ficha.alto / 1000 });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < e.posiciones.length; i++) {
      min[i % 3] = Math.min(min[i % 3], e.posiciones[i]);
      max[i % 3] = Math.max(max[i % 3], e.posiciones[i]);
    }
    assert.ok(Math.abs(max[2] - min[2] - e.medidas.largo) < 0.03, 'largo ' + (max[2] - min[2]));
    assert.ok(Math.abs(max[2] + min[2]) < 0.03, 'centrada a lo largo: ' + min[2] + ' a ' + max[2]);
    assert.ok(Math.abs(max[1] - e.medidas.alto) < 0.03, 'alto ' + max[1]);
    assert.ok(Math.abs(min[1]) < 0.03, 'piso ' + min[1]);
    // El ancho lleva los espejos.
    assert.ok(max[0] - min[0] > e.medidas.ancho && max[0] - min[0] < e.medidas.ancho + 0.4, 'ancho ' + (max[0] - min[0]));

    // Cada pieza de afuera tiene vértices en la malla, y cada etiqueta dice una pieza que existe.
    const cuentas = new Map();
    for (const etiqueta of e.etiquetas) cuentas.set(etiqueta, (cuentas.get(etiqueta) || 0) + 1);
    for (const id of DE_AFUERA) assert.ok(cuentas.get(e.nombres.indexOf(id)) > 50, 'falta la pieza ' + id);
    assert.equal(e.nombres[0], 'nada');
    for (const etiqueta of cuentas.keys()) assert.ok(etiqueta < e.nombres.length, 'etiqueta sin nombre: ' + etiqueta);
    // El nombre que trae el archivo es el de la tabla: el crédito y el color de por dentro salen de ahí.
    assert.equal(modeloDelCatalogo(malla.catalogo), m);
    // La máscara del brillo, al lado de la capa de pintura y sin pisarla. Sin esto, el carro se ve sin el brillo que se mueve, y nada avisa.
    const { capa, brillo } = malla.catalogo.pintura;
    assert.ok(brillo, 'sin máscara del brillo');
    assert.equal(brillo.u0, capa.escala_u);
    assert.equal(brillo.v0, capa.v0);
  }
});

test('el lector directo da lo mismo que la ruta de la receta: posiciones, índices, coordenadas y etiquetas', async (t) => {
  // Lo que Node no tiene: la ruta normal abre la foto en lienzos, y esos no van a cambiar ningún número de la malla.
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async (blob) => ({ width: 8, height: 8, bytes: blob.size, close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return { drawImage() {}, getImageData: (_x, _y, ancho, alto) => ({ data: new Uint8ClampedArray(ancho * alto * 4).fill(120) }) };
    }
    async convertToBlob() {
      return new Blob([new Uint8Array(5)], { type: 'image/jpeg' });
    }
  };
  t.after(() => {
    delete globalThis.self;
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
  });
  const normal = await leerArchivoDeEscaneo(new File([copiaDeBytes()], 'captiva.glb'));
  const directa = leerModeloGlb(copiaDeBytes());
  assert.ok(normal.uvs, 'la ruta normal traía la foto');
  assert.equal(primeraDiferencia(directa.posiciones, normal.posiciones), null, 'posiciones');
  assert.equal(primeraDiferencia(directa.indices, normal.indices), null, 'índices');
  // Aquí se notaría una v volteada: la ruta normal deja v tal cual con flipY en false.
  assert.equal(primeraDiferencia(directa.uvs, normal.uvs), null, 'coordenadas');
  assert.equal(primeraDiferencia(directa.pieza, normal.pieza), null, 'piezas');
  assert.deepEqual(directa.catalogo, normal.catalogo);
  const a = escaneoDeCatalogo(directa, ajustesDelEscaneo);
  const b = escaneoDeCatalogo(normal, ajustesDelEscaneo);
  assert.equal(primeraDiferencia(a.posiciones, b.posiciones), null, 'posiciones del escaneo');
  assert.equal(primeraDiferencia(a.etiquetas, b.etiquetas), null, 'etiquetas del escaneo');
  assert.deepEqual(a.medidasDibujo, b.medidasDibujo);
  // Los ejes y las juntas salen del archivo: el genérico de adentro queda igual aunque no haya color por vértice.
  for (const k of ['ejeDel', 'ejeTras', 'puertaDel', 'puertaMedia', 'puertaTras', 'capoTras', 'parabrisasAlto']) assert.equal(a.ajustes[k], b.ajustes[k], k);
});

// El mismo archivo con otro JSON, y el resto como estaba. La cuenta en bytes: el JSON trae tildes.
function armar(cambiar) {
  const largoJson = new DataView(BYTES).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(BYTES, 20, largoJson)));
  cambiar(json);
  const sinRelleno = new TextEncoder().encode(JSON.stringify(json));
  const relleno = (4 - (sinRelleno.length % 4)) % 4;
  const restoDesde = 20 + largoJson;
  const salida = new Uint8Array(20 + sinRelleno.length + relleno + BYTES.byteLength - restoDesde).fill(32);
  salida.set(new Uint8Array(BYTES, 0, 20));
  salida.set(sinRelleno, 20);
  salida.set(new Uint8Array(BYTES, restoDesde), 20 + sinRelleno.length + relleno);
  const d = new DataView(salida.buffer);
  d.setUint32(8, salida.length, true);
  d.setUint32(12, sinRelleno.length + relleno, true);
  return salida.buffer;
}

test('lo que no es un carro de catálogo entero no se lee a medias', () => {
  assert.throws(() => leerModeloGlb(new ArrayBuffer(4)), /GLB/);
  assert.throws(() => leerModeloGlb(BYTES.slice(0, BYTES.byteLength - 100)), /GLB/, 'cortado');
  assert.throws(() => leerModeloGlb(new TextEncoder().encode('<html>no es</html>').buffer), /GLB/);
  assert.throws(() => leerModeloGlb(armar((j) => delete j.nodes[0].extras)), /sí mismo/);
  assert.throws(() => leerModeloGlb(armar((j) => (j.nodes[0].scale = [2, 2, 2]))), /sin mover/);
  assert.throws(() => leerModeloGlb(armar((j) => j.meshes[0].primitives.push(j.meshes[0].primitives[0]))), /una sola malla/);
  assert.throws(() => leerModeloGlb(armar((j) => delete j.meshes[0].primitives[0].attributes._PIEZA)), /piezas/);
  assert.throws(() => leerModeloGlb(armar((j) => delete j.images[0].bufferView)), /foto/);
  // Y el que sí, lee: el armador de arriba no daña nada por su cuenta.
  assert.ok(leerModeloGlb(armar(() => {})).pieza.length);
});

test('sin color por vértice el carro no sale gris ni revienta, y con la foto ya abierta no se abre otra vez', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const e = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  const colorBase = CAPTIVA.colorFoto;
  const sinNavegador = modeloDesdeEscaneo(e, { colorBase });
  assert.deepEqual(sinNavegador.seleccionables.map((m) => m.userData.piezaId).sort(), [...DE_AFUERA].sort());
  const base = new THREE.Color(colorBase).getHex();
  for (const m of sinNavegador.seleccionables) assert.equal(m.material.color.getHex(), base, m.name + ' salió gris');
  assert.equal(await sinNavegador.texturaLista, null);

  const abiertas = [];
  globalThis.createImageBitmap = async (blob) => {
    abiertas.push(blob);
    return { width: 4096, height: 3072, close() {} };
  };
  t.after(() => delete globalThis.createImageBitmap);
  const conFoto = modeloDesdeEscaneo(e, { colorBase, color: '#2255aa', placa: 'JPX 248' });
  assert.ok(await conFoto.texturaLista);
  assert.deepEqual(abiertas, [e.textura]);
  const pieza = conFoto.porId.get('capo');
  assert.equal(pieza.material.isShaderMaterial, true, 'con la foto puesta');
  assert.equal(pieza.material.defines.CATALOGO, 1);
  assert.equal(pieza.material.uniforms.uConTono.value, 1);

  const yaAbierta = { width: 4096, height: 3072, close() {} };
  const conLaAbierta = modeloDesdeEscaneo({ ...e, fotoAbierta: yaAbierta }, { colorBase });
  assert.equal((await conLaAbierta.texturaLista).image, yaAbierta);
  assert.equal(abiertas.length, 1, 'se abrió otra vez');
});

// ---------- La segunda versión, en el archivo de verdad ----------

// El tamaño de la foto y cómo va muestreado su color, de la cabecera del JPEG: sin abrirlo.
function cabeceraDeJpeg(b) {
  for (let i = 2; i + 9 < b.length && b[i] === 0xff; i += 2 + ((b[i + 2] << 8) | b[i + 3])) {
    if (b[i + 1] < 0xc0 || b[i + 1] > 0xc2) continue;
    return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8], muestreo: Array.from({ length: b[i + 9] }, (_, k) => b[i + 11 + k * 3]) };
  }
  throw new Error('no se encontró la cabecera del JPEG');
}

test('la capa y la máscara van en la foto, lado a lado, y el mosaico no las lee', async () => {
  const malla = leerModeloGlb(copiaDeBytes());
  const { capa, brillo } = malla.catalogo.pintura;
  const { ancho, alto, muestreo } = cabeceraDeJpeg(new Uint8Array(await malla.textura.arrayBuffer()));
  assert.deepEqual([ancho, alto], [4096, 3072]);
  // La máscara guarda tres cosas distintas en rojo, verde y azul: con el color submuestreado se correrían unas sobre otras.
  assert.deepEqual(muestreo, [0x11, 0x11, 0x11], 'el color del JPEG va sin submuestrear');
  const u = malla.uvs.filter((_, i) => i % 2 === 0);
  const v = malla.uvs.filter((_, i) => i % 2 === 1);
  const [maxU, maxV] = [u.reduce((a, b) => Math.max(a, b)), v.reduce((a, b) => Math.max(a, b))];
  assert.ok(u.reduce((a, b) => Math.min(a, b)) >= 0 && maxU <= 1, 'u del mosaico');
  assert.ok(v.reduce((a, b) => Math.min(a, b)) >= 0 && maxV <= capa.v0, 'el mosaico se queda arriba de la capa: ' + maxV);
  // Cada punto del mosaico cae en su capa, a la izquierda, y en su máscara, a la derecha.
  assert.ok(maxU * capa.escala_u <= brillo.u0, 'la capa no pisa la máscara');
  assert.ok(brillo.u0 + maxU * brillo.escala_u <= 1 && brillo.v0 + maxV * brillo.escala_v <= 1, 'la máscara se sale de la foto');
});

test('la máscara dice lo que el sombreador espera: mucho brillo en capó y techo, poco en los costados, nada en las llantas', { skip: !sharp && 'sin sharp' }, async () => {
  const malla = leerModeloGlb(copiaDeBytes());
  const e = escaneoDeCatalogo(malla, ajustesDelEscaneo);
  const { capa, brillo } = malla.catalogo.pintura;
  const { data, info } = await sharp(Buffer.from(await malla.textura.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
  // En lineal, que es como lo lee el sombreador.
  const leer = (u, v, canal) => {
    const b = data[(Math.floor(v * info.height) * info.width + Math.floor(u * info.width)) * info.channels + canal] / 255;
    return b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4;
  };
  const dz = e.catalogo.centroZ;
  // Las llantas no son pieza: se reconocen por dónde están (en metros, en el marco de las fotos).
  const enLlanta = (x, y, z) => y < 0.72 && Math.abs(x) > 0.75 && (Math.hypot(y - 0.345, z + 1.4) < 0.36 || Math.hypot(y - 0.345, z - 1.35) < 0.36);
  const cuentas = new Map();
  for (let i = 0; i < e.etiquetas.length; i++) {
    const [u, v] = [e.uvs[i * 2], e.uvs[i * 2 + 1]];
    const nombre = e.nombres[e.etiquetas[i]];
    const quien = nombre === 'nada' && enLlanta(e.posiciones[i * 3], e.posiciones[i * 3 + 1], e.posiciones[i * 3 + 2] + dz) ? 'llanta' : nombre;
    const c = cuentas.get(quien) || { n: 0, brillo: 0, maxBrillo: 0, sombra: 0, filo: 0, capa: 0 };
    const [r, g, b] = [0, 1, 2].map((k) => leer(brillo.u0 + u * brillo.escala_u, brillo.v0 + v * brillo.escala_v, k));
    c.n += 1;
    c.brillo += r;
    c.maxBrillo = Math.max(c.maxBrillo, r);
    c.sombra = Math.max(c.sombra, g);
    c.filo = Math.max(c.filo, b);
    c.capa += leer(u * capa.escala_u, capa.v0 + v * capa.escala_v, 0);
    cuentas.set(quien, c);
  }
  const media = (quien) => cuentas.get(quien).brillo / cuentas.get(quien).n;
  assert.ok(media('capo') > 0.45, 'capó: ' + media('capo'));
  assert.ok(media('techo') > 0.2 && media('techo') < media('capo'), 'techo: ' + media('techo'));
  for (const id of ['puerta-del-izq', 'puerta-del-der', 'puerta-tras-izq', 'puerta-tras-der', 'costado-izq', 'costado-der', 'baul']) {
    assert.ok(media(id) < 0.2, id + ': ' + media(id));
    // Los costados ya traen los reflejos de su foto: la sombra por la forma y el filo del pliegue son cosa del capó. Con margen, por lo que deja el JPEG.
    assert.ok(cuentas.get(id).sombra < 0.01 && cuentas.get(id).filo < 0.01, id);
  }
  assert.ok(cuentas.get('capo').sombra > 0.5 && cuentas.get('capo').filo > 0.5, 'el pliegue del capó');
  const llanta = cuentas.get('llanta');
  assert.ok(llanta.n > 1000, 'no se encontraron las llantas: ' + llanta.n);
  assert.ok(llanta.maxBrillo < 0.01, 'las llantas no brillan: ' + llanta.maxBrillo);
  assert.ok(llanta.capa / llanta.n < 0.01, 'y no se pintan: ' + llanta.capa / llanta.n);
  assert.ok(cuentas.get('capo').capa / cuentas.get('capo').n > 0.2, 'el capó sí toma el color');
});

test('un archivo sin máscara se lee igual, y dibuja sin una cuenta de más: un GLB de antes se sigue viendo como antes', async (t) => {
  globalThis.createImageBitmap = async () => ({ width: 4096, height: 3072, close() {} });
  t.after(() => delete globalThis.createImageBitmap);
  const con = leerModeloGlb(copiaDeBytes());
  const sin = leerModeloGlb(armar((j) => delete j.nodes[0].extras.taller.pintura.brillo));
  assert.equal(sin.catalogo.pintura.brillo, undefined);
  assert.deepEqual(sin.catalogo.pintura.capa, con.catalogo.pintura.capa);
  assert.equal(primeraDiferencia(sin.posiciones, con.posiciones), null, 'posiciones');
  assert.equal(primeraDiferencia(sin.uvs, con.uvs), null, 'coordenadas');
  assert.equal(primeraDiferencia(sin.pieza, con.pieza), null, 'piezas');
  const materialDe = async (malla) => {
    const m = modeloDesdeEscaneo(escaneoDeCatalogo(malla, ajustesDelEscaneo), { colorBase: CAPTIVA.colorFoto, color: '#2255aa' });
    assert.ok(await m.texturaLista);
    // Todas las piezas llevan el mismo: si una se queda sin la foto, se nota como un parche.
    const materiales = new Set(m.seleccionables.map((s) => s.material.defines));
    assert.equal(materiales.size, 1);
    return m.porId.get('capo').material;
  };
  const sinMascara = await materialDe(sin);
  assert.deepEqual(sinMascara.defines, { CATALOGO: 1 });
  assert.equal(sinMascara.uniforms.uBrillo, undefined);
  assert.equal(sinMascara.uniforms.uConTono.value, 1, 'el color de la ficha lo toma igual');
  const conMascara = await materialDe(con);
  assert.deepEqual(conMascara.defines, { CATALOGO: 1, CATALOGO_BRILLO: 1 });
  const { u0, v0, escala_u, escala_v } = con.catalogo.pintura.brillo;
  assert.deepEqual(conMascara.uniforms.uBrillo.value.toArray(), [u0, v0, escala_u, escala_v]);
  // Lo mismo con el mismo color: la máscara no cambia cómo se tiñe.
  assert.deepEqual(conMascara.uniforms.uTono.value.toArray(), sinMascara.uniforms.uTono.value.toArray());
});

// Un dedo de verdad sobre el archivo de verdad: la función del toque (js/toque.js), con la cámara de un botón de la app, en un lienzo del tamaño del de un
// teléfono, y con lo mismo que le pasa el visor. Lo que cuenta es lo que le llega a la orden. `vista`: el nombre de un botón, o una posición de cámara.
// `punto`: en metros, en el marco de las fotos, donde el centro del carro no cae en z = 0: la app lo corre por centroZ.
function dedoSobre(bytes) {
  const ANCHO = 390;
  const ALTO = 616;
  const e = escaneoDeCatalogo(leerModeloGlb(bytes), ajustesDelEscaneo);
  const { grupo, disposicion: medidas } = modeloDesdeEscaneo(e, { colorBase: CAPTIVA.colorFoto });
  const tocar = (vista, [x, y, z], opciones = { radioSobreLata: 4 }) => {
    const camara = new THREE.PerspectiveCamera(LENTE, ANCHO / ALTO, 0.1, 80);
    const mira = new THREE.Vector3(0, medidas.alto * ALTURA_DE_LA_MIRA, 0);
    const direccion = new THREE.Vector3(...(typeof vista === 'string' ? VISTAS[vista] : vista)).sub(mira).normalize();
    camara.position.copy(mira).addScaledVector(direccion, distanciaQueEncuadra({ direccion, medidas, mira, fov: LENTE, aspecto: ANCHO / ALTO }));
    camara.lookAt(mira);
    camara.updateMatrixWorld(true);
    const q = new THREE.Vector3(x, y, z - (e.catalogo.centroZ || 0)).project(camara);
    return piezaTocada({ camara, grupo, x: ((q.x + 1) / 2) * ANCHO, y: ((1 - q.y) / 2) * ALTO, ancho: ANCHO, alto: ALTO, ...opciones });
  };
  return { e, tocar };
}

test('la franja bajo el vidrio de atrás, lo de encima de los stops y el hombro no son Techo: cada pieza son 90.000 en la nómina', () => {
  const { e, tocar } = dedoSobre(copiaDeBytes());
  const puntos = [
    // Estos, en la primera versión, marcaban Techo (o nada): 7 de 7 fallan con ese archivo.
    ['franja bajo el vidrio, al centro', 'atras', [0, 1.235, 2.13], 'baul'],
    ['franja bajo el vidrio, a media compuerta', 'atras', [-0.35, 1.25, 2.08], 'baul'],
    ['encima del stop izquierdo', 'atras', [-0.5, 1.185, 2.1], 'baul'],
    ['encima del stop derecho', 'atras', [0.5, 1.185, 2.1], 'baul'],
    ['hombro del costado izquierdo', 'izquierdo', [-0.82, 1.215, 1.45], 'costado-izq'],
    ['hombro del costado derecho', 'derecho', [0.82, 1.215, 1.45], 'costado-der'],
    ['hombro, de tres cuartos por detrás', [-10.3, 2.74, 11], [-0.8, 1.24, 1.65], 'costado-izq'],
    // Y lo que estaba bien sigue bien: se arregló sin correr el problema a otro lado.
    ['alto de la puerta de atrás', 'izquierdo', [-0.87, 1.175, 0.6], 'puerta-tras-izq'],
    ['alto de la puerta de adelante', 'derecho', [0.87, 1.165, -0.4], 'puerta-del-der'],
    ['compuerta, debajo del corbatín', 'atras', [0.25, 0.95, 2.24], 'baul'],
    ['techo, al centro', 'arriba', [0, 1.72, 0.6], 'techo'],
    ['techo, sobre la ventana', 'derecho', [0.7, 1.665, 0.3], 'techo'],
    ['capó, al centro', 'frente', [0, 1.13, -1.75], 'capo'],
    ['parabrisas: no es pieza', 'frente', [0, 1.45, -0.8], null],
    ['vidrio de atrás: no es pieza', 'atras', [0, 1.45, 1.96], null],
  ];
  for (const [nombre, vista, punto, pieza] of puntos) assert.equal(tocar(vista, punto), pieza, nombre);
  // Y contado por triángulos, sin cámara: debajo de la ventana no queda Techo, ni capó en el pilar. En la primera versión, 1.525 y 48.
  const techo = e.nombres.indexOf('techo');
  const capo = e.nombres.indexOf('capo');
  let techoAbajo = 0;
  let capoEnElPilar = 0;
  const { posiciones: P, indices: I, etiquetas: E } = e;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const etiqueta = E[a] === E[b] || E[a] === E[c] ? E[a] : E[b] === E[c] ? E[b] : E[a];
    const x = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const z = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3 + (e.catalogo.centroZ || 0);
    if (etiqueta === techo && y > 1.15 && y < 1.31 && z > 0.46 && z < 2.24) techoAbajo += 1;
    if (etiqueta === capo && x > 0.62 && x < 0.72 && z > -1.06 && z < -0.86) capoEnElPilar += 1;
  }
  assert.equal(techoAbajo, 0, 'Techo debajo de la ventana');
  assert.equal(capoEnElPilar, 0, 'capó en el pilar');
});

test('el anillo sobre una lata: lo bajo de la puerta es puerta, y el estribo se sigue pudiendo marcar', () => {
  const { tocar } = dedoSobre(copiaDeBytes());
  const lata = [-0.92, 0.58, -0.4];
  const estribo = [-0.92, 0.5, -0.4];
  assert.equal(tocar('izquierdo', lata), 'puerta-del-izq');
  assert.equal(tocar('izquierdo', estribo), 'estribo-izq');
  // Con el anillo de siempre el mismo punto le daba el estribo: es lo que se medía como plata mal contada.
  assert.equal(tocar('izquierdo', lata, {}), 'estribo-izq');
  // El visor se lo pasa solo a un carro de catálogo: un escaneo y el genérico siguen como estaban, también el de "por dentro", que es el genérico.
  assert.match(fs.readFileSync(new URL('../js/visor.js', import.meta.url), 'utf8'), /escaneoVisto && escaneoVisto\.catalogo && !verPiezasEscaneo \? \{ radioSobreLata: 4 \} : \{\}/);
});

test('al marcar el capó sale su línea: es una lámina suelta, y su orilla abierta cuenta como orilla', () => {
  const e = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  const etiqueta = e.nombres.indexOf('capo');
  const debajo = (campo) => {
    let n = 0;
    for (let i = 0; i < campo.length; i++) if (e.etiquetas[i] === etiqueta && campo[i] < 0.5) n += 1;
    return n;
  };
  const con = campoGuardado(e, 'capo').campo;
  const sin = campoDePieza(e, 'capo', 10).campo;
  // Sin cerrar las orillas, el campo casi no baja dentro de la lámina: no cruza 0,5, y el capó marcado se funde con los guardafangos marcados.
  assert.ok(debajo(con) > 3 * debajo(sin), 'con ' + debajo(con) + ' y sin ' + debajo(sin));
  let [minimo, maximo] = [1, 0];
  for (let i = 0; i < con.length; i++) {
    if (e.etiquetas[i] !== etiqueta) continue;
    minimo = Math.min(minimo, con[i]);
    maximo = Math.max(maximo, con[i]);
  }
  assert.ok(minimo < 0.05 && maximo > 0.95, 'de ' + minimo + ' a ' + maximo);
});

// ---------- Lo que dice la pantalla ----------

test('qué línea lleva modelo: tal como la guarda el catálogo, sin tildes ni mayúsculas, y las otras Captivas no', () => {
  assert.equal(modeloDeLaLinea(crearCarro({ marca: 'Chevrolet', linea: 'Captiva (nueva)' })), CAPTIVA);
  assert.equal(modeloDeLaLinea({ marca: 'CHEVROLET', linea: 'captiva (nueva)' }), CAPTIVA);
  // Lo que deja el formulario por placa del Garaje: todo en la marca.
  assert.equal(modeloDeLaLinea(crearCarro({ marca: 'Chevrolet Captiva (nueva)' })), CAPTIVA);
  for (const linea of ['Captiva Sport', 'Captiva (1ª generación)', 'Captiva', '']) assert.equal(modeloDeLaLinea({ marca: 'Chevrolet', linea }), null, linea);
  assert.equal(modeloDeLaLinea({ marca: 'Renault', linea: 'Captiva (nueva)' }), null);
  assert.equal(modeloDeLaLinea({}), null);
  assert.equal(modeloQueLeToca({ marca: 'Chevrolet', linea: 'Captiva (nueva)', sinModeloDeCatalogo: true }), null);
  assert.equal(modeloQueLeToca({ marca: 'Chevrolet', linea: 'Captiva (nueva)' }), CAPTIVA);
});

test('el crédito dice autor, licencia y que se modificaron, y no el color de la foto', () => {
  const texto = textoDelCredito(CAPTIVA);
  assert.match(texto, /Autosdeprimera/);
  assert.match(texto, /CC BY 3\.0/);
  assert.match(texto, /Modificadas: recoloreadas y pegadas sobre una forma 3D/);
  assert.doesNotMatch(texto, /rojo|café/, 'en la app salen en cualquier color');
  assert.equal(CAPTIVA.credito.enlaceLicencia, 'https://creativecommons.org/licenses/by/3.0/');
  assert.equal(CAPTIVA.credito.fotos.length, 7);
  // Un GLB de catálogo subido a mano dice lo mismo que el de la tabla, aunque el archivo traiga "de rojo a café".
  const delArchivo = leerModeloGlb(copiaDeBytes()).catalogo;
  assert.match(delArchivo.credito, /de rojo a café/);
  assert.equal(creditoDeCatalogo(delArchivo), texto);
  // Y lo que no está en la tabla dice lo suyo.
  assert.equal(creditoDeCatalogo({ carro: { marca: 'Otra', linea: 'Cosa' }, credito: 'Fotos: alguien.' }), 'Fotos: alguien.');
});

test('la lista de lo que la app trae sale de la tabla', () => {
  // Y dice con cuál línea sale: quien escribía el nombre de la lista seguía viendo el carro de cajas.
  assert.equal(textoDeLaLista(), 'La app tiene el modelo de: Chevrolet Captiva LT 2020 (en Datos del carro, línea «Chevrolet Captiva (nueva)»), Renault Logan II Intens 2020 (en Datos del carro, línea «Renault Logan II»), Chevrolet Spark GT 1LS 2014 (en Datos del carro, línea «Chevrolet Spark GT»). Se baja la primera vez que se abre esa línea. Para las demás líneas se ve la carrocería de referencia hasta que se escanee ese carro.');
  assert.match(textoDeLaLista([{ nombre: 'Uno', marca: 'A', linea: 'B' }, { nombre: 'Dos', marca: 'C', linea: 'D' }]), /modelo de: Uno \(.*«A B»\), Dos \(.*«C D»\)\. /);
});

test('el modelo no va en la precarga, y su caché no la borra el service worker al cambiar de versión', () => {
  assert.equal(archivosApp().filter((a) => a.startsWith('modelos/') || a.endsWith('.glb')).length, 0);
  // sw.js, en activate: borra todo lo que empiece por "taller-" y no sea de esta versión.
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /startsWith\('taller-'\)/);
  assert.ok(!CAJA_DE_MODELOS.startsWith('taller-'));
});

// ---------- Bajarlo una vez ----------

function cajasDeMentira(inicial = {}) {
  const guardado = new Map(Object.entries(inicial).map(([k, v]) => [k, new Response(v)]));
  const abiertas = [];
  const llave = (k) => {
    const texto = k.url || k;
    return [...guardado.keys()].find((g) => texto === g || texto.endsWith('/' + g)) || texto;
  };
  const caja = {
    match: async (k) => {
      const r = guardado.get(llave(k));
      return r ? r.clone() : undefined;
    },
    put: async (k, r) => void guardado.set(k, r),
    delete: async (k) => guardado.delete(llave(k)),
    keys: async () => [...guardado.keys()].map((g) => ({ url: 'https://x.github.io/taller/' + g })),
  };
  return {
    guardado,
    abiertas,
    open: async (nombre) => {
      abiertas.push(nombre);
      return caja;
    },
  };
}

function redDeMentira(responder = () => new Response(copiaDeBytes())) {
  const pedidos = [];
  const pedir = async (url, opciones) => {
    pedidos.push(url);
    pedir.opciones = opciones;
    return responder(url);
  };
  pedir.pedidos = pedidos;
  return pedir;
}

test('la primera vez de la red, y de ahí en adelante sin internet', async () => {
  const cajas = cajasDeMentira();
  const pedir = redDeMentira();
  let fueALaRed = 0;
  const primera = await bajarModelo(CAPTIVA, { cajas, pedir, alIrALaRed: () => fueALaRed++ });
  assert.equal(primera.byteLength, BYTES.byteLength);
  assert.deepEqual(pedir.pedidos, [CAPTIVA.archivo]);
  assert.equal(fueALaRed, 1);
  assert.deepEqual(cajas.abiertas, [CAJA_DE_MODELOS]);
  await hasta(() => cajas.guardado.has(CAPTIVA.archivo), 'que quede en la caché');

  const sinRed = async () => {
    throw new TypeError('Failed to fetch');
  };
  let volvioALaRed = 0;
  const segunda = await bajarModelo(CAPTIVA, { cajas, pedir: sinRed, alIrALaRed: () => volvioALaRed++ });
  assert.equal(primeraDiferencia(new Uint8Array(segunda), new Uint8Array(BYTES)), null);
  assert.equal(volvioALaRed, 0, 'el letrero no puede decir que está bajando lo que ya tiene');
});

test('una página de error no se guarda: sería un carro roto para siempre', async () => {
  const cajas = cajasDeMentira();
  const html = () => new TextEncoder().encode('<!doctype html><title>Entra a la Wi-Fi</title>').buffer;
  for (const [respuesta, patron] of [
    [() => new Response(html(), { status: 404 }), /404/],
    [() => new Response(html(), { status: 200 }), /no es el modelo/],
    // Un glTF cortado: empieza bien y no mide lo que dice.
    [() => new Response(BYTES.slice(0, 5000), { status: 200 }), /no es el modelo/],
  ]) {
    const e = await bajarModelo(CAPTIVA, { cajas, pedir: redDeMentira(respuesta) }).then(() => null, (error) => error);
    assert.match(e.message, patron);
    assert.ok(!e.sinRed);
    assert.equal(cajas.guardado.size, 0);
  }
  // Y la siguiente vez que haya señal, baja.
  const pedir = redDeMentira();
  await bajarModelo(CAPTIVA, { cajas, pedir });
  assert.equal(pedir.pedidos.length, 1);
  await hasta(() => cajas.guardado.has(CAPTIVA.archivo), 'que quede en la caché');
});

test('lo que ya estaba guardado y resultó roto se bota y se baja de nuevo', async () => {
  const cajas = cajasDeMentira({ [CAPTIVA.archivo]: new TextEncoder().encode('roto').buffer });
  const pedir = redDeMentira();
  const bytes = await bajarModelo(CAPTIVA, { cajas, pedir });
  assert.ok(pareceGlb(bytes));
  assert.equal(pedir.pedidos.length, 1);
  await hasta(async () => pareceGlb(await cajas.guardado.get(CAPTIVA.archivo).clone().arrayBuffer()), 'el bueno en la caché');
});

test('sin señal y sin caché lo dice; sin caches (http en la red del PC) baja directo', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const sinRed = async () => {
    throw new TypeError('Failed to fetch');
  };
  const e = await bajarModelo(CAPTIVA, { cajas: cajasDeMentira(), pedir: sinRed }).then(() => null, (error) => error);
  assert.equal(e.sinRed, true);
  // Se corta a mitad de la descarga.
  const cortada = redDeMentira(() => ({ ok: true, status: 200, arrayBuffer: sinRed }));
  assert.equal((await bajarModelo(CAPTIVA, { cajas: cajasDeMentira(), pedir: cortada }).then(() => null, (error) => error)).sinRed, true);

  const pedir = redDeMentira();
  assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas: undefined, pedir })));
  assert.equal(pedir.pedidos.length, 1);
  // Una ventana privada: caches existe y no deja abrir.
  const rota = { open: async () => {
    throw new DOMException('no', 'SecurityError');
  } };
  assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas: rota, pedir })));
});

test('sin espacio en la caché el carro se ve igual', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const cajas = cajasDeMentira();
  const abrir = cajas.open;
  cajas.open = async (nombre) => ({
    ...(await abrir(nombre)),
    put: async () => {
      throw new DOMException('lleno', 'QuotaExceededError');
    },
  });
  assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas, pedir: redDeMentira() })));
});

test('una caché que no responde no deja el carro esperando', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const nunca = () => new Promise(() => {});
  const conCaja = (caja) => ({ open: async () => caja });
  const buena = { match: async () => undefined, keys: async () => [], delete: async () => true, put: async () => {} };
  for (const cajas of [{ open: nunca }, conCaja({ ...buena, match: nunca }), conCaja({ ...buena, put: nunca }), conCaja({ ...buena, keys: nunca })]) {
    const pedir = redDeMentira();
    assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas, pedir, tope: 20 })));
    assert.equal(pedir.pedidos.length, 1);
  }
});

test('si el archivo cambia de nombre, lo viejo se borra', async () => {
  const cajas = cajasDeMentira({ 'modelos/chevrolet-captiva-vieja.glb': copiaDeBytes(), 'modelos/otro-de-antes.glb': copiaDeBytes() });
  await bajarModelo(CAPTIVA, { cajas, pedir: redDeMentira() });
  await hasta(() => cajas.guardado.has(CAPTIVA.archivo), 'que se guarde');
  assert.deepEqual([...cajas.guardado.keys()], [CAPTIVA.archivo]);
});

// ---------- La pantalla: la línea manda sola ----------

function nodoFalso(etiqueta = '') {
  const oyentes = {};
  const clases = new Set();
  return {
    etiqueta,
    hidden: false,
    disabled: false,
    open: false,
    textContent: '',
    value: '',
    files: [],
    hijos: [],
    clases,
    classList: { toggle: (clase, si) => (si ? clases.add(clase) : clases.delete(clase)) },
    addEventListener(tipo, oyente) {
      (oyentes[tipo] ||= []).push(oyente);
    },
    disparar: (tipo) => Promise.all((oyentes[tipo] || []).map((oyente) => oyente({}))),
    click() {},
    close() {
      this.open = false;
    },
    style: {},
    showModal() {
      this.open = true;
    },
    append(...hijos) {
      this.hijos.push(...hijos);
    },
    replaceChildren(...hijos) {
      this.hijos = hijos;
    },
  };
}

// Todo el texto de lo que se pintó con nodos, con sus enlaces aparte.
function textoDe(nodo) {
  if (typeof nodo === 'string') return nodo;
  return (nodo.textContent || '') + nodo.hijos.map(textoDe).join('');
}
function enlacesDe(nodo) {
  if (typeof nodo === 'string') return [];
  return [...(nodo.href ? [nodo.href] : []), ...nodo.hijos.flatMap(enlacesDe)];
}

// Un carro de esa línea, y un archivo que se elige para la vista previa: una caja del tamaño de un carro sobre un piso,
// lo más barato que el importador reconoce.
const LINEA = { marca: 'Chevrolet', linea: 'Captiva (nueva)', carroceria: 'suv' };
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

// Lo que se ve, en palabras. Nunca assert.equal con el escaneo: si falla, arma un diff de 66 mil vértices, y en vez de decir qué
// pasó tarda un minuto y revienta sin memoria.
function queSeVe(p) {
  const v = p.visor.visto;
  if (!v) return 'genérico';
  if (p.visor.previa) return 'vista previa';
  if (v.deLinea) return 'modelo de la línea';
  return v.placa ? 'escaneo de ' + v.placa : 'otra cosa';
}

async function hasta(condicion, que = 'la condición') {
  for (let i = 0; i < 400; i++) {
    if (await condicion()) return;
    await new Promise((listo) => setTimeout(listo, 10));
  }
  assert.fail('no llegó: ' + que);
}
const unMomento = (ms = 90) => new Promise((listo) => setTimeout(listo, ms));

// `red`: lo que contesta la red de mentira. Sin decir nada, el GLB de verdad. `compuerta`: la respuesta no sale hasta
// que se abra, para probar lo que pasa mientras baja.
function montar(t, carroInicial, { red, fotoAbre = true, cajas = cajasDeMentira(), registroCaido = () => '', conservarCupo = false, topeDeLaFoto, topeDeLaLectura, prepararPorDentro } = {}) {
  t.mock.method(console, 'warn', () => {});
  // Lo que se sabe de "este celular" dura en el módulo: cada prueba es otro celular, salvo que diga lo contrario.
  if (!conservarCupo) {
    fijarCupo(CAPTIVA, FOTO_COMPLETA);
    quitarMarcaDeAbriendo();
  }
  let carro = carroInicial;
  const elementos = new Map();
  const elemento = (clave) => {
    if (!elementos.has(clave)) elementos.set(clave, nodoFalso(clave));
    return elementos.get(clave);
  };
  const oyentes = {};
  const oir = (tipo, oyente) => (oyentes[tipo] ||= []).push(oyente);
  globalThis.document = { getElementById: elemento, querySelector: elemento, createElement: (etiqueta) => nodoFalso(etiqueta), addEventListener: oir, visibilityState: 'visible' };
  globalThis.addEventListener = oir;
  globalThis.indexedDB = new IDBFactory();
  const fetchAntes = globalThis.fetch;
  const pedir = redDeMentira(red);
  globalThis.fetch = pedir;
  globalThis.caches = cajas;
  // `abre`: true, false, o una función de las opciones (la foto liviana abre y la completa no).
  const fotos = { abiertas: 0, cerradas: 0, usadas: 0, abre: fotoAbre, opciones: [], colgada: null };
  globalThis.createImageBitmap = async (_blob, opciones) => {
    fotos.abiertas++;
    fotos.opciones.push(opciones || null);
    if (fotos.colgada) await fotos.colgada;
    if (!(typeof fotos.abre === 'function' ? fotos.abre(opciones) : fotos.abre)) throw new DOMException('no cupo', 'InvalidStateError');
    return {
      close() {
        fotos.cerradas++;
      },
    };
  };
  globalThis.confirm = () => true;
  t.after(() => {
    for (const k of ['document', 'indexedDB', 'caches', 'createImageBitmap', 'confirm', 'addEventListener']) delete globalThis[k];
    globalThis.fetch = fetchAntes;
  });
  const avisos = [];
  const vistos = [];
  const visor = { visto: null, verPiezas: false, previa: false, rechaza: () => false };
  let guardadas = 0;
  // En orden: lo que le pasa al lienzo, lo que se le muestra y cuándo se va a la red.
  const eventos = [];
  const pedirSinAnotar = pedir;
  globalThis.fetch = (...a) => {
    eventos.push('red');
    return pedirSinAnotar(...a);
  };
  const pantalla = crearEscaneoPantalla({
    obtenerCarro: () => carro,
    avisar: (texto) => {
      avisos.push(texto);
      elemento('aviso').textContent = texto;
    },
    registroCaido,
    alCambiarCarro: () => guardadas++,
    alCambiarDatos: (datos) => {
      carro = crearCarro({ ...carro, ...datos });
      pantalla.cargar(carro.placa);
    },
    taparLienzo: () => eventos.push('tapar'),
    destaparLienzo: () => eventos.push('destapar'),
    ...(prepararPorDentro ? { prepararPorDentro } : {}),
    ...(topeDeLaFoto ? { topeDeLaFoto } : {}),
    ...(topeDeLaLectura ? { topeDeLaLectura } : {}),
    mostrar(escaneo, opciones) {
      eventos.push(escaneo ? (escaneo.deLinea ? 'modelo' : 'escaneo') : 'genérico');
      if (visor.rechaza(escaneo)) throw new RangeError('Array buffer allocation failed');
      visor.visto = escaneo || null;
      visor.verPiezas = Boolean(opciones.verPiezas);
      visor.previa = Boolean(opciones.previa);
      vistos.push(escaneo || null);
      // Como el visor: quien arma el modelo se queda con la foto ya abierta.
      if (escaneo && escaneo.fotoAbierta && !opciones.verPiezas) {
        escaneo.fotoAbierta = null;
        fotos.usadas++;
        pantalla.modeloDibujado();
      }
    },
  });
  return {
    pantalla,
    visor,
    vistos,
    avisos,
    eventos,
    disparar: (tipo, e = {}) => (oyentes[tipo] || []).forEach((oyente) => oyente(e)),
    get carro() {
      return carro;
    },
    fotos,
    pedir,
    cajas,
    elemento,
    get guardadas() {
      return guardadas;
    },
    ponerCarro(nuevo) {
      carro = nuevo;
    },
    subirArchivo(archivo) {
      elemento('archivo-escaneo').files = [archivo];
      return elemento('archivo-escaneo').disparar('change');
    },
    letrero: elemento('letrero-modelo'),
    boton: elemento('escanear'),
    estado: elemento('escaneo-estado'),
    linea: elemento('escaneo-linea'),
    credito: elemento('escaneo-credito'),
    lista: elemento('escaneo-lista'),
    verLinea: elemento('escaneo-ver-linea'),
    referencia: elemento('escaneo-referencia'),
    guardado: elemento('escaneo-guardado'),
    dialogo: elemento('dialogo-escaneo'),
  };
}

function compuerta() {
  let abrir;
  const abierta = new Promise((listo) => (abrir = listo));
  return { abrir, red: () => abierta.then(() => new Response(copiaDeBytes())) };
}

test('al abrir un carro de la línea sale primero el genérico, y se cambia solo cuando llega', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'JPX248' }), { red: puerta.red });
  await p.pantalla.cargar('JPX248');
  assert.equal(queSeVe(p), 'genérico', 'no espera a que baje');
  await hasta(() => p.pedir.pedidos.length === 1, 'pedirlo');
  assert.equal(p.letrero.hidden, false);
  assert.equal(p.letrero.textContent, 'Bajando el modelo de la Captiva (4 MB)…');
  assert.equal(p.pantalla.pedidoDeLinea, CAPTIVA);
  assert.equal(p.boton.textContent, 'Escanear');

  puerta.abrir();
  await hasta(() => p.visor.visto, 'que se viera el modelo');
  assert.equal(p.visor.visto.catalogo.origen, 'catalogo');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
  assert.equal(p.pantalla.deLinea, CAPTIVA);
  assert.equal(p.letrero.hidden, true);
  assert.equal(p.fotos.usadas, 1, 'la foto abierta antes le llega al modelo');
  assert.equal(p.fotos.abiertas, 1);
  assert.equal(p.fotos.cerradas, 0);
  // No está escaneado: el botón lo sigue diciendo.
  assert.equal(p.boton.textContent, 'Escanear');
  assert.equal(p.boton.clases.has('con-escaneo'), false);
  assert.ok(p.pantalla.guardado === null);
  // Y no se guardó por placa.
  assert.deepEqual(await (await abrirEscaneos()).placas(), []);
  assert.ok(p.cajas.guardado.has(CAPTIVA.archivo), 'queda en la caché de la línea');
});

test('varias Captivas no bajan dos veces, y un carro de otra línea no baja nada', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'AAA111' }));
  await p.pantalla.cargar('AAA111');
  await hasta(() => p.visor.visto);
  assert.equal(p.pedir.pedidos.length, 1);

  const otra = crearCarro({ ...LINEA, placa: 'BBB222' });
  p.ponerCarro(otra);
  await p.pantalla.cargar('BBB222');
  await hasta(() => p.visor.visto && p.pantalla.deLinea);
  assert.equal(p.pedir.pedidos.length, 1, 'se bajó dos veces');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);

  const sinModelo = crearCarro({ marca: 'Chevrolet', linea: 'Onix', carroceria: 'sedan', placa: 'CCC333' });
  p.ponerCarro(sinModelo);
  // Ya mismo, sin esperar a la base: que la Captiva de antes no se vea ni un momento sobre el Onix.
  const cargando = p.pantalla.cargar('CCC333');
  assert.equal(queSeVe(p), 'genérico');
  await cargando;
  await unMomento();
  assert.equal(queSeVe(p), 'genérico', 'un Onix no lleva la Captiva');
  assert.equal(p.pedir.pedidos.length, 1);
  assert.equal(p.letrero.hidden, true);
  assert.equal(p.pantalla.deLinea, null);
});

test('un carro de otra línea no abre ni la caché', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Chevrolet', linea: 'Onix', placa: 'ONX111' }));
  await p.pantalla.cargar('ONX111');
  await unMomento();
  assert.deepEqual(p.cajas.abiertas, []);
  assert.deepEqual(p.pedir.pedidos, []);
  assert.equal(p.fotos.abiertas, 0);
});

test('un carro sin placa también, y al ponerle placa sigue siendo el mismo', async (t) => {
  const carro = crearCarro({ ...LINEA });
  const p = montar(t, carro);
  await p.pantalla.cargar('');
  await hasta(() => p.visor.visto);
  const visto = p.visor.visto;
  carro.placa = 'NUE123';
  await p.pantalla.cargar('NUE123');
  await unMomento();
  assert.ok(p.visor.visto === visto, 'se ve ' + queSeVe(p));
  assert.equal(p.pedir.pedidos.length, 1);
});

test('el orden: un escaneo guardado de esta placa le gana al modelo de la línea, y no se baja nada', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ESC123' }));
  const suyo = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('ESC123', { ...suyo, catalogo: null }, { origen: 'archivo', archivo: 'kona.glb' });
  await p.pantalla.cargar('ESC123');
  await unMomento();
  assert.equal(p.visor.visto.placa, 'ESC123');
  assert.equal(p.visor.visto.deLinea, undefined);
  assert.deepEqual(p.pedir.pedidos, []);
  assert.deepEqual(p.cajas.abiertas, []);
  assert.equal(p.boton.textContent, 'Escaneo');
  assert.equal(p.boton.clases.has('con-escaneo'), true);
  // Mientras se mira la base no se baja: que se vea el modelo un momento y luego el escaneo no le sirve a nadie.
  assert.equal(p.vistos.filter((v) => v && v.deLinea).length, 0);

  // Quitarlo deja el modelo de la línea, y eso es lo que dice el aviso antes de quitarlo.
  let pregunta = '';
  globalThis.confirm = (texto) => {
    pregunta = texto;
    return true;
  };
  await p.elemento('escaneo-quitar').disparar('click');
  assert.match(pregunta, /al modelo de catálogo de su línea/);
  await hasta(() => p.visor.visto && p.visor.visto.deLinea);
  assert.deepEqual(await (await abrirEscaneos()).placas(), []);
  assert.equal(p.boton.textContent, 'Escanear');
});

test('el orden: una vista previa manda, lo que venía bajando no se le pone encima, y al descartarla vuelve el modelo', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'PRV123' }), { red: puerta.red });
  await p.pantalla.cargar('PRV123');
  await hasta(() => p.pedir.pedidos.length === 1);
  await p.subirArchivo(archivoDeUnaCaja());
  assert.ok(p.pantalla.previa);
  const previa = p.visor.visto;
  assert.equal(p.visor.previa, true);
  assert.equal(p.letrero.hidden, true, 'el letrero era de lo que ya no se va a poner');

  puerta.abrir();
  await unMomento(150);
  assert.ok(p.visor.visto === previa, 'el modelo se puso encima de la vista previa');
  assert.equal(p.fotos.usadas, 0);
  assert.equal(p.fotos.abiertas, p.fotos.cerradas, 'una foto abierta quedó sin soltar');

  await p.elemento('#previa-escaneo [data-accion="descartar"]').disparar('click');
  await hasta(() => p.visor.visto && p.visor.visto.deLinea, 'el modelo, al descartar');
  assert.equal(p.visor.previa, false);
});

test('el orden: con el modelo en pantalla, una vista previa lo reemplaza, y guardada le gana', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'PRV456' }));
  await p.pantalla.cargar('PRV456');
  await hasta(() => p.visor.visto);
  const modelo = p.visor.visto;
  await p.subirArchivo(archivoDeUnaCaja());
  assert.ok(p.visor.visto !== modelo, 'se ve ' + queSeVe(p));
  assert.equal(p.visor.previa, true);
  await p.elemento('#previa-escaneo [data-accion="descartar"]').disparar('click');
  assert.ok(p.visor.visto === modelo, 'se ve ' + queSeVe(p));
  // Y guardada: es el escaneo de esta placa, con el modelo de la línea todavía en memoria.
  await p.subirArchivo(archivoDeUnaCaja());
  await p.elemento('#previa-escaneo [data-accion="guardar"]').disparar('click');
  assert.ok(p.pantalla.guardado);
  assert.ok(p.visor.visto === p.pantalla.guardado, 'se ve ' + queSeVe(p));
  assert.equal(p.pantalla.deLinea, CAPTIVA);
  assert.equal(p.boton.textContent, 'Escaneo');
  await p.elemento('escaneo-quitar').disparar('click');
  assert.ok(p.visor.visto === modelo, 'se ve ' + queSeVe(p));
  assert.equal(p.boton.textContent, 'Escanear');
});

test('el orden: un carro sin placa bajando el modelo recibe la placa de uno con escaneo, y gana el escaneo', async (t) => {
  const puerta = compuerta();
  const carro = crearCarro({ ...LINEA });
  const p = montar(t, carro, { red: puerta.red });
  const suyo = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('TIE123', { ...suyo, catalogo: null }, { origen: 'archivo', archivo: 'kona.glb' });
  await p.pantalla.cargar('');
  await hasta(() => p.pedir.pedidos.length === 1);
  carro.placa = 'TIE123';
  const leyendo = p.pantalla.cargar('TIE123');
  puerta.abrir();
  await leyendo;
  await unMomento(150);
  assert.equal(p.visor.visto.placa, 'TIE123');
  assert.equal(p.vistos.filter((v) => v && v.deLinea).length, 0, 'el modelo salió encima del escaneo');
  assert.equal(p.fotos.abiertas, p.fotos.cerradas);
});

test('mientras se mira si la placa tiene escaneo no se baja nada, aunque refresquen', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'LEE123' }));
  const suyo = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('LEE123', { ...suyo, catalogo: null }, { origen: 'archivo', archivo: 'kona.glb' });
  // Lo que hace el visor: refrescar() no espera a cargar().
  const primero = p.pantalla.cargar('LEE123');
  const segundo = p.pantalla.cargar('LEE123');
  await Promise.all([primero, segundo]);
  await unMomento();
  assert.deepEqual(p.pedir.pedidos, []);
  assert.equal(p.visor.visto.placa, 'LEE123');
});

test('la carrera: la ficha cambió la línea mientras bajaba, y lo viejo no se pone encima', async (t) => {
  const puerta = compuerta();
  const carro = crearCarro({ ...LINEA, placa: 'CAR111' });
  const p = montar(t, carro, { red: puerta.red });
  await p.pantalla.cargar('CAR111');
  await hasta(() => p.pedir.pedidos.length === 1);
  // cargar con la misma placa también revisa la línea: es lo que hace el visor al guardar la ficha.
  carro.linea = 'Onix';
  await p.pantalla.cargar('CAR111');
  assert.equal(p.pantalla.pedidoDeLinea, null);
  assert.equal(p.letrero.hidden, true);
  puerta.abrir();
  await unMomento(150);
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.pantalla.deLinea, null);
  assert.equal(p.fotos.abiertas, p.fotos.cerradas);
});

test('la carrera: cambió de carro mientras bajaba', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'CAR222' }), { red: puerta.red });
  await p.pantalla.cargar('CAR222');
  await hasta(() => p.pedir.pedidos.length === 1);
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'CAR333' }));
  await p.pantalla.cargar('CAR333');
  assert.equal(p.letrero.hidden, true);
  puerta.abrir();
  await unMomento(150);
  assert.equal(queSeVe(p), 'genérico', 'la Captiva de antes salió encima del Symbol');
});

test('la ficha le cambia la línea con la misma placa: de genérico al modelo, y de vuelta', async (t) => {
  const carro = crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'FIC123' });
  const p = montar(t, carro);
  await p.pantalla.cargar('FIC123');
  await unMomento();
  assert.deepEqual(p.pedir.pedidos, []);
  Object.assign(carro, LINEA);
  await p.pantalla.cargar('FIC123');
  await hasta(() => p.visor.visto, 'el modelo, con la línea nueva');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
  // Sin carro a medio pintar: el modelo se suelta antes de cualquier espera.
  carro.linea = 'Onix';
  const promesa = p.pantalla.cargar('FIC123');
  assert.equal(queSeVe(p), 'genérico', 'refrescar() habría vuelto a armar la Captiva con la ficha del Onix');
  await promesa;
});

test('sin señal y sin caché: se queda el genérico, lo dice una vez, y vuelve a intentar al abrir el carro otra vez', async (t) => {
  let hayRed = false;
  const carro = crearCarro({ ...LINEA, placa: 'SIN123' });
  const p = montar(t, carro, {
    red: () => {
      if (!hayRed) throw new TypeError('Failed to fetch');
      return new Response(copiaDeBytes());
    },
  });
  await p.pantalla.cargar('SIN123');
  await hasta(() => p.avisos.some((a) => /se baja la primera vez con internet/.test(a)), 'el aviso');
  assert.equal(p.avisos.filter((a) => a === 'Esta línea tiene modelo 3D; se baja la primera vez con internet. Se vuelve a intentar cuando vuelva la señal o al abrir el carro otra vez.').length, 1);
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.letrero.hidden, true);
  assert.equal(p.pedir.pedidos.length, 1);

  // Refrescar el mismo carro (guardar la ficha, por ejemplo) no es abrirlo otra vez: ni se pide ni se repite el aviso.
  await p.pantalla.cargar('SIN123');
  await unMomento();
  assert.equal(p.pedir.pedidos.length, 1);

  // El diálogo lo sigue diciendo, y deja escoger.
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /se baja la primera vez con internet/);
  assert.match(p.estado.textContent, /carrocería de referencia/);
  assert.equal(p.linea.hidden, false);
  assert.equal(p.verLinea.hidden, true);
  p.dialogo.close();

  // Otro carro y de vuelta: se intenta otra vez, y sin señal no repite el aviso.
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'OTR111' }));
  await p.pantalla.cargar('OTR111');
  p.ponerCarro(carro);
  await p.pantalla.cargar('SIN123');
  await hasta(() => p.pedir.pedidos.length === 2, 'el segundo intento');
  await unMomento();
  assert.equal(p.avisos.filter((a) => /se baja la primera vez/.test(a)).length, 1);
  assert.equal(queSeVe(p), 'genérico');

  // Con señal, sale.
  hayRed = true;
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'OTR111' }));
  await p.pantalla.cargar('OTR111');
  p.ponerCarro(carro);
  await p.pantalla.cargar('SIN123');
  await hasta(() => p.visor.visto, 'el modelo, con señal');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
});

test('una página de error no se dice como falta de internet', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ERR123' }), { red: () => new Response('<html>', { status: 500 }) });
  await p.pantalla.cargar('ERR123');
  await hasta(() => p.avisos.length > 0 && p.pantalla.pedidoDeLinea === null, 'el aviso');
  assert.match(p.avisos.at(-1), /No se pudo bajar el modelo de la Captiva/);
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.cajas.guardado.size, 0);
});

test('si la foto no abre por falta de memoria: el genérico, y se dice', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'MEM123' }), { fotoAbre: false });
  await p.pantalla.cargar('MEM123');
  await hasta(() => p.avisos.some((a) => /foto/.test(a)), 'el aviso');
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.pantalla.deLinea, null);
  assert.match(p.avisos.at(-1), /memoria/);
  assert.match(p.avisos.at(-1), /carrocería de referencia/);
  // Lo que dijo el navegador, para arreglarlo desde lejos con un pantallazo: en un iPhone nadie ve la consola.
  assert.match(p.avisos.at(-1), /Dato para revisar: InvalidStateError: no cupo/);
  assert.equal(p.vistos.filter(Boolean).length, 0, 'no se armó nada');
  assert.deepEqual(p.fotos.opciones, [null, OPCIONES_LIVIANAS], 'antes de rendirse se intenta con la cuarta parte de la memoria');
  // El archivo está bueno: se queda en la caché.
  assert.ok(p.cajas.guardado.has(CAPTIVA.archivo));
});

test('si la foto no abre después (visor.js, texturaLista en null): el genérico, y se dice', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'MEM456' }));
  await p.pantalla.cargar('MEM456');
  await hasta(() => p.visor.visto);
  p.fotos.abre = false;
  p.pantalla.modeloSinFoto(new DOMException('sin memoria', 'InvalidStateError'));
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.pantalla.deLinea, null);
  await hasta(() => p.avisos.some((a) => /foto del modelo de la Captiva/.test(a)), 'el aviso');
  // Refrescar no lo vuelve a intentar sin parar.
  await p.pantalla.cargar('MEM456');
  await unMomento();
  assert.equal(queSeVe(p), 'genérico');
});

test('si no se puede armar (falta memoria en el celular), sigue el genérico', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ARM123' }));
  p.visor.rechaza = (e) => Boolean(e);
  await p.pantalla.cargar('ARM123');
  await hasta(() => p.avisos.length > 0, 'el aviso');
  assert.match(p.avisos.at(-1), /No se pudo armar el modelo de la Captiva/);
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.fotos.abiertas, p.fotos.cerradas, 'la foto abierta se quedó sin soltar');
  assert.equal(p.pantalla.deLinea, null);
});

test('un archivo que por dentro no se entiende se olvida, para que la próxima vez se baje de nuevo', async (t) => {
  const roto = new Uint8Array(copiaDeBytes());
  // Pasa la revisión de la cabecera, y el JSON no se puede leer.
  roto[25] = 0;
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ROT123' }), { red: () => new Response(roto.buffer.slice(0)) });
  await p.pantalla.cargar('ROT123');
  await hasta(() => p.avisos.length > 0, 'el aviso');
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.cajas.guardado.size, 0);
});

test('revisarCarroceria no reetiqueta ni guarda nada de un modelo de catálogo, ni repite para siempre', async (t) => {
  const carro = crearCarro({ ...LINEA, carroceria: 'sedan', placa: 'CRC123' });
  const p = montar(t, carro);
  await p.pantalla.cargar('CRC123');
  await hasta(() => p.visor.visto);
  const modelo = p.visor.visto;
  const vistas = p.vistos.length;
  for (let i = 0; i < 3; i++) await p.pantalla.cargar('CRC123');
  await unMomento();
  assert.ok(p.visor.visto === modelo, 'se cambió el modelo por una copia reetiquetada');
  assert.equal(p.vistos.length, vistas, 'cada refrescar lo volvía a poner');
  assert.deepEqual(await (await abrirEscaneos()).placas(), [], 'se guardó en la base de los escaneos');

  // Y uno subido a mano a esta placa, que sí es lo guardado: la carrocería del carro no lo vuelve a guardar en cada refrescar.
  const subido = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('MAN123', subido, { origen: 'archivo', archivo: 'captiva-foto.glb' });
  p.ponerCarro(crearCarro({ ...LINEA, carroceria: 'sedan', placa: 'MAN123' }));
  await p.pantalla.cargar('MAN123');
  const guardado = p.pantalla.guardado;
  assert.equal(guardado.catalogo.origen, 'catalogo');
  await p.pantalla.cargar('MAN123');
  assert.ok(p.pantalla.guardado === guardado, 'se volvió a guardar');
  // Es lo guardado de esta placa, y se quita; pero nadie le pasó el celular a este carro.
  assert.equal(p.boton.textContent, 'Escanear');
  assert.equal(p.boton.clases.has('con-escaneo'), false);
  // Ese sí se quita, y lo dice.
  await p.pantalla.abrir();
  assert.equal(p.elemento('escaneo-quitar').textContent, 'Quitar el modelo');
  assert.equal(p.guardado.hidden, false);
  await p.elemento('escaneo-quitar').disparar('click');
  assert.deepEqual(await (await abrirEscaneos()).placas(), []);
});

test('el diálogo con el modelo puesto dice qué es, de quién son las fotos y que no hace falta escanear', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'DLG123', medidas: { largo: 4655, ancho: 1835, alto: 1760 } }));
  await p.pantalla.cargar('DLG123');
  await hasta(() => p.visor.visto);
  await p.pantalla.abrir();
  assert.equal(p.dialogo.open, true);
  assert.match(p.estado.textContent, /^Modelo de catálogo de Chevrolet Captiva LT 2020: hecho con fotos de otro carro de la misma línea, no de este carro\./);
  assert.match(p.estado.textContent, /No hace falta escanearlo, salvo que quieras ESTE carro exacto/);
  assert.doesNotMatch(p.estado.textContent, /un carro igual|está escaneado|no está escaneado/);
  assert.equal(p.elemento('escaneo-titulo').textContent, 'El 3D de este carro');
  assert.equal(p.linea.hidden, false);
  assert.equal(p.credito.hidden, false);
  assert.match(textoDe(p.credito), /Fotos: Autosdeprimera, CC BY 3\.0 \(Wikimedia Commons\)\. Modificadas: recoloreadas y pegadas sobre una forma 3D; capó y techo pintados aparte, y un brillo calculado encima\./);
  assert.match(textoDe(p.credito), /No es un modelo oficial: Chevrolet es marca de General Motors/);
  // La trompa: lo que el modelo no puede decir por sí mismo. Sin afirmar un año que para Colombia no tiene fuente.
  assert.match(p.estado.textContent, /Las de otros años pueden tener otra trompa/);
  assert.doesNotMatch(p.estado.textContent, /2024/);
  assert.match(p.elemento('escaneo-referencia-nota').textContent || 'Si este carro no se parece al modelo.', /no se parece/);
  assert.equal(p.elemento('escaneo-referencia-nota').hidden, false);
  assert.equal(p.elemento('escaneo-ver-nota').hidden, false);
  assert.match(p.elemento('escaneo-ver-nota').textContent, /otra carrocería/);
  const enlaces = enlacesDe(p.credito);
  assert.ok(enlaces.includes('https://creativecommons.org/licenses/by/3.0/'), 'el enlace de la licencia');
  assert.equal(enlaces.filter((e) => e.startsWith('https://commons.wikimedia.org/')).length, 7);
  assert.equal(p.verLinea.hidden, false);
  assert.equal(p.verLinea.textContent, 'Ver las piezas por dentro');
  assert.equal(p.referencia.textContent, 'Usar la carrocería de referencia');
  // No es «Quitar el escaneo»: un modelo de línea no se borra de ningún registro.
  assert.equal(p.guardado.hidden, true);
  assert.equal(p.lista.textContent, textoDeLaLista());
});

test('la lista de lo que trae la app está en el diálogo siempre, también en un carro de otra línea', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'LOG123' }));
  await p.pantalla.cargar('LOG123');
  await p.pantalla.abrir();
  assert.equal(p.lista.textContent, textoDeLaLista());
  assert.match(p.estado.textContent, /^Este carro no está escaneado/);
  assert.equal(p.linea.hidden, true);
  assert.equal(p.elemento('escaneo-titulo').textContent, 'El carro de verdad, en 3D');
});

test('el modelo llega con el diálogo abierto: el diálogo se pone al día', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ABR123' }), { red: puerta.red });
  await p.pantalla.cargar('ABR123');
  await hasta(() => p.pedir.pedidos.length === 1);
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /Va en camino el modelo de catálogo de Chevrolet Captiva LT 2020/);
  assert.equal(p.verLinea.hidden, true, 'no se puede ver por dentro lo que no ha llegado');
  puerta.abrir();
  await hasta(() => p.visor.visto);
  await hasta(() => /^Modelo de catálogo/.test(p.estado.textContent), 'el texto nuevo');
  assert.equal(p.verLinea.hidden, false);
});

test('ver por dentro y volver, sin tocar nada guardado', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'DEN123' }));
  await p.pantalla.cargar('DEN123');
  await hasta(() => p.visor.visto);
  const modelo = p.visor.visto;
  await p.pantalla.abrir();
  await p.verLinea.disparar('click');
  assert.equal(p.visor.verPiezas, true);
  assert.ok(p.visor.visto === modelo, 'se ve ' + queSeVe(p));
  assert.equal(p.dialogo.open, false);
  await p.pantalla.abrir();
  assert.equal(p.verLinea.textContent, 'Ver el carro');
  // Con la carrocería de referencia a la vista, el diálogo no sigue diciendo que eso está hecho con fotos.
  assert.match(p.estado.textContent, /^Lo que ves ahora es la carrocería de referencia/);
  assert.match(p.estado.textContent, /no es la forma de la Captiva/);
  assert.doesNotMatch(p.estado.textContent, /hecho con fotos/);
  assert.equal(p.elemento('escaneo-ver-nota').hidden, true);
  await p.verLinea.disparar('click');
  assert.equal(p.visor.verPiezas, false);
  assert.ok(p.visor.visto === modelo, 'se ve ' + queSeVe(p));
  assert.equal(p.elemento('previa-escaneo').hidden, true, 'el «Abriendo el modelo…» se fue');
});

test('«Usar la carrocería de referencia» se recuerda por carro, y el diálogo ofrece volver', async (t) => {
  const carro = crearCarro({ ...LINEA, placa: 'REF123' });
  const p = montar(t, carro);
  await p.pantalla.cargar('REF123');
  await hasta(() => p.visor.visto);
  await p.pantalla.abrir();
  await p.referencia.disparar('click');
  assert.equal(carro.sinModeloDeCatalogo, true);
  assert.equal(p.guardadas, 1, 'se guarda como los demás campos');
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.dialogo.open, false);
  assert.equal(p.pantalla.deLinea, null);

  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /pediste la carrocería de referencia/);
  assert.match(p.estado.textContent, /Chevrolet Captiva LT 2020/);
  assert.equal(p.referencia.textContent, 'Volver a usar el modelo de catálogo');
  assert.equal(p.verLinea.hidden, true);
  assert.equal(p.credito.hidden, true);

  // Reabrir el carro: sigue en la de referencia y no baja nada.
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol', placa: 'OTR222' }));
  await p.pantalla.cargar('OTR222');
  const recargado = crearCarro(JSON.parse(serializarCarro(carro)));
  p.ponerCarro(recargado);
  const pedidos = p.pedir.pedidos.length;
  await p.pantalla.cargar('REF123');
  await unMomento();
  assert.equal(queSeVe(p), 'genérico');
  assert.equal(p.pedir.pedidos.length, pedidos);

  await p.pantalla.abrir();
  await p.referencia.disparar('click');
  assert.equal(recargado.sinModeloDeCatalogo, false);
  await hasta(() => p.visor.visto, 'el modelo otra vez');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
  assert.equal(p.pedir.pedidos.length, pedidos, 'ya estaba bajado');
});

test('«Usar la carrocería de referencia» mientras baja: lo que venía no se pone', async (t) => {
  const puerta = compuerta();
  const carro = crearCarro({ ...LINEA, placa: 'REF456' });
  const p = montar(t, carro, { red: puerta.red });
  await p.pantalla.cargar('REF456');
  await hasta(() => p.pedir.pedidos.length === 1);
  await p.pantalla.abrir();
  assert.equal(p.referencia.textContent, 'Usar la carrocería de referencia');
  await p.referencia.disparar('click');
  assert.equal(p.letrero.hidden, true);
  puerta.abrir();
  await unMomento(150);
  assert.equal(queSeVe(p), 'genérico');
});

// ---------- Lo que la gente escribe ----------

test('quien escribe el nombre de la lista: se le pregunta, sin adivinar la generación', () => {
  for (const carro of [{ marca: 'Chevrolet Captiva' }, { marca: 'Chevrolet Captiva LT 2020' }, { marca: 'Captiva' }, { marca: 'chevrolet', linea: 'captiva' }, { marca: 'Chevrolet', linea: 'Captiva LT 2020' }, { marca: 'CAPTIVA LT' }]) {
    assert.equal(modeloParecido(carro), CAPTIVA, JSON.stringify(carro));
    // Automático no: también lo escribe quien tiene la de 2007 a 2018, y "de la misma línea" sería falso.
    assert.equal(modeloDeLaLinea(carro), null, JSON.stringify(carro));
  }
  // Lo que dice ser otra línea del catálogo es esa línea; lo que no es de esa marca, tampoco; y la línea exacta ya tiene su modelo.
  for (const carro of [{ marca: 'Chevrolet', linea: 'Captiva Sport' }, { marca: 'Chevrolet Captiva Sport' }, { marca: 'Chevrolet Captiva Sport LT' }, { marca: 'Chevrolet', linea: 'Captiva (1ª generación)' }, { marca: 'Renault Captiva' }, { marca: 'Chevrolet Onix' }, { marca: '' }, {}, null, { marca: 'Chevrolet', linea: 'Captiva (nueva)' }]) {
    assert.equal(modeloParecido(carro), null, JSON.stringify(carro));
  }
  assert.equal(anosDelModelo(CAPTIVA), 'de 2019 en adelante');
});

test('«sí, es de esos años»: queda la línea del catálogo, con todo, y lo escrito de más va a la versión', () => {
  const d = datosParaUsarModelo(crearCarro({ marca: 'Chevrolet Captiva LT 2020' }), CAPTIVA);
  assert.equal(d.marca, 'Chevrolet');
  assert.equal(d.linea, 'Captiva (nueva)');
  assert.equal(d.carroceria, 'suv');
  assert.equal(d.medidas.largo, 4655);
  assert.equal(d.version, 'LT 2020');
  assert.equal(modeloDeLaLinea(crearCarro(d)), CAPTIVA);
  // La versión que ya tenía no se pisa.
  assert.equal(datosParaUsarModelo(crearCarro({ marca: 'Captiva', version: '7 puestos' }), CAPTIVA).version, '7 puestos');
});

test('lo escrito igual al catálogo se reconoce; lo demás no se adivina', () => {
  assert.equal(entradaExacta('chevrolet captiva (nueva)').linea, 'Captiva (nueva)');
  assert.equal(entradaExacta('  Chevrolet Captiva (nueva) ').linea, 'Captiva (nueva)');
  assert.equal(entradaExacta('Chevrolet Captiva'), null);
  assert.equal(entradaExacta(''), null);
});

test('el campo de la placa en el Garaje ofrece el catálogo, y cabe lo que ofrece', async () => {
  const html = fs.readFileSync(new URL('../garaje.html', import.meta.url), 'utf8');
  const campo = html.match(/<input id="marca"[^>]*>/)[0];
  assert.match(campo, /list="lineas-catalogo"/);
  const { catalogoOrdenado, nombreDeLinea } = await import('../js/catalogo.js');
  const mas = Math.max(...catalogoOrdenado().map((e) => nombreDeLinea(e).length));
  assert.ok(Number(campo.match(/maxlength="(\d+)"/)[1]) >= mas, 'la línea más larga mide ' + mas);
});

test('con un nombre parecido: el aviso y el diálogo lo dicen, y el botón lo deja listo', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Chevrolet Captiva LT 2020', placa: 'BBB222' }));
  await p.pantalla.cargar('BBB222');
  await unMomento();
  assert.equal(queSeVe(p), 'genérico');
  assert.deepEqual(p.pedir.pedidos, [], 'no se baja sin preguntar');
  assert.match(p.avisos.at(-1), /La app tiene el modelo de Chevrolet Captiva LT 2020\. Si este carro es de 2019 en adelante, toca «Escanear»/);
  const cuantos = p.avisos.length;
  await p.pantalla.cargar('BBB222');
  assert.equal(p.avisos.length, cuantos, 'en cada refrescar no se repite');
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /La app tiene el modelo de Chevrolet Captiva LT 2020, hecho con fotos de otro carro: si este es de 2019 en adelante, se puede usar/);
  assert.match(p.estado.textContent, /es otro carro y ese modelo no le sirve/);
  assert.equal(p.linea.hidden, false);
  assert.equal(p.elemento('escaneo-usar-parecido').hidden, false);
  assert.equal(p.elemento('escaneo-usar-parecido').textContent, 'Es de 2019 en adelante: usar ese modelo');
  assert.equal(p.referencia.hidden, true);
  await p.elemento('escaneo-usar-parecido').disparar('click');
  assert.equal(p.dialogo.open, false);
  assert.equal(p.carro.linea, 'Captiva (nueva)');
  assert.equal(p.carro.version, 'LT 2020');
  await hasta(() => p.visor.visto, 'el modelo');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
  assert.equal(p.elemento('aviso').textContent, '', 'el aviso ya no viene al caso');
});

test('a una Captiva de otros años no se le ofrece nada', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Chevrolet', linea: 'Captiva Sport', placa: 'SPO111' }));
  await p.pantalla.cargar('SPO111');
  await p.pantalla.abrir();
  assert.equal(p.elemento('escaneo-usar-parecido').hidden, true);
  assert.equal(p.linea.hidden, true);
  assert.deepEqual(p.avisos.filter((a) => /Captiva/.test(a)), []);
});

// ---------- El carro de cajas no sale ----------

test('con el modelo en la caché el lienzo espera tapado: el de cajas no se ve', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'TAP111' }), { cajas: cajasDeMentira({ [CAPTIVA.archivo]: copiaDeBytes() }) });
  await p.pantalla.cargar('TAP111');
  await hasta(() => p.visor.visto);
  await hasta(() => p.eventos.at(-1) === 'destapar', 'que se destape');
  assert.deepEqual(p.pedir.pedidos, []);
  assert.ok(p.eventos.indexOf('tapar') >= 0, 'se tapó');
  assert.ok(p.eventos.lastIndexOf('destapar') > p.eventos.indexOf('modelo'), 'el modelo sale tapado hasta estar: ' + p.eventos);
  assert.equal(p.eventos.slice(p.eventos.indexOf('tapar'), p.eventos.indexOf('modelo')).includes('destapar'), false, 'se destapó antes de tiempo: ' + p.eventos);
  // De otro carro a una Captiva, sin recargar: se tapa antes de armar el genérico de este carro.
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'TAP112' }));
  await p.pantalla.cargar('TAP112');
  p.eventos.length = 0;
  p.ponerCarro(crearCarro({ ...LINEA, placa: 'TAP113' }));
  await p.pantalla.cargar('TAP113');
  await hasta(() => p.visor.visto && p.visor.visto.deLinea, 'el modelo otra vez');
  assert.ok(p.eventos.indexOf('tapar') < p.eventos.indexOf('genérico'), 'antes de armar el de cajas: ' + p.eventos);
  assert.equal(p.eventos.slice(p.eventos.indexOf('tapar'), p.eventos.indexOf('modelo')).includes('destapar'), false, 'se destapó antes de tiempo: ' + p.eventos);
});

test('si hay que ir a la red se destapa antes de pedirlo: el genérico sirve mientras baja', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'TAP222' }), { red: puerta.red });
  await p.pantalla.cargar('TAP222');
  await hasta(() => p.pedir.pedidos.length === 1);
  const iba = p.eventos.indexOf('red');
  assert.ok(p.eventos.lastIndexOf('destapar', iba) > p.eventos.lastIndexOf('tapar', iba), 'tapado al ir a la red: ' + p.eventos);
  assert.equal(p.letrero.textContent, 'Bajando el modelo de la Captiva (4 MB)…');
  puerta.abrir();
  await hasta(() => p.visor.visto);
});

test('un carro de otra línea no se tapa, y lo que falla destapa', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'TAP333' }));
  await p.pantalla.cargar('TAP333');
  assert.equal(p.eventos.includes('tapar'), false);
  // Lo que falla con el lienzo tapado: una caché con el archivo y la foto que no abre.
  const q = montar(t, crearCarro({ ...LINEA, placa: 'TAP444' }), { fotoAbre: false, cajas: cajasDeMentira({ [CAPTIVA.archivo]: copiaDeBytes() }) });
  await q.pantalla.cargar('TAP444');
  await hasta(() => q.avisos.length > 0, 'el aviso');
  assert.equal(q.eventos.at(-1), 'destapar', 'quedó tapado: ' + q.eventos);
  // Otro carro al que no le toca nada, con el de antes tapado: se destapa.
  const r = montar(t, crearCarro({ ...LINEA, placa: 'TAP555' }), { cajas: { open: () => new Promise(() => {}) } });
  await r.pantalla.cargar('TAP555');
  assert.equal(r.eventos.at(-1), 'tapar');
  r.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'TAP666' }));
  await r.pantalla.cargar('TAP666');
  assert.equal(r.eventos.at(-1), 'destapar', 'quedó tapado: ' + r.eventos);
  // Otra Captiva, con su escaneo propio: no se trae nada, y tapado no se puede quedar.
  const suyo = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('TAP777', { ...suyo, catalogo: null }, { origen: 'archivo', archivo: 'kona.glb' });
  r.ponerCarro(crearCarro({ ...LINEA, placa: 'TAP777' }));
  await r.pantalla.cargar('TAP777');
  assert.equal(r.visor.visto.placa, 'TAP777');
  assert.equal(r.eventos.at(-1), 'destapar', 'quedó tapado: ' + r.eventos);
});

// ---------- Los avisos ----------

test('con el registro caído su aviso no se pierde, diga lo que diga el modelo', async (t) => {
  const caido = 'Este celular no está dejando usar el registro.';
  const p = montar(t, crearCarro({ ...LINEA, placa: 'CAI111' }), { fotoAbre: false, registroCaido: () => caido });
  await p.pantalla.cargar('CAI111');
  await hasta(() => p.avisos.some((a) => /foto del modelo/.test(a)), 'el aviso');
  assert.ok(p.avisos.at(-1).startsWith(caido), p.avisos.at(-1));
  assert.match(p.avisos.at(-1), /foto del modelo de la Captiva/);
  // Y callar lo del modelo no se lleva el del registro.
  await p.pantalla.abrir();
  await p.referencia.disparar('click');
  assert.equal(p.elemento('aviso').textContent, caido);
  // Tampoco al cambiar de carro: todos quedan como borrador.
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'CAI222' }));
  await p.pantalla.cargar('CAI222');
  assert.equal(p.elemento('aviso').textContent, caido);
});

test('con otra línea ya no dice que esta línea tiene modelo 3D, y al volver a Captiva no se repite', async (t) => {
  const carro = crearCarro({ ...LINEA, placa: 'AVI111' });
  const p = montar(t, carro, {
    red: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await p.pantalla.cargar('AVI111');
  await hasta(() => /Esta línea tiene modelo 3D/.test(p.elemento('aviso').textContent), 'el aviso');
  Object.assign(carro, { marca: 'Renault', linea: 'Symbol II', carroceria: 'sedan' });
  await p.pantalla.cargar('AVI111');
  assert.equal(p.elemento('aviso').textContent, '');
  // Si lo que está en pantalla ya es otra cosa que dijo el visor, no se le borra.
  const otro = crearCarro({ ...LINEA, placa: 'AVI222' });
  const q = montar(t, otro, {
    red: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await q.pantalla.cargar('AVI222');
  await hasta(() => /Esta línea tiene modelo 3D/.test(q.elemento('aviso').textContent), 'el aviso');
  await hasta(() => q.pantalla.pedidoDeLinea === null, 'el intento');
  q.elemento('aviso').textContent = 'No se pudo guardar en el teléfono.';
  Object.assign(otro, { marca: 'Renault', linea: 'Symbol II', carroceria: 'sedan' });
  await q.pantalla.cargar('AVI222');
  assert.equal(q.elemento('aviso').textContent, 'No se pudo guardar en el teléfono.');
});

test('al quedarse sin señal se reintenta cuando vuelve, y el aviso se va al salir', async (t) => {
  let hayRed = false;
  const p = montar(t, crearCarro({ ...LINEA, placa: 'SEN111' }), {
    red: () => {
      if (!hayRed) throw new TypeError('Failed to fetch');
      return new Response(copiaDeBytes());
    },
  });
  await p.pantalla.cargar('SEN111');
  await hasta(() => /Esta línea tiene modelo 3D/.test(p.elemento('aviso').textContent), 'el aviso');
  await hasta(() => p.pantalla.pedidoDeLinea === null, 'el intento');
  // Al volver a la app sin señal lo vuelve a intentar, callado y sin tapar lo que se está usando.
  const tapadas = p.eventos.filter((e) => e === 'tapar').length;
  p.disparar('visibilitychange');
  await hasta(() => p.pedir.pedidos.length === 2, 'el reintento al volver');
  await hasta(() => p.pantalla.pedidoDeLinea === null, 'que termine');
  assert.equal(p.eventos.filter((e) => e === 'tapar').length, tapadas);
  assert.equal(p.avisos.filter((a) => /Esta línea/.test(a)).length, 1);
  assert.match(p.elemento('aviso').textContent, /Esta línea tiene modelo 3D/, 'el aviso se queda mientras no salga');
  // Vuelve la señal.
  hayRed = true;
  p.disparar('online');
  await hasta(() => p.visor.visto, 'el modelo');
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
  assert.equal(p.elemento('aviso').textContent, '');
  // Otra falla que no es de señal no se reintenta sola.
  p.disparar('online');
  await unMomento();
  assert.equal(p.pedir.pedidos.length, 3);
});

test('una falla distinta del mismo modelo no sale muda', async (t) => {
  let hayRed = false;
  const carro = crearCarro({ ...LINEA, placa: 'DIS111' });
  const p = montar(t, carro, {
    red: () => {
      if (!hayRed) throw new TypeError('Failed to fetch');
      return new Response(copiaDeBytes());
    },
  });
  await p.pantalla.cargar('DIS111');
  await hasta(() => p.avisos.some((a) => /Esta línea/.test(a)), 'sin señal');
  hayRed = true;
  p.disparar('online');
  await hasta(() => p.visor.visto, 'el modelo');
  fijarCupo(CAPTIVA, FOTO_LIVIANA);
  p.fotos.abre = false;
  p.pantalla.modeloSinFoto(new DOMException('no cupo', 'InvalidStateError'));
  assert.equal(queSeVe(p), 'genérico');
  assert.match(p.avisos.at(-1), /foto del modelo de la Captiva/);
});

test('sin señal, el botón no ofrece la carrocería que ya está en pantalla', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'BOT111' }), {
    red: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await p.pantalla.cargar('BOT111');
  await hasta(() => p.avisos.length > 0, 'el aviso');
  await hasta(() => p.pantalla.pedidoDeLinea === null, 'el intento');
  await p.pantalla.abrir();
  assert.equal(p.referencia.textContent, 'No bajar el modelo para este carro');
  assert.equal(p.elemento('escaneo-reintentar').hidden, true);
});

// ---------- La memoria de este celular ----------

test('la foto completa no abre y la liviana sí: el modelo sale, se recuerda y se dice', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'LIV111' }), { fotoAbre: (opciones) => Boolean(opciones) });
  await p.pantalla.cargar('LIV111');
  await hasta(() => p.visor.visto, 'el modelo');
  assert.deepEqual(p.fotos.opciones, [null, OPCIONES_LIVIANAS]);
  assert.equal(p.visor.visto.opcionesDeFoto, OPCIONES_LIVIANAS, 'al volver a armar, la liviana');
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  assert.match(p.avisos.at(-1), /no alcanzó con la foto completa del modelo de la Captiva: se ve con menos detalle/);
  // La próxima vez, directo.
  p.fotos.opciones.length = 0;
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'LIV222' }));
  await p.pantalla.cargar('LIV222');
  p.ponerCarro(crearCarro({ ...LINEA, placa: 'LIV111' }));
  await p.pantalla.cargar('LIV111');
  await hasta(() => p.visor.visto, 'el modelo otra vez');
  assert.deepEqual(p.fotos.opciones, [OPCIONES_LIVIANAS]);
});

test('si la foto no abre al volver a armar, primero se intenta con la liviana', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'MEM789' }));
  await p.pantalla.cargar('MEM789');
  await hasta(() => p.visor.visto);
  p.pantalla.modeloSinFoto(new DOMException('sin memoria', 'InvalidStateError'));
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === OPCIONES_LIVIANAS, 'el modelo, con la liviana');
  assert.equal(p.pantalla.deLinea, CAPTIVA);
  assert.match(p.avisos.at(-1), /se ve con menos detalle/);
});

test('con menos detalle, el diálogo deja volver a la foto completa; si ya cabe se olvida, y si no, baja el escalón solo', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'VOL111' }), { fotoAbre: (opciones) => Boolean(opciones) });
  await p.pantalla.cargar('VOL111');
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === OPCIONES_LIVIANAS, 'con la liviana');
  assert.match(p.avisos.at(-1), /Para volver a intentarlo, toca «Escanear»/);
  await p.pantalla.abrir();
  const boton = p.elemento('escaneo-reintentar');
  assert.equal(boton.hidden, false);
  assert.equal(boton.textContent, 'Verlo con todo el detalle');
  // Sigue sin caber: no se queda sin carro, y el escalón vuelve solo.
  await boton.disparar('click');
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_COMPLETA);
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === OPCIONES_LIVIANAS && nivelDeCupo(CAPTIVA) === FOTO_LIVIANA, 'otra vez la liviana');
  assert.equal(p.pantalla.deLinea, CAPTIVA);
  // Ya cabe: sale con la completa, y el botón ya no tiene nada que ofrecer.
  p.fotos.abre = true;
  await p.pantalla.abrir();
  await boton.disparar('click');
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === null, 'con la completa');
  await unMomento();
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_COMPLETA);
  await p.pantalla.abrir();
  assert.equal(boton.hidden, true);
});

test('con el 3D caído no se arma nada ni se dice "con menos detalle": eso pasa cuando vuelve', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'GPU333' }));
  await p.pantalla.cargar('GPU333');
  await hasta(() => p.visor.visto, 'el modelo');
  const abiertas = p.fotos.abiertas;
  const avisos = p.avisos.length;
  p.pantalla.modeloNoCupo(new Error('El contexto de WebGL no volvió'), { sinContexto: true });
  // El escalón ya queda recordado: si no vuelve, al recargar abre con la liviana.
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  await unMomento();
  assert.equal(p.fotos.abiertas, abiertas, 'no abrió otra foto con el contexto caído');
  assert.equal(p.avisos.slice(avisos).some((a) => /menos detalle/.test(a)), false, 'y no pisó el aviso de que el 3D se cayó');
  // Refrescar mientras sigue caído tampoco lo arma.
  await p.pantalla.cargar('GPU333');
  await unMomento();
  assert.equal(p.fotos.abiertas, abiertas);
  // Vuelve: ahora sí, la liviana, y lo dice.
  p.pantalla.alVolverElContexto();
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === OPCIONES_LIVIANAS, 'con la liviana');
  await hasta(() => p.avisos.some((a) => /se ve con menos detalle/.test(a)), 'el aviso');
});

test('la GPU no da: un escalón menos y otra vez; al final el genérico, sin volver a intentarlo solo', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'GPU111' }));
  await p.pantalla.cargar('GPU111');
  await hasta(() => p.visor.visto, 'el modelo');
  const primero = p.visor.visto;
  assert.equal(primero.opcionesDeFoto, null);
  p.pantalla.modeloNoCupo(new Error('OUT_OF_MEMORY'));
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  await hasta(() => p.visor.visto && p.fotos.opciones.at(-1) === OPCIONES_LIVIANAS, 'con la liviana');
  await hasta(() => p.avisos.some((a) => /se ve con menos detalle/.test(a)), 'el aviso');
  p.pantalla.modeloNoCupo(new Error('OUT_OF_MEMORY'));
  assert.equal(nivelDeCupo(CAPTIVA), SIN_CUPO);
  assert.equal(queSeVe(p), 'genérico');
  assert.match(p.avisos.at(-1), /ni con menos detalle/);
  assert.match(p.avisos.at(-1), /Dato para revisar: Error: OUT_OF_MEMORY/);
  // Refrescar y abrir otra vez no lo vuelven a intentar: si fue la memoria, ese carro no abriría nunca.
  const abiertas = p.fotos.abiertas;
  await p.pantalla.cargar('GPU111');
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'GPU222' }));
  await p.pantalla.cargar('GPU222');
  p.ponerCarro(crearCarro({ ...LINEA, placa: 'GPU111' }));
  await p.pantalla.cargar('GPU111');
  await unMomento();
  assert.equal(p.fotos.abiertas, abiertas);
  assert.equal(queSeVe(p), 'genérico');
  // El diálogo deja intentarlo, con la liviana.
  await p.pantalla.abrir();
  assert.match(p.estado.textContent, /ni con menos detalle/);
  assert.equal(p.elemento('escaneo-reintentar').hidden, false);
  await p.elemento('escaneo-reintentar').disparar('click');
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  await hasta(() => p.visor.visto, 'el modelo, al pedirlo');
  assert.equal(p.fotos.opciones.at(-1), OPCIONES_LIVIANAS);
});

test('si el intento anterior murió abriendo la foto, baja un escalón al arrancar; y otra vez, ya no abre solo', async (t) => {
  fijarCupo(CAPTIVA, FOTO_COMPLETA);
  marcarAbriendo(CAPTIVA);
  const p = montar(t, crearCarro({ ...LINEA, placa: 'MUE111' }), { conservarCupo: true });
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_LIVIANA);
  await p.pantalla.cargar('MUE111');
  await hasta(() => p.visor.visto, 'el modelo');
  assert.deepEqual(p.fotos.opciones, [OPCIONES_LIVIANAS]);
  assert.match(p.avisos.at(-1), /se ve con menos detalle/);
  // Se dibujó: ya no hay marca.
  assert.equal(revisarIntentoAnterior(), null);

  marcarAbriendo(CAPTIVA);
  const q = montar(t, crearCarro({ ...LINEA, placa: 'MUE222' }), { conservarCupo: true });
  assert.equal(nivelDeCupo(CAPTIVA), SIN_CUPO);
  await q.pantalla.cargar('MUE222');
  await unMomento();
  assert.equal(q.fotos.abiertas, 0, 'no se vuelve a intentar solo');
  assert.equal(queSeVe(q), 'genérico');
  assert.match(q.avisos.at(-1), /ni con menos detalle/);
  assert.equal(q.eventos.at(-1), 'destapar');
});

test('la marca se pone antes de abrir la foto, y se va si no abrió o al irse de la página', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'MAR111' }), { fotoAbre: false });
  let marcadaAlAbrir = null;
  const abrir = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (...a) => {
    if (marcadaAlAbrir === null) {
      marcadaAlAbrir = revisarIntentoAnterior() === CAPTIVA;
      fijarCupo(CAPTIVA, FOTO_COMPLETA);
      marcarAbriendo(CAPTIVA);
    }
    return abrir(...a);
  };
  await p.pantalla.cargar('MAR111');
  await hasta(() => p.avisos.length > 0, 'el aviso');
  assert.equal(marcadaAlAbrir, true, 'si iOS mata la pestaña abriendo, no alcanza a avisar nada');
  assert.equal(revisarIntentoAnterior(), null, 'la foto no abrió, y eso no es morir');
  // Irse a propósito tampoco.
  marcarAbriendo(CAPTIVA);
  p.disparar('pagehide');
  assert.equal(revisarIntentoAnterior(), null);
  assert.equal(nivelDeCupo(CAPTIVA), FOTO_COMPLETA);
});

test('la foto que no contesta no deja el letrero para siempre, y si llega tarde se suelta', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'COL111' }), { topeDeLaFoto: 30 });
  let soltarFoto;
  p.fotos.colgada = new Promise((listo) => (soltarFoto = listo));
  await p.pantalla.cargar('COL111');
  await hasta(() => p.avisos.some((a) => /foto del modelo/.test(a)), 'el aviso');
  assert.match(p.avisos.at(-1), /Dato para revisar: TimeoutError: La foto no abrió/);
  assert.equal(p.letrero.hidden, true);
  assert.equal(queSeVe(p), 'genérico');
  soltarFoto();
  await hasta(() => p.fotos.cerradas === 2, 'que se suelten las que llegaron tarde');
});

// ---------- La bajada ----------

test('sin Referer: la dirección de la página lleva la placa', async () => {
  const pedir = redDeMentira();
  await bajarModelo(CAPTIVA, { cajas: undefined, pedir });
  assert.equal(pedir.opciones.referrerPolicy, 'no-referrer');
});

test('una red que no contesta no deja «Bajando…» para siempre: cuenta como sin señal, y se corta', async () => {
  let cortada = null;
  const pedir = (_url, { signal }) =>
    new Promise((_listo, fallar) => {
      signal.addEventListener('abort', () => {
        cortada = signal.aborted;
        fallar(new DOMException('cortada', 'AbortError'));
      });
    });
  const e = await bajarModelo(CAPTIVA, { cajas: undefined, pedir, topeSinDatos: 30 }).then(() => null, (error) => error);
  assert.equal(e.sinRed, true);
  assert.equal(e.cause.name, 'TimeoutError');
  assert.equal(cortada, true);
});

test('el tope es por silencio: una bajada lenta sigue, y una que se queda a medias se corta', async () => {
  const todo = new Uint8Array(BYTES);
  // Diez trozos, uno cada 40 ms, con un tope de 150: en total tarda más que el tope, y nunca se queda callada tanto.
  const lenta = () => {
    let n = 0;
    const largo = Math.ceil(todo.length / 10);
    return new Response(
      new ReadableStream({
        async pull(control) {
          await new Promise((l) => setTimeout(l, 40));
          if (n >= 10) return control.close();
          control.enqueue(todo.slice(n * largo, (n + 1) * largo));
          n++;
        },
      }),
    );
  };
  const inicio = Date.now();
  assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas: undefined, pedir: redDeMentira(lenta), topeSinDatos: 150 })));
  assert.ok(Date.now() - inicio > 150, 'tenía que tardar más que el tope');
  const aMedias = () =>
    new Response(
      new ReadableStream({
        start(control) {
          control.enqueue(todo.slice(0, 1000));
        },
      }),
    );
  const e = await bajarModelo(CAPTIVA, { cajas: undefined, pedir: redDeMentira(aMedias), topeSinDatos: 30 }).then(() => null, (error) => error);
  assert.equal(e.sinRed, true, 'sin señal');
});

test('el carro no espera a que guarden un archivo que ya llegó', async () => {
  const nunca = () => new Promise(() => {});
  const buena = { match: async () => undefined, keys: async () => [], delete: async () => true, put: nunca };
  const inicio = Date.now();
  assert.ok(pareceGlb(await bajarModelo(CAPTIVA, { cajas: { open: async () => buena }, pedir: redDeMentira(), tope: 400 })));
  assert.ok(Date.now() - inicio < 300, 'tardó ' + (Date.now() - inicio));
  await unMomento(450);
});

test('dos pedidos del mismo modelo gastan una sola bajada, y cada uno sabe que va a la red', async () => {
  const puerta = compuerta();
  const pedir = redDeMentira(puerta.red);
  let primero = 0;
  let segundo = 0;
  const a = bajarModelo(CAPTIVA, { cajas: undefined, pedir, alIrALaRed: () => primero++ });
  const b = bajarModelo(CAPTIVA, { cajas: undefined, pedir, alIrALaRed: () => segundo++ });
  await hasta(() => pedir.pedidos.length > 0, 'el pedido');
  const c = bajarModelo(CAPTIVA, { cajas: undefined, pedir, alIrALaRed: () => segundo++ });
  puerta.abrir();
  const [x, y, z] = await Promise.all([a, b, c]);
  assert.equal(pedir.pedidos.length, 1);
  assert.ok(x === y && y === z, 'los mismos bytes');
  assert.equal(primero, 1);
  assert.equal(segundo, 2);
  // Terminó: lo siguiente es otra bajada.
  await bajarModelo(CAPTIVA, { cajas: undefined, pedir });
  assert.equal(pedir.pedidos.length, 2);
});

test('volver a una Captiva mientras baja no gasta otra descarga', async (t) => {
  const puerta = compuerta();
  const p = montar(t, crearCarro({ ...LINEA, placa: 'VUE111' }), { red: puerta.red });
  await p.pantalla.cargar('VUE111');
  await hasta(() => p.pedir.pedidos.length === 1);
  p.ponerCarro(crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'VUE222' }));
  await p.pantalla.cargar('VUE222');
  p.ponerCarro(crearCarro({ ...LINEA, placa: 'VUE111' }));
  await p.pantalla.cargar('VUE111');
  await hasta(() => p.letrero.textContent === 'Bajando el modelo de la Captiva (4 MB)…' && !p.letrero.hidden, 'el letrero, otra vez');
  puerta.abrir();
  await hasta(() => p.visor.visto, 'el modelo');
  assert.equal(p.pedir.pedidos.length, 1);
});

test('la huella de la tabla es la del archivo; uno dañado por dentro se bota de la caché y se baja de nuevo', async () => {
  const { createHash } = await import('node:crypto');
  for (const m of MODELOS) assert.equal(m.sha256, createHash('sha256').update(fs.readFileSync(ruta(m))).digest('hex'), m.archivo);
  // Mismo largo, misma cabecera: un byte de la foto cambiado. pareceGlb no lo ve.
  const danado = new Uint8Array(copiaDeBytes());
  danado[danado.length - 5000] ^= 0xff;
  assert.ok(pareceGlb(danado.buffer));
  const cajas = cajasDeMentira({ [CAPTIVA.archivo]: danado.buffer });
  const pedir = redDeMentira();
  const bytes = await bajarModelo(CAPTIVA, { cajas, pedir });
  assert.equal(pedir.pedidos.length, 1);
  assert.equal(primeraDiferencia(new Uint8Array(bytes), new Uint8Array(BYTES)), null);
  // Y lo dañado que llega de la red no se guarda.
  const cajas2 = cajasDeMentira();
  const e = await bajarModelo(CAPTIVA, { cajas: cajas2, pedir: redDeMentira(() => new Response(danado.buffer.slice(0))) }).then(() => null, (error) => error);
  assert.match(e.message, /no es el modelo/);
  await unMomento(30);
  assert.equal(cajas2.guardado.size, 0);
});

test('lo que por dentro no se entiende se dice como lo que es: no se pudo armar, no se pudo bajar', async (t) => {
  // Sin crypto.subtle (http en la red del PC) la huella no se puede mirar: llega hasta el lector.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'crypto', original));
  const roto = new Uint8Array(copiaDeBytes());
  roto[25] = 0;
  const p = montar(t, crearCarro({ ...LINEA, placa: 'ROT456' }), { cajas: cajasDeMentira({ [CAPTIVA.archivo]: roto.buffer }) });
  await p.pantalla.cargar('ROT456');
  await hasta(() => p.avisos.length > 0, 'el aviso');
  assert.match(p.avisos.at(-1), /No se pudo armar el modelo de la Captiva/);
  assert.match(p.avisos.at(-1), /Dato para revisar: SyntaxError/);
  assert.equal(p.cajas.guardado.size, 0, 'se olvidó');
  assert.deepEqual(p.pedir.pedidos, [], 'ni se intentó bajar');
});

// ---------- La base que se demora ----------

// Solo esa placa, y hasta que se suelte: una lectura lenta de la base de los escaneos.
function lecturaLenta(t, placa) {
  let soltar;
  const suelta = new Promise((listo) => (soltar = listo));
  const original = FDBObjectStore.prototype.get;
  FDBObjectStore.prototype.get = function (clave) {
    const peticion = original.call(this, clave);
    if (clave !== placa) return peticion;
    const falsa = {};
    peticion.onsuccess = () =>
      suelta.then(() => {
        falsa.result = peticion.result;
        if (falsa.onsuccess) falsa.onsuccess();
      });
    return falsa;
  };
  t.after(() => {
    FDBObjectStore.prototype.get = original;
    soltar();
  });
  return soltar;
}

test('una base que se demora no deja a la Captiva sin su modelo, y si aparece un escaneo le gana', async (t) => {
  const p = montar(t, crearCarro({ ...LINEA, placa: 'DEM111' }), { topeDeLaLectura: 40 });
  const suyo = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  await (await abrirEscaneos()).guardar('DEM111', { ...suyo, catalogo: null }, { origen: 'archivo', archivo: 'kona.glb' });
  const soltar = lecturaLenta(t, 'DEM111');
  const cargando = p.pantalla.cargar('DEM111');
  await hasta(() => p.visor.visto && p.visor.visto.deLinea, 'el modelo, sin esperar a la base');
  soltar();
  await cargando;
  await hasta(() => p.visor.visto && p.visor.visto.placa === 'DEM111', 'el escaneo, que le gana');
  assert.equal(p.boton.textContent, 'Escaneo');
});

test('una lectura vieja de otra placa no deja la siguiente Captiva en genérico', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'VIE111' }), { topeDeLaLectura: 60000 });
  const soltar = lecturaLenta(t, 'VIE111');
  const vieja = p.pantalla.cargar('VIE111');
  await unMomento(30);
  p.ponerCarro(crearCarro({ ...LINEA, placa: 'CAP222' }));
  await p.pantalla.cargar('CAP222');
  await hasta(() => p.visor.visto && p.visor.visto.deLinea, 'el modelo, con la lectura vieja todavía en curso');
  soltar();
  await vieja;
  assert.equal(p.visor.visto.deLinea, CAPTIVA);
});

test('una lectura vieja tampoco frena a un carro sin placa', async (t) => {
  const p = montar(t, crearCarro({ marca: 'Renault', linea: 'Symbol II', placa: 'VIE333' }), { topeDeLaLectura: 60000 });
  lecturaLenta(t, 'VIE333');
  p.pantalla.cargar('VIE333');
  await unMomento(30);
  p.ponerCarro(crearCarro({ ...LINEA }));
  await p.pantalla.cargar('');
  await hasta(() => p.visor.visto && p.visor.visto.deLinea, 'el modelo');
});

// ---------- Por dentro y lo subido a mano ----------

test('por dentro espera su carro: el de cajas no sale en medio', async (t) => {
  let llegar;
  const llega = new Promise((listo) => (llegar = listo));
  let pedidas = 0;
  const p = montar(t, crearCarro({ ...LINEA, placa: 'PDE111' }), {
    prepararPorDentro: () => {
      pedidas++;
      return llega;
    },
  });
  await p.pantalla.cargar('PDE111');
  await hasta(() => p.visor.visto);
  await p.pantalla.abrir();
  assert.equal(pedidas, 1, 'se pide al abrir el diálogo');
  const yendo = p.verLinea.disparar('click');
  await unMomento(120);
  assert.equal(p.visor.verPiezas, false, 'todavía no');
  assert.equal(p.elemento('previa-escaneo').hidden, false);
  assert.match(p.elemento('previa-escaneo-texto').textContent, /Abriendo las piezas por dentro/);
  llegar();
  await yendo;
  assert.equal(p.visor.verPiezas, true);
  assert.equal(p.elemento('previa-escaneo').hidden, true);
});

test('un GLB de catálogo subido a mano: su crédito con enlaces, sin parecer escaneo, y no dice «de la misma línea» en otra línea', async (t) => {
  const subido = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  const p = montar(t, crearCarro({ marca: 'Renault', linea: 'Symbol II', carroceria: 'sedan', placa: 'MAN456' }));
  await (await abrirEscaneos()).guardar('MAN456', subido, { origen: 'archivo', archivo: 'captiva.glb' });
  await p.pantalla.cargar('MAN456');
  await p.pantalla.abrir();
  assert.equal(p.elemento('escaneo-titulo').textContent, 'El 3D de este carro');
  assert.match(p.estado.textContent, /hecho con fotos de un carro de otra línea, no de este carro/);
  assert.equal(p.linea.hidden, false);
  assert.equal(p.credito.hidden, false);
  assert.ok(enlacesDe(p.credito).includes('https://creativecommons.org/licenses/by/3.0/'));
  assert.equal(p.verLinea.hidden, true);
  assert.equal(p.referencia.hidden, true);
  assert.equal(p.boton.textContent, 'Escanear');
  // En un carro de su línea sí lo es.
  const q = montar(t, crearCarro({ ...LINEA, placa: 'MAN789' }));
  await (await abrirEscaneos()).guardar('MAN789', subido, { origen: 'archivo', archivo: 'captiva.glb' });
  await q.pantalla.cargar('MAN789');
  await q.pantalla.abrir();
  assert.match(q.estado.textContent, /de otro carro de la misma línea/);
});

// ---------- El color que se dice ----------

test('el color que se le ve: el elegido; sin elegir, el del modelo que le toca; sin modelo, lo de siempre', () => {
  const captiva = { ...LINEA };
  assert.equal(colorElegido({ color: '#CFD4DA' }), null);
  assert.equal(colorElegido({ color: '#1f4fa8' }), '#1f4fa8');
  assert.equal(colorElegido({ color: '' }), null);
  assert.equal(colorQueSeVe({ ...captiva, color: '#cfd4da' }), hexDeColor(CAPTIVA.colorFoto));
  assert.equal(colorQueSeVe({ ...captiva, color: '' }), hexDeColor(CAPTIVA.colorFoto));
  assert.equal(nombreDeColor(colorQueSeVe({ ...captiva, color: '#cfd4da' })), 'café');
  assert.equal(colorQueSeVe({ ...captiva, color: '#1f4fa8' }), '#1f4fa8');
  // Con la carrocería de referencia se ve gris: plateado es verdad.
  assert.equal(colorQueSeVe({ ...captiva, color: '#cfd4da', sinModeloDeCatalogo: true }), '#cfd4da');
  assert.equal(colorQueSeVe({ marca: 'Renault', linea: 'Symbol II', color: '#cfd4da' }), '#cfd4da');
  assert.equal(colorQueSeVe({ marca: 'Renault', linea: 'Symbol II', color: '' }), '');
});

// ---------- El crédito que viaja con el archivo ----------

test('al lado de cada GLB va su crédito: el archivo se puede bajar suelto, y CC BY pide la dirección de la licencia con cada copia', () => {
  const creditos = fs.readFileSync(new URL('../modelos/CREDITOS.txt', import.meta.url), 'utf8');
  for (const m of MODELOS) {
    assert.ok(creditos.includes(m.archivo.split('/').pop()), m.archivo);
    assert.ok(creditos.includes(m.credito.autor));
    assert.ok(creditos.includes(m.credito.enlaceLicencia));
    assert.ok(creditos.includes(m.credito.cambios));
    assert.ok(creditos.includes(m.credito.marcaDe));
    for (const f of m.credito.fotos) {
      assert.ok(creditos.includes(f.nombre), f.nombre);
      assert.ok(creditos.includes(f.enlace), f.enlace);
    }
  }
  // También el que ya nadie va a leer en la tabla: mientras esté en la carpeta se puede bajar suelto.
  for (const archivo of fs.readdirSync(new URL('../modelos/', import.meta.url))) if (archivo.endsWith('.glb')) assert.ok(creditos.includes(archivo), archivo);
  const leeme = fs.readFileSync(new URL('../LEEME.md', import.meta.url), 'utf8');
  for (const m of MODELOS) assert.ok(leeme.includes(m.credito.marcaDe), 'el LEEME también');
  assert.equal(archivosApp().filter((a) => a.startsWith('modelos/')).length, 0, 'tampoco va en la precarga');
});

// ---------- Lo que ya estaba y este cambio deja a la vista ----------

test('si dibujar el reflejo revienta, el piso deja todo como estaba', () => {
  // Con el contexto perdido, three.js revienta al estrenar un sombreador. Con el destino puesto, el lienzo se quedaba vacío hasta recargar.
  const destinos = [];
  const renderizador = {
    getDrawingBufferSize: (v) => v.set(100, 100),
    getRenderTarget: () => 'el de antes',
    setRenderTarget: (d) => destinos.push(d),
    getClearColor: () => {},
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    render: () => {
      throw new TypeError("Cannot read properties of null (reading 'trim')");
    },
  };
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x101010);
  const fondo = escena.background;
  const piso = crearPisoVitrina(renderizador, escena);
  assert.throws(() => piso.actualizar(new THREE.PerspectiveCamera(), { largo: 4, ancho: 2 }), /trim/);
  assert.equal(destinos.at(-1), 'el de antes');
  assert.equal(escena.background, fondo);
  assert.equal(piso.malla.visible, true);
});

test('el medidor del enlace de prueba dice qué está midiendo', () => {
  const nodos = [];
  globalThis.document = {
    createElement: () => {
      const n = { style: {}, hidden: false, textContent: '', addEventListener() {}, append(...h) {
        nodos.push(...h);
      } };
      return n;
    },
  };
  try {
    const medidor = crearMedidor({ append() {} }, 'nuevo');
    const [texto, cambiar] = nodos;
    assert.match(texto.textContent, /^Carro nuevo, en prueba/);
    medidor.rotular('Modelo de catálogo, en prueba');
    assert.match(texto.textContent, /^Modelo de catálogo, en prueba/);
    assert.equal(cambiar.hidden, true, 'cambiar de carro no cambia lo que se ve');
    // Lo medido antes no se mezcla con esto.
    let t = 0;
    for (let i = 0; i < 40; i++) medidor.cuadro((t += 100), true);
    assert.match(texto.textContent, /Modelo de catálogo, en prueba · 10 cuadros\/s/);
    medidor.rotular(null);
    assert.match(texto.textContent, /^Carro nuevo, en prueba · gíralo/);
    assert.equal(cambiar.hidden, false);
  } finally {
    delete globalThis.document;
  }
});

test('el campo de un velo de catálogo se calcula una vez, con menos vueltas que el de un escaneo', () => {
  const e = escaneoDeCatalogo(leerModeloGlb(copiaDeBytes()), ajustesDelEscaneo);
  const uno = campoGuardado(e, 'estribo-izq');
  assert.ok(campoGuardado(e, 'estribo-izq') === uno, 'otra Captiva o otro armado no lo recalcula');
  assert.equal(primeraDiferencia(uno.campo, campoDePieza(e, 'estribo-izq', 10, { cerrarOrillas: true }).campo), null);
});


// ---------- El campo en el carro ----------

test('sinModeloDeCatalogo sobrevive a guardar y leer, en el registro y en el borrador', async () => {
  assert.equal(crearCarro({}).sinModeloDeCatalogo, false);
  assert.equal(crearCarro({ sinModeloDeCatalogo: 'si' }).sinModeloDeCatalogo, false, 'solo un true de verdad');
  const carro = crearCarro({ ...LINEA, placa: 'GUA123', sinModeloDeCatalogo: true });
  assert.equal(carro.sinModeloDeCatalogo, true);
  // El borrador.
  assert.equal(deserializarCarro(serializarCarro(carro)).sinModeloDeCatalogo, true);
  // Lo que hace el visor al guardar la ficha.
  assert.equal(crearCarro({ ...carro, version: 'LT' }).sinModeloDeCatalogo, true);
  // El registro.
  const almacen = await abrirAlmacen({ indexedDB: new IDBFactory() });
  await almacen.guardar(carro);
  assert.equal((await almacen.obtener('GUA123')).sinModeloDeCatalogo, true);
  assert.equal((await almacen.listar())[0].sinModeloDeCatalogo, true);
  // Abrirlo otra vez desde el Garaje no se lo quita.
  const { carro: abierto, nuevo } = await almacen.abrirOCrear('GUA123', { marca: 'Chevrolet' });
  assert.equal(nuevo, false);
  assert.equal(abierto.sinModeloDeCatalogo, true);
});
