// Lo de adentro (el vano del motor, el capó por dentro, los marcos, la cara de adentro de las puertas) solo se
// marca con su puerta, su capó o su compuerta abiertos. Con todo cerrado, un rayo casi paralelo a la lata entra por
// la junta de 2 cm, pasa por debajo de la lámina (que por dentro no para el rayo) y caía en una pieza que nadie ve:
// del 0,13 al 0,17 % de los toques al azar en sedán, hatchback y SUV, medido el 9-nov-2026. Una pieza de más en la
// orden son 90.000 pesos en la nómina. El carro nuevo (js/generico) ya lo resolvía así (`soloAbierta`); este es el de
// hoy, que además es la plantilla de las piezas de todos los escaneos.
//
// El dedo se apunta a propósito a los puntos de cada pieza de adentro, desde cámaras alrededor y a la altura de un
// celular: así cada rayo prueba lo único que importa, y la prueba tarda segundos y no minutos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { construirCarro } from '../js/carro.js';
import { piezaTocada } from '../js/toque.js';
import { esInterior } from '../js/piezas.js';

const ANCHO = 360;
const ALTO = 420;
const CARROCERIAS = ['sedan', 'hatchback', 'suv', 'camioneta'];
// En la camioneta el piso del platón y la compuerta del platón por dentro se ven desde arriba con todo cerrado.
const A_LA_VISTA = { camioneta: new Set(['vano-baul', 'baul-int']) };

function azarCon(semilla) {
  let s = semilla >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// Una cámara como la del visor: de 4 a 8 m, desde casi el piso hasta casi encima, del lado del carro donde está
// `hacia` (el centro de la pieza): del otro lado, la mitad de los toques caerían en la lata de enfrente.
function camaraAlAzar(azar, hacia) {
  const centro = Math.atan2(hacia.z, hacia.x);
  const giro = Math.hypot(hacia.x, hacia.z) < 0.05 ? azar() * Math.PI * 2 : centro + (azar() - 0.5) * Math.PI;
  const elevacion = 0.03 + azar() * 1.45;
  const distancia = 4 + azar() * 4;
  const camara = new THREE.PerspectiveCamera(38, ANCHO / ALTO, 0.1, 60);
  camara.position.set(Math.cos(giro) * Math.cos(elevacion) * distancia, 0.3 + Math.sin(elevacion) * distancia, Math.sin(giro) * Math.cos(elevacion) * distancia);
  camara.lookAt(0, 0.65, 0);
  camara.updateMatrixWorld(true);
  return camara;
}

// Un punto al azar sobre la superficie de una pieza (todas las mallas que responden con su id), en el mundo. Sobre
// la superficie y no en los vértices: el marco es una losa de pocas esquinas, y todas quedan detrás de un pilar.
function superficieDe(carro, id) {
  const triangulos = [];
  let total = 0;
  carro.grupo.traverse((o) => {
    if (!o.isMesh || o.userData.piezaId !== id) return;
    const p = o.geometry.attributes.position;
    const indice = o.geometry.index;
    const n = indice ? indice.count : p.count;
    for (let t = 0; t < n; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, indice ? indice.getX(t + k) : t + k).applyMatrix4(o.matrixWorld));
      const area = new THREE.Triangle(a, b, c).getArea();
      if (area <= 0) continue;
      total += area;
      triangulos.push({ a, b, c, hasta: total });
    }
  });
  const centro = new THREE.Vector3();
  for (const t of triangulos) centro.add(t.a).add(t.b).add(t.c);
  centro.divideScalar(triangulos.length * 3);
  return {
    centro,
    punto(azar) {
      const meta = azar() * total;
      const t = triangulos.find((x) => x.hasta >= meta) || triangulos[triangulos.length - 1];
      let u = azar();
      let v = azar();
      if (u + v > 1) [u, v] = [1 - u, 1 - v];
      return t.a.clone().addScaledVector(t.b.clone().sub(t.a), u).addScaledVector(t.c.clone().sub(t.a), v);
    },
  };
}

// Toques del dedo sobre puntos de la pieza que caen dentro de la pantalla; devuelve lo que marcó cada uno.
function tocarPieza(carro, id, { camaras, azar }) {
  const superficie = superficieDe(carro, id);
  const marcadas = [];
  for (let c = 0; c < camaras; c++) {
    const camara = camaraAlAzar(azar, superficie.centro);
    for (let k = 0; k < 24; k++) {
      const punto = superficie.punto(azar).project(camara);
      if (Math.abs(punto.x) > 1 || Math.abs(punto.y) > 1 || punto.z > 1) continue;
      const x = ((punto.x + 1) / 2) * ANCHO;
      const y = ((1 - punto.y) / 2) * ALTO;
      marcadas.push(piezaTocada({ camara, grupo: carro.grupo, x, y, ancho: ANCHO, alto: ALTO }));
    }
  }
  return marcadas;
}

test('con todo cerrado, ningún toque marca una pieza de adentro', () => {
  const malas = [];
  let toques = 0;
  for (const carroceria of CARROCERIAS) {
    const carro = construirCarro({ carroceria });
    const azar = azarCon(20261109);
    const deAdentro = carro.seleccionables.map((m) => m.userData.piezaId).filter((id) => esInterior(id) && !A_LA_VISTA[carroceria]?.has(id));
    for (const id of deAdentro) {
      for (const marcada of tocarPieza(carro, id, { camaras: 40, azar })) {
        toques++;
        if (marcada && esInterior(marcada) && !A_LA_VISTA[carroceria]?.has(marcada)) malas.push(carroceria + ': ' + marcada);
      }
    }
  }
  assert.ok(toques > 10000, 'muy pocos toques: ' + toques);
  const cuenta = {};
  for (const m of malas) cuenta[m] = (cuenta[m] || 0) + 1;
  assert.deepEqual(cuenta, {}, `${malas.length} de ${toques} toques marcaron algo de adentro con todo cerrado`);
});

// El mismo carro sin el candado del toque: cada malla vuelve al raycast de three.
function sinCandado(carro) {
  carro.grupo.traverse((o) => {
    if (o.isMesh && Object.hasOwn(o, 'raycast')) delete o.raycast;
  });
  return carro;
}

// Qué hay que abrir para ver cada pieza de adentro. Los marcos y las bases se ven con cualquiera de las dos puertas de su lado.
function abrirPara(id) {
  if (id === 'vano-motor' || id === 'capo-int') return ['capo'];
  if (id === 'vano-baul' || id === 'baul-int') return ['baul'];
  if (id.endsWith('-int')) return [id.slice(0, -4)];
  const lado = id.endsWith('-izq') ? 'izq' : 'der';
  return ['puerta-del-' + lado, 'puerta-tras-' + lado];
}

function abrir(carro, bisagras, angulo) {
  for (const art of carro.articulaciones.values()) art.fijar(0);
  for (const bisagra of bisagras) carro.articulaciones.get(bisagra).fijar(angulo ?? carro.articulaciones.get(bisagra).max);
  carro.grupo.updateMatrixWorld(true);
}

// Con la bisagra abierta, el candado no le quita ni le cambia un solo toque a nadie: los mismos dedos marcan lo mismo
// que sin él. (El marco del sedán y de la SUV casi no se deja marcar ni así, con o sin candado: lo tapa por fuera el
// bloque oscuro del relleno. Es de antes, y está en "Trampas conocidas" del LEEME.)
test('con su bisagra abierta, cada pieza de adentro se marca igual que sin el candado', () => {
  let propias = 0;
  for (const carroceria of CARROCERIAS) {
    const conCandado = construirCarro({ carroceria });
    const libre = sinCandado(construirCarro({ carroceria }));
    for (const malla of conCandado.seleccionables) {
      const id = malla.userData.piezaId;
      if (!esInterior(id)) continue;
      abrir(conCandado, abrirPara(id));
      abrir(libre, abrirPara(id));
      const con = tocarPieza(conCandado, id, { camaras: 12, azar: azarCon(7) });
      const sin = tocarPieza(libre, id, { camaras: 12, azar: azarCon(7) });
      assert.deepEqual(con, sin, `${carroceria}, ${id} abierta: el candado cambió lo que se marca`);
      propias += con.filter((m) => m === id).length;
    }
  }
  assert.ok(propias > 300, 'casi ningún toque marcó la pieza abierta: ' + propias);
});

test('una puerta apenas entreabierta (menos de 2 grados) cuenta como cerrada', () => {
  const carro = construirCarro({ carroceria: 'sedan' });
  abrir(carro, ['puerta-del-izq'], 0.02);
  const marcadas = tocarPieza(carro, 'puerta-del-izq-int', { camaras: 80, azar: azarCon(3) });
  assert.ok(!marcadas.includes('puerta-del-izq-int'), 'la cara de adentro se marcó con la puerta en 0,02 rad');
});
