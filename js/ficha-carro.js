// La ficha de datos del carro, editable desde el visor: marca, línea (del
// catálogo o la que sea), versión, carrocería y color. Es donde la persona
// corrige lo que la foto propuso mal ("no es 7 puestos, es 5"), o le pone
// datos a un carro que entró solo por placa. DOM puro, sin Three.js.
import { CARROCERIAS, normalizarCarroceria } from './carrocerias.js';
import { buscarLinea, catalogoOrdenado, datosDeEntrada, nombreDeLinea } from './catalogo.js';
import { nombreDeColor } from './color-foto.js';
import { fechaCorta } from './garaje.js';

// Pesos con punto de miles mientras se escribe: 1250000 → 1.250.000.
function conPuntos(digitos) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function crearFichaCarro({ alGuardar }) {
  const ui = {
    dialogo: document.getElementById('datos-carro'),
    marca: document.getElementById('datos-marca'),
    linea: document.getElementById('datos-linea'),
    lineas: document.getElementById('lineas-catalogo'),
    version: document.getElementById('datos-version'),
    carrocerias: document.getElementById('datos-carrocerias'),
    color: document.getElementById('datos-color'),
    colorNombre: document.getElementById('datos-color-nombre'),
    cobro: document.getElementById('datos-cobro'),
    entregar: document.getElementById('datos-entregar'),
    entregaNota: document.getElementById('datos-entrega-nota'),
    guardar: document.querySelector('#datos-carro [data-accion="guardar"]'),
    cancelar: document.querySelector('#datos-carro [data-accion="cancelar"]'),
  };
  let borrador = null;

  // La entrega: un botón que marca (con la fecha de hoy) o reabre. Lo que
  // se guarda es la fecha; sin fecha, el carro sigue en el taller.
  function pintarEntrega() {
    const entregado = Boolean(borrador.entregado);
    ui.entregar.textContent = entregado ? 'Reabrir (volver al taller)' : 'Marcar entregado';
    ui.entregar.classList.toggle('entregado', entregado);
    ui.entregaNota.textContent = entregado
      ? 'Entregado ' + fechaCorta(borrador.entregado) + '. Está en el Historial con lo cobrado.'
      : 'Al marcarlo entregado pasa al Historial con lo que se cobró.';
  }

  ui.lineas.replaceChildren(
    ...catalogoOrdenado().map((e) => {
      const opcion = document.createElement('option');
      opcion.value = nombreDeLinea(e);
      opcion.label = CARROCERIAS[normalizarCarroceria(e.carroceria)].nombre;
      return opcion;
    }),
  );

  function pintarCarrocerias() {
    ui.carrocerias.replaceChildren(
      ...Object.entries(CARROCERIAS).map(([tipo, info]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-sugerencia' + (borrador.carroceria === tipo ? ' activo' : '');
        b.textContent = info.nombre;
        b.setAttribute('aria-pressed', String(borrador.carroceria === tipo));
        b.addEventListener('click', () => {
          borrador.carroceria = tipo;
          pintarCarrocerias();
        });
        return b;
      }),
    );
  }

  // Si lo escrito en "Línea" es una entrada del catálogo, se toman también
  // su marca, su carrocería y sus medidas; si no, queda como texto libre y
  // las medidas se quedan como estaban.
  function tomarLinea() {
    const texto = ui.linea.value.trim();
    const encontrada = buscarLinea(texto, 1)[0];
    if (encontrada && nombreDeLinea(encontrada).toLowerCase() === texto.toLowerCase()) {
      const datos = datosDeEntrada(encontrada);
      borrador.marca = datos.marca;
      borrador.linea = datos.linea;
      borrador.carroceria = datos.carroceria;
      borrador.medidas = datos.medidas;
      ui.marca.value = datos.marca;
      ui.linea.value = datos.linea;
      pintarCarrocerias();
    }
  }

  function abrir(carro) {
    borrador = {
      marca: carro.marca || '',
      linea: carro.linea || '',
      version: carro.version || '',
      carroceria: carro.carroceria || 'sedan',
      color: carro.color || '#cfd4da',
      medidas: carro.medidas || null,
      cobro: carro.cobro || 0,
      entregado: carro.entregado || '',
    };
    ui.marca.value = borrador.marca;
    ui.linea.value = borrador.linea;
    ui.version.value = borrador.version;
    ui.color.value = borrador.color;
    ui.colorNombre.textContent = nombreDeColor(borrador.color);
    ui.cobro.value = borrador.cobro ? conPuntos(String(borrador.cobro)) : '';
    pintarCarrocerias();
    pintarEntrega();
    ui.dialogo.showModal();
  }

  ui.cobro.addEventListener('input', () => {
    const digitos = ui.cobro.value.replace(/\D/g, '').slice(0, 12);
    ui.cobro.value = conPuntos(digitos);
  });
  ui.entregar.addEventListener('click', () => {
    borrador.entregado = borrador.entregado ? '' : new Date().toISOString();
    pintarEntrega();
  });

  ui.linea.addEventListener('change', tomarLinea);
  ui.color.addEventListener('input', () => {
    borrador.color = ui.color.value;
    ui.colorNombre.textContent = nombreDeColor(borrador.color);
  });
  ui.cancelar.addEventListener('click', () => ui.dialogo.close());
  ui.guardar.addEventListener('click', () => {
    if (!borrador) return;
    tomarLinea();
    borrador.marca = ui.marca.value.trim();
    borrador.linea = ui.linea.value.trim();
    borrador.version = ui.version.value.trim();
    borrador.cobro = Number(ui.cobro.value.replace(/\D/g, '')) || 0;
    const datos = { ...borrador };
    ui.dialogo.close();
    alGuardar(datos);
  });
  ui.dialogo.addEventListener('close', () => {
    borrador = null;
  });

  return { abrir };
}
