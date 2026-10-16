// Mide en el PC si la placa amarilla se encuentra en las fotos reales de
// pruebas/fotos-reconocer/ (solo las que tienen placa colombiana; las de
// Wikimedia son de otros países y sirven como "no debe encontrar nada").
//
//   node herramientas/medir-placa.mjs            → cajas encontradas
//   node herramientas/medir-placa.mjs --recortes → además guarda los
//                                                   recortes en el scratch
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RawImage } from '@huggingface/transformers';
import { buscarPlaca, candidatasAPlaca, mascaraAmarilla, recorteDePlaca, zonaDelLogo } from '../js/placa-foto.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = path.join(RAIZ, 'pruebas', 'fotos-reconocer');
const GUARDAR = process.argv.includes('--recortes');
const SALIDA = process.argv.find((a) => a.startsWith('--salida='))?.slice(9) || path.join(RAIZ, 'pruebas', 'fotos-reconocer', 'recortes');

// Placas colombianas que sí deberían salir (fracciones a ojo, 16-oct-2026).
const ESPERADAS = { 'captiva-joan': { x: 0.01, y: 0.57, w: 0.06, h: 0.09 } };

for (const archivo of fs.readdirSync(CARPETA).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const original = await RawImage.read(path.join(CARPETA, archivo));
  const factor = 640 / original.width;
  const chica = await original.resize(640, Math.round(original.height * factor));
  const t0 = Date.now();
  const candidatas = candidatasAPlaca(mascaraAmarilla(chica.data, chica.width, chica.height, chica.channels), chica.width, chica.height);
  const placa = buscarPlaca(chica.data, chica.width, chica.height, chica.channels);
  const ms = Date.now() - t0;
  const nombre = archivo.replace(/\.[^.]+$/, '');
  const esperada = ESPERADAS[nombre];
  let veredicto = esperada ? 'NO ENCONTRADA' : placa ? 'falsa alarma' : 'bien (sin placa)';
  if (esperada && placa) {
    const dentro = Math.abs(placa.x + placa.w / 2 - (esperada.x + esperada.w / 2)) < esperada.w && Math.abs(placa.y + placa.h / 2 - (esperada.y + esperada.h / 2)) < esperada.h;
    veredicto = dentro ? 'BIEN' : 'en otro sitio';
  }
  const caja = placa ? `x ${placa.x.toFixed(3)} y ${placa.y.toFixed(3)} w ${placa.w.toFixed(3)} h ${placa.h.toFixed(3)} (prop ${placa.proporcion.toFixed(2)}, relleno ${placa.relleno.toFixed(2)}, borde ${placa.borde.toFixed(2)}, huecos ${placa.huecos.toFixed(3)})` : 'ninguna';
  console.log(`${nombre.padEnd(14)} ${veredicto.padEnd(16)} ${caja}  [${candidatas.length} candidatas, ${ms} ms]`);
  if (GUARDAR && placa) {
    fs.mkdirSync(SALIDA, { recursive: true });
    const r = recorteDePlaca(placa);
    const rec = await original.crop([
      Math.round(r.x * original.width),
      Math.round(r.y * original.height),
      Math.round((r.x + r.w) * original.width) - 1,
      Math.round((r.y + r.h) * original.height) - 1,
    ]);
    await rec.save(path.join(SALIDA, nombre + '-placa.png'));
    const z = zonaDelLogo(placa);
    const p0 = z.puntos[0];
    if (!p0) continue; // placa pegada al borde de arriba: no hay "encima"
    const lado = Math.round(Math.max(original.width, original.height) * z.escala);
    const zx = Math.max(0, Math.round(p0.x * original.width - lado / 2));
    const zy = Math.max(0, Math.round(p0.y * original.height - lado / 2));
    const zona = await original.crop([zx, zy, Math.min(original.width - 1, zx + lado), Math.min(original.height - 1, zy + lado)]);
    await zona.save(path.join(SALIDA, nombre + '-encima.png'));
    console.log('   recortes guardados en ' + SALIDA);
  }
}
