// Servidor estático mínimo, sin dependencias, para abrir el visor en el
// navegador. Los módulos de JavaScript no cargan desde un archivo abierto
// con doble clic (file://), por eso hace falta.
//
//   node herramientas/servidor.js            → http://127.0.0.1:8310
//   node herramientas/servidor.js 8310 --red → también desde el celular,
//                                               en la misma red Wi-Fi
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.argv[2]) || 8310;
const EN_RED = process.argv.includes('--red');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  // El motor de reconocimiento (ONNX Runtime) es un .wasm: sin este tipo el
  // navegador se niega a compilarlo en streaming y tarda el doble.
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((peticion, respuesta) => {
    // Una URL mal formada ("/%" o "/%E0") hace que decodeURIComponent
    // lance, y con --red cualquier aparato de la Wi-Fi puede mandarla: sin
    // esta captura tumbaba el servidor entero. El byte nulo, además, hace
    // lanzar a fs.readFile.
    let ruta;
    try {
      ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname);
    } catch {
      respuesta.writeHead(400);
      respuesta.end();
      return;
    }
    if (ruta.includes(String.fromCharCode(0))) {
      respuesta.writeHead(400);
      respuesta.end();
      return;
    }
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(RAIZ, path.normalize(ruta));
    if (!archivo.startsWith(RAIZ)) {
      respuesta.writeHead(403);
      respuesta.end();
      return;
    }
    fs.readFile(archivo, (error, datos) => {
      if (error) {
        respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        respuesta.end('No existe: ' + ruta);
        return;
      }
      respuesta.writeHead(200, {
        'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
        // Sin caché: cada recarga trae el archivo recién editado.
        'Cache-Control': 'no-store',
      });
      respuesta.end(datos);
    });
  })
  .listen(PUERTO, EN_RED ? '0.0.0.0' : '127.0.0.1', () => {
    console.log('Visor en http://127.0.0.1:' + PUERTO + '/');
    if (EN_RED) {
      for (const interfaces of Object.values(os.networkInterfaces())) {
        for (const i of interfaces) {
          if (i.family === 'IPv4' && !i.internal) console.log('Desde el celular: http://' + i.address + ':' + PUERTO + '/');
        }
      }
    }
  });
