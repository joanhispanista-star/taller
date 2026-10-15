# Taller de Pintura

App para un taller de latonería y pintura, pensada para el celular: el dueño
marca en un carro 3D las piezas que hay que pintar, el asistente recibe la
orden, cada carro queda registrado por placa, y al final de la semana se sabe
qué pintor pintó qué pieza para pagarle (90.000 pesos por pieza).

Estado al **15 de octubre de 2026**: existe la primera parte, el visor.

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
- Placa y marca del carro, y la selección, quedan guardadas en el teléfono:
  si se cierra la página no se pierde lo marcado.
- **Enviar al asistente** manda la orden escrita (carro, cantidad y lista
  numerada de piezas) por WhatsApp. No hay cuenta ni servidor todavía; el
  canal que ya tiene el asistente es WhatsApp, así que ese es el canal.
  Detalle honesto: la hoja de compartir del teléfono solo existe por
  **https** (cuando la app esté publicada); abierta por http en la red
  Wi-Fi del taller, el botón abre WhatsApp directo (wa.me) con el mismo
  texto.
- Cambiar a **otra** placa es otro carro: se limpian las piezas marcadas y
  la marca. Ponerle placa a un carro recién marcado no limpia nada.
- El estribo y el espejo miden 14 px en la pantalla de un celular; un dedo
  cubre 40. Por eso el toque lanza un anillo de rayos del tamaño de la yema
  y, si alguno cae en una pieza delgada, esa gana (`js/toque.js`).

## Cómo abrirlo

```bash
npm run dev
```

y entrar a <http://127.0.0.1:8310/>. Desde la sesión de Claude, la entrada
`taller-pintura` de `.claude/launch.json` (en PLAZA) arranca lo mismo.

Para verlo en el celular (misma red Wi-Fi):

```bash
npm run celular
```

El servidor imprime la dirección `http://192.168.x.x:8310/` para abrirla en
el teléfono. Windows puede pedir permiso al firewall la primera vez.

Pruebas (26, en Node, sin navegador):

```bash
npm test
```

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `index.html` | La única pantalla por ahora: barra con placa y marca, el lienzo 3D, botones de vista, la hoja con la lista y los dos botones. |
| `css/estilos.css` | Colores como variables `--*`, tema oscuro (luz de taller). Empieza con `[hidden] { display: none !important }` por una trampa conocida. |
| `js/piezas.js` | El catálogo de piezas. Sin Three.js: lo usarán el registro y la nómina. |
| `js/estado.js` | Qué carro es y qué piezas están marcadas; el texto para el asistente; guardar y cargar. Lógica pura, probada en Node. |
| `js/carro.js` | El sedán, pieza por pieza, construido con perfiles extruidos. Cada pieza es un objeto aparte con su propio material. Sin DOM: también se construye en Node para probarlo. |
| `js/toque.js` | Qué pieza hay bajo el dedo: rayo central más un anillo de ocho para que estribos y espejos se dejen tocar. Sin DOM, probado con la cámara y el carro reales. |
| `js/visor.js` | Escena, luces, cámara, giro con el dedo, el toque que marca, la lista y el botón de enviar. |
| `js/vendor/` | Three.js 0.169 copiado de npm (tres archivos). No se edita. Así la app no depende de internet ni de que cambie la versión. |
| `herramientas/servidor.js` | Servidor estático sin dependencias; los módulos de JavaScript no cargan desde `file://`. |
| `pruebas/` | `estado.test.js` (lógica), `carro.test.js` (17 piezas, medidas de sedán, simetría, accesorios que asoman, interior que no atraviesa el vidrio) y `toque.test.js` (el dedo sobre el estribo y el espejo). |

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

## Plan, con fechas

Las fechas asumen que las decisiones de la sección siguiente están tomadas
el lunes 19.

| Cuándo | Qué | Qué puede hacer el taller al terminar |
|---|---|---|
| **Jueves 15-oct** (hecho) | Visor: sedán por piezas, girar, tocar, enviar por WhatsApp. | Mandar una orden de pintura desde el celular. |
| **Lunes 19 a viernes 23-oct** | Registro por placa y marca; pantalla **Garaje** con todos los carros; fotos por pieza (cámara del celular, guardadas en el teléfono); estados por pieza: pendiente, en proceso, terminada. | Ver cualquier carro, abrir su 3D y saber qué se trabajó y qué está en curso. |
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
