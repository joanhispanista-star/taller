// Los carros de catálogo: un modelo ya hecho (GLB) de una línea de carro, que trae sus piezas, sus medidas de ficha y lo que hace falta para
// cambiarle el color. No es un escaneo: nadie le pasó el celular a ESTE carro, y la pantalla no lo dice como si fuera.
//
// El archivo lo arma la tubería de fotos (fg-trabajo/captiva/foto2). Trae, además de la malla y su foto:
//  - _PIEZA: la pieza de cada vértice, leída a mano de las juntas que se ven en las fotos. Con eso la app no adivina: su filtro de pintura deja
//    manchas donde la lata no parece pintura (parrilla, bómper negro), y el genérico pone el baúl hasta el vidrio.
//  - extras.taller en el nodo: la lista de piezas, las medidas, la escala, y dónde está la capa de pintura.
//  - La capa de pintura, en la misma imagen, debajo del mosaico: por píxel, cuánta pintura se ve. La foto se separó en
//    "pintura + reflejo" (m05_color.py), así que cambiar de color es sumar capa * (color nuevo - color de la foto), y los reflejos, el
//    cromo y los stops no se enteran. Va en la misma imagen porque es la única que la app guarda y vuelve a abrir (soloLaFoto, blobDeTextura).
//  - La máscara del brillo, al lado de la capa: por píxel, cuánto reflejo calculado lleva (escaneo.js, materialDeFoto). Mucho en capó, techo y parabrisas, que no traen reflejos de
//    la foto; poco en los costados, que ya traen los suyos; nada en llantas, plástico, cromo y stops. En el verde y el azul, la sombra por la forma y el filo de luz del pliegue. Sin ella (`pintura.brillo`), no se calcula ningún reflejo.
import * as THREE from 'three';
import { medidasParaDibujar, normalizarCarroceria } from './carrocerias.js';

// Lo que el archivo dice de sí mismo, si es un carro de catálogo. Three.js deja el `extras` del nodo en userData, y el atributo en minúscula.
export function catalogoDelObjeto(objeto) {
  let catalogo = null;
  objeto.traverse((hijo) => {
    if (!catalogo && hijo.userData && hijo.userData.taller && hijo.userData.taller.origen === 'catalogo') catalogo = hijo.userData.taller;
  });
  return catalogo;
}

// Del archivo ya leído al escaneo que guarda y dibuja la app, sin leer nada de la malla: viene en su marco (metros, piso en y = 0, frente hacia -Z), con
// sus piezas y sus medidas de ficha. `ajustesDelEscaneo`: de escaneo.js (ejes, piso, cintura), para las piezas de adentro.
export function escaneoDeCatalogo(malla, ajustesDelEscaneo) {
  const c = malla.catalogo;
  // El archivo va escalado para que la app de antes, que recorta los extremos al medir, lea las medidas de la ficha. Aquí no se mide: se deshace. Y va con el marco
  // de las fotos, donde el centro del carro a lo largo no cae en z = 0.
  const k = 1 / (c.escala || 1);
  const dz = c.centroZ || 0;
  const posiciones = Float32Array.from(malla.posiciones, (v, i) => v * k - (i % 3 === 2 ? dz : 0));
  const carroceria = normalizarCarroceria((c.carro && c.carro.carroceria) || 'suv');
  const { largo, ancho, alto, entreEjes } = c.medidas;
  const medidas = { largo, ancho, alto };
  const medidasDibujo = medidasParaDibujar(carroceria, { largo, ancho, alto, entreEjes });
  const ajustes = { ...ajustesDelEscaneo(posiciones, medidasDibujo, malla.colores), ...(c.juntas || {}) };
  return {
    posiciones,
    indices: malla.indices,
    colores: malla.colores,
    uvs: malla.uvs,
    etiquetas: Uint8Array.from(malla.pieza),
    nombres: [...c.piezas],
    medidas,
    medidasDibujo,
    fueraDeRango: false,
    carroceria,
    ajustes,
    volteado: false,
    escalaAjustada: null,
    ejeArriba: null,
    rehecha: false,
    textura: malla.uvs ? malla.textura || null : null,
    fotoPerdida: malla.uvs && malla.textura ? null : malla.fotoPerdida || null,
    catalogo: c,
  };
}

// El marco va de 10 a 670 y mide 12 de grueso: el número, dentro, con un poco de aire.
const ANCHO_DEL_NUMERO = 620;

// La placa, en un lienzo chico. Mismos colores y letra que la del genérico (carro.js, materialPlaca).
function lienzoDePlaca(texto) {
  if (typeof document === 'undefined') return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = 680;
  lienzo.height = 330;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffd83d';
  ctx.fillRect(0, 0, 680, 330);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 660, 310);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 190px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Con tope de ancho: Arial Narrow está en un PC y no en un iPhone, y con Arial el número mide 729 px en un lienzo de 680. Salía
  // con la J y el 8 mochos.
  ctx.fillText(texto, 340, 172, ANCHO_DEL_NUMERO);
  const textura = new THREE.CanvasTexture(lienzo);
  // Soltarlo ya y no cuando pase el recolector: en un iPhone son los lienzos vivos los que cuentan para el tope
  // (ver js/fotos.js), y cada cambio de color o de placa arma otro.
  textura.addEventListener('dispose', () => {
    lienzo.width = 0;
    lienzo.height = 0;
  });
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.flipY = false; // las coordenadas de la foto van con v = 0 arriba
  return textura;
}

// Lo que el material de la foto (escaneo.js, materialDeFoto) le agrega a su shader en un carro de catálogo. `color`: el de la ficha (si no hay, se queda el de
// la foto); `placa`: el número, ya con su formato. Devuelve { uniforms, defines, pintar, soltar }. `pintar` cambia color y placa sobre el
// mismo modelo: cambiar de color rearmaba el carro y volvía a abrir el JPEG de 4096 x 3072, con el viejo y el nuevo abiertos a la vez y
// un momento de carro de plastilina en pantalla. Todas las piezas comparten estos uniforms.
export function pinturaDeCatalogo(catalogo, { color = null, placa = '' } = {}) {
  const p = catalogo.pintura;
  const r = catalogo.placa;
  const uniforms = {
    uConTono: { value: 0 },
    // Un color de la ficha es un color pleno. En la foto, la capa de una puerta al sol no llega a 1 (`referencia`): se divide por eso, y se deja en 0,8 para
    // que un blanco siga teniendo adonde subir con los reflejos.
    uTono: { value: new THREE.Vector3() },
    uBase: { value: new THREE.Vector3(...(p ? p.base : [0, 0, 0])) },
    uCapa: { value: new THREE.Vector3(p ? p.capa.escala_u : 1, p ? p.capa.escala_v : 1, p ? p.capa.v0 : 0) },
    uConPlaca: { value: 0 },
    uPlaca: { value: null },
    uRectPlaca: { value: new THREE.Vector4(r ? r.u0 : 0, r ? r.v0 : 0, r ? r.u1 : 0, r ? r.v1 : 0) },
  };
  // Dónde está la máscara del brillo, si el archivo la trae. Sin ella no se calcula nada: un archivo de antes se ve como siempre.
  const b = p && p.brillo;
  if (b) uniforms.uBrillo = { value: new THREE.Vector4(b.u0, b.v0, b.escala_u, b.escala_v) };
  let colorPuesto;
  let placaPuesta;
  // Devuelve si cambió algo, para saber si hay que dibujar otra vez.
  function pintar({ color: otroColor = null, placa: otraPlaca = '' } = {}) {
    let cambio = false;
    if (otroColor !== colorPuesto) {
      colorPuesto = otroColor;
      cambio = true;
      uniforms.uConTono.value = otroColor != null && p ? 1 : 0;
      if (otroColor != null && p) {
        const c = new THREE.Color(otroColor);
        const k = 0.8 / (p.referencia || 0.3);
        uniforms.uTono.value.set(c.r * k, c.g * k, c.b * k);
      }
    }
    if (otraPlaca !== placaPuesta) {
      placaPuesta = otraPlaca;
      cambio = true;
      if (uniforms.uPlaca.value) uniforms.uPlaca.value.dispose();
      uniforms.uPlaca.value = otraPlaca ? lienzoDePlaca(otraPlaca) : null;
      uniforms.uConPlaca.value = uniforms.uPlaca.value && r ? 1 : 0;
    }
    return cambio;
  }
  pintar({ color, placa });
  return {
    uniforms,
    defines: b ? { CATALOGO: 1, CATALOGO_BRILLO: 1 } : { CATALOGO: 1 },
    pintar,
    soltar() {
      if (uniforms.uPlaca.value) uniforms.uPlaca.value.dispose();
    },
  };
}

// Cómo se dice en la pantalla lo que es este carro, sin que parezca un escaneo. Con el crédito: las fotos son CC BY 3.0, y se dice que se modificaron.
// `linea`: lo que es para este carro. 'misma' si es de la línea del archivo; 'otra' si es de otra (un GLB subido a mano a un Renault:
// "de la misma línea" sería falso); 'sin-datos' si el carro no dice de qué línea es.
export function textoDeCatalogo(catalogo, { linea = 'misma' } = {}) {
  const a = catalogo.carro || {};
  const deDonde = linea === 'otra' ? 'de un carro de otra línea' : linea === 'sin-datos' ? 'de otro carro' : 'de otro carro de la misma línea';
  return 'Modelo de catálogo' + (a.linea ? ' de ' + [a.marca, a.linea, a.version, a.modelo].filter(Boolean).join(' ') : '') + ': hecho con fotos ' + deDonde + ', no de este carro.';
}
