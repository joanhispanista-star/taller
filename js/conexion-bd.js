// Lo que necesita IndexedDB para aguantar en un iPhone. Sirve al registro (garaje.js) y a los
// escaneos (escaneos.js).
//
// Safari guarda la base en un proceso aparte de la página, y iOS lo mata cuando le hace falta
// memoria o cuando la app pasa a segundo plano (abrir la cámara basta). La conexión que la página
// abrió al cargar queda muerta, casi siempre sin avisar con un `close`, y toda operación falla con
// "UnknownError: Connection to Indexed Database server lost" (WebKit 197050 y 273827). Aquí cada
// operación que falla así vuelve a abrir la base y se repite una vez. No siempre alcanza: hay
// reportes de iPhones que solo se recuperan reiniciándolos. Por eso quien llama sigue teniendo que
// decidir qué hacer si de todos modos falla (el visor abre el carro como borrador).
//
// Las esperas: el proceso de la base tarda en volver. Reabrir de inmediato suele dar el mismo error.

// Lo que dice que se cayó la conexión. Un error de datos (ConstraintError, DataCloneError) o de
// espacio (QuotaExceededError) no se arregla reconectando: se repetiría igual.
const NOMBRES_DE_CAIDA = new Set(['InvalidStateError', 'UnknownError', 'AbortError', 'TransactionInactiveError', 'TimeoutError']);

export function seCayoLaConexion(error) {
  if (!error) return false;
  return NOMBRES_DE_CAIDA.has(error.name) || /connection|server lost/i.test(String(error.message || ''));
}

// En algunos Safari una petición a la base se queda sin respuesta para siempre: sin un tope, la
// pantalla se queda en "Guardando…" con el botón apagado y nadie se entera de que falló.
export function conTope(promesa, ms) {
  let reloj;
  const vencido = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new DOMException('La base del celular no respondió a tiempo', 'TimeoutError')), ms);
  });
  return Promise.race([promesa, vencido]).finally(() => clearTimeout(reloj));
}

// `abrir()` da una conexión nueva. `protegida(fn)` envuelve una operación: reabre si hace falta y la
// repite una vez, así que `fn` tiene que poderse repetir (poner y borrar lo son; agregar una foto,
// también: si la transacción falló, no quedó nada guardado).
export function conexionViva(primera, abrir, { esperas = [0, 400, 1500], tope = 15000 } = {}) {
  let bd = null;
  let reconectando = null;

  function poner(conexion) {
    const vieja = bd;
    bd = conexion;
    // Si otra pestaña sube la versión de la base, esta se cierra para no bloquearla.
    conexion.onversionchange = () => {
      conexion.close();
      if (bd === conexion) bd = null;
    };
    // El cierre que nadie pidió, cuando el navegador se digna a avisar.
    conexion.onclose = () => {
      if (bd === conexion) bd = null;
    };
    if (vieja && vieja !== conexion) {
      try {
        vieja.close();
      } catch {
        // Estaba muerta: es lo que se esperaba.
      }
    }
  }
  poner(primera);

  async function levantar() {
    let ultimo = null;
    for (const espera of esperas) {
      if (espera) await new Promise((listo) => setTimeout(listo, espera));
      try {
        poner(await conTope(abrir(), tope));
        return;
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo;
  }
  // Dos operaciones que caen a la vez comparten la misma reconexión.
  function reconectar() {
    if (!reconectando) reconectando = levantar().finally(() => (reconectando = null));
    return reconectando;
  }

  return {
    get actual() {
      return bd;
    },
    protegida(fn) {
      return async (...argumentos) => {
        try {
          if (!bd) await reconectar();
          return await conTope(fn(...argumentos), tope);
        } catch (e) {
          if (!seCayoLaConexion(e)) throw e;
          console.warn('La base se cayó; se reabre y se repite:', e);
          await reconectar();
          return conTope(fn(...argumentos), tope);
        }
      };
    },
    cerrar() {
      if (bd) bd.close();
      bd = null;
    },
  };
}

// Las imágenes van a la base como bytes y no como Blob. Safari ha tenido varias fallas con los Blob
// dentro de IndexedDB: "Error preparing Blob/File data to be stored in object store" al guardar
// (WebKit 188438, 268037) y el proceso de la base muerto al leerlos (292142). Los bytes no pasan
// por ahí. Lo ya guardado como Blob se sigue leyendo igual.
export async function aBytes(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return blob;
  return { bytes: await blob.arrayBuffer(), tipo: blob.type || 'image/jpeg' };
}

export function aBlob(valor) {
  // Por `tipo` y no por `bytes`: un Blob de verdad también tiene un método que se llama bytes.
  return valor && typeof valor.tipo === 'string' ? new Blob([valor.bytes], { type: valor.tipo }) : valor;
}
