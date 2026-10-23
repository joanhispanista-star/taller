// La pantalla del escaneo, dentro del visor: el botón "Escanear", sus
// opciones (con este celular, o subir el archivo de otra app), lo que se ve
// encima de la cámara mientras se escanea, y la vista previa del resultado
// con Guardar / Frente al revés / Está acostado / Descartar. Lo que se
// guarda vive aparte (escaneos.js); el visor solo recibe qué mostrar
// (`mostrar`).
//
// Nada se guarda sin que la persona lo vea primero en el 3D: un escaneo de
// celular puede salir torcido, al revés o con un pedazo de otra cosa.
// Los módulos pesados (la fusión, los cargadores) se importan al abrir el
// diálogo: el visor tiene que abrir al instante.
//
// Cada operación larga (importar, escanear, voltear) lleva un TURNO: si
// mientras tanto empieza otra, se descarta o se cambia a otro carro, la
// vieja no escribe nada al terminar. Sin eso (revisión del 22-oct-2026) dos
// importaciones seguidas se pisaban y el escaneo de un carro podía quedar
// guardado en otro.
import { normalizarCarroceria } from './carrocerias.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function metros(valor) {
  return (Math.round(valor * 100) / 100).toFixed(2).replace('.', ',');
}

export function medidasComoTexto(m) {
  return m ? metros(m.largo) + ' × ' + metros(m.ancho) + ' × ' + metros(m.alto) + ' m' : '';
}

// Las medidas de un escaneo, con lo que haga falta advertir: que el tamaño
// lo puso la app (escalado al catálogo, no medido) o que mide algo fuera de
// lo que es un carro (las piezas van a un genérico de medidas razonables).
// Lo usan la vista previa, el diálogo, el aviso al guardar y la ficha.
export function textoDeMedidas(escaneo) {
  if (!escaneo) return '';
  let texto = medidasComoTexto(escaneo.medidas);
  if (escaneo.escalaAjustada && !escaneo.escalaAjustada.medido) texto += ' (tamaño puesto por la app, no medido)';
  else if (escaneo.fueraDeRango) texto += ' (fuera de lo normal: revisa que sea solo el carro)';
  return texto;
}

function medidasDelCatalogo(medidas) {
  if (!medidas || !medidas.largo) return null;
  const aM = (v) => (v > 100 ? v / 1000 : v);
  return { largo: aM(medidas.largo), ancho: aM(medidas.ancho), alto: aM(medidas.alto) };
}

function fechaCorta(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.getDate() + '-' + MESES[d.getMonth()];
}

// Ceder el turno para que la pantalla pinte un "Armando el 3D…" antes del
// cálculo pesado (surface nets y piezas: uno o dos segundos en el celular).
const pintarYSeguir = () => new Promise((r) => setTimeout(r, 60));

export function crearEscaneoPantalla({ obtenerCarro, mostrar, avisar }) {
  const ui = {
    boton: document.getElementById('escanear'),
    dialogo: document.getElementById('dialogo-escaneo'),
    estado: document.getElementById('escaneo-estado'),
    celular: document.getElementById('escaneo-celular'),
    celularNota: document.getElementById('escaneo-celular-nota'),
    subir: document.getElementById('escaneo-subir'),
    archivo: document.getElementById('archivo-escaneo'),
    guardado: document.getElementById('escaneo-guardado'),
    ver: document.getElementById('escaneo-ver'),
    quitar: document.getElementById('escaneo-quitar'),
    cerrar: document.querySelector('#dialogo-escaneo [data-accion="cerrar"]'),
    hud: document.getElementById('hud-escaneo'),
    hudTexto: document.getElementById('hud-texto'),
    hudVuelta: document.getElementById('hud-vuelta'),
    hudTerminar: document.getElementById('hud-terminar'),
    hudCancelar: document.getElementById('hud-cancelar'),
    previa: document.getElementById('previa-escaneo'),
    previaTexto: document.getElementById('previa-escaneo-texto'),
    previaGuardar: document.querySelector('#previa-escaneo [data-accion="guardar"]'),
    previaVoltear: document.querySelector('#previa-escaneo [data-accion="voltear"]'),
    previaAcostado: document.querySelector('#previa-escaneo [data-accion="acostado"]'),
    previaDescartar: document.querySelector('#previa-escaneo [data-accion="descartar"]'),
  };

  let almacen = null; // la base de los escaneos, al primer uso
  let guardado = null; // el escaneo guardado del carro abierto
  let placaCargada = '';
  // { escaneo, reprocesar({ voltear, ejeArriba }), origen, archivo, ejes }
  let previa = null;
  let verPiezas = false; // con escaneo: ver el escaneo o las piezas (genérico a sus medidas)
  let modulos = null; // los imports pesados, una sola vez
  let turno = 0;

  function cargarModulos() {
    if (!modulos) {
      modulos = Promise.all([import('./escaneo.js'), import('./escaneo-ar.js'), import('./escaneo-importar.js')]).then(([escaneo, ar, importar]) => ({ escaneo, ar, importar }));
      modulos.catch(() => (modulos = null));
    }
    return modulos;
  }

  async function abrirAlmacenDeEscaneos() {
    if (!almacen) {
      const { abrirEscaneos } = await import('./escaneos.js');
      almacen = await abrirEscaneos();
    }
    return almacen;
  }

  // Una operación larga: toma turno y desactiva el botón; devuelve una
  // función que dice si sigue vigente, y otra para terminar.
  function empezar() {
    const mio = ++turno;
    ui.boton.disabled = true;
    return {
      vigente: () => mio === turno,
      terminar: () => {
        if (mio === turno) ui.boton.disabled = false;
      },
    };
  }
  // Cualquier cosa que deje viejas las operaciones en curso.
  function cortarOperaciones() {
    turno++;
    ui.boton.disabled = false;
  }

  function avisarAlVisor() {
    mostrar(previa ? previa.escaneo : guardado, { previa: Boolean(previa), verPiezas: verPiezas && !previa });
    ui.boton.textContent = guardado || previa ? 'Escaneo' : 'Escanear';
    ui.boton.classList.toggle('con-escaneo', Boolean(guardado));
  }

  // El escaneo guardado de una placa (o nada). Lo llama el visor al abrir
  // un carro y cada vez que refresca. Misma placa: no cambia nada (guardar
  // la ficha no tira la vista previa). De "sin placa" a una placa: es el
  // MISMO carro que recibe su nombre, y la vista previa sigue (es justo lo
  // que se pide para guardarla). A otra placa: otro carro; lo que había sin
  // guardar se descarta, con aviso, y lo que estuviera en curso se corta.
  async function cargar(placa) {
    if (placa === placaCargada) {
      await revisarCarroceria();
      return guardado;
    }
    const mismoCarro = placaCargada === '' && placa !== '';
    const anterior = placaCargada;
    placaCargada = placa;
    if (!mismoCarro) {
      cortarOperaciones();
      if (previa) avisar('Se descartó el escaneo sin guardar de ' + (anterior || 'el carro sin placa') + '.');
      previa = null;
      ocultarPrevia();
    }
    guardado = null;
    verPiezas = false;
    // Ya mismo, sin esperar a la base: que el escaneo del carro anterior no
    // se vea ni un momento sobre el nuevo.
    avisarAlVisor();
    if (placa) {
      try {
        const leido = await (await abrirAlmacenDeEscaneos()).obtener(placa);
        if (placa !== placaCargada) return null; // cambió de carro mientras leía
        guardado = leido;
      } catch (e) {
        avisar('No se pudo leer el escaneo guardado: ' + e.message);
      }
    }
    await revisarCarroceria();
    avisarAlVisor();
    return guardado;
  }

  // Si la carrocería del carro cambió (la persona la corrigió en la ficha),
  // las piezas del escaneo se vuelven a poner con la nueva: la malla ya está
  // en el marco del carro y la orientación no depende de la carrocería.
  async function revisarCarroceria() {
    const tipo = normalizarCarroceria(obtenerCarro().carroceria || 'sedan');
    const hayQue = (e) => e && normalizarCarroceria(e.carroceria) !== tipo;
    if (!hayQue(guardado) && !hayQue(previa && previa.escaneo)) return;
    const { reetiquetarEscaneo } = await import('./escaneo.js');
    if (previa && hayQue(previa.escaneo)) previa.escaneo = reetiquetarEscaneo(previa.escaneo, tipo);
    if (hayQue(guardado)) {
      const placa = placaCargada;
      try {
        const nuevo = reetiquetarEscaneo(guardado, tipo);
        const registro = await (await abrirAlmacenDeEscaneos()).guardar(placa, nuevo, { origen: guardado.origen, archivo: guardado.archivo, creado: guardado.creado });
        if (placa === placaCargada) guardado = registro;
      } catch (e) {
        avisar('No se pudieron reacomodar las piezas del escaneo: ' + e.message);
      }
    }
    avisarAlVisor();
  }

  // ---- El diálogo ----

  async function abrir() {
    const carro = obtenerCarro();
    const catalogo = medidasDelCatalogo(carro.medidas);
    if (guardado) {
      ui.estado.textContent =
        'Este carro está escaneado (' + fechaCorta(guardado.creado) + '): ' + textoDeMedidas(guardado) + (catalogo ? '; el catálogo dice ' + medidasComoTexto(catalogo) : '') + '. Puedes escanearlo otra vez o subir otro escaneo.';
    } else {
      ui.estado.textContent = 'Este carro no está escaneado: el 3D es una carrocería de referencia' + (catalogo ? ' a las medidas del catálogo (' + medidasComoTexto(catalogo) + ')' : '') + '. Con un escaneo se ve la silueta del carro de verdad, a su tamaño.';
    }
    ui.guardado.hidden = !guardado;
    ui.ver.textContent = verPiezas ? 'Ver el escaneo' : 'Ver las piezas por dentro';
    ui.celular.disabled = true;
    ui.celularNota.textContent = 'Mirando si este celular puede escanear…';
    ui.dialogo.showModal();
    try {
      const { ar } = await cargarModulos();
      const puede = await ar.puedeEscanear();
      ui.celular.disabled = !puede.si;
      ui.celularNota.textContent = puede.si
        ? 'Camina despacio alrededor del carro, a uno o dos metros, moviendo el celular todo el tiempo (quieto no mide): una vuelta a la altura del pecho y otra con el celular levantado, para que vea el techo. Unos dos minutos. Sale la silueta del carro a escala, aproximada: unos 10 cm de error, sin foto (en el color del carro), y vidrios, cromo y pintura negra salen rellenos a ojo. Las piezas se ubican solas, pero aproximadas. Se guarda solo en este celular. Es nuevo: si sale mal, lo descartas.'
        : puede.motivo + ' Usa la opción de abajo.';
    } catch (e) {
      ui.celularNota.textContent = 'No se pudo preparar el escáner: ' + e.message;
    }
  }

  ui.boton.addEventListener('click', abrir);
  ui.cerrar.addEventListener('click', () => ui.dialogo.close());

  // ---- Escanear con el celular ----

  function pintarVuelta(lados = 0, partes = 12) {
    if (ui.hudVuelta.children.length !== partes) {
      ui.hudVuelta.replaceChildren(...Array.from({ length: partes }, () => document.createElement('i')));
    }
    [...ui.hudVuelta.children].forEach((c, i) => c.classList.toggle('visto', i < lados));
  }

  // De la TSDF a la vista previa (el camino normal y el de un escaneo
  // cortado a medias).
  async function armarDesdeTSDF(resultado, listos, operacion, textoInicial) {
    mostrarPrevia(textoInicial, false);
    await pintarYSeguir();
    if (!operacion.vigente()) return;
    const { escaneo: e } = listos;
    const superficie = resultado.tsdf.puntosDeSuperficie();
    const piso = e.estimarPiso(superficie);
    const mascara = e.aislarCarro(superficie, { piso });
    const caja = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    let n = 0;
    for (let i = 0; i < mascara.length; i++) {
      if (!mascara[i]) continue;
      n++;
      for (let k = 0; k < 3; k++) {
        caja.min[k] = Math.min(caja.min[k], superficie[i * 3 + k] - 0.15);
        caja.max[k] = Math.max(caja.max[k], superficie[i * 3 + k] + 0.15);
      }
    }
    if (n < 500) throw new Error('no encontré el carro en lo escaneado: da la vuelta completa, a uno o dos metros');
    caja.min[1] = piso - 0.1;
    const malla = e.mallaDesdeTSDF(resultado.tsdf, caja);
    // La carrocería se lee al momento (la persona puede corregirla antes de guardar).
    const reprocesar = ({ voltear = false } = {}) => {
      const carro = obtenerCarro();
      return e.procesarEscaneo(malla, { carroceria: carro.carroceria || 'sedan', medidasCatalogo: carro.medidas, voltear, suavizar: true });
    };
    const escaneo = reprocesar();
    if (!operacion.vigente()) return;
    previa = { escaneo, reprocesar, origen: 'celular', archivo: '', ejes: null };
    verPiezas = false;
    avisarAlVisor();
    pintarPrevia();
  }

  ui.celular.addEventListener('click', async () => {
    ui.dialogo.close();
    const operacion = empezar();
    // Lo que se ve encima de la cámara, ya mismo: mientras Chrome abre la
    // sesión (o pide instalar ARCore, o el permiso) Cancelar ya funciona y
    // Terminar no aparece hasta que haya algo que terminar.
    let cancelado = false;
    ui.hud.hidden = false;
    ui.hudTerminar.hidden = true;
    pintarVuelta(0);
    ui.hudTexto.textContent = 'Abriendo la cámara… Si Chrome pide instalar o actualizar "Servicios de Google Play para RA", o permiso para la cámara, acéptalo.';
    ui.hudCancelar.onclick = () => {
      cancelado = true;
      ui.hud.hidden = true;
      operacion.terminar();
    };
    // requestSession tiene que salir de este toque: los módulos ya se
    // cargaron al abrir el diálogo, así que esto no espera nada antes.
    const listos = await cargarModulos();
    let sesion;
    try {
      sesion = await listos.ar.escanear({
        hud: ui.hud,
        alAvanzar: (a) => {
          pintarVuelta(a.lados, a.partes);
          const s = Math.round(a.segundos);
          let texto = 'Lados vistos: ' + a.lados + ' de ' + a.partes + ' · ' + s + ' s';
          if (a.cuadros === 0) texto = 'Mueve el celular despacio de lado a lado: todavía no mide la profundidad… (' + s + ' s)';
          else if (a.lleno) texto = 'Ya no cabe más: toca Terminar.';
          else if (a.lados >= a.partes - 1) texto += ' · ¡Vuelta completa! Toca Terminar.';
          ui.hudTexto.textContent = texto;
        },
      });
    } catch (e) {
      ui.hud.hidden = true;
      operacion.terminar();
      if (cancelado || !operacion.vigente()) return;
      if (e.name === 'NotSupportedError' || e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        avisar('No se abrió la cámara para escanear. Si le dijiste que no al permiso de cámara y realidad aumentada, o a instalar "Servicios de Google Play para RA", actívalo (en Chrome: el candado junto a la dirección › Permisos) o instálalo y vuelve a intentar. Si no se puede, sube un escaneo hecho con otra app.');
      } else {
        avisar('No se pudo abrir la cámara para escanear (' + e.message + '). Sube un escaneo hecho con otra app.');
      }
      return;
    }
    if (cancelado || !operacion.vigente()) {
      sesion.escaneo.cancelar();
      return;
    }
    ui.hudTexto.textContent = 'Apunta a la carrocería y camina despacio alrededor del carro: una vuelta a la altura del pecho y otra levantando el celular para que vea el techo.';
    ui.hudTerminar.hidden = false;
    ui.hudTerminar.onclick = () => sesion.escaneo.terminar();
    ui.hudCancelar.onclick = () => sesion.escaneo.cancelar();
    try {
      let resultado;
      let textoInicial;
      try {
        resultado = await sesion.fin;
        textoInicial = 'Armando el 3D con lo que viste (' + resultado.cuadros + ' cuadros, ' + Math.round(resultado.segundos) + ' s)…';
      } catch (e) {
        ui.hud.hidden = true;
        if (!operacion.vigente()) return;
        // Una llamada, el botón Atrás o el de encendido cortan la sesión:
        // con suficiente escaneado, se arma igual y la persona decide.
        if (e.message === 'interrumpido' && e.parcial && e.parcial.cuadros >= 30) {
          resultado = e.parcial;
          textoInicial = 'Se cortó el escaneo (se salió de la cámara). Armo el 3D con lo que alcanzó a ver (' + e.parcial.cuadros + ' cuadros): revísalo antes de guardar…';
        } else {
          if (e.message === 'sin-profundidad') {
            avisar('Este celular no le da la profundidad a la página (le falta esa función de ARCore). Si tienes un escaneo hecho con otra app (por ejemplo RealityScan), súbelo.');
          } else if (e.message === 'profundidad-no-llega') {
            avisar('No llegó la profundidad en 30 segundos. Muévete más despacio, con buena luz, a uno o dos metros del carro, y vuelve a intentar. Si sigue igual, sube un escaneo hecho con otra app.');
          } else if (e.message === 'interrumpido') {
            avisar('El escaneo se cortó antes de ver el carro (se salió de la cámara). Vuelve a intentar sin salir de la pantalla.');
          } else if (e.message !== 'cancelado') {
            avisar('El escaneo falló (' + e.message + ').');
          }
          return;
        }
      }
      ui.hud.hidden = true;
      await armarDesdeTSDF(resultado, listos, operacion, textoInicial);
    } catch (err) {
      if (operacion.vigente()) {
        ocultarPrevia();
        avisar('No pude armar el 3D: ' + err.message + '.');
      }
    } finally {
      operacion.terminar();
    }
  });

  // ---- Subir un escaneo de otra app ----

  ui.subir.addEventListener('click', () => ui.archivo.click());
  ui.archivo.addEventListener('change', async () => {
    const archivo = ui.archivo.files && ui.archivo.files[0];
    ui.archivo.value = '';
    if (!archivo) return;
    ui.dialogo.close();
    const operacion = empezar();
    mostrarPrevia('Leyendo el escaneo (' + Math.round(archivo.size / 1e5) / 10 + ' MB)…', false);
    try {
      await pintarYSeguir();
      const { importar } = await cargarModulos();
      if (!operacion.vigente()) return;
      const malla = await importar.leerArchivoDeEscaneo(archivo);
      if (!operacion.vigente()) return;
      mostrarPrevia('Buscando el carro y sus piezas…', false);
      await pintarYSeguir();
      if (!operacion.vigente()) return;
      const reprocesar = ({ voltear = false, ejeArriba = null } = {}) => {
        const carro = obtenerCarro();
        return importar.procesarImportado(malla, { carroceria: carro.carroceria || 'sedan', medidasCatalogo: carro.medidas, voltear, ejeArriba });
      };
      const escaneo = reprocesar();
      if (!operacion.vigente()) return;
      previa = { escaneo, reprocesar, origen: 'archivo', archivo: archivo.name, ejes: importar.EJES_ARRIBA };
      verPiezas = false;
      avisarAlVisor();
      pintarPrevia();
    } catch (err) {
      if (operacion.vigente()) {
        ocultarPrevia();
        avisar('No pude usar ese archivo: ' + err.message + '.');
      }
    } finally {
      operacion.terminar();
    }
  });

  // ---- La vista previa ----

  function mostrarPrevia(texto, conBotones) {
    ui.previa.hidden = false;
    ui.previaTexto.textContent = texto;
    for (const b of [ui.previaGuardar, ui.previaVoltear, ui.previaDescartar]) b.hidden = !conBotones;
    // "Está acostado" solo para lo importado: el escáner del celular sabe
    // dónde es arriba (la gravedad).
    ui.previaAcostado.hidden = !(conBotones && previa && previa.ejes);
  }
  function ocultarPrevia() {
    ui.previa.hidden = true;
  }

  function pintarPrevia() {
    const e = previa.escaneo;
    const catalogo = medidasDelCatalogo(obtenerCarro().medidas);
    let texto = 'Escaneo nuevo: ' + textoDeMedidas(e) + (catalogo ? ' (catálogo: ' + medidasComoTexto(catalogo) + ')' : '') + '.';
    if (e.escalaAjustada && e.escalaAjustada.medido) texto += ' (El archivo ' + e.escalaAjustada.motivo + ': ya está en metros.)';
    else if (e.escalaAjustada) texto += ' Ojo: ' + e.escalaAjustada.motivo + ', así que ese tamaño NO es medido.';
    texto += ' Gíralo y mira que el frente quedó adelante; si no, toca «Frente al revés».';
    if (previa.ejes) texto += ' Si quedó acostado o boca abajo, toca «Está acostado» hasta que quede parado.';
    mostrarPrevia(texto, true);
  }

  async function rehacerPrevia(texto, opciones) {
    if (!previa) return;
    const esta = previa;
    const operacion = empezar();
    mostrarPrevia(texto, false);
    try {
      await pintarYSeguir();
      if (!operacion.vigente() || previa !== esta) return;
      esta.escaneo = esta.reprocesar(opciones);
      avisarAlVisor();
      pintarPrevia();
    } catch (err) {
      if (operacion.vigente() && previa === esta) {
        pintarPrevia();
        avisar('No se pudo: ' + err.message + '.');
      }
    } finally {
      operacion.terminar();
    }
  }

  ui.previaVoltear.addEventListener('click', () => {
    if (!previa) return;
    rehacerPrevia('Dándole la vuelta…', { voltear: !previa.escaneo.volteado, ejeArriba: previa.escaneo.ejeArriba || null });
  });

  ui.previaAcostado.addEventListener('click', () => {
    if (!previa || !previa.ejes) return;
    const ejes = previa.ejes;
    const actual = previa.escaneo.ejeArriba || ejes[0];
    const siguiente = ejes[(ejes.indexOf(actual) + 1) % ejes.length];
    rehacerPrevia('Parándolo de otro lado…', { voltear: false, ejeArriba: siguiente });
  });

  ui.previaDescartar.addEventListener('click', () => {
    cortarOperaciones();
    previa = null;
    ocultarPrevia();
    avisarAlVisor();
  });

  ui.previaGuardar.addEventListener('click', async () => {
    if (!previa) return;
    const esta = previa;
    const placa = obtenerCarro().placa;
    if (!placa) {
      avisar('Ponle placa al carro para guardar el escaneo (arriba, en «Placa»): la vista previa no se pierde.');
      return;
    }
    const operacion = empezar();
    try {
      const almacen = await abrirAlmacenDeEscaneos();
      const registro = await almacen.guardar(placa, esta.escaneo, { origen: esta.origen, archivo: esta.archivo });
      // Si mientras se guardaba se cambió de carro, el escaneo quedó con SU
      // placa (la de cuando se tocó Guardar) y aquí no se toca nada.
      if (obtenerCarro().placa !== placa || previa !== esta) {
        avisar('Escaneo guardado para ' + placa + '.');
        return;
      }
      guardado = registro;
      placaCargada = placa;
      previa = null;
      ocultarPrevia();
      avisarAlVisor();
      // Que el teléfono no lo borre cuando le falte espacio.
      almacen.pedirQueNoSeBorren();
      avisar('Escaneo guardado: el 3D de este carro es el escaneado (' + textoDeMedidas(guardado) + ').');
    } catch (err) {
      avisar('No se pudo guardar el escaneo: ' + err.message + (/quota|cuota|espacio/i.test(err.message) ? ' (el teléfono no tiene espacio)' : '') + '.');
    } finally {
      operacion.terminar();
    }
  });

  // ---- Con un escaneo guardado ----

  ui.ver.addEventListener('click', () => {
    verPiezas = !verPiezas;
    ui.dialogo.close();
    avisarAlVisor();
  });

  ui.quitar.addEventListener('click', async () => {
    const placa = obtenerCarro().placa;
    if (!guardado || !confirm('¿Quitar el escaneo de ' + placa + '? El carro vuelve a la carrocería de referencia. Las piezas marcadas no se tocan.')) return;
    try {
      await (await abrirAlmacenDeEscaneos()).borrar(placa);
      if (placa !== placaCargada) return;
      guardado = null;
      verPiezas = false;
      ui.dialogo.close();
      avisarAlVisor();
    } catch (err) {
      avisar('No se pudo quitar el escaneo: ' + err.message);
    }
  });

  return {
    cargar,
    abrir,
    revisarCarroceria,
    get verPiezas() {
      return verPiezas;
    },
    get guardado() {
      return guardado;
    },
    get previa() {
      return previa ? previa.escaneo : null;
    },
  };
}
