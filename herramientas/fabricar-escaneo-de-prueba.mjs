// Fabrica escaneos de mentira para probar el importador en el navegador
// sin celular ni app de escaneo: la chapa del carro genérico (una SUV de
// 4,34 × 1,80 × 1,69 m, rojo vino) sobre un piso gris, girada y corrida,
// como la exportaría una app.
//
//   node herramientas/fabricar-escaneo-de-prueba.mjs
//
// Escribe en pruebas/datos-externos/escaneos-de-prueba/ (fuera de git):
//  - suv-nube-mm-zarriba.ply: nube de puntos en ASCII, en milímetros y con
//    z hacia arriba (como un PLY de fotogrametría o de splats).
//  - suv-malla-color.ply: malla binaria con color por vértice, en metros y
//    con y hacia arriba (como un GLB/PLY de RealityScan o Scaniverse).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { mallaDesdePuntos, muestrasDelGenerico, transformar } from '../js/escaneo.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'pruebas', 'datos-externos', 'escaneos-de-prueba');
fs.mkdirSync(DESTINO, { recursive: true });

let s = 9;
const azar = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const carro = construirCarro({ carroceria: 'suv', medidas: { largo: 4.34, ancho: 1.8, alto: 1.69, entreEjes: 2.67 } });
const m = muestrasDelGenerico(carro, { paso: 0.025 });
const p = [];
const esPiso = [];
for (let i = 0; i < m.puntos.length; i += 3) {
  p.push(m.puntos[i] + (azar() - 0.5) * 0.012, m.puntos[i + 1] + (azar() - 0.5) * 0.012, m.puntos[i + 2] + (azar() - 0.5) * 0.012);
  // Lo que no es pieza (vidrios, llantas) va oscuro.
  esPiso.push(m.etiquetas[i / 3] === 0 ? 2 : 0);
}
for (let x = -3; x <= 3; x += 0.05) {
  for (let z = -3.4; z <= 3.4; z += 0.05) {
    p.push(x, (azar() - 0.5) * 0.01, z);
    esPiso.push(1);
  }
}
const giro = new THREE.Matrix4().makeRotationY(0.9).setPosition(1.1, 0, -0.6);
const enMundo = transformar(new Float32Array(p), giro);

// 1. La nube: milímetros, z arriba (x, -z, y).
const lineas = [];
for (let i = 0; i < enMundo.length; i += 3) lineas.push((enMundo[i] * 1000).toFixed(1) + ' ' + (-enMundo[i + 2] * 1000).toFixed(1) + ' ' + (enMundo[i + 1] * 1000).toFixed(1));
fs.writeFileSync(path.join(DESTINO, 'suv-nube-mm-zarriba.ply'), 'ply\nformat ascii 1.0\nelement vertex ' + lineas.length + '\nproperty float x\nproperty float y\nproperty float z\nend_header\n' + lineas.join('\n') + '\n');

// 2. La malla con color, binaria: de la nube a superficie, y el color de
// cada vértice según el punto más cercano (rojo vino la chapa, gris el
// piso, casi negro vidrios y llantas).
const malla = mallaDesdePuntos(enMundo, { voxel: 0.025 });
const COLORES = [[122, 22, 38], [120, 120, 118], [25, 27, 30]];
const rejilla = new Map();
const clave = (x, y, z) => Math.floor(x / 0.06) + ',' + Math.floor(y / 0.06) + ',' + Math.floor(z / 0.06);
for (let i = 0; i < enMundo.length / 3; i++) {
  const c = clave(enMundo[i * 3], enMundo[i * 3 + 1], enMundo[i * 3 + 2]);
  if (!rejilla.has(c)) rejilla.set(c, []);
  rejilla.get(c).push(i);
}
const nV = malla.posiciones.length / 3;
const nF = malla.indices.length / 3;
const cabecera = 'ply\nformat binary_little_endian 1.0\nelement vertex ' + nV + '\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ' + nF + '\nproperty list uchar int vertex_indices\nend_header\n';
const cuerpo = Buffer.alloc(nV * 15 + nF * 13);
let o = 0;
for (let v = 0; v < nV; v++) {
  const x = malla.posiciones[v * 3];
  const y = malla.posiciones[v * 3 + 1];
  const z = malla.posiciones[v * 3 + 2];
  let mejor = -1;
  let dMejor = Infinity;
  const [bx, by, bz] = [Math.floor(x / 0.06), Math.floor(y / 0.06), Math.floor(z / 0.06)];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const i of rejilla.get(bx + dx + ',' + (by + dy) + ',' + (bz + dz)) || []) {
          const d = (enMundo[i * 3] - x) ** 2 + (enMundo[i * 3 + 1] - y) ** 2 + (enMundo[i * 3 + 2] - z) ** 2;
          if (d < dMejor) {
            dMejor = d;
            mejor = i;
          }
        }
      }
    }
  }
  const [r, g, b] = COLORES[mejor >= 0 ? esPiso[mejor] : 1];
  cuerpo.writeFloatLE(x, o);
  cuerpo.writeFloatLE(y, o + 4);
  cuerpo.writeFloatLE(z, o + 8);
  cuerpo.writeUInt8(r, o + 12);
  cuerpo.writeUInt8(g, o + 13);
  cuerpo.writeUInt8(b, o + 14);
  o += 15;
}
for (let f = 0; f < nF; f++) {
  cuerpo.writeUInt8(3, o);
  cuerpo.writeInt32LE(malla.indices[f * 3], o + 1);
  cuerpo.writeInt32LE(malla.indices[f * 3 + 1], o + 5);
  cuerpo.writeInt32LE(malla.indices[f * 3 + 2], o + 9);
  o += 13;
}
fs.writeFileSync(path.join(DESTINO, 'suv-malla-color.ply'), Buffer.concat([Buffer.from(cabecera, 'ascii'), cuerpo]));
for (const f of fs.readdirSync(DESTINO)) console.log(f, Math.round(fs.statSync(path.join(DESTINO, f)).size / 1024) + ' KB');
