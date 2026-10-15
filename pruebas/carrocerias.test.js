// Las cuatro carrocerías se construyen en Node sin navegador: cada una con
// las 17 piezas del catálogo, del tamaño que dicen sus medidas, simétrica,
// y con la forma que la distingue (el hatchback sin baúl, la camioneta con
// el techo delante del eje trasero y el platón atrás).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PIEZAS } from '../js/piezas.js';
import { construirCarro, disposicion } from '../js/carro.js';
import {
  CARROCERIAS,
  medidasParaDibujar,
  nombreDePiezaEn,
  normalizarCarroceria,
  piezasDe,
} from '../js/carrocerias.js';

function caja(objeto) {
  objeto.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(objeto);
}

function medida(objeto) {
  return caja(objeto).getSize(new THREE.Vector3());
}

const TIPOS = ['sedan', 'hatchback', 'suv', 'camioneta'];

test('normalizarCarroceria reduce todo a las cuatro que se dibujan', () => {
  assert.equal(normalizarCarroceria('Sedán'), 'sedan');
  assert.equal(normalizarCarroceria('HATCHBACK'), 'hatchback');
  assert.equal(normalizarCarroceria('van'), 'suv');
  assert.equal(normalizarCarroceria('pick-up'), 'camioneta');
  assert.equal(normalizarCarroceria('coupe'), 'sedan');
  assert.equal(normalizarCarroceria(undefined), 'sedan');
  assert.equal(normalizarCarroceria('nave espacial'), 'sedan');
});

test('medidasParaDibujar acepta milímetros, descarta disparates y recorta la distancia entre ejes', () => {
  const logan = medidasParaDibujar('sedan', { largo: 4350, ancho: 1733, alto: 1517, entreEjes: 2634 });
  assert.deepEqual(logan, { largo: 4.35, ancho: 1.733, alto: 1.517, entreEjes: 2.634 });
  const tipicas = CARROCERIAS.suv.medidas;
  assert.deepEqual(medidasParaDibujar('suv'), tipicas);
  assert.deepEqual(medidasParaDibujar('suv', { largo: null, ancho: 'x', alto: 43, entreEjes: 0 }), tipicas);
  // Una distancia entre ejes casi igual al largo dejaría el carro sin bómperes.
  assert.equal(medidasParaDibujar('hatchback', { largo: 3.6, entreEjes: 3.4 }).entreEjes, 2.6);
});

test('cada carrocería tiene las 17 piezas del catálogo, y ninguna más', () => {
  for (const tipo of TIPOS) {
    const carro = construirCarro({ carroceria: tipo });
    assert.deepEqual([...carro.porId.keys()].sort(), PIEZAS.map((p) => p.id).sort(), tipo);
    assert.equal(carro.disposicion.tipo, tipo);
  }
});

test('cada carrocería mide lo que dicen sus medidas típicas', () => {
  for (const tipo of TIPOS) {
    const m = CARROCERIAS[tipo].medidas;
    const tamano = medida(construirCarro({ carroceria: tipo }).grupo);
    assert.ok(Math.abs(tamano.z - m.largo) < 0.1, tipo + ' largo ' + tamano.z.toFixed(2) + ' vs ' + m.largo);
    assert.ok(Math.abs(tamano.y - m.alto) < 0.06, tipo + ' alto ' + tamano.y.toFixed(2) + ' vs ' + m.alto);
    assert.ok(tamano.x > m.ancho && tamano.x < m.ancho + 0.4, tipo + ' ancho con espejos ' + tamano.x.toFixed(2));
  }
});

test('las medidas de la línea estiran el carro: un Logan sale más corto y más angosto que el sedán típico', () => {
  const logan = medida(construirCarro({ carroceria: 'sedan', medidas: { largo: 4350, ancho: 1733, alto: 1517, entreEjes: 2634 } }).grupo);
  const tipico = medida(construirCarro().grupo);
  assert.ok(Math.abs(logan.z - 4.35) < 0.1, 'largo ' + logan.z.toFixed(2));
  assert.ok(logan.z < tipico.z && logan.x < tipico.x && logan.y > tipico.y);
  const hilux = construirCarro({ carroceria: 'camioneta', medidas: { largo: 5330, ancho: 1855, alto: 1815, entreEjes: 3085 } });
  const d = hilux.disposicion;
  assert.ok(Math.abs(d.ejeTras - d.ejeDel - 3.085) < 1e-9, 'entre ejes');
  assert.ok(medida(hilux.grupo).z > 5.2);
});

test('las piezas izquierdas y derechas son espejo exacto en todas las carrocerías', () => {
  for (const tipo of TIPOS) {
    const carro = construirCarro({ carroceria: tipo });
    for (const p of PIEZAS.filter((x) => x.lado === 'izq')) {
      const izq = caja(carro.porId.get(p.id));
      const der = caja(carro.porId.get(p.id.replace('-izq', '-der')));
      assert.ok(Math.abs(izq.min.x + der.max.x) < 1e-6, tipo + ' ' + p.id + ' x');
      assert.ok(Math.abs(izq.min.z - der.min.z) < 1e-6 && Math.abs(izq.max.y - der.max.y) < 1e-6, tipo + ' ' + p.id);
    }
  }
});

test('el hatchback y la SUV no tienen baúl: la pieza trasera es una compuerta casi vertical pegada a la cola', () => {
  for (const tipo of ['hatchback', 'suv']) {
    const carro = construirCarro({ carroceria: tipo });
    const d = carro.disposicion;
    const compuerta = caja(carro.porId.get('baul'));
    const techo = caja(carro.porId.get('techo'));
    assert.ok(compuerta.max.z > d.cola - 0.3, tipo + ': la compuerta está en la cola');
    assert.ok(compuerta.max.y - compuerta.min.y > 0.3, tipo + ': la compuerta es alta, no una tapa');
    assert.ok(compuerta.max.z - compuerta.min.z < 0.2, tipo + ': la compuerta es delgada a lo largo');
    assert.ok(techo.max.z > d.cola - 0.6, tipo + ': el techo llega casi hasta la cola');
    assert.equal(nombreDePiezaEn(tipo, 'baul'), 'Compuerta trasera');
  }
  const sedan = construirCarro();
  const baul = caja(sedan.porId.get('baul'));
  assert.ok(baul.max.z - baul.min.z > 0.2 && baul.max.y - baul.min.y < 0.25, 'el baúl del sedán es una tapa horizontal');
});

test('la camioneta lleva la cabina delante del eje trasero y el platón detrás', () => {
  const carro = construirCarro({ carroceria: 'camioneta' });
  const d = carro.disposicion;
  const techo = caja(carro.porId.get('techo'));
  const costado = caja(carro.porId.get('costado-izq'));
  const compuerta = caja(carro.porId.get('baul'));
  const puertaTras = caja(carro.porId.get('puerta-tras-izq'));
  assert.ok(techo.max.z < d.ejeTras, 'el techo termina antes del eje trasero');
  assert.ok(costado.min.z > puertaTras.max.z + 0.1, 'el costado del platón arranca detrás de la puerta trasera');
  assert.ok(costado.max.z < compuerta.min.z + 0.05, 'el costado termina donde empieza la compuerta');
  assert.ok(compuerta.max.y - compuerta.min.y > 0.4, 'la compuerta del platón es alta');
  assert.equal(nombreDePiezaEn('camioneta', 'baul'), 'Compuerta del platón');
  assert.equal(nombreDePiezaEn('camioneta', 'costado-der'), 'Costado del platón derecho');
  assert.equal(nombreDePiezaEn('camioneta', 'capo'), 'Capó');
  // Más alta y con más aire bajo la chapa que un sedán.
  assert.ok(d.piso > 0.4 && d.radioRueda > 0.35);
});

test('el carro acepta el número de la placa y en Node (sin canvas) la deja amarilla lisa', () => {
  for (const tipo of TIPOS) {
    const carro = construirCarro({ carroceria: tipo, placa: 'JRX 248' });
    const placas = [];
    carro.grupo.traverse((o) => {
      if (o.name === 'placa') placas.push(o);
    });
    assert.equal(placas.length, 2, tipo + ': una placa adelante y otra atrás');
    for (const p of placas) assert.ok(!Array.isArray(p.material), 'sin canvas no hay textura');
  }
});

test('los adornos no se pintan ni se tocan: están marcados como decorativos', () => {
  const carro = construirCarro({ carroceria: 'suv' });
  let decorativos = 0;
  carro.grupo.traverse((o) => {
    if (o.userData.decorativo) {
      decorativos += 1;
      assert.ok(!o.userData.piezaId, 'un adorno no es pieza');
    }
  });
  // Molduras, manijas, pasarruedas, faldones, barras, alerón, barra cromada, exploradores.
  assert.ok(decorativos >= 14, 'adornos: ' + decorativos);
  for (const malla of carro.seleccionables) assert.ok(!malla.userData.decorativo, malla.name);
});

test('la SUV es más alta que el hatchback con el mismo dibujo', () => {
  const suv = disposicion('suv');
  const hatch = disposicion('hatchback');
  assert.ok(suv.piso > hatch.piso && suv.cintura > hatch.cintura && suv.techo > hatch.techo && suv.radioRueda > hatch.radioRueda);
});

test('piezasDe devuelve las 17 piezas en el orden del catálogo con los nombres de la carrocería', () => {
  const lista = piezasDe('camioneta');
  assert.equal(lista.length, 17);
  assert.deepEqual(
    lista.map((p) => p.id),
    PIEZAS.map((p) => p.id),
  );
  assert.equal(lista.find((p) => p.id === 'baul').nombre, 'Compuerta del platón');
  assert.equal(piezasDe('sedan').find((p) => p.id === 'baul').nombre, 'Baúl');
});

test('ninguna pieza queda por debajo del eje de las ruedas ni flotando sobre el techo', () => {
  for (const tipo of TIPOS) {
    const carro = construirCarro({ carroceria: tipo });
    const d = carro.disposicion;
    // Los guardafangos y costados bajan hasta la altura del eje (la llanta
    // asoma por debajo); el bómper de la camioneta cuelga 6 cm bajo la chapa.
    const suelo = Math.min(d.radioRueda, d.piso - 0.06) - 0.02;
    for (const malla of carro.seleccionables) {
      const b = caja(malla);
      assert.ok(b.min.y >= suelo, tipo + ' ' + malla.name + ' baja a ' + b.min.y.toFixed(2));
      // El techo va abombado 3 cm en el centro, más su grosor y su bisel.
      assert.ok(b.max.y <= d.techo + 0.13, tipo + ' ' + malla.name + ' sube a ' + b.max.y.toFixed(2));
    }
  }
});
