// El carro se construye en Node sin navegador: aquí se comprueba que sale
// con las piezas del catálogo, con medidas de carro y simétrico. Si alguien
// mueve un borde y una puerta queda del otro lado, esta prueba lo dice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PIEZAS } from '../js/piezas.js';
import { construirCarro, resaltar } from '../js/carro.js';

function caja(objeto) {
  return new THREE.Box3().setFromObject(objeto);
}

test('cada pieza del catálogo existe en el carro, y ninguna más', () => {
  const carro = construirCarro();
  assert.deepEqual(
    [...carro.porId.keys()].sort(),
    PIEZAS.map((p) => p.id).sort(),
  );
  assert.equal(carro.seleccionables.length, PIEZAS.length);
  for (const malla of carro.seleccionables) {
    assert.equal(malla.userData.piezaId, malla.name);
    assert.ok(carro.grupo.children.includes(malla), malla.name + ' no cuelga del carro');
  }
});

test('el carro mide como un sedán compacto', () => {
  const medida = caja(construirCarro().grupo).getSize(new THREE.Vector3());
  assert.ok(medida.z > 4.4 && medida.z < 4.6, 'largo ' + medida.z.toFixed(2));
  assert.ok(medida.x > 1.84 && medida.x < 2.2, 'ancho con espejos ' + medida.x.toFixed(2));
  assert.ok(medida.y > 1.4 && medida.y < 1.55, 'alto ' + medida.y.toFixed(2));
});

test('las piezas izquierdas y derechas son espejo exacto', () => {
  const carro = construirCarro();
  for (const pieza of PIEZAS.filter((p) => p.lado === 'izq')) {
    const izq = caja(carro.porId.get(pieza.id));
    const der = caja(carro.porId.get(pieza.id.replace('-izq', '-der')));
    const cIzq = izq.getCenter(new THREE.Vector3());
    const cDer = der.getCenter(new THREE.Vector3());
    assert.ok(cIzq.x < 0 && cDer.x > 0, pieza.id + ' no está en su lado');
    assert.ok(Math.abs(cIzq.x + cDer.x) < 1e-6, pieza.id + ' no es simétrica en X');
    assert.ok(Math.abs(cIzq.y - cDer.y) < 1e-6 && Math.abs(cIzq.z - cDer.z) < 1e-6, pieza.id);
  }
});

test('las piezas están donde dice su nombre', () => {
  const carro = construirCarro();
  const centro = (id) => caja(carro.porId.get(id)).getCenter(new THREE.Vector3());
  // El carro mira hacia -Z: lo delantero tiene Z negativa.
  assert.ok(centro('bomper-del').z < centro('capo').z, 'bómper delante del capó');
  assert.ok(centro('capo').z < centro('techo').z, 'capó delante del techo');
  assert.ok(centro('techo').z < centro('baul').z, 'techo delante del baúl');
  assert.ok(centro('baul').z < centro('bomper-tras').z, 'baúl delante del bómper trasero');
  assert.ok(centro('puerta-del-izq').z < centro('puerta-tras-izq').z, 'puerta delantera delante de la trasera');
  assert.ok(centro('techo').y > centro('capo').y, 'el techo es lo más alto');
  assert.ok(centro('estribo-der').y < centro('puerta-del-der').y, 'el estribo va debajo de la puerta');
});

test('cada pieza tiene su propio material, y resaltar solo cambia esa pieza', () => {
  const carro = construirCarro({ colorBase: 0xcfd4da });
  const materiales = new Set(carro.seleccionables.map((m) => m.material));
  assert.equal(materiales.size, carro.seleccionables.length);

  const capo = carro.porId.get('capo');
  const techo = carro.porId.get('techo');
  const antes = capo.material.color.getHex();
  resaltar(capo, 0xff7a1a);
  assert.notEqual(capo.material.color.getHex(), antes, 'el capó cambió de tono');
  assert.equal(techo.material.color.getHex(), antes, 'el techo sigue igual');
  assert.ok(capo.material.emissiveIntensity > 0);
  resaltar(capo, null);
  assert.equal(capo.material.color.getHex(), antes, 'al quitar la marca vuelve el color');
  assert.equal(capo.material.emissive.getHex(), 0);
});
