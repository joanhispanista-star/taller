// Un carro parqueado en pendiente. El carro es el de las otras pruebas (el paramétrico, cuyas medidas
// se conocen), con un piso alrededor, y todo girado junto, como lo deja la vertical verdadera del
// celular: la pendiente es del piso, no del archivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { giroDeNivel, planoDelPiso } from '../js/escaneo-nivel.js';
import { mallaDesdePuntos, muestrasDelGenerico, procesarEscaneo, transformar } from '../js/escaneo.js';

const MEDIDAS = { largo: 4.34, ancho: 1.8, alto: 1.69, entreEjes: 2.67 };

function azar(semilla = 11) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// `huecoBajoElCarro`: lo normal en un escaneo, porque debajo del carro nadie ve el piso.
function nube({ pendiente = 0, rumbo = 0, conPiso = true, huecoBajoElCarro = false, margen = 1.1, ruido = 0.008 } = {}) {
  const r = azar();
  const muestras = muestrasDelGenerico(construirCarro({ carroceria: 'suv', medidas: MEDIDAS }), { paso: 0.04 });
  const puntos = [];
  for (let i = 0; i < muestras.puntos.length; i += 3) {
    puntos.push(muestras.puntos[i] + (r() - 0.5) * 2 * ruido, muestras.puntos[i + 1] + (r() - 0.5) * 2 * ruido, muestras.puntos[i + 2] + (r() - 0.5) * 2 * ruido);
  }
  if (conPiso) {
    const mx = MEDIDAS.ancho / 2 + margen;
    const mz = MEDIDAS.largo / 2 + margen;
    for (let x = -mx; x <= mx; x += 0.05) {
      for (let z = -mz; z <= mz; z += 0.05) {
        if (huecoBajoElCarro && Math.abs(x) < MEDIDAS.ancho / 2 - 0.1 && Math.abs(z) < MEDIDAS.largo / 2 - 0.1) continue;
        puntos.push(x + (r() - 0.5) * 0.02, (r() - 0.5) * 2 * ruido, z + (r() - 0.5) * 0.02);
      }
    }
  }
  const eje = new THREE.Vector3(Math.cos(rumbo), 0, Math.sin(rumbo));
  const giro = new THREE.Matrix4().makeRotationAxis(eje, (pendiente * Math.PI) / 180).setPosition(0.7, -0.15, -0.4);
  return transformar(new Float32Array(puntos), giro);
}

function medir(opciones) {
  const puntos = nube(opciones);
  const escaneo = procesarEscaneo(mallaDesdePuntos(puntos, { voxel: 0.04 }), { carroceria: 'suv', medidasCatalogo: MEDIDAS, puntos, suavizar: false });
  return escaneo.medidas;
}

for (const pendiente of [2, 5]) {
  for (const rumbo of [0.4, 2.1]) {
    for (const huecoBajoElCarro of [false, true]) {
      test(`a ${pendiente}° (rumbo ${rumbo}, ${huecoBajoElCarro ? 'sin ver' : 'viendo'} el piso bajo el carro) mide lo mismo que a nivel`, () => {
        const m = medir({ pendiente, rumbo, huecoBajoElCarro });
        assert.ok(Math.abs(m.largo - MEDIDAS.largo) < 0.08, `largo ${m.largo}`);
        assert.ok(Math.abs(m.ancho - MEDIDAS.ancho) < 0.08, `ancho ${m.ancho}`);
        assert.ok(Math.abs(m.alto - MEDIDAS.alto) < 0.08, `alto ${m.alto}`);
      });
    }
  }
}

test('la inclinación que se lee es la de verdad', () => {
  for (const pendiente of [1, 3, 5, 9]) {
    const plano = planoDelPiso(nube({ pendiente, rumbo: 0.9 }));
    assert.ok(plano, `sin plano a ${pendiente}°`);
    assert.ok(Math.abs(plano.inclinacion - pendiente) < 0.15, `a ${pendiente}° leyó ${plano.inclinacion}`);
  }
});

test('un piso a nivel no se gira: lo que ya estaba bien no se mueve', () => {
  assert.equal(giroDeNivel(nube({ pendiente: 0 })), null);
});

test('un carro recortado, sin piso, no se gira', () => {
  assert.equal(giroDeNivel(nube({ conPiso: false })), null);
  // Con el carro inclinado tampoco: sin piso no hay de dónde saber cuánto.
  assert.equal(giroDeNivel(nube({ conPiso: false, pendiente: 2, rumbo: 0.4 })), null);
});

test('nivelar lo ya nivelado no hace nada, y da lo mismo cada vez', () => {
  const puntos = nube({ pendiente: 3, rumbo: 1.3 });
  const giro = giroDeNivel(puntos);
  assert.ok(giro);
  assert.deepEqual(giroDeNivel(puntos).matriz.elements, giro.matriz.elements);
  assert.equal(giroDeNivel(transformar(puntos, giro.matriz)), null);
});

test('más allá de 10° no es un piso: no se gira', () => {
  assert.equal(giroDeNivel(nube({ pendiente: 14, rumbo: 0.4 })), null);
});
