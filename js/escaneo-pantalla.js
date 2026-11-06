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
//
// Aquí también manda lo que se ve de cada carro, en este orden: vista previa >
// escaneo guardado de ESTA placa > modelo de la línea (modelos-catalogo.js) >
// genérico. El modelo de la línea no es un escaneo: es uno por línea, no se
// guarda por placa y no se quita de ningún registro. Sale solo. Si hay que bajarlo,
// se ve el genérico mientras tanto, con un letrero. Si ya está en el teléfono, el
// lienzo espera tapado: el carro de cajas un segundo cada vez que se abre una Captiva
// es justo la queja de Joan.
import { textoDeCatalogo } from './escaneo-catalogo.js';
import { normalizarCarroceria } from './carrocerias.js';
import { detalleDelError, mensajeParaLaPantalla } from './garaje.js';
import { FOTO_COMPLETA, FOTO_LIVIANA, OPCIONES_LIVIANAS, SIN_CUPO, anosDelModelo, bajarCupo, bajarModelo, creditoDeCatalogo, datosParaUsarModelo, fijarCupo, leerModeloGlb, marcarAbriendo, modeloDeLaLinea, modeloDelCatalogo, modeloParecido, modeloQueLeToca, nivelDeCupo, olvidarModelo, quitarMarcaDeAbriendo, revisarIntentoAnterior, textoDeLaLista, textoDelCredito } from './modelos-catalogo.js';

const MESES =['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

// 25 cm es más de lo que un carro se aparta de su propia línea. Cuando pasa puede ser el
// escaneo, el archivo o la línea que se eligió en la ficha: no se le echa la culpa a nadie,
// se dice qué mirar.
export function avisoDeLargo(medidas, medidasDelCarro) {
  const catalogo = medidasDelCatalogo(medidasDelCarro);
  if (!medidas || !catalogo) return '';
  const diferencia = medidas.largo - catalogo.largo;
  if (Math.abs(diferencia) <= 0.25) return '';
  const cuanto = Math.round(Math.abs(diferencia) * 100) + ' cm ';
  return diferencia > 0
    ? 'Mide ' + cuanto + 'más de largo que el catálogo: mira si quedó parte del piso o del entorno.'
    : 'Mide ' + cuanto + 'menos de largo que el catálogo: mira si quedó parte del piso o del entorno, o si le falta un pedazo al carro.';
}

function fechaCorta(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.getDate() + '-' + MESES[d.getMonth()];
}

// Ceder el turno para que la pantalla pinte un "Armando el 3D…" antes del
// cálculo pesado (surface nets y piezas: uno o dos segundos en el celular).
const pintarYSeguir = () => new Promise((r) => setTimeout(r, 60));

// `registroCaido()`: el aviso de que el registro no responde, o nada. `taparLienzo` y `destaparLienzo`: el visor esconde el carro de
// cajas mientras llega de la caché lo que le toca. `prepararPorDentro`: trae el carro de "por dentro" antes de pedirlo.
export function crearEscaneoPantalla({ obtenerCarro, mostrar, avisar: avisarEnLaHoja, registroCaido = () => '', alGuardarEscaneo = () => {}, alQuitarEscaneo = () => {}, alCambiarCarro = () => {}, alCambiarDatos = () => {}, taparLienzo = () => {}, destaparLienzo = () => {}, prepararPorDentro = async () => {}, topeDeLaFoto = 20000, topeDeLaLectura = 2500 }) {
  const ui = {
    aviso: document.getElementById('aviso'),
    boton: document.getElementById('escanear'),
    dialogo: document.getElementById('dialogo-escaneo'),
    titulo: document.getElementById('escaneo-titulo'),
    estado: document.getElementById('escaneo-estado'),
    linea: document.getElementById('escaneo-linea'),
    credito: document.getElementById('escaneo-credito'),
    verLinea: document.getElementById('escaneo-ver-linea'),
    verNota: document.getElementById('escaneo-ver-nota'),
    referencia: document.getElementById('escaneo-referencia'),
    referenciaNota: document.getElementById('escaneo-referencia-nota'),
    usarParecido: document.getElementById('escaneo-usar-parecido'),
    reintentar: document.getElementById('escaneo-reintentar'),
    lista: document.getElementById('escaneo-lista'),
    letrero: document.getElementById('letrero-modelo'),
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
  // El modelo de la línea. Aparte de `guardado`: no es de esta placa.
  let deLinea = null; // { modelo, escaneo }: listo para verse
  let pedidoDeLinea = null; // la entrada de la tabla que se está trayendo
  let turnoDeLinea = 0; // cambió de carro o de línea mientras bajaba: lo viejo no se pone encima
  let lineaCaida = null; // { modelo, clase, texto }: no se pudo en esta apertura, y se vuelve a intentar en la próxima
  let enMemoria = null; // { modelo, escaneo }: dos Captivas seguidas no leen dos veces el archivo
  const yaAvisadas = new Set(); // cada clase de falla de un modelo se dice una vez: otra distinta no sale muda
  let avisoDeLinea = ''; // lo último que se dijo del modelo, para callarlo cuando deje de ser verdad
  let parecidoDicho = false; // en esta apertura ya se dijo que la app tiene un modelo que quizá le sirva
  let errorDeFoto = null; // lo que dijo el navegador al no abrir la foto: en un iPhone nadie ve la consola
  // Mientras se mira si esta placa tiene escaneo no se sabe qué le toca: bajar 4 MB que no se van a ver no ayuda. Es solo
  // la lectura de la placa abierta: una vieja, de otra placa, no le puede frenar el modelo a esta.
  let lectura = null;
  // El intento anterior de abrir un modelo no llegó al primer cuadro: en iOS es lo que deja la falta de memoria, y ya bajó un escalón.
  let vaMasLiviano = Boolean(revisarIntentoAnterior());

  ui.lista.textContent = textoDeLaLista();

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

  // Un GLB de catálogo guardado en esta placa tampoco es un escaneo de este carro: nadie le pasó el celular.
  function pintarBoton() {
    const escaneado = (guardado && !guardado.catalogo) || (previa && !previa.escaneo.catalogo);
    ui.boton.textContent = escaneado ? 'Escaneo' : 'Escanear';
    ui.boton.classList.toggle('con-escaneo', Boolean(guardado && !guardado.catalogo));
  }

  // Con el registro caído su aviso sigue siendo verdad, diga lo que diga lo demás: sin memoria se cae la base y tampoco abre la foto, y
  // el aviso de que lo marcado queda solo como borrador desaparecía justo cuando más importa.
  function avisar(texto) {
    avisarEnLaHoja([registroCaido(), texto].filter(Boolean).join(' · '));
  }

  function avisarAlVisor(extra = {}) {
    pintarBoton();
    mostrar(previa ? previa.escaneo : guardado || (deLinea && deLinea.escaneo) || null, { previa: Boolean(previa), verPiezas: verPiezas && !previa, ...extra });
  }

  // Una vista previa nueva solo se queda si el visor alcanzó a mostrarla. Armar el modelo puede
  // reventar (falta de memoria, y al cambiar de escaneo conviven el viejo y el nuevo): sin
  // esto el panel ofrecía Guardar de un carro que nadie vio, con el genérico en pantalla, y
  // se guardaba.
  function ponerPreviaNueva(nueva) {
    const anterior = [previa, verPiezas];
    previa = nueva;
    verPiezas = false;
    try {
      avisarAlVisor();
    } catch (error) {
      [previa, verPiezas] = anterior;
      pintarBoton();
      throw error;
    }
    // Una vista previa manda, y lo que venía bajando no se pone encima. Si la descartan se vuelve a pedir: de la caché.
    cortarPedidoDeLinea();
  }

  // Pone en pantalla lo guardado. Armar el modelo puede reventar (un registro dañado, falta
  // de memoria al reservar sus arreglos) y aquí nadie espera ese error: el panel se quedaba
  // en «Abriendo el escaneo…» para siempre, sin botones ni aviso. `guardado` sigue ahí:
  // desde el botón Escaneo se puede reintentar, quitarlo o subir otro.
  async function mostrarGuardado() {
    try {
      await revisarCarroceria();
      avisarAlVisor();
    } catch (e) {
      console.warn(e);
      mostrar(null, { previa: false, verPiezas: false });
      if (!guardado && !previa && deLinea) {
        lineaNoSalio(deLinea.modelo, 'sinArmar', textoSinArmar(deLinea.modelo, e));
        deLinea = null;
        verPiezas = false;
      } else {
        avisar('No se pudo abrir el escaneo guardado: se ve la carrocería de referencia. Vuelve a abrir el carro; si sigue igual, quita el escaneo y súbelo otra vez.');
      }
    } finally {
      if (!previa) ocultarPrevia();
    }
  }

  // ---- El modelo de la línea ----

  function ponerLetrero(texto) {
    ui.letrero.textContent = texto;
    ui.letrero.hidden = false;
  }
  function quitarLetrero() {
    ui.letrero.hidden = true;
  }
  // Lo que dijo el navegador, tal cual: es lo único que deja arreglar un teléfono desde lejos con un pantallazo. La falta de señal no lo lleva: no hay nada que revisar.
  const conDato = (error) => (error ? ' Dato para revisar: ' + detalleDelError(error) : '');
  const textoSinRed = () => 'Esta línea tiene modelo 3D; se baja la primera vez con internet. Se vuelve a intentar cuando vuelva la señal o al abrir el carro otra vez.';
  const textoSinBajar = (modelo, error) => 'No se pudo bajar el modelo de ' + modelo.corto + ': se ve la carrocería de referencia. Se vuelve a intentar al abrir el carro otra vez.' + conDato(error);
  const textoSinFoto = (modelo, error) => 'No se pudo abrir la foto del modelo de ' + modelo.corto + ' (puede faltarle memoria a este celular), y sin foto no sirve: se ve la carrocería de referencia. Cierra otras apps y vuelve a abrir el carro.' + conDato(error);
  const textoSinArmar = (modelo, error) => 'No se pudo armar el modelo de ' + modelo.corto + ': se ve la carrocería de referencia. Cierra otras apps y vuelve a abrir el carro.' + conDato(error);
  const textoSinCupo = (modelo, error) => 'Este celular no alcanzó a abrir el modelo de ' + modelo.corto + ', ni con menos detalle: se ve la carrocería de referencia. Cierra otras apps y, en Escanear, toca «Intentar otra vez el modelo».' + conDato(error);
  const textoMasLiviano = (modelo) => 'Este celular no alcanzó con la foto completa del modelo de ' + modelo.corto + ': se ve con menos detalle. Para volver a intentarlo, toca «Escanear».';
  const textoParecido = (modelo) => 'La app tiene el modelo de ' + modelo.nombre + '. Si este carro es ' + anosDelModelo(modelo) + ', toca «Escanear» para usarlo.';

  function decirDeLinea(texto) {
    avisoDeLinea = texto;
    avisar(texto);
  }
  // Solo si sigue en pantalla: el visor pudo haber dicho otra cosa después.
  function callarAvisoDeLinea() {
    if (avisoDeLinea && ui.aviso.textContent.includes(avisoDeLinea)) avisar('');
    avisoDeLinea = '';
  }

  // El genérico se queda en pantalla. Se dice una vez por clase de falla, y el diálogo lo sigue diciendo mientras dure.
  function lineaNoSalio(modelo, clase, texto) {
    lineaCaida = { modelo, clase, texto };
    const clave = modelo.archivo + '|' + clase;
    if (yaAvisadas.has(clave)) return;
    yaAvisadas.add(clave);
    decirDeLinea(texto);
  }

  function cortarPedidoDeLinea() {
    if (!pedidoDeLinea) return;
    turnoDeLinea++;
    pedidoDeLinea = null;
    quitarLetrero();
    destaparLienzo();
  }

  // Lo del carro anterior ya no cuenta. `enMemoria` sí se queda: es de la línea, no de la placa.
  function soltarLinea() {
    cortarPedidoDeLinea();
    deLinea = null;
    lineaCaida = null;
    avisoDeLinea = '';
    parecidoDicho = false;
  }

  // Trae el modelo y lo cambia. Se abre la foto antes de armar nada: una foto que no abre no alcanza a costar el armado, y se pasa
  // al carro ya con su foto, sin ver el color plano. Mientras mira la caché el lienzo va tapado; si hay que ir a la red, se destapa: 4 MB
  // pueden tardar, y el genérico sirve para marcar. `tapar`: en un reintento no, que la persona ya está trabajando sobre el genérico.
  async function traerLinea(modelo, { tapar = true } = {}) {
    const mio = ++turnoDeLinea;
    const vigente = () => mio === turnoDeLinea;
    // Este celular ya dijo que no le alcanza: no se vuelve a intentar solo, o ese carro no abriría nunca. El diálogo ofrece intentarlo.
    if (nivelDeCupo(modelo) >= SIN_CUPO) {
      lineaNoSalio(modelo, 'sinCupo', textoSinCupo(modelo));
      return;
    }
    pedidoDeLinea = modelo;
    if (tapar) taparLienzo();
    const abriendo = 'Abriendo el modelo de ' + modelo.corto + '…';
    // De la caché suele ser un instante, y entonces no hay nada que decir.
    const plazo = setTimeout(() => {
      if (vigente()) ponerLetrero(abriendo);
    }, 300);
    let foto = null;
    let escaneo = null;
    try {
      escaneo = enMemoria && enMemoria.modelo === modelo ? enMemoria.escaneo : null;
      if (!escaneo) {
        const bytes = await bajarModelo(modelo, {
          alIrALaRed: () => {
            clearTimeout(plazo);
            if (!vigente()) return;
            destaparLienzo();
            ponerLetrero('Bajando el modelo de ' + modelo.corto + ' (' + Math.round(modelo.megas) + ' MB)…');
          },
        });
        if (!vigente()) return;
        if (!ui.letrero.hidden) ponerLetrero(abriendo);
        escaneo = await armarEscaneoDeLinea(modelo, bytes);
        enMemoria = { modelo, escaneo };
        if (!vigente()) return;
      }
      escaneo.opcionesDeFoto = nivelDeCupo(modelo) >= FOTO_LIVIANA ? OPCIONES_LIVIANAS : null;
      foto = await abrirFotoDe(escaneo, modelo);
      if (!vigente()) return;
      if (!foto) {
        lineaNoSalio(modelo, 'sinFoto', textoSinFoto(modelo, errorDeFoto));
        return;
      }
      // Armarlo deja la pantalla quieta un momento: que el letrero alcance a salir.
      await pintarYSeguir();
      if (!vigente()) return;
      deLinea = { modelo, escaneo };
      // Llegó otra cosa que manda. El modelo queda listo por si esa otra cosa se va.
      if (previa || guardado || lectura) return;
      escaneo.fotoAbierta = foto;
      foto = null;
      verPiezas = false;
      avisarAlVisor();
      // Lo que se haya dicho de cuando no bajó ya no es verdad.
      callarAvisoDeLinea();
      if (vaMasLiviano) {
        vaMasLiviano = false;
        decirDeLinea(textoMasLiviano(modelo));
      }
    } catch (e) {
      if (!vigente()) return;
      console.warn(e);
      deLinea = null;
      if (e.sinRed) lineaNoSalio(modelo, 'sinRed', textoSinRed());
      else if (escaneo || e.alArmar) lineaNoSalio(modelo, 'sinArmar', textoSinArmar(modelo, e));
      else lineaNoSalio(modelo, 'sinBajar', textoSinBajar(modelo, e));
    } finally {
      clearTimeout(plazo);
      // Lo que no se llegó a usar son hasta 50 MB de imagen abierta: no se deja para el recolector.
      if (foto) {
        foto.close();
        quitarMarcaDeAbriendo();
      }
      if (escaneo && escaneo.fotoAbierta) {
        escaneo.fotoAbierta.close();
        escaneo.fotoAbierta = null;
        quitarMarcaDeAbriendo();
      }
      if (vigente()) {
        pedidoDeLinea = null;
        quitarLetrero();
        destaparLienzo();
        if (ui.dialogo.open) pintarDialogo();
      }
    }
  }

  async function armarEscaneoDeLinea(modelo, bytes) {
    const [{ escaneoDeCatalogo }, { ajustesDelEscaneo }] = await Promise.all([import('./escaneo-catalogo.js'), import('./escaneo.js')]);
    try {
      return { ...escaneoDeCatalogo(leerModeloGlb(bytes), ajustesDelEscaneo), deLinea: modelo };
    } catch (e) {
      // Pasó la revisión y por dentro no se entiende (en http no hay con qué comparar su huella): que la próxima vez se baje de
      // nuevo, y que no se diga que falló la bajada, porque ni se intentó.
      await olvidarModelo(modelo);
      throw Object.assign(e, { alArmar: true });
    }
  }

  // Si el navegador no contesta nunca, el letrero se quedaría en «Abriendo…». Si contesta tarde, esa imagen ya nadie la va a usar.
  async function abrirConTope(blob, opciones) {
    const abriendo = opciones ? createImageBitmap(blob, opciones) : createImageBitmap(blob);
    let reloj;
    const vencido = new Promise((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new DOMException('La foto no abrió en ' + topeDeLaFoto / 1000 + ' s', 'TimeoutError')), topeDeLaFoto);
    });
    try {
      return await Promise.race([abriendo, vencido]);
    } catch (e) {
      abriendo.then(
        (tarde) => tarde.close(),
        () => {},
      );
      throw e;
    } finally {
      clearTimeout(reloj);
    }
  }

  // La marca va antes: si iOS mata la pestaña por esto, no alcanza a avisar nada, y al arrancar se sabrá por la marca. Si la completa no
  // abre, antes de rendirse la cuarta parte de la memoria: un modelo con menos detalle sirve, y el genérico no.
  async function abrirFotoDe(escaneo, modelo) {
    errorDeFoto = null;
    if (typeof createImageBitmap !== 'function') {
      errorDeFoto = new Error('Este navegador no tiene createImageBitmap');
      return null;
    }
    marcarAbriendo(modelo);
    try {
      return await abrirConTope(escaneo.textura, escaneo.opcionesDeFoto);
    } catch (e) {
      console.warn(e);
      errorDeFoto = e;
    }
    if (!escaneo.opcionesDeFoto) {
      try {
        const liviana = await abrirConTope(escaneo.textura, OPCIONES_LIVIANAS);
        escaneo.opcionesDeFoto = OPCIONES_LIVIANAS;
        fijarCupo(modelo, FOTO_LIVIANA);
        vaMasLiviano = true;
        return liviana;
      } catch (e) {
        console.warn(e);
        errorDeFoto = e;
      }
    }
    quitarMarcaDeAbriendo();
    return null;
  }

  // Sin señal: se reintenta solo al volver la señal o al volver a la app (Safari corta la bajada al irse a WhatsApp, y eso también
  // cae aquí). El aviso se queda hasta que salga, y el genérico también: sin tapar nada, la persona puede estar marcando.
  function reintentarSiFueLaRed() {
    if (!lineaCaida || lineaCaida.clase !== 'sinRed') return;
    const { modelo } = lineaCaida;
    lineaCaida = null;
    if (!lectura && !previa && !guardado && !deLinea && modelo === modeloQueLeToca(obtenerCarro())) traerLinea(modelo, { tapar: false });
  }
  globalThis.addEventListener?.('online', reintentarSiFueLaRed);
  globalThis.addEventListener?.('pageshow', (e) => {
    if (e.persisted) reintentarSiFueLaRed();
  });
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') reintentarSiFueLaRed();
  });
  // Irse de la página a propósito no es morir abriendo el modelo.
  globalThis.addEventListener?.('pagehide', quitarMarcaDeAbriendo);

  // La línea manda sola. Se llama al abrir un carro, cuando la ficha le cambia la línea, y cuando se va lo que le
  // ganaba (Descartar, Quitar). Si ya está, o ya viene en camino, no hace nada.
  function revisarLinea() {
    if (lectura) return;
    const carro = obtenerCarro();
    const toca = modeloQueLeToca(carro);
    if (deLinea && deLinea.modelo !== toca) {
      const seVeia = !previa && !guardado;
      deLinea = null;
      if (seVeia) {
        verPiezas = false;
        ponerLoQueToca();
      }
    }
    if (pedidoDeLinea && pedidoDeLinea !== toca) cortarPedidoDeLinea();
    // Con otra línea, "esta línea tiene modelo 3D" ya no es verdad.
    if (lineaCaida && lineaCaida.modelo !== toca) {
      lineaCaida = null;
      callarAvisoDeLinea();
    }
    avisarSiEsParecido(carro, toca);
    if (!toca || deLinea || pedidoDeLinea === toca || lineaCaida || previa || guardado) return;
    traerLinea(toca);
  }

  // Quien escribió "Chevrolet Captiva" ve el carro de cajas y, si no se le dice, nunca se entera de que la app tiene el modelo.
  function avisarSiEsParecido(carro, toca) {
    const parecido = !toca && !previa && !guardado && !carro.sinModeloDeCatalogo ? modeloParecido(carro) : null;
    if (parecido && !parecidoDicho) {
      parecidoDicho = true;
      decirDeLinea(textoParecido(parecido));
    } else if (!parecido && parecidoDicho) {
      parecidoDicho = false;
      callarAvisoDeLinea();
    }
  }

  // Para lo que llama sin nadie que espere el error: lo que no se pudo armar deja en pantalla lo de antes (visor.js).
  function ponerLoQueToca() {
    try {
      avisarAlVisor();
    } catch (e) {
      console.warn(e);
    }
  }

  // El escaneo guardado de una placa (o nada). Lo llama el visor al abrir
  // un carro y cada vez que refresca. Misma placa: no cambia nada (guardar
  // la ficha no tira la vista previa). De "sin placa" a una placa: es el
  // MISMO carro que recibe su nombre, y la vista previa sigue (es justo lo
  // que se pide para guardarla). A otra placa: otro carro; lo que había sin
  // guardar se descarta, con aviso, y lo que estuviera en curso se corta.
  async function cargar(placa) {
    if (placa === placaCargada) {
      // Antes de cualquier espera: si la ficha le cambió la línea, refrescar() no alcanza a volver a armar el modelo viejo.
      revisarLinea();
      if (!pedidoDeLinea && !lectura) destaparLienzo();
      await revisarCarroceria();
      // La línea se pudo corregir en la ficha: el panel seguía con «(catálogo: 4,80…) Mide 60 cm
      // menos…», y la ficha de arriba ya en Hyundai Kona. Con una operación en curso no: le
      // devolvería los botones a un Guardar a medias.
      if (previa && !ui.boton.disabled) pintarPrevia();
      return guardado;
    }
    const mismoCarro = placaCargada === '' && placa !== '';
    const anterior = placaCargada;
    placaCargada = placa;
    // La que venía leyendo era de otra placa. Si es el mismo carro que recibe su nombre, de su lectura nada queda por saber.
    lectura = null;
    // «Ponle placa…» ya se cumplió. Solo con vista previa: al abrir la app, el primer cargar
    // de un carro con placa también pasa por aquí, y se llevaba el aviso del arranque («Este
    // navegador no guarda el registro…»).
    if (mismoCarro && previa) avisar('');
    if (!mismoCarro) {
      cortarOperaciones();
      // Con otro carro, el aviso anterior ya no es verdad ("el 3D de este carro es el
      // escaneado"): se borra, si no hay uno nuevo que dar.
      avisar(previa ? 'Se descartó el escaneo sin guardar de ' + (anterior || 'el carro sin placa') + '.' : '');
      previa = null;
      ocultarPrevia();
      soltarLinea();
    }
    guardado = null;
    verPiezas = false;
    // Otro carro al que le toca un modelo: que no se vea el de cajas mientras se sabe si está en el teléfono.
    if (!mismoCarro && modeloQueLeToca(obtenerCarro())) taparLienzo();
    // Ya mismo, sin esperar a la base: que el escaneo del carro anterior no
    // se vea ni un momento sobre el nuevo.
    avisarAlVisor();
    if (placa) {
      const esta = (lectura = { placa });
      // Una base que se demora no puede dejar a la Captiva sin su modelo: conexion-bd.js cuenta de Safari que no contestan nunca, y el tope
      // de la base es de un minuto, dos veces. Si después aparece un escaneo, le gana igual: mostrarGuardado lo pone encima.
      const plazoLectura = setTimeout(() => {
        if (lectura !== esta) return;
        lectura = null;
        revisarLinea();
      }, topeDeLaLectura);
      try {
        const leido = await (await abrirAlmacenDeEscaneos()).obtener(placa);
        if (placa !== placaCargada) return null; // cambió de carro mientras leía
        // Armar el escaneo toma un momento (segundos en un celular, con la pantalla
        // quieta): que se sepa qué está pasando antes de empezar, si no hay nada que
        // se le pueda pisar.
        if (leido && !previa) {
          mostrarPrevia(leido.catalogo ? 'Abriendo el modelo…' : 'Abriendo el escaneo…', false);
          await pintarYSeguir();
          if (placa !== placaCargada) {
            ocultarPrevia();
            return null; // cambió de carro mientras tanto
          }
        }
        guardado = leido;
      } catch (e) {
        // Con el registro caído el visor ya dijo qué pasa, y lo dice mejor: de un carro nuevo no
        // hay "escaneo guardado" que leer.
        if (!registroCaido()) avisar('No se pudo mirar si este carro tiene escaneo guardado: ' + mensajeParaLaPantalla(e, 'vuelve a abrir el carro.'));
      } finally {
        clearTimeout(plazoLectura);
        if (lectura === esta) lectura = null;
      }
    }
    await mostrarGuardado();
    // Sigue la vista previa, pero ya es otro catálogo: la placa puede ser la de un carro que
    // ya estaba en el registro, con su propia línea.
    if (previa && !ui.boton.disabled) pintarPrevia();
    // Ya se sabe si tiene escaneo propio, que siempre le gana.
    revisarLinea();
    if (!pedidoDeLinea && !lectura) destaparLienzo();
    return guardado;
  }

  // Si la carrocería del carro cambió (la persona la corrigió en la ficha),
  // las piezas del escaneo se vuelven a poner con la nueva: la malla ya está
  // en el marco del carro y la orientación no depende de la carrocería.
  async function revisarCarroceria() {
    const tipo = normalizarCarroceria(obtenerCarro().carroceria || 'sedan');
    // Un carro de catálogo trae sus piezas leídas de las fotos, y su carrocería es la del archivo: con la del carro
    // marcada distinta se reetiquetaría y se guardaría igual, para siempre, en cada refrescar.
    const hayQue = (e) => e && !e.catalogo && normalizarCarroceria(e.carroceria) !== tipo;
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
        avisar('No se pudieron reacomodar las piezas del escaneo: ' + mensajeParaLaPantalla(e, 'vuelve a abrir el carro.'));
      }
    }
    avisarAlVisor();
  }

  // ---- El diálogo ----

  // Autor, licencia con su enlace, y lo que se les hizo a las fotos. Los nodos y no innerHTML: los enlaces salen de la tabla, y esto no necesita más.
  function pintarCredito(modelo) {
    const c = modelo.credito;
    const enlace = (texto, href) => Object.assign(document.createElement('a'), { textContent: texto, href, target: '_blank', rel: 'noopener' });
    const texto = textoDelCredito(modelo);
    const [antes, despues] = texto.split(c.licencia);
    const fotos = document.createElement('details');
    const resumen = document.createElement('summary');
    resumen.textContent = c.fotos.length === 1 ? 'La foto' : 'Las ' + c.fotos.length + ' fotos';
    const lista = document.createElement('ul');
    lista.append(
      ...c.fotos.map((f) => {
        const renglon = document.createElement('li');
        renglon.append(enlace(f.nombre, f.enlace));
        return renglon;
      }),
    );
    fotos.append(resumen, lista);
    const parrafo = document.createElement('span');
    parrafo.append(antes, enlace(c.licencia, c.enlaceLicencia), despues);
    ui.credito.replaceChildren(parrafo, fotos);
  }

  // Qué es el archivo para este carro: un GLB de catálogo subido a mano a un Renault no es "de la misma línea".
  function lineaDelArchivo(catalogo) {
    const carro = obtenerCarro();
    const delArchivo = modeloDelCatalogo(catalogo);
    if (!delArchivo || (!carro.marca && !carro.linea)) return 'sin-datos';
    return modeloDeLaLinea(carro) === delArchivo ? 'misma' : 'otra';
  }

  // Lo que dice el diálogo de lo que hay en pantalla ahora. Se vuelve a pintar si cambia con el diálogo abierto:
  // el modelo puede llegar mientras alguien lo está leyendo.
  function pintarDialogo() {
    const carro = obtenerCarro();
    const catalogo = medidasDelCatalogo(carro.medidas);
    const sinNadaPropio = !guardado && !previa;
    const conLinea = Boolean(sinNadaPropio && deLinea);
    const sinUsar = sinNadaPropio && carro.sinModeloDeCatalogo ? modeloDeLaLinea(carro) : null;
    // Escribió "Chevrolet Captiva" y no se sabe de qué año: se pregunta, sin adivinar.
    const parecido = sinNadaPropio && !deLinea && !pedidoDeLinea && !lineaCaida && !carro.sinModeloDeCatalogo ? modeloParecido(carro) : null;
    const guardadoDeCatalogo = guardado && guardado.catalogo ? guardado.catalogo : null;
    const conCredito = conLinea ? deLinea.modelo : guardadoDeCatalogo ? modeloDelCatalogo(guardadoDeCatalogo) : null;
    const queReferencia = 'el 3D es una carrocería de referencia' + (catalogo ? ' a las medidas del catálogo (' + medidasComoTexto(catalogo) + ')' : '');
    ui.titulo.textContent = conLinea || guardadoDeCatalogo ? 'El 3D de este carro' : 'El carro de verdad, en 3D';
    if (conLinea && verPiezas) {
      ui.estado.textContent = 'Lo que ves ahora es la carrocería de referencia a las medidas de ' + deLinea.modelo.nombre + ' (' + textoDeMedidas(deLinea.escaneo) + '), para abrir puertas y marcar lo de adentro: no es la forma de ' + deLinea.modelo.corto + '.';
    } else if (conLinea) {
      const { aviso } = deLinea.modelo;
      ui.estado.textContent = textoDeCatalogo(deLinea.escaneo.catalogo) + (aviso ? ' ' + aviso : '') + ' No hace falta escanearlo, salvo que quieras ESTE carro exacto. Medidas de ficha: ' + textoDeMedidas(deLinea.escaneo) + '.';
    } else if (sinUsar) {
      ui.estado.textContent = 'Para este carro pediste la carrocería de referencia' + (catalogo ? ', a las medidas del catálogo (' + medidasComoTexto(catalogo) + ')' : '') + '. La app tiene un modelo de esta línea, ' + sinUsar.nombre + ', hecho con fotos de otro carro: se puede volver a usar.';
    } else if (sinNadaPropio && pedidoDeLinea) {
      ui.estado.textContent = 'Va en camino el modelo de catálogo de ' + pedidoDeLinea.nombre + '. Mientras tanto, ' + queReferencia + '.';
    } else if (sinNadaPropio && lineaCaida) {
      // Los que ya lo dicen no lo repiten.
      ui.estado.textContent = lineaCaida.texto + (lineaCaida.texto.includes('carrocería de referencia') ? '' : ' Mientras tanto, ' + queReferencia + '.');
    } else if (guardadoDeCatalogo) {
      ui.estado.textContent = textoDeCatalogo(guardadoDeCatalogo, { linea: lineaDelArchivo(guardadoDeCatalogo) }) + ' Medidas de ficha: ' + textoDeMedidas(guardado) + '. ' + (conCredito ? '' : creditoDeCatalogo(guardadoDeCatalogo) + ' ') + 'Puedes subir un escaneo de este carro cuando lo tengas.';
    } else if (guardado) {
      ui.estado.textContent =
        'Este carro está escaneado (' + fechaCorta(guardado.creado) + '): ' + textoDeMedidas(guardado) + (catalogo ? '; el catálogo dice ' + medidasComoTexto(catalogo) : '') + '. Puedes escanearlo otra vez o subir otro escaneo.';
    } else if (previa) {
      ui.estado.textContent = 'Este carro todavía no tiene un escaneo guardado: lo que ves es la vista previa, sin guardar.';
    } else if (parecido) {
      ui.estado.textContent = 'Este carro no está escaneado: ' + queReferencia + '. La app tiene el modelo de ' + parecido.nombre + ', hecho con fotos de otro carro: si este es ' + anosDelModelo(parecido) + ', se puede usar. Si es de otros años, es otro carro y ese modelo no le sirve.';
    } else {
      ui.estado.textContent = 'Este carro no está escaneado: ' + queReferencia + '. Con un escaneo se ve la silueta del carro de verdad, a su tamaño.';
    }
    // Lo del modelo de la línea, con lo que se puede hacer ahora.
    const hayLinea = conLinea || sinUsar || (sinNadaPropio && (pedidoDeLinea || lineaCaida));
    ui.linea.hidden = !(hayLinea || parecido || conCredito);
    ui.credito.hidden = !conCredito;
    if (conCredito) pintarCredito(conCredito);
    ui.verLinea.hidden = !conLinea;
    ui.verLinea.textContent = verPiezas ? 'Ver el carro' : 'Ver las piezas por dentro';
    ui.verNota.hidden = !conLinea || verPiezas;
    if (conLinea) ui.verNota.textContent = 'Eso abre otra carrocería a estas medidas, con sus bisagras: no es la forma de ' + deLinea.modelo.corto + '.';
    ui.referencia.hidden = !hayLinea;
    ui.referencia.textContent = sinUsar ? 'Volver a usar el modelo de catálogo' : lineaCaida && lineaCaida.clase === 'sinRed' ? 'No bajar el modelo para este carro' : 'Usar la carrocería de referencia';
    ui.referenciaNota.hidden = !conLinea;
    ui.usarParecido.hidden = !parecido;
    if (parecido) ui.usarParecido.textContent = 'Es ' + anosDelModelo(parecido) + ': usar ese modelo';
    // El escalón de la foto liviana se recuerda, porque si no, un celular sin memoria moriría cada vez. Pero un mal momento (muchas apps
    // abiertas) no puede dejar el modelo con menos detalle para siempre: hay cómo volver.
    const conMenosDetalle = conLinea && !verPiezas && nivelDeCupo(deLinea.modelo) === FOTO_LIVIANA;
    ui.reintentar.hidden = !(conMenosDetalle || (sinNadaPropio && lineaCaida && lineaCaida.clase === 'sinCupo'));
    ui.reintentar.textContent = conMenosDetalle ? 'Verlo con todo el detalle' : 'Intentar otra vez el modelo';
    ui.guardado.hidden = !guardado;
    // Con una vista previa puesta no cambiaría nada en pantalla: lo único que hacía era
    // dejar `verPiezas` en true para cuando se guardara, y aparecía el genérico gris.
    ui.ver.hidden = Boolean(previa);
    ui.ver.textContent = verPiezas ? (guardado && guardado.catalogo ? 'Ver el carro' : 'Ver el escaneo') : 'Ver las piezas por dentro';
    ui.quitar.textContent = guardado && guardado.catalogo ? 'Quitar el modelo' : 'Quitar el escaneo';
  }

  async function abrir() {
    pintarDialogo();
    // Que "por dentro" esté listo cuando lo pidan, y no salga el carro de cajas en medio.
    if (deLinea || (guardado && guardado.catalogo)) prepararPorDentro();
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
      ui.celularNota.textContent = 'No se pudo preparar el escáner: ' + mensajeParaLaPantalla(e, 'recarga la página y vuelve a intentar. Si no se puede, usa la opción de abajo.');
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
    ponerPreviaNueva({ escaneo, reprocesar, origen: 'celular', archivo: '', ejes: null });
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
        avisar('No se pudo abrir la cámara para escanear: ' + mensajeParaLaPantalla(e, 'este navegador no la entregó') + '. Sube un escaneo hecho con otra app.');
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
            avisar('El escaneo falló: ' + mensajeParaLaPantalla(e, 'vuelve a intentar; si sigue igual, sube un escaneo hecho con otra app.'));
          }
          return;
        }
      }
      ui.hud.hidden = true;
      await armarDesdeTSDF(resultado, listos, operacion, textoInicial);
    } catch (err) {
      if (operacion.vigente()) {
        // Si había una vista previa, sigue ahí con sus botones: lo que falló es lo nuevo.
        if (previa) pintarPrevia();
        else ocultarPrevia();
        avisar('No pude armar el 3D: ' + mensajeParaLaPantalla(err, 'vuelve a escanear; si sigue igual, sube un escaneo hecho con otra app') + '.');
      }
    } finally {
      operacion.terminar();
    }
  });

  // ---- Subir un escaneo de otra app ----

  ui.subir.addEventListener('click', () => ui.archivo.click());
  ui.archivo.addEventListener('change', async () => {
    // Varios a la vez: un OBJ con su imagen, sueltos. Manda el modelo, no el primero.
    const elegidos = Array.from(ui.archivo.files || []);
    ui.archivo.value = '';
    if (!elegidos.length) return;
    const archivo = elegidos.find((f) => /\.(glb|gltf|obj|ply|zip)$/i.test(f.name)) || elegidos[0];
    const otros = elegidos.filter((f) => f !== archivo);
    ui.dialogo.close();
    const operacion = empezar();
    mostrarPrevia('Leyendo el escaneo (' + Math.round(archivo.size / 1e5) / 10 + ' MB)…', false);
    try {
      await pintarYSeguir();
      const { importar } = await cargarModulos();
      if (!operacion.vigente()) return;
      const malla = await importar.leerArchivoDeEscaneo(archivo, otros);
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
      ponerPreviaNueva({ escaneo, reprocesar, origen: 'archivo', archivo: archivo.name, ejes: importar.EJES_ARRIBA });
      pintarPrevia();
    } catch (err) {
      if (operacion.vigente()) {
        // Si había una vista previa, sigue ahí con sus botones: sin ellos solo se salía
        // cambiando de placa.
        if (previa) pintarPrevia();
        else ocultarPrevia();
        // Lo que no sabe decir el importador no se le achaca al archivo: sin memoria, un GLB
        // bueno salía «dañado», y volver a exportarlo igual fallaba.
        avisar('No pude usar ese archivo: ' + mensajeParaLaPantalla(err, 'puede faltarle memoria a este celular, o el archivo puede estar dañado. Cierra otras apps y vuelve a subirlo; si sigue igual, expórtalo más liviano') + '.');
      }
    } finally {
      operacion.terminar();
    }
  });

  // ---- La vista previa ----

  function mostrarPrevia(texto, conBotones) {
    ui.previa.hidden = false;
    // Con un escaneo por revisar, el CSS esconde lo demás de la hoja para darle sitio al
    // carro. Solo entonces: en un «Abriendo el escaneo…» los chips desaparecerían un
    // momento, y el lienzo saltaría dos veces.
    ui.previa.classList.toggle('con-escaneo-nuevo', Boolean(previa));
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
    if (e.catalogo) {
      // No hay nada que revisar: ya viene derecho, con sus piezas y sus medidas.
      mostrarPrevia(textoDeCatalogo(e.catalogo, { linea: lineaDelArchivo(e.catalogo) }) + ' Medidas de ficha: ' + textoDeMedidas(e) + '. ' + creditoDeCatalogo(e.catalogo), true);
      ui.previaVoltear.hidden = true;
      ui.previaAcostado.hidden = true;
      return;
    }
    let texto = 'Escaneo nuevo: ' + textoDeMedidas(e) + (catalogo ? ' (catálogo: ' + medidasComoTexto(catalogo) + ')' : '') + '.';
    // Si el archivo traía foto y no llegó, o no traía, hay que decirlo: si no, parece
    // que así se ve un escaneo. Por defecto sin afirmar nada del archivo: un ZIP con su foto
    // en .tif también cae aquí, y "no la trae" sería falso.
    if (previa.origen === 'archivo' && !e.textura) texto += ' ' + (e.fotoPerdida || 'No encontré la foto del carro en este archivo: se ve sin ella.') + ' ';
    if (e.escalaAjustada && e.escalaAjustada.medido) texto += ' (El archivo ' + e.escalaAjustada.motivo + ': ya está en metros.)';
    else if (e.escalaAjustada) texto += ' Ojo: ' + e.escalaAjustada.motivo + ', así que ese tamaño NO es medido.';
    const largo = avisoDeLargo(e.medidas, obtenerCarro().medidas);
    if (largo) texto += ' ' + largo;
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
      const antes = esta.escaneo;
      esta.escaneo = esta.reprocesar(opciones);
      try {
        avisarAlVisor();
      } catch (error) {
        // En pantalla sigue el de antes, y Guardar guarda lo que se ve.
        esta.escaneo = antes;
        throw error;
      }
      pintarPrevia();
    } catch (err) {
      if (operacion.vigente() && previa === esta) {
        pintarPrevia();
        avisar('No se pudo: ' + mensajeParaLaPantalla(err, 'vuelve a intentarlo') + '.');
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

  ui.previaDescartar.addEventListener('click', async () => {
    cortarOperaciones();
    previa = null;
    ocultarPrevia();
    // «Ponle placa…: la vista previa no se pierde» ya no tendría de qué hablar.
    avisar('');
    // Debajo puede haber un registro dañado: sin el try de mostrarGuardado, el carro descartado
    // se quedaba en pantalla, con la ficha en «escaneo sin guardar» y sin botones.
    await mostrarGuardado();
    revisarLinea();
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
    // Sin botones mientras escribe. Con la base lenta, «Frente al revés» volteaba el carro
    // en pantalla y al terminar volvía solo: la persona vio uno y quedó guardado el otro.
    mostrarPrevia('Guardando el escaneo…', false);
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
      avisarAlVisor({ mismaMalla: true });
      // Que el teléfono no lo borre cuando le falte espacio.
      almacen.pedirQueNoSeBorren();
      alGuardarEscaneo(placa);
      avisar(guardado.catalogo ? 'Guardado: el 3D de este carro es el modelo de catálogo (' + textoDeMedidas(guardado) + ').' : 'Escaneo guardado: el 3D de este carro es el escaneado (' + textoDeMedidas(guardado) + ').');
    } catch (err) {
      if (previa === esta) pintarPrevia();
      const sinEspacio = /quota|cuota|espacio/i.test(err.name + ' ' + err.message);
      avisar('No se pudo guardar el escaneo: ' + (sinEspacio ? 'el teléfono no tiene espacio. Libera espacio y vuelve a tocar Guardar.' : mensajeParaLaPantalla(err, 'vuelve a tocar Guardar.')));
    } finally {
      operacion.terminar();
    }
  });

  // ---- Con un escaneo guardado ----

  async function alternarPorDentro() {
    if (previa) return;
    const placa = placaCargada;
    const yendo = !verPiezas;
    ui.dialogo.close();
    // Volver al escaneo toma un momento: que se sepa.
    if (!yendo && (guardado || deLinea)) {
      mostrarPrevia(guardado && !guardado.catalogo ? 'Abriendo el escaneo…' : 'Abriendo el modelo…', false);
      await pintarYSeguir();
    }
    // Un carro de catálogo abre con el carro nuevo, que viene en sus módulos: sin esperarlos salía primero el de cajas, y luego otro carro.
    if (yendo && (deLinea || (guardado && guardado.catalogo))) {
      mostrarPrevia('Abriendo las piezas por dentro…', false);
      await pintarYSeguir();
      await prepararPorDentro();
    }
    if (placa !== placaCargada) {
      ocultarPrevia();
      return;
    }
    verPiezas = yendo;
    await mostrarGuardado();
  }
  ui.ver.addEventListener('click', alternarPorDentro);
  ui.verLinea.addEventListener('click', alternarPorDentro);

  // Por si el carro no se parece al modelo de su línea. No se borra nada de ningún registro: es lo que este carro
  // quiere ver, y se recuerda con él. Por eso tampoco es «Quitar», que es lo de un escaneo guardado.
  ui.referencia.addEventListener('click', () => {
    const carro = obtenerCarro();
    const volver = Boolean(carro.sinModeloDeCatalogo);
    carro.sinModeloDeCatalogo = !volver;
    alCambiarCarro();
    ui.dialogo.close();
    // Si el aviso era de un modelo que no bajó, ya no viene al caso; al volver a usarlo se intenta de nuevo.
    callarAvisoDeLinea();
    lineaCaida = null;
    revisarLinea();
  });

  // Escribió "Chevrolet Captiva" y dijo que es de esos años: se le escribe la línea del catálogo, con todo lo que esta trae.
  ui.usarParecido.addEventListener('click', () => {
    const carro = obtenerCarro();
    const modelo = modeloParecido(carro);
    if (!modelo) return;
    ui.dialogo.close();
    callarAvisoDeLinea();
    parecidoDicho = false;
    alCambiarDatos(datosParaUsarModelo(carro, modelo));
  });

  // Este celular no alcanzó, y la persona quiere intentarlo otra vez. Con el modelo a la vista en menos detalle, con la foto completa: si
  // tampoco cabe, baja el escalón solo, como la primera vez. Sin modelo, con la liviana: la completa ya se sabe que no cabe.
  ui.reintentar.addEventListener('click', () => {
    if (deLinea && !guardado && !previa) {
      const { modelo } = deLinea;
      fijarCupo(modelo, FOTO_COMPLETA);
      ui.dialogo.close();
      callarAvisoDeLinea();
      deLinea = null;
      verPiezas = false;
      // En el mismo turno: se tapa antes de que alcance a pintarse el carro de cajas.
      taparLienzo();
      ponerLoQueToca();
      revisarLinea();
      return;
    }
    if (!lineaCaida) return;
    const { modelo } = lineaCaida;
    fijarCupo(modelo, FOTO_LIVIANA);
    yaAvisadas.delete(modelo.archivo + '|sinCupo');
    ui.dialogo.close();
    callarAvisoDeLinea();
    lineaCaida = null;
    revisarLinea();
  });

  ui.quitar.addEventListener('click', async () => {
    const placa = obtenerCarro().placa;
    if (!guardado || !confirm((guardado.catalogo ? '¿Quitar el modelo de ' : '¿Quitar el escaneo de ') + placa + '? El carro vuelve ' + (modeloQueLeToca(obtenerCarro()) ? 'al modelo de catálogo de su línea' : 'a la carrocería de referencia') + '. Las piezas marcadas no se tocan.')) return;
    try {
      await (await abrirAlmacenDeEscaneos()).borrar(placa);
      alQuitarEscaneo(placa);
      if (placa !== placaCargada) return;
      guardado = null;
      verPiezas = false;
      ui.dialogo.close();
      // Lo que hubiera ahí ya no es verdad («el 3D de este carro es el escaneado»).
      avisar('');
      avisarAlVisor();
      revisarLinea();
    } catch (err) {
      avisar('No se pudo quitar el escaneo: ' + mensajeParaLaPantalla(err, 'vuelve a intentarlo.'));
    }
  });

  return {
    cargar,
    abrir,
    revisarCarroceria,
    // Un modelo de línea sin foto no sirve (visor.js, cuando texturaLista da null): primero se intenta con la liviana; si ya era esa,
    // vuelve el genérico, y se dice.
    modeloSinFoto(error) {
      if (!deLinea) return;
      const { modelo } = deLinea;
      quitarMarcaDeAbriendo();
      deLinea = null;
      verPiezas = false;
      if (nivelDeCupo(modelo) === FOTO_COMPLETA) {
        fijarCupo(modelo, FOTO_LIVIANA);
        vaMasLiviano = true;
      } else {
        lineaNoSalio(modelo, 'sinFoto', textoSinFoto(modelo, error));
      }
      ponerLoQueToca();
      revisarLinea();
    },
    // La GPU no dio (visor.js): se perdió el contexto dos veces, no volvió, o la reserva de la foto dio OUT_OF_MEMORY. Sin esto el carro salía
    // negro, o el lienzo en blanco, y nada lo decía. Se recuerda: un escalón menos en este celular, y otra vez; al final, el genérico.
    modeloNoCupo(error) {
      if (!deLinea) return;
      const { modelo } = deLinea;
      quitarMarcaDeAbriendo();
      deLinea = null;
      verPiezas = false;
      const nivel = bajarCupo(modelo);
      if (nivel >= SIN_CUPO) lineaNoSalio(modelo, 'sinCupo', textoSinCupo(modelo, error));
      else vaMasLiviano = true;
      ponerLoQueToca();
      revisarLinea();
    },
    // Ya se dibujó con su foto: si la falta de memoria iba a matar la pestaña por esto, ya lo hizo.
    modeloDibujado: quitarMarcaDeAbriendo,
    get deLinea() {
      return deLinea ? deLinea.modelo : null;
    },
    get pedidoDeLinea() {
      return pedidoDeLinea;
    },
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
