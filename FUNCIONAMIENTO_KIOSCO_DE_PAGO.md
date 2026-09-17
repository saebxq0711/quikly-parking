# Cómo funciona el kiosco de pago — guía completa

> Escrito 2026-08-29. Este documento es el equivalente al
> `FUNCIONAMIENTO PROYECTO Y TUNEL.md` que nos pasó Edier, pero al revés: para
> que **quien mantiene Nova Parking entienda nuestro lado de arriba a abajo**, y
> en particular dónde nos tocamos y dónde no.
>
> Está escrito para que lo pueda leer una persona o un asistente de código.
> Cuando termines, para el detalle práctico ("qué endpoint tengo que exponer,
> qué me van a mandar") sigue con `docs/REQUERIMIENTOS_EDIER.md` — ese es el
> manual de implementación. Este es el mapa.

---

## 1. Qué es esto, en una foto

Es un **kiosco de autoservicio a la salida del parqueadero**. Una pantalla táctil
y un datáfono, dentro de una caja. El conductor llega, se identifica, paga con
tarjeta y se va. **No hay nadie del parqueadero atendiéndolo.**

```
Cliente (a la salida, solo)
        │
        ▼
  Pantalla del kiosco  ──────────┐
        │                        │
        ▼                        ▼
  Nuestro servidor         Datáfono propio
        │                   (por serial)
        ├──► Nova Parking (por el túnel): ¿qué vehículo es y cuánto debe?
        ├──► Redeban / SIPConnector: cobra
        ├──► Nova Parking (por el túnel): ya pagó, libéralo
        └──► SIIGO: factura
```

Una sola aplicación web atiende a varios parqueaderos. Cada uno tiene **su propio
sistema, su propio datáfono y su propia empresa facturadora**, y todo eso se
configura desde la administración — no en archivos ni variables de entorno.

---

## 2. El reparto: qué es de cada quien

Esta es la parte que conviene tener clara antes que ninguna otra.

| | Nova Parking (Edier) | Este kiosco |
|---|---|---|
| Tiquetes de entrada | **Sí** | No |
| Cálculo de tarifas | **Sí** | No, nunca |
| Cobro con tarjeta | No | **Sí** |
| Datáfono | No compartido | **El suyo, propio** |
| Registrar el pago y liberar el vehículo | **Sí** | Le avisa |
| Facturación electrónica | No | **Sí** |
| Usuarios, roles, auditoría | Los suyos | Los suyos |

**El monto lo calcula Nova Parking y nosotros lo cobramos tal cual.** No lo
ajustamos, no le sumamos nada, y ese mismo valor es el que va a la factura. Si
algún día un cobro no cuadra, el problema está de un solo lado y se sabe cuál.

---

## 2.1. Entrada, código en el celular e impresoras (resumen para el parqueadero)

**Entrada — dos casos:**

| Vehículo | Qué pasa en la entrada | Con qué paga a la salida |
|---|---|---|
| **Carro** | La cámara lee la placa. El tiquete queda con esa placa. | Digita su **placa** en el kiosco de pago. |
| **Moto, bicicleta, patineta** | La cámara no lee placa. En la pantalla de entrada presiona **Generar tiquete**: la pantalla muestra un **código** de 5 caracteres (ej. `A7B48`) y su QR, y si ese kiosco tiene impresora, también sale en papel. | En el kiosco de pago **usa el escáner o digita manualmente el código**. |

El kiosco de entrada es la pantalla web de la Raspberry de entrada (`pi-entry/pantalla.html`, servida en la propia Raspberry), con la impresora USB conectada a ella. Vive en el proyecto del parqueadero —no en esta web— porque es la que abre la barrera: tiene que funcionar en la red local aunque se caiga internet.

**Cómo se lleva el cliente el código en el celular (decisión):** escaneando con la cámara del celular el QR de la pantalla de entrada. Ese QR abre la página `https://<esta web>/t/<código>`, con el código y su QR, y un botón **Guardar en el celular** que lo guarda como imagen en la galería (o lo comparte por WhatsApp). No se pide teléfono ni correo en la entrada: no hay que escribir nada frente a la barrera, no cuesta mensajes de texto y funciona con cualquier celular. Si alguien prefiere, le toma una foto a la pantalla o al papel. Las tres formas sirven a la salida: el escáner lee tanto el código solo como el enlace.

Para activarlo, la web tiene que estar publicada con su dominio (`APP_URL`) y en el servidor del parqueadero se pone ese dominio en `url_publica_tiquete` de `deploy/sitios/parqueadero_122.json` (`https://<dominio>/t`), y se corre `configurar_sitio`. Mientras no, el QR de la pantalla lleva el código solo y el cliente le toma foto.

**Impresoras (todas por USB al equipo de cada kiosco):**

- **Kiosco de entrada:** la impresora va a la Raspberry; se activa con `"impresora"` en el JSON del sitio (`auto`, `si`, `no`). Sin impresora, todo queda en pantalla y celular.
- **Kioscos de pago (esta web):** un parqueadero puede tener varios. Cada uno se crea en Administración → parqueadero → *Kioscos de pago*, con su propio usuario (con él entra su pantalla; el administrador del parqueadero le cierra la sesión a distancia desde su panel, en *Kioscos*), su propio datáfono Redeban y la marca *Imprime el comprobante*. Un kiosco sin esa marca nunca imprime: muestra el comprobante en pantalla y lo envía al correo si el cliente lo dio. En los que imprimen, la impresora se detecta sola, y el papel sale de una de dos formas:
  - **Tablet Android con Chrome (sin controladores):** la impresora se conecta por USB (cable OTG) y se autoriza una sola vez en `/p/<sitio>/pos/impresora`, a la que se llega desde el menú oculto del kiosco. La web le manda los comandos ESC/POS directo (`src/lib/printing/`).
  - **PC con Windows:** se corre una vez `scripts/windows/impresora-winusb.ps1` con la impresora conectada. Le cambia el controlador de impresión de Windows por WinUSB (sin eso Chrome no la puede abrir) y la deja autorizada para la web en Chrome y Edge, así que no hay que tocar nada en la página.
  
  **Detección automática.** El kiosco revisa al abrirse y cada vez que se conecta o se quita algo por USB. Si hay una impresora autorizada conectada, imprime por ahí. **Si no hay, o no responde, no se imprime por el navegador:** el comprobante completo se muestra en la pantalla del kiosco (con un QR a la factura) y se envía al correo del cliente por Resend en cuanto se aprueba el pago. La factura electrónica la envía SIIGO por su lado.

  **Valor en tiempo real.** La tarifa de Nova Parking sigue corriendo mientras el cliente llena sus datos o lee el total. En el resumen el valor se vuelve a consultar al entrar y cada 30 segundos, y al tocar *Pagar* el servidor lo cotiza otra vez: si ya no es el que el cliente vio, no toca el datáfono y le muestra el nuevo total para que confirme. Una vez enviado al datáfono el valor queda fijo, y a Nova Parking se le confirma lo cobrado (su `confirmar-externo` registra el monto recibido; solo exige que sea mayor a 0). No hubo que cambiar nada del proyecto de Moyano. La autorización vive en el navegador de cada kiosco, no en la base, así que cada parqueadero usa la impresora de su propio kiosco sin configurar nada por parqueadero.

  **Qué dice el papel.** Encabezado con los datos del parqueadero de nuestra base: razón social, nombre comercial, NIT con dígito de verificación, régimen de IVA, dirección, ciudad y departamento, teléfono, correo, póliza de responsabilidad civil (número y aseguradora) y horario de atención. Se piden al crear el parqueadero, en *Datos del parqueadero*; todos obligatorios salvo el correo y el horario. Luego el **consecutivo del comprobante** (por parqueadero, sin saltos, se asigna al aprobarse el pago), la fecha y el concepto "Servicio de parqueadero". Luego cliente (nombre y documento); vehículo (tipo, placa o código del tiquete, entrada, salida y permanencia, que el sistema del parqueadero entrega al cobrar); pago (forma de pago, tarjeta, autorización, recibo, referencia); total y QR a la factura. Al aprobarse el pago se espera la **factura de SIIGO** (hasta ~30 s) y se imprime la factura; si SIIGO no la emite a tiempo, se imprime el comprobante de pago con un QR que abre la factura cuando esté lista.

**Correo:** a un cliente nuevo se le pide nombre, apellido y correo, con el texto "Aquí te enviaremos tu factura electrónica". En pantalla no dice "opcional" (casi todos lo dan), pero **se puede dejar vacío**: hay personas, sobre todo mayores, que no tienen correo. Sin correo la factura se emite igual y el comprobante queda solo en la pantalla del kiosco. Si un cliente conocido no tiene correo guardado, se le ofrece escribirlo. El envío lo hace SIIGO: la opción *Enviar la factura electrónica al correo del cliente* tiene que estar activa en la configuración de facturación del parqueadero, y el comprobante debe ser electrónico.

## 3. El flujo completo, paso a paso

### 3.1. El cliente elige su vehículo

Cuatro botones grandes: carro, moto, patineta, bicicleta.

### 3.2. Se identifica el vehículo

Aquí hay algo **sin cerrar**, y es importante:

| Vehículo | Con qué se busca | Estado |
|---|---|---|
| Carro | **Placa** | Definido |
| Moto | **Código del tiquete** (`A7B48`) | Definido |
| Bicicleta | **Código del tiquete** | Definido |
| Patineta | **Código del tiquete** | Definido |

El código es **alfanumérico de 5 caracteres**, con patrón fijo
letra·número·letra·número·número, impreso en el tiquete de entrada y dentro del
QR. Se diseñó para que no pueda confundirse con una placa, ni a la vista ni por
expresión regular:

```
Placa de carro:  ABC123   3 letras seguidas y 3 números
Placa de moto:   ABC12D   3 letras seguidas
Código:          A7B48    alterna desde el segundo carácter
```

Su alfabeto **excluye la I y la O** porque se confunden con el 1 y el 0 al
teclear. Cuando alguien las escribe igual, aquí se traducen (I→1, O→0) en vez de
rechazarlas: quien escribió `AIB48` quiso decir `A1B48`, y rechazarlo lo dejaría
atascado sin entender por qué.

**Nunca se le muestra al cliente el `id` del tiquete.** Ese es el
autoincremental de la base de Nova Parking, y siendo secuencial permitiría
deducir el de otro vehículo y tratar de sacarlo. El código, en cambio, es
aleatorio, único, y es lo único que el cliente conoce.

La regla sigue siendo **configurable por parqueadero y por tipo de vehículo**
desde nuestra administración: el tipo de dato, la ruta y el texto que ve el
cliente. Si otro sitio identifica distinto, se ajusta ahí — sin desplegar.

Con ese dato llamamos a Nova Parking:

```
GET /api/parking/find-ticket/<tipo>/?term=<dato>&exact=true  →  el tiquete
GET /api/parking/ticket/<codigo>/pay-checkout/               →  cuánto debe
```

### 3.3. Se identifica el cliente

Se le pide el **número de documento**. Lo buscamos primero en nuestra base y
después en SIIGO (`GET /v1/customers?identification=`).

- **Si ya vino antes** → *"Hola, María Rojas"* con sus datos, y continúa.
- **Si es nuevo** → se le piden nombre, apellidos, teléfono y correo, una sola
  vez. Teléfono y correo son opcionales a propósito: obligarlos en un kiosco de
  salida solo consigue que la gente escriba cualquier cosa.

Esto existe para que **la factura salga a su nombre** y no siempre a consumidor
final.

Solo se le pide el documento si de verdad hay algo que cobrar. Pedírselo a
alguien cuyo tiquete no existe sería hacerle perder el tiempo.

### 3.4. Se cobra en el datáfono

Aquí está el detalle que más confunde, así que va despacio.

**El datáfono está conectado por serial y NO cobra solo.** Nosotros dejamos la
orden en la nube de SIPConnector, y a partir de ahí **alguien tiene que iniciar
la operación en el aparato físico** — lo que el manual llama "presionar la tecla
verde". Por eso la pantalla no dice "procesando" y ya: va diciendo exactamente
qué hacer, siguiendo los códigos reales del servicio.

```
 1. Dejamos la orden               EnviarDatos → Cod:00, Msj:OK
        │                          Pantalla: "Pulsa INICIAR COBRO en el datáfono"
        ▼
 2. El cliente la inicia           Respuesta → Cod:01
        │                          Pantalla: "Sigue las indicaciones del datáfono"
        ▼
 3. Pasa la tarjeta                Respuesta → Cod:02 (trae BIN, franquicia, tipo)
        │                          Pantalla: "Pasa, inserta o acerca la tarjeta"
        ▼
 4. La red resuelve                Respuesta → Cod:00 con los campos del voucher
                                   Aprobado o rechazado
```

Consultamos cada 3 segundos, que es el mínimo que exige el Anexo 3 del manual.

Mientras hay una transacción viva **no se puede abandonar la pantalla**: no hay
botón de cancelar, se avisa antes de recargar y se anula el botón "atrás". Si aun
así alguien sale y vuelve, **el cobro se retoma donde iba** — el cliente puede
tener la tarjeta metida en el aparato.

### 3.5. Se le avisa a Nova Parking

Con el cobro aprobado:

```
POST /api/payments/ticket/<codigo>/confirmar-externo/
{ "amount": 9500, "payment_method": "CARD", "transaction_id": "...",
  "authorization_code": "604863", "receipt_number": "000124", "franchise": "VISA" }
```

Es el mismo endpoint que ya usa el kiosko de efectivo de Nova Parking; solo
cambia que el método viene en `CARD` y trae los datos del voucher.

**Este es el punto donde el vehículo queda liberado**, y por eso es el más
crítico de toda la integración.

### 3.6. Se factura

Se emite la factura en SIIGO, a nombre del cliente que se identificó, por el
valor exacto que devolvió `pay-checkout`.

### 3.7. La pantalla se limpia sola

15 segundos después del resultado vuelve al inicio, con la cuenta a la vista y un
botón para terminar antes. Y si alguien deja una operación a medias, a los 90
segundos de inactividad también vuelve. **Nadie del parqueadero está ahí para
dejarla lista para el siguiente.**

---

## 4. El datáfono a fondo

### 4.1. No es Redeban directo

Igual que en Nova Parking: la integración real es con **SIPConnector**, un
servicio intermediario en la nube, con su propio protocolo de texto separado por
comas. No es JSON y no es el datáfono directo.

### 4.2. Los cinco métodos

Están todos implementados en `src/integrations/sipconnector/`:

| Método | Para qué | Verbo |
|---|---|---|
| `Version` | Prueba de vida. No pide token. | **GET** |
| `Token` | Llave temporal, dura 3 minutos | POST |
| `EnviarDatos` | Deja la orden de cobro para el datáfono | POST |
| `Respuesta` | Consulta en qué va / el resultado | POST |
| `Borrar` | Libera la terminal | POST |

**`Version` va por GET aunque el manual diga que todos son POST.** Con POST
responde 405. Lo comprobamos contra el ambiente real, y coincide con lo que ya
había documentado Edier en su `HANDOFF.md` sección 5, punto 4.

`Notificar` aparece en la lista del manual, pero `/api/Notificar` responde 404 en
el ambiente: no es un método que invoque el comercio, es el aviso que el servicio
manda hacia el comercio.

### 4.3. La trama de compra

Son los **20 campos del Anexo 1.1**, en orden estricto y separados por comas. Un
campo numérico que no aplica va en cero, uno alfabético va vacío, y ninguno se
puede omitir porque la posición es lo que identifica al campo.

Los impuestos van en cero: Nova Parking entrega un total ya calculado y no
desglosa impuestos, así que desglosarlos aquí sería inventarlos.

### 4.4. Una terminal, una transacción

El Anexo 4 devuelve `Cod:06 Ya existe una transacción asignada a esta terminal`:
**una terminal admite una sola transacción viva a la vez.**

Como nuestro datáfono es exclusivo del kiosco, una operación colgada ahí solo
puede ser nuestra. Por eso, ante un `Cod:06`, la liberamos con `Borrar` y
reintentamos automáticamente. **Si el aparato fuera compartido con otro sistema,
ese reintento podría interrumpirle un cobro y no sería seguro hacerlo** — de ahí
que insistamos en que los datáfonos sean independientes.

### 4.5. Verificado, no supuesto

Todo lo anterior está comprobado contra el ambiente real de Redeban con las
credenciales del comercio. Se puede repetir:

```bash
npm run redeban:check
```

Ejercita los cinco métodos y deja el ambiente como lo encontró: la transacción de
prueba se borra al final.

---

## 5. Dónde entra el túnel

En nuestro lado el túnel se usa **solo para salir hacia Nova Parking**, y en
tres momentos:

```
Kiosco (nube)  ──HTTPS + X-Platform-Token──►  api.parqueadero122.com  ──►  Django
                    1. buscar el vehículo
                    2. consultar el monto
                    3. avisar que se pagó
```

**El cobro con el datáfono NO pasa por el túnel.** Ese va directo de nuestro
servidor a SIPConnector, por internet normal, como cualquier llamada a una API
externa.

Y a diferencia del kiosko C# de Nova Parking, nosotros **no estamos dentro de la
red del parqueadero**: corremos en la nube, así que absolutamente todo lo que
necesitamos de ese sistema tiene que pasar por el túnel. Por eso hizo falta
ampliar las rutas del `config.yml` — con las dos originales no alcanzaba.

Cada parqueadero lleva **su propio dominio y su propio token**, guardados
cifrados y configurables desde la administración. Sumar un sitio nuevo no exige
un despliegue.

---

## 6. Cómo está construido

### 6.1. Stack

| Pieza | Qué es |
|---|---|
| Next.js 15 (App Router) + React 19 | Aplicación completa: pantallas y API en un solo desplegable |
| TypeScript estricto | Los contratos con tres APIs externas se vuelven verificables |
| PostgreSQL + Prisma | Los pagos exigen transacciones y restricciones únicas reales |
| Tailwind v4 | Una identidad visual, dos densidades: kiosco táctil y panel |
| Argon2id + JWT en cookie + sesiones en base | Autenticación con revocación inmediata |
| AES-256-GCM | Cifrado de credenciales guardadas |

**Todas las integraciones corren en el servidor.** El navegador nunca ve una
credencial, ni el código del comercio, ni el del datáfono.

### 6.2. Mapa de carpetas

```
src/
  app/
    login/                   Ingreso y recuperación de contraseña
    p/[slug]/pos/            El kiosco  ← la pantalla del cliente
    p/[slug]/(panel)/        Panel del parqueadero: pagos y auditoría
    admin/                   SuperAdmin: sitios, usuarios, integraciones
    api/                     Endpoints
  lib/
    auth/                    Sesiones, contraseñas, guardas de rol
    parking/                 Config por sitio: sistema, datáfono, facturación, reglas
    payments/                Orquestación del cobro y clientes
    billing/                 Facturación
  integrations/
    sipconnector/            Protocolo del datáfono (los 5 métodos)
    nova-parking/            Única puerta hacia el sistema del parqueadero
    siigo/                   Facturación y clientes
```

**`src/integrations/nova-parking/client.ts` es la única puerta hacia Nova
Parking.** Ningún otro módulo le hace `fetch` directo. Si mañana cambia el
transporte, se toca ese archivo y nada más.

### 6.3. Las tres pantallas

- **Kiosco** (`/p/<sitio>/pos`) — la del cliente. Oscura, objetivos táctiles
  grandes, funciona en vertical y en horizontal.
- **Panel del parqueadero** (`/p/<sitio>/pagos`) — historial de cobros con
  filtros y auditoría. Lo usa el administrador del sitio.
- **Administración** (`/admin/...`) — sitios, usuarios e integraciones. Solo el
  SuperAdmin.

---

## 7. Las decisiones que más importan

### 7.1. El monto nunca viaja desde el navegador

Cuando se pulsa "Pagar", la petición **no lleva el valor**. El servidor lo vuelve
a consultar a Nova Parking justo antes de cobrar. Así ni un error nuestro ni una
petición manipulada pueden cobrar un valor distinto.

### 7.2. Un pago no se duplica

Tres barreras:

1. Una **clave de idempotencia** por intento: si hay doble clic o la red
   reintenta, se devuelve el mismo cobro, no se crea otro.
2. **Un tiquete no admite dos cobros vivos** a la vez.
3. Si un cobro queda colgado más de 20 minutos y el proveedor ya no lo tiene, se
   cierra como expirado — **si no, ese vehículo no se podría volver a cobrar
   nunca.**

### 7.3. Una respuesta HTTP correcta no es un pago aprobado

Un estado desconocido se trata como **pendiente, nunca como aprobado**. Y el
Anexo 2 exige validar el monto aprobado: si la red aprobó un valor distinto al
cobrado, el pago queda como fallido **para revisión manual**, no como bueno.

### 7.4. Nada invalida un cobro ya hecho

Si falla el aviso a Nova Parking, o falla la factura, **el pago sigue aprobado**
y queda marcado para revisión, visible en la administración. El dinero ya salió
de la cuenta del cliente; fingir que no sería peor.

### 7.5. Lo que no está documentado no se inventa

Cuando falta un dato, queda marcado como pendiente y visible en pantalla en vez
de rellenarse con una suposición. El identificador de moto, bici y patineta
estuvo así hasta que Nova Parking lo definió, y se leyó de su contrato antes de
darlo por cierto. Cuando falta algo, queda **marcado como pendiente y visible en la
interfaz** en lugar de rellenarse con una suposición.

---

## 8. Aislamiento entre parqueaderos

Una sola web atiende a varios sitios, así que esto es una preocupación real:

- El `parkingLotId` **se deriva del usuario en base de datos**, nunca de la
  petición. Cambiar un parámetro de la URL no lleva a otro sitio.
- Cada parqueadero tiene su propio dominio, token, datáfono y empresa
  facturadora.
- Un usuario que pide un área que no es de su rol es devuelto a la suya.
- Toda página autenticada va con `Cache-Control: no-store`, para que el botón
  "atrás" no muestre datos después de cerrar sesión.

---

## 9. Qué necesitamos de Nova Parking

Resumido; el detalle está en `docs/REQUERIMIENTOS_EDIER.md`.

**Tres rutas, las tres ya existen:**

```
/api/parking/find-ticket/<tipo>/             buscar el vehículo
GET  /api/parking/ticket/<codigo>/pay-checkout/            consultar el monto
POST /api/payments/ticket/<codigo>/confirmar-externo/      avisar que se pagó
```

Falta **dejarlas pasar por el túnel** y **un token compartido**.

**Y dos decisiones:**

1. ~~Qué identificador usan moto, bicicleta y patineta.~~ **Resuelto:** el código.
2. Si el `POST pay-checkout` libera el vehículo, si es idempotente por
   `transaction_id`, y en qué caja cae.

---

## 10. A dónde seguir

| Si necesitas... | Lee |
|---|---|
| Qué exponer y qué responder, paso a paso | `docs/REQUERIMIENTOS_EDIER.md` |
| El estado real: qué está probado y qué falta | `HANDOFF_KIOSCO_DE_PAGO.md` |
| Por qué se decidió cada cosa | `docs/ANALISIS_Y_ARQUITECTURA.md` |
| Cómo levantar el proyecto | `README.md` |
