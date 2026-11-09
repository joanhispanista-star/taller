// Lo que el catálogo dice tiene que llegar entero a la pantalla y al 3D. Dos maneras en que se perdía (revisión del
// 5 y 6 de noviembre, comprobadas el 9):
// - El campo Línea de "Datos del carro" (index.html) cortaba a 40 letras, y 53 líneas miden más ("Mitsubishi Montero
//   clásico Wagon 5 puertas (1a gen)"): elegida de la lista, quedaba cortada y ya no casaba con el catálogo, así que el
//   carro no tomaba ni su carrocería ni sus medidas.
// - `medidasParaDibujar` mandaba a las medidas típicas la Super Carry y el Daihatsu Move, de 1.395 mm de ancho, por
//   debajo del tope de 1,40: salían 40 cm más anchos. Las cinco vans grandes y el Twizy siguen yendo a las típicas a
//   propósito (abajo, NO_SE_DIBUJA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CATALOGO } from '../js/catalogo-carros.js';
import { nombreDeLinea } from '../js/catalogo.js';
import { RANGO_PARA_DIBUJAR, medidasParaDibujar, normalizarCarroceria } from '../js/carrocerias.js';
import { construirCarro } from '../js/carro.js';
import { PIEZAS } from '../js/piezas.js';

const PAGINAS = ['index.html', 'garaje.html'];
const leer = (pagina) => fs.readFileSync(new URL('../' + pagina, import.meta.url), 'utf8');

// Los <input> de una página, con sus atributos (id, list, maxlength).
function camposDe(pagina) {
  return [...leer(pagina).matchAll(/<input\b[^>]*>/g)].map(([etiqueta]) => {
    const atributos = {};
    for (const [, nombre, valor] of etiqueta.matchAll(/([\w-]+)="([^"]*)"/g)) atributos[nombre] = valor;
    return atributos;
  });
}

const masLarga = (textos) => textos.reduce((a, b) => (b.length > a.length ? b : a), '');

test('cada línea del catálogo cabe entera en todo campo que la ofrece', () => {
  const nombre = masLarga(CATALOGO.map(nombreDeLinea));
  let campos = 0;
  for (const pagina of PAGINAS) {
    for (const campo of camposDe(pagina).filter((c) => c.list === 'lineas-catalogo')) {
      campos++;
      if (!campo.maxlength) continue;
      const cortadas = CATALOGO.filter((e) => nombreDeLinea(e).length > Number(campo.maxlength)).length;
      assert.equal(cortadas, 0, `${pagina} #${campo.id} corta a ${campo.maxlength} letras: ${cortadas} líneas no caben, la más larga "${nombre}" (${nombre.length})`);
    }
  }
  // Datos del carro y el Garaje (por placa y con foto): si un campo deja de ofrecer la lista, esta prueba ya no lo mira.
  assert.equal(campos, 3, 'los campos con la lista de líneas cambiaron');
});

test('la marca y la línea sueltas caben en Datos del carro, que es donde quedan al casar con el catálogo', () => {
  const campos = Object.fromEntries(camposDe('index.html').map((c) => [c.id, c]));
  for (const [id, textos] of [['datos-marca', CATALOGO.map((e) => e.marca)], ['datos-linea', CATALOGO.map((e) => e.linea)]]) {
    const largo = masLarga(textos);
    assert.ok(!campos[id].maxlength || largo.length <= Number(campos[id].maxlength), `#${id} corta a ${campos[id].maxlength}: "${largo}" mide ${largo.length}`);
  }
});

// Las que siguen saliendo con las típicas, a propósito (ver RANGO_PARA_DIBUJAR en js/carrocerias.js). Las cinco vans
// grandes: la SUV estirada a su alto (2,5 a 2,73 m) sale con el capó en rampa y los espejos flotando, peor que la SUV
// típica; les falta una carrocería de van. El Twizy, un cuatriciclo de 2,34 m: el sedán tan corto tendría puertas de
// 16 cm. Si alguien agrega otra línea que no se pueda dibujar, esta prueba lo dice.
const NO_SE_DIBUJA = new Set([
  'Mercedes-Benz Sprinter (1ª gen, W901-905)',
  'Mercedes-Benz Sprinter (W906)',
  'Mercedes-Benz Sprinter (W907)',
  'Renault Master',
  'Fiat Ducato (3ª gen)',
  'Renault Twizy',
]);

test('cada medida confirmada del catálogo se dibuja tal cual', () => {
  const cambiadas = [];
  for (const e of CATALOGO) {
    if (NO_SE_DIBUJA.has(nombreDeLinea(e))) continue;
    const dibujo = medidasParaDibujar(normalizarCarroceria(e.carroceria), e);
    for (const campo of ['largo', 'ancho', 'alto']) {
      if (e[campo] && Math.abs(dibujo[campo] - e[campo] / 1000) > 1e-9) cambiadas.push(`${nombreDeLinea(e)}: ${campo} ${e[campo]} → ${dibujo[campo]}`);
    }
    // La distancia entre ejes solo puede bajar, y solo cuando no le cabrían los bómperes (medidasParaDibujar la recorta a largo - 1 m).
    if (e.entreEjes) {
      const tope = Math.min(e.entreEjes / 1000, dibujo.largo - 1.0);
      if (Math.abs(dibujo.entreEjes - tope) > 1e-9) cambiadas.push(`${nombreDeLinea(e)}: entreEjes ${e.entreEjes} → ${dibujo.entreEjes}`);
    }
  }
  assert.deepEqual(cambiadas, []);
});

test('un número de tecleo sigue cayendo a las medidas típicas', () => {
  const tipicas = medidasParaDibujar('suv');
  assert.deepEqual(medidasParaDibujar('suv', { largo: 43000, ancho: 18, alto: 0.9, entreEjes: 27000 }), tipicas);
  for (const [campo, [min, max]] of Object.entries(RANGO_PARA_DIBUJAR)) {
    assert.equal(medidasParaDibujar('suv', { [campo]: min - 0.01 })[campo], tipicas[campo], `${campo} bajo el tope`);
    assert.equal(medidasParaDibujar('suv', { [campo]: max + 0.01 })[campo], tipicas[campo], `${campo} sobre el tope`);
  }
});

// El carro de hoy en las esquinas de lo que se acepta: cada pieza existe, nada sale con números rotos y la lata mide lo
// pedido. (El carro nuevo, js/generico, lo prueba generico.test.js con los mismos topes.)
test('el carro arma entero en los extremos de lo que se acepta dibujar', () => {
  const { largo, ancho, alto, entreEjes } = RANGO_PARA_DIBUJAR;
  const esquinas = [
    { largo: largo[0], ancho: ancho[0], alto: alto[0], entreEjes: entreEjes[0] },
    { largo: largo[1], ancho: ancho[1], alto: alto[1], entreEjes: entreEjes[1] },
    { largo: largo[1], ancho: ancho[0], alto: alto[1], entreEjes: entreEjes[1] },
  ];
  for (const carroceria of ['sedan', 'hatchback', 'suv', 'camioneta']) {
    for (const medidas of esquinas) {
      const nombre = `${carroceria} ${JSON.stringify(medidas)}`;
      const carro = construirCarro({ carroceria, medidas });
      for (const p of PIEZAS) assert.ok(carro.porId.has(p.id), `${nombre}: falta ${p.id}`);
      carro.grupo.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) assert.fail(`${nombre}: ${o.name || 'una malla'} con un número roto`);
      });
      // La lata sin los espejos: el ancho del catálogo es el de la chapa.
      const caja = new THREE.Box3();
      for (const m of carro.seleccionables) if (!m.userData.piezaId.startsWith('espejo')) caja.expandByObject(m);
      const pedidas = medidasParaDibujar(carroceria, medidas);
      assert.ok(Math.abs(caja.max.z - caja.min.z - pedidas.largo) < 0.08, `${nombre}: largo ${(caja.max.z - caja.min.z).toFixed(3)}`);
      assert.ok(Math.abs(caja.max.x - caja.min.x - pedidas.ancho) < 0.08, `${nombre}: ancho ${(caja.max.x - caja.min.x).toFixed(3)}`);
    }
  }
});
