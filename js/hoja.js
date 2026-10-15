// La hoja de abajo del visor: los chips de las piezas marcadas (con su
// estado y su cámara), el menú para cambiar el estado y las fotos del carro.
//
// Es DOM puro, sin Three.js. El visor le dice qué carro y qué fotos hay
// (pintar) y ella avisa por las acciones cuando la persona toca algo. Así
// visor.js se queda con la escena y esto se lee aparte.
import { ESTADOS, NOMBRE_ESTADO, PIEZA_CARRO, fechaCorta, piezasDelCarro } from './garaje.js';
import { nombreDePiezaEn } from './carrocerias.js';

// Un icono propio y no un emoji: el emoji de cámara cambia de dibujo (y de
// tamaño) entre Android, iPhone y Windows, y en algunos teléfonos viejos
// sale como un cuadro vacío.
const ICONO_CAMARA =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>' +
  '</svg>';

// El nombre de la pieza en la carrocería que se está viendo; la foto del
// carro entero también tiene nombre.
function nombreDe(carroceria, id) {
  return id === PIEZA_CARRO ? 'El carro' : nombreDePiezaEn(carroceria, id);
}

// Los nombres del catálogo no caben debajo de una miniatura de 72 px.
function nombreCorto(carroceria, id) {
  return nombreDe(carroceria, id)
    .replace('delantero', 'del.')
    .replace('delantera', 'del.')
    .replace('trasero', 'tras.')
    .replace('trasera', 'tras.')
    .replace('izquierdo', 'izq.')
    .replace('izquierda', 'izq.')
    .replace('derecho', 'der.')
    .replace('derecha', 'der.')
    .replace('Guardafango', 'Guardaf.');
}

function boton(clase, texto, etiqueta) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.setAttribute('aria-label', etiqueta);
  b.title = etiqueta;
  return b;
}

// acciones: { alAlternar(id), alFijarEstado(id, estado), alAgregarFoto(id, archivo), alBorrarFoto(idFoto) }
export function crearHoja(acciones) {
  const ui = {
    contador: document.getElementById('contador'),
    lista: document.getElementById('lista'),
    fotos: document.getElementById('fotos'),
    aviso: document.getElementById('aviso'),
    menu: document.getElementById('menu-estado'),
    camara: document.getElementById('camara'),
    dialogo: document.getElementById('foto-grande'),
  };
  const grande = {
    imagen: ui.dialogo.querySelector('img'),
    texto: ui.dialogo.querySelector('p'),
    borrar: ui.dialogo.querySelector('[data-accion="borrar"]'),
    cerrar: ui.dialogo.querySelector('[data-accion="cerrar"]'),
  };

  let urls = []; // object URLs de las miniaturas vivas, para liberarlas al repintar
  let urlGrande = '';
  let fotoAbierta = null;
  let piezaDelMenu = null;
  let carroceria = ''; // la del carro que se está pintando, para los nombres

  // ---------- Chips ----------

  function pintar({ carro, fotos = [], conRegistro = false }) {
    carroceria = carro.carroceria || '';
    const piezas = piezasDelCarro(carro).map((p) => ({ ...p, nombre: nombreDe(carroceria, p.id) }));
    const porPieza = new Map();
    for (const f of fotos) porPieza.set(f.pieza, (porPieza.get(f.pieza) || 0) + 1);

    let texto =
      piezas.length === 0
        ? 'Toca las piezas que necesitan pintura.'
        : piezas.length === 1
          ? '1 pieza marcada'
          : piezas.length + ' piezas marcadas';
    // Sin placa no hay dónde guardar fotos: se dice, no se esconde la cámara
    // sin más.
    if (!conRegistro && piezas.length > 0) texto += ' · ponle placa para guardarle fotos';
    ui.contador.textContent = texto;

    ui.lista.replaceChildren(...piezas.map((p) => chip(p, porPieza.get(p.id) || 0, conRegistro)));
    pintarFotos(fotos);
    cerrarMenu();
  }

  function chip(pieza, cuantasFotos, conRegistro) {
    const item = document.createElement('li');
    item.className = 'chip estado-' + pieza.estado;
    item.dataset.pieza = pieza.id;

    const estado = boton('chip-estado', pieza.nombre, pieza.nombre + ': ' + NOMBRE_ESTADO[pieza.estado] + '. Toca para cambiar el estado');
    estado.addEventListener('click', () => {
      if (!ui.menu.hidden && piezaDelMenu === pieza.id) cerrarMenu();
      else abrirMenu(pieza, estado);
    });

    const camara = boton(
      'chip-foto',
      '',
      cuantasFotos
        ? cuantasFotos + (cuantasFotos === 1 ? ' foto de ' : ' fotos de ') + pieza.nombre + '. Tomar otra'
        : 'Tomar foto de ' + pieza.nombre,
    );
    camara.innerHTML = ICONO_CAMARA + (cuantasFotos ? '<b>' + cuantasFotos + '</b>' : '');
    camara.hidden = !conRegistro;
    camara.addEventListener('click', () => {
      ui.camara.dataset.pieza = pieza.id;
      ui.camara.click();
    });

    const quitar = boton('chip-quitar', '×', 'Quitar ' + pieza.nombre);
    quitar.addEventListener('click', () => acciones.alAlternar(pieza.id));

    item.append(estado, camara, quitar);
    return item;
  }

  // ---------- Menú de estado ----------

  function abrirMenu(pieza, ancla) {
    piezaDelMenu = pieza.id;
    ui.menu.replaceChildren(
      ...ESTADOS.map((estado) => {
        const opcion = boton('estado-' + estado, NOMBRE_ESTADO[estado], NOMBRE_ESTADO[estado]);
        opcion.setAttribute('role', 'menuitemradio');
        opcion.setAttribute('aria-checked', String(estado === pieza.estado));
        opcion.addEventListener('click', () => {
          cerrarMenu();
          acciones.alFijarEstado(pieza.id, estado);
        });
        return opcion;
      }),
    );
    ui.menu.hidden = false;
    // Encima del chip; si arriba no cabe, debajo. Y nunca por fuera de la
    // pantalla: el chip puede estar pegado al borde derecho.
    const r = ancla.getBoundingClientRect();
    const m = ui.menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8));
    const arriba = r.top - m.height - 6;
    ui.menu.style.left = x + 'px';
    ui.menu.style.top = (arriba >= 8 ? arriba : r.bottom + 6) + 'px';
  }

  function cerrarMenu() {
    ui.menu.hidden = true;
    piezaDelMenu = null;
  }

  // Tocar en cualquier otra parte cierra el menú. En fase de captura, para
  // que el toque siguiente (otro chip, el carro) se atienda normal; el
  // propio chip del menú se excluye para que su botón haga de interruptor.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (ui.menu.hidden || ui.menu.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.chip-estado')) return;
      cerrarMenu();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarMenu();
  });

  // ---------- Fotos ----------

  function pintarFotos(fotos) {
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
    ui.fotos.hidden = fotos.length === 0;
    ui.fotos.replaceChildren(
      ...fotos.map((foto) => {
        const b = boton('foto', '', 'Ver la foto de ' + nombreDe(carroceria, foto.pieza));
        const imagen = document.createElement('img');
        const url = URL.createObjectURL(foto.miniatura || foto.foto);
        urls.push(url);
        imagen.src = url;
        imagen.alt = '';
        imagen.decoding = 'async';
        const pie = document.createElement('span');
        pie.textContent = nombreCorto(carroceria, foto.pieza);
        b.append(imagen, pie);
        b.addEventListener('click', () => abrirFoto(foto));
        return b;
      }),
    );
  }

  function abrirFoto(foto) {
    cerrarMenu();
    fotoAbierta = foto;
    if (urlGrande) URL.revokeObjectURL(urlGrande);
    urlGrande = URL.createObjectURL(foto.foto);
    grande.imagen.src = urlGrande;
    grande.texto.textContent = nombreDe(carroceria, foto.pieza) + ' · ' + fechaCorta(foto.creado);
    ui.dialogo.showModal();
  }

  grande.cerrar.addEventListener('click', () => ui.dialogo.close());
  grande.borrar.addEventListener('click', () => {
    if (!fotoAbierta || !confirm('¿Borrar esta foto? No se puede deshacer.')) return;
    const id = fotoAbierta.id;
    ui.dialogo.close();
    acciones.alBorrarFoto(id);
  });
  ui.dialogo.addEventListener('close', () => {
    fotoAbierta = null;
    grande.imagen.removeAttribute('src');
    if (urlGrande) URL.revokeObjectURL(urlGrande);
    urlGrande = '';
  });
  // Tocar el fondo oscuro cierra la foto (el dialog no lo hace solo).
  ui.dialogo.addEventListener('click', (e) => {
    if (e.target === ui.dialogo) ui.dialogo.close();
  });

  // La misma foto dos veces seguidas también tiene que disparar `change`:
  // por eso se vacía el campo después de leerlo.
  ui.camara.addEventListener('change', () => {
    const archivo = ui.camara.files && ui.camara.files[0];
    const pieza = ui.camara.dataset.pieza;
    ui.camara.value = '';
    if (archivo && pieza) acciones.alAgregarFoto(pieza, archivo);
  });

  function avisar(texto) {
    ui.aviso.textContent = texto;
    ui.aviso.hidden = !texto;
  }

  return { pintar, avisar };
}
