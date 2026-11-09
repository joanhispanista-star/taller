// La hoja de abajo del visor: los chips de las piezas marcadas (con su
// estado y su cámara), el menú para cambiar el estado y las fotos del carro.
//
// Es DOM puro, sin Three.js. El visor le dice qué carro y qué fotos hay
// (pintar) y ella avisa por las acciones cuando la persona toca algo. Así
// visor.js se queda con la escena y esto se lee aparte.
import { ESTADOS, NOMBRE_ESTADO, NOMBRE_TRABAJO, PIEZA_CARRO, TRABAJOS, fechaCorta, piezasDelCarro, seQuitaConUnToque } from './garaje.js';
import { nombreDePiezaEn } from './carrocerias.js';
import { textoParaQuitar } from './tablero.js';

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

// acciones: { alQuitar(id), alFijarEstado(id, estado), alFijarTrabajo(id, trabajo), alAsignarPintor(id, pintor), alAgregarFoto(id, archivo), alBorrarFoto(idFoto) }
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

  // Una URL temporal por foto, viva mientras la foto esté en la lista: si se
  // liberaran al repintar, las miniaturas que aún no habían cargado fallaban
  // (y la consola se llenaba de ERR_FILE_NOT_FOUND).
  const urls = new Map();
  let urlGrande = '';
  let fotoAbierta = null;
  let piezaDelMenu = null;
  let carroceria = ''; // la del carro que se está pintando, para los nombres
  let empleados = []; // los del taller, para asignar pintor desde el menú
  let carroDeDemo = false;

  // A quién se le puede asignar una pieza de este carro, y a quién le paga. A un carro de demostración solo los empleados de la
  // demostración: la nómina no le paga a nadie real un carro que no existe (tablero.js), y ofrecerle a Marta el capó de DEM006
  // era invitar a asignárselo para que después no le contara (revisión del 9-nov).
  const deEsteCarro = () => (carroDeDemo ? empleados.filter((e) => e.demo) : empleados);
  let pintadas = new Map(); // las piezas de los chips, por id: el menú se abre también desde el carro

  function nombreDePintor(id) {
    const e = empleados.find((x) => x.id === id);
    // Solo el primer nombre: el chip ya lleva el nombre de la pieza.
    return e ? e.nombre.split(/\s+/)[0] : '';
  }

  // ---------- Chips ----------

  // `carroceria`: la que da nombre a las piezas, si no es la del carro (un modelo de catálogo a la vista en un carro que no dice cuál es).
  function pintar({ carro, carroceria: deLasPiezas, fotos = [], conRegistro = false, empleados: lista = [] }) {
    carroceria = deLasPiezas ?? (carro.carroceria || '');
    empleados = lista;
    carroDeDemo = Boolean(carro.demo);
    const piezas = piezasDelCarro(carro).map((p) => ({ ...p, nombre: nombreDe(carroceria, p.id) }));
    pintadas = new Map(piezas.map((p) => [p.id, p]));
    const porPieza = new Map();
    for (const f of fotos) porPieza.set(f.pieza, (porPieza.get(f.pieza) || 0) + 1);

    let texto =
      piezas.length === 0
        ? 'Toca las piezas que necesitan pintura.'
        : piezas.length === 1
          ? '1 pieza marcada'
          : piezas.length + ' piezas marcadas';
    // Sin placa no hay dónde guardar fotos: se dice, no se esconde la cámara
    // sin más. Con placa y sin registro (no responde), ponerle placa no arregla nada.
    if (!conRegistro && piezas.length > 0) texto += carro.placa ? ' · sin registro no se le pueden guardar fotos' : ' · ponle placa para guardarle fotos';
    ui.contador.textContent = texto;

    ui.lista.replaceChildren(...piezas.map((p) => chip(p, porPieza.get(p.id) || 0, conRegistro)));
    pintarFotos(fotos);
    cerrarMenu();
  }

  function chip(pieza, cuantasFotos, conRegistro) {
    const item = document.createElement('li');
    item.className = 'chip estado-' + pieza.estado;
    item.dataset.pieza = pieza.id;

    const estado = boton(
      'chip-estado',
      pieza.nombre,
      pieza.nombre + ': ' + NOMBRE_ESTADO[pieza.estado] + ', ' + NOMBRE_TRABAJO[pieza.trabajo || 'pintura'] + '. Toca para cambiar',
    );
    if (pieza.trabajo === 'latoneria') {
      const etiqueta = document.createElement('small');
      etiqueta.className = 'chip-trabajo';
      etiqueta.textContent = 'latonería';
      estado.append(etiqueta);
    }
    // Quién la pinta: así la nómina de la semana sale sola.
    const pintor = pieza.pintor ? nombreDePintor(pieza.pintor) : '';
    if (pintor) {
      const etiqueta = document.createElement('small');
      etiqueta.className = 'chip-trabajo chip-pintor';
      etiqueta.textContent = pintor;
      estado.append(etiqueta);
    }
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

    const quitar = boton('chip-quitar', '×', 'Desmarcar ' + pieza.nombre);
    quitar.addEventListener('click', () => desmarcar(pieza));

    item.append(estado, camara, quitar);
    return item;
  }

  // La × del renglón y «Desmarcar…» del menú siguen la misma regla que el toque en el
  // carro (seQuitaConUnToque, en garaje.js): sin trabajo encima se va de una; con trabajo,
  // primero la pregunta que dice cuánto sale de la nómina y de quién. Hasta el 9-nov-2026
  // la × borraba una pieza terminada sin preguntar, y con ella sus 90.000 pesos.
  function desmarcar(pieza) {
    if (!seQuitaConUnToque(pieza) && !confirm(textoParaQuitar(pieza.nombre, pieza, pieza.id, deEsteCarro()))) return;
    acciones.alQuitar(pieza.id);
  }

  // ---------- Menú de estado ----------

  // `ancla`: el chip, o el punto del carro donde cayó el dedo (`enElCarro`). Desde el carro
  // el menú sale centrado sobre el dedo: ahí está mirando la persona, y el chip puede estar
  // fuera de la vista, abajo en la lista. Por eso el menú dice arriba de qué pieza es.
  function abrirMenu(pieza, ancla, { enElCarro = false } = {}) {
    piezaDelMenu = pieza.id;
    const separador = document.createElement('hr');
    separador.className = 'menu-separador';
    const titulo = document.createElement('p');
    titulo.className = 'menu-titulo';
    titulo.textContent = pieza.nombre;
    // Con puntos suspensivos solo cuando va a preguntar: así se sabe antes de tocarlo.
    const conPregunta = !seQuitaConUnToque(pieza);
    const quitar = boton('menu-desmarcar', conPregunta ? 'Desmarcar…' : 'Desmarcar', 'Desmarcar ' + pieza.nombre);
    quitar.setAttribute('role', 'menuitem');
    quitar.addEventListener('click', () => {
      cerrarMenu();
      desmarcar(pieza);
    });
    ui.menu.replaceChildren(
      titulo,
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
      separador,
      // Debajo de los estados, el trabajo: solo pintura, o latonería y
      // pintura. Es otra pregunta (qué hay que hacerle) y por eso va aparte.
      ...TRABAJOS.map((trabajo) => {
        const opcion = boton('trabajo-' + trabajo, NOMBRE_TRABAJO[trabajo], NOMBRE_TRABAJO[trabajo]);
        opcion.setAttribute('role', 'menuitemradio');
        opcion.setAttribute('aria-checked', String(trabajo === (pieza.trabajo || 'pintura')));
        opcion.addEventListener('click', () => {
          cerrarMenu();
          acciones.alFijarTrabajo(pieza.id, trabajo);
        });
        return opcion;
      }),
      separador.cloneNode(),
      // Quién la pinta: los empleados activos (más el asignado,
      // aunque esté retirado, para que no desaparezca de la vista).
      ...opcionesDePintor(pieza),
      separador.cloneNode(),
      // Y lo último, lejos de lo que se toca a diario: desmarcarla.
      quitar,
    );
    ui.menu.hidden = false;
    // Encima del ancla; si arriba no cabe, debajo. Y nunca por fuera de la
    // pantalla: el chip puede estar pegado al borde derecho, y desde el carro
    // el dedo puede caer a media pantalla, donde el menú no cabe ni arriba ni
    // abajo entero (con tres pintores mide unos 480 px).
    const r = ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : ancla;
    const m = ui.menu.getBoundingClientRect();
    const izquierda = enElCarro ? r.left - m.width / 2 : r.left;
    const x = Math.max(8, Math.min(izquierda, window.innerWidth - m.width - 8));
    const arriba = r.top - m.height - 6;
    const y = arriba >= 8 ? arriba : r.bottom + 6;
    ui.menu.style.left = x + 'px';
    ui.menu.style.top = Math.max(8, Math.min(y, window.innerHeight - m.height - 8)) + 'px';
  }

  // El menú de una pieza marcada, desde el carro: el visor lo abre cuando el dedo cae en
  // una pieza que ya es trabajo del taller, en vez de desmarcarla. `x`, `y`: donde cayó
  // el dedo, en la ventana. Devuelve false si esa pieza no está en la lista.
  function abrirMenuDe(id, x, y) {
    const pieza = pintadas.get(id);
    if (!pieza) return false;
    abrirMenu(pieza, { left: x, top: y, bottom: y }, { enElCarro: true });
    return true;
  }

  function opcionesDePintor(pieza) {
    // El asignado se ve aunque esté retirado (o sea real en un carro de demostración, de antes del 9-nov): así se puede quitar.
    const visibles = empleados.filter((e) => e.id === pieza.pintor || (e.activo && (!carroDeDemo || e.demo)));
    if (visibles.length === 0) {
      // Sin empleados no hay a quién asignar: el menú lo dice y lleva a la
      // pestaña donde se agregan, en vez de esconder la opción. En un carro
      // de demostración, los suyos llegan con el resto de la demostración.
      const ir = carroDeDemo
        ? boton('menu-pintor sin-empleados', 'Pintor: carga los de la demostración', 'Cargar los pintores de la demostración')
        : boton('menu-pintor sin-empleados', 'Pintor: agrega empleados', 'Agregar empleados');
      ir.addEventListener('click', () => {
        location.href = 'tablero.html?p=empleados';
      });
      return [ir];
    }
    const opciones = visibles.map((e) => {
      const opcion = boton('menu-pintor', e.nombre, 'Pintor: ' + e.nombre);
      opcion.setAttribute('role', 'menuitemradio');
      opcion.setAttribute('aria-checked', String(e.id === pieza.pintor));
      opcion.addEventListener('click', () => {
        cerrarMenu();
        acciones.alAsignarPintor(pieza.id, e.id);
      });
      return opcion;
    });
    const ninguno = boton('menu-pintor', 'Sin pintor', 'Sin pintor asignado');
    ninguno.setAttribute('role', 'menuitemradio');
    ninguno.setAttribute('aria-checked', String(!pieza.pintor));
    ninguno.addEventListener('click', () => {
      cerrarMenu();
      acciones.alAsignarPintor(pieza.id, '');
    });
    return [...opciones, ninguno];
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
    const vivas = new Set(fotos.map((f) => f.id));
    for (const [id, url] of urls) {
      if (!vivas.has(id)) {
        URL.revokeObjectURL(url);
        urls.delete(id);
      }
    }
    ui.fotos.hidden = fotos.length === 0;
    ui.fotos.replaceChildren(
      ...fotos.map((foto) => {
        const b = boton('foto', '', 'Ver la foto de ' + nombreDe(carroceria, foto.pieza));
        const imagen = document.createElement('img');
        if (!urls.has(foto.id)) urls.set(foto.id, URL.createObjectURL(foto.miniatura || foto.foto));
        const url = urls.get(foto.id);
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

  return { pintar, avisar, abrirMenuDe };
}
