# Análisis del ecosistema existente y arquitectura propuesta

> Fase 1 y Fase 2 del plan de `CLAUDE.md`. Escrito 2026-08-28, después de leer
> `docs/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md`, `docs/HANDOFF.md`, `docs/CLAUDE.md`,
> el manual completo *Descripción Técnica Web Service SIPConnector V1.5*
> (19 páginas) y los archivos de credenciales `redeban_api.md` y `siigo_api.md`.

---

## 1. Arquitectura actual (Nova Parking)

Monorepo de un parqueadero real en Duitama, mantenido por Edier Moyano:

| Pieza              | Tecnología             | Papel                                          |
| ------------------ | ---------------------- | ---------------------------------------------- |
| `backend/`         | Django 3.1.2 + DRF     | El cerebro. SQLite. Puerto 8000                 |
| `frontend/`        | React 18 + TS + Vite   | Interfaz del cajero                             |
| `desktopApp/`      | Electron               | Empaqueta el frontend                           |
| `NovaAutoCheckout/`| C# / WPF               | Kiosko autoservicio. Efectivo (ITL) y tarjeta   |
| `pi-entry/`, `pi-exit/` | Python en Raspberry Pi | Barreras y sensores                       |

Todo corre en **una sola máquina física** dentro de la red del parqueadero, sin
IP pública. Autenticación por **sesión de Django con cookies**, no JWT. Grupos de
usuario: `Admin` y `Cashier`.

## 2. Cómo funciona el Cloudflare Tunnel

Es el punto peor entendido del proyecto, y la documentación de Edier es
explícita al respecto. **La comunicación va en dos sentidos y el túnel solo
participa en uno:**

```
SALIENTE (Django -> SIPConnector)        ENTRANTE (SIPConnector -> Django)
Django sale a internet solo,             SIPConnector necesita una URL
como cualquier programa.                 pública para avisar el resultado.
NO usa el túnel.                         AQUÍ SÍ se usa el túnel.
```

El túnel existe **únicamente** para que el webhook de SIPConnector pueda entrar.
Corre como servicio de Windows, con `protocol: http2` fijo porque la red del
parqueadero bloquea UDP/QUIC. Expone solo 2 rutas; todo lo demás da 404 en el
borde de Cloudflare.

**Implicación crítica para nosotros, y el hallazgo más importante del análisis:**
esas 2 rutas alcanzan para el kiosko C# (que está *dentro* de la red), pero **no
para una aplicación en la nube**. `pay-checkout` recibe un id de tiquete, y el
cliente que llega a la caja trae una placa; la ruta que traduce placa → id no
está expuesta. Detalle y solución en `REQUERIMIENTOS_EDIER.md`.

## 3. Cómo se consulta un vehículo y cómo se determina el valor

```
placa o id de tiquete
   -> GET /api/parking/find-ticket/{car|moto|bike}/?term=<...>   -> tiquete + id
   -> GET /api/parking/ticket/<id>/pay-checkout/                  -> monto
```

El cálculo del monto (tarifa plena, nocturna, convenios, promociones) vive
íntegro en `ParkingTicketPayAutoCheckout` y **nunca se tocó** en las sesiones
anteriores. Nuestra plataforma **no lo replica**: lee el valor y lo muestra.

## 4. Identificadores por tipo de vehículo — definidos

| Tipo | Identificador | Ruta |
| --- | --- | --- |
| Carro | Placa | `find-ticket/car/?term=<placa>&exact=true` |
| Moto | Número de tiquete | `find-ticket/moto/?term=<nro>&by=id&exact=true` |
| Bicicleta | Número de tiquete | `find-ticket/bike/?term=<nro>&exact=true` |
| Patineta | Número de tiquete | `find-ticket/bike/?term=<nro>&exact=true` |

Confirmado contra el código de Nova Parking (`parkingManager/views.py`), no
supuesto:

- `FindParkingTicketMoto` busca por placa salvo que llegue `by=id`, parámetro
  que agregaron para este kiosco porque la lectura de placa de moto no es fiable.
- `FindParkingTicketBike` filtra los tiquetes **sin placa** y siempre busca por
  el id del tiquete, así que sirve para bicicleta y patineta sin `by`.
- `_exact_match` hace que `exact=true` cambie `startswith` por igualdad. Se manda
  siempre: por prefijo, `term=3` devuelve 30, 31, 36… y cobrarle al vehículo
  equivocado no tiene vuelta atrás.

Que esté definido no lo vuelve rígido: la regla sigue siendo configurable por
parqueadero y por tipo de vehículo (`VehicleSearchRule`) — tipo de dato, ruta,
parámetros extra y el texto que ve el cliente se escriben desde la
administración. Si otro sitio numera distinto, se configura y ya, sin desplegar.

Vale la pena registrar el bug que originó la duda: el botón "Moto" del kiosko C#
usaba teclado numérico y llamaba a `find-ticket/bike/`, o sea **nunca buscó por
placa**. Cuando la Fase 2 del módulo QR restringió ese endpoint a tiquetes *sin*
placa, el botón dejó de encontrar motos reales. Eso deja claro que en ese sistema
la relación entre tipo de vehículo, identificador y ruta no es obvia, y es
justamente por lo que aquí no se da nada por supuesto.

Pendiente del cliente, no de código: cómo se lee el identificador a la salida.
La interfaz acepta el dato digitado, que funciona con cualquier lector que actúe
como teclado.

## 5. La app `payments/` del sistema existente — no la usamos

Ese sistema tiene una app `payments/` con su propio cliente de SIPConnector,
construida para su kiosko de escritorio. **No la consumimos**: nuestro kiosco
tiene su propio datáfono y su propia integración.

Queda anotado aquí solo para que nadie la reconecte por error creyendo que hace
falta. Lo único que le pedimos a ese sistema son tiquetes, tarifas y la
confirmación del pago.

## 6. Lo que aporta la nueva plataforma

| Necesidad                            | ¿Existe en Nova Parking? |
| ------------------------------------ | ------------------------ |
| Cálculo de tarifas                   | Sí — se reutiliza        |
| Cobro con datáfono                   | **No** — es del kiosco   |
| Registro en caja y marcado de salida | Sí — se reutiliza        |
| Autenticación con roles              | Parcial (Admin/Cashier)  |
| Multi-parqueadero con aislamiento    | **No**                   |
| Punto de pago web                    | **No**                   |
| Idempotencia de cobros               | **No**                   |
| Auditoría de operaciones             | **No**                   |
| Facturación SIIGO del pago           | **No**                   |
| Gestión de credenciales cifradas     | **No**                   |
| Despliegue en la nube                | **No**                   |

---

## 7. Reparto de responsabilidades

**Somos un kiosco de autoservicio a la salida del parqueadero**, con pantalla y
datáfono propios. Lo opera **el cliente**: no hay nadie del parqueadero
atendiéndolo. El sistema del parqueadero no cobra con tarjeta ni comparte
terminal.

Que sea autoservicio no es un detalle de presentación, decide comportamiento:

| Decisión | Por qué |
| --- | --- |
| Los textos hablan al cliente | Quien lee la pantalla vino a pagar, no es técnico. Un "avisa al administrador" no le sirve: se le dice que se acerque a la oficina |
| La pantalla vuelve sola al inicio (15 s) | Si se quedara en el comprobante anterior, el siguiente encontraría datos ajenos |
| Se reinicia por inactividad (90 s) | Alguien empieza a escribir su placa y se va; la pantalla no puede quedarse con sus datos |
| No hay botón de salir a la vista | Se abre manteniendo pulsado el nombre del parqueadero 3 s, y pide contraseña. Un botón visible lo pulsaría cualquiera y dejaría la caja fuera de servicio |
| La terminal nunca se muestra | Es información confidencial de cara al público |
| Con un cobro vivo no se puede salir de la pantalla | El cliente puede tener la tarjeta dentro del datáfono |

| Quién | Qué hace |
| --- | --- |
| Sistema del parqueadero | Tiquetes, tarifas y valor a cobrar. Registrar el pago y liberar el vehículo. |
| Esta plataforma | Identidad y roles, la pantalla del kiosco, el cobro contra el datáfono, y la facturación. |

```
Cliente en el kiosco (salida del parqueadero)
   |
Plataforma (Next.js)
   |--- consulta vehículo y monto ---> Sistema del parqueadero (por su túnel)
   |--- ordena el cobro -------------> SIPConnector ---> Datáfono propio (serial)
   |--- confirma el pago -----------> Sistema del parqueadero
   |--- factura --------------------> SIIGO
```

### Por qué el cobro es nuestro y no del sistema del parqueadero

Porque ese sistema **no maneja pagos con tarjeta**. El datáfono es del kiosco, y
el kiosco es esta plataforma. Delegarlo habría añadido un salto de red y una
dependencia sin ganar nada.

### El datáfono es exclusivo, y eso simplifica

El manual (Anexo 4) devuelve `Cod:06 Ya existe una transacción asignada a esta
terminal`: una terminal admite **una sola transacción viva**. Como el aparato es
solo nuestro, una operación colgada ahí solo puede ser nuestra, así que se libera
con `Borrar` y se reintenta automáticamente. Si el datáfono fuera compartido, ese
reintento podría interrumpir el cobro de otro sistema y no sería seguro hacerlo.

### El datáfono es serial: no cobra solo

La orden queda puesta en la nube y alguien tiene que iniciarla en el aparato. Por
eso la pantalla sigue las etapas reales del servicio en vez de decir
"procesando":

| Código | Etapa | Qué se muestra |
| --- | --- | --- |
| `Cod:00` sin datos | Orden puesta | "Pulsa INICIAR COBRO en el datáfono" |
| `Cod:01` | El aparato la tomó | "Sigue las indicaciones del datáfono" |
| `Cod:02` | Leyendo la tarjeta | "Pasa, inserta o acerca la tarjeta" |
| `Cod:00` con datos | Resuelta | Aprobado o rechazado |

Con una transacción iniciada no se puede abandonar la pantalla, y si el navegador
se recarga el cobro se retoma: el cliente puede tener la tarjeta dentro.

### Verificado contra los servicios reales

Los cinco métodos de SIPConnector responden con las credenciales del comercio:
`Version` → `1.5.5` (y **solo por GET**: con POST da 405, pese a que el manual
dice que todos son POST), `Token` válido con vigencia de 3 minutos,
`EnviarDatos` → `Cod:00,Msj:OK`, `Respuesta` y `Borrar` correctos. La trama de
compra sigue los 20 campos del Anexo 1.1.

## 8. Stack elegido y por qué

| Decisión                    | Motivo                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| **Next.js 15 (App Router)** | Un solo desplegable para UI y API. El navegador nunca ve las credenciales porque toda integración corre en servidor. |
| **TypeScript estricto**     | Los contratos con dos APIs externas ambiguas se vuelven verificables.   |
| **PostgreSQL + Prisma**     | Los pagos exigen transacciones y restricciones únicas reales. La idempotencia se apoya en una PK. |
| **Sesión propia: JWT + tabla `sessions`** | El JWT se valida en el edge sin tocar la BD; la fila permite **revocar** al instante al desactivar un usuario. |
| **Argon2id**                | Recomendación OWASP para contraseñas.                                  |
| **AES-256-GCM**             | Cifrado de credenciales en base de datos.                              |
| **Tailwind v4**             | Una identidad visual, dos densidades: admin compacto, kiosko táctil.   |

Base de datos **separada** de la de Nova Parking, como pide `CLAUDE.md` §19: el
sistema existente se trata como fuente externa. La única llave de unión es
`Payment.externalTicketId`, que **no** es una foreign key.

## 9. Riesgos técnicos identificados

| Riesgo | Mitigación implementada |
| ------ | ----------------------- |
| **Doble cobro** por doble clic, refresh o reintento | Clave de idempotencia por intento (PK en BD) + verificación de cobro en curso por tiquete |
| **Monto manipulado** desde el navegador | El monto nunca viaja en la petición: se reconsulta a Nova Parking antes de cobrar. Le pedimos a Edier revalidarlo también |
| **Monto aprobado distinto al cobrado** | Anexo 2 exige validarlo: si difiere, el pago se marca FAILED para revisión, no APPROVED |
| **Fuga entre parqueaderos** | El `parkingLotId` se deriva del usuario en BD, nunca de la petición. Probado con dos parqueaderos |
| **Cobro perdido por fallo de red** | Un error consultando el estado **no** resuelve el pago: sigue pendiente y se reintenta |
| **Estado desconocido del proveedor** | Se trata como pendiente, nunca como aprobado |
| **Fallo de facturación** | Nunca invalida el cobro: la factura queda PENDING/FAILED con motivo |
| **Secretos en logs** | `scrubSecrets()` filtra en profundidad antes de escribir logs y auditoría |
| **Errores técnicos visibles al usuario** | `AppError` separa mensaje público de detalle técnico |
| **Sesión robada tras desactivar un usuario** | Sesiones revocables en BD, no solo por expiración del token |
| **Tiquete bloqueado para siempre** por un cobro colgado | Un cobro vivo impide otro sobre el mismo tiquete; si supera los 45 min y el sistema del parqueadero ya no lo tiene, se cierra como expirado con motivo, en vez de dejar el vehículo incobrable |
| **Cobro dirigido al datáfono equivocado** | El punto de pago se resuelve en el servidor y las credenciales del datáfono salen de la configuración del sitio, nunca de la petición |
| **Terminal ocupada por una operación colgada** (`Cod:06`) | El datáfono es exclusivo del kiosco, así que se libera con `Borrar` y se reintenta automáticamente; la caja no queda bloqueada esperando intervención manual |
| **Cliente con la tarjeta puesta y pantalla perdida** | Con una transacción viva no se puede abandonar la pantalla, y al recargar se retoma el cobro en curso |
| **Prisma en el Edge Runtime** | El middleware solo importa la verificación del token (`lib/auth/jwt.ts`), sin acceso a base de datos |

## 10. Pendientes que NO se inventaron

Siguiendo `CLAUDE.md` §37, estos quedan marcados y visibles en la interfaz:

**SIIGO — RESUELTO** (2026-08-28). El payload de ejemplo entregado es de un
kiosco de hamburguesas, así que sus ids no servían. En vez de inventarlos se
consultaron los catálogos reales del ambiente con las credenciales entregadas
(`scripts/siigo-setup.ts`) y se eligieron:

| Campo | Valor | De dónde salió |
| --- | --- | --- |
| `document.id` | `27939` | El único tipo de comprobante que el ambiente acepta por API — se probaron los 71 electrónicos y todos responden `document_settings` |
| `seller` | `916` | El usuario de las credenciales entregadas |
| `payments[].id` | `9441` | **"Datafono Redeban"**, que ya existía en el catálogo y es exactamente nuestro medio de cobro |
| `items[].code` | `PARQUEADERO` | Servicio creado por nosotros en el grupo "Servicios" |

Probado de punta a punta: facturas reales emitidas con URL pública, por el valor
exacto que devuelve el sistema del parqueadero.

**IVA:** el producto se creó con IVA 19% **incluido en el precio**
(`tax_included: true`). Es deliberado: el total facturado debe ser exactamente
lo que ya se le cobró al cliente en el datáfono, así que el impuesto se desagrega
por dentro en vez de sumarse encima. **El tratamiento tributario debe
confirmarlo el contador del cliente**; se cambia desde `/admin/integraciones`
sin tocar código.

**Pendiente real para producción:** el `document.id` de arriba es el que acepta
el sandbox compartido. En producción hay que poner el tipo de comprobante del
cliente, con su resolución DIAN. Si ese requiere numeración manual (como el
`28109` del ejemplo entregado, que pide el campo `number`), hay que definir de
dónde sale el consecutivo — no lo inventamos.

**Redeban** — las credenciales entregadas son de sandbox y a nombre de
Farmatodo/Quikly (código único `<codigo unico de pruebas>`, terminal `<terminal de pruebas>`), no del
parqueadero. Además, en la cadena `DATA` de ejemplo `Valor Venta = 100` pero
`Valor Total = 10`, lo cual es inconsistente. Ambas cosas hay que confirmarlas.

> La cadena `DATA` sí mapea exacto a los 20 campos de "Compra" del Anexo 1:
> `TipoOp, ValorVenta, IVA, Impoconsumo, Propina, Total, Factura, Cajero,
> Combustible, Kilometraje, Galones, Terminal, Caja, BaseDevIVA, BaseImpo,
> ReciboCliente, Vigencia, Persiste, CodUnicoMulticomercio, Ubicación`.

**Nova Parking** — la forma exacta de las respuestas JSON no está documentada. Se
implementó un normalizador tolerante y el contrato asumido está en
`REQUERIMIENTOS_EDIER.md` §4 para que Edier lo confirme.

**Del cliente** — tarifa real de bicicleta/patineta, método de escaneo del QR, y
si se requieren anulaciones.

## 11. Estado por fase

| Fase | Estado |
| ---- | ------ |
| 1. Descubrimiento | Completa — este documento |
| 2. Arquitectura | Completa |
| 3. Autenticación, roles y usuarios | Completa y probada |
| 4. Integración con el parqueadero | Completa contra el simulador; falta el enlace real |
| 5. Punto de pago | Completa y probada — 4 tipos de vehículo, por caja, vertical y horizontal |
| 6. Redeban | Orquestación completa; falta el cobro real con credenciales |
| 7. SIIGO | **Completa y probada** — facturas reales emitidas contra el ambiente |
| 8. Dashboard | Completa (historial con filtros + auditoría) |
| 9. Seguridad y pruebas | Verificaciones manuales hechas; faltan pruebas automatizadas |
| 10. Despliegue | `npm run build` limpio; falta la infraestructura |
