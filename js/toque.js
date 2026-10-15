// Qué pieza hay debajo de un dedo.
//
// Un dedo cubre unos 40 px y el estribo, en la pantalla de un celular, mide
// 14 px de alto; el espejo, 14 × 9. Con un solo rayo en el centro del toque
// el estribo casi nunca se marca a la primera, y lo que se marca es la
// puerta de arriba: una orden con la pieza equivocada. Por eso, además del
// rayo del centro, se lanzan ocho más en un anillo del tamaño de la yema, y
// si alguno cae sobre una pieza delgada esa gana. A una puerta o un capó no
// les afecta: el centro los decide igual que antes.
//
// Sin DOM a propósito: se prueba en Node con una cámara y el carro reales.
import * as THREE from 'three';

const DELGADAS = new Set(['estribo-izq', 'estribo-der', 'espejo-izq', 'espejo-der']);
const RAYOS_EN_ANILLO = 8;

const rayo = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// `x`, `y` en píxeles dentro del lienzo de `ancho` × `alto`. Devuelve el id
// de la pieza o null si el dedo cayó en el vidrio, una llanta o el piso.
export function piezaTocada({ camara, grupo, x, y, ancho, alto, radioPx = 12 }) {
  const centro = cruzar(x, y);
  if (centro && DELGADAS.has(centro)) return centro;
  for (let i = 0; i < RAYOS_EN_ANILLO; i++) {
    const angulo = (i * 2 * Math.PI) / RAYOS_EN_ANILLO;
    const id = cruzar(x + Math.cos(angulo) * radioPx, y + Math.sin(angulo) * radioPx);
    if (id && DELGADAS.has(id)) return id;
  }
  return centro;

  function cruzar(px, py) {
    ndc.set((px / ancho) * 2 - 1, -(py / alto) * 2 + 1);
    rayo.setFromCamera(ndc, camara);
    // Se cruza con TODO el carro, no solo con las piezas pintables: si el
    // vidrio o una llanta están delante, el toque no debe atravesarlos y
    // marcar la puerta que hay detrás.
    const cruces = rayo.intersectObject(grupo, true);
    if (cruces.length === 0) return null;
    return cruces[0].object.userData.piezaId || null;
  }
}
