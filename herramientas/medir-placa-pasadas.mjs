// Mide, sin ningún modelo, qué encuentran las pasadas de la placa sobre
// las fotos reales: la normal a 640 px, la relajada (amarillo en sombra) y
// las dos a 960 px. Para cada hallazgo que NO sea de la pasada normal
// imprime sus medidas y guarda el recorte en una hoja de contactos
// (pruebas/datos-externos/pasadas-placa.png) para mirarlo: una pasada que
// encuentra "placas" que no lo son estorba más de lo que ayuda (la app
// diría "vi la placa" y buscaría el logo donde no hay).
//
//   node herramientas/medir-placa-pasadas.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RawImage } from '@huggingface/transformers';
import { buscarPlaca } from '../js/placa-foto.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fotos = fs.readdirSync(path.join(RAIZ, 'pruebas', 'fotos-reconocer')).filter((f) => /\.jpe?g$/i.test(f)).map((f) => path.join(RAIZ, 'pruebas', 'fotos-reconocer', f));
const commons = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
for (const f of fs.readdirSync(commons).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/interior/i.test(f)).sort()) fotos.push(path.join(commons, f));

const recortes = [];
const totales = { normal: 0, relajada: 0, 'normal a 960': 0, 'relajada a 960': 0, nada: 0 };
for (const ruta of fotos) {
  const original = await RawImage.read(ruta);
  const nombre = path.basename(ruta).replace(/\.[^.]+$/, '').slice(0, 40);
  let hallazgo = null;
  for (const lado of [640, 960]) {
    const chica = await original.resize(lado, Math.round((original.height * lado) / original.width));
    for (const relajado of [false, true]) {
      const placa = buscarPlaca(chica.data, chica.width, chica.height, chica.channels, { relajado, soloChicas: lado === 960 });
      if (placa) {
        hallazgo = { placa, pasada: (relajado ? 'relajada' : 'normal') + (lado === 960 ? ' a 960' : ''), chica };
        break;
      }
    }
    if (hallazgo) break;
  }
  if (!hallazgo) {
    totales.nada += 1;
    console.log(nombre.padEnd(42) + 'nada');
    continue;
  }
  totales[hallazgo.pasada] += 1;
  const { placa, pasada } = hallazgo;
  console.log(nombre.padEnd(42) + pasada.padEnd(16) + 'x ' + placa.x.toFixed(2) + ' y ' + placa.y.toFixed(2) + ' w ' + placa.w.toFixed(3) + ' h ' + placa.h.toFixed(3) + ' prop ' + placa.proporcion.toFixed(2) + ' relleno ' + placa.relleno.toFixed(2) + ' oscuros ' + (placa.oscuros || 0).toFixed(2) + ' huecos ' + placa.huecos.toFixed(3) + ' borde ' + placa.borde.toFixed(2));
  if (pasada !== 'normal') {
    // El recorte con margen, a 160 px de ancho, para la hoja de contactos.
    const m = 0.5;
    const x1 = Math.max(0, Math.round((placa.x - placa.w * m) * original.width));
    const y1 = Math.max(0, Math.round((placa.y - placa.h * m) * original.height));
    const x2 = Math.min(original.width - 1, Math.round((placa.x + placa.w * (1 + m)) * original.width));
    const y2 = Math.min(original.height - 1, Math.round((placa.y + placa.h * (1 + m)) * original.height));
    const recorte = await (await original.crop([x1, y1, x2, y2])).resize(200, 120);
    recortes.push({ nombre, pasada, recorte });
  }
}
console.log('\n' + JSON.stringify(totales));
if (recortes.length) {
  const hoja = new RawImage(new Uint8ClampedArray(200 * recortes.length * 120 * 3).fill(30), 200 * recortes.length, 120, 3);
  recortes.forEach(({ recorte }, i) => {
    const rgb = recorte.channels === 3 ? recorte : recorte.rgb();
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 200; x++) {
        for (let k = 0; k < 3; k++) hoja.data[(y * hoja.width + i * 200 + x) * 3 + k] = rgb.data[(y * 200 + x) * rgb.channels + k];
      }
    }
  });
  const destino = path.join(RAIZ, 'pruebas', 'datos-externos', 'pasadas-placa.png');
  await hoja.save(destino);
  console.log('Hoja de contactos (de izquierda a derecha: ' + recortes.map((r) => r.nombre.slice(0, 14) + ' [' + r.pasada + ']').join(', ') + '): ' + destino);
}
