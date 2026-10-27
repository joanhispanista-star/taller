# Taller de Pintura

App para un taller de latonería y pintura, pensada para el celular: el dueño
marca en un carro 3D las piezas que hay que pintar, el asistente recibe la
orden, cada carro queda registrado por placa, y al final de la semana se sabe
qué pintor pintó qué pieza para pagarle (90.000 pesos por pieza).

Estado al **16 de octubre de 2026**: **instalable en el celular** como una
app (PWA, adelantada de la semana del 2-nov: el Garaje, el 3D y el tablero
abren sin internet; ver "Instalarla en el celular"); el visor; adelantada la semana del 19,
el registro (Garaje por placa, estado por pieza y fotos por pieza, todo
guardado en el teléfono); y adelantada la del 2 de noviembre, **el carro
desde una foto**: la app reconoce en el teléfono el tipo de carrocería y el
modelo más parecido, toma el color, y dibuja el 3D de esa carrocería a las
medidas de esa línea, en ese color. Cuatro carrocerías (sedán, hatchback,
SUV, camioneta de platón) y un catálogo de los carros que ruedan en Colombia.
Y adelantada la del 26 (sin la nube): **Empleados** con la nómina de la
semana (pintor por pieza, 90.000 por pieza terminada), **Historial** de carros
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

**La tercera vuelta, el 22 de octubre: el escaneo SÍ se construyó.** Joan lo
volvió a pedir ("que la imagen sea un 3D de tamaño y forma real, y que si no
está escaneado se pueda escanear con el celular"), y es su decisión. Una
investigación nueva (9 agentes, leyendo el código de Chrome) cambió dos de
las tres razones de arriba:

1. *La pintura es un espejo:* sigue siendo cierto, pero de otra forma. La
   profundidad ya no sale de fotos sino del movimiento del celular (ARCore,
   por WebXR, en Chrome de Android). Chrome solo entrega la profundidad
   "suavizada", que rellena todo: los vidrios, el cromo y la pintura negra no
   salen como huecos ni abolladuras sino como profundidad inventada. El error
   típico es de 6 a 10 cm (ISPRS 2022). Alcanza para el **tamaño y la
   silueta**, no para la forma de un panel ni para una abolladura.
2. *Un escaneo es una sola masa:* sigue siendo cierto, y se resolvió sin
   pelear con eso. Las piezas no se adivinan en la malla: el carro genérico
   se ajusta a las medidas del escaneo y cada punto toma la pieza genérica
   más cercana. La puerta queda donde está la puerta; las juntas son las del
   genérico, no las del carro real.
3. *"Android no tiene escaneo":* era falso. Chrome para Android da
   profundidad por cuadro desde la versión 90 a más del 88 % de los
   celulares activos (no a todos: Galaxy A14 5G, A24, A25 5G y A34 5G no la
   tienen). Lo que no existía era el escáner: se programó en la app (fusión
   TSDF, malla, piso, orientación, piezas). En iPhone no hay WebXR: ahí se
   sube un escaneo hecho con RealityScan (gratis, de Epic, permite uso
   comercial).

**El freno, dicho claro:** para un carro que está en el catálogo, el escaneo
aporta poco más que una silueta con unos 10 cm de error sobre medidas que ya
se conocen. Sirve de verdad para los carros que NO están en el catálogo y
como registro de cómo entró el carro al taller. Y **nada de esto se ha
probado en un celular de verdad**: la fusión, la malla, las piezas y el
pegamento con WebXR están probados en Node con escaneos de mentira (ruido,
reflejos, un WebXR que imita el de Chrome), y la importación en el navegador
del PC; la cámara del celular, la deriva al dar la vuelta y la pintura real
falta probarlas.

**El 23 de octubre, viendo cómo saldría un escaneo de verdad.** Para que
Joan viera el escaneo del celular antes de elegir cómo presentarlo, se
simuló uno: la profundidad de un sedán (el genérico a las medidas del Kia
K3) dibujada a 160 × 120 como la da ARCore, con su ruido (ondulación de
cuadro a cuadro, error que crece con la distancia, el suavizado que mezcla
los bordes), fundida con el mismo código de la app. Mide 4,57 × 1,76 ×
1,51 m contra 4,54 × 1,76 × 1,48 de la ficha. Salieron dos defectos que las
pruebas con cajas no veían, y se arreglaron:

- **El techo y el capó salían a manchas** como "nada": el forro bajo el
  techo y el bloque del motor bajo el capó, a 1-2 cm de la lata, se robaban
  los puntos al repartir las piezas. Ahora `carro.js` los marca
  `userData.relleno` y `muestrasDelGenerico` no los muestrea.
- **El capó y el techo salían picados de huecos**: se ven casi de canto, y
  con el ruido la TSDF no alcanza a saber qué hay debajo de la lata. Bajar el
  peso mínimo no los cierra (no faltan datos: falta el lado de adentro). Se
  cierran los huecos chicos de la malla (`cerrarHuecos`: lazos de borde de
  hasta 60 aristas y 1,2 m de perímetro, con un abanico, antes de suavizar);
  la panza del carro, que nunca se ve, queda abierta. La distancia de cada
  vóxel ahora se mide desde su centro y no por pasos del rayo.
- **Y una lección para el escáner:** con la vuelta alta a 1,4 m del carro el
  techo sale lleno de huecos igual; a un metro y con el brazo arriba (2,1 m)
  sale entero. Las instrucciones de la pantalla tienen que pedirlo.

**El 27 de octubre, las piezas sobre el escaneo.** Con un Hyundai Kona real
(reconstruido en el PC de una vuelta con celular: CO3D de Meta, solo para
mostrar) se vio que las piezas caían corridas: el genérico SUV empieza la
lata a 42 cm y el vidrio a 86 cm, y el Kona real a 20 cm y a 1 m, así que
media puerta quedaba como "nada" y el estribo era una franja enorme. Ahora:

- **El genérico se acomoda a lo medido** (`ajustesDelEscaneo`, y
  `disposicion(carroceria, medidas, ajustes)` en `carro.js`): los ejes
  (donde los costados tocan el piso), el piso de la lata (lo más bajo entre
  las llantas) y la cintura (donde la cabina se angosta 8 cm, con el
  percentil 70 del ancho para que los espejos no cuenten). Se guardan con el
  escaneo (`ajustes`) para rehacer igual las piezas de adentro.
- **Con color, lo oscuro no es pieza pintada** (`pinturaDelEscaneo`):
  plástico negro, llantas, vidrio polarizado. Lo claro sin color sí cuenta
  (es el reflejo del cielo en la misma pintura). Con plateado, blanco o
  negro el color no separa nada y no se usa.
- **Bordes limpios** (`suavizarEtiquetas`, mayoría de vecinos, tres vueltas)
  y **juntas** (`juntasDelEscaneo`): una línea entre pieza y pieza, como la
  luz entre dos latas. El toque del dedo las atraviesa (un rayo de Three.js
  "toca" una línea a un metro por defecto, y tapaban las piezas).

Las maquetas (holograma, plano técnico, vitrina para el cliente, la base de
carros) y su simulador están en `pruebas/datos-externos/diseno-escaneo/`
(fuera de git); la tubería de fotogrametría del PC, en
`pruebas/datos-externos/fotogrametria/`.
Pintado "realista", el escaneo del celular parece un carro de plastilina con
grumos: sin color (Chrome no deja usar la cámara para eso) y a 3 cm por
vóxel, luce en los estilos que lo leen como dato (holograma, plano), no en
el de vitrina.

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
- **La marca por el logo** (15-oct, tarde): la foto se muestra entera y la
  persona **toca el emblema**; la app recorta alrededor del toque a tres
  tamaños y CLIP compara los recortes con los 70 logos del catálogo
  (frases que describen la forma: "gold bowtie", "silver diamond"). Medido
  con diez fotos reales: la marca correcta sale de primera en 8 de 10, y en
  7 de 10 con ventaja suficiente para ponerla sola (en la otra, un Tucson al
  12 %, la app pregunta); Nissan y Kia al 70-90 %, Chevrolet, Renault y
  Mazda al 20-30 % pero con ventaja clara; falla un Logan con el rombo en
  sombra y un Onix de lado. Si gana con claridad, la marca queda puesta
  ("Marca por el logo: Chevrolet") y abajo solo salen
  **las líneas de esa marca** (las familias de Chevrolet ordenadas por lo
  que se parecen a la foto, con empujón a la carrocería que votó la foto);
  si no, la app lo dice y ofrece las tres marcas más probables para tocar
  una, o tocar el logo más de cerca. "Otra marca" quita el filtro. Sin
  toque, barrer la foto a ciegas acertaba 4 de 10: por eso se pide el toque
  (un segundo de la persona, no treinta del teléfono).
  **La marca va primero y la foto entera no la afirma** (16-oct): Joan vio
  en el celular "parece Hyundai" con el corbatín a la vista y la app quedó
  como equivocada; la marca por la foto entera se equivoca seguido y ya no
  se muestra ni se proponen líneas hasta saber la marca. Antes del toque, la
  ficha ofrece las diez marcas que más ruedan en Colombia para tocar una, y
  el botón **"Foto del logo de cerca"** abre la cámara para fotografiar el
  emblema: la foto entera y dos recortes del centro van al reconocedor; es
  el camino más seguro porque el logo llena la imagen y no depende de dónde
  cayó el dedo. Medido con `herramientas/medir-logo-variantes.mjs`: el toque
  aguanta un dedo corrido un 3 % del ancho y la foto reducida a 1000 px
  (8 de 10 igual, ningún "seguro" equivocado); buscar alrededor del toque o
  quedarse con el recorte más seguro no mejora y lo segundo produce
  "seguros" equivocados, así que el algoritmo se quedó como estaba. La foto
  en la ficha pasó de 220 a 300 px de alto para que el dedo caiga mejor.
- **La placa se lee de la foto, y el logo se busca solo encima de ella**
  (16-oct, noche; Joan pidió más certeza con UNA foto y que no le pidieran
  la placa que se ve). La placa colombiana es amarilla: `js/placa-foto.js`
  la encuentra por color sin ninguna IA (máscara de amarillo, cierre
  morfológico para que las letras no la partan, y una regla que la separa
  de rayas y números pintados en el piso: las letras son huecos encerrados
  por amarillo; un "243" pintado en el parqueadero de Joan engañaba todo
  lo demás), saca sus cuatro esquinas y la **endereza** con una homografía
  a 660 × 320. Con eso: (1) el **emblema va encima de la placa**, así que
  el reconocedor recorta esa zona (hasta 15 puntos, unas 10 pasadas de
  CLIP: 1 s en el PC, unos 5 en el teléfono) y pone la marca sin que nadie
  toque nada, con el anillo donde lo encontró; en la foto de la Captiva da
  Chevrolet al 40 % y segura. Sin placa a la vista, o si encima de la placa
  el logo no se ve claro, la app barre la foto entera (ver el punto
  siguiente). (2) La placa enderezada se lee con
  **fast-plate-ocr** (`js/vendor/placa/cct_xs_v2_global.onnx`, MIT, 3,3
  MB, de Ankandrew; corre con el mismo ONNX Runtime del reconocedor): con
  60 placas colombianas de ejemplo lee bien 56 (las que falla cambian una
  letra: 6 por 8, M por W), en 8 ms cada una en el PC. La de la Captiva,
  de tres cuartos a 30°, la lee JRK248 (la X en ángulo le parece K; a
  Tesseract también). Por eso el campo se llena con lo leído y una nota
  dice "Placa leída de la foto: revísala"; lo que la persona escriba manda.
  Tesseract.js se probó y se descartó (23 MB en la carpeta y peor). Los
  **prototipos de imagen** para CLIP (el vector promedio de fotos reales
  del emblema, del dataset CC BY de General Blockchain, 34 marcas) también
  se midieron y NO ayudan: subían la probabilidad media pero bajaban los
  aciertos de 8 a 5-6 de 10 (los óvalos cromados atraen recortes ajenos);
  quedan apagados con la herramienta y el resultado anotados.
  **Medido con 36 fotos libres de carros en Colombia** (Wikimedia Commons,
  `herramientas/medir-cadena.mjs`; frentes y traseras de Fiat, Renault,
  Kia, Volkswagen, Toyota, Honda, Audi, BYD, Chery, Citroën, Chevrolet):
  la placa se encuentra en 24, todas de verdad (las otras 12 no tienen
  placa a la vista o la tienen tapada; las hojas al sol que al principio
  pasaban por placa las sacan dos reglas: nada en el 12 % de arriba de la
  foto, nada con más de la mitad oscura); de esas 24, la marca sale sola
  de primera en 16, con 13 "seguras" acertadas y 1 "segura" equivocada (un
  Kwid por detrás como Kia); la placa sale con formato en 22 (KXS776 del
  Fiat Pulse y FBP129 de un Audi, correctas a ojo). Lo que más subió los aciertos
  (de 12 a 16) fue describir los logos NUEVOS de Renault (2021, dos
  chevrones) y Kia (2021, letras sin óvalo): con solo el logo viejo, un
  Kwid salía Chevrolet y un K3 Volkswagen. Buscar en más filas o refinar
  las tres mejores posiciones no mejoró. Los frentes de Kia siguen fallando
  (el logo nuevo, plano y negro sobre negro, CLIP no lo ve): ahí la persona
  toca el logo o elige Kia entre las diez marcas.
- **La marca sola aunque no haya placa** (17-oct; Joan: "tomé la foto pero
  sigue sin reconocer el vehículo"). Sin placa amarilla a la vista (foto de
  lado, placa tapada, carro sin placa) o con el logo encima de la placa
  dudoso, la app **barre la foto**: 70 recortes en rejilla (del 16 % del
  lado mayor, cada 9 %, en la franja del 30 al 80 % del alto) y mira de
  cerca, a las tres escalas del toque, los 3 que más parecen un logo: 76
  pasadas de CLIP (la escala del medio repite el recorte de la rejilla y no
  se paga dos veces). El 15-oct barrer a ciegas acertaba 4 de 10 y se
  descartó; lo que lo hizo servir son las **frases de fondo** (parrilla,
  faro, placa, chapa, llanta, vidrio, pared, letras del modelo, borroso:
  `FRASES_FONDO` en `js/logo.js`) que compiten con los 70 logos: sin
  ellas, el recorte que "más parecía un logo" era a menudo una llanta que
  se llevaba un 20 % de "BMW". Y la marca del barrido solo queda
  **segura** si sale primera en al menos 2 de los 3 puntos mirados de
  cerca: un emblema de verdad se ve desde recortes vecinos, una textura que
  engaña sale en uno solo (el Onix de lado salía Daihatsu al 36 %). La
  persona ve el anillo donde la app encontró el logo, el avance ("Buscando
  el logo en la foto (12 de 79)…") y puede tocar el logo o elegir marca en
  cualquier momento: eso corta el barrido y lo suyo manda. **Medido con
  46 fotos** (las 10 de antes y 36 de Commons; `herramientas/medir-cadena.mjs`
  repite paso por paso lo que hace el teléfono):

  | Una sola foto, sin tocar nada | Marca bien | Segura y bien | Segura y mal |
  |---|---|---|---|
  | Hasta el 16-oct (solo encima de la placa) | 17 | 14 | 1 |
  | Desde el 17-oct (placa + barrido) | 29 | 23 | 1 |

  La segura equivocada es el Renault Kwid por detrás (sale Kia: su logo
  nuevo de 2021 se parece). Fallan todavía los BYD, los Kia de frente y
  las fotos sin emblema a la vista. Antes de la revisión daba 30, 23 y 2:
  el prior de presencia inflaba el "fondo" de los recortes de marcas poco
  comunes, y al corregirlo el Kwid de frente dejó de salir "Chevrolet
  seguro" (y se perdió un Prado al 7 % que nunca fue seguro). Con las
  fotos reducidas a 1280 px, como llegan reenviadas por WhatsApp
  (`--reducir=1280`), la cadena casi no pierde: 28, 23 y 2. Pero una foto
  suelta sí puede: el Fiat Pulse de frente da Fiat seguro a 1920 px y nada
  claro a 1280 (el logo encima de la placa queda muy chico); mejor la foto
  tomada desde la app, que llega entera. Cuánto
  cuesta: en el PC el barrido tarda 11-12 s con 4 hilos; en un teléfono se
  estima entre 30 s y un minuto (**sin medir todavía en el celular de
  Joan**). Se midieron también rejillas más baratas (franja del 35 al 75 %,
  paso del 10 %, recortes del 20 % cada 12 %): todas pierden entre 4 y 10
  aciertos.
- **El motor con varios hilos** (17-oct): el service worker sirve las
  páginas y los scripts de los workers con las cabeceras de aislamiento de
  origen (COOP/COEP) que GitHub Pages no manda, y con eso ONNX Runtime usa
  hasta 4 hilos en vez de uno. Probado en el panel con
  `http://127.0.0.1:8310/como-github/garaje.html`, que el servidor local
  sirve como GitHub Pages (bajo una carpeta y sin cabeceras): la primera
  visita sin aislamiento, la segunda aislada solo por el service worker,
  los 3 workers del motor arriba y el barrido de la Frontier dando Nissan
  al 63 %. En el PC
  la búsqueda del logo encima de la placa de la Captiva bajó de 5,8 s a
  1,3 s. La primera visita va sin aislamiento (un hilo: el service worker
  aún no sirve la página); en iPhone siempre un hilo (Safari ha fallado con
  la memoria compartida de ONNX); y si el motor con hilos falla en un
  teléfono (después de bajar el modelo entero: antes es la red), la app lo
  anota una semana y en ese tiempo usa uno solo.
- **La placa con tres pasadas** (17-oct): si el amarillo normal no
  encuentra nada, se prueba el amarillo "en sombra" (más oscuro y menos
  saturado, para bajo techo o contraluz, exigiendo letras oscuras y altura
  de bómper) y luego todo a 960 px buscando solo placas chicas (carro
  lejos). En las 46 fotos estas pasadas no encontraron ninguna placa nueva:
  al principio solo encontraban llantas, carretera y hojas pegadas al borde
  de la foto, y se cerraron hasta no dar ni un falso (una mancha pegada al
  borde izquierdo o derecho ya no es placa). Quedan porque las fotos de
  Commons son de día y al aire libre; las del taller, bajo techo, son las
  que pueden necesitarlas. **Sin medir con fotos del taller.**
- **"Qué vio la app en la foto"** (17-oct): un desplegable al final de la
  ficha con cada paso y su segundo: la foto y el teléfono, la versión de
  la app que de verdad está corriendo (se la pregunta al service worker),
  los hilos del motor, dónde vio la placa y con qué pasada, qué logo vio
  encima de la placa y barriendo (las tres marcas con su porcentaje y si
  quedó segura), la placa leída cruda y corregida, y cualquier error. El
  botón **Copiar el detalle** lo deja listo para pegarlo en el chat: cuando
  la app no reconozca un carro, eso dice qué paso falló.
- **El carro escaneado: tamaño y silueta reales** (22-oct). En el visor, el
  botón **Escanear** (arriba a la derecha) ofrece:
  - **Escanear con este celular** (Android con Chrome y ARCore): se ve la
    cámara con las instrucciones, cuántos de los 12 lados del carro van
    vistos y los botones Terminar y Cancelar. Hay que caminar alrededor a uno
    o dos metros, una vuelta a la altura del pecho y otra con el celular
    levantado para que vea el techo, moviéndolo siempre (quieto no mide).
    Cada cuadro trae unos 160 × 120 puntos de profundidad y la pose de la
    cámara; se funde en una TSDF de 3 cm (solo cuando la cámara se movió 10
    cm o giró 5°) y al terminar sale la malla con surface nets, suavizada.
  - **Subir un escaneo** (GLB, glTF, OBJ o PLY) de otra app, para iPhone:
    la app adivina qué eje es arriba (el piso es el plano más lleno), pasa
    centímetros o milímetros a metros, conserva el color (de la textura o
    por vértice) y simplifica las mallas de más de 500.000 triángulos sin
    perder el color.
  - Con cualquiera de los dos, la app encuentra el piso, se queda con el
    carro (el bloque más grande encima), lo orienta (eje largo por el
    rectángulo de menor área de su huella; frente por dónde queda la
    cabina), lo mide (mediana de los puntos más externos de cada cara: el
    ruido no la corre) y le pone las piezas del genérico ajustado a esas
    medidas. **Nada se guarda sin verlo:** sale una vista previa con las
    medidas medidas al lado de las del catálogo y los botones Guardar,
    Frente al revés (si la cabina engañó), Está acostado (solo en lo
    importado: recorre los seis "arriba" hasta que quede parado) y
    Descartar. Ponerle la placa al carro no tira la vista previa (es justo
    lo que se pide para guardarla); cambiar a OTRO carro sí, con aviso.
  - Guardado, el 3D del carro ES el escaneo (la ficha dice "escaneado:
    4,36 × 1,80 × 1,69 m"), y se marcan y tiñen las piezas igual que antes.
    "Ver las piezas por dentro" vuelve al genérico, a las medidas del
    escaneo, para abrir puertas y marcar lo de adentro. "Quitar el escaneo"
    lo borra (las piezas marcadas no se tocan). Borrar el carro en el Garaje
    borra su escaneo.
  - **Medido en Node** (escaneos de mentira hechos del carro genérico): sin
    ruido, largo, ancho y alto a 3-4 cm; con 4 cm de ruido y uno de cada
    cinco puntos "reflejado" 20-50 cm detrás de la chapa, a menos de 10 cm y
    con el frente bien; la fusión de una vuelta simulada con un WebXR que
    imita el de Chrome, a 6 cm. En el navegador del PC, importar un escaneo
    de 2 MB tarda 2,5 s (en el celular, unos 10 s, sin medir).
  - **La revisión** (3 revisores y un escéptico por hallazgo, 29 agentes)
    confirmó 21 defectos distintos y todos se arreglaron. Los graves: la
    camioneta salía SIEMPRE al revés (la regla del frente estaba invertida
    para ella, y la camioneta de la app es doble cabina, con el techo detrás
    del centro como un sedán); un escaneo recortado sin piso salía acostado
    o boca abajo (el costado y el techo también son planos llenos; ahora un
    piso tiene que rodear al objeto); y la vista previa se perdía al
    ponerle la placa al carro. Además: carreras entre importaciones y
    cambios de carro (un turno por operación), un escaneo cortado por una
    llamada se arma con lo que alcanzó a ver, la escala ya no la mueven
    unos puntos sueltos, la profundidad que tarda no se confunde con un
    celular que no la tiene, corregir la carrocería en la ficha reacomoda
    las piezas del escaneo, y quitar la demostración borra sus escaneos.
  - **Lo que la pantalla NO promete** (y dice): las medidas son aproximadas
    (unos 10 cm), la malla del escáner sale en el color del carro y no en
    foto (no se pide la cámara a color: en Chrome 147-148 tumbaba la
    pestaña), los vidrios y la pintura negra salen rellenos a ojo, las
    piezas se ubican de forma aproximada y el escaneo vive solo en ese
    celular. RealityScan sube las fotos (con la placa) a la nube de Epic:
    la pantalla pide permiso al cliente.
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
  **90.000 por pieza** que quedó terminada con él asignado, la misma tarifa
  para pintura y latonería, por fuera y por dentro (decisión de Joan del
  15-oct); las de latonería lo dicen al lado del nombre. Las terminadas sin
  pintor asignado van en una lista aparte con el enlace al carro. Agregar,
  retirar, reincorporar y borrar empleados (pintor, latonero, asistente).
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

### Desde cualquier celular (publicado)

Joan pidió el 15-oct que abriera desde cualquier celular, sin estar en la
red del PC. Como la app es estática (HTML y JavaScript, sin servidor
propio), vive en **GitHub Pages**, como sus otros proyectos:

```
https://joanhispanista-star.github.io/taller/garaje.html
```

Publicar es `git push` (repo `joanhispanista-star/taller`, que Joan creó
con ese nombre el 15-oct; rama `master`, carpeta raíz; `.nojekyll` evita
que GitHub procese los archivos). **Probado en el teléfono de Joan el
15-oct por la noche**: abrió el enlace, le tomó la foto a su Captiva, tocó
el logo y salió Chevrolet con las líneas de Chevrolet. Es la primera
confirmación en un celular real; queda sin probar ahí el pellizco y el giro
con dos dedos del 3D, y cuánto tarda la primera descarga de 89 MB.
GitHub Pages solo es gratis con repo público: el código se ve, y no hay
nada que esconder (sin claves, sin números de teléfono; el enlace de
WhatsApp no lleva número). Dos cosas que hay que saber:

- **Cada teléfono tiene su propio Garaje.** Los carros viven en el navegador
  de cada aparato (IndexedDB); lo que se marque en un celular no aparece en
  otro hasta la nube de la semana del 26. Y el Garaje de `github.io` es
  distinto del de `192.168.x.x`: origen distinto, datos distintos.
- Por **https** la hoja de compartir del teléfono sí funciona (WhatsApp y lo
  demás), y lo instalable (PWA) existe desde el 16-oct (siguiente
  apartado). El reconocedor sigue bajando
  89 MB de Hugging Face la primera vez; GitHub Pages no manda las cabeceras
  COOP/COEP, así que corre en un solo hilo (igual que en el PC: ya era así).

### Instalarla en el celular (app instalable, desde el 16-oct)

La dirección pública es una **app instalable** (PWA: `manifest.webmanifest`
más el service worker `sw.js`): el celular la pone con su icono junto a las
demás apps, abre a pantalla completa sin la barra del navegador, y **el
Garaje, el 3D y el tablero abren sin internet**. Lo único que sigue
pidiendo señal es el reconocedor la primera vez (los 89 MB del modelo
vienen de Hugging Face, y los 27 MB del motor se guardan en el teléfono la
primera vez que se usa); después, tampoco.

- **Android (Chrome):** abrir
  <https://joanhispanista-star.github.io/taller/garaje.html>, menú ⋮ →
  **Instalar aplicación** (o "Añadir a pantalla de inicio"; Chrome a veces
  lo ofrece solo como una barra abajo, es lo mismo). La app instalada
  comparte los carros con Chrome: es el mismo origen y la misma IndexedDB.
- **iPhone (Safari):** abrir la misma dirección, botón **Compartir** (el
  cuadrado con la flecha) → **Añadir a pantalla de inicio** → Añadir. Es la
  única forma en iPhone (Chrome de iPhone no instala). Ojo: la app de la
  pantalla de inicio guarda sus datos **aparte** de Safari; un carro
  registrado en Safari no aparece en la app instalada ni al revés.
- La app instalada abre en el Garaje (`start_url`).

Cuando se publica una versión nueva, la app la baja sola la próxima vez que
se abre con internet y el Garaje muestra la franja naranja **"Hay una
versión nueva, toca para actualizar"**: tocarla recarga con la nueva. Hasta
que se toque sigue la anterior, así nunca cambia debajo de alguien a mitad
de un carro. Cómo se publica una versión (hay un paso más que `git push`)
está en "Trampas conocidas". Probado el 16-oct en el panel del navegador:
registro, precarga de los 36 archivos, las tres pantallas abiertas con el
servidor apagado y el aviso de versión nueva de punta a punta; **falta
verlo instalado en el teléfono de Joan**.

### En la red del PC (desarrollo)

Para verlo en el celular (misma red Wi-Fi):

```bash
npm run celular
```

El servidor imprime la dirección `http://192.168.x.x:8310/` para abrirla en
el teléfono ("Desde el celular: ..."). **Esa IP cambia** al cambiar de red:
el 15-oct el PC de Joan tenía `192.168.101.16` por Wi-Fi y esa misma tarde
`192.168.197.36` por cable, y el enlace viejo dejó de abrir. Antes de pasar
el enlace, mirarla en la salida del servidor (o en `ipconfig`). El teléfono
tiene que estar en la Wi-Fi del mismo router al que va el PC; y como los
carros viven por origen, con una IP nueva el Garaje del teléfono arranca
vacío (los de la IP vieja siguen ahí, en esa dirección).
Windows puede pedir permiso al firewall la primera vez. Desde la sesión de
Claude, la entrada `taller-pintura-celular` de `.claude/launch.json` arranca
el servidor abierto a la red. El reconocedor de fotos sí necesita internet
en el teléfono la primera vez (89 MB desde Hugging Face); lo demás no.

Pruebas (121, en Node, sin navegador; el registro se prueba contra
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
| `manifest.webmanifest` | Lo que el celular lee para instalar la app: nombre, `start_url` y `scope` relativos (la app vive en `/taller/`, no en la raíz del dominio), `display: standalone`, colores e iconos (192 y 512, normales y maskable). |
| `sw.js` | El service worker: al instalar precarga lo propio (36 archivos, 2,5 MB: páginas, CSS, módulos, Three.js, etiquetas, el bundle de Transformers.js, manifest e iconos) y desde ahí lo sirve de la caché; el motor ONNX (`ort-*`, 39 MB) se guarda al primer uso en su propia caché; Hugging Face no se toca. Las páginas y los scripts de los workers salen con COOP/COEP (los hilos del motor); el `.wasm` sale tal cual para no perder su código compilado. Contesta su versión cuando la ficha se la pregunta. La versión del nombre de la caché la escribe `npm run sellar`. En el PC va primero a la red. |
| `js/instalable.js` | Registra el service worker con ruta relativa (solo https o localhost) y enciende en el Garaje el botón "Hay una versión nueva, toca para actualizar" cuando hay una esperando; tocarlo la activa y recarga. Lo cargan las tres páginas. |
| `iconos/` | Los iconos de la app (dibujo propio: carro naranja de perfil con la línea de la puerta y una gota de pintura): 192 y 512 normales y maskable, 180 para iPhone, y el `icono.svg` original. Se regeneran con `npm run iconos`. |
| `herramientas/generar-iconos.mjs` | Dibuja el SVG y lo convierte a PNG con `sharp`, que ya está en `node_modules` porque lo trae Transformers.js (no es una dependencia nueva). |
| `herramientas/sellar-version.mjs` | `npm run sellar`: escribe en `sw.js` la lista de archivos a precargar y una huella SHA-256 de su contenido (y otra del motor). Sin eso el navegador no ve que hay versión nueva. Exporta lo que usa la prueba. |
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
| `js/reconocer.js` | El reconocedor en el navegador: CLIP (visión) sobre la foto, comparado con los vectores de texto de `js/etiquetas-clip.json`. `reconocerCarro` (carrocerías, líneas y marcas por la foto entera, más el vector de la foto), `reconocerMarcaPorLogo` (recortes alrededor del toque contra los logos), `reconocerMarcaCercaDePlaca` (la zona encima de la placa), `reconocerMarcaBarriendo` (la rejilla sin placa; se puede abortar), `reconocerMarcaEnFotoDeCerca` y `lineasDeMarca` (las familias de una marca ordenadas por parecido). Cede el turno al navegador antes de cada pasada (`cederTurno`) y decide cuántos hilos usa el motor (`hilosDelMotor`). |
| `js/logo.js` | La parte pura de la marca por el logo: nombres de marca como los conoce CLIP, frases con la forma de cada logo y las de fondo (`FRASES_FONDO`), recorte alrededor del toque, clasificación de los recortes (con el fondo compitiendo, opcional), cuándo un logo es "seguro", la rejilla y los criterios del barrido (`REJILLA_BARRIDO`, `rejillaDeBarrido`, `decidirBarrido` con la regla de 2 de 3), cuál logo queda entre el de la placa y el del barrido (`logoQueQueda`), y del toque en pantalla al punto de la foto. Sin modelo ni DOM; probado en Node; las herramientas de medir usan las mismas constantes. |
| `js/etiquetas-clip.json` | GENERADO por `herramientas/calcular-etiquetas.mjs`: un vector por carrocería, por logo de marca (70) y por familia del catálogo (784, con su presencia; el carro entero se compara solo con las "muy común"). Desde el 17-oct trae también los 9 grupos de frases de fondo (`fondo`). Int8 en base64, unos 650 KB. Hay que regenerarlo cuando cambie el catálogo o `logo.js`. |
| `herramientas/medir-logo.mjs` | Mide en el PC la marca por el logo con las fotos de `pruebas/fotos-reconocer/` (coordenadas del logo a ojo): por escala, promedio, con y sin prior, y con `--auto` el barrido sin toque. Es lo que dio los números del LEEME. |
| `herramientas/medir-logo-variantes.mjs` | Lo mismo en condiciones de teléfono: foto reducida (1600 y 1000 px), dedo corrido un 3 %, cuatro escalas, el recorte más seguro y la búsqueda alrededor del toque. Dijo que el algoritmo actual ya aguanta y que las variantes no mejoran. |
| `js/placa-foto.js` | Encontrar la placa amarilla en los píxeles (máscara, cierre, componentes, huecos encerrados), sus esquinas, enderezarla (homografía), dejarla en blanco y negro (Otsu), convertir el texto del OCR en placa colombiana (corrigiendo O/0, I/1, B/8 por posición; carros ABC123 y motos ABC12D) y la zona donde buscar el logo encima. Todo puro, probado en Node. |
| `js/placa-ocr.js` | El lector de placas en el navegador: ubica con tres pasadas (amarillo normal y en sombra a 640 px, y solo placas chicas a 960), endereza desde la foto a 2000 px y lee con el modelo ONNX (128 × 64 en color, diez huecos; segunda instancia de ONNX Runtime, siempre un hilo). Devuelve la placa como propuesta. |
| `js/vendor/placa/` | `cct_xs_v2_global.onnx` (fast-plate-ocr, MIT, 3,3 MB; se guarda al primer uso como el motor) y `ort.wasm.min.mjs` (el cargador de ONNX Runtime Web, 50 KB, de la misma versión que el motor ya vendorizado). |
| `herramientas/medir-placa.mjs` | Mide si la placa amarilla se encuentra en las fotos de prueba (solo la Captiva es colombiana; las demás sirven como "no debe encontrar nada") y guarda los recortes de la placa y de la zona del logo. |
| `herramientas/medir-placa-onnx.mjs` | Mide el lector de placas en el PC con la Captiva enderezada y con las 60 placas colombianas de ejemplo de fast-plate-ocr (`pruebas/datos-externos/`, fuera del repo). |
| `herramientas/calcular-prototipos.mjs` | Calcula prototipos de imagen de los logos (CLIP sobre el dataset CC BY de General Blockchain) con su sesgo; escribe `herramientas/prototipos-logos.json` (25 KB). Apagados en las etiquetas: medidos, no ayudan. |
| `herramientas/medir-prototipos.mjs` | La medición que lo dijo: aciertos, "seguros" y probabilidad de la marca correcta con las frases solas y con prototipos a varios pesos. |
| `herramientas/bajar-fotos-commons.mjs` | Baja fotos libres de carros en Colombia de Wikimedia Commons para medir (con autor y licencia en un CSV, a `pruebas/datos-externos/commons-colombia/`, fuera de git). Commons responde 429 si se le pide rápido; con una petición por segundo y espera al 429 bajó 44 fotos el 16-oct. |
| `herramientas/medir-cadena.mjs` | La medición que vale: repite en el PC lo que hace el teléfono con una sola foto (las tres pasadas de la placa, el logo encima, el barrido, cuál queda, la placa leída) sobre las 46 fotos, con las mismas constantes de `js/logo.js`. `--sin-barrido` da la cadena de antes del 17-oct. |
| `herramientas/medir-barrido.mjs`, `medir-barrido-fino.mjs`, `medir-barrido-acuerdo.mjs` | Cómo se eligió el barrido: cuatro rejillas por dos criterios (probabilidad del mejor logo o "menos fondo"), con y sin fondo al decidir; luego franjas, pasos y refinados para el costo; y las reglas para frenar los "seguros" equivocados (de ahí los 2 de 3). Escriben su detalle en `pruebas/datos-externos/`. |
| `herramientas/medir-placa-pasadas.mjs` | Qué encuentran las pasadas extra de la placa en las fotos reales, con una hoja de contactos de cada hallazgo para mirarlo. Dijo que encontraban llantas y carretera, y así se cerraron. |
| `js/hoja.js` | La hoja de abajo del visor: chips con estado, trabajo (latonería), pintor y cámara; menú de estado, trabajo y pintor; tira de fotos y foto grande, con los nombres de la carrocería. DOM puro, sin Three.js. |
| `js/ficha-carro.js` | La ficha "Datos del carro" del visor: marca, línea con el catálogo, versión, carrocería, color, cobro al cliente y entrega. DOM puro. |
| `js/garaje-pantalla.js` | La pantalla Garaje: lista con portada y color (con "entregado" y lo cobrado, y la insignia «demo»), abrir o crear por placa, borrar, la ficha del carro nuevo con foto (color, reconocedor, catálogo, confirmación) y la demostración. |
| `js/carro.js` | El carro, pieza por pieza, construido con perfiles extruidos, en cuatro carrocerías y a las medidas de la línea (`disposicion` convierte medidas en bordes y alturas). Cada pieza es un objeto aparte con su propio material; las articuladas (puertas, capó, pieza trasera) cuelgan de un pivote en su bisagra (`articular`) y las de interior comparten material con sus paredes (`acompanar`). Sin DOM: también se construye en Node para probarlo. |
| `js/toque.js` | Qué pieza hay bajo el dedo: rayo central más un anillo de ocho para que estribos y espejos se dejen tocar. Sin DOM, probado con la cámara y el carro reales. |
| `js/visor.js` | Escena, luces, cámara, giro con el dedo, el toque que marca, y el pegamento con el registro: qué carro está abierto (por la URL o el último), el 3D con su carrocería, color y medidas (se reconstruye al cambiar de carro), teñir por estado, guardar. Si el carro tiene escaneo, el modelo es el escaneado (`modeloDesdeEscaneo`) o el genérico a sus medidas ("ver piezas"). |
| `js/escaneo.js` | La tubería pura del escaneo, probada en Node: TSDF dispersa por bloques, de la profundidad a puntos (`puntosDeCuadro`), surface nets (de la TSDF o de la densidad de una nube), piso, aislar el carro, orientarlo y medirlo, suavizado de Taubin, simplificación por agrupamiento de vértices, muestreo de superficie, las piezas por la muestra más cercana del genérico, y el modelo para el visor (una malla por pieza, con el mismo contrato que `construirCarro`). |
| `js/escaneo-ar.js` | El escáner del celular: WebXR `immersive-ar` con `depth-sensing` opcional (`cpu-optimized`, `luminance-alpha`/`unsigned-short`, `matchDepthView`), un lienzo WebGL propio (no `renderer.xr` de three r169, que revienta), el espacio `local`, el filtro de movimiento y los 12 lados de la vuelta. Probado con un WebXR de mentira; **sin probar en un celular**. |
| `js/escaneo-importar.js` | Importar un escaneo de otra app: lee GLB/glTF/OBJ/PLY con los cargadores de three, junta las mallas, saca el color de la textura, adivina arriba, corrige la escala y lo pasa por la tubería. |
| `js/escaneos.js` | Los escaneos guardados, en una base de IndexedDB APARTE (`taller-escaneos`): pesan megas y así el Garaje abre sin leerlos, y no hubo que subir la versión de la base de los carros. |
| `js/escaneo-pantalla.js` | La pantalla del escaneo: el botón, el diálogo, lo que se ve encima de la cámara (dom-overlay), la vista previa con Guardar / Frente al revés / Descartar, ver piezas y quitar. |
| `js/vendor/loaders/`, `js/vendor/utils/` | GLTFLoader, OBJLoader, PLYLoader y BufferGeometryUtils de three 0.169, copiados tal cual (MIT); están en la precarga para que importar funcione sin internet. |
| `herramientas/fabricar-escaneo-de-prueba.mjs` | Fabrica dos escaneos de mentira de una SUV (una nube PLY en milímetros con z arriba y una malla PLY con color) en `pruebas/datos-externos/escaneos-de-prueba/`, para probar el importador en el navegador sin celular. |
| `js/vendor/` | Three.js 0.169 (tres archivos) y, en `transformers/`, Transformers.js 4.3.1 con el motor ONNX Runtime (dos .wasm, 41 MB). Copiados de npm, no se editan. Así la app no depende de internet para dibujar ni de que cambie la versión. |
| `herramientas/servidor.js` | Servidor estático sin dependencias; los módulos de JavaScript no cargan desde `file://`. Sirve `.wasm` con su tipo para que el motor compile en streaming, y todo con COOP/COEP para que el motor use varios hilos también en el PC. Bajo `/como-github/` sirve lo mismo como GitHub Pages (en una carpeta y sin cabeceras), para probar el service worker antes de publicar. |
| `herramientas/generar-catalogo.mjs` | Del JSON de la investigación al catálogo: una entrada por marca y línea, medidas limpias, fuente conservada. |
| `herramientas/calcular-etiquetas.mjs` | Calcula en el PC los vectores de texto de CLIP (modelo de texto, 60 MB que el teléfono así no necesita) y escribe `js/etiquetas-clip.json`. |
| `pruebas/` | `estado.test.js` (la orden, las 29 piezas), `carro.test.js` (piezas, medidas de sedán, simetría, accesorios que asoman, interior que no atraviesa el vidrio, la base de puertas, la placa), `carrocerias.test.js` (las cuatro carrocerías: piezas, tamaño, simetría, compuertas, platón), `toque.test.js` (el dedo sobre el estribo y el espejo), `garaje.test.js` (modelo y almacén: estados, fotos, borrado, el formato viejo del borrador, los datos de la foto), `tablero.test.js` (semanas, pesos, pago por pieza, pintor y entrega, nómina, historial, indicadores, la demostración, los empleados en el almacén y la subida de versión de la base sin perder carros), `fotos.test.js` (medidas), `color-foto.test.js` (el color con vidrios y sombras), `catalogo.test.js` (el catálogo y su buscador) e `instalable.test.js` (el manifest y sus iconos, los enlaces de las tres páginas, el sello de `sw.js` contra la carpeta real, y el service worker corriendo en un `vm` con navegador de mentira: qué toca, qué no, que Hugging Face nunca, y las cabeceras de aislamiento). También `logo.test.js` (recorte, agrupación, clasificación con y sin fondo, la rejilla del barrido, la regla de 2 de 3 y cuál logo queda), `placa-foto.test.js` (la placa amarilla con sus tres pasadas, el borde, las esquinas, enderezarla, leerla), `escaneo.test.js` (la tubería con escaneos de mentira: fusión, piso, estorbo, orientación sin reflejo, medidas con ruido y reflejos, piezas, el contrato del visor, cerrar huecos, los bloques de relleno, el genérico acomodado a lo medido, la máscara de pintura, el suavizado de etiquetas y las juntas), `escaneo-importar.test.js` (PLY en milímetros con z arriba, malla con color, escala, simplificar, el almacén de escaneos) y `escaneo-ar.test.js` (el escáner con un WebXR de mentira). 170 pruebas. `fotos-reconocer/` (fuera de git) tiene fotos de Wikimedia para probar el reconocedor a mano. |

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
- **Una sola tarifa, en un solo sitio.** `pagoDePieza` (`tablero.js`) paga
  `TARIFA_PIEZA` a toda pieza terminada, sea de pintura o de latonería,
  exterior o de interior: Joan lo decidió así el 15-oct. Hasta ese momento
  la latonería y el interior salían "por definir" sin valor, porque la
  plata no se inventa. Si algún día la tarifa depende de la pieza (decisión
  3), es un cambio en esa función y nada más. "Queda" (cobro menos
  pintores) no descuenta materiales, y lo dice.
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
| **Lunes 2 a viernes 6-nov** (carrocerías y foto hechas el jueves 15; lo instalable, el viernes 16) | Otras carrocerías (hatchback, SUV, camioneta/pick-up: cambia el baúl por la compuerta y el largo); instalable en el celular (PWA primero; APK por enlace como Tu Garantía si hace falta). | Usarla con los carros que de verdad llegan al taller, como una app más. |

El escaneo del carro real, que estaba aquí como "no se va a prometer", se
construyó el 22-oct con los límites de arriba. Lo que NO está en el plan y
no se va a prometer: la forma exacta de un panel o una abolladura desde el
escaneo
(arriba está el porqué), presupuestos al cliente, facturación.

## Lo que solo Joan decide (antes del lunes 19)

1. **¿Es para tu taller o para venderla a talleres?** Hoy da igual; en la
   semana del 26 decide si la nube se arma para un taller o para muchos.
2. **¿Quién marca la pieza terminada?** ¿Cada pintor desde su celular (hace
   falta cuenta por empleado), o el asistente por todos (una sola cuenta)?
3. **¿90.000 es por cualquier pieza?** ¿Un espejo paga igual que un techo?
   Si no, hace falta una tarifa por pieza en el catálogo. Hoy la nómina
   paga 90.000 parejo por cada pieza terminada, latonería e interior
   incluidos (`TARIFA_PIEZA` en `garaje.js`).
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
9. **¿Cómo se pagan las piezas de interior y la latonería?** DECIDIDO el
   15-oct: pagan los mismos 90.000 que cualquier pieza, al pintor que la
   tiene asignada. Queda una pregunta chica: si la latonería la hace el
   latonero y la pintura el pintor, la pieza tiene UN pintor asignado hoy;
   si hay que pagarle a los dos, hace falta un segundo campo.
10. **¿Qué va en "cobro al cliente"?** Hoy es un solo número por carro, el
    total que pagó. Si el taller cobra por adelantado y el resto al
    entregar, o cobra materiales aparte, hace falta más de un campo, y los
    indicadores de "queda" cambian.

## Trampas conocidas

- **Publicar una versión nueva son tres pasos, no uno.** El service worker
  guarda la app en el teléfono y la sirve de ahí sin mirar la red; el
  navegador solo se entera de que hay versión nueva cuando cambia `sw.js`.
  Por eso, antes de cada `git push`: `npm test` en verde, **`npm run
  sellar`** (reescribe en `sw.js` la lista de archivos y la huella de su
  contenido) y commit. Si se olvida el sello, los teléfonos se quedan con la
  versión vieja para siempre y nadie se entera; la prueba
  `instalable.test.js` falla para que no se olvide. La versión llega al
  teléfono la próxima vez que abre la app con internet (GitHub Pages tarda
  hasta 10 minutos en servir lo nuevo) y se aplica cuando la persona toca la
  franja naranja del Garaje.
- En el PC (`127.0.0.1`) el service worker va **primero a la red** y usa su
  caché solo si el servidor está apagado; en la dirección pública es al
  revés (caché primero). Si fuera caché primero también en el PC, editar un
  archivo no se vería al recargar. El panel de Claude conserva el service
  worker entre sesiones: si una pantalla sale vieja con el servidor apagado,
  es la caché, no el código. En `http://192.168.x.x` no hay service worker
  (http plano no es contexto seguro) y la app abre igual, sin instalar.
- El motor ONNX (`ort-*.wasm/.mjs`, 39 MB) **no se precarga**: el Garaje y
  el 3D no lo necesitan. Se guarda en su propia caché (`taller-motor-*`) la
  primera vez que alguien toca "Nuevo carro con foto" con internet, y una
  versión nueva de la app no lo vuelve a bajar. El modelo de 89 MB lo guarda
  Transformers.js en la suya (`transformers-cache`) y el service worker no se
  mete con Hugging Face ni con esa caché: lo que no es de la app pasa de largo.
- `display: standalone` quita la barra del navegador, y en iPhone también el
  botón de atrás: toda pantalla tiene que tener su camino de vuelta en la
  propia página (hoy lo tienen: "‹ Garaje" y las pestañas). Y en iPhone la
  app de la pantalla de inicio tiene su propio almacén, aparte de Safari.
- Las rutas de lo instalable son **relativas** (`manifest.webmanifest`,
  `iconos/...`, `new URL('../sw.js', import.meta.url)`): en GitHub Pages la
  app vive bajo `/taller/`, y un `/sw.js` o `/manifest.webmanifest`
  apuntaría a la raíz del dominio, donde no hay nada. La prueba revisa que
  ninguna página tenga `href="/` ni `src="/`.
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
- La placa de la Captiva de Joan, en su foto de tres cuartos, sale **más
  alta que ancha** (0,56): una placa vista en ángulo no tiene proporción
  de placa. Por eso el filtro de proporción va de 0,45 a 3,8 y la forma la
  decide otra cosa: los huecos encerrados (las letras).
- A 360 px de ancho las letras de una placa chica no se resuelven y los
  huecos no existen; a 640 sí, y sigue tardando 70 ms.
- **Tesseract no lee texto inclinado**: con la placa a 30° devolvía basura
  o nada. Enderezada por sus esquinas (homografía) lee. El lector ONNX
  tampoco: siempre se endereza antes.
- Ni Tesseract ni fast-plate-ocr distinguen la X de la K en esa placa en
  ángulo (los dos leen JRK248). Con la foto de frente no pasa (56 de 60 en
  placas colombianas de ejemplo). El campo queda como propuesta.
- `RawImage.toBlob()` de Transformers.js no existe en Node: para pasar una
  imagen a otro programa en el PC hay que guardarla con `save()`.
- Wikimedia Commons devuelve **429** si se le pide rápido (las búsquedas de
  los agentes de investigación más un barrido de categorías lo dispararon):
  una petición por segundo, User-Agent que diga quién es, y esperar si dice
  que no. El 16-oct no alcanzó: queda para otro día.
- Los **prototipos de imagen** de un dataset ajeno no se parecen a las
  fotos del taller: el dataset trae emblemas cromados de cerca y el
  prototipo de Mercedes/Hyundai/Honda se lleva recortes de otras marcas.
  Más certeza no es lo mismo que más aciertos: con prototipos la
  probabilidad media subía y los aciertos bajaban. Medir siempre las dos.
- **`scheduler.yield()` no sirve para ceder el turno durante el barrido**:
  en Chrome su continuación pasa por delante de los temporizadores y, medido
  en el panel, ningún `setTimeout` de la página corrió en los 11 s del
  barrido. Sin ceder nada era peor: la página no pintaba el avance ni
  atendía el toque que debía cortarlo. `cederTurno` usa `setTimeout(0)`.
  Para comprobarlo: un `setInterval` desde la consola que lea la pista
  sobre la foto; si no ve el avance, el teléfono tampoco lo pintará.
- **Las cabeceras de aislamiento van en la página Y en los scripts de los
  workers**: los hilos de ONNX son workers que cargan su propio `.mjs`, y
  en una página aislada un worker sin COEP no arranca. Pero NO en todo: el
  service worker no debe rehacer la respuesta del `.wasm` (27 MB), porque
  Chrome guarda junto a la caché el código ya compilado y con una
  respuesta nueva lo recompilaría en cada carga. Y nada de otro origen en
  las páginas (fuentes, imágenes, scripts de CDN): COEP lo bloquearía.
  Hugging Face pasa porque va por `fetch` con CORS.
- **No culpar a los hilos de lo que es la red**: el primer intento anotaba
  "un hilo" ante cualquier fallo, también sin internet o con Hugging Face
  diciendo 429. Ahora solo cuenta un fallo después de que el modelo bajó
  entero, que no sea de red, y el recuerdo vence a la semana.
- Las pasadas extra de la placa (sombra, 960 px) **encontraban de todo**
  antes de cerrarlas: una llanta, carretera, hojas. Una mancha pegada al
  borde izquierdo o derecho de la foto nunca fue placa en las 46 fotos.
- **three.js 0.169 revienta con una sesión WebXR que traiga
  `depth-sensing`** si se la pasa a `renderer.xr` (llama la profundidad de la
  GPU sin mirar el modo; se arregló en la r173). El escáner no usa
  `renderer.xr`: lienzo WebGL propio que solo limpia la pantalla, y la
  profundidad se lee en la CPU.
- En Chrome para Android, **`local-floor` es una altura fija de 1,2 m**, no
  el piso: el escáner usa `local` y saca el piso de los datos.
- Las muestras oficiales de WebXR (`webxr-samples/proposals/phone-ar-depth`)
  usan nombres viejos (`getDepth`, `normTextureFromNormView`) que ya no
  existen: no copiarlas.
- Una **clave de tres índices empaquetada en un número** tiene que caber en 53
  bits: con 21 bits por eje (63) dos celdas distintas compartían clave y un
  estorbo a un metro quedaba "pegado" al carro. Van 17 por eje.
- **Medir con percentiles extremos es medir el ruido**: con 4 cm de ruido el
  ancho salía 11 cm de más. Las caras se miden con la mediana de sus puntos
  más externos.
- El color por vértice se guarda en sRGB (0-255, como viene) y Three.js lo
  quiere en lineal: sin convertir, el vino tinto salía rosado.
- Rehacer una malla desde sus vértices (densidad + surface nets) la vuelve
  una cáscara de doble capa, gris y más gorda: las mallas grandes se
  simplifican agrupando vértices.
- **Una prueba que mira la punta más baja no ve un carro al revés** si las
  dos puntas son bajas (camioneta): la orientación se prueba mirando dónde
  quedan el capó y el espejo izquierdo de verdad, en las cuatro carrocerías.
- `node --test` cuenta aparte las pruebas **canceladas** (una promesa que
  nunca se resuelve): el resumen puede decir "fail 0" con un "not ok"
  arriba. Mirar siempre `# cancelled`.
- **Scaniverse gratis es "no comercial"** (sus términos del 20-feb-2026) y
  Polycam pide permiso escrito para integrarlo con otra app: la pantalla
  solo nombra RealityScan. En Android, RealityScan guarda el GLB en
  `Android/data/`, que el selector de archivos de Android 11+ no muestra: no
  está probado que se pueda subir desde ahí.
- Son dos instancias de ONNX Runtime en la página (la de Transformers.js y
  la del lector de placas, misma versión, mismo `.wasm`): el navegador baja
  el wasm una vez pero lo instancia dos veces en memoria. Si en un teléfono
  flojo faltara memoria, el lector de placas es el que se puede apagar.
- GitHub **bloqueó el primer push** ("Push cannot contain secrets"): dentro
  de `transformers.min.js` hay una cadena que su detector toma por una
  clave de Mistral. Es el paquete de npm byte a byte (se comparó con
  `node_modules`), un falso positivo. Se marcó como tal en la página que
  GitHub da en el mensaje del push (hay que estar conectado con la cuenta
  de Joan), y el push pasó. Si alguna vez se actualiza Transformers.js,
  puede volver a pasar.
- GitHub Pages sirve `.mjs` como `text/javascript` y `.wasm` como
  `application/wasm` (comprobado el 15-oct): el motor del reconocedor
  carga igual que con `herramientas/servidor.js`.
- A CLIP la palabra "Chevrolet" le suena a carro entero, no a emblema: con
  frases de solo el nombre, el corbatín salía al 8 % y el rombo de Renault
  igual. Describir la FORMA del logo en las frases ("the gold Chevrolet
  bowtie emblem") lo subió a 29 % con ventaja clara, y la medición pasó de
  7 a 8 de 10. Si una marca nueva falla, lo primero es describir su logo
  en `DESCRIPCION_LOGO` (`js/logo.js`) y regenerar las etiquetas.
- **Lo hecho a mano manda** en la ficha de la foto. Cada dato lleva de dónde
  salió (`lineaPor`, `carroceriaPor`, `marcaPor`: 'mano', 'app', 'logo'):
  la app solo elige sola donde la persona no eligió, solo reemplaza lo que
  ella misma propuso, y el logo no pisa una línea escrita de otra marca (lo
  dice: "El logo parecía Chevrolet; si es, tócala arriba"). Una revisión
  con tres lentes (15-oct) encontró trece formas de pisar lo de la persona
  —"Abrir en 3D" releyendo el campo y perdiendo la carrocería tocada,
  escribir "captiva" con la marca ya puesta y guardar marca "captiva" sin
  línea, el logo borrando un "Renault Logan" escrito mientras miraba—; todas
  salían de no distinguir lo de la app de lo de la persona. `entradaEscrita`
  (`catalogo.js`) entiende "captiva" cuando la marca ya se sabe.
- El toque sobre la foto se convierte a un punto de la foto REAL
  (`puntoEnFoto`): la foto se muestra entera con `object-fit: contain`, con
  franjas vacías a los lados; un toque en la franja no es foto y se ignora.
  Con `object-fit: cover` (como estaba) el toque habría caído en otro sitio.
