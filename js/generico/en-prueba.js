// El carro nuevo, en prueba. Lo único que falta saber de él no se puede medir en el PC: si gira
// fluido en un celular. Son 12 veces los triángulos del carro de hoy, y el piso lo dibuja otra vez
// en cada cuadro. Por eso se enciende con un enlace (?carro=nuevo), solo en ese teléfono, y dice en
// pantalla cuántos cuadros por segundo da, con un botón para comparar con el de hoy. Quien no abra
// el enlace sigue con el carro de hoy, y no los arma ni compila nada de esto. Los archivos sí viajan: van
// en la precarga del teléfono (herramientas/sellar-version.mjs), porque sin señal el enlace no abriría.
const CLAVE = 'taller-carro-en-prueba'; // 'nuevo' | 'actual'; sin nada, no hay prueba

// Con el almacenamiento bloqueado (ventana de incógnito), la prueba dura lo que dure la página.
function leer() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}
function poner(valor) {
  try {
    if (valor) localStorage.setItem(CLAVE, valor);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Ver arriba.
  }
}

// `estado`: qué carro se ve en la prueba. null: no hay prueba. `construir`: el armador del carro
// nuevo, o null si es el de hoy. Si los módulos no llegan (sin internet y sin caché), se sigue con
// el de hoy: una prueba no puede dejar la app sin carro.
export async function iniciarPrueba(busqueda = location.search) {
  const pedido = new URLSearchParams(busqueda).get('carro');
  if (pedido === 'salir') poner(null);
  if (pedido === 'nuevo' || pedido === 'actual') poner(pedido);
  const estado = pedido === 'nuevo' || pedido === 'actual' ? pedido : leer();
  if (!estado) return null;
  if (estado !== 'nuevo') return { estado, construir: null };
  try {
    return { estado, construir: (await import('./carro-nuevo.js')).construirCarroNuevo };
  } catch (e) {
    console.warn(e);
    return { estado: 'actual', construir: null };
  }
}

// Los cuadros por segundo salen de lo que se dibuja girando: quieto, el visor no dibuja nada y no
// hay qué medir. La mediana y no el promedio: una sola pausa del sistema no es el carro.
function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.floor(orden.length / 2)];
}

export function crearMedidor(contenedor, estado) {
  const caja = document.createElement('div');
  caja.className = 'medidor-prueba';
  // Los estilos aquí y no en la hoja de la app: el medidor es de una prueba, y se va con ella. Sin estilos caía debajo
  // del lienzo, en la franja de 21 px de abajo, y no se veía.
  caja.style.cssText = 'position:absolute;left:8px;right:8px;bottom:72px;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,0.72);color:#fff;font-size:12px';
  const texto = document.createElement('span');
  const cambiar = document.createElement('button');
  cambiar.type = 'button';
  cambiar.textContent = estado === 'nuevo' ? 'Ver el de hoy' : 'Ver el nuevo';
  cambiar.addEventListener('click', () => {
    poner(estado === 'nuevo' ? 'actual' : 'nuevo');
    location.reload();
  });
  const salir = document.createElement('button');
  salir.type = 'button';
  salir.textContent = 'Salir';
  salir.addEventListener('click', () => {
    poner(null);
    location.reload();
  });
  caja.append(texto, cambiar, salir);
  contenedor.append(caja);
  const nombre = estado === 'nuevo' ? 'Carro nuevo, en prueba' : 'Carro de hoy, en prueba';
  texto.textContent = `${nombre} · gíralo para medir`;
  let armado = null;
  let anterior = null;
  let tramos = [];
  let cuando = 0;
  return {
    armado(ms) {
      armado = Math.round(ms);
    },
    cuadro(ahora, seMovio) {
      if (!seMovio || ahora === undefined) {
        anterior = null;
        return;
      }
      if (anterior !== null) tramos.push(ahora - anterior);
      anterior = ahora;
      if (tramos.length < 20 || ahora - cuando < 500) return;
      cuando = ahora;
      texto.textContent = `${nombre} · ${Math.round(1000 / mediana(tramos))} cuadros/s${armado === null ? '' : ` · armó en ${armado} ms`}`;
      tramos = tramos.slice(-90);
    },
  };
}
