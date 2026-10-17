// La parte pura del reconocimiento de la marca por el logo: el recorte
// alrededor del toque, las marcas agrupadas por logo y la clasificación
// de los recortes. El modelo no corre aquí; eso se mide a mano con
// herramientas/medir-logo.mjs sobre fotos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../js/catalogo-carros.js';
import { ESCALAS_RECORTE, clasificarLogo, decidirBarrido, logoQueQueda, logoSeguro, marcasConLogo, puntoEnFoto, recorteAlrededor, rejillaDeBarrido } from '../js/logo.js';

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

test('con el fondo en la softmax, las marcas ya no suman 1 y lo que falta es la probabilidad de fondo', () => {
  // Dos "marcas" y un "fondo" en un espacio de 3 dimensiones: el recorte
  // apunta al fondo, así que el fondo se lleva casi todo.
  const marcas = [
    { nombre: 'A', marcas: ['A'], prior: 1, e: [1, 0, 0] },
    { nombre: 'B', marcas: ['B'], prior: 1, e: [0, 1, 0] },
  ];
  const fondo = [{ nombre: 'parrilla', e: [0, 0, 1] }];
  const recorteDeFondo = [0.1, 0, 0.995];
  const sinFondo = clasificarLogo([recorteDeFondo], marcas, { escala: 10 });
  const conFondo = clasificarLogo([recorteDeFondo], marcas, { escala: 10, fondo });
  assert.ok(Math.abs(sinFondo[0].p + sinFondo[1].p - 1) < 1e-9, 'sin fondo las marcas suman 1');
  assert.equal(sinFondo.fondo, 0);
  assert.ok(conFondo.fondo > 0.99, 'el recorte de parrilla es fondo: ' + conFondo.fondo);
  assert.ok(Math.abs(conFondo[0].p + conFondo[1].p + conFondo.fondo - 1) < 1e-9, 'marcas más fondo suman 1');
  // Un recorte que sí es el logo A sigue siendo A, con y sin fondo.
  const recorteDeA = [0.99, 0.1, 0.05];
  assert.equal(clasificarLogo([recorteDeA], marcas, { escala: 10, fondo })[0].nombre, 'A');
  assert.ok(clasificarLogo([recorteDeA], marcas, { escala: 10, fondo }).fondo < 0.01);
});

test('rejillaDeBarrido cubre la franja del emblema, del centro hacia afuera, con los puntos que caben', () => {
  const puntos = rejillaDeBarrido({ paso: 0.2, x1: 0.1, x2: 0.9, y1: 0.3, y2: 0.7 });
  assert.equal(puntos.length, 5 * 3, '5 columnas por 3 filas');
  assert.ok(puntos.every((p) => p.x >= 0.1 - 1e-9 && p.x <= 0.9 + 1e-9 && p.y >= 0.3 - 1e-9 && p.y <= 0.7 + 1e-9));
  assert.ok(Math.abs(puntos[0].x - 0.5) < 1e-9 && Math.abs(puntos[0].y - 0.5) < 1e-9, 'el primero es el centro');
  const d = (p) => Math.hypot(p.x - 0.5, p.y - 0.5);
  for (let i = 1; i < puntos.length; i++) assert.ok(d(puntos[i]) >= d(puntos[i - 1]) - 1e-9, 'del centro hacia afuera');
  // Un paso que no divide exacto se ajusta para que los bordes entren.
  const bordes = rejillaDeBarrido({ paso: 0.12, x1: 0.1, x2: 0.9, y1: 0.3, y2: 0.8 });
  assert.ok(bordes.some((p) => Math.abs(p.x - 0.9) < 1e-9) && bordes.some((p) => Math.abs(p.y - 0.8) < 1e-9));
});

test('logoQueQueda: lo seguro gana, entre dos dudosos el de más probabilidad, y sin barrido queda lo anterior', () => {
  const dudoso = (nombre, p) => ({ marcas: [{ nombre, p }], seguro: false });
  const seguro = (nombre, p) => ({ marcas: [{ nombre, p }], seguro: true });
  assert.equal(logoQueQueda(null, null), null);
  const a = dudoso('Kia', 0.12);
  assert.equal(logoQueQueda(a, null), a, 'sin barrido queda el de la placa');
  const b = dudoso('Renault', 0.1);
  assert.equal(logoQueQueda(null, b), b, 'sin placa queda el del barrido');
  assert.equal(logoQueQueda(a, b), a, 'entre dos dudosos, el de más probabilidad (gana el de la placa)');
  const e = dudoso('Renault', 0.2);
  assert.equal(logoQueQueda(a, e), e, 'entre dos dudosos, el de más probabilidad (gana el del barrido)');
  const c = seguro('Renault', 0.11);
  assert.equal(logoQueQueda(a, c), c, 'el barrido seguro gana aunque tenga menos');
  const d = seguro('Kia', 0.3);
  assert.equal(logoQueQueda(d, dudoso('Ford', 0.5)), d, 'lo seguro de la placa no lo pisa un barrido dudoso');
});

test('decidirBarrido: gana el punto de más probabilidad, y es seguro solo si su marca sale primera en 2 puntos', () => {
  const lista = (nombre, p, segundo = 0.02) => [{ nombre, p }, { nombre: 'otra', p: segundo }];
  assert.equal(decidirBarrido([]), null);
  // Una textura: Daihatsu fuerte en un solo punto → gana, pero no es segura.
  const textura = decidirBarrido([lista('Subaru', 0.09), lista('Ford', 0.07), lista('Daihatsu', 0.36)]);
  assert.equal(textura.marcas[0].nombre, 'Daihatsu');
  assert.equal(textura.indice, 2);
  assert.equal(textura.seguro, false);
  // Un logo de verdad: la misma marca en dos puntos → segura.
  const logo = decidirBarrido([lista('Nissan', 0.62), lista('Nissan', 0.61), lista('Chevrolet', 0.07)]);
  assert.equal(logo.marcas[0].nombre, 'Nissan');
  assert.equal(logo.seguro, true);
  // Dos que coinciden pero el ganador no tiene ventaja → no segura.
  assert.equal(decidirBarrido([lista('Kia', 0.16, 0.12), lista('Kia', 0.1)]).seguro, false);
});

test('el prior reparte solo la parte de las marcas: el fondo no crece con una marca poco común', () => {
  const comun = { nombre: 'Comun', marcas: ['Comun'], prior: 1, e: [1, 0, 0] };
  const rara = { nombre: 'Rara', marcas: ['Rara'], prior: 0.45, e: [0, 1, 0] };
  const fondo = [{ nombre: 'parrilla', e: [0, 0, 1] }];
  // Un recorte con el logo de la marca rara (y algo de parrilla).
  const recorte = [0, 0.8, 0.6];
  const sinPrior = clasificarLogo([recorte], [comun, rara], { escala: 10, fondo, conPrior: false });
  const conPrior = clasificarLogo([recorte], [comun, rara], { escala: 10, fondo });
  assert.ok(Math.abs(sinPrior.fondo - conPrior.fondo) < 1e-12, 'el fondo es el mismo con y sin prior');
  assert.equal(conPrior[0].nombre, 'Rara', 'la rara sigue ganando si su logo es el que se ve');
  const suma = conPrior.reduce((s, m) => s + m.p, 0) + conPrior.fondo;
  assert.ok(Math.abs(suma - 1) < 1e-12, 'marcas más fondo suman 1');
});
