// Los carros de catálogo (js/escaneo-catalogo.js): la app no adivina nada de lo que el archivo ya dice.
// Con la variable GLB_CATALOGO apunta a un archivo de verdad y revisa además lo que trae adentro. El que trae la app se revisa en modelos-catalogo.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { ajustesDelEscaneo, modeloDesdeEscaneo, reetiquetarEscaneo } from '../js/escaneo.js';
import { catalogoDelObjeto, escaneoDeCatalogo, pinturaDeCatalogo, textoDeCatalogo } from '../js/escaneo-catalogo.js';
import { mallaDeObjeto3D, procesarImportado } from '../js/escaneo-importar.js';
import { escaneoParaGuardar } from '../js/escaneos.js';
import { leerModeloGlb } from '../js/modelos-catalogo.js';

const NOMBRES = ['nada', 'capo', 'techo', 'baul', 'bomper-del', 'bomper-tras', 'guardafango-del-izq', 'guardafango-del-der', 'puerta-del-izq', 'puerta-del-der', 'puerta-tras-izq', 'puerta-tras-der', 'costado-izq', 'costado-der', 'estribo-izq', 'estribo-der', 'espejo-izq', 'espejo-der'];
const CATALOGO = {
  origen: 'catalogo',
  carro: { marca: 'Chevrolet', linea: 'Captiva', version: 'LT', modelo: 2020, carroceria: 'suv' },
  medidas: { largo: 4.655, ancho: 1.835, alto: 1.76, entreEjes: 2.75 },
  escala: 1.25,
  centroZ: 0.5,
  piezas: NOMBRES,
  pintura: { base: [0.37, 0.13, 0.044], capa: { escala_u: 0.5, v0: 2 / 3, escala_v: 0.5 }, referencia: 0.3 },
  placa: { u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 },
  juntas: { puertaDel: -0.99, puertaMedia: 0.12, puertaTras: 1.18 },
  credito: 'Fotos: alguien, CC BY 3.0.',
};

// Una caja del tamaño de un carro, escalada como viene el archivo, con la pieza por vértice.
function archivo() {
  const geo = new THREE.BoxGeometry(1.835 * 1.25, 1.76 * 1.25, 4.655 * 1.25, 8, 8, 8);
  geo.translate(0, (1.76 * 1.25) / 2, 0.5 * 1.25);
  const n = geo.attributes.position.count;
  const pieza = new Float32Array(n);
  // Por tandas de vértices seguidos: una pieza lo es de un triángulo cuando la tienen dos de sus tres vértices.
  for (let i = 0; i < n; i++) pieza[i] = Math.floor((i / n) * NOMBRES.length);
  geo.setAttribute('_pieza', new THREE.BufferAttribute(pieza, 1));
  const malla = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  malla.userData.taller = CATALOGO;
  const grupo = new THREE.Group();
  grupo.add(malla);
  return { grupo, pieza };
}

test('un archivo de catálogo se reconoce y conserva la pieza de cada vértice', () => {
  const { grupo, pieza } = archivo();
  assert.equal(catalogoDelObjeto(grupo).origen, 'catalogo');
  const malla = mallaDeObjeto3D(grupo);
  assert.equal(malla.catalogo.origen, 'catalogo');
  assert.deepEqual([...malla.pieza], [...pieza]);
});

test('un archivo sin extras sigue siendo un escaneo corriente', () => {
  const malla = mallaDeObjeto3D(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  assert.equal(malla.catalogo, null);
  assert.equal(malla.pieza, null);
});

test('no se mide: las medidas son las de la ficha, las piezas las del archivo y la escala se deshace', () => {
  const { grupo, pieza } = archivo();
  const e = procesarImportado(mallaDeObjeto3D(grupo), { carroceria: 'sedan' });
  assert.deepEqual(e.medidas, { largo: 4.655, ancho: 1.835, alto: 1.76 });
  assert.equal(e.carroceria, 'suv');
  assert.deepEqual([...e.etiquetas], [...pieza]);
  assert.deepEqual(e.nombres, NOMBRES);
  // La malla quedó en metros de verdad.
  let maxZ = 0;
  for (let i = 2; i < e.posiciones.length; i += 3) maxZ = Math.max(maxZ, e.posiciones[i]);
  assert.ok(Math.abs(maxZ - 4.655 / 2) < 1e-3, 'largo en metros: ' + maxZ);
  // Las juntas de la ficha le llegan al genérico de adentro.
  assert.equal(e.ajustes.puertaMedia, 0.12);
});

test('cambiar de carrocería no le mueve las piezas', () => {
  const { grupo, pieza } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  const otro = reetiquetarEscaneo(e, 'sedan');
  assert.deepEqual([...otro.etiquetas], [...pieza]);
  assert.equal(otro.carroceria, 'suv');
});

test('al guardarlo sigue diciendo lo que es', () => {
  const { grupo } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  const r = escaneoParaGuardar('CAP123', e, { origen: 'archivo', archivo: 'x.glb' }, '2026-11-05T00:00:00Z');
  assert.equal(r.catalogo.origen, 'catalogo');
  assert.equal(r.nombres.length, NOMBRES.length);
});

test('el modelo sale partido en las piezas del archivo, sin genérico en medio', () => {
  const { grupo } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  const m = modeloDesdeEscaneo(e, { color: '#ffffff', placa: 'CAP 123' });
  const ids = new Set(m.seleccionables.map((s) => s.userData.piezaId));
  for (const n of NOMBRES) if (n !== 'nada') assert.ok(ids.has(n), 'falta ' + n);
});

test('el color de la ficha es un color pleno, y sin color se queda el de la foto', () => {
  const sin = pinturaDeCatalogo(CATALOGO, {});
  assert.equal(sin.uniforms.uConTono.value, 0);
  const blanco = pinturaDeCatalogo(CATALOGO, { color: '#ffffff' });
  assert.equal(blanco.uniforms.uConTono.value, 1);
  assert.ok(Math.abs(blanco.uniforms.uTono.value.x * CATALOGO.pintura.referencia - 0.8) < 1e-6);
  assert.equal(blanco.uniforms.uCapa.value.y, 0.5);
});

test('el color y la placa cambian sobre el mismo modelo, sin volver a abrir la foto', () => {
  const p = pinturaDeCatalogo(CATALOGO, { color: '#ffffff' });
  const tono = p.uniforms.uTono.value.x;
  assert.equal(p.pintar({ color: '#ffffff' }), false, 'nada cambió');
  assert.equal(p.pintar({ color: '#2255aa' }), true);
  assert.equal(p.uniforms.uConTono.value, 1);
  assert.notEqual(p.uniforms.uTono.value.x, tono);
  // Volver al de la foto: sin color elegido no se tiñe.
  assert.equal(p.pintar({ color: null }), true);
  assert.equal(p.uniforms.uConTono.value, 0);
});

// Un lienzo de mentira, con lo que se le escribe.
function conDocumentoDeMentira(t) {
  const escrito = [];
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText: (...a) => escrito.push(a) }) }),
  };
  t.after(() => delete globalThis.document);
  return escrito;
}

test('el número de la placa no se puede salir del marco, sea cual sea la letra', (t) => {
  // Arial Narrow está en este PC y no en un iPhone: con Arial, JPX 248 mide 729 px en un lienzo de 680.
  const escrito = conDocumentoDeMentira(t);
  const p = pinturaDeCatalogo(CATALOGO, { placa: 'JPX 248' });
  assert.equal(escrito.length, 1);
  const [texto, x, , ancho] = escrito[0];
  assert.equal(texto, 'JPX 248');
  assert.equal(x, 340);
  assert.ok(ancho > 0 && x - ancho / 2 >= 16 && x + ancho / 2 <= 664, 'ancho ' + ancho);
  assert.equal(p.uniforms.uConPlaca.value, 1);
  // Otra placa suelta el lienzo de la anterior: en un iPhone son los lienzos vivos los que cuentan.
  let soltada = false;
  p.uniforms.uPlaca.value.addEventListener('dispose', () => (soltada = true));
  assert.equal(p.pintar({ placa: 'ABC 123' }), true);
  assert.equal(soltada, true);
  assert.equal(escrito.length, 2);
  assert.equal(p.pintar({ placa: '' }), true);
  assert.equal(p.uniforms.uConPlaca.value, 0);
});

test('la placa del genérico tampoco se sale', (t) => {
  const escrito = conDocumentoDeMentira(t);
  construirCarro({ placa: 'JPX 248' });
  assert.ok(escrito.length > 0);
  for (const [, x, , ancho] of escrito) assert.ok(ancho > 0 && x + ancho / 2 <= 661 && x - ancho / 2 >= 19, 'ancho ' + ancho);
});

test('el modelo de foto no se ve hasta tener su foto, y el blanco no se quema', async (t) => {
  const { grupo } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  let abrir;
  globalThis.createImageBitmap = () => new Promise((listo) => (abrir = listo));
  t.after(() => delete globalThis.createImageBitmap);
  const uvs = new Float32Array((e.posiciones.length / 3) * 2);
  const m = modeloDesdeEscaneo({ ...e, uvs, textura: new Blob(['x']) }, { color: '#ffffff', placa: '' });
  assert.equal(m.grupo.visible, false, 'sin foto es una forma de color plano');
  abrir({ width: 4, height: 4, close() {} });
  await m.texturaLista;
  assert.equal(m.grupo.visible, true);
  const { fragmentShader } = m.seleccionables[0].material;
  assert.match(fragmentShader, /sobra \/ \(1\.0 \+ sobra \/ 0\.3\)/);
  // El color cambia sobre este mismo modelo.
  assert.equal(m.repintar({ color: '#2255aa' }), true);
  assert.equal(m.seleccionables[0].material.uniforms.uConTono.value, 1);
});

// Lo que el sombreador dice, sin los bloques de un #ifdef que no entra. Solo saca los de más afuera: los de adentro se van con ellos.
function sinBloque(fuente, nombre) {
  const lineas = fuente.split('\n');
  const salida = [];
  let hondo = 0;
  for (const linea of lineas) {
    const t = linea.trim();
    if (hondo === 0 && t === '#ifdef ' + nombre) {
      hondo = 1;
      continue;
    }
    if (hondo > 0) {
      if (t.startsWith('#if')) hondo += 1;
      if (t === '#endif') hondo -= 1;
      continue;
    }
    salida.push(linea);
  }
  return salida.join('\n');
}

test('el brillo que se mueve: solo con su máscara, y un escaneo no entra', async (t) => {
  globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close() {} });
  t.after(() => delete globalThis.createImageBitmap);
  const { grupo } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  const uvs = new Float32Array((e.posiciones.length / 3) * 2);
  const materialDe = async (escaneo) => {
    const m = modeloDesdeEscaneo({ ...escaneo, uvs, textura: new Blob(['x']) });
    await m.texturaLista;
    return m.seleccionables[0].material;
  };
  // Un archivo sin máscara: como antes, sin una lectura ni una cuenta de más.
  const sinMascara = await materialDe(e);
  assert.deepEqual(sinMascara.defines, { CATALOGO: 1 });
  assert.equal(sinMascara.uniforms.uBrillo, undefined);
  // Con máscara, dice dónde está.
  const brillo = { u0: 0.5, escala_u: 0.5, v0: 2 / 3, escala_v: 0.5 };
  const conMascara = await materialDe({ ...e, catalogo: { ...CATALOGO, pintura: { ...CATALOGO.pintura, brillo } } });
  assert.deepEqual(conMascara.defines, { CATALOGO: 1, CATALOGO_BRILLO: 1 });
  assert.deepEqual(conMascara.uniforms.uBrillo.value.toArray(), [0.5, 2 / 3, 0.5, 0.5]);
  // Un escaneo: ningún define y ningún uniform de catálogo. Lo nuevo va adentro de su #ifdef, y lo de afuera sigue siendo la cuenta de siempre.
  const escaneo = await materialDe({ ...e, catalogo: null });
  assert.deepEqual(escaneo.defines, {});
  assert.deepEqual(Object.keys(escaneo.uniforms), ['mapa']);
  const afuera = sinBloque(sinBloque(escaneo.fragmentShader, 'CATALOGO_BRILLO'), 'CATALOGO');
  assert.doesNotMatch(afuera, /uBrillo|sala\(|cuanto|uTono|uCapa|uPlaca/);
  // Letra por letra, sin los comentarios: aquí se notaría cualquier cuenta que se cuele en lo de un escaneo sin pasar por un #ifdef.
  const cuenta = afuera.slice(afuera.indexOf('void main(){')).replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
  assert.equal(cuenta, 'void main(){ vec3 c = texture2D(mapa, vU).rgb; vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 v = normalize(vV); float canto = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0); float lampara = smoothstep(0.45, 0.95, reflect(-v, n).y); float alto = smoothstep(0.32, 0.62, vY); c += vec3(0.88, 0.94, 1.0) * alto * (0.13 * canto + 0.05 * lampara); gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }');
});

test('la foto más liviana también se usa al volver a armar, y un error de la foto queda a mano', async (t) => {
  const { grupo } = archivo();
  const e = escaneoDeCatalogo(mallaDeObjeto3D(grupo), ajustesDelEscaneo);
  const pedidas = [];
  globalThis.createImageBitmap = async (_b, opciones) => {
    pedidas.push(opciones);
    throw new DOMException('no cupo', 'InvalidStateError');
  };
  t.after(() => delete globalThis.createImageBitmap);
  const uvs = new Float32Array((e.posiciones.length / 3) * 2);
  const opciones = { resizeWidth: 2048, resizeHeight: 1536 };
  const m = modeloDesdeEscaneo({ ...e, uvs, textura: new Blob(['x']), opcionesDeFoto: opciones });
  assert.equal(await m.texturaLista, null);
  assert.deepEqual(pedidas, [opciones]);
  assert.equal(m.errorDeFoto.name, 'InvalidStateError');
});

test('la pantalla no lo llama escaneo', () => {
  // Otro carro de la misma línea, no "uno igual": una Captiva de otro año puede traer otra trompa.
  assert.equal(textoDeCatalogo(CATALOGO), 'Modelo de catálogo de Chevrolet Captiva LT 2020: hecho con fotos de otro carro de la misma línea, no de este carro.');
  assert.doesNotMatch(textoDeCatalogo(CATALOGO), /escane/i);
  // Subido a mano a un carro de otra línea, o a uno sin datos: "de la misma línea" sería falso.
  assert.match(textoDeCatalogo(CATALOGO, { linea: 'otra' }), /hecho con fotos de un carro de otra línea, no de este carro/);
  assert.match(textoDeCatalogo(CATALOGO, { linea: 'sin-datos' }), /hecho con fotos de otro carro, no de este carro/);
});

// El archivo de verdad, si se pide.
test('el GLB trae lo que dice traer', { skip: !process.env.GLB_CATALOGO }, () => {
  const b = fs.readFileSync(process.env.GLB_CATALOGO);
  const largoJson = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + largoJson).toString('utf8'));
  const prim = g.meshes[0].primitives[0];
  const n = g.accessors[prim.attributes.POSITION].count;
  assert.equal(g.accessors[prim.attributes._PIEZA].count, n);
  const t = g.nodes[0].extras.taller;
  assert.equal(t.origen, 'catalogo');
  assert.ok(t.piezas.length >= 18);
  assert.ok(g.accessors[prim.attributes._PIEZA].max[0] < t.piezas.length);
  assert.ok(b.length < 8e6, 'pesa ' + b.length);
  assert.ok(g.accessors[prim.indices].count / 3 < 150000);
  const { capa, brillo } = t.pintura;
  if (brillo) {
    // Al lado de la capa, sin pisarla, y dentro de la imagen: el mosaico llega hasta v = v0, y ahí es donde cae lo último de la máscara.
    assert.equal(brillo.u0, capa.escala_u);
    assert.equal(brillo.v0, capa.v0);
    assert.ok(brillo.u0 + brillo.escala_u <= 1 && brillo.v0 + capa.v0 * brillo.escala_v <= 1.0001);
  }
  // La franja de Techo de la primera versión de la Captiva: debajo de la ventana, a todo lo largo, y cada pieza vale 90.000 en la nómina. Con GLB_CATALOGO en ese archivo, esto cae con 1.525 triángulos.
  if (t.carro.linea !== 'Captiva') return;
  const e = escaneoDeCatalogo(leerModeloGlb(b), ajustesDelEscaneo);
  const { posiciones: P, indices: I, etiquetas: E } = e;
  const techo = e.nombres.indexOf('techo');
  let abajo = 0;
  for (let k = 0; k < I.length; k += 3) {
    const [a, c, d] = [I[k], I[k + 1], I[k + 2]];
    if ((E[a] === E[c] || E[a] === E[d] ? E[a] : E[c] === E[d] ? E[c] : E[a]) !== techo) continue;
    const y = (P[a * 3 + 1] + P[c * 3 + 1] + P[d * 3 + 1]) / 3;
    const z = (P[a * 3 + 2] + P[c * 3 + 2] + P[d * 3 + 2]) / 3 + (t.centroZ || 0);
    if (y > 1.15 && y < 1.31 && z > 0.46 && z < 2.24) abajo += 1;
  }
  assert.equal(abajo, 0, 'triángulos de Techo debajo de la ventana');
});
