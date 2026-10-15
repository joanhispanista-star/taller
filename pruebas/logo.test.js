// La parte pura del reconocimiento de la marca por el logo: el recorte
// alrededor del toque, las marcas agrupadas por logo y la clasificación
// de los recortes. El modelo no corre aquí; eso se mide a mano con
// herramientas/medir-logo.mjs sobre fotos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../js/catalogo-carros.js';
import { ESCALAS_RECORTE, clasificarLogo, logoSeguro, marcasConLogo, puntoEnFoto, recorteAlrededor } from '../js/logo.js';

test('puntoEnFoto descuenta las franjas vacías de una foto mostrada entera, y el toque fuera de la foto es null', () => {
  // Caja de 400 × 200 con una foto 4:3 (1600 × 1200): se ve a 266,67 × 200,
  // centrada, con franjas de 66,67 a cada lado.
  const caja = { left: 10, top: 20, width: 400, height: 200 };
  const natural = { width: 1600, height: 1200 };
  const centro = puntoEnFoto(10 + 200, 20 + 100, caja, natural);
  assert.ok(Math.abs(centro.x - 0.5) < 1e-9 && Math.abs(centro.y - 0.5) < 1e-9);
  const esquina = puntoEnFoto(10 + 66.67 + 1, 20 + 1, caja, natural);
  assert.ok(esquina.x < 0.01 && esquina.y < 0.01);
  assert.equal(puntoEnFoto(10 + 30, 20 + 100, caja, natural), null, 'la franja de la izquierda no es foto');
  // Foto vertical en caja apaisada: franjas arriba y abajo no, a los lados sí.
  const vertical = puntoEnFoto(10 + 200, 20 + 199, caja, { width: 600, height: 1200 });
  assert.ok(Math.abs(vertical.x - 0.5) < 1e-9 && vertical.y > 0.99);
  assert.equal(puntoEnFoto(5, 5, { left: 0, top: 0, width: 0, height: 0 }, natural), null);
});

test('el recorte es un cuadrado centrado en el toque, del tamaño pedido, y nunca se sale de la foto', () => {
  const r = recorteAlrededor(1600, 1200, 0.5, 0.5, 0.16);
  assert.equal(r.lado, 256);
  assert.equal(r.x2 - r.x1 + 1, 256);
  assert.equal(r.y2 - r.y1 + 1, 256);
  assert.equal(Math.round((r.x1 + r.x2) / 2), 800);
  assert.equal(Math.round((r.y1 + r.y2) / 2), 600);
  // Pegado a una esquina: se corre hacia adentro en vez de salirse.
  const esquina = recorteAlrededor(1600, 1200, 0.99, 0.01, 0.25);
  assert.equal(esquina.x2, 1599);
  assert.equal(esquina.y1, 0);
  assert.equal(esquina.lado, 400);
  // Una foto más alta que ancha: el lado sale del alto y no pasa del ancho.
  const vertical = recorteAlrededor(300, 2000, 0.5, 0.5, 0.25);
  assert.equal(vertical.lado, 300);
  assert.equal(vertical.x1, 0);
  // Las tres escalas van de chica a grande.
  assert.deepEqual([...ESCALAS_RECORTE].sort((a, b) => a - b), ESCALAS_RECORTE);
});

test('las marcas del catálogo se agrupan por el nombre de su logo, con prior por presencia', () => {
  const marcas = marcasConLogo(CATALOGO);
  const nombres = marcas.map((m) => m.nombre);
  assert.ok(nombres.includes('Chevrolet') && nombres.includes('Renault') && nombres.includes('SsangYong'));
  assert.ok(!nombres.includes('SsangYong / KGM'), 'el nombre del catálogo no es el del logo');
  const changan = marcas.find((m) => m.nombre === 'Changan');
  assert.deepEqual(changan.marcas.sort(), ['Changan', 'Changan (Chana)']);
  assert.equal(marcas.find((m) => m.nombre === 'Chevrolet').prior, 1);
  assert.ok(marcas.find((m) => m.nombre === 'Tesla').prior < 0.5);
  // Sin repetidos y en orden alfabético.
  assert.equal(new Set(nombres).size, nombres.length);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, 'es')));
});

test('clasificarLogo promedia los recortes, aplica el prior y ordena; logoSeguro exige ventaja clara', () => {
  const etiquetas = [
    { nombre: 'Chevrolet', marcas: ['Chevrolet'], prior: 1, e: [1, 0] },
    { nombre: 'Kia', marcas: ['Kia'], prior: 1, e: [0, 1] },
    { nombre: 'Tesla', marcas: ['Tesla'], prior: 0.45, e: [1, 0] },
  ];
  // Un recorte que es puro Chevrolet y otro a medias.
  const lista = clasificarLogo([[1, 0], [0.7, 0.7]], etiquetas, { escala: 10 });
  assert.equal(lista[0].nombre, 'Chevrolet');
  assert.ok(lista[0].p > lista[1].p && lista[1].p > lista[2].p);
  // Tesla tiene el mismo vector que Chevrolet: solo el prior los separa.
  assert.ok(lista.find((m) => m.nombre === 'Tesla').p < lista[0].p);
  assert.ok(Math.abs(lista.reduce((s, m) => s + m.p, 0) - 1) < 1e-9, 'las probabilidades suman 1');
  // Sin prior, Chevrolet y Tesla empatan.
  const sinPrior = clasificarLogo([[1, 0]], etiquetas, { escala: 10, conPrior: false });
  assert.ok(Math.abs(sinPrior.find((m) => m.nombre === 'Tesla').p - sinPrior.find((m) => m.nombre === 'Chevrolet').p) < 1e-9);
  assert.deepEqual(clasificarLogo([], etiquetas), []);

  // Los casos medidos: la Captiva (29 % contra 4 %) es segura; el Tucson
  // (12 % contra 7 %) y el Logan (10 % contra 9 %) no.
  assert.equal(logoSeguro([{ p: 0.29 }, { p: 0.04 }]), true);
  assert.equal(logoSeguro([{ p: 0.8 }, { p: 0.1 }]), true);
  assert.equal(logoSeguro([{ p: 0.12 }, { p: 0.07 }]), false, 'poca probabilidad');
  assert.equal(logoSeguro([{ p: 0.2 }, { p: 0.16 }]), false, 'poca ventaja');
  assert.equal(logoSeguro([{ p: 0.2 }]), true);
  assert.equal(logoSeguro([]), false);
});
