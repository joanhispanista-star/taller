// Los modelos de catálogo hechos con la herramienta de carros en lote (fg-trabajo/lote, fuera del repo). ESTE ARCHIVO LO
// ESCRIBE LA HERRAMIENTA (integrar.mjs), entero cada vez: no se edita a mano. Lo que es cada campo lo dice MODELOS, en
// modelos-catalogo.js, que agrega estos al final de la suya.
//
// Lo que estos carros son, dicho claro: la forma sale de las siluetas de 2 a 8 fotos libres de un carro de esa línea, la foto se
// pega encima, y las piezas las propone la app y las corrige una persona sobre las fotos. De lado y de tres cuartos se ven como
// el carro; de frente y desde arriba, menos que la Captiva v2 (capó, techo y baúl van pintados del color de la lata).
export const MODELOS_DEL_LOTE = [
  {
    "marca": "Renault",
    "linea": "Logan II",
    "nombre": "Renault Logan II Intens 2020",
    "corto": "el Logan",
    "archivo": "modelos/renault-logan-ii-2020.glb",
    "megas": 4.45,
    "piezas": 17,
    "miniatura": "vehiculos/renault-logan-ii-2020.jpg",
    "sha256": "96734cc4da255d9ed21d53e72c6e048a4b2a39377cd0f4b03dffb14ea36e7e53",
    "aviso": "Los de antes de 2020 tienen otra trompa.",
    "colorFoto": 6710117,
    "credito": {
      "autor": "Autosdeprimera",
      "licencia": "CC BY 3.0",
      "enlaceLicencia": "https://creativecommons.org/licenses/by/3.0/",
      "fuente": "Wikimedia Commons",
      "cambios": "pegadas sobre una forma 3D sacada de sus siluetas, con la placa tapada",
      "marcaDe": "Renault es marca de Renault s.a.s.",
      "fotos": [
        {
          "nombre": "2020 Renault Logan Intens (Colombia) rear view.png",
          "enlace": "https://commons.wikimedia.org/wiki/File:2020_Renault_Logan_Intens_(Colombia)_rear_view.png"
        },
        {
          "nombre": "2020 Renault Logan Intens (Colombia) side view.png",
          "enlace": "https://commons.wikimedia.org/wiki/File:2020_Renault_Logan_Intens_(Colombia)_side_view.png"
        },
        {
          "nombre": "2020 Renault Logan Intens (Colombia) front view 01.png",
          "enlace": "https://commons.wikimedia.org/wiki/File:2020_Renault_Logan_Intens_(Colombia)_front_view_01.png"
        },
        {
          "nombre": "2020 Renault Logan Intens (Colombia) front view 02.png",
          "enlace": "https://commons.wikimedia.org/wiki/File:2020_Renault_Logan_Intens_(Colombia)_front_view_02.png"
        }
      ]
    }
  },
  {
    "marca": "Chevrolet",
    "linea": "Spark GT",
    "nombre": "Chevrolet Spark GT 1LS 2014",
    "corto": "la Spark",
    "archivo": "modelos/chevrolet-spark-gt-2014.glb",
    "megas": 3.66,
    "piezas": 17,
    "miniatura": "vehiculos/chevrolet-spark-gt-2014.jpg",
    "sha256": "2aa1174fd799a854bd0eeb3361b9ca9f2374ef2603dc70830c457dc525f452c0",
    "aviso": "Hecho con fotos de una Spark de Estados Unidos (2014): la trompa de la colombiana puede cambiar en detalles.",
    "colorFoto": 9799779,
    "credito": {
      "autor": "NHTSA (National Highway Traffic Safety Administration, EE. UU.)",
      "licencia": "Dominio público (obra del gobierno de EE. UU.)",
      "enlaceLicencia": "https://www.nhtsa.gov/about-nhtsa/terms-use",
      "fuente": "Wikimedia Commons",
      "cambios": "pegadas sobre una forma 3D sacada de sus siluetas",
      "marcaDe": "Chevrolet es marca de General Motors",
      "fotos": [
        {
          "nombre": "2014 Chevrolet Spark 1LS -- NHTSA test 8465 - front.jpg",
          "enlace": "https://commons.wikimedia.org/wiki/File:2014_Chevrolet_Spark_1LS_--_NHTSA_test_8465_-_front.jpg"
        },
        {
          "nombre": "2014 Chevrolet Spark 1LS -- NHTSA test 8465 - rear.jpg",
          "enlace": "https://commons.wikimedia.org/wiki/File:2014_Chevrolet_Spark_1LS_--_NHTSA_test_8465_-_rear.jpg"
        }
      ]
    }
  }
];
