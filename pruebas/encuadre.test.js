// El encuadre con una cámara de verdad: desde cada vista, en cada forma de lienzo y con cada
// tamaño de carro, lo que se ve tiene que caber. Lo que importa es el borde del lienzo (±1
// en coordenadas de pantalla): Frente y Atrás se pasaron a ±1,16 en el sedán y a ±1,28 en la
// pick-up, y nada lo avisaba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { ALTURA_DE_LA_MIRA, LENTE, VISTAS, distanciaQueEncuadra, medidasDeEncuadre } from '../js/encuadre.js';

const ASPECTOS = {
  'celular 360×640, panel abierto': 360 / 346,
  'celular 390×844, sin piezas': 390 / 674,
  'celular 390×844, siete piezas': 390 / 424,
  'celular 412×915': 412 / 760,
  'angostísimo': 0.45,
  'cuadrado': 1,
  'celular acostado': 524 / 270,
  'computador 1280×800': 1280 / 605,
  'tira de 844×195': 844 / 195,
};

const CARROS = {
  sedán: { largo: 4.5, ancho: 1.84, alto: 1.46 },
  Kona: { largo: 4.2, ancho: 1.85, alto: 1.46 },
  'pick-up de 5,4 m': { largo: 5.4, ancho: 1.86, alto: 1.83 },
  'carrito de 2,7 m': { largo: 2.7, ancho: 1.55, alto: 1.5 },
  camión: { largo: 7, ancho: 2.3, alto: 2.9 },
};

function camaraEn(vista, medidas, aspecto) {
  const mira = new THREE.Vector3(0, medidas.alto * ALTURA_DE_LA_MIRA, 0);
  const direccion = new THREE.Vector3(...VISTAS[vista]).sub(mira);
  const camara = new THREE.PerspectiveCamera(LENTE, aspecto, 0.1, 80);
  camara.position.copy(mira).addScaledVector(direccion.clone().normalize(), distanciaQueEncuadra({ direccion, medidas, mira, fov: LENTE, aspecto }));
  camara.lookAt(mira);
  camara.updateMatrixWorld(true);
  camara.updateProjectionMatrix();
  return camara;
}

function extremoDeLaCaja(camara, { largo, ancho, alto }) {
  let extremo = 0;
  for (const x of [-ancho / 2, ancho / 2]) {
    for (const y of [0, alto]) {
      for (const z of [-largo / 2, largo / 2]) {
        const p = new THREE.Vector3(x, y, z).project(camara);
        extremo = Math.max(extremo, Math.abs(p.x), Math.abs(p.y));
      }
    }
  }
  return extremo;
}

test('las 8 esquinas del carro caben en el lienzo: vistas × aspectos × medidas', () => {
  for (const vista of Object.keys(VISTAS)) {
    for (const [nombreAspecto, aspecto] of Object.entries(ASPECTOS)) {
      for (const [nombreCarro, medidas] of Object.entries(CARROS)) {
        const extremo = extremoDeLaCaja(camaraEn(vista, medidas, aspecto), medidas);
        const donde = `${nombreCarro}, ${vista}, ${nombreAspecto}: ${extremo.toFixed(3)}`;
        assert.ok(extremo <= 1, 'se sale del lienzo. ' + donde);
        // Y no vale alejarlo de más: caber "de sobra" es dejarlo diminuto.
        assert.ok(extremo > 0.9, 'queda chiquito. ' + donde);
      }
    }
  }
});

test('el carro de verdad cabe, con todo y espejos, no solo su caja', () => {
  for (const carroceria of ['sedan', 'hatchback', 'suv', 'camioneta']) {
    const carro = construirCarro({ carroceria });
    carro.grupo.updateMatrixWorld(true);
    const medidas = carro.disposicion;
    for (const vista of Object.keys(VISTAS)) {
      for (const [nombreAspecto, aspecto] of Object.entries(ASPECTOS)) {
        const camara = camaraEn(vista, medidas, aspecto);
        let extremo = 0;
        const p = new THREE.Vector3();
        carro.grupo.traverse((m) => {
          if (!m.isMesh || !m.geometry.attributes.position) return;
          const a = m.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            p.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).project(camara);
            extremo = Math.max(extremo, Math.abs(p.x), Math.abs(p.y));
          }
        });
        assert.ok(extremo <= 1, `${carroceria}, ${vista}, ${nombreAspecto}: ${extremo.toFixed(3)}`);
      }
    }
  }
});

test('un escaneo fuera de rango cabe por lo que mide, no por el dibujo de medidas típicas', () => {
  // Las de moskvitch.ply, un archivo real: es el que la pantalla pide revisar, y salía hasta
  // x = −3,2 en Inicio. Su modelo sigue llevando la mira y la `disposicion` del dibujo.
  const dibujo = CARROS['sedán'];
  const escaneo = { medidas: { largo: 12.4, ancho: 1.8, alto: 2.5 }, fueraDeRango: true };
  const mira = new THREE.Vector3(0, dibujo.alto * ALTURA_DE_LA_MIRA, 0);
  for (const vista of Object.keys(VISTAS)) {
    for (const [nombreAspecto, aspecto] of Object.entries(ASPECTOS)) {
      const direccion = new THREE.Vector3(...VISTAS[vista]).sub(mira);
      const medidas = medidasDeEncuadre(escaneo, false, dibujo);
      const camara = new THREE.PerspectiveCamera(LENTE, aspecto, 0.1, 80);
      camara.position.copy(mira).addScaledVector(direccion.clone().normalize(), distanciaQueEncuadra({ direccion, medidas, mira, fov: LENTE, aspecto }));
      camara.lookAt(mira);
      camara.updateMatrixWorld(true);
      camara.updateProjectionMatrix();
      const extremo = extremoDeLaCaja(camara, escaneo.medidas);
      assert.ok(extremo <= 1, `${vista}, ${nombreAspecto}: ${extremo.toFixed(3)}`);
    }
  }
});

test('dentro de rango manda la disposición: los restos de la malla no encogen el carro', () => {
  const dibujo = CARROS['sedán'];
  const conRestos = { medidas: { largo: 5.2, ancho: 2.1, alto: 1.5 }, fueraDeRango: false };
  assert.equal(medidasDeEncuadre(conRestos, false, dibujo), dibujo);
  assert.equal(medidasDeEncuadre(null, false, dibujo), dibujo, 'sin escaneo');
  // «Ver las piezas» muestra el genérico, y ese sí mide lo que dice su dibujo.
  assert.equal(medidasDeEncuadre({ medidas: { largo: 12.4, ancho: 1.8, alto: 2.5 }, fueraDeRango: true }, true, dibujo), dibujo);
});

test('la distancia no depende del largo del vector que se le pasa', () => {
  const medidas = CARROS['sedán'];
  const mira = { x: 0, y: medidas.alto * ALTURA_DE_LA_MIRA, z: 0 };
  const base = { x: -4.6, y: 1.65, z: -4.9 };
  const una = distanciaQueEncuadra({ direccion: base, medidas, mira, fov: LENTE, aspecto: 0.6 });
  const otra = distanciaQueEncuadra({ direccion: { x: base.x * 7, y: base.y * 7, z: base.z * 7 }, medidas, mira, fov: LENTE, aspecto: 0.6 });
  assert.ok(Math.abs(una - otra) < 1e-9);
});

test('mirando recto hacia abajo también da una distancia', () => {
  const medidas = CARROS['sedán'];
  const d = distanciaQueEncuadra({ direccion: { x: 0, y: 1, z: 0 }, medidas, mira: { x: 0, y: 0.6, z: 0 }, fov: LENTE, aspecto: 0.6 });
  assert.ok(Number.isFinite(d) && d > 0);
});

test('un lienzo más angosto aleja la cámara, y por el mismo carro nunca la acerca', () => {
  const medidas = CARROS['sedán'];
  const mira = { x: 0, y: medidas.alto * ALTURA_DE_LA_MIRA, z: 0 };
  const frente = { x: 0, y: 1.3, z: -6.2 };
  const distancias = [2, 1, 0.75, 0.5].map((aspecto) => distanciaQueEncuadra({ direccion: frente, medidas, mira, fov: LENTE, aspecto }));
  for (let i = 1; i < distancias.length; i++) assert.ok(distancias[i] >= distancias[i - 1]);
});
