# Taller de Pintura

App para un taller de latonería y pintura, pensada para el celular: el dueño
marca en un carro 3D las piezas que hay que pintar, el asistente recibe la
orden, cada carro queda registrado por placa, y al final de la semana se sabe
qué pintor pintó qué pieza para pagarle (90.000 pesos por pieza).

Estado al **15 de octubre de 2026**: el visor y, adelantada la semana del 19,
el registro: Garaje por placa, estado por pieza y fotos por pieza, todo
guardado en el teléfono.

## Lo que NO va a hacer esta app, y por qué

La idea original era tomarle fotos al carro (o escanearlo) con el celular y
que la app sacara el 3D con las piezas separadas. **Eso no se va a construir.**
Tres razones, y ninguna es de plata:

1. **La pintura de un carro es un espejo.** La fotogrametría (fotos → 3D)
   necesita superficies mates y con textura; una carrocería brillante le
   devuelve reflejos del cielo y del taller, y el modelo sale con huecos y
   abolladuras que no existen. Es el peor caso conocido de esa técnica.
2. **Aunque el 3D saliera bien, sale como una sola masa.** Separar
   automáticamente "esto es el capó, esto la puerta" en una malla escaneada
   es un problema de investigación sin solución confiable hoy. Y marcar la
   pieza es justamente lo que el taller necesita.
3. **Lo que existe no está en el teléfono de Joan.** Apple tiene escaneo de
   objetos en iPhone (Object Capture); Android no. Los servicios en la nube
   (Luma AI, Polycam) cobran por escaneo, tardan minutos y devuelven la masa
   del punto 2.

Por eso ningún software de talleres o de peritos de seguros (CCC ONE,
Audatex, Mitchell, las apps de las aseguradoras colombianas) escanea el
carro: **todos usan un carro genérico por tipo de carrocería con las piezas
ya separadas**, y las fotos reales del carro se adjuntan como evidencia a
cada pieza. Eso es lo que hace esta app. Las fotos del carro sí entran, pero
como evidencia por pieza (ver plan), no como fuente del 3D.

## Lo que sí hace hoy

- Dibuja un sedán genérico con **17 piezas pintables**, cada una con su
  nombre del gremio: capó, techo, baúl, bómper delantero y trasero,
  guardafangos delanteros, puertas delanteras y traseras, costados traseros,
  estribos y espejos (izquierdo = lado del conductor).
- Se gira con un dedo y se acerca con dos. Cinco botones (Frente, Izquierdo,
  Derecho, Atrás, Arriba) llevan la cámara al sitio sin tener que girar.
- Un toque sobre una pieza la marca: se tiñe de naranja, con un brillo leve,
  y aparece en la lista de abajo. Otro toque (o la × de la lista) la quita.
- **Garaje** (`garaje.html`): la lista de todos los carros, con placa, marca,
  cuándo se tocó por última vez y cuántas piezas hay pendientes, en
  proceso y terminadas. Escribir una placa abre ese carro si ya estaba y lo
  crea si no. Tocar una fila abre el visor con ese carro; la × lo borra con
  confirmación, fotos incluidas.
- Cada pieza marcada tiene **estado**: pendiente (naranja), en proceso
  (amarillo) o terminada (verde). La chapa en 3D y el chip de la lista van
  del mismo color. Se cambia tocando el nombre en el chip: sale un menú con
  los tres.
- **Fotos por pieza**: el icono de cámara del chip abre la cámara del
  celular; la foto se guarda en el teléfono reducida a 1280 px (unos 200 KB
  en vez de 4 MB) con una miniatura para la tira de abajo. Tocar la
  miniatura la muestra grande, con fecha, y deja borrarla.
- Todo queda guardado en el teléfono (IndexedDB, por placa): si se cierra la
  página no se pierde nada, y al volver se abre el mismo carro.
- **Enviar al asistente** manda la orden escrita (carro, cantidad y lista
  numerada de piezas) por WhatsApp. No hay cuenta ni servidor todavía; el
  canal que ya tiene el asistente es WhatsApp, así que ese es el canal.
  Detalle honesto: la hoja de compartir del teléfono solo existe por
  **https** (cuando la app esté publicada); abierta por http en la red
  Wi-Fi del taller, el botón abre WhatsApp directo (wa.me) con el mismo
  texto.
- Cambiar a **otra** placa es otro carro: si está en el Garaje se abre con
  su historia y sus fotos; si no, se crea vacío. Ponerle placa a un carro
  recién marcado conserva las marcas (y si esa placa ya existía, se le
  suman como pendientes). Un carro **sin placa** se puede marcar, pero no
  entra al Garaje ni puede tener fotos, y la pantalla lo dice.
- El estribo y el espejo miden 14 px en la pantalla de un celular; un dedo
  cubre 40. Por eso el toque lanza un anillo de rayos del tamaño de la yema
  y, si alguno cae en una pieza delgada, esa gana (`js/toque.js`).

## Cómo abrirlo

```bash
npm run dev
```

y entrar a <http://127.0.0.1:8310/garaje.html> (el Garaje) o a
<http://127.0.0.1:8310/> (el visor). Desde la sesión de Claude, la entrada
`taller-pintura` de `.claude/launch.json` (en PLAZA) arranca lo mismo.

Para verlo en el celular (misma red Wi-Fi):

```bash
npm run celular
```

El servidor imprime la dirección `http://192.168.x.x:8310/` para abrirla en
el teléfono. Windows puede pedir permiso al firewall la primera vez.

Pruebas (55, en Node, sin navegador; el registro se prueba contra
`fake-indexeddb`, una IndexedDB de mentira que se instala con `npm install`):

```bash
npm test
```

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `index.html` | El visor: barra con el enlace al Garaje, placa y marca; el lienzo 3D; botones de vista; la hoja con los chips, la tira de fotos y los dos botones; el menú de estado, la cámara (`input type=file capture`) y el diálogo de la foto grande. |
| `garaje.html` | El Garaje: formulario de placa y marca, y la lista de carros. |
| `css/estilos.css` | Colores como variables `--*` (incluidos los tres de estado), tema oscuro (luz de taller). Empieza con `[hidden] { display: none !important }` por una trampa conocida. |
| `js/piezas.js` | El catálogo de piezas. Sin Three.js: lo usan el registro y la nómina. |
| `js/estado.js` | El texto de la orden para el asistente y la placa normalizada. Su modelo de selección (`crearEstado`, `cambiarPlaca`...) fue el del visor del 15 de octubre; hoy lo reemplaza `garaje.js`, pero sigue probado y `textoParaAsistente` sigue siendo el de la orden. |
| `js/garaje.js` | El registro: el modelo del carro (placa, marca, piezas con estado y fecha) como funciones puras, y el almacén en IndexedDB (carros y fotos). Sin DOM; probado en Node con `fake-indexeddb`. |
| `js/fotos.js` | Reducir una foto a 1280 px y sacarle la miniatura con canvas. La cuenta de medidas es pura y se prueba en Node. |
| `js/hoja.js` | La hoja de abajo del visor: chips con estado y cámara, menú de estado, tira de fotos y foto grande. DOM puro, sin Three.js. |
| `js/garaje-pantalla.js` | La pantalla Garaje: lista, abrir o crear por placa, borrar. |
| `js/carro.js` | El sedán, pieza por pieza, construido con perfiles extruidos. Cada pieza es un objeto aparte con su propio material. Sin DOM: también se construye en Node para probarlo. |
| `js/toque.js` | Qué pieza hay bajo el dedo: rayo central más un anillo de ocho para que estribos y espejos se dejen tocar. Sin DOM, probado con la cámara y el carro reales. |
| `js/visor.js` | Escena, luces, cámara, giro con el dedo, el toque que marca, y el pegamento con el registro: qué carro está abierto (por la URL o el último), teñir por estado, guardar. |
| `js/vendor/` | Three.js 0.169 copiado de npm (tres archivos). No se edita. Así la app no depende de internet ni de que cambie la versión. |
| `herramientas/servidor.js` | Servidor estático sin dependencias; los módulos de JavaScript no cargan desde `file://`. |
| `pruebas/` | `estado.test.js` (la orden), `carro.test.js` (17 piezas, medidas de sedán, simetría, accesorios que asoman, interior que no atraviesa el vidrio), `toque.test.js` (el dedo sobre el estribo y el espejo), `garaje.test.js` (modelo y almacén: estados, fotos, borrado, el formato viejo del borrador) y `fotos.test.js` (medidas). |

Decisiones que conviene conocer:

- El carro mira hacia **-Z**, para que "izquierdo" sea -X, el lado del
  conductor en Colombia.
- Entre pieza y pieza hay una junta de unos 2 cm, exagerada a propósito: en
  la pantalla de un celular es lo que deja ver dónde termina una y empieza
  otra.
- La escena se dibuja solo cuando algo cambia, no 60 veces por segundo: en
  el celular eso es batería.
- Los saltos de línea del texto de WhatsApp se construyen con
  `String.fromCharCode(10)` y no con `\n`: en el equipo de Joan las
  herramientas de escritura se comen las barras invertidas (ya rompió
  archivos en otros proyectos).
- El registro va en **IndexedDB y no en localStorage**: una foto reducida
  pesa unos 200 KB y localStorage tope en unos 5 MB en total. El modelo del
  carro es un objeto plano (JSON puro, sin Sets): es el mismo que la semana
  del 26 viaja a la nube.
- El estado de cada pieza lleva `desde`, la fecha del último cambio: la
  nómina de la semana del 26 necesita saber cuándo se terminó cada pieza.
- Los tres colores de estado viven solo en `css/estilos.css`; `visor.js`
  los lee de las variables al arrancar para teñir la chapa en 3D.
- Una placa que vuelve al taller **conserva su historia**: las piezas
  terminadas siguen terminadas y las fotos siguen ahí. Si cada visita debe
  empezar de cero, es decisión de Joan (ver abajo) y un cambio pequeño en
  `abrirCarro` de `visor.js`.
- Quitarle la placa a un carro no lo borra del Garaje: es empezar otro
  carro sin placa. Borrar es solo desde el Garaje, con confirmación, y se
  lleva las fotos.
- El borrador en `localStorage` sigue existiendo como espejo del carro
  abierto: es lo que reabre el mismo carro al recargar, lo que guarda el
  carro sin placa, y lo que mantiene el visor funcionando si IndexedDB no
  abre (entonces la pantalla avisa que solo hay borrador).

## Plan, con fechas

Las fechas asumen que las decisiones de la sección siguiente están tomadas
el lunes 19.

| Cuándo | Qué | Qué puede hacer el taller al terminar |
|---|---|---|
| **Jueves 15-oct** (hecho) | Visor: sedán por piezas, girar, tocar, enviar por WhatsApp. | Mandar una orden de pintura desde el celular. |
| **Lunes 19 a viernes 23-oct** (hecho el jueves 15) | Registro por placa y marca; pantalla **Garaje** con todos los carros; fotos por pieza (cámara del celular, guardadas en el teléfono); estados por pieza: pendiente, en proceso, terminada. | Ver cualquier carro, abrir su 3D y saber qué se trabajó y qué está en curso. |
| **Lunes 26 a viernes 30-oct** | Empleados: asignar pintor a cada pieza y marcarla terminada; resumen semanal por pintor con piezas × 90.000. La nube (Supabase, con RLS) para que el dueño y el asistente vean lo mismo desde dos teléfonos. | Pagar la semana con la lista en la mano; el asistente ve la orden en la app, no solo en WhatsApp. |
| **Lunes 2 a viernes 6-nov** | Otras carrocerías (hatchback, SUV, camioneta/pick-up: cambia el baúl por la compuerta y el largo); instalable en el celular (PWA primero; APK por enlace como Tu Garantía si hace falta). | Usarla con los carros que de verdad llegan al taller, como una app más. |

Lo que NO está en el plan y no se va a prometer: escaneo del carro real
(arriba está el porqué), presupuestos al cliente, facturación.

## Lo que solo Joan decide (antes del lunes 19)

1. **¿Es para tu taller o para venderla a talleres?** Hoy da igual; en la
   semana del 26 decide si la nube se arma para un taller o para muchos.
2. **¿Quién marca la pieza terminada?** ¿Cada pintor desde su celular (hace
   falta cuenta por empleado), o el asistente por todos (una sola cuenta)?
3. **¿90.000 es por cualquier pieza?** ¿Un espejo paga igual que un techo?
   Si no, hace falta una tarifa por pieza en el catálogo.
4. **¿Qué carrocerías llegan más?** Sedán ya está. Si el 70 % son camionetas,
   la camioneta va antes que el hatchback.
5. **¿El cliente del taller ve algo?** (Una tarjeta "su carro va así" por
   WhatsApp.) Es barato y trae clientes, pero no está en las cuatro semanas.
6. **El nombre.** "Taller de Pintura" es provisional.
7. **¿Un carro que vuelve al taller empieza de cero?** Hoy conserva la
   historia (piezas terminadas y fotos de la visita anterior). Si lo que el
   taller quiere es "cada visita es una orden nueva", hace falta una orden
   por visita, no solo un carro por placa, y eso cambia la nómina.

## Trampas conocidas

- Con el panel del navegador de Claude **oculto**, la página deja de dibujar
  (el navegador pausa los cuadros) y las capturas fallan; no es un defecto
  de la app. Las pruebas por JavaScript sí corren.
- `node --test pruebas/` no funciona en Node 22 (toma la carpeta como
  archivo). Es `node --test` a secas, que busca `*.test.js` solo.
- El servidor no se recarga solo: si se edita `herramientas/servidor.js`
  hay que pararlo y volverlo a arrancar. La primera versión moría con una
  URL mal formada (`/%`) y la prueba la hizo contra el proceso viejo.
- Al volver de WhatsApp, Android puede haber tirado el contexto WebGL. El
  visor lo recupera (regenera el entorno y pide un cuadro); si alguna vez
  el carro vuelve negro, es ahí donde hay que mirar.
- La inercia del giro se frena tocando la pantalla; ese toque no marca
  nada. Es a propósito (si no, marcaba la pieza que pasaba bajo el dedo).
- Los carros viven en el **origen** del navegador: `http://127.0.0.1:8310`
  y `http://192.168.x.x:8310` son dos Garajes distintos, y el celular tiene
  el suyo. Hasta la nube (semana del 26) no se comparten.
- Al abrir por primera vez esta versión, el borrador viejo (si tenía placa)
  pasa al Garaje como carro: si aparece un carro que nadie registró, es ese.
- `?placa=` en la URL manda sobre el borrador; al cambiar la placa en la
  barra, la URL se reescribe para que recargar traiga el mismo carro.
- En el computador, `capture="environment"` abre el selector de archivos,
  no una cámara: para probar sirve igual.
- Con el panel de Claude oculto, Chrome también frena los temporizadores y
  los eventos encolados (el `close` del diálogo de la foto llegó después de
  200 ms): una prueba que mire demasiado pronto ve la foto grande abierta.
- `fake-indexeddb` clona los Blobs con el `structuredClone` de Node; con
  Node 22 funciona. Con un Node más viejo las pruebas de fotos podrían
  fallar por eso y no por el código.
