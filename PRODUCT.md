# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Cliente del parqueadero (kiosco).** Persona que va a salir con su vehículo y paga sola, de pie, frente a un monitor táctil vertical de 27" (1080×1920) instalado a la intemperie: de día le da el sol, de noche es la única luz del lugar. Suele tener prisa y no conoce el sistema.
- **Administrador del parqueadero.** Dueño o encargado de un parqueadero. Consulta desde un PC, bajo techo: qué hay adentro, qué pasó, cómo van las cajas, cuánto cobró el kiosco, y descarga reportes en Excel.
- **Super administrador (Quikly).** Configura la plataforma: parqueaderos, usuarios, kioscos, credenciales de Redeban y SIIGO.

## Product Purpose

Quikly Parking es la capa web de autenticación, consulta, cobro y administración sobre Nova Parking, el sistema existente del parqueadero (Django, expuesto por Cloudflare Tunnel). El kiosco deja que el cliente pague su parqueo con tarjeta sin cajero; el panel deja al administrador ver su parqueadero sin entrar a Nova Parking. Éxito: el cliente sale pagado y con su comprobante en menos de un minuto, y el administrador entiende su operación de un vistazo.

## Positioning

No reemplaza ni recalcula nada del parqueadero: el valor a cobrar siempre lo calcula Nova Parking; Quikly lo muestra, lo cobra en el datáfono (Redeban vía SIPConnector), lo confirma de vuelta y lo factura en SIIGO.

## Operating Context

- Flujo del kiosco: elegir vehículo (carro, moto, patineta, bicicleta) → escribir placa o código del tiquete (o escanear su QR) → confirmar el vehículo con la foto de entrada → documento del cliente (y datos si es nuevo) → total → pagar con tarjeta en el datáfono (hay que pulsar "Iniciar cobro" en el aparato) → resultado, comprobante impreso o en pantalla.
- El kiosco cambia solo entre tema de día (claro) y de noche (oscuro) según la hora, con un botón para forzarlo.
- El panel del administrador es de solo lectura sobre Nova Parking; las fotos de entrada llegan por `/api/parking/ticket/<id>/foto/` del túnel, con token (desde el 2026-10-09).
- Un parqueadero puede tener varios kioscos, cada uno con su datáfono, impresora y usuario.

## Capabilities and Constraints

- Pago **solo con tarjeta** en el kiosco. No hay selección de método de pago, ni cupones, ni tarifa por hora visible (Nova Parking no la expone).
- La placa colombiana lleva letras y números: el teclado del kiosco debe tener los dos.
- No hay botón de reimprimir comprobante (kiosco sin vigilancia); no hay forma de "llamar al operador".
- Montos nunca desde el navegador; idempotencia en cada cobro; aislamiento estricto entre parqueaderos.
- Stack existente: Next.js 15 (App Router), React 19, Tailwind 4, Prisma + Supabase Postgres, Vercel; producción en https://parking.quiklygo.com.

## Brand Commitments

- Nombre: **Quikly Parking**, línea de negocio de Quikly.
- Color oficial de la línea Parking: **amarillo #F7B500** (documento "LOGO PARKING COLORIMETRIA"). Pedido explícito del dueño (Fabián): la plataforma usa solo amarillo, blanco y negro; nada de morado.
- Tipografía institucional en digital: Poppins (Manual de Marca Quikly).
- Logo con la "Q" y el trazo amarillo, en versión positiva (texto negro) y negativa (texto blanco).
- Referencia visual aprobada por el dueño: `../Paleta de colores.jpeg` (8 pantallas del kiosco). Se toma el estilo, no las funciones que no existen (método de pago, cupón, tarifa, reimprimir, llamar al operador).

## Evidence on Hand

- Logos: `public/quikly-parking.png` (negativo), `../Nuevos logos e iconos/` (positivo y negativo, isotipo).
- Foto del sedán para la bienvenida: `../Sedán plateado moderno en estudio.png` (generada con IA, fondo blanco).
- Íconos de vehículos: `../Íconos negros de transporte minimalista.png` (generados con IA, 2×2, negro sobre blanco).
- Foto del datáfono con "Iniciar cobro" señalado: `public/datafono-iniciar-cobro.jpg`.
- No hay testimonios, cifras de negocio ni clientes que mostrar; no inventarlos.

## Product Principles

1. El kiosco se entiende de pie, a medio metro, con sol: grande, alto contraste, una sola decisión por pantalla.
2. El parqueadero manda sobre los datos: lo que muestra Quikly sale de Nova Parking tal cual.
3. Nunca dejar al cliente sin saber qué hacer: cada estado (buscando, esperando el datáfono, error) dice el siguiente paso.
4. El administrador lee, no opera: claridad y orden (lo más reciente primero) por encima de adorno.

## Accessibility & Inclusion

Kiosco público: contraste alto en ambos temas (legible a pleno sol), objetivos táctiles grandes, texto que no dependa solo del color, y respeto de "reducir movimiento".
