// Encontrar la placa amarilla en la foto, sin navegador: se dibujan
// píxeles a mano (un rectángulo amarillo, rayas, manchas) y se comprueba
// qué sale. La foto real de la Captiva se mide con
// herramientas/medir-placa.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binarizarPlaca, buscarPlaca, candidatasAPlaca, cerrarMascara, esAmarilloDePlaca, esquinasDePlaca, mascaraAmarilla, recorteDePlaca, rectificarPlaca, textoAPlaca, zonaDelLogo } from '../js/placa-foto.js';

function lienzo(ancho, alto, fondo = [60, 70, 80]) {
  const p = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) p.set([...fondo, 255], i * 4);
  return p;
}
function pintar(p, ancho, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p.set([...color, 255], (yy * ancho + xx) * 4);
}
const AMARILLO = [242, 194, 48];
const AMARILLO_SOMBRA = [150, 118, 25];

test('esAmarilloDePlaca acepta el amarillo normado, con sombra, y rechaza blanco, naranja, verde y oscuro', () => {
  assert.equal(esAmarilloDePlaca(...AMARILLO), true);
  assert.equal(esAmarilloDePlaca(...AMARILLO_SOMBRA), true);
  assert.equal(esAmarilloDePlaca(255, 255, 255), false, 'blanco');
  assert.equal(esAmarilloDePlaca(226, 103, 26), false, 'naranja');
  assert.equal(esAmarilloDePlaca(46, 125, 79), false, 'verde');
  assert.equal(esAmarilloDePlaca(40, 32, 5), false, 'casi negro');
  assert.equal(esAmarilloDePlaca(200, 190, 150), false, 'beige poco saturado');
});

test('buscarPlaca encuentra un rectángulo amarillo de proporción de placa y descarta rayas y manchas', () => {
  const W = 320, H = 240;
  const p = lienzo(W, H);
  pintar(p, W, 40, 160, 60, 28, AMARILLO); // la placa: 60×28 (2,1:1), abajo
  for (let k = 0; k < 5; k++) pintar(p, W, 46 + k * 10, 167, 5, 14, [15, 15, 15]); // sus letras
  pintar(p, W, 0, 230, 320, 4, AMARILLO); // raya de parqueadero: muy larga y delgada
  pintar(p, W, 200, 20, 12, 12, AMARILLO); // manchita cuadrada
  pintar(p, W, 220, 80, 50, 24, AMARILLO); // un aviso amarillo liso: forma de placa, sin letras
  const placa = buscarPlaca(p, W, H);
  assert.ok(placa, 'no encontró la placa');
  assert.ok(Math.abs(placa.x - 40 / W) < 0.01 && Math.abs(placa.y - 160 / H) < 0.01);
  assert.ok(Math.abs(placa.w - 60 / W) < 0.01 && Math.abs(placa.h - 28 / H) < 0.01);
  assert.ok(placa.oscuros > 0.1, 'tiene letras');
  const todas = candidatasAPlaca(mascaraAmarilla(p, W, H), W, H, p, 4);
  assert.equal(todas.length, 1, 'la raya, la mancha y el aviso liso no son candidatas');
  // Sin los píxeles (solo la máscara) el aviso liso y la manchita cuadrada
  // también caen: no tienen huecos encerrados (letras).
  assert.equal(candidatasAPlaca(mascaraAmarilla(p, W, H), W, H).length, 1);
  // Sin amarillo no hay placa.
  assert.equal(buscarPlaca(lienzo(W, H), W, H), null);
});

test('entre dos candidatas gana la más grande y más abajo; RGB de tres canales también sirve', () => {
  const W = 300, H = 300;
  const p = lienzo(W, H);
  pintar(p, W, 20, 30, 40, 18, AMARILLO); // chica y arriba
  pintar(p, W, 26, 34, 28, 10, [20, 20, 20]);
  pintar(p, W, 150, 220, 70, 32, AMARILLO_SOMBRA); // grande y abajo
  pintar(p, W, 160, 228, 50, 16, [20, 20, 20]);
  const placa = buscarPlaca(p, W, H);
  assert.ok(Math.abs(placa.x - 150 / W) < 0.01);
  // Tres canales: los mismos píxeles sin alfa.
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set([p[i * 4], p[i * 4 + 1], p[i * 4 + 2]], i * 3);
  const placa3 = buscarPlaca(rgb, W, H, 3);
  assert.ok(Math.abs(placa3.x - placa.x) < 1e-9 && Math.abs(placa3.w - placa.w) < 1e-9);
});

test('recorteDePlaca agrega margen sin salirse, y zonaDelLogo mira encima de la placa', () => {
  const placa = { x: 0.04, y: 0.6, w: 0.06, h: 0.07 };
  const r = recorteDePlaca(placa);
  assert.ok(r.x < placa.x && r.y < placa.y && r.w > placa.w && r.h > placa.h);
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1);
  const pegada = recorteDePlaca({ x: 0, y: 0.95, w: 0.1, h: 0.05 });
  assert.equal(pegada.x, 0);
  assert.ok(pegada.y + pegada.h <= 1);

  const zona = zonaDelLogo(placa);
  assert.ok(zona.puntos.length >= 6);
  // El primer punto es el de justo encima, centrado con la placa.
  assert.ok(Math.abs(zona.puntos[0].x - (placa.x + placa.w / 2)) < 1e-9);
  assert.ok(zona.puntos[0].y < placa.y);
  for (const pt of zona.puntos) assert.ok(pt.y < placa.y && pt.x > 0 && pt.x < 1);
  // Para la Captiva de Joan (placa al 6 % del ancho) el logo queda a ~1,9
  // alturas de placa: ese punto está en la zona.
  assert.ok(zona.puntos.some((pt) => Math.abs(pt.x - 0.07) < 0.03 && Math.abs(pt.y - 0.47) < 0.04));
  assert.ok(zona.escala >= 0.06 && zona.escala <= 0.25);
});

test('las letras parten el amarillo en tiras y el cierre las vuelve a juntar; un número pintado en el piso no es placa', () => {
  const W = 320, H = 240;
  const p = lienzo(W, H);
  // Placa de 60×28 con seis letras altas y delgadas (3 px, el ancho de un
  // trazo a esta escala) que dejan el amarillo en tiras.
  pintar(p, W, 40, 160, 60, 28, AMARILLO);
  for (let k = 0; k < 6; k++) pintar(p, W, 44 + k * 9, 164, 3, 20, [15, 15, 15]);
  const mascara = mascaraAmarilla(p, W, H);
  assert.ok(candidatasAPlaca(mascara, W, H, p, 4).length === 1, 'con el cierre es una sola mancha');
  // Radio 1 no tapa un trazo de 3 px; radio 2 (el que usa candidatasAPlaca) sí.
  assert.equal(cerrarMascara(mascara, W, H, 1)[(170 * W) + 45], 0);
  assert.equal(cerrarMascara(mascara, W, H, 2)[(170 * W) + 45], 1, 'el hueco de 3 px quedó tapado');
  // Un número pintado en el piso: trazos amarillos gruesos con asfalto
  // entre ellos que sale hasta afuera. Tiene oscuro adentro, pero nada
  // encerrado: no es placa. (Un "4" cerrado sí encierra un triángulo; por
  // eso el umbral de huecos no es cero sino un 2 % de la caja.)
  const q = lienzo(W, H);
  pintar(q, W, 10, 150, 8, 60, AMARILLO);
  pintar(q, W, 30, 150, 8, 60, AMARILLO);
  pintar(q, W, 50, 150, 8, 60, AMARILLO);
  pintar(q, W, 10, 150, 28, 8, AMARILLO); // une los dos primeros por arriba
  pintar(q, W, 30, 202, 28, 8, AMARILLO); // y los dos últimos por abajo
  assert.equal(buscarPlaca(q, W, H), null);
});

test('textoAPlaca saca la placa del texto del OCR, corrige confusiones por posición y acepta motos', () => {
  assert.equal(textoAPlaca('JRX 248'), 'JRX248');
  assert.equal(textoAPlaca('jrx-248'), 'JRX248');
  assert.equal(textoAPlaca('COLOMBIA JRX248 FUNZA'), 'JRX248');
  // 0 en sitio de letra es O; O en sitio de número es 0; 1/I, 8/B, 5/S.
  assert.equal(textoAPlaca('0RX 2O8'), 'ORX208');
  assert.equal(textoAPlaca('JRX 2I8'), 'JRX218');
  assert.equal(textoAPlaca('8RX 5S8'), 'BRX558');
  // Moto: dos números y una letra al final.
  assert.equal(textoAPlaca('ABC 12D'), 'ABC12D');
  // Demasiadas correcciones, o nada que se parezca: vacío.
  assert.equal(textoAPlaca('12345678'), '');
  assert.equal(textoAPlaca('CAPTIVA'), '');
  assert.equal(textoAPlaca(''), '');
  assert.equal(textoAPlaca('JR'), '');
});

test('binarizarPlaca separa letras oscuras de fondo amarillo con Otsu', () => {
  const W = 40, H = 10;
  const p = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) p.set([242, 194, 48, 255], i * 4);
  for (let y = 2; y < 8; y++) for (let x = 10; x < 14; x++) p.set([20, 20, 20, 255], (y * W + x) * 4);
  const { pixeles, umbral } = binarizarPlaca(p, W, H);
  assert.ok(umbral > 20 && umbral < 200, 'umbral ' + umbral);
  assert.equal(pixeles[(5 * W + 11) * 4], 0, 'la letra queda negra');
  assert.equal(pixeles[(5 * W + 30) * 4], 255, 'el fondo queda blanco');
  assert.equal(pixeles[(5 * W + 30) * 4 + 3], 255);
});

test('esquinasDePlaca encuentra las cuatro esquinas de una placa inclinada y rectificarPlaca la deja plana', () => {
  // Un paralelogramo amarillo (la placa vista de tres cuartos) con una
  // "letra" negra adentro, dibujado píxel a píxel.
  const W = 200, H = 160;
  const p = lienzo(W, H);
  const esquinasReales = [{ x: 40, y: 40 }, { x: 150, y: 70 }, { x: 140, y: 120 }, { x: 30, y: 90 }];
  const dentro = (x, y) => {
    // Punto dentro del cuadrilátero convexo: a la izquierda de cada lado.
    let signo = 0;
    for (let i = 0; i < 4; i++) {
      const a = esquinasReales[i], b = esquinasReales[(i + 1) % 4];
      const cruz = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cruz === 0) continue;
      if (signo === 0) signo = Math.sign(cruz);
      else if (Math.sign(cruz) !== signo) return false;
    }
    return true;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dentro(x, y)) p.set([...AMARILLO, 255], (y * W + x) * 4);
  // La letra: una barra negra en el centro de la placa (en coordenadas de la placa, un tercio del ancho).
  const centro = { x: 90, y: 80 };
  for (let y = centro.y - 12; y <= centro.y + 12; y++) for (let x = centro.x - 3; x <= centro.x + 3; x++) p.set([15, 15, 15, 255], (y * W + x) * 4);

  const mascara = mascaraAmarilla(p, W, H);
  const c = { x1: 30, y1: 40, x2: 150, y2: 120 };
  const esquinas = esquinasDePlaca(cerrarMascara(mascara, W, H, 2), W, H, c);
  assert.ok(esquinas, 'sin esquinas');
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(esquinas[i].x * W - esquinasReales[i].x) <= 2 && Math.abs(esquinas[i].y * H - esquinasReales[i].y) <= 2, 'esquina ' + i);
  }

  const plana = rectificarPlaca(p, W, H, 4, esquinas, 220, 100);
  assert.equal(plana.ancho, 220);
  // Las esquinas de la salida son amarillas (la placa llena el rectángulo).
  const pix = (x, y) => [plana.pixeles[(y * 220 + x) * 4], plana.pixeles[(y * 220 + x) * 4 + 1], plana.pixeles[(y * 220 + x) * 4 + 2]];
  for (const [x, y] of [[4, 4], [215, 4], [215, 95], [4, 95]]) assert.ok(esAmarilloDePlaca(...pix(x, y)), 'esquina de salida ' + x + ',' + y);
  // Y la barra negra queda vertical en el centro: oscura en el centro,
  // amarilla a los lados a la misma altura.
  assert.ok(pix(110, 50)[0] < 80, 'la letra está en el centro');
  assert.ok(esAmarilloDePlaca(...pix(70, 50)) && esAmarilloDePlaca(...pix(150, 50)));
  assert.ok(pix(110, 30)[0] < 80 && pix(110, 70)[0] < 80, 'la barra sigue vertical');
});
