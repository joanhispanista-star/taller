// El contrato del carro genérico nuevo (js/generico/): que se pueda enchufar en la app sin romperla.
// La app le pide a un carro lo mismo que a construirCarro de js/carro.js: { grupo, seleccionables, porId,
// articulaciones, disposicion }. Aquí se comprueba con el catálogo de verdad, con las bisagras de verdad y con el
// toque de verdad (js/toque.js con la cámara de cada botón), no con un carro de muestra.
//
// Tarda cerca de un minuto: casi todo son rayos contra 70 mil triángulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { archivosApp } from '../herramientas/sellar-version.mjs';
import { construirCarroNuevo } from '../js/generico/carro-nuevo.js';
import { iniciarPrueba } from '../js/generico/en-prueba.js';
import { crearInterior, crearPintura, crearPlaton, tonoDePlaton } from '../js/generico/pintura.js';
import { resaltar } from '../js/carro.js';
import { medidasParaDibujar } from '../js/carrocerias.js';
import { CATALOGO } from '../js/catalogo-carros.js';
import { datosDeEntrada } from '../js/catalogo.js';
import { ALTURA_DE_LA_MIRA, LENTE, VISTAS, distanciaQueEncuadra } from '../js/encuadre.js';
import { PIEZAS, esInterior } from '../js/piezas.js';
import { piezaTocada } from '../js/toque.js';

const ROJO = 0xb8232a;
const CARROCERIAS = ['sedan', 'hatchback', 'suv', 'camioneta'];
const PIEZAS_DE_AFUERA = PIEZAS.filter((p) => !esInterior(p.id)).map((p) => p.id);
const PIEZAS_DE_ADENTRO = PIEZAS.filter((p) => esInterior(p.id)).map((p) => p.id);
const BISAGRAS = ['puerta-del-izq', 'puerta-del-der', 'puerta-tras-izq', 'puerta-tras-der', 'capo', 'baul'];
// Los dos extremos que pidió Joan, fuera del catálogo: un carro chico de 3,6 m y uno grande de 5,6 m.
const CHICO = { carroceria: 'hatchback', medidas: { largo: 3.6, ancho: 1.6, alto: 1.49, entreEjes: 2.4 } };
const GRANDE = { carroceria: 'camioneta', medidas: { largo: 5.6, ancho: 1.95, alto: 1.9, entreEjes: 3.3 } };
// Dos de cabina adelantada, las de la tapa en la cara: una pick-up (DFSK K01) y una van (Chevrolet N300).
const K01 = { carroceria: 'camioneta', medidas: { largo: 3.88, ancho: 1.68, alto: 1.825, entreEjes: 2.515 } };
const N300 = { carroceria: 'suv', medidas: { largo: 4.005, ancho: 1.62, alto: 1.9, entreEjes: 2.7 } };

// 60 líneas repartidas por tamaño, del carro más corto del catálogo al más largo. Las 1.075 con medidas ya pasaron
// una vez por estas mismas cuentas (52 s), y los topes de abajo salen de ahí: aquí van 60 para que la prueba no tarde.
function muestraDelCatalogo(n = 60) {
  const lineas = CATALOGO.filter((e) => e.largo && e.ancho && e.alto && e.entreEjes).sort((a, b) => a.largo - b.largo);
  const salida = [];
  for (let i = 0; i < n; i++) salida.push(lineas[Math.round((i * (lineas.length - 1)) / (n - 1))]);
  return salida;
}
const MUESTRA = muestraDelCatalogo();

function nombreDe(e) {
  return `${e.marca} ${e.linea} (${e.carroceria}, ${e.largo} mm)`;
}

function armarLinea(e) {
  return construirCarroNuevo({ colorBase: ROJO, ...datosDeEntrada(e) });
}

function mallas(grupo) {
  const lista = [];
  grupo.traverse((o) => {
    if (o.isMesh) lista.push(o);
  });
  return lista;
}

// Lo que se dibuja: lo invisible no cuesta triángulos ni llamadas de dibujo.
function triangulos(grupo) {
  let n = 0;
  for (const m of mallas(grupo)) if (m.visible) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  return n;
}

// El contrato, en un solo sitio: lo llaman las carrocerías y las líneas del catálogo.
function comprobarContrato(carro, nombre) {
  const { grupo, seleccionables, porId, articulaciones, disposicion } = carro;
  assert.ok(grupo?.isObject3D, `${nombre}: sin grupo`);
  assert.deepEqual([...porId.keys()].sort(), PIEZAS.map((p) => p.id).sort(), `${nombre}: las piezas no son las del catálogo`);
  assert.equal(seleccionables.length, PIEZAS.length, `${nombre}: sobran o faltan seleccionables`);
  for (const malla of seleccionables) {
    const id = malla.userData.piezaId;
    assert.equal(porId.get(id), malla, `${nombre}: ${id} no es la malla de porId`);
    assert.equal(malla.name, id, `${nombre}: ${id} con otro nombre`);
    assert.ok(malla.userData.colorBase?.isColor, `${nombre}: ${id} sin colorBase, y resaltar lo necesita para volver`);
    assert.ok(malla.material.color?.isColor && malla.material.emissive?.isColor, `${nombre}: ${id} con un material que resaltar no puede teñir`);
    let raiz = malla;
    while (raiz.parent) raiz = raiz.parent;
    assert.equal(raiz, grupo, `${nombre}: ${id} no cuelga del carro`);
  }
  const conocidas = new Set(PIEZAS.map((p) => p.id));
  for (const m of mallas(grupo)) {
    const id = m.userData.piezaId;
    assert.ok(!id || conocidas.has(id), `${nombre}: una malla dice ser ${id}, que no está en el catálogo`);
    const P = m.geometry.attributes.position;
    assert.ok(P && P.count > 0, `${nombre}: una malla sin vértices (${m.name})`);
    for (const dato of P.array) assert.ok(Number.isFinite(dato), `${nombre}: posición rota en ${m.name || id}`);
    const N = m.geometry.attributes.normal;
    if (N) {
      for (const dato of N.array) assert.ok(Number.isFinite(dato), `${nombre}: normal rota en ${m.name || id}`);
    }
    if (m.geometry.index) {
      for (const i of m.geometry.index.array) assert.ok(i < P.count, `${nombre}: índice fuera de la malla en ${m.name || id}`);
    }
  }
  const tri = triangulos(grupo);
  assert.ok(tri < 75000, `${nombre}: ${tri} triángulos`);
  // Lo que visor.js le pide a la bisagra: fijar, angulo, max, pivote.localToWorld(referencia).
  assert.deepEqual([...articulaciones.keys()].sort(), [...BISAGRAS].sort(), `${nombre}: las bisagras no son las seis`);
  for (const [id, art] of articulaciones) {
    assert.ok(art.pivote?.isObject3D, `${nombre}: ${id} sin pivote`);
    assert.equal(art.pivote.parent, grupo, `${nombre}: el pivote de ${id} no cuelga del carro`);
    assert.ok(['x', 'y', 'z'].includes(art.eje), `${nombre}: ${id} con eje ${art.eje}`);
    assert.ok(art.signo === 1 || art.signo === -1, `${nombre}: ${id} con signo ${art.signo}`);
    assert.ok(art.max > 0.5 && art.max < 1.6, `${nombre}: ${id} abre ${art.max} rad`);
    assert.ok(art.referencia?.isVector3 && art.referencia.toArray().every(Number.isFinite), `${nombre}: ${id} sin referencia`);
    assert.equal(typeof art.fijar, 'function', `${nombre}: ${id} sin fijar`);
    assert.equal(art.angulo, 0, `${nombre}: ${id} no nace cerrada`);
    assert.equal(porId.get(id).parent, art.pivote, `${nombre}: ${id} no se va con su bisagra`);
  }
  // Lo que leen encuadre.js y piso-vitrina.js.
  for (const campo of ['largo', 'ancho', 'alto', 'entreEjes', 'ejeDel', 'ejeTras', 'cintura', 'medio']) {
    assert.ok(Number.isFinite(disposicion[campo]), `${nombre}: disposicion.${campo} = ${disposicion[campo]}`);
  }
}

test('contrato: las 4 carrocerías traen las 29 piezas (17 de afuera, 12 de adentro) y las 6 bisagras', () => {
  assert.equal(PIEZAS_DE_AFUERA.length, 17);
  assert.equal(PIEZAS_DE_ADENTRO.length, 12);
  for (const carroceria of CARROCERIAS) comprobarContrato(construirCarroNuevo({ colorBase: ROJO, carroceria }), carroceria);
  comprobarContrato(construirCarroNuevo({ colorBase: ROJO, ...CHICO }), 'chico de 3,6 m');
  comprobarContrato(construirCarroNuevo({ colorBase: ROJO, ...GRANDE }), 'grande de 5,6 m');
});

test('contrato: 60 líneas del catálogo, del carro más corto al más largo', () => {
  assert.equal(MUESTRA.length, 60);
  assert.ok(MUESTRA[0].largo < 3000 && MUESTRA[59].largo > 5800, `de ${MUESTRA[0].largo} a ${MUESTRA[59].largo} mm`);
  for (const e of MUESTRA) comprobarContrato(armarLinea(e), nombreDe(e));
  // Las pick-ups de cabina adelantada son las más raras de armar, y son pocas: al azar no salen.
  const adelantadas = CATALOGO.filter((e) => datosDeEntrada(e).carroceria === 'camioneta' && e.largo && e.largo < 4300);
  assert.ok(adelantadas.length >= 3, `solo ${adelantadas.length} pick-ups cortas`);
  for (const e of adelantadas) comprobarContrato(armarLinea(e), nombreDe(e));
});

// Un escaneo manda las medidas que midió, y medidasParaDibujar acepta de 2,6 a 6,5 m de largo y de 1,1 a 2,3 de alto. De
// 700 carros al azar en ese rango ninguno revienta; dos pick-ups de 1,10 m salían con números rotos en el parlante.
test('contrato: cualquier medida que acepte el visor arma entero, aunque no sea un carro de verdad', () => {
  const azar = azarCon(90210);
  const entre = (a, b) => a + (b - a) * azar();
  for (let i = 0; i < 40; i++) {
    const largo = entre(2.6, 6.5);
    const medidas = { largo, ancho: entre(1.4, 2.3), alto: entre(1.1, 2.3), entreEjes: entre(1.8, Math.min(4, largo - 1)) };
    comprobarContrato(construirCarroNuevo({ colorBase: ROJO, carroceria: CARROCERIAS[i % 4], medidas }), `${CARROCERIAS[i % 4]} ${JSON.stringify(medidas)}`);
  }
  for (const carroceria of CARROCERIAS) {
    for (const medidas of [{ largo: 4, ancho: 1.6, alto: 1.1, entreEjes: 2.5 }, { largo: 2.6, ancho: 1.4, alto: 1.1, entreEjes: 1.8 }, { largo: 6.5, ancho: 2.3, alto: 2.3, entreEjes: 4 }, { largo: 3.3, ancho: 1.5, alto: 2.0, entreEjes: 2.1 }]) {
      comprobarContrato(construirCarroNuevo({ colorBase: ROJO, carroceria, medidas }), `${carroceria} ${JSON.stringify(medidas)}`);
    }
  }
});

// visor.js pasa carro.color, que es el texto del selector de color, y un escaneo pasa lo que traiga. Los 216 colores
// son también los extremos: la pintura calcula el color al revés, y un negro puro o un azul puro son los que se
// disparan. Un número roto en un uniforme no revienta: deja la lata negra, sin error ninguno.
const COLORES_216 = [];
for (const r of [0, 0x33, 0x66, 0x99, 0xcc, 0xff]) for (const g of [0, 0x33, 0x66, 0x99, 0xcc, 0xff]) for (const b of [0, 0x33, 0x66, 0x99, 0xcc, 0xff]) COLORES_216.push((r << 16) | (g << 8) | b);

function comprobarMaterial(m, nombre) {
  assert.ok(m.color.toArray().every(Number.isFinite), `${nombre}: color roto`);
  const sombreador = { uniforms: {}, fragmentShader: '' };
  m.onBeforeCompile(sombreador);
  for (const [uniforme, { value }] of Object.entries(sombreador.uniforms)) {
    const lista = typeof value === 'number' ? [value] : value.toArray();
    assert.ok(lista.every(Number.isFinite), `${nombre}: ${uniforme} roto: ${lista}`);
  }
}

test('contrato: la pintura da números sanos en cualquier color, también en el texto que manda el selector', () => {
  for (const hex of COLORES_216) {
    const color = new THREE.Color(hex);
    comprobarMaterial(crearPintura(color, { alto: 1.45, cintura: 0.95 }), 'pintura #' + hex.toString(16));
    comprobarMaterial(crearInterior(color), 'adentro #' + hex.toString(16));
  }
  for (const texto of ['#cfd4da', '#000000', '#ffffff', 'rgb(200, 30, 40)']) comprobarContrato(construirCarroNuevo({ colorBase: texto, carroceria: 'sedan' }), 'color ' + texto);
});

// "Ver las piezas" de un escaneo dibuja el genérico con lo medido en el escaneo (ajustes).
test('contrato: con lo medido en un escaneo (ajustes) arma entero, y lo medido manda', () => {
  for (const carroceria of CARROCERIAS) {
    const d = construirCarroNuevo({ colorBase: ROJO, carroceria }).disposicion;
    const ajustes = { ejeDel: d.ejeDel + 0.04, ejeTras: d.ejeTras - 0.03, piso: d.piso + 0.03, cintura: d.cintura + 0.03, capoTras: d.capoTras + 0.05, parabrisasAlto: d.parabrisasAlto + 0.05, puertaDel: d.puertaDel + 0.04, puertaMedia: d.puertaMedia + 0.06, puertaTras: d.puertaTras - 0.05 };
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria, ajustes });
    comprobarContrato(carro, carroceria + ' con ajustes');
    for (const [campo, valor] of Object.entries(ajustes)) assert.ok(Math.abs(carro.disposicion[campo] - valor) < 1e-9, `${carroceria}: ${campo} pedido ${valor}, dibujado ${carro.disposicion[campo]}`);
  }
});

// Así se prende el carro nuevo en un teléfono, sin tocar a los demás.
test('contrato: ?carro=nuevo prende el carro nuevo, y sin eso no hay prueba', async () => {
  const nuevo = await iniciarPrueba('?carro=nuevo');
  assert.equal(nuevo.estado, 'nuevo');
  assert.equal(nuevo.construir, construirCarroNuevo);
  assert.deepEqual(await iniciarPrueba('?carro=actual'), { estado: 'actual', construir: null });
  assert.equal(await iniciarPrueba(''), null);
});

// El teléfono abre la app de lo que el service worker guardó al instalar, y herramientas/sellar-version.mjs no
// entra a las subcarpetas de js/: el día que una pantalla importe esta carpeta, sin esto la app no abre sin internet.
test('contrato: si alguna pantalla importa js/generico, la precarga del teléfono lo lleva', () => {
  const carpeta = new URL('../js/', import.meta.url);
  const usan = fs.readdirSync(carpeta).filter((n) => n.endsWith('.js') && /from '\.\/generico\/|import\('\.\/generico\//.test(fs.readFileSync(new URL(n, carpeta), 'utf8')));
  if (!usan.length) return;
  const lista = archivosApp();
  for (const n of fs.readdirSync(new URL('generico/', carpeta))) assert.ok(lista.includes('js/generico/' + n), `${usan.join(', ')} importa js/generico, y js/generico/${n} no está en la precarga`);
});

// La lata es lo que se pinta: sin los espejos, que salen a los lados, y sin lo que va encima del techo.
function cajaDeLaLata(carro) {
  const caja = new THREE.Box3();
  carro.grupo.updateMatrixWorld(true);
  for (const m of mallas(carro.grupo)) {
    const id = m.userData.piezaId;
    if (!id || esInterior(id) || id.startsWith('espejo')) continue;
    caja.expandByObject(m);
  }
  return caja;
}

// Medido en las 1.075 líneas del catálogo con medidas, en metros (lata menos lo pedido):
//   largo: de -0,016 (Hyundai Porter) a -0,005.
//   ancho: de -0,002 a +0,048 (Ford Explorer): el pasarruedas de plástico de la SUV sale 2 cm a cada lado.
//   alto:  -0,003 en todas, salvo la SUV, -0,063: el alto del catálogo incluye las barras del techo y la lata va
//          6 cm por debajo a propósito. Con las barras, a -0,020.
// Es decir: el peor de todo el catálogo se queda en 6,3 cm, por debajo de los 7 que pidió el dueño.
const TOPE = { largo: 0.02, ancho: 0.05, alto: 0.005, altoSuv: 0.065 };

function comprobarMedidas(carro, pedido, nombre) {
  const caja = cajaDeLaLata(carro);
  const t = caja.getSize(new THREE.Vector3());
  const dLargo = t.z - pedido.largo;
  const dAncho = t.x - pedido.ancho;
  const dAlto = caja.max.y - pedido.alto;
  assert.ok(Math.abs(dLargo) < TOPE.largo, `${nombre}: largo ${dLargo.toFixed(3)} m de lo pedido`);
  assert.ok(Math.abs(dAncho) < TOPE.ancho, `${nombre}: ancho ${dAncho.toFixed(3)} m de lo pedido`);
  assert.ok(Math.abs(dAlto) < (carro.disposicion.tipo === 'suv' ? TOPE.altoSuv : TOPE.alto), `${nombre}: alto ${dAlto.toFixed(3)} m de lo pedido`);
  // El carro está parado en el piso y centrado: encuadre.js lo da por hecho.
  assert.ok(Math.abs(caja.max.x + caja.min.x) < 0.001, `${nombre}: corrido ${(caja.max.x + caja.min.x).toFixed(4)} m a un lado`);
  assert.ok(Math.abs(caja.max.z + caja.min.z) < 0.02, `${nombre}: corrido ${(caja.max.z + caja.min.z).toFixed(4)} m a lo largo`);
  const todo = new THREE.Box3().setFromObject(carro.grupo);
  assert.ok(Math.abs(todo.min.y) < 0.015, `${nombre}: las llantas quedan a ${todo.min.y.toFixed(3)} m del piso`);
}

test('medidas: la lata mide lo pedido, y en lo peor del catálogo no se pasa de 6,5 cm', () => {
  for (const e of MUESTRA) {
    const datos = datosDeEntrada(e);
    comprobarMedidas(armarLinea(e), medidasParaDibujar(datos.carroceria, datos.medidas), nombreDe(e));
  }
  comprobarMedidas(construirCarroNuevo({ colorBase: ROJO, ...CHICO }), CHICO.medidas, 'chico de 3,6 m');
  comprobarMedidas(construirCarroNuevo({ colorBase: ROJO, ...GRANDE }), GRANDE.medidas, 'grande de 5,6 m');
});

// Dónde queda en el mundo el borde libre, que es lo que visor.js mira para saber hacia dónde arrastrar.
function bordeLibre(art) {
  art.pivote.updateMatrixWorld(true);
  return art.pivote.localToWorld(art.referencia.clone());
}

test('bisagras: abren hacia donde deben, respetan el tope y al cerrar vuelve todo exacto', () => {
  const casos = CARROCERIAS.map((carroceria) => ({ carroceria })).concat(CHICO, GRANDE, K01, N300);
  for (const caso of casos) {
    const carro = construirCarroNuevo({ colorBase: ROJO, ...caso });
    const nombre = `${caso.carroceria} ${caso.medidas?.largo ?? 'típico'}`;
    const tipo = carro.disposicion.tipo;
    carro.grupo.updateMatrixWorld(true);
    for (const [id, art] of carro.articulaciones) {
      const pieza = carro.porId.get(id);
      const antes = pieza.matrixWorld.clone();
      const cerrada = bordeLibre(art);
      art.fijar(art.max + 5);
      assert.ok(Math.abs(art.angulo - art.max) < 1e-9, `${nombre}: ${id} se pasó del tope: ${art.angulo}`);
      const abierta = bordeLibre(art);
      const d = abierta.clone().sub(cerrada);
      // El visor divide por lo que se mueve el borde: si casi no se mueve, el dedo no sabría hacia dónde abrir.
      assert.ok(d.length() > 0.25, `${nombre}: el borde libre de ${id} apenas se mueve: ${d.length().toFixed(2)} m`);
      // El carro mira hacia -Z y el izquierdo está en -X.
      if (id.startsWith('puerta')) {
        const hacia = id.endsWith('izq') ? -1 : 1;
        assert.ok(d.x * hacia > 0.1, `${nombre}: ${id} no sale hacia afuera (dx ${d.x.toFixed(2)})`);
        assert.ok(d.z < 0, `${nombre}: ${id} no abre hacia adelante (dz ${d.z.toFixed(2)})`);
      } else if (id === 'capo') {
        assert.ok(d.y > 0.2, `${nombre}: el capó no sube (dy ${d.y.toFixed(2)})`);
      } else if (tipo === 'camioneta') {
        assert.ok(d.y < -0.1 && d.z > 0.1, `${nombre}: la compuerta del platón no cae hacia atrás (dy ${d.y.toFixed(2)}, dz ${d.z.toFixed(2)})`);
      } else {
        assert.ok(d.y > 0.1, `${nombre}: el baúl no sube (dy ${d.y.toFixed(2)})`);
      }
      art.fijar(-5);
      assert.equal(art.angulo, 0, `${nombre}: ${id} se pasó de cerrada`);
      carro.grupo.updateMatrixWorld(true);
      assert.deepEqual(pieza.matrixWorld.elements, antes.elements, `${nombre}: ${id} no vuelve exacto`);
      assert.deepEqual(bordeLibre(art).toArray(), cerrada.toArray(), `${nombre}: el borde de ${id} no vuelve exacto`);
    }
    // Lo que abre se lleva lo suyo: su cara de adentro, y la puerta de adelante su espejo.
    for (const lado of ['izq', 'der']) assert.equal(carro.porId.get('espejo-' + lado).parent, carro.articulaciones.get('puerta-del-' + lado).pivote, `${nombre}: el espejo ${lado} no se va con la puerta`);
    for (const id of ['puerta-del-izq', 'puerta-del-der', 'puerta-tras-izq', 'puerta-tras-der', 'capo', 'baul']) {
      assert.equal(carro.porId.get(id + '-int').parent, carro.articulaciones.get(id).pivote, `${nombre}: ${id}-int no se va con su bisagra`);
    }
  }
});

function fotoDeMateriales(grupo) {
  const foto = new Map();
  for (const m of mallas(grupo)) {
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      if (foto.has(material)) continue;
      foto.set(material, [material.color?.getHex(), material.emissive?.getHex(), material.emissiveIntensity]);
    }
  }
  return foto;
}

test('marcar: resaltar tiñe la pieza pedida y ninguna otra, y al quitar la marca vuelve el color exacto', () => {
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria });
    // Si dos piezas compartieran material, marcar una teñiría la otra, y en la orden saldrían las dos.
    assert.equal(new Set(carro.seleccionables.map((m) => m.material)).size, PIEZAS.length, `${carroceria}: dos piezas comparten material`);
    const limpio = fotoDeMateriales(carro.grupo);
    for (const malla of carro.seleccionables) {
      const id = malla.userData.piezaId;
      const base = malla.material.color.clone();
      resaltar(malla, 0xff7a1a);
      assert.notEqual(malla.material.color.getHex(), base.getHex(), `${carroceria}: ${id} no cambió de tono`);
      assert.equal(malla.material.emissive.getHex(), 0xff7a1a, `${carroceria}: ${id} sin brillo`);
      for (const [material, antes] of fotoDeMateriales(carro.grupo)) {
        if (material === malla.material) continue;
        assert.deepEqual([material.color?.getHex(), material.emissive?.getHex(), material.emissiveIntensity], antes, `${carroceria}: marcar ${id} tiñó también otro material`);
      }
      resaltar(malla, null);
      assert.ok(malla.material.color.equals(base), `${carroceria}: ${id} no vuelve a su color`);
      assert.equal(malla.material.emissive.getHex(), 0, `${carroceria}: ${id} se queda brillando`);
    }
    for (const [material, antes] of fotoDeMateriales(carro.grupo)) {
      assert.deepEqual([material.color?.getHex(), material.emissive?.getHex(), material.emissiveIntensity], antes, `${carroceria}: algo no volvió a su color`);
    }
    assert.deepEqual([...fotoDeMateriales(carro.grupo).values()], [...limpio.values()]);
  }
});

const luz = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// La sombra por vértice que oscurece la pieza (conSombra, en js/generico/adentro.js), en promedio.
function sombraMedia(malla) {
  const c = malla.geometry.attributes.color;
  if (!c) return 1;
  let suma = 0;
  for (let i = 0; i < c.count; i++) suma += c.getX(i);
  return suma / c.count;
}

// Regla de Joan del 15-oct-2026 (js/piezas.js): lo de adentro más claro que la lata, para verlo y poder marcarlo.
// Son los colores calibrados: los dos pasan por el mismo sombreador, así que comparar la base es comparar lo que se ve.
test('regla de Joan: en todos los colores, las piezas de adentro son más claras que la lata', () => {
  // Los 216: la lata contra lo de adentro, con el color de cada uno. Los únicos 6 que no dan son los que tienen rojo y
  // verde al tope (#ffff00 a #ffffff): ya están en el techo de la pantalla, y ahí no hay por dónde ser más clara: lo
  // de adentro se queda en su tope, y lo que dibuja la forma son las sombras (ver crearInterior).
  for (const hex of COLORES_216) {
    const color = new THREE.Color(hex);
    if (luz(color) > 0.92) continue;
    const lata = luz(crearPintura(color, {}).color);
    const adentro = luz(crearInterior(color).color);
    assert.ok(adentro > lata, `#${hex.toString(16).padStart(6, '0')}: adentro ${adentro.toFixed(3)}, lata ${lata.toFixed(3)}`);
    const platon = luz(crearPlaton(color).color);
    assert.ok(platon > lata, `#${hex.toString(16).padStart(6, '0')}: platón ${platon.toFixed(3)}, lata ${lata.toFixed(3)}`);
  }
  // Y en el carro entero, pieza por pieza, con la sombra que cada una trae por vértice.
  const COLORES = { rojo: ROJO, negro: 0x14161a, blanco: 0xf2f3f4, plata: 0xbcc0c4, azul: 0x1f4e9c, taxi: 0xf5c400, 'gris oscuro': 0x42454a, verde: 0x1e6b3a, vinotinto: 0x5a0f1c, beige: 0xc9b58f };
  for (const [nombre, colorBase] of Object.entries(COLORES)) {
    for (const carroceria of ['sedan', 'camioneta']) {
      const carro = construirCarroNuevo({ colorBase, carroceria });
      // El bómper de acero y el estribo de plástico no son del color del carro.
      const lata = Math.max(...PIEZAS_DE_AFUERA.filter((id) => id !== 'bomper-tras' && !id.startsWith('estribo')).map((id) => luz(carro.porId.get(id).material.color)));
      for (const id of PIEZAS_DE_ADENTRO) {
        const pieza = carro.porId.get(id);
        const conSombra = luz(pieza.material.color) * sombraMedia(pieza);
        assert.ok(conSombra > lata, `${nombre}, ${carroceria}: ${id} da ${conSombra.toFixed(3)} y la lata ${lata.toFixed(3)}`);
      }
    }
  }
});

// El platón se ve sin abrir nada. Con el gris claro de las demás piezas de adentro salía casi blanco en cualquier
// color (206,207,208 en un rojo, 243,244,245 en un taxi), y se leía como una sábana sobre la carrocería.
test('platón: más claro que la lata, pero del color del carro', () => {
  const rojo = tonoDePlaton(new THREE.Color(ROJO));
  assert.ok(rojo.r > 4 * rojo.g && rojo.r > 4 * rojo.b, `rojo: ${rojo.toArray()}`);
  const taxi = tonoDePlaton(new THREE.Color(0xf5c400));
  assert.ok(taxi.b < 0.3 * taxi.r, `taxi: ${taxi.toArray()}`);
  const azul = tonoDePlaton(new THREE.Color(0x1f4e9c));
  assert.ok(azul.b > 2 * azul.r, `azul: ${azul.toArray()}`);
  for (const [nombre, hex] of [['rojo', ROJO], ['taxi', 0xf5c400], ['azul', 0x1f4e9c], ['negro', 0x14161a], ['blanco', 0xf2f3f4]]) {
    const carro = construirCarroNuevo({ colorBase: hex, carroceria: 'camioneta' });
    const visto = crearPlaton(new THREE.Color(hex)).color;
    for (const id of ['vano-baul', 'baul-int']) assert.ok(carro.porId.get(id).material.color.equals(visto), `${nombre}: ${id} no lleva el tono del platón`);
    // Lo demás de adentro sigue con el tono claro de la regla: el platón es la única excepción de color.
    assert.ok(carro.porId.get('capo-int').material.color.equals(crearInterior(new THREE.Color(hex)).color), `${nombre}: capo-int cambió de tono`);
  }
  // Y en un sedán no hay platón: su vano sigue con el tono de adentro.
  const sedan = construirCarroNuevo({ colorBase: ROJO, carroceria: 'sedan' });
  assert.ok(sedan.porId.get('vano-baul').material.color.equals(crearInterior(new THREE.Color(ROJO)).color));
});

// Con el reflejo entero del cuarto, la placa de atrás salía lavada: fondo 248,241,201 y letras 131,131,131. Cuánto
// refleja se mide en pantalla (no en Node); aquí, que no se pierda el arreglo.
test('placa: las dos van casi sin el reflejo del cuarto', () => {
  for (const carroceria of CARROCERIAS) {
    const intensidades = [];
    construirCarroNuevo({ colorBase: ROJO, carroceria }).grupo.traverse((o) => {
      if (o.name === 'placa') intensidades.push(o.material.envMapIntensity);
    });
    assert.deepEqual(intensidades, [0.12, 0.12], carroceria);
  }
});

// El piso de carga de los de compuerta, por debajo de la bóveda de la rueda, se asomaba por el arco: una ceja gris
// sobre la llanta de atrás, de 49x6 px en un hatchback en Izquierdo.
test('zona de carga: el piso no se asoma por el arco de la rueda', () => {
  const casos = [{ carroceria: 'hatchback' }, { carroceria: 'suv' }, CHICO, ...MUESTRA.filter((e) => ['hatchback', 'suv'].includes(datosDeEntrada(e).carroceria)).slice(0, 12).map(datosDeEntrada)];
  for (const caso of casos) {
    const carro = construirCarroNuevo({ colorBase: ROJO, ...caso });
    const { ejeTras, radioRueda: R, arco: ra, adelantada } = carro.disposicion;
    if (adelantada) continue;
    const malla = carro.porId.get('vano-baul');
    const P = malla.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      if (Math.abs(P.getZ(i) - ejeTras) > ra) continue;
      assert.ok(P.getY(i) >= R + ra, `${caso.carroceria} ${caso.medidas?.largo ?? 'típico'}: el piso de carga va a y=${P.getY(i).toFixed(3)} y el arco llega a ${(R + ra).toFixed(3)}`);
    }
  }
});

// La tapa de la cabina adelantada. Era un capó de carro corrido a la cara: un trapecio con alas que subían hasta el
// parabrisas, y abierto se doblaba como una aleta, con el revés de los faros a la vista.
test('cabina adelantada: la tapa es un rectángulo en la cara, y se abre colgada de su borde de arriba', () => {
  for (const caso of [K01, N300]) {
    const nombre = caso.carroceria;
    const carro = construirCarroNuevo({ colorBase: ROJO, ...caso });
    comprobarContrato(carro, nombre);
    assert.ok(carro.disposicion.adelantada, `${nombre}: no salió de cabina adelantada`);
    const caja = new THREE.Box3().setFromObject(carro.porId.get('capo'));
    const t = caja.getSize(new THREE.Vector3());
    // Sin alas: no llega a los lados del carro (antes, ±0,64 m de ±0,84), y casi no tiene fondo: es la cara.
    assert.ok(caja.max.x < 0.6 * carro.disposicion.medio, `${nombre}: la tapa llega a x=${caja.max.x.toFixed(3)}`);
    assert.ok(t.z < 0.2, `${nombre}: la tapa tiene ${t.z.toFixed(3)} m de fondo`);
    // Lados derechos: el ancho arriba es el ancho abajo.
    const P = carro.porId.get('capo').geometry.attributes.position;
    const anchoEn = (y0, y1) => {
      let x = 0;
      for (let i = 0; i < P.count; i++) if (P.getY(i) >= y0 && P.getY(i) <= y1) x = Math.max(x, Math.abs(P.getX(i)));
      return x;
    };
    const arriba = anchoEn(caja.max.y - 0.06, caja.max.y);
    const abajo = anchoEn(caja.min.y, caja.min.y + 0.06);
    assert.ok(Math.abs(arriba - abajo) < 0.015, `${nombre}: ${arriba.toFixed(3)} arriba y ${abajo.toFixed(3)} abajo`);
    // Abre hacia afuera y hacia arriba, y la parte de arriba casi no se mueve: es la bisagra.
    const art = carro.articulaciones.get('capo');
    const borde = bordeLibre(art);
    assert.ok(Math.abs(borde.y - caja.min.y) < 0.05, `${nombre}: el borde libre no es el de abajo (${borde.y.toFixed(3)})`);
    art.fijar(art.max);
    carro.grupo.updateMatrixWorld(true);
    const abierta = bordeLibre(art);
    assert.ok(abierta.y > borde.y + 0.2 && abierta.z < borde.z - 0.2, `${nombre}: la tapa no sale hacia adelante y arriba`);
    const fuera = new THREE.Box3().setFromObject(carro.porId.get('capo'));
    // Ni se sube ni se despega de la cabina: arriba queda a pocos centímetros de donde estaba.
    assert.ok(Math.abs(fuera.max.y - caja.max.y) < 0.1, `${nombre}: el borde de arriba de la tapa se movió ${(fuera.max.y - caja.max.y).toFixed(3)} m`);
    assert.ok(fuera.min.z < caja.min.z - 0.2, `${nombre}: la tapa no sale`);
  }
});

test('cabina adelantada: la tapa y su parrilla marcan el capó, y lo de adentro solo se marca con ella abierta', () => {
  for (const caso of [K01, N300]) {
    const nombre = caso.carroceria;
    const carro = construirCarroNuevo({ colorBase: ROJO, ...caso });
    const d = carro.disposicion;
    carro.grupo.updateMatrixWorld(true);
    const frente = camaraDeVista('frente', d);
    const parrilla = [];
    carro.grupo.traverse((o) => {
      if (o.name === 'parrilla') parrilla.push(o);
    });
    assert.equal(parrilla.length, 1, `${nombre}: la parrilla es una sola malla`);
    const centro = (malla) => aPantalla(new THREE.Box3().setFromObject(malla).getCenter(new THREE.Vector3()), frente);
    const enParrilla = centro(parrilla[0]);
    assert.equal(tocar(carro, frente, enParrilla.x, enParrilla.y), 'capo', `${nombre}: un toque en la parrilla`);
    const tapa = new THREE.Box3().setFromObject(carro.porId.get('capo'));
    const bajo = aPantalla(new THREE.Vector3(0, tapa.min.y + 0.04, tapa.min.z), frente);
    assert.equal(tocar(carro, frente, bajo.x, bajo.y), 'capo', `${nombre}: un toque abajo de la tapa`);
    // Con la tapa abierta, lo que había detrás es el hueco.
    carro.articulaciones.get('capo').fijar(carro.articulaciones.get('capo').max);
    carro.grupo.updateMatrixWorld(true);
    assert.equal(tocar(carro, frente, bajo.x, bajo.y), 'vano-motor', `${nombre}: un toque en el hueco con la tapa abierta`);
    // Y el revés de la tapa se alcanza. Mira hacia abajo y hacia la cabina, así que solo desde una cámara baja y de lado.
    // Contra el centro de sus triángulos, no contra los vértices: de esta malla casi todos caen sobre el borde, y ahí el
    // canto de la tapa los tapa.
    const azar = azarCon(77);
    const camaras = camarasAlrededor(carro);
    const reves = carro.porId.get('capo-int');
    const I = reves.geometry.index.array;
    const P = reves.geometry.attributes.position;
    let alcanzado = false;
    for (let k = 0; k < I.length && !alcanzado; k += 3) {
      const centroT = new THREE.Vector3();
      for (let q = 0; q < 3; q++) centroT.add(new THREE.Vector3().fromBufferAttribute(P, I[k + q]));
      centroT.divideScalar(3).applyMatrix4(reves.matrixWorld);
      for (const camara of camaras) {
        const { x, y } = aPantalla(centroT, camara);
        if (tocar(carro, camara, x, y) === 'capo-int') {
          alcanzado = true;
          break;
        }
      }
    }
    assert.ok(alcanzado, `${nombre}: el revés de la tapa no se puede marcar`);
    assert.ok(seAlcanza(carro, 'vano-motor', camaras, azar), `${nombre}: el hueco de la tapa no se puede marcar`);
    carro.articulaciones.get('capo').fijar(0);
    carro.grupo.updateMatrixWorld(true);
    assert.equal(tocar(carro, frente, bajo.x, bajo.y), 'capo', `${nombre}: al cerrar, el toque vuelve a la tapa`);
    barrerCerrado(carro, nombre, ['frente', 'inicio', 'arriba'], { enJunta: 30, sueltos: 30, azar });
  }
});

// ---------- El toque ----------

const ANCHO = 360;
const ALTO = 420;

// La cámara de un botón de la app: lo mismo que posicionDeVista en js/visor.js.
function camaraDeVista(nombre, disposicion) {
  const mira = new THREE.Vector3(0, disposicion.alto * ALTURA_DE_LA_MIRA, 0);
  const direccion = new THREE.Vector3(...VISTAS[nombre]).sub(mira).normalize();
  const distancia = distanciaQueEncuadra({ direccion, medidas: disposicion, mira, fov: LENTE, aspecto: ANCHO / ALTO });
  return camaraEn(mira.clone().addScaledVector(direccion, distancia), mira);
}

function camaraEn(posicion, mira) {
  const camara = new THREE.PerspectiveCamera(LENTE, ANCHO / ALTO, 0.1, 400);
  camara.position.copy(posicion);
  camara.lookAt(mira);
  camara.updateMatrixWorld(true);
  return camara;
}

function aPantalla(punto, camara) {
  const p = punto.clone().project(camara);
  return { x: ((p.x + 1) / 2) * ANCHO, y: ((1 - p.y) / 2) * ALTO };
}

function tocar(carro, camara, x, y) {
  return piezaTocada({ camara, grupo: carro.grupo, x, y, ancho: ANCHO, alto: ALTO });
}

// Azar con semilla: si una prueba falla, tiene que fallar igual la próxima vez.
function azarCon(semilla) {
  let s = semilla;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Los puntos sobre las juntas: las aristas de cada lata que solo tienen un triángulo. Un dedo al azar cruza una junta
// cerca de una de cada 120 veces; apuntando aquí, el defecto se ve con pocos rayos.
function juntasDeLaLata(carro) {
  const puntos = [];
  carro.grupo.updateMatrixWorld(true);
  for (const m of mallas(carro.grupo)) {
    const id = m.userData.piezaId;
    if (!id || esInterior(id) || id.startsWith('espejo')) continue;
    const I = m.geometry.index.array;
    const P = m.geometry.attributes.position;
    const usos = new Map();
    const clave = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    for (let t = 0; t < I.length; t += 3) {
      for (const [a, b] of [
        [I[t], I[t + 1]],
        [I[t + 1], I[t + 2]],
        [I[t + 2], I[t]],
      ]) {
        const k = clave(a, b);
        usos.set(k, (usos.get(k) || 0) + 1);
      }
    }
    for (const [k, n] of usos) {
      if (n !== 1) continue;
      const a = new THREE.Vector3().fromBufferAttribute(P, Math.floor(k / 1e6));
      const b = new THREE.Vector3().fromBufferAttribute(P, k % 1e6);
      puntos.push({ id, punto: a.add(b).multiplyScalar(0.5).applyMatrix4(m.matrixWorld) });
    }
  }
  return puntos;
}

// El platón de una pick-up está a la vista: su piso y el revés de la compuerta se ven sin abrir nada.
function seVeSinAbrir(carro, id) {
  return carro.disposicion.tipo === 'camioneta' && (id === 'vano-baul' || id === 'baul-int');
}

// Toques apuntados a las juntas y toques sueltos: ninguno puede marcar algo que no se ve. Devuelve cuántos cayeron
// sobre una pieza: si son pocos, la prueba no estaría probando nada.
function barrerCerrado(carro, nombre, vistas, { enJunta, sueltos, azar }) {
  const juntas = juntasDeLaLata(carro);
  let sobrePieza = 0;
  const comprobar = (camara, x, y, vista) => {
    const id = tocar(carro, camara, x, y);
    if (!id) return;
    sobrePieza++;
    assert.ok(!esInterior(id) || seVeSinAbrir(carro, id), `${nombre}, ${vista}: un toque en (${x.toFixed(2)}, ${y.toFixed(2)}) marca ${id} con el carro cerrado`);
  };
  for (const vista of vistas) {
    const camara = camaraDeVista(vista, carro.disposicion);
    for (let i = 0; i < enJunta; i++) {
      const { x, y } = aPantalla(juntas[Math.floor(azar() * juntas.length)].punto, camara);
      for (const [dx, dy] of [
        [0.25, 0],
        [-0.25, 0],
        [0, 0.25],
        [0, -0.25],
      ]) {
        comprobar(camara, x + dx, y + dy, vista);
      }
    }
    for (let i = 0; i < sueltos; i++) comprobar(camara, ANCHO * (0.04 + 0.92 * azar()), ALTO * (0.15 + 0.7 * azar()), vista);
  }
  return sobrePieza;
}

// Antes de arreglarlo: apuntando a las juntas, del 3 al 6 % de los toques marcaban vano-motor, un marco o la cara de
// adentro de la puerta del otro lado, con el carro cerrado; al azar sobre el carro, del 0,6 al 1,1 %. El carro de hoy
// da 0,3 a 0,6 % al azar. Una pieza de más en la orden son 90.000 pesos.
test('toque: con el carro cerrado, ningún toque marca lo de adentro, en ninguno de los botones', () => {
  const azar = azarCon(4242);
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria });
    const sobrePieza = barrerCerrado(carro, carroceria, Object.keys(VISTAS), { enJunta: 45, sueltos: 40, azar });
    assert.ok(sobrePieza > 400, `${carroceria}: solo ${sobrePieza} toques cayeron sobre una pieza`);
  }
});

test('toque: con el carro cerrado tampoco en los extremos del catálogo', () => {
  const azar = azarCon(99);
  const lineas = [...MUESTRA.filter((_, i) => i % 5 === 0), MUESTRA[59]];
  for (const e of lineas) barrerCerrado(armarLinea(e), nombreDe(e), ['inicio', 'atras', 'arriba'], { enJunta: 8, sueltos: 6, azar });
  for (const caso of [CHICO, GRANDE]) barrerCerrado(construirCarroNuevo({ colorBase: ROJO, ...caso }), caso.carroceria, ['inicio', 'atras', 'arriba'], { enJunta: 8, sueltos: 6, azar });
});

// Un dedo mide 40 px y la junta 1: un toque ahí tiene que marcar una de las dos piezas, no quedarse callado.
test('toque: justo sobre una junta entre dos latas se marca una de las dos', () => {
  const carro = construirCarroNuevo({ colorBase: ROJO, carroceria: 'sedan' });
  const camara = camaraDeVista('izquierdo', carro.disposicion);
  const d = carro.disposicion;
  // A media puerta: ni contra el vidrio de arriba ni contra el estribo de abajo.
  const juntas = juntasDeLaLata(carro).filter((q) => q.id === 'puerta-del-izq' && q.punto.y > d.estriboAlto + 0.15 && q.punto.y < d.cintura - 0.08 && q.punto.x < -0.8);
  assert.ok(juntas.length > 20, `solo ${juntas.length} puntos de junta`);
  const vecinas = new Set(['guardafango-del-izq', 'puerta-del-izq', 'puerta-tras-izq']);
  const azar = azarCon(7);
  for (let i = 0; i < 40; i++) {
    const { x, y } = aPantalla(juntas[Math.floor(azar() * juntas.length)].punto, camara);
    for (const dx of [-0.3, -0.1, 0.1, 0.3]) {
      const id = tocar(carro, camara, x + dx, y);
      assert.ok(vecinas.has(id), `un toque sobre la junta (${(x + dx).toFixed(2)}, ${y.toFixed(2)}) dio ${id}`);
    }
  }
});

// Lo que sigue tiene que seguir sirviendo: si el arreglo de arriba se pasa, ya nadie podría marcar lo de adentro.
// Una cámara de las que deja la app (de 8 a 45 grados sobre el piso, por todos los lados), contra puntos de la pieza.
function camarasAlrededor(carro) {
  const mira = new THREE.Vector3(0, carro.disposicion.alto * ALTURA_DE_LA_MIRA, 0);
  const camaras = [];
  for (const altura of [8, 25, 45]) {
    for (let g = 0; g < 16; g++) {
      const a = (g / 16) * Math.PI * 2;
      const e = THREE.MathUtils.degToRad(altura);
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      camaras.push(camaraEn(mira.clone().addScaledVector(dir, 7.5), mira));
    }
  }
  return camaras;
}

// ¿Desde alguna cámara se puede marcar esta pieza, con un toque de verdad?
function seAlcanza(carro, id, camaras, azar) {
  const malla = carro.porId.get(id);
  const P = malla.geometry.attributes.position;
  malla.updateWorldMatrix(true, false);
  for (let i = 0; i < 12; i++) {
    const punto = new THREE.Vector3().fromBufferAttribute(P, Math.floor(azar() * P.count)).applyMatrix4(malla.matrixWorld);
    for (const camara of camaras) {
      const { x, y } = aPantalla(punto, camara);
      if (x < 0 || y < 0 || x > ANCHO || y > ALTO) continue;
      if (tocar(carro, camara, x, y) === id) return true;
    }
  }
  return false;
}

test('toque: las 17 de afuera se marcan con el carro cerrado, y las 12 de adentro con todo abierto', () => {
  const azar = azarCon(31);
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria });
    const camaras = camarasAlrededor(carro);
    for (const id of PIEZAS_DE_AFUERA) assert.ok(seAlcanza(carro, id, camaras, azar), `${carroceria}: ${id} no se puede marcar con el carro cerrado`);
    for (const art of carro.articulaciones.values()) art.fijar(art.max);
    carro.grupo.updateMatrixWorld(true);
    for (const id of PIEZAS_DE_ADENTRO) assert.ok(seAlcanza(carro, id, camaras, azar), `${carroceria}: ${id} no se puede marcar ni con todo abierto`);
  }
});

// Un punto de la pieza, y una cámara enfrente, con el rayo recto contra ella.
function rayoContra(malla) {
  const g = malla.geometry;
  const a = new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.array[0]);
  const b = new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.array[1]);
  const c = new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.array[2]);
  const centro = a.clone().add(b).add(c).divideScalar(3).applyMatrix4(malla.matrixWorld);
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize().transformDirection(malla.matrixWorld);
  return new THREE.Raycaster(centro.clone().addScaledVector(normal, 0.5), normal.clone().negate());
}

test('toque: cada bisagra enciende solo lo suyo, y al cerrarla se vuelve a apagar', () => {
  // De qué bisagra depende que cada pieza de adentro se pueda tocar.
  const dependeDe = (id, carroceria) => {
    if (id === 'capo-int' || id === 'vano-motor') return ['capo'];
    if (id === 'baul-int' || id === 'vano-baul') return carroceria === 'camioneta' ? null : ['baul'];
    if (id.endsWith('-int')) return [id.slice(0, -4)];
    const lado = id.slice(-3);
    return ['puerta-del-' + lado, 'puerta-tras-' + lado];
  };
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria });
    carro.grupo.updateMatrixWorld(true);
    const responde = (id) => {
      const malla = carro.porId.get(id);
      carro.grupo.updateMatrixWorld(true);
      return rayoContra(malla).intersectObject(malla, false).length > 0;
    };
    for (const id of PIEZAS_DE_ADENTRO) {
      const bisagras = dependeDe(id, carroceria);
      if (!bisagras) {
        assert.ok(responde(id), `${carroceria}: el platón se ve siempre, y ${id} no responde`);
        continue;
      }
      assert.ok(!responde(id), `${carroceria}: ${id} responde con todo cerrado`);
      for (const bisagra of bisagras) {
        const art = carro.articulaciones.get(bisagra);
        art.fijar(art.max);
        assert.ok(responde(id), `${carroceria}: ${id} no responde con ${bisagra} abierta`);
        art.fijar(0);
        assert.ok(!responde(id), `${carroceria}: ${id} sigue respondiendo con ${bisagra} cerrada`);
      }
      // Y lo de las otras bisagras no la enciende. Una puerta apenas entreabierta, tampoco.
      for (const [otra, art] of carro.articulaciones) {
        if (bisagras.includes(otra)) continue;
        art.fijar(art.max);
        assert.ok(!responde(id), `${carroceria}: ${id} responde con ${otra} abierta, que no es la suya`);
        art.fijar(0);
      }
      const suya = carro.articulaciones.get(bisagras[0]);
      suya.fijar(0.01);
      assert.ok(!responde(id), `${carroceria}: ${id} responde con ${bisagras[0]} entreabierta 0,01 rad`);
      suya.fijar(0);
    }
  }
});

// Lo mismo que pruebas/toque.test.js le pide al carro de hoy: las piezas delgadas se alcanzan con un dedo gordo.
test('toque: el dedo gordo sigue alcanzando el estribo y el espejo, sin robarle la puerta a quien toca la puerta', () => {
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarroNuevo({ colorBase: ROJO, carroceria });
    const centroDe = (id, camara) => aPantalla(new THREE.Box3().setFromObject(carro.porId.get(id)).getCenter(new THREE.Vector3()), camara);
    const lado = camaraDeVista('izquierdo', carro.disposicion);
    const estribo = centroDe('estribo-izq', lado);
    assert.equal(tocar(carro, lado, estribo.x, estribo.y), 'estribo-izq', `${carroceria}: centro del estribo`);
    assert.equal(tocar(carro, lado, estribo.x, estribo.y - 9), 'estribo-izq', `${carroceria}: 9 px arriba del estribo`);
    for (const id of ['puerta-del-izq', 'puerta-tras-izq']) {
      const puerta = centroDe(id, lado);
      assert.equal(tocar(carro, lado, puerta.x, puerta.y), id, `${carroceria}: centro de ${id}`);
    }
    const inicio = camaraDeVista('inicio', carro.disposicion);
    const espejo = centroDe('espejo-izq', inicio);
    assert.equal(tocar(carro, inicio, espejo.x, espejo.y), 'espejo-izq', `${carroceria}: centro del espejo`);
    assert.equal(tocar(carro, inicio, espejo.x + 9, espejo.y), 'espejo-izq', `${carroceria}: 9 px al lado del espejo`);
    assert.equal(tocar(carro, inicio, 6, 6), null, `${carroceria}: el fondo no marca nada`);
  }
});
