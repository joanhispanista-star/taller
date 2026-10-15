// La ficha de datos del carro, editable desde el visor: marca, línea (del
// catálogo o la que sea), versión, carrocería y color. Es donde la persona
// corrige lo que la foto propuso mal ("no es 7 puestos, es 5"), o le pone
// datos a un carro que entró solo por placa. DOM puro, sin Three.js.
import { CARROCERIAS, normalizarCarroceria } from './carrocerias.js';
import { buscarLinea, catalogoOrdenado, datosDeEntrada, nombreDeLinea } from './catalogo.js';
import { nombreDeColor } from './color-foto.js';

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
    guardar: document.querySelector('#datos-carro [data-accion="guardar"]'),
    cancelar: document.querySelector('#datos-carro [data-accion="cancelar"]'),
  };
  let borrador = null;

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
    };
    ui.marca.value = borrador.marca;
    ui.linea.value = borrador.linea;
    ui.version.value = borrador.version;
    ui.color.value = borrador.color;
    ui.colorNombre.textContent = nombreDeColor(borrador.color);
    pintarCarrocerias();
    ui.dialogo.showModal();
  }

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
    const datos = { ...borrador };
    ui.dialogo.close();
    alGuardar(datos);
  });
  ui.dialogo.addEventListener('close', () => {
    borrador = null;
  });

  return { abrir };
}
