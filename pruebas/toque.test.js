// El toque con la cámara y el carro reales, en el tamaño de un celular:
// un dedo gordo tiene que poder marcar el estribo y el espejo, que en
// pantalla miden 14 px, sin que eso le robe la puerta a quien toca la puerta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { piezaTocada } from '../js/toque.js';

const ANCHO = 360;
const ALTO = 420;

function escenaDeCelular(posicionCamara) {
  const carro = construirCarro();
  carro.grupo.updateMatrixWorld(true);
  const camara = new THREE.PerspectiveCamera(38, ANCHO / ALTO, 0.1, 60);
  camara.position.set(...posicionCamara);
  camara.lookAt(0, 0.65, 0);
  camara.updateMatrixWorld(true);
  return { carro, camara };
}

// Dónde cae en la pantalla el centro de una pieza.
function enPantalla(carro, camara, id) {
  const centro = new THREE.Box3().setFromObject(carro.porId.get(id)).getCenter(new THREE.Vector3());
  centro.project(camara);
  return { x: ((centro.x + 1) / 2) * ANCHO, y: ((1 - centro.y) / 2) * ALTO };
}

function tocar(carro, camara, x, y) {
  return piezaTocada({ camara, grupo: carro.grupo, x, y, ancho: ANCHO, alto: ALTO });
}

test('un dedo 10 px por encima del estribo marca el estribo, no la puerta', () => {
  const { carro, camara } = escenaDeCelular([-6.4, 1.4, 0]); // vista "Izquierdo"
  const estribo = enPantalla(carro, camara, 'estribo-izq');
  assert.equal(tocar(carro, camara, estribo.x, estribo.y), 'estribo-izq');
  assert.equal(tocar(carro, camara, estribo.x, estribo.y - 10), 'estribo-izq');
  assert.equal(tocar(carro, camara, estribo.x, estribo.y + 8), 'estribo-izq');
});

test('el centro de la puerta sigue siendo la puerta', () => {
  const { carro, camara } = escenaDeCelular([-6.4, 1.4, 0]);
  const puerta = enPantalla(carro, camara, 'puerta-del-izq');
  assert.equal(tocar(carro, camara, puerta.x, puerta.y), 'puerta-del-izq');
  const trasera = enPantalla(carro, camara, 'puerta-tras-izq');
  assert.equal(tocar(carro, camara, trasera.x, trasera.y), 'puerta-tras-izq');
});

test('un dedo al lado del espejo marca el espejo', () => {
  const { carro, camara } = escenaDeCelular([-4.6, 2.1, -4.9]); // vista inicial
  const espejo = enPantalla(carro, camara, 'espejo-izq');
  assert.equal(tocar(carro, camara, espejo.x, espejo.y), 'espejo-izq');
  assert.equal(tocar(carro, camara, espejo.x + 9, espejo.y), 'espejo-izq');
  assert.equal(tocar(carro, camara, espejo.x, espejo.y - 9), 'espejo-izq');
});

test('tocar el cielo o el vidrio no marca nada', () => {
  const { carro, camara } = escenaDeCelular([-4.6, 2.1, -4.9]);
  assert.equal(tocar(carro, camara, 8, 8), null);
  const techo = enPantalla(carro, camara, 'techo');
  // Un poco por debajo del centro del techo, visto desde arriba y de lado,
  // está el vidrio lateral: no es pieza pintable.
  const cruce = piezaTocada({ camara, grupo: carro.grupo, x: techo.x, y: techo.y + 30, ancho: ANCHO, alto: ALTO });
  assert.ok(cruce === null || cruce === 'techo' || cruce.startsWith('puerta'), 'cayó en ' + cruce);
});
