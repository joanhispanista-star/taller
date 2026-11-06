// La pintura del carro. En la app de un taller de pintura, el color no es un adorno: el dueño le
// muestra el carro al cliente, y un rojo que sale vinotinto es un defecto de función.
//
// Dos cosas sacaban el color de su sitio:
//
//   1. El tono ACES del visor: oscurece, satura y mezcla los canales. Un b8232a pintado tal cual sale
//      142,0,23. Se calcula al revés: qué luz tiene que salir de la lata para que, después del tono,
//      se vea el color pedido (ver colorCalibrado).
//   2. El reflejo del cuarto del visor en la laca. Visto a ras, dejaba el capó casi blanco en los
//      botones Frente y Atrás. La laca ya no refleja ese cuarto: refleja un estudio oscuro con dos
//      luces de borde limpio (ver LUZ_Y_LACA).
//
// Medido en el banco, con la cámara de cada botón de la app (mediana de un parche central del panel):
//
//                     pedido        capó en Frente, antes -> ahora    baúl en Atrás, antes -> ahora
//   rojo            184,35,42    247,203,200 -> 184,35,42          246,114,104 -> 188,38,44
//   negro            20,22,26    191,191,193 ->  34,35,38            69,72,78  ->  27,29,33
//   blanco        242,243,244    240,240,241 -> 239,240,240        238,238,239 -> 235,236,237
//   amarillo taxi   245,196,0    249,236,201 -> 245,196,3          249,225,127 -> 246,199,8
//
// De 693 parches (7 colores, 6 vistas, 4 carrocerías; a menos de 45 niveles del pedido, y sin pasar de 75
// en capó y baúl de negro y gris) estaban bien 474 y ahora 693. En 56 cámaras libres alrededor del carro,
// 4 colores y 2 carrocerías, 2 de 2.066 se pasan por poco: el azul de un baúl de taxi, en 52 de 45.
// Si cambian las curvas del tono o la exposición del visor, hay que volver a medir. Las luces y el cuarto
// del visor ya no le mueven el color: esta pintura no pasa por ellos.
import * as THREE from 'three';

const { lerp, smoothstep } = THREE.MathUtils;

// ---- El tono al revés ----
// ACESFilmicToneMapping de three, con la exposición del visor.
const EXPOSICION = 1.05;
const ENTRADA = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];
const SALIDA = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];
const por = (M, v) => M.map((f) => f[0] * v[0] + f[1] * v[1] + f[2] * v[2]);
function inversa([[a, b, c], [d, e, f], [g, h, i]]) {
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}
const ENTRADA_INV = inversa(ENTRADA);
const SALIDA_INV = inversa(SALIDA);
function curvaInversa(y) {
  const a = 1 - 0.983729 * y;
  const b = 0.0245786 - 0.432951 * y;
  const c = -(0.000090537 + 0.238081 * y);
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
}
// Qué luz (lineal, antes del tono) hay que mandar para que en pantalla salga este color.
function luzParaVer(lineal) {
  // Un color de pantalla muy saturado no siempre se alcanza: se topa un poco antes del blanco,
  // porque la inversa de la curva se dispara cerca de 1.
  const t = lineal.map((x) => Math.min(0.97, x));
  const antes = por(SALIDA_INV, t).map((x) => curvaInversa(Math.max(0, x)));
  // Sin topar en cero: un amarillo taxi pide algo de azul NEGATIVO, porque el tono mezcla los canales
  // y con cero de azul lo devuelve con azul (pedido 245,196,0, puerta 220,170,39). Al sombreador no le
  // molesta un color negativo.
  return por(ENTRADA_INV, antes).map((x) => (x * 0.6) / EXPOSICION);
}

// Cuánto de cada unidad de color devuelve una puerta. No es física: es la escala del color de la base,
// porque `resaltar` (js/carro.js) lo mezcla con el acento y `userData.colorBase` lo guarda.
const RESPUESTA = 0.76;

function colorCalibrado(color, claro) {
  // Un blanco tiene que dejarle sitio a la luz de arriba y a la sombra de abajo: con la puerta ya en
  // 242, capó y puerta son el mismo blanco quemado y al carro se le va la forma. Unos niveles abajo,
  // en la puerta, se le ve.
  const techo = lerp(1, 0.91, claro);
  const luz = luzParaVer([color.r * techo, color.g * techo, color.b * techo]);
  // Lo único que se topa es lo que se dispara: un azul puro pide una base de 4, que el tono no devuelve.
  const mayor = Math.max(Math.abs(luz[0]), Math.abs(luz[1]), Math.abs(luz[2]));
  const k = RESPUESTA * Math.max(1, mayor / 3.2);
  return new THREE.Color(luz[0] / k, luz[1] / k, luz[2] / k);
}

// El reparto de la pintura según el color. Ningún color lleva `metalness`: un metal refleja el cuarto
// borroso, y eso era el velo lechoso. Lo que un metalizado sí tiene es "flop" (mirando a la luz se aviva,
// y mirando a lo oscuro se apaga), y eso se hace en el sombreador. `metal` dice cuánto.
function recetaPintura(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const saturacion = max > 0 ? (max - min) / max : 0;
  const Y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  // "Claro" es un blanco o casi. Un amarillo taxi es igual de luminoso pero no tiene sombra que
  // guardarse: con la luz de arriba de un blanco, su capó perdía el amarillo.
  const claro = smoothstep(Y, 0.42, 0.75) * (1 - smoothstep(saturacion, 0.1, 0.5));
  const gris = 1 - smoothstep(saturacion, 0.08, 0.3);
  const medio = smoothstep(Y, 0.01, 0.06) * (1 - claro);
  const oscuro = 1 - smoothstep(Y, 0.02, 0.14);
  return { metal: gris * medio, claro, saturacion, oscuro };
}

// ---- La laca ----
// La pintura no pasa por las luces del visor ni por su cuarto (RoomEnvironment). Ese cuarto es parejo
// y claro: reflejado en un capó visto a ras lo lavaba, y reflejado borroso, con el borde ondulado, se
// veía satinado: lo que un latonero llama lata mal trabajada. Aquí la luz y el reflejo se calculan con
// una cuenta corta, como en un estudio de fotografía de carros:
//
//   - la base: el color, con una luz casi pareja. Es lo que garantiza que el dueño vea SU color.
//   - la laca, oscura casi toda: el piso y las paredes de un estudio son negros, y por eso el color se
//     ve profundo. Encima, el cielo: tenue y teñido de la pintura, para que aclare sin lavar.
//   - la franja: una luz larga con borde limpio, que corre por el hombro de las puertas.
//   - la caja de arriba: la misma idea para capó, techo y baúl.
//
// Las dos luces tienen filo de cuchillo: un borde limpio, lo más brillante justo ahí, y se apagan hacia
// un lado. Así, cuando un panel casi plano las abre (su reflejo cambia poco de un punto a otro), se lee
// una línea que se desvanece y no un parche que lo tapa. Una luz pareja con los mismos bordes dejaba una
// cúpula gris sobre la parrilla de un carro negro.
//
// De paso es más liviano: sin mapas de cubo ni luces por píxel, en lo que más pantalla ocupa (un cuadro
// de 7,3 a 6,2 ms en este PC con GPU Intel, a 780x952; en un celular no se ha medido). Y todos los colores
// comparten un programa, porque lo que cambia va en uniformes: cambiar de color no compila nada.
//
// OJO: esto va dentro de una plantilla de JavaScript. Una comilla invertida en un comentario la rompe.
const LUZ_Y_LACA = `
  vec3 nM = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 pM = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
  vec3 vM = normalize( cameraPosition - pM );
  float nv = saturate( dot( nM, vM ) );
  vec3 rM = reflect( - vM, nM );
  // Un borde limpio es de un píxel, a cualquier distancia; más delgado que eso, sale punteado.
  float aR = max( 0.006, fwidth( rM.y ) );
  float sobreH = smoothstep( - aR, aR, rM.y );
  // De la punta para atrás, de 0 a 1: lo que en la nariz no se prende. Ahí la lata se curva hacia todos los lados a la
  // vez, y cualquier reflejo con borde sale ondulado: un latonero lo lee como lata abollada.
  float sinNariz = smoothstep( uNariz + 0.15, uNariz + 0.75, pM.z );

  // ---- La base ----
  // Lo que mira arriba recibe algo más, lo que mira abajo algo menos, y a ras se oscurece: eso le da
  // volumen a un color sin moverlo. En un blanco hay que abrirlo mucho más, porque el tono aplasta el
  // rango de arriba: de 225 a 240 en pantalla hay casi el doble de luz.
  float luz = mix( mix( 1.0, uAlto, smoothstep( 0.05, 0.85, nM.y ) ), uBajo, smoothstep( 0.0, 0.6, - nM.y ) );
  luz *= mix( uCanto, 1.0, smoothstep( 0.0, 0.75, nv ) );
  luz *= mix( uSuelo, 1.0, smoothstep( 0.1, 0.42, pM.y / uAlturas.x ) );
  // El metalizado. Sin esto un plata se ve de arcilla.
  luz *= mix( uFlop.x, uFlop.y, smoothstep( - 0.45, 0.55, rM.y ) );
  // Y una línea de horizonte: en un blanco, donde un reflejo apenas se nota, es lo que dibuja la lata.
  // Solo cerca del horizonte: visto desde arriba, un bómper blanco se apagaba hasta 194.
  // Y no en la nariz: en un blanco salía como un arco alrededor de la boca.
  luz *= mix( mix( 1.0, uHorizonte, sinNariz ), 1.0, max( sobreH, smoothstep( 0.45, 0.8, - rM.y ) ) );

  // ---- La laca ----
  // A ras refleja más, y se topa: de verdad llega a 1, y eso era el techo lavado visto de lejos.
  float q = 1.0 - nv;
  float q2 = q * q;
  float fresnel = 0.04 + ( uF90 - 0.04 ) * q2 * q2 * q;

  // Las paredes y el cielo: casi nada cerca del horizonte, porque ahí es donde un capó visto a ras
  // refleja más, y más arriba va subiendo a medida que la laca refleja menos.
  float arribaR = max( rM.y, 0.0 );
  float cielo = uCielo * arribaR * sqrt( arribaR );
  // El piso: oscuro, con un brillo tenue justo antes del horizonte, y ahí termina en línea limpia. Es
  // lo que le da forma a una puerta negra.
  // En la nariz no: terminaba debajo de los faros, y en un carro negro se leía como un bigote oscuro.
  float piso = uPiso * ( 1.0 + 4.0 * sinNariz * smoothstep( - 0.3, - 0.02, rM.y ) * ( 1.0 - sobreH ) );

  // Dónde mira la lata: de lado o hacia arriba. Cada una con su luz.
  float deLado = 1.0 - smoothstep( 0.5, 0.75, abs( nM.y ) );

  float franja = smoothstep( uFranja.x - aR, uFranja.x + aR, rM.y ) * ( 1.0 - smoothstep( uFranja.x, uFranja.y, rM.y ) );
  franja *= deLado * smoothstep( 0.1, 0.3, nv );
  // Más fuerte de lado: es la que corre por el hombro. En la cara de atrás y en el bómper es solo una
  // sonrisa debajo de la placa, y con toda la fuerza se volvía el dibujo principal de la cola.
  franja *= mix( 0.55, 1.0, smoothstep( 0.2, 0.7, abs( nM.x ) ) );
  // Es de la lata de abajo: en los parales, tan delgados, ocupaba todo el ancho.
  franja *= 1.0 - smoothstep( uAlturas.y, uAlturas.y + 0.06, pM.y );
  // Ni en la nariz: salía como manchas debajo de los faros del hatchback.
  franja *= sinNariz;

  float caja = smoothstep( uCaja.x - aR, uCaja.x + aR, rM.y ) * ( 1.0 - smoothstep( uCaja.x, uCaja.y, rM.y ) );
  // Y otra más alta, la que se ve desde arriba: dibuja una U limpia en la parte curva del capó.
  caja += 0.7 * smoothstep( uCaja2.x - aR, uCaja2.x + aR, rM.y ) * ( 1.0 - smoothstep( uCaja2.x, uCaja2.y, rM.y ) );
  caja *= ( 1.0 - deLado ) * smoothstep( 0.22, 0.36, nv );
  // Con la cámara baja, el techo se ve de canto: es una tira delgada, y con la luz encima es todo luz.
  caja *= 1.0 - ( 1.0 - smoothstep( 0.14, 0.22, vM.y ) ) * smoothstep( uAlturas.y + 0.02, uAlturas.y + 0.08, pM.y );
  // Topada a ras: sin esto, en Frente el techo era pura luz (rojo pedido, 203,125,124).
  caja *= min( 1.0, 0.1 / fresnel );
  // Y se apaga antes de la nariz. Era una cúpula sobre la parrilla con el borde ondulado. Capó de un sedán en Frente,
  // lo más que se aparta una ventana de 31x31 del centro: rojo, de 54 niveles a 12; negro, de 42 a 7; taxi, de 70 a
  // 17. Desde Inicio el brillo sigue, en la mitad de atrás del capó.
  caja *= smoothstep( uNariz + 0.3, uNariz + 1.0, pM.z );

  // Marcada: resaltar (js/carro.js) le prende el emissive.
  vec3 colorBase = diffuseColor.rgb;
  vec3 tinte = uTinte;
  float mayorE = max( emissive.r, max( emissive.g, emissive.b ) );
  if ( mayorE > 0.0005 ) {
    // resaltar mezcla el color calibrado con el acento a mitad de camino. En un blanco, cuya base pasa
    // de 1, eso da un naranja salmón; y con la luz de arriba de un blanco, un capó verde sale blanco.
    // Marcada se ve del acento sobre cualquier pintura, y lo poco del color propio basta para que se
    // siga leyendo como la misma lata.
    colorBase = mix( emissive / mayorE * 0.8, uPropio, 0.22 );
    #ifdef USE_COLOR
      colorBase *= vColor;
    #endif
    luz = mix( 0.88, 1.0, smoothstep( - 0.4, 0.8, nM.y ) ) * mix( 0.85, 1.0, smoothstep( 0.0, 0.75, nv ) );
    tinte = vec3( 1.0 );
  }

  // Lo que se ve en la laca. El cielo y el piso van teñidos de la pintura: aclaran sin lavar, y un taxi
  // no se vuelve mostaza. La luz de estudio sí es blanca.
  vec3 reflejo = ( cielo + piso ) * tinte + vec3( franja * uFuerza.x + caja * uFuerza.y );
  // La base pierde algo de lo que gana la laca, pero no todo: entera, un capó rojo visto a ras caía a 155
  // de 184 pedido, porque este estudio casi no le devuelve nada con el reflejo.
  reflectedLight.indirectDiffuse = colorBase * luz * ${RESPUESTA.toFixed(3)} * ( 1.0 - 0.6 * fresnel );
  reflectedLight.indirectSpecular = reflejo * fresnel;
`;

// Los comentarios del sombreador se quitan antes de compilar: llevan tildes, y no todos los controladores
// de un celular las aguantan en el código de un sombreador.
function parchePintura(uniformes) {
  return (s) => {
    Object.assign(s.uniforms, uniformes);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uAlto;
uniform float uBajo;
uniform float uCanto;
uniform float uSuelo;
uniform float uHorizonte;
uniform float uF90;
uniform float uCielo;
uniform float uPiso;
uniform vec2 uFlop;
uniform vec2 uFranja;
uniform vec2 uCaja;
uniform vec2 uCaja2;
uniform vec2 uFuerza;
uniform vec3 uTinte;
uniform vec3 uPropio;
uniform vec2 uAlturas;
uniform float uNariz;`,
      )
      .replace(/#include <lights_physical_fragment>[\s\S]*?#include <lights_fragment_end>/, LUZ_Y_LACA.replace(/\/\/.*$/gm, ''));
  };
}

function materialDeLaca(color, roughness, valores) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness });
  const uniformes = {};
  for (const [nombre, value] of Object.entries(valores)) uniformes[nombre] = { value };
  m.onBeforeCompile = parchePintura(uniformes);
  // Todos los colores, un solo programa.
  m.customProgramCacheKey = () => 'laca';
  return m;
}

// `medidas`: la disposición del carro, si se tiene: lo que es "abajo" y "la cintura" dependen del carro.
export function crearPintura(color, medidas = {}) {
  const { metal, saturacion, claro, oscuro } = recetaPintura(color);
  const base = colorCalibrado(color, claro);
  const mayor = Math.max(base.r, base.g, base.b, 0.001);
  const positivo = new THREE.Vector3(Math.max(0, base.r), Math.max(0, base.g), Math.max(0, base.b));
  return materialDeLaca(base, 0.3, {
    // Un gris oscuro apenas tiene margen (no pasar de 75 en capó y baúl, con 66 pedido), y arriba es
    // donde más refleja: por eso su base arriba es más oscura que en la puerta.
    uAlto: lerp(lerp(1.08, 0.6, oscuro), 1.6, claro),
    uBajo: lerp(0.74, 0.62, claro),
    uCanto: lerp(0.84, 0.72, claro),
    uSuelo: lerp(0.86, 0.55, claro),
    uHorizonte: lerp(1, 0.8, Math.max(claro, metal * 0.7)),
    uF90: 0.42,
    uCielo: lerp(0.7, 0.25, oscuro),
    uPiso: lerp(0.03, 0.12, oscuro),
    uFlop: new THREE.Vector2(lerp(0.94, 0.85, metal), lerp(1.06, 1.32, metal * (1 - 0.6 * oscuro))),
    // Las luces, en la altura de lo que refleja (0 el horizonte, 1 el cénit). La franja por encima de
    // lo que refleja media puerta, para que el medio de la puerta muestre el color limpio; la caja, por
    // encima de lo que refleja medio capó visto desde el frente.
    uFranja: new THREE.Vector2(0.22, 0.34),
    uCaja: new THREE.Vector2(0.56, 0.64),
    uCaja2: new THREE.Vector2(0.8, 0.86),
    // En un blanco, la luz tiene que ser mucho más fuerte para que algo se note sobre 225.
    uFuerza: new THREE.Vector2(lerp(5, 12, claro), lerp(lerp(2, 1.5, oscuro), 6, claro)),
    uTinte: positivo.clone().divideScalar(mayor).lerp(new THREE.Vector3(1, 1, 1), 1 - smoothstep(saturacion, 0.15, 0.6)),
    uPropio: positivo.multiplyScalar(Math.min(1, 0.35 / mayor)),
    uAlturas: new THREE.Vector2(medidas.alto || 1.45, medidas.cintura || 0.95),
    // Dónde empieza el carro: de ahí para atrás se prenden la franja y la caja. Es la z de la punta, que siempre es
    // negativa porque el carro mira hacia -Z; sin medidas, la de un sedán típico.
    uNariz: medidas.punta ?? -2.25,
  });
}

// Lo que no es lata pero va pegado a ella (el fondo de la junta, el filo): un color que se ve igual desde
// cualquier lado. Con un material normal, visto a ras reflejaba el cuarto entero: en un carro negro, sobre
// el capó en Frente, el filo salía blanco como una costura. Y es el mismo programa de la pintura, así que
// no suma ninguno.
export function crearPlano(colorVisto) {
  return materialDeLaca(colorCalibrado(colorVisto, 0), 1, {
    uAlto: 1,
    uBajo: 1,
    uCanto: 1,
    uSuelo: 1,
    uHorizonte: 1,
    uF90: 0.04,
    uCielo: 0,
    uPiso: 0,
    uFlop: new THREE.Vector2(1, 1),
    uFranja: new THREE.Vector2(9, 10),
    uCaja: new THREE.Vector2(9, 10),
    uCaja2: new THREE.Vector2(9, 10),
    uFuerza: new THREE.Vector2(0, 0),
    uTinte: new THREE.Vector3(1, 1, 1),
    uPropio: new THREE.Vector3(0, 0, 0),
    uAlturas: new THREE.Vector2(1, 1),
    uNariz: 0,
  });
}

// Las piezas de adentro: MÁS CLARAS que la lata, para que se vean y se puedan marcar. Es regla de Joan
// (js/piezas.js, 15-oct-2026), y un jurado la había invertido porque en un render sin sombras una pieza
// clara adentro de un vano se veía como un plano rosado. Lo rosado era otra cosa: la mezcla con el color
// del carro, que pasaba por las luces del cuarto. Por eso aquí es un tono neutro, que no sale del color de
// la pintura sino de lo clara que es, y es mate y no pasa por el cuarto: se ve igual desde cualquier lado.
// Las sombras no son de la luz: van por vértice (`color`, ver conSombra en adentro.js). Sobre un blanco ya
// no hay por dónde ser más clara: se queda en el tono de la lata, y la forma la dan las sombras.
export function tonoDeAdentro(color) {
  const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const mayor = srgb(Math.max(0, Math.max(color.r, color.g, color.b)));
  const v = Math.min(0.955, Math.max(0.74, mayor + 0.09));
  return new THREE.Color().setRGB(v, v * 1.002, v * 1.008, THREE.SRGBColorSpace);
}

// El platón de una pick-up: su piso y el revés de la compuerta. Son piezas de adentro, pero se ven sin abrir nada: con el
// gris claro de las demás, el piso salía 206,207,208 en un carro rojo y 243,244,245 en un taxi, y parecía una sábana sobre
// la carrocería, lo primero que se ve de una pick-up. La regla de Joan sigue en pie (más claro que la lata), pero del color
// del carro, como es de verdad: un platón va pintado, y un piso que mira al cielo se ve más claro que un costado.
//   rojo 184,35,42 -> 207,39,47    taxi 245,196,0 -> 250,217,83    negro 20,22,26 -> 71,73,77    blanco 242,243,244 -> 251,252,252
export function tonoDePlaton(color) {
  const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const s = [color.r, color.g, color.b].map((c) => srgb(Math.max(0, c)));
  const mayor = Math.max(s[0], s[1], s[2], 0.001);
  const k = Math.min(0.97, Math.max(0.3, mayor + 0.09)) / mayor;
  // Arriba ya no hay más brillo que subir: un taxi solo se puede aclarar hacia el blanco. Y lo más luminoso, más todavía:
  // un #00ff00 se quedaba 4 % más oscuro que su lata.
  const Y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const hacia = 0.35 * smoothstep(mayor, 0.75, 1) + 0.3 * smoothstep(Y, 0.6, 0.8);
  // Abajo, casi gris: un negro lleva poquito azul, y multiplicado salía un piso azul (59,65,76).
  const gris = 0.7 * (1 - smoothstep(mayor, 0.1, 0.45));
  const v = s.map((c) => lerp(lerp(c * k, mayor * k, gris), 1, hacia));
  return new THREE.Color().setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
}

export function crearInterior(color, visto = tonoDeAdentro(color)) {
  const m = materialDeLaca(colorCalibrado(visto, 0), 1, {
    uAlto: 1.04,
    uBajo: 0.84,
    uCanto: 0.86,
    uSuelo: 1,
    uHorizonte: 1,
    uF90: 0.04,
    uCielo: 0,
    uPiso: 0,
    uFlop: new THREE.Vector2(1, 1),
    uFranja: new THREE.Vector2(9, 10),
    uCaja: new THREE.Vector2(9, 10),
    uCaja2: new THREE.Vector2(9, 10),
    uFuerza: new THREE.Vector2(0, 0),
    uTinte: new THREE.Vector3(1, 1, 1),
    uPropio: new THREE.Vector3(0.3, 0.3, 0.31),
    uAlturas: new THREE.Vector2(1, 1),
    uNariz: 0,
  });
  m.vertexColors = true;
  return m;
}

export function crearPlaton(color) {
  return crearInterior(color, tonoDePlaton(color));
}

// Un cuarto de estudio parecido para el vidrio, los lentes y los marcos negros: lo que más reflejan es el
// cielo. Con las lámparas del cuarto enteras, el vidrio de atrás llevaba un manchón blanco. La fuerza va
// en uniformes: así el lente de un faro y la cara de adelante del vidrio son el mismo programa.
export function conReflejoDeEstudio(m, fuerza = 1, franjaHorizonte = 0.28) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uFuerzaEstudio = { value: fuerza };
    s.uniforms.uFranjaEstudio = { value: franjaHorizonte };
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uFuerzaEstudio;
uniform float uFranjaEstudio;`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  {
    vec3 rVidrio = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
    float franja = smoothstep( -0.015, 0.015, rVidrio.y ) * ( 1.0 - smoothstep( 0.05, 0.22, rVidrio.y ) );
    float cielo = smoothstep( 0.0, 0.9, rVidrio.y );
    float lum = max( radiance.r, max( radiance.g, radiance.b ) );
    float lamparas = smoothstep( 3.0, 10.0, lum ) * min( lum, 0.3 );
    radiance = vec3( 0.04 + franja * uFranjaEstudio + cielo * 0.5 + lamparas ) * uFuerzaEstudio;
  }
#endif`,
      )
      .replace(
        // Y el brillo de las luces directas, tenue y topado. Con un vidrio de 0,05 de rugosidad, y por casi
        // plano que sea, ese brillo cubre media ventana: al acercarse en la vista de inicio salía una raya
        // blanca (255,255,255) en el vidrio de la puerta. Sin nada de brillo, el vidrio de atrás visto por
        // el parabrisas era un hueco negro entre las sillas: un velo tenue es lo que le da cuerpo.
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  reflectedLight.directSpecular = min( reflectedLight.directSpecular * 0.12 * uFuerzaEstudio, vec3( 0.07 ) );`,
      );
  };
  m.customProgramCacheKey = () => 'estudio';
  return m;
}
