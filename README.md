# Plataforma de Gestión y Pago de Parqueaderos

Capa web/cloud de autenticación, punto de pago, administración y facturación.

Es un **kiosco de autoservicio a la salida del parqueadero**: lo usa el propio
cliente, sin personal atendiéndolo. Se apoya en el sistema de parqueadero
existente para los tiquetes y las tarifas, **cobra directamente contra su propio
datáfono** (Redeban / SIPConnector) y factura en SIIGO.

## Puesta en marcha

Requisitos: Node 20+, Docker (para PostgreSQL).

```bash
npm install
docker compose up -d              # PostgreSQL en el puerto 5433

cp .env.example .env              # y completar los valores (ver abajo)
npm run db:migrate                # crea el esquema
npm run db:seed                   # crea el parqueadero y sus tres usuarios

npm run dev
```

Abrir <http://127.0.0.1:3000>.

Generar los dos secretos obligatorios del `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"  # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # CREDENTIALS_ENCRYPTION_KEY
```

### Usuarios iniciales

| Rol            | Correo                      | Entra a               |
| -------------- | --------------------------- | --------------------- |
| SuperAdmin     | `superadmin@puntodepago.co` | `/admin/parqueaderos` |
| Administrador  | `admin@parqueadero122.co`   | `/p/122/pagos`        |
| Punto de pago  | `caja@parqueadero122.co`    | `/p/122/pos`          |

Las contraseñas no se escriben aquí: este repositorio es público. El seed toma
las de `SEED_SUPERADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD` y `SEED_POS_PASSWORD`;
en local, si no están, genera unas al azar y las muestra al terminar. Las de la
web publicada se entregan por un canal privado.

### Qué falta configurar tras el primer arranque

Desde **Parqueaderos → ficha del sitio**:

1. **Sistema del parqueadero** — el dominio ya queda apuntando al túnel; falta
   el **token de acceso**, que lo entrega quien opera ese sistema. Ver
   [`docs/REQUERIMIENTOS_EDIER.md`](docs/REQUERIMIENTOS_EDIER.md).
2. **Datáfono** y **facturación** — quedan sembrados con los ambientes de
   pruebas y se reemplazan por los de producción desde la misma ficha.

Las tres tienen botón de **probar**, que dice si quedó bien o qué falla.

Las tres son **propias de cada parqueadero**: su sistema, su datáfono y su
empresa facturadora. Dos sitios no pueden facturar bajo el mismo NIT ni cobrar
por el mismo aparato, así que nada de esto vive en variables de entorno.

## Cómo se cobra

El datáfono está conectado por **serial** y no cobra solo: la orden queda puesta
y alguien tiene que iniciarla en el aparato. El punto de pago va diciendo en qué
etapa está, con los códigos reales del servicio:

```
Elegir vehículo           carro → placa · resto → código del tiquete (configurable por sitio)
        ↓
Consultar vehículo        find-ticket/ + pay-checkout/ del sistema del parqueadero
        ↓
Identificar al cliente    documento → si ya vino, se le saluda; si no, deja sus datos
        ↓
Enviar la orden           EnviarDatos          Cod:00  → "Pulsa INICIAR COBRO en el datáfono"
        ↓
El cliente la inicia      Respuesta Cod:01     → "Sigue las indicaciones del datáfono"
        ↓
Lee la tarjeta            Respuesta Cod:02     → "Pasa, inserta o acerca la tarjeta"
        ↓
Resultado                 Respuesta Cod:00     → aprobado o rechazado
        ↓
Confirmar y facturar      POST pay-checkout/ + factura en SIIGO
```

Con una transacción ya iniciada no se puede abandonar la pantalla, y si el
navegador se recarga el cobro se retoma donde iba.

Al ser autoservicio, la pantalla vuelve sola al inicio 15 segundos después de
mostrar el resultado, y se reinicia tras 90 segundos de inactividad a media
operación. **Para cerrar el kiosco**: mantener pulsado el nombre del parqueadero
durante 3 segundos y escribir la contraseña. No hay botón visible, para que
ningún cliente deje la caja fuera de servicio; el SuperAdmin también puede
cerrar la sesión a distancia.

## Verificar el enlace con el datáfono

```bash
npm run redeban:check          # ejercita Version, Token, EnviarDatos, Respuesta y Borrar
```

Deja el ambiente como lo encontró: la transacción de prueba se borra al final.

## Estructura

```
src/
  app/
    login/                   Inicio de sesión y recuperación de contraseña
    p/[slug]/(panel)/        Administrador del parqueadero: pagos y auditoría
    p/[slug]/pos/            Punto de pago (kiosko táctil)
    admin/                   SuperAdmin: parqueaderos, usuarios, integraciones
    api/                     Endpoints (todo el trabajo ocurre en servidor)
  lib/
    auth/                    Sesiones, contraseñas, guardas de rol y alcance
    parking/                 Config por sitio: sistema, datáfono, reglas, punto de pago
    payments/                Orquestación del cobro
    billing/                 Facturación electrónica
    crypto/                  Cifrado de credenciales
    idempotency.ts           Prevención de doble cobro
  integrations/
    sipconnector/            Protocolo del datáfono: los 5 métodos del servicio
    nova-parking/            Única puerta hacia el sistema del parqueadero
    siigo/                   Facturación
  components/pos/            Interfaz del kiosco
docs/                        Análisis, arquitectura y requerimientos
scripts/                     Herramientas de verificación y configuración
```

## Documentación

| Documento | Para qué sirve |
| --------- | -------------- |
| [`HANDOFF_KIOSCO_DE_PAGO.md`](HANDOFF_KIOSCO_DE_PAGO.md) | **Empezar por aquí.** Estado real: qué está probado, qué falta y de quién depende |
| [`FUNCIONAMIENTO_KIOSCO_DE_PAGO.md`](FUNCIONAMIENTO_KIOSCO_DE_PAGO.md) | Cómo funciona todo de arriba a abajo, incluido el datáfono a fondo |
| [`docs/ANALISIS_Y_ARQUITECTURA.md`](docs/ANALISIS_Y_ARQUITECTURA.md) | Qué se analizó y por qué se decidió cada cosa |
| [`docs/REQUERIMIENTOS_EDIER.md`](docs/REQUERIMIENTOS_EDIER.md) | Las 3 rutas que necesitamos del sistema de parqueadero |
| [`docs/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md`](docs/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md) | De Nova Parking: el túnel y el datáfono a fondo |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | De Nova Parking: estado real, qué falló y qué sigue |
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | De Nova Parking: contexto técnico |

Los dos primeros son **los que se le comparten al equipo de Nova Parking**: son
el equivalente a los que ellos nos entregaron. Los tres últimos son suyos y no se
editan.

## Principios que rigen el código

1. **Las tarifas son del sistema del parqueadero.** Se cobra exactamente el valor
   que devuelve, y ese mismo va a la factura.
2. **El backend decide los permisos.** El navegador nunca autoriza nada.
3. **Un pago no se duplica.** Idempotencia por clave, más verificación de cobro
   en curso por tiquete.
4. **Una petición HTTP exitosa no es un pago exitoso.** Un estado desconocido se
   trata como pendiente, nunca como aprobado.
5. **Lo que no está documentado no se inventa.** Queda marcado como pendiente y
   visible en la interfaz.

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run typecheck      # verificación de tipos
npm run db:studio      # explorar la base de datos
npm run redeban:check  # probar los 5 métodos del datáfono
```

### Herramientas de SIIGO

```bash
npx tsx scripts/siigo-probe.ts            # descubre qué comprobante y forma de pago aceptan factura
npx tsx scripts/siigo-explore.ts          # lista los catálogos del ambiente
npx tsx scripts/siigo-setup.ts --apply    # crea el servicio de parqueadero
npx tsx scripts/siigo-test-invoice.ts     # emite una factura de prueba real
```

`siigo-probe` es el que resuelve la pregunta difícil: el catálogo lista decenas
de comprobantes, pero solo algunos aceptan facturas por API y el servicio solo lo
dice al intentarlo. Los prueba uno a uno y reporta cuál funciona.
