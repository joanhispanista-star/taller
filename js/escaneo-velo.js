// El velo de una pieza marcada sobre un escaneo con foto: un borde limpio y un
// relleno suave, que dejan ver la lata de verdad debajo (el golpe, el rayón).
//
// Las etiquetas van por vértice, y una orilla de triángulos de 2 cm es un diente de
// sierra por bien repartidas que estén. Aquí la orilla no son triángulos: cada vértice
// lleva qué tan adentro de la pieza está (1 adentro, 0 afuera), ese número se suaviza
// sobre la malla, y la línea se dibuja donde vale 0,5. Sale una curva limpia, siempre
// del mismo grosor en pantalla, aunque los triángulos de abajo sean feos.
import * as THREE from 'three';

// Los vértices que están en el mismo sitio (una malla con textura los repite donde
// cambia de foto) forman un solo grupo.
export function soldarVertices(posiciones) {
  const n = posiciones.length / 3;
  const grupo = new Int32Array(n);
  const vistos = new Map();
  let cuantos = 0;
  for (let v = 0; v < n; v++) {
    // A 0,1 mm, en ±6,5 m: 17 bits por eje caben en un número de 51 bits.
    const clave = (Math.round(posiciones[v * 3] * 1e4) + 65536) * 17179869184 + (Math.round(posiciones[v * 3 + 1] * 1e4) + 65536) * 131072 + (Math.round(posiciones[v * 3 + 2] * 1e4) + 65536);
    let g = vistos.get(clave);
    if (g === undefined) {
      g = cuantos++;
      vistos.set(clave, g);
    }
    grupo[v] = g;
  }
  return { grupo, cuantos };
}

// Soldar cuesta (un Map con todos los vértices): una vez por escaneo.
const SOLDADOS = new WeakMap();
function soldadoDe(escaneo) {
  let s = SOLDADOS.get(escaneo);
  if (!s) {
    s = soldarVertices(escaneo.posiciones);
    SOLDADOS.set(escaneo, s);
  }
  return s;
}

// La misma regla que parte la malla en piezas: la mayoría de los tres vértices.
function etiquetaDeTriangulo(etiquetas, a, b, c) {
  const ea = etiquetas[a];
  const eb = etiquetas[b];
  const ec = etiquetas[c];
  return ea === eb || ea === ec ? ea : eb === ec ? eb : ea;
}

const MARGEN = 0.25; // hasta dónde llega el suavizado por fuera de la pieza, de sobra
const VUELTAS = 40; // medido: un serrucho de ±4 cm queda en ±3 mm, y las esquinas redondeadas como las de una puerta (14 vueltas dejaban ±1,2 cm; con la línea clara, 26 todavía temblaba a la vista)
// Un carro de catálogo trae sus etiquetas puestas a mano, sin serrucho que quitar: con 40 el borde se corría (el velo del estribo se salía
// a las puertas, un 38 % de lo teñido), y son hasta 17 piezas pagadas de un solo golpe en cuanto llega el modelo.
const VUELTAS_DE_CATALOGO = 10;

// Por vértice del escaneo, qué tan adentro de la pieza está, y los triángulos donde
// hay algo que dibujar. Solo se trabaja cerca de la pieza: un escaneo de 500 mil
// triángulos no puede tardar en cada toque lo que tarda recorrerlo entero 26 veces.
export function campoDePieza(escaneo, id, vueltas = VUELTAS) {
  const { posiciones: P, indices: I, etiquetas: E, nombres } = escaneo;
  const etiqueta = nombres.indexOf(id);
  const n = P.length / 3;
  const campoSalida = new Float32Array(n);
  if (etiqueta < 0) return { campo: campoSalida, triangulos: [] };
  const { grupo, cuantos } = soldadoDe(escaneo);
  // La caja de la pieza.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let alguno = false;
  for (let t = 0; t < I.length; t += 3) {
    if (etiquetaDeTriangulo(E, I[t], I[t + 1], I[t + 2]) !== etiqueta) continue;
    alguno = true;
    for (let k = 0; k < 3; k++) {
      const v = I[t + k];
      for (let e = 0; e < 3; e++) {
        const p = P[v * 3 + e];
        if (p < min[e]) min[e] = p;
        if (p > max[e]) max[e] = p;
      }
    }
  }
  if (!alguno) return { campo: campoSalida, triangulos: [] };
  // Los triángulos de la región, y lo que aporta cada grupo de vértices.
  const region = [];
  const suma = new Float32Array(cuantos);
  const cuenta = new Float32Array(cuantos);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t];
    let cerca = false;
    for (let k = 0; k < 3 && !cerca; k++) {
      const v = I[t + k];
      cerca = P[v * 3] > min[0] - MARGEN && P[v * 3] < max[0] + MARGEN && P[v * 3 + 1] > min[1] - MARGEN && P[v * 3 + 1] < max[1] + MARGEN && P[v * 3 + 2] > min[2] - MARGEN && P[v * 3 + 2] < max[2] + MARGEN;
    }
    if (!cerca) continue;
    region.push(t);
    const adentro = etiquetaDeTriangulo(E, a, I[t + 1], I[t + 2]) === etiqueta ? 1 : 0;
    for (let k = 0; k < 3; k++) {
      const g = grupo[I[t + k]];
      suma[g] += adentro;
      cuenta[g]++;
    }
  }
  let campo = new Float32Array(cuantos);
  for (let g = 0; g < cuantos; g++) if (cuenta[g]) campo[g] = suma[g] / cuenta[g];
  // Suavizar: cada vértice se acerca al promedio de sus vecinos. Una arista compartida
  // cuenta dos veces, y eso da igual: todas las de adentro cuentan dos.
  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    suma.fill(0);
    cuenta.fill(0);
    for (const t of region) {
      const a = grupo[I[t]];
      const b = grupo[I[t + 1]];
      const c = grupo[I[t + 2]];
      suma[a] += campo[b] + campo[c];
      suma[b] += campo[a] + campo[c];
      suma[c] += campo[a] + campo[b];
      cuenta[a] += 2;
      cuenta[b] += 2;
      cuenta[c] += 2;
    }
    const nuevo = new Float32Array(cuantos);
    for (let g = 0; g < cuantos; g++) nuevo[g] = cuenta[g] ? 0.35 * campo[g] + (0.65 * suma[g]) / cuenta[g] : campo[g];
    campo = nuevo;
  }
  // Una pieza chica para sus triángulos (un espejo, un guardafango sobre una malla rala) se
  // diluye al suavizar y no llega a 0,5, donde van la línea y el relleno: quedaba marcada en la
  // lista sin pintarse nada en el carro (en el espejo del Moskvitch, 0,36). Se sube hasta su propio
  // pico, y la línea cae a media altura de él. Las piezas normales llegan a 0,97 o más y no se tocan.
  let pico = 0;
  for (const t of region) {
    if (etiquetaDeTriangulo(E, I[t], I[t + 1], I[t + 2]) !== etiqueta) continue;
    for (let k = 0; k < 3; k++) pico = Math.max(pico, campo[grupo[I[t + k]]]);
  }
  if (pico > 0 && pico < 0.75) for (let g = 0; g < cuantos; g++) campo[g] = Math.min(1, campo[g] / pico);
  for (let v = 0; v < n; v++) campoSalida[v] = campo[grupo[v]];
  // Basta con lo que llega a verse: la línea va en 0,5 y su halo no pasa de ahí.
  const triangulos = region.filter((t) => campoSalida[I[t]] > 0.03 || campoSalida[I[t + 1]] > 0.03 || campoSalida[I[t + 2]] > 0.03);
  return { campo: campoSalida, triangulos };
}

const VERTICE = `attribute float aCampo; varying float vC; varying vec2 vU;
void main(){ vC = aCampo; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// fwidth pasa el campo a píxeles de pantalla: la línea mide lo mismo de cerca y de
// lejos. El relleno es más fuerte junto a la orilla que en el centro: tiene que verse
// de un vistazo cuál pieza es, y también lo que tiene encima.
//
// El relleno es el color del estado con la luz de la foto: un naranja sobre un carro
// azul se mezclaba en rosa salmón ("¿me la van a pintar de rosado?"), y sobre uno
// vinotinto en otra cosa. Así, naranja es naranja en cualquier carro, y se sigue viendo
// el golpe y la manija. Se usa la raíz de la luz (la foto va en lineal): si no, en una
// pintura oscura el color se apaga.
const FRAGMENTO = `precision highp float;
uniform vec3 uColor; uniform float uRelleno; uniform sampler2D uFoto; varying float vC; varying vec2 vU;
void main(){
  float w = max(fwidth(vC), 1e-4);
  float d = abs(vC - 0.5) / w;
  float dentro = smoothstep(-1.0, 1.0, (vC - 0.5) / w);
  float linea = 1.0 - smoothstep(1.2, 2.3, d);
  float halo = (1.0 - smoothstep(1.5, 11.0, d)) * 0.3;
  float relleno = dentro * mix(uRelleno + 0.14, uRelleno, smoothstep(0.55, 0.97, vC));
  float borde = max(linea * 0.95, halo);
  float a = max(borde, relleno);
  if (a < 0.004) discard;
  #ifdef SIN_FOTO
    vec3 tono = uColor;
  #else
    vec3 foto = texture2D(uFoto, vU).rgb;
    float luz = sqrt(dot(foto, vec3(0.2126, 0.7152, 0.0722)));
    vec3 tono = uColor * (0.32 + 1.05 * luz);
  #endif
  // La línea va más clara que el relleno: con el relleno ya naranja de verdad, una línea del mismo
  // color se perdía, y tres piezas marcadas seguidas se leían como una sola mancha.
  vec3 color = mix(tono, uColor, halo / max(a, 1e-4));
  gl_FragColor = vec4(mix(color, mix(uColor, vec3(1.0), 0.4), linea), a);
  #include <colorspace_fragment>
}`;

// Un carro de catálogo es el mismo objeto para todas las Captivas y para cada vez que se vuelve a armar: el campo se calcula una vez.
const CAMPOS = new WeakMap();
export function campoGuardado(escaneo, id) {
  let campos = CAMPOS.get(escaneo);
  if (!campos) CAMPOS.set(escaneo, (campos = new Map()));
  if (!campos.has(id)) campos.set(id, campoDePieza(escaneo, id, VUELTAS_DE_CATALOGO));
  return campos.get(id);
}

// La malla del velo de una pieza. Sus coordenadas son las del escaneo: va en el mismo
// grupo del carro. Va encima de la lata (sin escribir profundidad) y el dedo la atraviesa.
// `foto`: la textura del escaneo. Sin foto, el relleno es el color pleno.
export function crearVelo(escaneo, id, color, { relleno = 0.85, foto = null } = {}) {
  const { campo, triangulos } = escaneo.catalogo ? campoGuardado(escaneo, id) : campoDePieza(escaneo, id);
  if (!triangulos.length) return null;
  const { posiciones: P, indices: I, uvs: UV = null } = escaneo;
  // Solo los vértices que usa: un arreglo por pieza del tamaño del carro entero sería
  // memoria de GPU para nada.
  const local = new Map();
  const indices = new Uint32Array(triangulos.length * 3);
  let k = 0;
  for (const t of triangulos) {
    for (let e = 0; e < 3; e++) {
      const v = I[t + e];
      let u = local.get(v);
      if (u === undefined) {
        u = local.size;
        local.set(v, u);
      }
      indices[k++] = u;
    }
  }
  const posiciones = new Float32Array(local.size * 3);
  const valores = new Float32Array(local.size);
  const coordenadas = new Float32Array(local.size * 2);
  for (const [v, u] of local) {
    posiciones[u * 3] = P[v * 3];
    posiciones[u * 3 + 1] = P[v * 3 + 1];
    posiciones[u * 3 + 2] = P[v * 3 + 2];
    valores[u] = campo[v];
    if (UV) {
      coordenadas[u * 2] = UV[v * 2];
      coordenadas[u * 2 + 1] = UV[v * 2 + 1];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('aCampo', new THREE.BufferAttribute(valores, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(coordenadas, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uRelleno: { value: relleno }, uFoto: { value: foto } },
    defines: foto ? {} : { SIN_FOTO: 1 },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
  });
  const velo = new THREE.Mesh(geo, material);
  velo.name = 'velo-' + id;
  velo.userData.decorativo = true;
  velo.raycast = () => {};
  velo.renderOrder = 2;
  return velo;
}
