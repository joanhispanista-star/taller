// A dónde entra el enlace de prueba (probar-carro.html?placa=...) cuando ya trajo la versión nueva. Sin DOM: lo usan la
// página del enlace y las pruebas.
//
// Joan abrió en su iPhone probar-carro.html?placa=JPX248 y no vio la camioneta por ningún lado (9-nov-2026). Una de las
// causas: el enlace entraba al visor con esa placa, y en ese almacén del teléfono JPX248 no existía (Safari y la app de la
// pantalla de inicio guardan los carros aparte), así que el visor lo creaba vacío y salía el carro de siempre. Y desde ahí,
// cada vez que lo abriera, otra vez: el carro ya existía, vacío. Ahora, si con esa placa no se va a ver nada que valga la
// pena, entra a la pestaña Vehículos, que dice por qué y deja ver la Captiva o ponérsela a ese carro.
import { abrirAlmacen, nombreCompletoDelCarro } from './garaje.js';
import { normalizarPlaca } from './estado.js';
import { modeloParecido, modeloQueLeToca } from './modelos-catalogo.js';

export const enlaceAlVisorEnPrueba = (placa) => 'index.html?carro=nuevo' + (placa ? '&placa=' + encodeURIComponent(placa) : '');
export const enlaceAVehiculos = (placa) => 'tablero.html?p=vehiculos&placa=' + encodeURIComponent(placa);

// Por qué con esta placa no se vería nada: 'no-esta' (el visor lo crearía vacío), 'sin-datos' (ya está, vacío, casi
// seguro de una vez anterior de este mismo enlace) o 'parecido' (dice "Chevrolet Captiva" sin decir si es la de 2019 en
// adelante, y el modelo no se pone sin preguntar). '' si se ve bien: con su modelo, o un carro con sus datos al que no le
// toca ninguno, que es justo lo que el enlace sirve para probar (el carro nuevo en un Logan, por ejemplo). Si pidieron la
// carrocería de referencia para ese carro, también '': fue a propósito.
export function porQueNoSeVeria(carro) {
  if (!carro) return 'no-esta';
  if (modeloQueLeToca(carro) || carro.sinModeloDeCatalogo) return '';
  if (!nombreCompletoDelCarro(carro)) return 'sin-datos';
  return modeloParecido(carro) ? 'parecido' : '';
}

// El destino del enlace. Si el registro no abre, el de siempre: el visor sabe trabajar con borrador, y aquí no se puede saber más.
export async function destinoDelEnlace(placa, { abrir = abrirAlmacen } = {}) {
  const clave = normalizarPlaca(placa || '');
  if (!clave) return enlaceAlVisorEnPrueba('');
  let almacen;
  try {
    almacen = await abrir();
  } catch {
    return enlaceAlVisorEnPrueba(clave);
  }
  try {
    return porQueNoSeVeria(await almacen.obtener(clave)) ? enlaceAVehiculos(clave) : enlaceAlVisorEnPrueba(clave);
  } catch {
    return enlaceAlVisorEnPrueba(clave);
  } finally {
    almacen.cerrar();
  }
}
