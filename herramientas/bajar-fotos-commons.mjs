// Baja fotos libres de carros en Colombia desde Wikimedia Commons para
// medir la app con fotos reales (placa amarilla, marcas variadas). Van a
// pruebas/datos-externos/commons-colombia/ (fuera del repo), con un CSV que
// guarda autor y licencia de cada una. Solo para medir: no viajan con la
// app.
//
//   node herramientas/bajar-fotos-commons.mjs [--maximo=60]
//
// Recorre la categoría "Automobiles in Colombia" y sus subcategorías (un
// nivel), pide las fotos a 1600 px de ancho y las baja de una en una con
// un User-Agent que diga quién es, como pide Commons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'pruebas', 'datos-externos', 'commons-colombia');
const MAXIMO = Number(process.argv.find((a) => a.startsWith('--maximo='))?.slice(9) || 60);
const UA = 'TallerPintura/1.0 (app de un taller de pintura en Colombia; medicion de reconocimiento; contacto en el repo)';
const API = 'https://commons.wikimedia.org/w/api.php';

// Commons limita a quien pide rápido (devuelve 429): una petición por
// segundo y, si aun así dice que no, esperar y volver a intentar.
const pausa = (ms) => new Promise((res) => setTimeout(res, ms));
async function consultar(parametros) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...parametros });
  for (let intento = 1; intento <= 5; intento++) {
    await pausa(1200);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status !== 429) throw new Error('Commons respondió ' + r.status);
    console.log('Commons pide esperar (429); intento ' + intento + ', espero ' + 20 * intento + ' s');
    await pausa(20000 * intento);
  }
  throw new Error('Commons sigue en 429 tras cinco intentos');
}

async function miembros(categoria, tipo) {
  const salida = [];
  let continuar = {};
  do {
    const j = await consultar({ action: 'query', list: 'categorymembers', cmtitle: categoria, cmtype: tipo, cmlimit: '100', ...continuar });
    salida.push(...(j.query?.categorymembers || []));
    continuar = j.continue || {};
  } while (continuar.cmcontinue && salida.length < 400);
  return salida;
}

async function infoDeArchivos(titulos) {
  const salida = [];
  for (let i = 0; i < titulos.length; i += 40) {
    const j = await consultar({
      action: 'query',
      titles: titulos.slice(i, i + 40).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|mime',
      iiurlwidth: '1600',
      iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription',
    });
    for (const p of Object.values(j.query?.pages || {})) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime)) continue;
      const meta = ii.extmetadata || {};
      salida.push({
        titulo: p.title,
        url: ii.thumburl || ii.url,
        licencia: meta.LicenseShortName?.value || '',
        autor: (meta.Artist?.value || '').replace(/<[^>]+>/g, '').trim(),
      });
    }
  }
  return salida;
}

fs.mkdirSync(DESTINO, { recursive: true });
const raiz = 'Category:Automobiles in Colombia';
const subcategorias = await miembros(raiz, 'subcat');
console.log(subcategorias.length + ' subcategorías');
let archivos = await miembros(raiz, 'file');
for (const sub of subcategorias.slice(0, 6)) {
  if (archivos.length >= MAXIMO * 3) break;
  archivos.push(...(await miembros(sub.title, 'file')));
}
// Sin repetidos, y primero las que nombran una marca conocida (para tener
// la verdad en el nombre del archivo).
const MARCAS = /chevrolet|renault|mazda|kia|hyundai|toyota|nissan|ford|suzuki|volkswagen|honda|mitsubishi|fiat|peugeot|citro|jeep|subaru|byd|chery|jac|land rover|volvo|mg |changan|haval|ssangyong|dfsk|lexus|mini|porsche|skoda|dodge|ram |opel|seat|tesla|jaguar|daihatsu|chrysler|great wall|foton|mercedes|bmw|audi|lada|daewoo/i;
const unicos = [...new Map(archivos.map((a) => [a.title, a])).values()];
const conMarca = unicos.filter((a) => MARCAS.test(a.title));
console.log(unicos.length + ' fotos, ' + conMarca.length + ' con marca en el nombre');
const elegidos = conMarca.slice(0, MAXIMO).map((a) => a.title);
const info = await infoDeArchivos(elegidos);

const csv = ['archivo,titulo,licencia,autor,url'];
let bajadas = 0;
for (const f of info) {
  const nombre = f.titulo.replace(/^File:/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90);
  const ruta = path.join(DESTINO, nombre);
  try {
    if (!fs.existsSync(ruta)) {
      const r = await fetch(f.url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(r.status);
      fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
      await pausa(1500); // de a una, sin apurar al servidor
    }
    bajadas += 1;
    csv.push([nombre, f.titulo, f.licencia, f.autor, f.url].map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(','));
  } catch (e) {
    console.log('no se pudo bajar ' + f.titulo + ': ' + e.message);
  }
}
fs.writeFileSync(path.join(DESTINO, 'fotos.csv'), csv.join('\n'));
console.log(bajadas + ' fotos en ' + DESTINO);
