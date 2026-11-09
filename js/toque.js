// Qué pieza hay debajo de un dedo.
//
// Un dedo cubre unos 40 px y el estribo, en la pantalla de un celular, mide
// 14 px de alto; el espejo, 14 × 9. Con un solo rayo en el centro del toque
// el estribo casi nunca se marca a la primera, y lo que se marca es la
// puerta de arriba: una orden con la pieza equivocada. Por eso, además del
// rayo del centro, se lanzan ocho más en un anillo del tamaño de la yema, y
// si alguno cae sobre una pieza delgada esa gana. Eso le quita a una puerta lo
// que tiene cerca del estribo o del espejo: con 12 px, en un carro de catálogo,
// un 34 % de lo que se ve de la puerta delantera en Inicio (medido con el mapa de
// esta función), y lo bajo de una puerta es lo que más se raspa. Por eso
// `radioSobreLata`: si el centro ya cayó en una lata, el anillo se achica; en el
// vidrio o en el aire sigue del tamaño de la yema, que es para lo que está.
//
// Sin DOM a propósito: se prueba en Node con una cámara y el carro reales.
import * as THREE from 'three';

const DELGADAS = new Set(['estribo-izq', 'estribo-der', 'espejo-izq', 'espejo-der']);
const RAYOS_EN_ANILLO = 8;

const rayo = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const delgadas = [];

// `x`, `y` en píxeles dentro del lienzo de `ancho` × `alto`. Devuelve el id
// de la pieza o null si el dedo cayó en el vidrio, una llanta o el piso.
export function piezaTocada({ camara, grupo, x, y, ancho, alto, radioPx = 12, radioSobreLata = radioPx }) {
  const centro = cruzar(x, y);
  if (centro && DELGADAS.has(centro)) return centro;
  const radio = centro ? radioSobreLata : radioPx;
  // Solo una pieza delgada puede cambiar lo que dijo el rayo del centro: cada rayo del
  // anillo pregunta primero contra esas, y solo si cruza alguna se lanza contra todo el
  // carro. En un escaneo de 135.000 triángulos, 9 rayos completos tardaban 83 ms en el
  // PC, y en un celular se sentía el dedo esperando.
  delgadas.length = 0;
  grupo.traverse((o) => {
    if (o.isMesh && DELGADAS.has(o.userData.piezaId)) delgadas.push(o);
  });
  if (!delgadas.length) return centro;
  for (let i = 0; i < RAYOS_EN_ANILLO; i++) {
    const angulo = (i * 2 * Math.PI) / RAYOS_EN_ANILLO;
    const px = x + Math.cos(angulo) * radio;
    const py = y + Math.sin(angulo) * radio;
    apuntar(px, py);
    if (!rayo.intersectObjects(delgadas, false).length) continue;
    const id = cruzar(px, py);
    if (id && DELGADAS.has(id)) return id;
  }
  return centro;

  function apuntar(px, py) {
    ndc.set((px / ancho) * 2 - 1, -(py / alto) * 2 + 1);
    rayo.setFromCamera(ndc, camara);
  }

  function cruzar(px, py) {
    apuntar(px, py);
    // Se cruza con TODO el carro, no solo con las piezas pintables: si el
    // vidrio o una llanta están delante, el toque no debe atravesarlos y
    // marcar la puerta que hay detrás.
    // Los adornos (manijas, molduras, pasarruedas) no cuentan: el dedo los
    // atraviesa y marca lo que hay debajo. El vidrio y las llantas sí paran
    // el rayo.
    const cruces = rayo.intersectObject(grupo, true);
    const primero = cruces.find((c) => !c.object.userData.decorativo);
    if (!primero) return null;
    return primero.object.userData.piezaId || null;
  }
}
