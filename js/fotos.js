// Reducir una foto de la cámara antes de guardarla.
//
// Una foto de celular pesa de 3 a 6 MB y mide 4000 px: diez fotos por
// carro y veinte carros son un giga en el teléfono. A 1280 px de lado mayor
// la pieza se ve perfectamente (es más que la pantalla del celular) y pesa
// unos 200 KB. La miniatura de 200 px es para la hoja de abajo: así la
// lista no decodifica diez fotos grandes cada vez que se pinta.
//
// Solo `reducirFoto` toca el navegador (canvas); `medidaReducida` es la
// cuenta pura y se prueba en Node.
export const LADO_MAYOR = 1280;
export const LADO_MINIATURA = 200;

export function medidaReducida(ancho, alto, ladoMayor = LADO_MAYOR) {
  if (!(ancho > 0 && alto > 0)) return { ancho: 0, alto: 0 };
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMayor) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const escala = ladoMayor / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

// Devuelve { foto, miniatura, ancho, alto }: dos Blobs JPEG y la medida de
// la grande. Lanza si el archivo no es una imagen que el navegador entienda.
export async function reducirFoto(archivo, { ladoMayor = LADO_MAYOR, ladoMiniatura = LADO_MINIATURA, calidad = 0.82 } = {}) {
  const imagen = await cargarImagen(archivo);
  try {
    const grande = medidaReducida(imagen.width, imagen.height, ladoMayor);
    if (!grande.ancho) throw new Error('La imagen no tiene tamaño');
    const foto = await dibujar(imagen, grande, calidad);
    const miniatura = await dibujar(imagen, medidaReducida(imagen.width, imagen.height, ladoMiniatura), 0.7);
    return { foto, miniatura, ancho: grande.ancho, alto: grande.alto };
  } finally {
    if (imagen.close) imagen.close();
  }
}

// createImageBitmap aplica la orientación EXIF (una foto tomada en
// vertical sale vertical, no acostada) y no bloquea la pantalla al
// decodificar. Si el navegador no lo tiene, un <img> de toda la vida.
async function cargarImagen(archivo) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      // Sigue con el <img>: algunos formatos (HEIC en Chrome, por ejemplo)
      // fallan aquí y también fallarán abajo, pero con un mensaje claro.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    return imagen;
  } catch {
    throw new Error('El navegador no pudo leer esa imagen');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dibujar(imagen, { ancho, alto }, calidad) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo comprimir la foto'))), 'image/jpeg', calidad);
  });
}
