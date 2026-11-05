// A qué distancia va la cámara para que el carro quepa entero en el lienzo de ahora,
// desde cualquier lado.
//
// Antes iba a ojo: lo que ocupa el carro visto desde ahí, más un 16 % de su fondo "porque la
// punta cercana se ve más grande". De punta eso se queda corto por más de un metro, porque
// la cara cercana está media longitud más cerca de la cámara: en un celular en vertical,
// Frente y Atrás dejaban el sedán 30 px por fuera de cada lado (la pick-up de 5,4 m, 55 px),
// y en un lienzo ancho cortaban las llantas por abajo. Aquí sale exacto, de las 8 esquinas
// de la caja del carro.
//
// La caja es la de `disposicion` (las medidas del carro), no la de la malla: un escaneo trae
// restos sueltos que la agrandan, y el carro quedaría diminuto por culpa de un pedazo de piso.
// La excepción es el escaneo fuera de rango: ver medidasDeEncuadre.
//
// Sin Three.js ni DOM a propósito: se prueba en Node con vistas × aspectos × medidas.

// 30° y no 38°: con el lente más cerrado el carro se ve como en un catálogo, sin esa trompa
// enorme de foto de celular.
export const LENTE = 30;

// La mira, a media altura del carro (fracción de su alto): una camioneta de 1,9 m no gira
// alrededor del mismo punto que un carro de 1,4 m.
export const ALTURA_DE_LA_MIRA = 0.44;

// El 4 % que queda de aire: la cuenta deja las esquinas de la caja justo en el borde, y los
// espejos salen un poco de esa caja.
const HOLGURA = 1.04;

// Posiciones de cámara de los botones de vista: valen como direcciones, la distancia sale de
// aquí abajo. "Izquierdo" es el lado del conductor (-X). "Arriba" no está en la vertical
// exacta porque OrbitControls no deja pasar de cierto ángulo y la cámara saltaría al soltarla.
export const VISTAS = {
  // Baja: a la altura del pecho, que es desde donde se ve (y se filma) un carro. Desde
  // más arriba se ve más techo, y en un escaneo el techo es lo que menos se conoce.
  inicio: [-4.6, 1.65, -4.9],
  frente: [0, 1.3, -6.2],
  izquierdo: [-6.4, 1.4, 0],
  derecho: [6.4, 1.4, 0],
  atras: [0, 1.3, 6.2],
  arriba: [0, 7.3, -1.4],
};

// Con qué medidas se encuadra lo que hay en pantalla. Fuera de rango, `disposicion` son las
// medidas TÍPICAS de la carrocería (un dibujo de 4,5 m), no las del escaneo: un archivo real de
// 12,40 m salía de x −3,20 a +1,27 en Inicio, y en Frente con la cámara dentro de la malla. Y
// es justo el que la pantalla pide revisar («revisa que sea solo el carro»): lo que sobra es
// lo que tiene que caber.
export function medidasDeEncuadre(escaneo, verPiezas, disposicion) {
  return escaneo && !verPiezas && escaneo.fueraDeRango ? escaneo.medidas : disposicion;
}

// `direccion`: de la mira hacia la cámara, sin normalizar (ajustarTamano pasa lo que hay).
// `medidas`: { largo, ancho, alto } en metros; el carro va centrado y parado en y = 0.
// `mira`: { x, y, z }. `fov`: el vertical, en grados. `aspecto`: ancho / alto del lienzo.
export function distanciaQueEncuadra({ direccion, medidas, mira, fov, aspecto }) {
  const largoDireccion = Math.hypot(direccion.x, direccion.y, direccion.z) || 1;
  const n = { x: direccion.x / largoDireccion, y: direccion.y / largoDireccion, z: direccion.z / largoDireccion };
  // Los ejes de la imagen, los mismos que le da lookAt: derecha = (0, 1, 0) × n y
  // arriba = n × derecha. Mirando recto hacia abajo la derecha se indefine: vale cualquiera.
  const largoDerecha = Math.hypot(n.z, n.x);
  const derecha = largoDerecha > 1e-6 ? { x: n.z / largoDerecha, z: -n.x / largoDerecha } : { x: 1, z: 0 };
  const arriba = { x: n.y * derecha.z, y: n.z * derecha.x - n.x * derecha.z, z: -n.y * derecha.x };
  const mitadV = Math.tan((fov * Math.PI) / 360);
  const mitadH = mitadV * aspecto;
  let distancia = 0;
  for (const x of [-medidas.ancho / 2, medidas.ancho / 2]) {
    for (const y of [0, medidas.alto]) {
      for (const z of [-medidas.largo / 2, medidas.largo / 2]) {
        const px = x - mira.x;
        const py = y - mira.y;
        const pz = z - mira.z;
        // Una esquina que avanza `hacia` la cámara queda a D - hacia de ella, y cabe si su
        // desvío en la imagen no pasa de mitad × (D - hacia). Despejando D, una por esquina.
        const hacia = px * n.x + py * n.y + pz * n.z;
        const aLoAncho = Math.abs(px * derecha.x + pz * derecha.z) / mitadH;
        const aLoAlto = Math.abs(px * arriba.x + py * arriba.y + pz * arriba.z) / mitadV;
        distancia = Math.max(distancia, Math.max(aLoAncho, aLoAlto) + hacia);
      }
    }
  }
  return distancia * HOLGURA;
}
