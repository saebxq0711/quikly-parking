# HANDOFF — Kiosco de pago de parqueaderos

> Última actualización: 2026-08-29. Este documento es el punto de partida para
> cualquiera que retome el proyecto, o para el equipo de Nova Parking que
> necesite entender en qué estado estamos. Es el equivalente al `HANDOFF.md` que
> nos pasó Edier.
>
> Si solo vas a leer una cosa, que sea esta. Para entender **cómo funciona**,
> `FUNCIONAMIENTO_KIOSCO_DE_PAGO.md`.

---

## 1. Resumen en una hoja

Un **kiosco de autoservicio a la salida del parqueadero**: pantalla táctil y
datáfono propios. El conductor se identifica, paga con tarjeta y se va, sin nadie
del parqueadero atendiéndolo.

**Lo que está listo y probado contra los servicios reales:**

- El cobro contra Redeban/SIPConnector — los cinco métodos del servicio
  responden con las credenciales del comercio.
- La facturación en SIIGO — facturas reales emitidas, con URL pública.
- Toda la aplicación: autenticación con roles, kiosco, panel del parqueadero,
  administración, auditoría, prevención de doble cobro.

**Nada bloquea el desarrollo.** Nova Parking entregó todo lo que se le pidió y
está verificado contra su sistema real por internet (2026-09-12):

- Las 6 rutas de operación y las 12 del panel responden, todas detrás de
  `X-Platform-Token`. Un `POST` a cualquiera de las 12 del panel recibe `405`.
- Búsqueda por placa y por código, monto, aviso de pago, liberación del vehículo
  y su registro en la caja `Kiosco Web Tarjeta`.

**Lo que estaba por decidir, ya está resuelto:**

- Moto, bicicleta y patineta se identifican con un **código alfanumérico de 5
  caracteres** (`A7B48`), no con el número de tiquete.
- El aviso de pago va a `POST /api/payments/ticket/<codigo>/confirmar-externo/`,
  libera el vehículo, es idempotente por `transaction_id` y cae en su propia caja.

**Lo que sigue pendiente, y es de operación, no de código:**

- El túnel entra al PC de desarrollo de Nova Parking: tiene que estar encendido.
  Al mudarse a la máquina del parqueadero cambia el token y los casos de prueba.
- Falta probar con un **datáfono físico**. El sandbox de Redeban acepta la trama
  pero no hay terminal que la tome.
- La tarifa de bicicleta y patineta sigue en la de prueba ($10/minuto). Como se
  cobra exactamente lo que ellos devuelven, hoy esos dos tipos cobrarían mal.

---

## 2. Qué construye este proyecto

Una sola aplicación web que puede atender varios parqueaderos. Cada uno con su
propio sistema, su propio datáfono y su propia empresa facturadora, configurables
desde la administración.

Tres roles:

| Rol | Qué hace | Dónde |
|---|---|---|
| **SuperAdmin** | Crea sitios y usuarios, configura las tres integraciones | `/admin/...` |
| **Administrador de parqueadero** | Consulta los pagos y la auditoría de su sitio | `/p/<sitio>/pagos` |
| **Punto de pago** | La cuenta con la que corre el kiosco | `/p/<sitio>/pos` |

---

## 3. Estado por pieza

### 3.1. Cobro con datáfono (Redeban / SIPConnector) — construido y probado

| Qué | Estado |
|---|---|
| Cliente completo del protocolo, los 5 métodos | Construido — `src/integrations/sipconnector/` |
| `Version` | Probado: responde `Cod:00,Msj:Version 1.5.5` |
| `Token` | Probado: token válido, vigencia de 3 minutos, cacheado |
| `EnviarDatos` | Probado: `Cod:00,Msj:OK` con la trama de 20 campos del Anexo 1.1 |
| `Respuesta` | Probado: con mensaje vacío mientras el datáfono no toma la orden |
| `Borrar` | Probado: libera la terminal; después `Respuesta` confirma que ya no existe |
| Operación de anulación (tipo 1) | Construida en el cliente, **sin pantalla todavía** |
| Cobro real con un datáfono físico | **Sin probar** — no hay aparato conectado aún |

Se puede volver a verificar en cualquier momento con `npm run redeban:check`.

**Dos hallazgos que conviene no volver a descubrir:**

1. **`Version` responde 405 con POST y 200 con GET**, pese a que el manual dice
   que todos los métodos son POST. Coincide con lo que ya había documentado Edier.
2. **`Respuesta` con `Cod:00` y mensaje vacío** no es un error: significa que la
   orden está puesta y el datáfono todavía no la ha tomado. Es el estado normal
   mientras el cliente no toca el aparato.

### 3.2. Facturación (SIIGO) — construida y probada

| Qué | Estado |
|---|---|
| Autenticación y emisión de facturas | Probado — facturas reales emitidas |
| Búsqueda y creación de clientes | Probado — `GET`/`POST /v1/customers` |
| Reintento de facturas fallidas | Construido |
| Configuración por parqueadero | Construida |

Valores en uso, **descubiertos de los catálogos reales, no inventados**:

| Campo | Valor | Cómo se determinó |
|---|---|---|
| `document.id` | `27939` | Único que el ambiente acepta: se probaron los 71 electrónicos y todos responden `document_settings` |
| `payments[].id` | `9441` — "Datáfono Redeban" | Ya existía en el catálogo y es exactamente nuestro medio |
| `seller` | `916` | El usuario de las credenciales entregadas |
| `items[].code` | `PARQUEADERO` | Servicio creado por nosotros en el grupo "Servicios" |
| `sendStamp` | `false` | Ese comprobante no es electrónico y rechaza el timbre |

Se puede volver a determinar con `npx tsx scripts/siigo-probe.ts`.

**Tres cosas aprendidas por las malas:**

1. **El `Partner-Id` no admite guiones ni puntos.** Con ellos, el servicio
   responde `invalid_partner_id` en **todos** los endpoints salvo el de
   autenticación — que sí acepta cualquier cosa, lo cual despista bastante.
2. **El ambiente devuelve `unhandled_error` (500) de forma transitoria.** El
   mismo payload que falla pasa al reintentar. Por eso hay reintento automático.
3. **El sandbox es compartido** y tiene datos de otros usuarios: al buscar un
   documento inventado puede aparecer un cliente real. En producción esa base
   será la del cliente.

**Pendiente para producción:** el `document.id` de arriba es el que acepta el
ambiente de pruebas. En producción va el tipo de comprobante del cliente, con su
resolución DIAN. Si ese exige numeración manual, hay que definir de dónde sale el
consecutivo — no lo inventamos.

**El IVA:** el producto se creó con IVA 19% **incluido en el precio**. Es
deliberado: el total facturado tiene que ser exactamente lo que ya se le cobró al
cliente en el datáfono, así que el impuesto se desagrega por dentro en vez de
sumarse encima. **El tratamiento tributario debe confirmarlo el contador del
cliente**; se cambia desde la administración sin tocar código.

### 3.3. Integración con Nova Parking — enlazada y verificada

| Qué | Estado |
|---|---|
| Cliente hacia su sistema, con normalizador tolerante | Construido |
| Dominio del túnel | `https://api.parqueadero122.com` |
| Token de acceso | Recibido y guardado cifrado en la ficha del sitio |
| Rutas expuestas en el túnel | 6 de operación + 12 del panel, verificadas |
| Prueba de enlace desde la administración | Construida (botón "Probar conexión") |
| Comprobación completa | `npm run nova:check` y `npm run nova:panel` |

> El dominio cambió el 2026-09-12: era `api.parkingpinning.com`, y esa cuenta de
> Cloudflare quedó bloqueada. El token no cambió.

El normalizador acepta variantes de nombres en camelCase y snake_case, en español
e inglés, y el monto como número o como texto — esto último porque su propio
`HANDOFF.md` documenta que ha viajado como string.

### 3.4. La aplicación — construida

| Qué | Estado |
|---|---|
| Autenticación, roles y aislamiento entre sitios | Construido y probado |
| Kiosco de autoservicio, vertical y horizontal | Construido y probado |
| Identificación del cliente para la factura | Construido y probado |
| Panel del parqueadero: pagos con filtros, auditoría | Construido |
| Administración: sitios, usuarios, integraciones | Construido |
| Recuperación de contraseña | Construida |
| Auditoría de eventos | Construida |
| Pruebas automatizadas | **No hay** — todo se verificó manualmente |

---

## 4. Qué se intentó, qué falló, y qué se corrigió

Esto es tan útil como lo que funcionó, para que quien retome no repita el camino.

1. **El cobro iba a delegarse a Nova Parking, y se revirtió.** El diseño original
   le pedía a ese sistema que ejecutara el cobro, para reutilizar su cliente de
   SIPConnector y para que el movimiento quedara en su caja. Se descartó cuando
   se confirmó que **ese equipo no maneja pagos con tarjeta** y que el datáfono
   del kiosco es un aparato aparte. Ahora el cobro es nuestro y a ellos solo se
   les avisa.

2. **Se pedían 5 rutas y ahora son 3.** Consecuencia directa de lo anterior:
   `payments/ticket/<id>/iniciar/` y `.../estado/` ya no hacen falta.

3. **Se afirmaba que moto, bici y patineta iban por número de tiquete. Era una
   suposición.** Se corrigió: ahora está planteado como decisión abierta, y la
   regla quedó configurable por sitio para que definirla no cueste un despliegue.

4. **El botón "atrás" del navegador mostraba páginas después de cerrar sesión, y
   se podía entrar a áreas de otro rol escribiendo la URL.** Eran dos fallos
   reales. Se corrigieron en el middleware: validación de rol por área y
   `Cache-Control: no-store` en toda página autenticada.

5. **Un cobro colgado dejaba un vehículo imposible de cobrar para siempre.** Como
   un tiquete no admite dos cobros vivos, si uno quedaba atascado ese vehículo no
   se podía volver a cobrar. Ahora expira a los 20 minutos, con el motivo escrito.

6. **El middleware arrastraba Prisma al Edge Runtime.** Se separó la verificación
   del token en un módulo sin base de datos: desapareció el aviso de compilación
   y el middleware bajó de 109 kB a 53 kB.

7. **Tailwind v4 dejó de poner `cursor: pointer` en los botones** (lo hacía en
   v3). Toda la interfaz se sentía muerta hasta que se añadió la regla explícita.

8. **Se construyó un simulador de Nova Parking y luego se eliminó.** Sirvió para
   desarrollar sin depender del túnel, pero se quitó por decisión del cliente:
   los datos deben venir siempre del sistema real.

---

## 5. Lo que necesitamos de Nova Parking

Detalle completo en `docs/REQUERIMIENTOS_EDIER.md`. Resumido:

**Obligatorio**

Todo entregado. Quedan dos cosas menores, anotadas en
`REQUERIMIENTOS_PANEL_ADMIN.md` sección 4:

- `vehicles-in-parking` no devuelve el `code`, así que esa pantalla no puede
  mostrarlo.
- Cuando no hay nada que cobrar, `pay-checkout` responde `{"price": 0}` a secas,
  sin los datos del tiquete. Se tolera de este lado, pero la forma debería ser
  la misma siempre.

**Casos de prueba vigentes**

- Carro `HKM872` · Moto `R7M57` · Bicicleta `C1X94`

---

## 6. Lo que NO tocamos de su lado

- `parkingManager/models.py` y `serializers.py`.
- `backend/devices/`.
- El cálculo de precio de `ParkingTicketPayAutoCheckout`.
- Su app `payments/` y su kiosko C#.
- Su datáfono, si llega a tenerlo. **El nuestro es un aparato independiente.**

---

## 7. Qué sigue, por responsable

**Del equipo de Nova Parking**

- Ampliar el `config.yml` del túnel y entregar el token.
- Responder las dos decisiones de la sección 5.
- Confirmar la forma real de sus respuestas JSON, o pasarnos un `curl`.

**Del cliente / dueño del negocio**

- Confirmar la tarifa real de bicicleta y patineta (hoy es la de prueba,
  $10/minuto).
- Entregar las credenciales de producción de Redeban. Las actuales son del
  ambiente de pruebas y a nombre de otro comercio (Farmatodo/Quikly, código
  `<codigo unico de pruebas>`).
- Entregar las credenciales de producción de SIIGO y el tipo de comprobante con
  su resolución DIAN.
- Que su contador confirme el tratamiento del IVA.
- Decidir si hacen falta anulaciones para la entrega.

**De quien retome este código**

- Escribir pruebas automatizadas: hoy todo se verificó manualmente.
- Antes de producción: revisar variables de entorno, HTTPS, dominios, copias de
  seguridad, monitoreo y health checks.
- Cambiar las contraseñas sembradas. Las del `README` son solo para el arranque.

---

## 8. Cómo verificar que todo sigue en pie

```bash
npm run typecheck                          # tipos
npm run build                              # build de producción
npm run redeban:check                      # los 5 métodos del datáfono
npx tsx scripts/siigo-probe.ts             # qué acepta la facturación
npx tsx scripts/siigo-test-invoice.ts      # emite una factura real de prueba
```

Y desde la administración, en la ficha de cada parqueadero, hay un botón de
**probar** para cada una de las tres integraciones. Ese botón dice si el enlace
quedó bien o qué está fallando — para no tener que adivinar entre los dos
equipos.

---

## 9. Mapa de documentos

| Documento | Para qué sirve |
|---|---|
| **`HANDOFF_KIOSCO_DE_PAGO.md`** (este) | Punto de partida: estado real y qué falta |
| `FUNCIONAMIENTO_KIOSCO_DE_PAGO.md` | Cómo funciona todo, de arriba a abajo |
| `docs/REQUERIMIENTOS_EDIER.md` | Qué necesitamos de Nova Parking, paso a paso |
| `docs/ANALISIS_Y_ARQUITECTURA.md` | Qué se analizó y por qué se decidió cada cosa |
| `README.md` | Cómo levantar el proyecto |
| `docs/HANDOFF.md`, `docs/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md`, `docs/CLAUDE.md` | Los de Nova Parking, tal como los entregaron. No se editan. |
