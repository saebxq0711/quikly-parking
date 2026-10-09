---
name: Quikly Parking
description: Kiosco de pago y panel de parqueaderos en amarillo Parking, blanco y negro.
colors:
  parking-yellow: "#f7b500"
  parking-yellow-hover: "#ffc524"
  parking-yellow-pressed: "#db9c00"
  parking-yellow-wash: "#fff2c7"
  parking-yellow-edge: "#ffd44d"
  money-wash: "#fff6d6"
  sign-black: "#0b0b0b"
  sign-black-hover: "#262624"
  paper-white: "#ffffff"
  workspace-grey: "#f5f5f2"
  tile-grey: "#f1f1ee"
  tile-grey-hover: "#e8e8e4"
  line-grey: "#e2e2de"
  text-secondary: "#45453f"
  text-muted: "#66665f"
  chrome-text-muted: "#a3a39e"
  night-raised: "#161615"
  night-tile: "#1a1a18"
  night-text: "#f7f7f5"
  night-text-secondary: "#c4c4be"
  result-green: "#1f9d55"
  result-green-text: "#16803f"
  result-green-wash: "#eaf7ee"
  result-red: "#c02626"
  result-red-text: "#9b1c1c"
  result-red-wash: "#fdecec"
  caution-orange: "#e8780c"
  caution-orange-text: "#9a4a05"
  caution-orange-wash: "#ffe7cc"
typography:
  kiosk-figure:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  kiosk-plate:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.4rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.14em"
    fontFeature: "'tnum' 1"
  display:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  kiosk-action:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 700
    lineHeight: 1.2
  kiosk-body:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.375
  title:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  directory-title:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  badge:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  micro:
    fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  key: "0.9rem"
  kiosk-button: "1.1rem"
  kiosk-card: "1.4rem"
  kiosk-tile: "1.6rem"
  control: "0.75rem"
  card: "1rem"
  pill: "9999px"
spacing:
  kiosk-step-gap: "2rem"
  kiosk-tile-gap: "1.25rem"
  kiosk-edge: "2rem"
  card-x: "20px"
  card-y: "16px"
  workspace-sm: "16px"
  workspace-md: "24px"
  workspace-lg: "40px"
components:
  kiosk-button-primary:
    backgroundColor: "{colors.parking-yellow}"
    textColor: "{colors.sign-black}"
    typography: "{typography.kiosk-action}"
    rounded: "{rounded.kiosk-button}"
    padding: "0 2rem"
    height: "4.6rem"
  kiosk-button-primary-hover:
    backgroundColor: "{colors.parking-yellow-hover}"
  kiosk-button-primary-active:
    backgroundColor: "{colors.parking-yellow-pressed}"
  kiosk-button-secondary:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.kiosk-button}"
    padding: "0 1.5rem"
    height: "4.6rem"
  kiosk-tile:
    backgroundColor: "{colors.tile-grey}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.kiosk-tile}"
  kiosk-tile-hover:
    backgroundColor: "{colors.tile-grey-hover}"
  kiosk-tile-selected:
    backgroundColor: "{colors.parking-yellow}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.kiosk-tile}"
  total-block:
    backgroundColor: "{colors.money-wash}"
    textColor: "{colors.sign-black}"
    typography: "{typography.kiosk-figure}"
    rounded: "{rounded.kiosk-card}"
    padding: "1.5rem 1.75rem"
  info-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.kiosk-card}"
  plate-field:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.sign-black}"
    typography: "{typography.kiosk-plate}"
    rounded: "{rounded.kiosk-card}"
    height: "6.2rem"
  key-letter:
    backgroundColor: "{colors.tile-grey}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.key}"
    height: "3.5rem"
  key-pressed:
    backgroundColor: "{colors.parking-yellow}"
    textColor: "{colors.sign-black}"
  button-primary:
    backgroundColor: "{colors.parking-yellow}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.parking-yellow-hover}"
  button-confirm:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-confirm-hover:
    backgroundColor: "{colors.sign-black-hover}"
  button-secondary:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.card}"
  stat-accent:
    backgroundColor: "{colors.money-wash}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.card}"
    padding: "20px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.sign-black}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  nav-item:
    textColor: "{colors.chrome-text-muted}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  nav-item-active:
    backgroundColor: "{colors.parking-yellow}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  badge-in-progress:
    backgroundColor: "{colors.parking-yellow-wash}"
    textColor: "{colors.sign-black}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-approved:
    backgroundColor: "{colors.result-green-wash}"
    textColor: "{colors.result-green-text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-declined:
    backgroundColor: "{colors.result-red-wash}"
    textColor: "{colors.result-red-text}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  button-panel-sm:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  filter-chip:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  filter-chip-active:
    backgroundColor: "{colors.sign-black}"
    textColor: "{colors.paper-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  avatar:
    textColor: "{colors.sign-black}"
    rounded: "{rounded.pill}"
    size: "40px"
---

# Design System: Quikly Parking

## Overview

**Creative North Star: "Señalética de parqueadero"**

Quikly Parking se lee como un letrero de parqueadero, no como una app de pagos. Tres tintas y nada más: blanco, negro y el amarillo Parking (#F7B500 de la colorimetría oficial). El blanco es el panel por decisión, el negro es el texto y el marco, y el amarillo no decora: señala el único paso siguiente (el botón que hay que tocar, el vehículo elegido, la sección activa) y el dinero (el total). Si todo fuera amarillo, el cliente no sabría dónde tocar.

El kiosco (monitor táctil vertical de 27", 1080×1920, de pie y a pleno sol) trabaja a escala de letrero: una decisión por pantalla, placa y total con cifras monumentales y tabulares, objetivos táctiles de 4.6rem de alto, mosaicos grises de esquina amplia y la franja curva amarilla del logo apoyada en la esquina inferior. De noche el mismo kiosco invierte el fondo a negro casi puro y conserva el mismo amarillo. El panel de administración y superadmin habla el mismo vocabulario con más densidad: área de trabajo gris muy clara, tarjetas blancas de sombra suave, barra lateral negra con el logo negativo y la sección activa como píldora amarilla.

Los grises son neutros de verdad, sin tinte: la marca ya pone el color, y un gris tibio al lado del amarillo se ve sucio. Rojo y verde existen solo como resultado; el naranja de advertencia está lejos del amarillo a propósito.

**Key Characteristics:**
- Tres tintas: blanco, negro (#0b0b0b) y amarillo Parking; estados de resultado aparte.
- El amarillo marca el siguiente paso, la selección y el dinero; nunca es fondo de adorno ni color de texto.
- Cifras a escala de letrero con números tabulares (placa, total, cifras del panel).
- Esquinas amplias y suaves; botones de kiosco anchos, botones del panel en píldora.
- Profundidad casi plana: mosaicos planos, tarjetas con sombra ambiental muy ligera.
- Un tema noche que existe solo en el kiosco.

## Colors

Una sola tinta de marca sobre blanco y negro neutros, con verde, rojo y naranja reservados a resultados y avisos.

### Primary
- **Amarillo Parking** (parking-yellow): el color exacto de la colorimetría de la línea Parking. Relleno de la acción principal (botón Pagar, Consultar, Continuar, Entrar), del mosaico de vehículo elegido, de la tecla pulsada, de la píldora de tipo de vehículo junto a la placa, de la sección activa de la navegación y del arco de espera del datáfono. Escala completa de 50 a 900 en `globals.css` (`--color-brand-*`); hover sube un paso (parking-yellow-hover, 400) y la presión baja uno (parking-yellow-pressed, 600).
- **Amarillo dinero** (money-wash): amarillo pálido del bloque "Total a pagar" y de la cifra principal (`Stat` en tono accent) de cada pantalla del panel. Borde `rgb(247 181 0 / 0.45)`. De noche pasa a `rgb(247 181 0 / 0.12)`.
- **Amarillo lavado** (parking-yellow-wash con borde parking-yellow-edge): insignias de estado en curso ("En el datáfono", "Procesando", "Adentro"), siempre con texto negro.

### Neutral
- **Negro letrero** (sign-black): todo el texto principal, el texto sobre amarillo, la barra lateral y la cabecera móvil del panel (`--surface-chrome`), el botón `confirm` y el anillo de foco del tema claro.
- **Blanco panel** (paper-white): fondo del kiosco de día, tarjetas, campos y botones secundarios.
- **Gris área de trabajo** (workspace-grey): fondo del área de contenido del panel, sobre el que se despegan las tarjetas blancas; también el fondo de los correos.
- **Gris mosaico** (tile-grey, hover tile-grey-hover): mosaicos de vehículo no elegidos, teclas de letra, bandeja de los números y el estado "esperando" del kiosco.
- **Línea** (line-grey en sólido; `rgb(11 11 11 / 0.08)` y `/0.16` como `--line-subtle`/`--line-strong`): divisores y bordes finos de tarjeta.
- **Texto secundario** (text-secondary) y **texto atenuado** (text-muted): subtítulos, etiquetas de dato, pistas. Sobre la barra negra, el texto atenuado es chrome-text-muted.
- **Superficies de noche** (night-raised, night-tile, texto night-text y night-text-secondary): solo bajo `data-theme="night"`; fondo `#0b0b0b`, grises de texto claros de verdad porque la pantalla es la única luz.

### Estados (solo resultados y avisos)
- **Verde resultado** (result-green, texto result-green-text, lavado result-green-wash): pago aprobado, chulito del vehículo encontrado, pasos completados del datáfono, insignia "Aprobado".
- **Rojo resultado** (result-red, texto result-red-text, lavado result-red-wash): pago rechazado, placa no encontrada, errores, botón `danger`.
- **Naranja advertencia** (caution-orange, texto caution-orange-text, lavado caution-orange-wash): avisos que piden atención (cobro en curso, sin conexión con el parqueadero, expirado, anulado). Tono a ~30° del amarillo y más oscuro: no se confunden.

### Named Rules
**The Texto Negro Rule.** Sobre amarillo el texto y los íconos son siempre negros (`#0b0b0b`, ~11:1). Blanco sobre #F7B500 da 1,9:1 y no se usa nunca, ni en botones, ni en insignias, ni en el Excel.

**The Amarillo No Es Tinta Rule.** El amarillo no se usa como color de texto sobre blanco. Cuando un texto tiene que ser "de marca" (enlaces del panel y del ingreso) va en negro con subrayado amarillo de 2px separado 4px; en hover el subrayado pasa a negro.

**The Siguiente Paso Rule.** El amarillo sólido vive solo en la acción principal (una por pantalla), la selección y la navegación activa; el amarillo pálido, solo en el dinero (un bloque o una cifra accent por pantalla). Un amarillo apagado parece tocable, así que un botón principal deshabilitado pierde el amarillo y pasa a `--fill-strong` con texto atenuado.

**The Guardar En Negro Rule.** En una pantalla con varios formularios (la ficha de un parqueadero), cada "Guardar" va en `confirm` negro con texto blanco; el amarillo sólido queda para la única acción principal de la pantalla (Nuevo parqueadero, Nuevo usuario, Crear parqueadero). Un amarillo por formulario deja de decir cuál es la acción principal.

**The Preparación Rule.** Lo que está listo o falta en un sitio habla con dos tonos y siempre con su ícono: verde resultado con chulito para listo, naranja advertencia con admiración para lo que falta. Nunca amarillo: un punto pendiente en amarillo parece un botón.

**The Resultado Rule.** Verde y rojo solo dicen aprobado o rechazado; nunca adornan, nunca marcan selección. El naranja de advertencia no sustituye al amarillo ni el amarillo al naranja.

**The Noche Del Kiosco Rule.** El tema noche (`data-theme="night"`) existe solo en el kiosco. Invierte fondos y grises por variables; el amarillo es el mismo; el foco pasa de negro a amarillo; los tonos de estado suben de paso con la variante `night:` (un verde que se lee sobre blanco desaparece en negro). Admin, superadmin, ingreso y correos son siempre claros.

**The Logo Rule.** Logo positivo (texto negro) sobre fondo claro, negativo (texto blanco, trazo amarillo) sobre negro: la barra lateral y la cabecera del panel usan el negativo; el kiosco alterna entre los dos según el tema.

## Typography

**Display Font:** Poppins (con ui-sans-serif, system-ui)
**Body Font:** Poppins
**Label/Mono Font:** Poppins con números tabulares (`.tnum`); el comprobante impreso usa ui-monospace sobre papel térmico.

**Character:** Una sola familia geométrica, la institucional de Quikly. La jerarquía sale del peso (bold para títulos y cifras, semibold para acciones secundarias y etiquetas de mosaico) y del tamaño, nunca de una segunda familia.

### Hierarchy
- **Cifra de kiosco** (700, 3.6rem, 1, -0.03em, tabular): el total a pagar, con "COP" en 1.6rem semibold al lado. La placa en la cabecera de la tarjeta va en 2.3rem con +0.04em.
- **Placa escrita** (700, 3.4rem, +0.14em, tabular): el campo de placa o código y el documento; el espaciado abierto separa cada carácter como en una placa real.
- **Display** (700, 2.6rem, 1.05, -0.03em): títulos de paso del kiosco ("Bienvenido", "Placa del vehículo"), centrados y con `text-balance`.
- **Headline** (700, 1.75rem, -0.02em): título de página del panel. La cifra `Stat` del panel va en 2rem bold tabular.
- **Acción de kiosco** (700, 1.45rem): botón principal del kiosco; el secundario baja a 1.2rem semibold y las etiquetas de mosaico a 1.65rem semibold.
- **Cuerpo de kiosco** (400, 1.25rem, 1.375): subtítulos de paso, máximo 32rem de ancho; los datos de `InfoRow` en 1.125rem.
- **Title** (600, 15px): títulos de tarjeta del panel (14px en tarjetas con tabla).
- **Body** (400, 14px, 1.625): descripciones del panel, máximo 42rem.
- **Título de sitio** (directory-title, 700, 20px, -0.01em): el nombre de cada parqueadero en la cabecera de su bloque del directorio.
- **Label** (500, 13px): etiquetas de campo, cabeceras de tabla, botones y filtros pequeños, navegación e índice de secciones (13.5px semibold).
- **Badge** (500, 12px): insignias de estado (`StatusBadge`, estado del sitio) y conteos tabulares junto a un título ("Equipo 2", "Todos 4").
- **Micro** (600, 11px): insignias densas dentro de tarjetas (estado de Redeban, datáfono, impresora) e iniciales del avatar pequeño; los chips de fila ("Tu cuenta", "Sesión abierta") lo usan en 500.

### Named Rules
**The Letrero Rule.** Lo que el cliente tiene que leer para decidir (placa, total) se escribe a escala de letrero y con números tabulares; toda cifra que se actualiza lleva `tnum` para que no baile.

**The Once Píxeles Rule.** 11px solo vive dentro de una píldora o un círculo (insignia, chip, iniciales); nunca en un párrafo ni en una pista de campo. El texto corrido del panel no baja de 12px.

**The Raíz Que Crece Rule.** El kiosco se dimensiona en `rem` y crece agrandando la raíz solo donde existe `.kiosk-root`: 21px en vertical desde 820×1150, 25px en vertical desde 1000×1500 (el monitor de 27"), 20px en horizontal desde 1700×950. Nada del kiosco se fija en px.

## Layout

**Kiosco.** Una columna centrada de 36rem (38rem en la bienvenida) sobre el alto completo de la pantalla. Cada paso (`KioskStep`) centra su contenido en vertical con 2rem entre bloques y deja abajo la fila de "Atrás"; así el monitor vertical no amontona todo arriba. Cabecera de 2rem de margen lateral: logo a la izquierda, parqueadero y botón de tema a la derecha. La bienvenida coloca el título al ~6vh, una rejilla 2×2 de mosaicos con 1.25rem de separación y, en el tercio inferior, la escena del sedán plateado recortado por el borde derecho sobre la franja amarilla. En horizontal manda la altura: las variantes `kland:` (alto ≤ 860px) abren la columna a 64rem, pasan la rejilla a 4 columnas y omiten la escena; `kshort:` (alto ≤ 660px) compacta tamaños.

**Panel.** Barra lateral negra fija de 16rem a la altura de la pantalla desde `lg`; bajo `lg`, cabecera negra pegajosa en dos filas (marca y cuenta arriba, navegación en píldoras con desplazamiento lateral abajo). El área de trabajo es gris claro con relleno 16px / 24px / 40px según ancho. Tarjetas de una sola profundidad: no se anidan paneles dentro de paneles. Cabeceras de tarjeta con 20px × 16px y divisor fino.

**Directorio y ficha (superadmin).** El directorio apila un bloque por sitio a ancho completo (24px entre bloques): cabecera con 24px de relleno, el riel de preparación debajo y, desde `md`, dos columnas separadas por un divisor (Equipo y Kioscos), cerrando con una franja de pie en `--fill-soft`. La ficha usa una rejilla de dos columnas desde `lg` (índice de 13.5rem y contenido), con el índice pegajoso a 2rem del borde superior; bajo `lg` el índice pasa a una franja de píldoras desplazable de lado y NO pegajosa, porque la cabecera negra del panel ya lo es. Cada sección de la ficha es una tarjeta anclada con `scroll-mt` de 2rem. Los formularios largos se parten en secciones: título y explicación en una columna de 15rem a la izquierda y los campos a la derecha (una sola columna bajo `lg`), con 28px de alto por sección y divisor fino entre ellas.

## Elevation & Depth

Casi plano, con una sombra ambiental suave para separar tarjetas blancas del gris de trabajo. Los mosaicos y teclas de letra son planos (se separan por tono); las teclas numéricas son blancas en relieve sobre una bandeja gris, para que el bloque de números se distinga del de letras por la superficie y no por un rótulo. De noche las sombras se oscurecen y el relieve lo dan las superficies `night-raised` y `night-tile`.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0 1px 2px rgb(11 11 11 / 0.05), 0 10px 28px -16px rgb(11 11 11 / 0.22)`): tarjetas del panel, `InfoCard` del kiosco y el calendario desplegable.
- **Elevada** (`box-shadow: 0 2px 4px rgb(11 11 11 / 0.06), 0 18px 40px -18px rgb(11 11 11 / 0.32)`): la tarjeta de ingreso, que flota sola sobre el blanco.
- **Tecla numérica** (`box-shadow: 0 1px 3px rgb(11 11 11 / 0.08)`): relieve mínimo de la tecla blanca sobre su bandeja.
- **Sedán** (`drop-shadow(0 18px 22px rgb(11 11 11 / 0.18))`): la sombra de suelo de la foto de bienvenida.

### Named Rules
**The Tono Antes Que Sombra Rule.** Lo que se toca en el kiosco se separa por tono (gris mosaico sobre blanco, amarillo cuando está elegido), no por sombra. La sombra es ambiental y solo despega tarjetas de datos.

## Shapes

Esquinas amplias y suaves en todo el sistema, más amplias cuanto más grande y más táctil es la pieza: mosaico de vehículo (1.6rem), tarjetas, total y campo de placa del kiosco (1.4rem), botones de kiosco (1.1rem), teclas (0.9rem); en el panel, tarjetas (1rem), campos, avisos y elementos de navegación (0.75rem) y botones e insignias en píldora completa. El foco es un contorno de 2px por fuera del control, separado 3px, con radio 0.6rem.

La forma de firma es **la franja**: el trazo curvo amarillo que subraya la "Q" del logo, dibujado como un cuarto de anillo con las puntas sesgadas y coloreado por `currentColor`. Vive siempre en una esquina inferior, recortada por el borde de la pantalla (12rem en los pasos y también en el ingreso). En la bienvenida (`welcome-scene.tsx`) son dos cuartos de anillo geométricos, cada uno centrado en su esquina inferior y con ambos extremos escondidos en los bordes: el izquierdo (16.8rem, grosor 36 %) bajo el frente del sedán y el derecho (24.5rem, grosor 25 %) tapado por el carro, del que solo asoma el arco sobre el techo. El sedán va a 50rem de ancho, cortado por la derecha y por abajo, entra deslizándose una sola vez y nunca va detrás de texto ni de un control.

Los íconos de vehículo son siluetas negras macizas de trazo redondeado, del mismo juego y la misma caja (560×560), pintadas como máscara CSS: la forma la pone la imagen y el color `currentColor`, así que el mismo ícono va negro en el mosaico, negro sobre amarillo y blanco de noche. El resto de la iconografía es Material Symbols (`react-icons/md`) en todo el producto.

### Named Rules
**The Trazo En El Borde Rule.** La franja amarilla es marca, no contenido: solo en un borde inferior, recortada por la pantalla; una por vista, salvo la bienvenida, que lleva una a cada lado del sedán como la referencia.

## Components

### Buttons
Anchos, firmes, de un solo vocabulario: si el botón de guardar se ve distinto en dos pantallas, una de las dos está mal.
- **Shape:** kiosco con esquina amplia (1.1rem), ancho completo y 4.6rem de alto; panel en píldora (44px en `md`, 32px en `sm`, 52px en `lg`).
- **Primary:** amarillo Parking con texto negro bold. Hover sube a parking-yellow-hover, presión a parking-yellow-pressed y escala 0.985 en el kiosco. Deshabilitado: sin amarillo, `--fill-strong` con texto atenuado.
- **Secondary:** blanco con anillo interior (2px en kiosco, 1px en panel) de `--ring-soft` que pasa a `--ring-strong` en hover; mismo alto que el principal.
- **Confirm:** negro con texto blanco en claro, amarillo con texto negro de noche. Es el guardar de toda pantalla con varios formularios (ver The Guardar En Negro Rule), con su "Cancelar" o acción secundaria al lado; en 32px es también la acción de una fila ("Atender").
- **Pequeño (sm, 32px):** píldora de 13px semibold para acciones de fila y de tarjeta ("Configurar", "Editar", "Gestionar", "Probar conexión"); casi siempre secundario.
- **Ghost / Danger:** ghost sin fondo con texto secundario; danger en rojo resultado con texto blanco, solo para acciones destructivas.
- **Atrás:** en el kiosco no es botón sino enlace quieto abajo a la izquierda (flecha + "Atrás", 1.25rem semibold), con fondo `--fill-soft` solo en hover.

### Mosaico de vehículo (firma del kiosco)
- **Estilo:** proporción 1.22, esquina 1.6rem, ícono de vehículo de 4.4rem sobre etiqueta 1.65rem semibold.
- **Estados:** los cuatro iguales en reposo (gris mosaico), ninguno preseleccionado; hover amarillo Parking con texto negro; al pulsar, amarillo más oscuro con escala 0.97, y el elegido se queda amarillo 180 ms antes de avanzar.

### Total a pagar
Bloque amarillo dinero con borde amarillo translúcido, esquina 1.4rem, etiqueta 1.25rem medium y la cifra de kiosco debajo. El mismo tratamiento, más denso, es la `Stat` accent del panel: una por pantalla.

### Cards / Containers
- **Corner Style:** 1.4rem en el kiosco, 1rem en el panel.
- **Background:** blanco panel (night-raised de noche).
- **Shadow Strategy:** sombra de tarjeta (ver Elevation & Depth).
- **Border:** anillo de 1px `--line-subtle`.
- **Internal Padding:** kiosco 1.75rem × 1.25rem en la cabecera de placa; panel 20px × 16px en cabeceras.
- **Cabecera de placa:** la placa a 2.3rem bold a la izquierda y la píldora amarilla del tipo de vehículo (ícono + etiqueta, texto negro) a la derecha, sobre un divisor fino. Filas de datos con etiqueta secundaria a la izquierda y valor semibold tabular a la derecha.

### Inputs / Fields
- **Style:** blanco con anillo interior de 1px `--ring-soft`, esquina 0.75rem, 14px; etiqueta 13px medium encima.
- **Focus:** el anillo pasa a 2px en negro (texto primario). El campo de placa del kiosco es la excepción: 6.2rem de alto, anillo de 2px y foco en amarillo Parking.
- **Error / Disabled:** mensaje en rojo resultado bajo el campo; deshabilitado al 60% con texto atenuado. El cursor de escritura es parking-yellow-pressed.

### Teclado del kiosco
Dos bloques que se distinguen por superficie: números como teclas blancas en relieve sobre una bandeja gris (esquina 1.2rem), letras como teclas grises planas sobre el blanco de la pantalla, en QWERTY con el escalonado real. Toda tecla pulsada se enciende en amarillo con texto negro y escala 0.96. "Borrar todo" y "Borrar" quedan aparte, fuera de los dos bloques.

### Navigation
- **Panel:** barra negra (`--surface-chrome`) con el logo negativo, una caja de contexto `white/6%`, ítems de 13.5px semibold con ícono Material de 18px en gris de barra; hover `white/10%` con texto blanco; activo como píldora amarilla Parking con texto negro, el único amarillo de la barra.
- **Móvil:** la misma navegación en píldoras horizontales desplazables dentro de la cabecera negra.
- **Barra de progreso:** línea amarilla de 2px fija arriba durante la navegación.

### Avisos e insignias
Avisos en lavado de su tono con anillo translúcido y texto del paso oscuro (rojo para errores, naranja para lo que pide atención); el aviso informativo usa el amarillo dinero con texto negro. Insignias de estado en píldora 12px medium: gris para pendiente o cancelado, amarillo lavado con texto negro para en curso, verde, rojo o naranja para el resultado.

### Riel de preparación (firma del superadmin)
Seis puntos en fila que se envuelve (Empresa, Sistema, Kioscos, Datáfono, Facturación, Equipo), cada uno una píldora de 12.5px medium que enlaza con su sección exacta de la ficha. A la izquierda de cada etiqueta, un círculo de estado de 20px: listo es lavado verde con chulito verde y anillo verde translúcido, sobre una píldora blanca de anillo `--line-subtle` y texto secundario; pendiente es naranja advertencia sólido con admiración blanca, sobre una píldora de lavado naranja (caution-orange-wash al 60 %) con anillo naranja translúcido y texto caution-orange-text. El índice de la ficha repite exactamente los mismos círculos y el mismo estado.

### Estado del sitio
Insignia en píldora de 12px medium junto al nombre del sitio y en la cabecera de su ficha: "Listo para operar" en lavado verde con chulito, "Falta 1 punto" / "Faltan N puntos" en naranja con admiración, "Inactivo" en gris. Dentro de cada tarjeta de la ficha, una insignia micro de 11px semibold con punto de 6px dice el estado de esa sección ("Listo", "Completos", "1 activo", o lo que falta).

### Índice de secciones
En escritorio, una lista vertical pegajosa de ítems de 13.5px con su círculo de estado; la sección que se está leyendo se marca como píldora blanca con sombra de tarjeta y texto semibold (no amarillo: el amarillo de la vista ya es la navegación activa). En el celular, la misma lista como píldoras blancas con anillo, desplazable de lado.

### Bloque editable
Una sección lista se LEE: lista de dos columnas con etiqueta de 13px atenuada y valor de 14px medium (tabular si es número, código o fecha), y debajo un "Editar" secundario pequeño con ícono de lápiz. Al abrirla, el formulario aparece en el mismo lugar con "Cerrar sin guardar" en ghost. Una sección pendiente llega ya abierta. Un dato que falta se escribe "Falta" en caution-orange-text.

### Directorio de personas
Las personas se agrupan en tarjetas por sitio (y una de super administradores), con el título del grupo en 15px semibold, su conteo de 12px y un enlace de marca "Ver parqueadero". Cada fila: avatar, nombre en 14px semibold con sus chips, correo completo (nunca recortado) y rol con último ingreso en 13px atenuado. Encima: buscador en píldora de 44px y filtros de rol como chips de 36px, el elegido en negro con texto blanco y conteo al 70%.
- **Avatar:** círculo de 40px (32px en el directorio de parqueaderos) en gris `--fill-soft-hover` con dos iniciales semibold en negro; atenuado si la persona está inactiva. Las iniciales salen solo de palabras que empiezan por letra ("Administrador Parqueadero 122" da "AP"). Un usuario de kiosco lleva el ícono de punto de pago en el mismo círculo. Nunca fotos.
- **Gestionar:** las acciones de una persona no abren un modal: un botón pequeño "Gestionar" con chevron despliega un panel dentro de la propia fila (`--fill-soft`, esquina 0.75rem, anillo fino) con sus acciones. Solo una fila abierta a la vez; la propia cuenta lleva "Mi contraseña" en vez de "Gestionar".

### Aviso que espera respuesta
Cuando alguien está esperando algo (solicitudes de contraseña), el aviso va antes que todo lo demás de la pantalla: tarjeta de esquina 1rem en lavado naranja (caution-orange-wash al 60 %) con anillo naranja translúcido, círculo naranja sólido de 32px con ícono blanco, título en 15px semibold caution-orange-text y una fila por solicitud con "Atender" (confirm pequeño) y "Descartar" (secundario pequeño). Solo existe mientras hay solicitudes.

### Campos que faltan
En un sitio que ya existe, un campo obligatorio vacío lleva anillo naranja de 2px (caution-orange claro, más oscuro en hover) y una pista "Falta: va impreso en el comprobante." en caution-orange-text medium. Los ejemplos de los campos son honestos y empiezan por "Ej.:" ("Ej.: 900123456-7", "Ej.: Calle 15 # 10-20"); cuando no hay ejemplo honesto, la pista dice dónde encontrar el dato ("Como aparece en el RUT").

### Disco de resultado
Círculo de 6.4rem en el lavado del resultado con el glifo en su tono: verde con chulito que se dibuja (520ms), rojo con equis, naranja con admiración. Entra asentándose desde 0.82 de escala y 40% de opacidad, nunca desde la nada.

### Movimiento
Un solo momento de movimiento continuo en el kiosco: la espera del datáfono, un arco amarillo que orbita alrededor del ícono del pago (1.4s por vuelta). Todo lo demás entra quieto o casi quieto: el paso sube 10px en 260ms, la franja se desliza una vez en 700ms, el sedán llega rodando desde la derecha en 900ms. Curva de entrada `cubic-bezier(0.16, 1, 0.3, 1)`. "Reducir movimiento" lo apaga todo y deja el chulito ya dibujado.

### Documentos fuera de pantalla
- **Excel:** banda de título negra con texto blanco, encabezados de columna en amarillo Parking con texto negro, filas alternas y totales en amarillo al 10% (`#FFF8E1`), líneas `#E2E2DE`.
- **Correos:** siempre claros: fondo gris área de trabajo, tarjeta blanca de 16px de esquina con borde line-grey, botón amarillo Parking con texto negro (10px de esquina), total sobre amarillo dinero.
- **Comprobante impreso:** negro sobre blanco declarado a mano, monoespaciada, 72mm útiles.

## Do's and Don'ts

### Do:
- **Do** poner texto e íconos negros (#0b0b0b) sobre cualquier amarillo, en pantalla, en Excel y en correos.
- **Do** escribir los enlaces en negro con subrayado amarillo de 2px separado 4px, que pasa a negro en hover.
- **Do** reservar el amarillo sólido a una acción principal por pantalla, a la selección y a la navegación activa, y el amarillo pálido al dinero.
- **Do** quitar el amarillo a un botón principal deshabilitado (`--fill-strong` con texto atenuado).
- **Do** usar verde y rojo solo para aprobado y rechazado, y el naranja de advertencia (no el amarillo) para lo que pide atención.
- **Do** resolver colores por las variables de superficie (`--surface-*`, `--text-*`, `--fill-*`, `--ring-*`) para que la pieza funcione en el tema noche, y subir de paso los tonos de estado con `night:`.
- **Do** escribir el kiosco en `rem` y dejar que la raíz lo agrande en el monitor.
- **Do** llevar `tnum` en toda cifra: placa, total, montos, tablas.
- **Do** usar el logo positivo sobre claro y el negativo sobre negro.
- **Do** guardar en `confirm` negro cuando la pantalla tiene varios formularios, y dejar el amarillo a su única acción principal.
- **Do** decir listo y pendiente con verde y naranja más su ícono (chulito, admiración), y enlazar cada punto pendiente con el lugar donde se arregla.
- **Do** mostrar como resumen de solo lectura con "Editar" lo que ya está listo, y abierto lo que falta.
- **Do** gestionar una fila desplegándola en su sitio, no en un modal.
- **Do** marcar el campo obligatorio vacío con anillo naranja y "Falta", y escribir los ejemplos con "Ej.:".
- **Do** representar a las personas con dos iniciales en un círculo gris.

### Don't:
- **Don't** poner texto blanco sobre amarillo Parking (1,9:1).
- **Don't** usar el amarillo como color de texto sobre blanco.
- **Don't** usar el amarillo como fondo decorativo, ni repetir amarillo sólido en varias acciones de la misma pantalla.
- **Don't** usar verde o rojo para marcar selección, navegación o adorno.
- **Don't** acercar el naranja de advertencia al amarillo ni usar amarillo para advertir.
- **Don't** aplicar el tema noche fuera del kiosco: panel, ingreso y correos son claros.
- **Don't** usar grises con tinte cálido o frío visible junto al amarillo; los neutros son los de la escala `ink`.
- **Don't** colocar la franja amarilla detrás de texto o de un control, ni fuera de un borde inferior.
- **Don't** anidar tarjetas dentro de tarjetas en el panel.
- **Don't** volver a introducir el morado del sistema anterior.
- **Don't** usar amarillo para un estado pendiente ni para marcar la sección que se lee en el índice.
- **Don't** usar 11px fuera de una píldora o un círculo.
- **Don't** poner fotos ni ilustraciones de personas que no tenemos.
