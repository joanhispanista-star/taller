// Lo instalable: registra el service worker (sw.js, al lado de las páginas)
// y, en la página que tenga el botón #actualizar (el Garaje), avisa cuando
// hay una versión nueva esperando. Lo cargan las tres páginas.
//
// Solo donde el navegador lo permite: https (la dirección pública) y
// localhost. En http://192.168.x.x (el enlace del celular en la red del PC)
// no hay service worker y la app abre igual, solo que sin instalar y sin
// funcionar sin internet.
//
// La ruta es relativa a este módulo, no al dominio: en GitHub Pages la app
// vive en /taller/, y "/sw.js" apuntaría a la raíz del dominio.
const RUTA_SW = new URL('../sw.js', import.meta.url);

function sePuede() {
  return 'serviceWorker' in navigator && window.isSecureContext;
}

// Enciende el botón del Garaje para la versión que espera. Solo se ofrece
// lo que ya está en el teléfono: el botón aparece cuando la versión nueva
// terminó de bajarse, no antes.
function ofrecer(boton, esperando, alPedir) {
  if (!boton || !esperando) return;
  boton.hidden = false;
  boton.disabled = false;
  boton.onclick = () => {
    boton.disabled = true;
    boton.textContent = 'Actualizando…';
    alPedir();
    esperando.postMessage({ tipo: 'activar' });
  };
}

async function registrar() {
  if (!sePuede()) return;
  let registro;
  try {
    registro = await navigator.serviceWorker.register(RUTA_SW);
  } catch (error) {
    // Sin service worker la app sigue funcionando; solo que no se instala.
    console.warn('No se pudo registrar el service worker:', error.message);
    return;
  }

  const boton = document.getElementById('actualizar');
  // Solo recarga quien pidió actualizar. `controllerchange` también llega en
  // la primera instalación (clients.claim) y ahí recargar sería un susto.
  let pedida = false;
  const alPedir = () => {
    pedida = true;
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pedida) location.reload();
  });

  // Una versión nueva "instalada" mientras otra controla la página es una
  // versión esperando. Sin controlador es la primera instalación: no hay
  // nada que actualizar.
  if (registro.waiting && navigator.serviceWorker.controller) ofrecer(boton, registro.waiting, alPedir);
  registro.addEventListener('updatefound', () => {
    const nuevo = registro.installing;
    if (!nuevo) return;
    nuevo.addEventListener('statechange', () => {
      if (nuevo.state === 'installed' && navigator.serviceWorker.controller) ofrecer(boton, registro.waiting || nuevo, alPedir);
    });
  });

  // El navegador busca versión nueva al navegar; una app instalada que el
  // celular deja días en segundo plano no navega. Al volver a verla, se le
  // pregunta.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registro.update().catch(() => {});
  });
}

registrar();
