# Taller de Pintura

App para un taller de latonería y pintura, pensada para el celular: el dueño
marca en un carro 3D las piezas que hay que pintar, el asistente recibe la
orden, cada carro queda registrado por placa, y al final de la semana se sabe
qué pintor pintó qué pieza para pagarle (90.000 pesos por pieza).

Estado al **15 de octubre de 2026**: el visor; adelantada la semana del 19,
el registro (Garaje por placa, estado por pieza y fotos por pieza, todo
guardado en el teléfono); y adelantada la del 2 de noviembre, **el carro
desde una foto**: la app reconoce en el teléfono el tipo de carrocería y el
modelo más parecido, toma el color, y dibuja el 3D de esa carrocería a las
medidas de esa línea, en ese color. Cuatro carrocerías (sedán, hatchback,
SUV, camioneta de platón) y un catálogo de los carros que ruedan en Colombia.
Y adelantada la del 26 (sin la nube): **Empleados** con la nómina de la
semana (pintor por pieza, 90.000 por pieza pintada), **Historial** de carros
entregados con lo cobrado, e **Indicadores** para el dueño, en
`tablero.html`; con una demostración (5 carros, 3 empleados) que se carga
y se quita en bloque.

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

**La segunda vuelta, el mismo 15 de octubre.** Joan propuso otra ruta: con
una foto normal, reconocer qué carro es, "buscar cómo es" y generar el 3D de
ese modelo exacto. Se investigó a fondo (12 agentes, 860 búsquedas; la nota
con fuentes está en la carpeta de notas de la sesión). Resultado: no existe
un catálogo 3D por modelo del que se pueda tirar (los de pago son "solo uso
editorial", prohibido en una app comercial; los gratis no traen las piezas
separadas ni licencian la marca; Solera/Audatex construyó el suyo a mano por
millones), y la IA foto→3D (Tripo, Meshy, Hunyuan3D-Part) entrega un carro
parecido con las juntas de las puertas pintadas como textura y los reflejos
de la pintura leídos como abolladuras, según sus propios fabricantes. Ningún
producto del sector genera el 3D desde la foto. **Lo que sí se construyó**
es lo que ese camino prometía y se puede cumplir: la foto da el color (con
certeza), la carrocería y el modelo más parecido (como sugerencia que la
persona confirma), y el 3D sale de ESA carrocería a las medidas de ESA línea.
La ficha de arriba del visor lo dice: "carrocería de referencia", no "tu
carro".

## Lo que sí hace hoy

- Dibuja un sedán genérico con **17 piezas pintables**, cada una con su
  nombre del gremio: capó, techo, baúl, bómper delantero y trasero,
  guardafangos delanteros, puertas delanteras y traseras, costados traseros,
  estribos y espejos (izquierdo = lado del conductor).
- Se gira con un dedo y se acerca con dos. Cinco botones (Frente, Izquierdo,
  Derecho, Atrás, Arriba) llevan la cámara al sitio sin tener que girar.
- Un toque sobre una pieza la marca: se tiñe de naranja, con un brillo leve,
  y aparece en la lista de abajo. Otro toque (o la × de la lista) la quita.
- **Nuevo carro con foto** (en el Garaje): una foto del carro y la app, en
  el teléfono y sin servidor, saca el color de la pintura (siempre acierta,
  salvo luz muy rara), y propone el tipo de carrocería y seis carros
  parecidos del catálogo (CLIP, un modelo de OpenAI que corre en el
  navegador, comparando contra las 89 familias de carros más comunes:
  acierta la carrocería 6 o 7 de 9 veces y el modelo 3 o 4 de 9 de primera,
  4 o 5 de 9 entre las tres primeras, medido con nueve fotos reales en el PC
  y en el navegador; desde el frente un sedán y un hatchback son iguales). La
  persona confirma con un toque, escribe la placa y abre el 3D. La primera
  vez descarga 89 MB (el reconocedor); después funciona sin internet.
- **Cuatro carrocerías a la medida**: sedán, hatchback, SUV y camioneta de
  platón, dibujadas por código con las mismas 17 piezas (en el hatchback la
  pieza trasera se llama compuerta; en la camioneta, compuerta y costados
  del platón) y estiradas a las medidas reales de la línea (largo, ancho,
  alto, distancia entre ejes) que trae el catálogo. El carro sale además del
  color de la foto. Arriba del 3D, la ficha dice qué carro es y que la
  carrocería es de referencia. Lo que lo hace ver de carro y no de caja:
  capó y techo abombados, las puntas afinadas vistas desde arriba, rines de
  cinco rayos, moldura en la cintura, manijas cromadas, pasarruedas y
  faldón negro en SUV y camioneta, barras de techo en la SUV, alerón en
  hatchback y SUV, faros con tira LED y farol principal, parrilla grande
  con barra cromada, toma de aire baja y protector cromado, barra de luz
  entre los stops (hatchback y SUV) y el canal oscuro del "techo flotante".
  Nada de eso se toca: el dedo lo atraviesa y marca la pieza de debajo.
- **Catálogo de carros de Colombia** (`js/catalogo-carros.js`): marcas y
  líneas que se venden o que todavía ruedan (el parque tiene 13 años de
  edad promedio), con carrocería, medidas, años y qué tan comunes son:
  1.136 líneas de 72 marcas (34 sin medidas confirmadas), investigadas y
  revisadas por agentes con la fuente de cada medida; se regenera con una
  herramienta, no se edita a mano.
- **Garaje** (`garaje.html`): la lista de todos los carros, con la foto o
  el color, placa, marca, línea y versión, carrocería, cuándo se tocó por
  última vez y cuántas piezas hay pendientes, en proceso, terminadas y con
  latonería. Escribir una placa abre ese carro si ya estaba y lo crea si
  no. Tocar una fila abre el visor con ese carro; la × lo borra con
  confirmación, fotos incluidas.
- **Datos del carro** (botón en la barra del visor, o tocando la ficha
  sobre el 3D): marca, línea (del catálogo o la que sea), **versión** en
  texto libre ("5 puestos, 2023": el catálogo no distingue versiones),
  carrocería y color. Al guardar, el 3D se reconstruye.
- **Latonería y pintura**: cada pieza marcada es "solo pintura" o
  "latonería y pintura" (enderezar antes de pintar). Se cambia en el menú
  del chip, debajo de los tres estados; el chip lo marca, la orden de
  WhatsApp lo dice entre paréntesis y la nómina lo pagará aparte.
- **La placa pintada en el 3D**: las dos placas del carro llevan el número
  del registro ("JRX 248"), dibujado en un canvas amarillo claro con luz
  propia (en la sombra del bomper se veía apagada), a 33 × 15 cm como la
  placa real y al doble de resolución.
- **Puertas, capó y compuerta que se abren con el dedo**: arrastrar una de
  esas piezas con UN dedo la abre siguiendo el dedo y arrastrarla de vuelta
  la cierra; al soltar queda abierta o cerrada, lo que esté más cerca. Un
  toque sin arrastre la marca, como siempre. El carro se gira con DOS
  dedos, y con dos dedos pellizcando se acerca o se aleja (en el computador
  el mouse sigue girando).
  Cada ventana viaja con su puerta (el vidrio ya no es un bloque: es un
  panel por ventana), el espejo con la puerta delantera, y el vidrio
  trasero, la placa y el alerón con la compuerta. El baúl del sedán abre
  por su borde delantero y la compuerta del platón cae hacia atrás.
- **Piezas de interior** (29 en total ahora): con algo abierto aparecen el
  **vano del motor** (la bandeja y las paredes bajo el capó, con el motor en
  negro), el **marco de puertas** de cada lado (los pilares por dentro), la
  **base de puertas** de cada lado (la losa del umbral por donde se entra,
  entre el estribo y el marco: con las puertas abiertas es lo primero que se
  ve y en una pintura general se pinta; antes ahí se veía el piso), el
  **vano del baúl** (el piso del baúl, de la compuerta o del platón) y la
  **cara interior** de cada pieza que se abre: capó por dentro, baúl o
  compuerta por dentro y cada puerta por dentro, que son piezas aparte de la
  exterior (se cotizan y se pintan aparte). Las de interior se pintan del
  mismo color pero más claro y mate, y hay una luz de relleno baja, para que
  no se pierdan en la sombra.
- **Pintor por pieza**: en el menú del chip, debajo del estado y del
  trabajo, están los empleados activos; el elegido sale en el chip con su
  primer nombre. Sin empleados, el menú lo dice y lleva a la pestaña donde
  se agregan.
- **Entrega y cobro** (en "Datos del carro"): lo que se le cobró al cliente
  y el botón "Marcar entregado" (o "Reabrir"). Un carro entregado lo dice
  en la ficha sobre el 3D y en el Garaje ("entregado 13 oct · cobrado
  $ 1.250.000"), y pasa al Historial.
- **Empleados** (`tablero.html?p=empleados`): la nómina de la semana (lunes
  a domingo, con flechas para ver semanas anteriores): por empleado, qué
  piezas terminó esa semana, en qué carro y cuándo, y cuánto se le paga:
  **90.000 por pieza pintada** que quedó terminada con él asignado. La
  latonería y las piezas de interior se cuentan y salen "por definir", sin
  valor (decisión 9). Las terminadas sin pintor asignado van en una lista
  aparte con el enlace al carro. Agregar, retirar, reincorporar y borrar
  empleados (pintor, latonero, asistente).
- **Historial** (`?p=historial`): los carros entregados, del más reciente al
  más viejo, con fecha, piezas (terminadas, sin hacer, con latonería), lo
  cobrado, lo que pagan sus piezas a los pintores y lo que queda (sin
  descontar materiales, y lo dice).
- **Indicadores** (`?p=indicadores`): para el dueño, todo junto: carros en el
  taller y entregados, piezas terminadas, cobrado, pagado a pintores y lo
  que queda, en esta semana, este mes o todo; dos gráficas de barras de las
  últimas ocho semanas (piezas terminadas y cobrado) hechas a mano; y la
  lista de los carros que están en el taller con su avance.
- **Demostración**: en el Garaje y en el tablero, "Cargar demostración" mete
  5 carros de marcas y colores distintos (Onix rojo, Logan blanco, CX-30
  gris, Hilux negra, Picanto azul) con piezas arregladas, en reparación y
  entregadas, y 3 empleados, con fechas de las últimas dos semanas. Todo va
  marcado «demo» y "Quitar la demostración" se lleva solo eso.
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
el teléfono (en el PC de Joan, el 15-oct, era `http://192.168.101.16:8310/garaje.html`).
Windows puede pedir permiso al firewall la primera vez. Desde la sesión de
Claude, la entrada `taller-pintura-celular` de `.claude/launch.json` arranca
el servidor abierto a la red. El reconocedor de fotos sí necesita internet
en el teléfono la primera vez (89 MB desde Hugging Face); lo demás no.

Pruebas (80, en Node, sin navegador; el registro se prueba contra
`fake-indexeddb`, una IndexedDB de mentira que se instala con `npm install`):

```bash
npm test
```

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `index.html` | El visor: barra con el enlace al Garaje, placa y marca; el lienzo 3D con la ficha del carro; botones de vista; la hoja con los chips, la tira de fotos y los dos botones; el menú de estado, la cámara (`input type=file capture`) y el diálogo de la foto grande. |
| `garaje.html` | El Garaje: las pestañas de la app, el botón "Nuevo carro con foto" y su ficha (foto, color, sugerencias, marca y línea, carrocería, placa), el formulario por placa, la lista de carros y el bloque de la demostración. |
| `tablero.html` | Las otras tres pestañas: Empleados (la nómina de la semana y la lista de empleados), Historial (entregados y cobrado) e Indicadores (todo junto, con dos gráficas). `?p=` dice cuál se abre. |
| `js/tablero.js` | Los números: la semana del taller (lunes a domingo), `pagoDePieza`, `nominaSemanal`, `historial`, `indicadores` (con serie por semana) y `pesos`. Funciones puras, sin DOM, probadas en Node. |
| `js/tablero-pantalla.js` | La pantalla del tablero: pinta las tres pestañas con lo que calcula `tablero.js`, agrega y retira empleados, y carga o quita la demostración. |
| `js/demo.js` | Los 5 carros y 3 empleados de demostración (fechas relativas a hoy, todo con `demo: true`), `cargarDemo` (no pisa un carro real) y `estadoDemo`. |
| `css/estilos.css` | Colores como variables `--*` (incluidos los tres de estado), tema oscuro (luz de taller). Empieza con `[hidden] { display: none !important }` por una trampa conocida. |
| `js/piezas.js` | El catálogo de piezas. Sin Three.js: lo usan el registro y la nómina. |
| `js/carrocerias.js` | Los cuatro tipos de carrocería: medidas típicas, qué nombre toma cada pieza en cada uno (compuerta, costado del platón), y cómo se limpian las medidas del catálogo para dibujar. Sin Three.js. |
| `js/catalogo-carros.js` | GENERADO. Los carros que ruedan en Colombia: marca, línea, carrocería, medidas en mm, años, presencia y fuente. Se regenera con `herramientas/generar-catalogo.mjs`. |
| `js/catalogo.js` | Buscar en el catálogo ("onix", "sedan onix", sin tildes), la entrada exacta de un carro y lo que el registro guarda de ella. |
| `js/estado.js` | El texto de la orden para el asistente (ahora con el nombre de pieza de la carrocería) y la placa normalizada. Su modelo de selección fue el del visor del 15 de octubre; hoy lo reemplaza `garaje.js`, pero sigue probado. |
| `js/garaje.js` | El registro: el modelo del carro (placa, marca, línea, carrocería, color, medidas, cobro, fecha de entrega, piezas con estado, trabajo, pintor y fecha) y del empleado como funciones puras, la tarifa (`TARIFA_PIEZA`), y el almacén en IndexedDB versión 2 (carros, fotos y empleados; `quitarDemo`). Sin DOM; probado en Node con `fake-indexeddb`. |
| `js/fotos.js` | Reducir una foto a 1280 px y sacarle la miniatura con canvas. La cuenta de medidas es pura y se prueba en Node. |
| `js/color-foto.js` | El color de la pintura a partir de la foto (k-medias sobre el centro, descartando vidrios y llantas) y su nombre de taller (plateado, vinotinto...). La parte pura se prueba en Node. |
| `js/reconocer.js` | El reconocedor en el navegador: CLIP (visión) sobre la foto, comparado con los vectores de texto de `js/etiquetas-clip.json`. Devuelve carrocerías, líneas y marcas ordenadas por parecido. |
| `js/etiquetas-clip.json` | GENERADO por `herramientas/calcular-etiquetas.mjs`: un vector por carrocería y por línea del catálogo (Int8 en base64). Hay que regenerarlo cuando cambie el catálogo. |
| `js/hoja.js` | La hoja de abajo del visor: chips con estado, trabajo (latonería), pintor y cámara; menú de estado, trabajo y pintor; tira de fotos y foto grande, con los nombres de la carrocería. DOM puro, sin Three.js. |
| `js/ficha-carro.js` | La ficha "Datos del carro" del visor: marca, línea con el catálogo, versión, carrocería, color, cobro al cliente y entrega. DOM puro. |
| `js/garaje-pantalla.js` | La pantalla Garaje: lista con portada y color (con "entregado" y lo cobrado, y la insignia «demo»), abrir o crear por placa, borrar, la ficha del carro nuevo con foto (color, reconocedor, catálogo, confirmación) y la demostración. |
| `js/carro.js` | El carro, pieza por pieza, construido con perfiles extruidos, en cuatro carrocerías y a las medidas de la línea (`disposicion` convierte medidas en bordes y alturas). Cada pieza es un objeto aparte con su propio material; las articuladas (puertas, capó, pieza trasera) cuelgan de un pivote en su bisagra (`articular`) y las de interior comparten material con sus paredes (`acompanar`). Sin DOM: también se construye en Node para probarlo. |
| `js/toque.js` | Qué pieza hay bajo el dedo: rayo central más un anillo de ocho para que estribos y espejos se dejen tocar. Sin DOM, probado con la cámara y el carro reales. |
| `js/visor.js` | Escena, luces, cámara, giro con el dedo, el toque que marca, y el pegamento con el registro: qué carro está abierto (por la URL o el último), el 3D con su carrocería, color y medidas (se reconstruye al cambiar de carro), teñir por estado, guardar. |
| `js/vendor/` | Three.js 0.169 (tres archivos) y, en `transformers/`, Transformers.js 4.3.1 con el motor ONNX Runtime (dos .wasm, 41 MB). Copiados de npm, no se editan. Así la app no depende de internet para dibujar ni de que cambie la versión. |
| `herramientas/servidor.js` | Servidor estático sin dependencias; los módulos de JavaScript no cargan desde `file://`. Sirve `.wasm` con su tipo para que el motor compile en streaming. |
| `herramientas/generar-catalogo.mjs` | Del JSON de la investigación al catálogo: una entrada por marca y línea, medidas limpias, fuente conservada. |
| `herramientas/calcular-etiquetas.mjs` | Calcula en el PC los vectores de texto de CLIP (modelo de texto, 60 MB que el teléfono así no necesita) y escribe `js/etiquetas-clip.json`. |
| `pruebas/` | `estado.test.js` (la orden, las 29 piezas), `carro.test.js` (piezas, medidas de sedán, simetría, accesorios que asoman, interior que no atraviesa el vidrio, la base de puertas, la placa), `carrocerias.test.js` (las cuatro carrocerías: piezas, tamaño, simetría, compuertas, platón), `toque.test.js` (el dedo sobre el estribo y el espejo), `garaje.test.js` (modelo y almacén: estados, fotos, borrado, el formato viejo del borrador, los datos de la foto), `tablero.test.js` (semanas, pesos, pago por pieza, pintor y entrega, nómina, historial, indicadores, la demostración, los empleados en el almacén y la subida de versión de la base sin perder carros), `fotos.test.js` (medidas), `color-foto.test.js` (el color con vidrios y sombras) y `catalogo.test.js` (el catálogo y su buscador). 104 pruebas. `fotos-reconocer/` (fuera de git) tiene fotos de Wikimedia para probar el reconocedor a mano. |

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
- Las carrocerías son **paramétricas, no modelos descargados**: cada borde
  del sedán original se expresó como distancia a un eje, a la punta o a la
  cola (`disposicion` en `carro.js`), así que un Logan de 4,35 m y un Hilux
  de 5,33 m salen del mismo código estirados donde se estira un carro de
  verdad. Los ids de las 17 piezas no cambian entre carrocerías (el registro
  y la nómina siguen hablando de `baul` y `costado`); cambia el nombre que
  ve la persona.
- El reconocedor corre **en el teléfono, sin servidor ni cuenta**: CLIP
  (ViT-B/32 cuantizado, 89 MB) con Transformers.js. Se eligió frente a una
  IA en la nube porque no exige clave de API ni pago por foto, y porque el
  dato de la foto es una sugerencia, no la verdad. Los vectores de texto se
  calculan en el PC (`calcular-etiquetas.mjs`) para que el teléfono no
  tenga que bajar también el modelo de texto. Las candidatas son FAMILIAS
  (Logan, no Logan I y Logan II: con las generaciones sueltas se repartían
  el voto) y solo las 89 "muy comunes": con 400 la línea acertaba 3 de 9.
  Medido con nueve fotos reales: carrocería 6 o 7 de 9 (30 % lo que ve CLIP
  directo, 70 % lo que votan las líneas parecidas), línea 3 o 4 de 9 de
  primera y 4 o 5 de 9 en las tres primeras (el PC y el navegador difieren
  en una foto: el modelo cuantizado no es idéntico). Un reconocedor mejor es
  cuestión de nube y de plata (decisión 8).
- La foto del carro entero se guarda como una foto más, con la pieza
  especial `carro`: así vive en el mismo almacén, se reduce igual y se va
  con el carro al borrarlo.
- **La plata no se inventa.** `pagoDePieza` paga 90.000 solo a una pieza de
  pintura, exterior y terminada; la latonería y el interior devuelven 0 y
  las pantallas los muestran como "por definir", con su conteo. Cuando Joan
  decida esas tarifas (decisión 9), es un cambio en esa función y nada más.
  "Queda" (cobro menos pintores) tampoco descuenta materiales, y lo dice.
- **La semana es de lunes a domingo**, en hora local, y una pieza cuenta en
  la semana en que pasó a terminada (`desde`), no en la que se marcó. Si se
  reabre y se vuelve a terminar, cuenta en la nueva fecha.
- Los empleados tienen **id estable** (`emp-` + fecha, o `demo-*`): las
  piezas guardan el id, no el nombre, así corregir un nombre no descuadra
  la nómina. Borrar un empleado deja sus piezas "sin pintor asignado", y
  la pestaña Empleados las lista para que alguien las reasigne.
- La base de datos subió a la **versión 2** (almacén `empleados`). Los
  teléfonos con la versión 1 suben solos sin perder carros ni fotos; las
  piezas viejas sin `pintor` salen con `pintor: ''`.
- Lo de demostración lleva `demo: true` en el carro y en el empleado, y las
  placas son DEM001 a DEM005; `cargarDemo` no pisa un carro real con esa
  placa y `quitarDemo` solo borra lo marcado.

## Plan, con fechas

Las fechas asumen que las decisiones de la sección siguiente están tomadas
el lunes 19.

| Cuándo | Qué | Qué puede hacer el taller al terminar |
|---|---|---|
| **Jueves 15-oct** (hecho) | Visor: sedán por piezas, girar, tocar, enviar por WhatsApp. | Mandar una orden de pintura desde el celular. |
| **Lunes 19 a viernes 23-oct** (hecho el jueves 15) | Registro por placa y marca; pantalla **Garaje** con todos los carros; fotos por pieza (cámara del celular, guardadas en el teléfono); estados por pieza: pendiente, en proceso, terminada. | Ver cualquier carro, abrir su 3D y saber qué se trabajó y qué está en curso. |
| **Lunes 26 a viernes 30-oct** (empleados, nómina, historial e indicadores hechos el jueves 15; queda la nube) | Empleados: asignar pintor a cada pieza y marcarla terminada; resumen semanal por pintor con piezas × 90.000. La nube (Supabase, con RLS) para que el dueño y el asistente vean lo mismo desde dos teléfonos. | Pagar la semana con la lista en la mano; el asistente ve la orden en la app, no solo en WhatsApp. |
| **Lunes 2 a viernes 6-nov** (carrocerías y foto hechas el jueves 15; queda lo instalable) | Otras carrocerías (hatchback, SUV, camioneta/pick-up: cambia el baúl por la compuerta y el largo); instalable en el celular (PWA primero; APK por enlace como Tu Garantía si hace falta). | Usarla con los carros que de verdad llegan al taller, como una app más. |

Lo que NO está en el plan y no se va a prometer: escaneo del carro real
(arriba está el porqué), presupuestos al cliente, facturación.

## Lo que solo Joan decide (antes del lunes 19)

1. **¿Es para tu taller o para venderla a talleres?** Hoy da igual; en la
   semana del 26 decide si la nube se arma para un taller o para muchos.
2. **¿Quién marca la pieza terminada?** ¿Cada pintor desde su celular (hace
   falta cuenta por empleado), o el asistente por todos (una sola cuenta)?
3. **¿90.000 es por cualquier pieza?** ¿Un espejo paga igual que un techo?
   Si no, hace falta una tarifa por pieza en el catálogo. Hoy la nómina
   paga 90.000 parejo por cada pieza exterior pintada (`TARIFA_PIEZA` en
   `garaje.js`).
4. **¿Qué carrocerías llegan más?** Sedán ya está. Si el 70 % son camionetas,
   la camioneta va antes que el hatchback.
5. **¿El cliente del taller ve algo?** (Una tarjeta "su carro va así" por
   WhatsApp.) Es barato y trae clientes, pero no está en las cuatro semanas.
6. **El nombre.** "Taller de Pintura" es provisional.
7. **¿Un carro que vuelve al taller empieza de cero?** Hoy conserva la
   historia (piezas terminadas y fotos de la visita anterior). Si lo que el
   taller quiere es "cada visita es una orden nueva", hace falta una orden
   por visita, no solo un carro por placa, y eso cambia la nómina.
8. **¿Basta con que la foto sugiera, o hace falta que acierte casi
   siempre?** Hoy acierta la carrocería 6 o 7 de 9 y el modelo 3 o 4 de 9
   (4 o 5 de 9 entre las tres sugerencias), en el teléfono y gratis. Subir
   a 8 o 9 de 10 exige una IA en la nube (Claude o
   Gemini con la lista de candidatos), que cuesta centavos por foto pero
   necesita una cuenta de API pagada con tarjeta y un servidor que guarde la
   clave: es la semana del 26 (la nube) y una decisión de plata.
9. **¿Cómo se pagan las piezas de interior y la latonería?** El vano del
   motor, los marcos y bases de puertas y el vano del baúl ya se marcan; la
   latonería ya se distingue de la pintura. Falta saber si el vano paga los
   mismos 90.000 que un capó, y cuánto paga la latonería (y a quién: ¿al
   latonero, aparte del pintor?). Mientras tanto la nómina los cuenta y los
   muestra "por definir", sin valor: la semana no se puede cerrar con un
   número inventado.
10. **¿Qué va en "cobro al cliente"?** Hoy es un solo número por carro, el
    total que pagó. Si el taller cobra por adelantado y el resto al
    entregar, o cobra materiales aparte, hace falta más de un campo, y los
    indicadores de "queda" cambian.

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
- `node --test` a secas también corre las pruebas que traen los paquetes de
  `node_modules` (Transformers.js arrastra una con 450 pruebas ajenas): por
  eso `npm test` es `node --test pruebas/*.test.js`.
- De Transformers.js hay que copiar `transformers.min.js`, no
  `transformers.web.min.js`: el "web" es para empaquetadores e importa
  `onnxruntime-web` por nombre, y el navegador no sabe resolverlo. El bundle
  completo busca `ort-wasm-simd-threaded.asyncify.*` en la carpeta que diga
  `env.backends.onnx.wasm.wasmPaths`, y esos archivos tienen que ser de la
  versión exacta de ONNX Runtime que pide Transformers.js (está en su
  `package.json`); con otra versión el motor no carga.
- `imagen.decode()` de un `<img>` se queda esperando para siempre si la
  pestaña está tapada (el panel de Claude oculto, por ejemplo): por eso las
  fotos se decodifican con `createImageBitmap`, que no depende de que la
  página dibuje.
- Desde el frente, un sedán y un hatchback son el mismo carro para
  cualquier IA: el baúl está atrás. Si la foto se toma de tres cuartos
  (frente y lado), la carrocería acierta más.
- Las URL temporales de las miniaturas (`URL.createObjectURL`) no se
  liberan al repintar la tira sino cuando la foto sale de la lista: si se
  liberaban antes, las imágenes que aún no habían cargado fallaban con
  `ERR_FILE_NOT_FOUND` en la consola.
- El toque salta los adornos (`userData.decorativo`) pero no el vidrio ni
  las llantas: tocar una manija marca la puerta; tocar el vidrio no marca la
  puerta del otro lado.
- Los manejadores del gesto de abrir van en **fase de captura** sobre el
  lienzo: así corren antes que los de OrbitControls (que escuchan el mismo
  lienzo) y pueden apagar los controles antes de que el giro arranque con
  ese dedo. Si fueran normales, OrbitControls ya habría empezado a girar.
- Al medir una pieza que cuelga de una bisagra hay que actualizar primero
  la bisagra (`updateWorldMatrix(true, true)`): `Box3.setFromObject` solo
  actualiza la malla con la matriz vieja del padre, y la puerta "abierta"
  salía donde estaba cerrada.
- Con el panel de Claude tapado, `requestAnimationFrame` no corre: las
  animaciones (la cámara yendo a una vista, una puerta abriéndose) se
  quedan quietas hasta que algo pinta. Las coordenadas de una pieza en
  pantalla, calculadas en ese estado, son de donde la cámara venía, no de
  donde iba; un arrastre de prueba cayó en otra parte por eso.
- La dirección del PC para el celular sale de `ipconfig` como "Dirección
  IPv4" del adaptador Wi-Fi (los nombres salen en español y con la ñ rota).
- Una malla puede llevar una **lista** de materiales (la placa con número:
  uno por cara). Al cambiar de carro, el visor libera geometrías y
  materiales, y `material.dispose()` sobre la lista reventaba el visor
  entero al abrir otro carro con el borrador de uno que tenía placa. Se
  liberan uno por uno, textura incluida.
- `Three.Color` guarda los colores en lineal: el verde de `#ffd83d` lee
  0,69, no 0,85. Una prueba que compare canales contra el hex se equivoca;
  comparar `getHexString()`.
- La demostración se ofrece siempre que no esté cargada, no solo con el
  Garaje vacío: Joan ya tiene su Captiva y aun así quiere ver los carros
  demo al lado.
