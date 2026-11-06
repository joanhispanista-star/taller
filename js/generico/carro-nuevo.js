// Prototipo B del carro genérico: una jaula de control subdividida con Catmull-Clark. Mismo
// contrato que construirCarro de js/carro.js: { grupo, seleccionables, porId, articulaciones,
// disposicion }, con las piezas de afuera y las de adentro.
//
//   jaula.js           la jaula, escrita a mano, relativa a los puntos de `disposicion`.
//   subdivision.js     la subdivisión con pliegues y las normales por sector.
//   pintura.js         la pintura: que el color que se ve sea el color pedido.
//   rueda.js           rin, llanta y freno.
//   luces.js           faros, stops y exploradoras.
//   detalle.js         lo que va encima de la lata: espejos, manijas, placas, parrilla, cabina.
//   adentro.js         lo que se ve con algo abierto: tapiz, marcos, vanos, motor.
//   este archivo        parte la superficie en piezas, abre las juntas y arma el contrato.
//
// El contrato se comprueba en pruebas/generico.test.js, con el catálogo, las bisagras y el toque de verdad.
//
// Lo central: la superficie se subdivide y se le sacan las normales ENTERA, y solo después se
// parte en piezas. Por eso la luz corre de una pieza a la vecina sin escalón, y la junta es lo
// único que las separa: una línea fina y oscura, como en un carro de verdad.
import * as THREE from 'three';
import { disposicion } from '../carro.js';
import { PIEZAS_POR_ID, esInterior } from '../piezas.js';
import { alisarNormales, crearMalla, subdividir, normalesPorSector } from './subdivision.js';
import { armarJaula, proporciones, retocar } from './jaula.js';
import { crearRuedas, Fundidor } from './rueda.js';
import { conEntorno, crearMateriales, ponerDetalles } from './detalle.js';
import { conSombra, ponerInteriores, sombraDePieza } from './adentro.js';
import { armarCalavera, armarFaro, cintaBorde } from './luces.js';

// Media junta: casi 1 cm entre paneles. La real son 4-5 mm, pero en un celular no se vería, y la pieza
// que el dueño va a tocar tiene que leerse sin marcarla.
const JUNTA = 0.0052;

// Cuánto se alisa el campo de normales de la lata (ver alisarNormales). Sin alisar, el borde de la
// franja ondulaba en las puertas, y sobre el arco de la SUV salía un anillo brillante. Con 16 y 4 corre
// limpio; desde unas 30 gruesas empieza a perder los hombros del carro. Cuesta unos 5 ms en este PC.
const VUELTAS_GRUESAS = 16;
const VUELTAS_FINAS = 4;

// Solo se modela la mitad derecha; aquí se refleja. La fila del centro se comparte.
function reflejar(j) {
  const nV = j.pos.length / 3;
  const usado = new Uint8Array(nV);
  for (const c of j.caras) for (const v of c) usado[v] = 1;
  const nuevo = new Int32Array(nV).fill(-1);
  const espejo = new Int32Array(nV).fill(-1);
  const pos = [];
  for (let v = 0; v < nV; v++) {
    if (!usado[v]) continue;
    nuevo[v] = pos.length / 3;
    pos.push(j.pos[3 * v], j.pos[3 * v + 1], j.pos[3 * v + 2]);
  }
  for (let v = 0; v < nV; v++) {
    if (!usado[v]) continue;
    if (Math.abs(j.pos[3 * v]) < 1e-5) {
      espejo[v] = nuevo[v];
      continue;
    }
    espejo[v] = pos.length / 3;
    pos.push(-j.pos[3 * v], j.pos[3 * v + 1], j.pos[3 * v + 2]);
  }
  const nombres = new Map();
  const info = [];
  const tagDe = (t) => {
    let i = nombres.get(t);
    if (i === undefined) {
      i = info.length;
      nombres.set(t, i);
      const [material, pieza, grupo] = t.split('|');
      info.push({ nombre: t, material, pieza: pieza || null, grupo });
    }
    return i;
  };
  const caras = [];
  const tags = [];
  const sinForro = [];
  j.caras.forEach((c, f) => {
    caras.push(c.map((v) => nuevo[v]));
    tags.push(tagDe(j.etiquetas[f].replace(/\$/g, 'der')));
    caras.push(c.map((v) => espejo[v]).reverse());
    tags.push(tagDe(j.etiquetas[f].replace(/\$/g, 'izq')));
    sinForro.push(j.sinForro[f], j.sinForro[f]);
  });
  const pliegues = [];
  for (const [a, b, s] of j.pliegues) {
    if (nuevo[a] < 0 || nuevo[b] < 0) continue;
    pliegues.push([nuevo[a], nuevo[b], s], [espejo[a], espejo[b], s]);
  }
  const esquinas = [];
  for (const v of j.esquinas || []) {
    if (nuevo[v] < 0) continue;
    esquinas.push(nuevo[v]);
    if (espejo[v] !== nuevo[v]) esquinas.push(espejo[v]);
  }
  return { pos, caras, tags, info, pliegues, esquinas, sinForro };
}

// Cuánto se retira cada lado de un borde. Dos latas: la junta entera. Lata contra vidrio o faro:
// casi nada, porque ahí no hay holgura sino empaque. Negro contra vidrio: nada.
function juntaEntre(a, b) {
  if (!b) return 0;
  if (a.material === 'pintura' && b.material === 'pintura') {
    if (a.pieza === b.pieza) return a.nombre === b.nombre ? 0 : 0.002; // la canaleta del techo
    // El riel del techo y el costado son la misma chapa en un carro de verdad: la soldadura va
    // escondida, y una junta ahí se ve falsa.
    const unaEsTecho = a.pieza === 'techo' || b.pieza === 'techo';
    const unaEsCostado = a.pieza?.startsWith('costado') || b.pieza?.startsWith('costado');
    if (unaEsTecho && unaEsCostado) return a.nombre.endsWith('riel') || b.nombre.endsWith('riel') ? 0.0004 : 0.002;
    return JUNTA;
  }
  if (a.material === 'pintura' || b.material === 'pintura') return 0.0018;
  return 0;
}

// Lo que se hunde bajo la superficie (y queda una pared oscura en el borde): la parrilla, la
// toma de aire, el vidrio dentro de su marco.
const HUNDIR = { vidrio: 0.005, parrilla: 0.028, toma: 0.034, negro: 0.0015, hueco: 0.035 };

function separar(m, N, info, cuales = null) {
  const { nF, nV, fV, fE, eF, tag, P } = m;
  const porTag = new Map();
  for (let f = 0; f < nF; f++) {
    let l = porTag.get(tag[f]);
    if (!l) porTag.set(tag[f], (l = []));
    l.push(f);
  }
  const local = new Int32Array(4 * nF).fill(-1);
  const sumaS = new Float64Array(3 * nV);
  const sumaU = new Float64Array(3 * nV);
  const cuenta = new Int32Array(nV);
  const salida = new Map();
  for (const [t, lista] of porTag) {
    const T = info[t];
    if (cuales && !cuales(T)) continue;
    const pos = [];
    const nor = [];
    const glob = [];
    const idx = [];
    const tocados = [];
    let n = 0;
    for (const f of lista) {
      const c = [];
      for (let q = 4 * f; q < 4 * f + 4; q++) {
        const g = N.grupo[q];
        if (local[g] < 0) {
          local[g] = n++;
          tocados.push(g);
          const v = fV[q];
          glob.push(v);
          pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
          nor.push(N.normal[3 * g], N.normal[3 * g + 1], N.normal[3 * g + 2]);
        }
        c.push(local[g]);
      }
      idx.push(c[0], c[1], c[2], c[0], c[2], c[3]);
    }
    // Los bordes de la pieza y hacia dónde queda su interior.
    const bordes = [];
    const vistos = [];
    for (const f of lista) {
      for (let c = 0; c < 4; c++) {
        const e = fE[4 * f + c];
        const f2 = eF[2 * e] === f ? eF[2 * e + 1] : eF[2 * e];
        if (f2 >= 0 && tag[f2] === t) continue;
        const otro = f2 >= 0 ? info[tag[f2]] : null;
        const q0 = 4 * f + c;
        const q1 = 4 * f + ((c + 1) & 3);
        const va = fV[q0];
        const vb = fV[q1];
        const dx0 = P[3 * vb] - P[3 * va];
        const dy0 = P[3 * vb + 1] - P[3 * va + 1];
        const dz0 = P[3 * vb + 2] - P[3 * va + 2];
        const lon = Math.hypot(dx0, dy0, dz0) || 1;
        const dx = dx0 / lon;
        const dy = dy0 / lon;
        const dz = dz0 / lon;
        const nx = N.nCara[3 * f];
        const ny = N.nCara[3 * f + 1];
        const nz = N.nCara[3 * f + 2];
        // Antihorario visto desde afuera: el interior queda a la izquierda de la arista.
        const ux = ny * dz - nz * dy;
        const uy = nz * dx - nx * dz;
        const uz = nx * dy - ny * dx;
        const g = juntaEntre(T, otro);
        for (const v of [va, vb]) {
          if (!cuenta[v]) vistos.push(v);
          cuenta[v]++;
          sumaS[3 * v] += g * ux;
          sumaS[3 * v + 1] += g * uy;
          sumaS[3 * v + 2] += g * uz;
          sumaU[3 * v] += ux;
          sumaU[3 * v + 1] += uy;
          sumaU[3 * v + 2] += uz;
        }
        bordes.push({ a: local[N.grupo[q0]], b: local[N.grupo[q1]], va, vb, g, otro, ux, uy, uz });
      }
    }
    for (const g of tocados) local[g] = -1;
    // Dos normales pueden ser del mismo vértice si hay un pliegue en el borde: el
    // desplazamiento se calcula por vértice global para que no se abra una grieta entre ellas.
    const dirU = new Map();
    for (const v of vistos) {
      const ux = sumaU[3 * v];
      const uy = sumaU[3 * v + 1];
      const uz = sumaU[3 * v + 2];
      const l2 = ux * ux + uy * uy + uz * uz || 1;
      const k = cuenta[v] / l2;
      const l = Math.sqrt(l2);
      let dx = k * sumaS[3 * v];
      let dy = k * sumaS[3 * v + 1];
      let dz = k * sumaS[3 * v + 2];
      // En una esquina muy cerrada la inglete se dispara: se topa para que la junta no se abra
      // como una boca negra justo donde el bómper llega al arco.
      const ld = Math.hypot(dx, dy, dz);
      if (ld > 0.0095) {
        dx *= 0.0095 / ld;
        dy *= 0.0095 / ld;
        dz *= 0.0095 / ld;
      }
      dirU.set(v, [dx, dy, dz, ux / l, uy / l, uz / l]);
    }
    const original = pos.slice();
    for (let i = 0; i < n; i++) {
      const u = dirU.get(glob[i]);
      if (!u) continue;
      pos[3 * i] += u[0];
      pos[3 * i + 1] += u[1];
      pos[3 * i + 2] += u[2];
    }
    const hundir = HUNDIR[T.material] || 0;
    if (hundir) {
      for (let i = 0; i < n; i++) {
        pos[3 * i] -= nor[3 * i] * hundir;
        pos[3 * i + 1] -= nor[3 * i + 1] * hundir;
        pos[3 * i + 2] -= nor[3 * i + 2] * hundir;
      }
    }
    salida.set(t, { T, pos, nor, idx, original, bordes, dirU, hundir });
    for (const v of vistos) {
      cuenta[v] = 0;
      sumaS[3 * v] = sumaS[3 * v + 1] = sumaS[3 * v + 2] = 0;
      sumaU[3 * v] = sumaU[3 * v + 1] = sumaU[3 * v + 2] = 0;
    }
  }
  return salida;
}

// Debajo de cada junta va una tira negra pegada a la pieza: la junta deja ver negro y no el
// otro lado del carro. Es de la pieza, no del cuerpo: cuando la puerta se abre, se va con ella
// y no deja un parche negro donde estaba.
//
// Y es lo que para el dedo. De adorno (toque.js atraviesa los adornos), un toque sobre la junta seguía
// de largo y marcaba lo de adentro: el 4,5 % de los toques apuntados a una junta de un sedán, en vano-motor,
// un marco o la cara de adentro de la puerta del otro lado, con el carro cerrado. Ver conDueno y soloAbierta.
function tiraOscura(p, f) {
  const prof = 0.007;
  const ancho = 0.022;
  const o = p.original;
  const n = p.nor;
  for (const b of p.bordes) {
    if (b.g <= 0) continue;
    const ua = p.dirU.get(b.va);
    const ub = p.dirU.get(b.vb);
    const punto = (l, u, ad) => [o[3 * l] - n[3 * l] * prof + u[3] * ad, o[3 * l + 1] - n[3 * l + 1] * prof + u[4] * ad, o[3 * l + 2] - n[3 * l + 2] * prof + u[5] * ad];
    f.cara([punto(b.a, ua, 0), punto(b.b, ub, 0), punto(b.b, ub, ancho), punto(b.a, ua, ancho)]);
  }
}

// Todas las tiras de un cuerpo van en una sola malla (una por pieza serían 17 llamadas de dibujo más), pero el
// dedo tiene que saber de quién es cada una: un dedo mide 40 px y la junta 1, y si tocarla no marcara nada, en
// cerca de uno de cada 120 toques la app se quedaría callada. Por eso el rayo que la cruza se le anota a la pieza
// dueña de esa tira, que es la que queda más cerca del dedo. `tramos`, en orden: hasta qué triángulo es de qué pieza.
// Lo que no es de ninguna (el borde de un hueco) para el rayo y no marca nada.
function conDueno(malla, tramos, porId) {
  malla.raycast = function (rayo, cruces) {
    const antes = cruces.length;
    THREE.Mesh.prototype.raycast.call(this, rayo, cruces);
    for (let i = antes; i < cruces.length; i++) {
      const tramo = tramos.find((t) => cruces[i].faceIndex < t.hasta);
      const dueno = tramo && tramo.pieza && porId.get(tramo.pieza);
      if (dueno) cruces[i].object = dueno;
    }
  };
}

// El canto de la lata: se dobla hacia adentro de la junta, como la chapa de verdad. Es un solo
// cuadro por arista, con la normal rodando de la de la lata a la de la pared: agarra un filo de luz,
// y por ese filo se lee la junta en un carro negro, donde una línea oscura no se ve.
function cantoRodado(p) {
  const r = 0.0022;
  const nuevo = new Map();
  const vertice = (l, v) => {
    let k = nuevo.get(l);
    if (k !== undefined) return k;
    const u = p.dirU.get(v);
    const nx = p.nor[3 * l];
    const ny = p.nor[3 * l + 1];
    const nz = p.nor[3 * l + 2];
    k = p.pos.length / 3;
    p.pos.push(p.pos[3 * l] - u[3] * r * 0.8 - nx * r, p.pos[3 * l + 1] - u[4] * r * 0.8 - ny * r, p.pos[3 * l + 2] - u[5] * r * 0.8 - nz * r);
    const mx = nx * 0.25 - u[3];
    const my = ny * 0.25 - u[4];
    const mz = nz * 0.25 - u[5];
    const m = Math.hypot(mx, my, mz) || 1;
    p.nor.push(mx / m, my / m, mz / m);
    nuevo.set(l, k);
    return k;
  };
  for (const b of p.bordes) {
    if (b.g < JUNTA * 0.9) continue;
    const a2 = vertice(b.a, b.va);
    const b2 = vertice(b.b, b.vb);
    p.idx.push(b.a, a2, b2, b.a, b2, b.b);
  }
}

// El filo claro: una tira finísima sobre el canto, para las pinturas muy oscuras.
function filoClaro(p, f) {
  // De 4 mm, y poco contraste: más fino es menos de medio píxel a la distancia de la app, y se ve
  // punteado, como una costura.
  const r = 0.004;
  for (const b of p.bordes) {
    if (b.g < JUNTA * 0.9) continue;
    const ua = p.dirU.get(b.va);
    const ub = p.dirU.get(b.vb);
    const na = [p.nor[3 * b.a], p.nor[3 * b.a + 1], p.nor[3 * b.a + 2]];
    const nb = [p.nor[3 * b.b], p.nor[3 * b.b + 1], p.nor[3 * b.b + 2]];
    const P = (l, u, n, ad, sube) => [p.pos[3 * l] + u[3] * ad + n[0] * sube, p.pos[3 * l + 1] + u[4] * ad + n[1] * sube, p.pos[3 * l + 2] + u[5] * ad + n[2] * sube];
    f.cara([P(b.a, ua, na, -0.0002, 0.0003), P(b.b, ub, nb, -0.0002, 0.0003), P(b.b, ub, nb, r, 0.0003), P(b.a, ua, na, r, 0.0003)]);
  }
}

// La pared alrededor de lo que está hundido: sube del fondo hasta la lata.
function paredHundida(p, f) {
  if (!p.hundir || p.hundir < 0.01) return;
  for (const b of p.bordes) {
    const a0 = [p.pos[3 * b.a], p.pos[3 * b.a + 1], p.pos[3 * b.a + 2]];
    const b0 = [p.pos[3 * b.b], p.pos[3 * b.b + 1], p.pos[3 * b.b + 2]];
    const a1 = [p.original[3 * b.a], p.original[3 * b.a + 1], p.original[3 * b.a + 2]];
    const b1 = [p.original[3 * b.b], p.original[3 * b.b + 1], p.original[3 * b.b + 2]];
    f.cara([a0, a1, b1, b0]);
  }
}

// El grueso de lo que se abre: una pared alrededor de la puerta, que solo se ve con la puerta
// abierta. Sin ella la puerta sería una calcomanía colgando de una bisagra.
function paredGrueso(p, profBase = 0.055, desdeBase = 0.009, soloLabio = false) {
  for (const b of p.bordes) {
    if (b.otro && b.otro.grupo === p.T.grupo) continue;
    // Delante de la parrilla y de los faros, que van hundidos, un grueso de 5 cm se asoma como una
    // banda del color del carro. Ahí la lámina del capó solo tiene su labio.
    const aLaVista = !soloLabio && b.otro && (b.otro.material === 'parrilla' || b.otro.material === 'faro' || b.otro.material === 'toma');
    const prof = aLaVista ? 0.006 : profBase;
    const desde = aLaVista ? 0.002 : desdeBase;
    const i = p.pos.length / 3;
    const pa = [p.pos[3 * b.a], p.pos[3 * b.a + 1], p.pos[3 * b.a + 2]];
    const pb = [p.pos[3 * b.b], p.pos[3 * b.b + 1], p.pos[3 * b.b + 2]];
    const na = [p.nor[3 * b.a], p.nor[3 * b.a + 1], p.nor[3 * b.a + 2]];
    const nb = [p.nor[3 * b.b], p.nor[3 * b.b + 1], p.nor[3 * b.b + 2]];
    const nx = -b.ux;
    const ny = -b.uy;
    const nz = -b.uz;
    // Arranca por debajo de la tira negra: si subiera hasta la lata, en una junta vista de lado
    // se asomaría como una raya clara en vez de una línea oscura.
    p.pos.push(pa[0] - na[0] * desde, pa[1] - na[1] * desde, pa[2] - na[2] * desde, pa[0] - na[0] * prof, pa[1] - na[1] * prof, pa[2] - na[2] * prof, pb[0] - nb[0] * prof, pb[1] - nb[1] * prof, pb[2] - nb[2] * prof, pb[0] - nb[0] * desde, pb[1] - nb[1] * desde, pb[2] - nb[2] * desde);
    for (let k = 0; k < 4; k++) p.nor.push(nx, ny, nz);
    p.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
}

// Con la bisagra cerrada, lo de adentro no existe para el dedo. Tapar la junta no alcanza: un rayo casi
// paralelo a la lata (el botón Arriba contra la cintura, Izquierdo contra el capó) entra por la rendija de 2 mm,
// sigue por debajo de la lámina, que por dentro no para el rayo, y marca un vano o la cara de adentro de la puerta
// del otro lado. Con las tiras solas todavía pasaba en hasta el 0,5 % de los toques apuntados a una junta, y una
// pieza de más en la orden son 90.000 pesos. Así, lo que no se puede ver no se puede marcar.
const ABIERTA = 0.03; // radianes: menos de 2 grados es una puerta mal cerrada, no una abierta
function soloAbierta(malla, abierta) {
  malla.raycast = function (rayo, cruces) {
    if (abierta()) THREE.Mesh.prototype.raycast.call(this, rayo, cruces);
  };
}

// Funde en una sola malla lo que tiene el mismo material y el mismo papel. Las piezas del catálogo no
// (cada una se tiñe sola), ni lo transparente (cada vidrio tiene que ordenarse por su lado), ni lo que
// ya viene colocado con su matriz (la placa).
function fundirPorMaterial(padre) {
  const grupos = new Map();
  for (const m of padre.children) {
    // Las tiras de las juntas tampoco: su cuenta de triángulos dice de qué pieza es cada una (conDueno).
    if (!m.isMesh || m.userData.piezaId || m.material.transparent || m.position.lengthSq() > 0 || m.rotation.x || m.rotation.y || m.rotation.z || Object.hasOwn(m, 'raycast')) continue;
    const g = m.geometry;
    if (!g.index) continue;
    const clave = [m.material.id, m.name, Boolean(m.userData.decorativo), Boolean(m.userData.relleno), Object.keys(g.attributes).sort().join()].join('|');
    let lista = grupos.get(clave);
    if (!lista) grupos.set(clave, (lista = []));
    lista.push(m);
  }
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const atributos = Object.keys(lista[0].geometry.attributes);
    let nV = 0;
    let nI = 0;
    for (const m of lista) {
      nV += m.geometry.attributes.position.count;
      nI += m.geometry.index.count;
    }
    const salida = new THREE.BufferGeometry();
    for (const nombre of atributos) {
      const tam = lista[0].geometry.attributes[nombre].itemSize;
      const datos = new Float32Array(nV * tam);
      let o = 0;
      for (const m of lista) {
        const a = m.geometry.attributes[nombre];
        for (let i = 0; i < a.count * tam; i++) datos[o + i] = a.array[i];
        o += a.count * tam;
      }
      salida.setAttribute(nombre, new THREE.BufferAttribute(datos, tam));
    }
    const idx = new (nV > 65535 ? Uint32Array : Uint16Array)(nI);
    let oV = 0;
    let oI = 0;
    for (const m of lista) {
      const q = m.geometry.index;
      for (let i = 0; i < q.count; i++) idx[oI + i] = q.array[i] + oV;
      oV += m.geometry.attributes.position.count;
      oI += q.count;
      padre.remove(m);
      m.geometry.dispose();
    }
    salida.setIndex(new THREE.BufferAttribute(idx, 1));
    const nueva = new THREE.Mesh(salida, lista[0].material);
    nueva.name = lista[0].name;
    nueva.userData = { ...lista[0].userData };
    padre.add(nueva);
  }
}

function geometria(p, conUv = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
  if (conUv) {
    // La malla de la parrilla se proyecta de frente: una baldosa cada 9,6 cm.
    const uv = new Float32Array((p.pos.length / 3) * 2);
    for (let i = 0; i < p.pos.length / 3; i++) {
      uv[2 * i] = p.pos[3 * i] / 0.096;
      uv[2 * i + 1] = p.pos[3 * i + 1] / 0.096;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  g.setIndex(p.idx);
  return g;
}

export function construirCarroNuevo({ colorBase = 0xcfd4da, carroceria = 'sedan', medidas, placa = '', ajustes = {} } = {}) {
  const d = retocar(disposicion(carroceria, medidas, ajustes), ajustes);
  const g = proporciones(d, ajustes);
  const jaula = armarJaula(d, g);
  // La disposición que se devuelve dice lo que de verdad se dibujó.
  Object.assign(d, { piso: g.P, estriboAlto: g.E, radioRueda: g.R, arco: g.ra, ruedaX: g.ruedaX });
  const r = reflejar(jaula);
  const m0 = crearMalla(r.pos, r.caras, r.tags, r.pliegues, r.esquinas);
  // Toda arista entre dos materiales es dura: el vidrio no se funde con la lata.
  for (let e = 0; e < m0.nE; e++) {
    const f1 = m0.eF[2 * e + 1];
    if (f1 < 0) continue;
    if (r.info[m0.tag[m0.eF[2 * e]]].material !== r.info[m0.tag[f1]].material && m0.eS[e] < 3) m0.eS[e] = 3;
  }
  const m1 = subdividir(m0);
  const m2 = subdividir(m1);
  const N = normalesPorSector(m2);
  // Las piezas de adentro salen un nivel más abajo, y solo hacen falta las partes de lo que abre.
  const N1 = normalesPorSector(m1);
  alisarNormales(m1, N1, m2, N, (t) => r.info[t].material === 'pintura', VUELTAS_GRUESAS, VUELTAS_FINAS);
  const parches = separar(m2, N, r.info);
  const parches1 = separar(m1, N1, r.info, (T) => T.grupo !== 'cuerpo');

  const grupo = new THREE.Group();
  grupo.name = 'carro';
  const base = new THREE.Color(colorBase);
  const mats = crearMateriales(base, d.tipo, d);
  const seleccionables = [];
  const porId = new Map();
  const articulaciones = new Map();

  // Lo que se mueve va en un contenedor por bisagra; lo demás, en el cuerpo.
  const contenedores = new Map();
  const contenedor = (nombre) => {
    if (nombre === 'cuerpo') return grupo;
    let c = contenedores.get(nombre);
    if (!c) {
      c = new THREE.Group();
      c.name = 'bisagra-' + nombre;
      contenedores.set(nombre, c);
      grupo.add(c);
    }
    return c;
  };
  // Las tiras finas se funden en una malla por material y por bisagra: son cientos de tiritas, y
  // una malla por cada una mataría al celular en llamadas de dibujo.
  const fundidores = (mapa) => (nombre) => {
    let f = mapa.get(nombre);
    if (!f) mapa.set(nombre, (f = new Fundidor()));
    return f;
  };
  const oscuras = new Map();
  const tramosOscuros = new Map();
  const cromados = new Map();
  const serigrafias = new Map();
  const filos = new Map();
  const fundidorFilo = fundidores(filos);
  const pinturaOscura = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b < 0.04;
  const fundidorOscuro = fundidores(oscuras);
  const huecos = new Map();
  const fundidorHueco = fundidores(huecos);
  const fundidorCromo = fundidores(cromados);
  const fundidorSerigrafia = fundidores(serigrafias);
  // Cada pieza del catálogo: su malla, su material y su color. Las de adentro, con el material de
  // adentro (ver mats.interior).
  const registrar = (id, malla, nombreGrupo = 'cuerpo') => {
    if (!PIEZAS_POR_ID.has(id)) throw new Error('Pieza fuera del catálogo: ' + id);
    if (esInterior(id)) {
      // El platón se ve siempre: ver crearPlaton.
      malla.material = d.tipo === 'camioneta' && (id === 'vano-baul' || id === 'baul-int') ? mats.platon() : mats.interior();
      // El material de adentro lleva la sombra por vértice; sin el atributo saldría negro.
      if (!malla.geometry.attributes.color) conSombra(malla.geometry, sombraDePieza(id, jaula, g, d));
    }
    malla.name = id;
    malla.userData.piezaId = id;
    malla.userData.colorBase = malla.material.color.clone();
    seleccionables.push(malla);
    porId.set(id, malla);
    contenedor(nombreGrupo).add(malla);
    return malla;
  };

  const negroEstribo = new THREE.Color(0x15171a);
  for (const [, p] of parches) {
    const T = p.T;
    const destino = contenedor(T.grupo);
    if (T.material === 'faro') {
      armarFaro(p, mats, destino, d.tipo, d.adelantada);
      continue;
    }
    if (T.material === 'calavera') {
      armarCalavera(p, mats, destino, d.tipo);
      continue;
    }
    if (T.material === 'pintura' || T.material === 'hueco') {
      const f = fundidorOscuro(T.grupo);
      tiraOscura(p, f);
      if (!tramosOscuros.has(T.grupo)) tramosOscuros.set(T.grupo, []);
      tramosOscuros.get(T.grupo).push({ hasta: f.idx.length / 3, pieza: T.pieza });
    }
    // La moldura brillante de la cintura, sobre el canto de arriba de cada puerta.
    if (T.material === 'pintura' && T.grupo.startsWith('puerta') && d.tipo !== 'camioneta') {
      cintaBorde(p, fundidorCromo(T.grupo), (b) => b.otro && b.otro.material === 'negro', 0, 0.007, -0.0012);
    }
    // El marco de la parrilla: una línea brillante que le da forma. Sin ella, la parrilla es un
    // hueco negro con malla, y de lejos solo se ve el hueco.
    if (T.material === 'parrilla' && !d.adelantada) {
      const f = fundidorCromo(T.grupo);
      const marco = { sedan: 0.0055, hatchback: 0.0045, suv: 0.008, camioneta: 0.012 }[d.tipo];
      // Por arriba no va marco: el cromo sobre la orilla del capó se lee como una boca de pescado.
      cintaBorde(p, f, (b) => !(b.otro && b.otro.pieza === 'capo'), 0, marco, 0.0015);
    }
    // La franja negra del borde del parabrisas y del vidrio de atrás: el serigrafiado que tapa
    // el pegante. Sin ella, el vidrio termina en seco contra la lata y parece recortado.
    if (T.material === 'vidrio' && !T.grupo.startsWith('puerta')) cintaBorde(p, fundidorSerigrafia(T.grupo), () => true, 0, 0.03, 0.0035);
    paredHundida(p, fundidorHueco(T.grupo));
    // La tapa de la cabina adelantada se ve por el canto al abrirla: el mismo grueso en todo el borde. Con 5,5 cm contra
    // el bómper y 6 mm contra el faro, abierta le salían dientes.
    if (T.grupo !== 'cuerpo' && T.material === 'pintura') {
      if (d.adelantada && T.pieza === 'capo') paredGrueso(p, 0.036, 0.009, true);
      else paredGrueso(p);
    }
    if (T.material === 'pintura') {
      if (pinturaOscura) filoClaro(p, fundidorFilo(T.grupo));
      cantoRodado(p);
    }
    const conUv = T.material === 'parrilla' || T.material === 'toma';
    if (T.material === 'pintura') {
      // En SUV y camioneta el estribo es de plástico negro, como los pasarruedas: se sigue
      // pudiendo marcar, pero no se ve pintado.
      const plasticoAbajo = T.pieza.startsWith('estribo') && (d.tipo === 'suv' || d.tipo === 'camioneta');
      const yaEsta = porId.get(T.pieza);
      if (yaEsta) {
        // Una pieza partida en dos mallas (el techo y su riel) se tiñe entera: un solo material.
        const parte = new THREE.Mesh(geometria(p), yaEsta.material);
        parte.name = T.pieza;
        parte.userData.piezaId = T.pieza;
        destino.add(parte);
        continue;
      }
      const material = plasticoAbajo ? mats.mate(negroEstribo) : mats.pintura();
      const malla = registrar(T.pieza, new THREE.Mesh(geometria(p), material), T.grupo);
    } else {
      const malla = new THREE.Mesh(geometria(p, conUv), mats.de(T.material === 'vidrio' && T.grupo.startsWith('puerta') ? 'vidrioPuerta' : T.material));
      malla.name = T.material;
      // El vidrio para el dedo; el marco negro, el plástico y la parrilla también: si no, un
      // toque en la parrilla atraviesa la lata y marca el vano del motor. El marco de la
      // ventana es de la puerta: tocarlo marca la puerta.
      if (T.material === 'negro' && T.grupo.startsWith('puerta')) malla.userData.piezaId = T.grupo;
      // El bómper gris de la cabina adelantada: es lo que el dueño llama bómper, y un toque ahí tiene que marcarlo.
      if (T.material === 'parachoques') malla.userData.piezaId = 'bomper-del';
      // Y en la tapa de la cabina adelantada la parrilla es parte de la tapa: tocarla marca el capó.
      if (T.material === 'parrilla' && d.adelantada) malla.userData.piezaId = 'capo';
      destino.add(malla);
    }
  }
  // Cada bisagra pide sus fundidores, y no todas los llenan: una malla sin un solo vértice no sirve para nada, y
  // eran hasta 6 por carro.
  for (const [nombre, f] of cromados) {
    if (!f.n) continue;
    const malla = new THREE.Mesh(f.geometria(), mats.de('cromo'));
    malla.name = 'cromo';
    malla.userData.decorativo = true;
    contenedor(nombre).add(malla);
  }
  for (const [nombre, f] of serigrafias) {
    if (!f.n) continue;
    const malla = new THREE.Mesh(f.geometria(), mats.de('negro'));
    malla.name = 'serigrafia';
    // Para el dedo: es parte del vidrio. Arranca un poco antes que él, y de adorno, por ese filo el
    // rayo entraba a la cabina y salía por el vano del baúl.
    malla.userData.relleno = true;
    contenedor(nombre).add(malla);
  }
  for (const [nombre, f] of filos) {
    if (!f.n) continue;
    const malla = new THREE.Mesh(f.geometria(), mats.de('filo'));
    malla.name = 'filo';
    malla.userData.decorativo = true;
    contenedor(nombre).add(malla);
  }
  // Las paredes de la parrilla y de las tomas, negras de verdad: del tono de la junta, la de abajo,
  // que mira al cielo, salía como una raya del color del carro al pie de la boca. Sin decorativo: cierran
  // el hueco, y el rayo que las cruzaba marcaba el vano del motor.
  for (const [nombre, f] of huecos) {
    if (!f.n) continue;
    const malla = new THREE.Mesh(f.geometria(), mats.de('bisel'));
    malla.name = 'juntas';
    malla.userData.relleno = true;
    contenedor(nombre).add(malla);
  }
  for (const [nombre, f] of oscuras) {
    if (!f.n) continue;
    const malla = new THREE.Mesh(f.geometria(), mats.de('junta'));
    malla.name = 'juntas';
    malla.userData.relleno = true;
    conDueno(malla, tramosOscuros.get(nombre), porId);
    contenedor(nombre).add(malla);
  }

  // El forro de adentro: la misma jaula, encogida y vista por detrás. Con las caras al revés no
  // estorba desde afuera (ni con la puerta abierta): solo se ve el lado lejano, oscuro, a través de
  // un vidrio o de un hueco. Sin esto, por el vidrio se ve el piso. Al revés en la malla y no con
  // BackSide en el material: BackSide es un programa de sombreado más, y solo lo usaba el forro.
  {
    const N0 = normalesPorSector(m0);
    const pos = [];
    const nor = [];
    const idx = [];
    for (let f = 0; f < m0.nF; f++) {
      const material = r.info[m0.tag[f]].material;
      if (r.sinForro[f] || material === 'vidrio' || material === 'hueco' || material === 'faro' || material === 'calavera') continue;
      const b = pos.length / 3;
      for (let q = 4 * f; q < 4 * f + 4; q++) {
        const gr = N0.grupo[q];
        const v = m0.fV[q];
        const nx = N0.normal[3 * gr];
        const ny = N0.normal[3 * gr + 1];
        const nz = N0.normal[3 * gr + 2];
        // Bien adentro: tiene que tapar, vistas desde la cabina, las caras interiores de las
        // puertas y los marcos, que son de tono claro. Por el vidrio se veían como manchas.
        pos.push(m0.P[3 * v] - nx * 0.1, m0.P[3 * v + 1] - ny * 0.1, m0.P[3 * v + 2] - nz * 0.1);
        nor.push(-nx, -ny, -nz);
      }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const go = new THREE.BufferGeometry();
    go.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    go.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    go.setIndex(idx);
    const forro = new THREE.Mesh(go, mats.de('forro'));
    forro.name = 'forro';
    // Sin decorativo: para el dedo también. Mira hacia adentro, así que desde afuera no estorba, y el rayo que se
    // cuele por una rendija se queda aquí y no sigue hasta la lata del otro lado.
    forro.userData.relleno = true;
    grupo.add(forro);
  }

  grupo.add(
    crearRuedas(d.tipo, g.R, g.anchoLlanta, [
      [g.ruedaX, g.R, d.ejeDel, false],
      [-g.ruedaX, g.R, d.ejeDel, true],
      [g.ruedaX, g.R, d.ejeTras, false],
      [-g.ruedaX, g.R, d.ejeTras, true],
    ]),
  );

  ponerDetalles({ d, g, jaula, grupo, contenedor, parches, porId, mats, placa, registrar });
  ponerInteriores({ d, g, jaula, grupo, contenedor, parches: parches1, porId, mats, registrar });

  // Lo que no es pieza y comparte material se funde: de unas 160 mallas pasa a unas 125, y la cuenta
  // que le pesa a un celular son las llamadas de dibujo, no los triángulos.
  fundirPorMaterial(grupo);
  for (const c of contenedores.values()) fundirPorMaterial(c);

  // ---- Bisagras ----
  // El contenedor se vuelve pivote: se corre a la bisagra y sus mallas se corren al revés.
  const articular = (id, nombreGrupo, { bisagra, eje, signo, max, referencia }) => {
    const pivote = contenedores.get(nombreGrupo);
    if (!pivote) return;
    pivote.position.set(...bisagra);
    for (const hijo of pivote.children) {
      hijo.position.x -= bisagra[0];
      hijo.position.y -= bisagra[1];
      hijo.position.z -= bisagra[2];
    }
    articulaciones.set(id, {
      pivote,
      eje,
      signo,
      max,
      referencia: new THREE.Vector3(...referencia),
      get angulo() {
        return Math.abs(pivote.rotation[eje]);
      },
      fijar(angulo) {
        pivote.rotation[eje] = signo * Math.max(0, Math.min(max, angulo));
      },
    });
  };
  for (const [lado, signo] of [
    ['izq', -1],
    ['der', 1],
  ]) {
    const yB = (g.E + d.cintura) / 2;
    articular('puerta-del-' + lado, 'puerta-del-' + lado, {
      bisagra: [signo * (g.W - 0.005), yB, jaula.zPd],
      eje: 'y',
      signo,
      max: 1.05,
      referencia: [0, 0, d.puertaMedia - jaula.zPd],
    });
    articular('puerta-tras-' + lado, 'puerta-tras-' + lado, {
      bisagra: [signo * (g.W - 0.005), yB, d.puertaMedia],
      eje: 'y',
      signo,
      max: 1.05,
      referencia: [0, 0, d.puertaTras - d.puertaMedia],
    });
  }
  // La tapa de la cabina adelantada cuelga de su borde de arriba, como la de verdad, y por eso el borde libre es el de
  // abajo. Hasta 60°: con más, su revés queda mirando al piso y ninguna cámara de la app lo alcanza, y es pieza que se cobra.
  articular(
    'capo',
    'capo',
    d.adelantada
      ? { bisagra: [0, jaula.tapa.y, jaula.tapa.z], eje: 'x', signo: 1, max: 1.05, referencia: [0, -jaula.tapa.alto, -jaula.tapa.avance] }
      : { bisagra: [0, g.yCapoTras - 0.01, d.capoTras - 0.1], eje: 'x', signo: 1, max: 0.85, referencia: [0, 0, -(d.capoTras - d.capoDel)] },
  );
  if (d.tipo === 'sedan') {
    articular('baul', 'baul', {
      bisagra: [0, d.cintura + 0.07, jaula.zBisagraBaul],
      eje: 'x',
      signo: -1,
      max: 1.0,
      referencia: [0, 0, d.cola - jaula.zBisagraBaul],
    });
  } else if (d.tipo === 'camioneta') {
    articular('baul', 'baul', {
      bisagra: [0, jaula.yBisagraBaul, d.compuertaZ - 0.02],
      eje: 'x',
      signo: 1,
      max: 1.5,
      referencia: [0, d.cintura - jaula.yBisagraBaul, 0],
    });
  } else {
    articular('baul', 'baul', {
      bisagra: [0, g.H - 0.03, d.techoTras],
      eje: 'x',
      signo: -1,
      max: 1.2,
      referencia: [0, -(g.H - d.cintura), d.compuertaZ - d.techoTras],
    });
  }

  // ---- Lo de adentro, solo con algo abierto ----
  const abierta = (...bisagras) => () => bisagras.some((id) => articulaciones.get(id)?.angulo > ABIERTA);
  const seVeCon = {};
  for (const lado of ['izq', 'der']) {
    const del = 'puerta-del-' + lado;
    const tras = 'puerta-tras-' + lado;
    seVeCon[del + '-int'] = abierta(del);
    seVeCon[tras + '-int'] = abierta(tras);
    seVeCon['marco-' + lado] = seVeCon['base-puertas-' + lado] = abierta(del, tras);
  }
  seVeCon['capo-int'] = seVeCon['vano-motor'] = abierta('capo');
  // El platón de una pick-up se ve sin abrir nada: su piso y el revés de la compuerta se tocan siempre.
  if (d.tipo !== 'camioneta') seVeCon['baul-int'] = seVeCon['vano-baul'] = abierta('baul');
  // Por malla y no por pieza: una pieza puede ir partida en varias, y las que no están en porId también marcan.
  grupo.traverse((o) => {
    if (o.isMesh && seVeCon[o.userData.piezaId]) soloAbierta(o, seVeCon[o.userData.piezaId]);
  });

  // Depuración: la jaula en alambre, con ?jaula=1 en la dirección.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('jaula')) {
    const lineas = [];
    for (const c of r.caras) {
      for (let k = 0; k < c.length; k++) {
        const a = c[k];
        const b = c[(k + 1) % c.length];
        lineas.push(r.pos[3 * a], r.pos[3 * a + 1], r.pos[3 * a + 2], r.pos[3 * b], r.pos[3 * b + 1], r.pos[3 * b + 2]);
      }
    }
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
    grupo.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: 0x00ffaa })));
  }
  // Todo lo que pide menos reflejo del que da el cuarto (ver conEntorno).
  grupo.traverse((o) => {
    if (o.isMesh && o.material.isMeshStandardMaterial && o.material.envMapIntensity !== 1) conEntorno(o);
  });
  grupo.updateMatrixWorld(true);
  return { grupo, seleccionables, porId, articulaciones, disposicion: d };
}
