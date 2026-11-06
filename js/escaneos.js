// Dónde viven los escaneos: una base de datos APARTE del registro
// (garaje.js), en el mismo teléfono. Aparte a propósito: la malla de un escaneo
// pesa de 3,6 MB (136 mil triángulos) a unos 13 MB (el tope de 500 mil), más su
// foto, y el registro, kilobytes; tenerlos separados deja abrir el
// Garaje sin leer ni una malla, y no hubo que subir la versión de la base
// del registro (con carros reales adentro) para agregarlo.
//
// Un escaneo se guarda ya procesado (escaneo.js, procesarEscaneo): la malla
// en el marco del carro, sus colores si los trae, la pieza de cada vértice
// y las medidas reales. Al abrir el carro no hay que volver a calcular nada.
// Los arreglos tipados van tal cual a IndexedDB (los copia el navegador).
import { normalizarPlaca } from './estado.js';
import { aBlob, aBytes, conTope, conexionViva } from './conexion-bd.js';

export const NOMBRE_BD_ESCANEOS = 'taller-escaneos';
const VERSION = 1;

function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error || new Error('Falló la base de los escaneos'));
  });
}

// Lo que se guarda de un escaneo procesado: solo los campos conocidos, con
// los tipos que se esperan. Un escaneo sin malla no se guarda.
// `creado`: al volver a guardar uno que ya existía (piezas reacomodadas
// porque cambió la carrocería), conserva su fecha.
export function escaneoParaGuardar(placa, escaneo, { origen = 'celular', archivo = '', creado = null } = {}, ahora = new Date().toISOString()) {
  const clave = normalizarPlaca(placa);
  if (!clave) throw new Error('Un escaneo necesita la placa del carro');
  if (!escaneo || !escaneo.posiciones || !escaneo.indices || escaneo.indices.length < 3) throw new Error('El escaneo no tiene malla');
  return {
    placa: clave,
    creado: creado || ahora,
    origen,
    archivo: String(archivo || '').slice(0, 120),
    carroceria: escaneo.carroceria || 'sedan',
    medidas: { ...escaneo.medidas },
    medidasDibujo: { ...escaneo.medidasDibujo },
    volteado: Boolean(escaneo.volteado),
    escalaAjustada: escaneo.escalaAjustada || null,
    fueraDeRango: Boolean(escaneo.fueraDeRango),
    ejeArriba: escaneo.ejeArriba || null,
    // Lo medido en el escaneo para acomodar el genérico (ejes, piso, cintura):
    // con eso se rehacen las piezas de adentro igual que las de afuera.
    ajustes: escaneo.ajustes ? { ...escaneo.ajustes } : null,
    posiciones: Float32Array.from(escaneo.posiciones),
    indices: Uint32Array.from(escaneo.indices),
    colores: escaneo.colores ? Uint8Array.from(escaneo.colores) : null,
    // La textura (una foto JPEG) con sus coordenadas, si el archivo la traía.
    uvs: escaneo.uvs && escaneo.textura ? Float32Array.from(escaneo.uvs) : null,
    textura: escaneo.uvs && escaneo.textura ? escaneo.textura : null,
    etiquetas: Uint8Array.from(escaneo.etiquetas),
    nombres: [...escaneo.nombres],
    // Un carro de catálogo: lo que dice de sí mismo (escaneo-catalogo.js). Sin esto, al recargar quedaba como un escaneo cualquiera.
    catalogo: escaneo.catalogo || null,
  };
}

export function abrirEscaneos({ indexedDB: fabrica = globalThis.indexedDB, nombre = NOMBRE_BD_ESCANEOS } = {}) {
  if (!fabrica) return Promise.reject(new Error('Este navegador no tiene IndexedDB'));
  const abrir = () => new Promise((resolver, rechazar) => {
    let peticion;
    try {
      peticion = fabrica.open(nombre, VERSION);
    } catch (e) {
      rechazar(e);
      return;
    }
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('escaneos')) bd.createObjectStore('escaneos', { keyPath: 'placa' });
    };
    peticion.onerror = () => rechazar(peticion.error || new Error('No se pudo abrir la base de los escaneos'));
    peticion.onblocked = () => rechazar(new Error('La base de los escaneos está abierta en otra pestaña con una versión vieja'));
    peticion.onsuccess = () => resolver(peticion.result);
  });
  // Un escaneo grande tarda en escribirse en un celular: el tope es para lo que no responde, no para
  // lo que va despacio.
  return conTope(abrir(), 10000).then((bd) => {
    const conexion = conexionViva(bd, abrir, { tope: 60000 });
    const almacen = (modo = 'readonly') => conexion.actual.transaction('escaneos', modo).objectStore('escaneos');
    return {
      guardar: conexion.protegida(async (placa, escaneo, datos) => {
        const registro = escaneoParaGuardar(placa, escaneo, datos);
        // Quien llama sigue trabajando con el Blob. A la base, los bytes (conexion-bd.js).
        const textura = await aBytes(registro.textura);
        await pedir(almacen('readwrite').put({ ...registro, textura }));
        return registro;
      }),
      obtener: conexion.protegida(async (placa) => {
        const clave = normalizarPlaca(placa);
        if (!clave) return null;
        const registro = await pedir(almacen().get(clave));
        return registro ? { ...registro, textura: aBlob(registro.textura) } : null;
      }),
      // Solo si hay escaneo y de cuándo, sin traer la malla (para la lista
      // del Garaje).
      placas: conexion.protegida(async () => pedir(almacen().getAllKeys())),
      borrar: conexion.protegida(async (placa) => {
        const clave = normalizarPlaca(placa);
        if (clave) await pedir(almacen('readwrite').delete(clave));
      }),
      // Pedirle al navegador que no borre estos datos cuando falte espacio
      // (Chrome lo concede a las apps instaladas o muy usadas). Si dice que
      // no, todo sigue igual; solo que el teléfono podría borrarlos.
      async pedirQueNoSeBorren() {
        try {
          return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
        } catch {
          return false;
        }
      },
      cerrar: () => conexion.cerrar(),
    };
  });
}
