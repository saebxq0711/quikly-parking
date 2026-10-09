---
version: 1
slug: "src-components-pos-pos-flow-tsx"
primary_target: "src/components/pos/pos-flow.tsx"
related_targets: ["src/app/p/[slug]/pos/page.tsx","src/app/globals.css"]
---

# Kiosco de pago (punto de pago) — rediseño amarillo, blanco y negro

## Alcance y modo
Operate. Todas las pantallas del kiosco (`/p/[slug]/pos`, `/p/[slug]/pos/impresora`) a 1080×1920 vertical, y el recoloreado del panel admin y superadmin (claro con barra lateral negra). Solo visual: misma funcionalidad.

## Tarea, estados, restricciones
Cliente de pie, con prisa, a pleno sol o de noche. Estados: elegir vehículo, escribir placa/código (letras y números), confirmar con foto, documento/datos, total, esperar datáfono (foto de "Iniciar cobro"), procesando, aprobado, rechazado, no encontrado. Sin cupón, sin método de pago, sin tarifa, sin reimprimir, sin "llamar al operador".

## Direction contract

THESIS: El kiosco es señalética de parqueadero, no una app de pagos: un panel blanco por decisión, el amarillo Parking marca el único paso siguiente y los datos que importan (placa, total) se leen a escala de letrero. Rechaza la pantalla de pago genérica con tarjetas grises y botones de colores.

OWN-WORLD: Blanco (#FFFFFF) y negro (#0B0B0B), amarillo #F7B500 solo en la acción principal, la selección y el total; grises neutros fríos para mosaicos (#F3F3F1). Poppins negra/semibold. Mosaicos de esquina amplia (28px), botón píldora amarillo con texto negro, franja curva amarilla en la esquina inferior, sedán plateado recortado en la bienvenida, íconos sólidos negros. Noche: negro con los mismos amarillos.

STORY: El cliente ve "Bienvenido", toca su vehículo, escribe la placa, reconoce su carro, ve el total enorme sobre amarillo pálido, toca Pagar, sigue la foto del datáfono y sale con su comprobante.

FIRST VIEWPORT: Arriba el logo Quikly Parking a la izquierda, parqueadero y luna a la derecha. "Bienvenido" monumental centrado al 30% de alto; debajo, rejilla 2×2 de mosaicos de vehículo de ~420px, el seleccionado/hover en amarillo. En el tercio inferior, el sedán plateado saliendo por la esquina derecha sobre la franja amarilla.

FORM: Mundo fijado por la referencia aprobada del dueño (`../Paleta de colores.jpeg`), que manda sobre el sorteo; disciplina donada por el retador "señalética amarilla de aeropuerto": amarillo reservado al siguiente paso, cifras monumentales, una decisión por pantalla. Seed 062b98fd.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
