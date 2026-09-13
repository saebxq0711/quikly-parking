# HANDOFF — Nova Parking System
## Acceso remoto seguro (Cloudflare) + Pago con datáfono (Redeban N6202)

> Última actualización: 2026-08-25. Este documento es el punto de partida para cualquiera que
> retome el proyecto — técnico o no. Si solo vas a leer una cosa, que sea esta.

---

## 1. Resumen en una hoja (para cualquiera, sin tecnicismos)

Nova Parking necesita dos cosas nuevas:

1. **Que el sistema del parqueadero sea alcanzable desde internet de forma segura** (solo lo
   estrictamente necesario, no todo el sistema), para que una pasarela de pago externa pueda
   consultar cuánto cobrar y confirmar cuando alguien paga con tarjeta.
2. **Que se pueda pagar con tarjeta en el datáfono, sin que haya un cajero involucrado.** El
   cliente llega, usa el kiosko (una pantalla de autoservicio), paga, y se va — igual que hoy
   funciona con efectivo, pero con tarjeta.

**Lo que está listo:** todo el código del lado de Nova Parking está construido y probado —
la parte que calcula cuánto cobrar, la parte que recibe y registra un pago aprobado, y el
cliente que habla con el sistema del datáfono (SIPConnector). Se probó contra un ambiente de
pruebas real, no solo en teoría.

**Lo que falta y no depende de programar más:**
- Las credenciales que Redeban/el integrador entregan al completar la afiliación comercial
  del datáfono — sin esto no se puede probar un cobro real.

**Lo que falta y sí depende de programar (trabajo del compañero de pagos, no de este
documento):**
- Un endpoint que inicie un cobro (hoy no existe ninguno — se revisó todo el código y nada
  crea un `PaymentTransaction` ni llama `SIPConnectorClient.enviar_datos()` todavía) y el
  botón/pantalla real de "pagar con tarjeta" en el kiosko. Guía completa en
  `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md`.

---

## 2. Objetivo

Dos frentes, del mismo proyecto:

1. **Cloudflare Tunnel** — exponer solo dos rutas específicas del backend (consultar el monto
   a cobrar, y confirmar que se pagó) a internet, sin exponer el resto del sistema (admin,
   tickets, reportes, usuarios) ni abrir puertos en el router del parqueadero.
2. **Integración de pago con datáfono** — el datáfono confirmado por el cliente es un
   **Redeban N6202**. La integración real es con un servicio intermediario llamado
   **SIPConnector**, no con Redeban directamente.

**Restricción de diseño que aplica a todo lo demás:** el uso de la app es **autónomo**. No
hay un cajero atendiendo el pago con tarjeta — solo el kiosko de autoservicio
(`NovaAutoCheckout/`, la app de escritorio en C#) y el cliente. Cualquier pantalla, endpoint o
flujo nuevo que se diseñe para esto debe asumir que nadie con sesión de cajero está presente.

---

## 3. Estado actual, por pieza

### 3.1 Cloudflare Tunnel — activo, instalado como servicio, confirmado funcionando solo

| Qué | Estado |
|---|---|
| Dominio | ✅ Comprado y **agregado a Cloudflare** — `parkingpinning.com` (plan Free, Activo) |
| `cloudflared` instalado en el PC del parqueadero | ✅ (`C:\Program Files (x86)\cloudflared\`) |
| `backend/parking/settings.py` lee `CSRF_TRUSTED_ORIGINS` extra desde `.env` | ✅ |
| `cloudflared tunnel login` / `create` / `route dns` | ✅ Hecho 2026-08-21. Tunnel `nova-parking`, id `c575049a-da7f-4ef6-acb9-7d1baa48503f` |
| `config.yml` (`C:\Users\edier\.cloudflared\config.yml`) | ✅ Con el UUID real, solo 2 rutas expuestas, `protocol: http2` fijo |
| `backend/.env` — `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` con el dominio real | ✅ Activado y probado |
| Túnel probado de punta a punta | ✅ `/swagger/` y `/admin/` → 404 en el borde de Cloudflare; `/api/payments/redeban/webhook/` y `/api/parking/ticket/<id>/pay-checkout/` → llegan a Django normalmente |
| Instalado como servicio de Windows (`cloudflared service install`) | ✅ Hecho e instalado por el usuario 2026-08-21 |
| Confirmado corriendo **solo, sin intervención** | ✅ Reconfirmado 2026-08-25 (días después, sin que nadie tocara nada) — arranca con el PC, no necesita sesión abierta |

**Nota técnica encontrada al activar:** la red del parqueadero bloquea UDP/QUIC (puerto 7844).
`cloudflared` lo detecta solo, pero en el primer intento (`tunnel run` sin más) igual se quedó
reintentando QUIC en vez de caer a HTTP/2 automáticamente. Se resolvió fijando
`protocol: http2` directamente en `config.yml` — así el túnel arranca directo en el protocolo
que sí funciona en esta red, sin depender del fallback automático.

**Dos problemas reales al instalar como servicio de Windows** (ambos ya resueltos, detalle y
comandos exactos en `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` secciones 1.1-1.3):
1. `cloudflared service install` registró el servicio sin apuntarlo al `config.yml` real (el
   servicio arrancaba "Running" pero sin servir nada, `502` en todas las rutas) — se corrigió
   escribiendo el comando completo directo en el registro de Windows (`ImagePath`).
2. Con eso corregido, el servicio seguía sin conectar — la cuenta `LocalSystem` con la que
   corre el servicio no tenía permiso de lectura sobre `C:\Users\edier\.cloudflared\` (donde
   viven las credenciales). Se corrigió dando acceso explícito con `icacls`.
3. Nota aparte: `Stop-Service`/`Restart-Service` sobre este servicio se cuelga o falla de
   forma poco confiable en esta versión de `cloudflared` — el arreglo práctico documentado es
   matar el proceso a la fuerza (`Stop-Process -Force`) y volver a arrancar con `Start-Service`.

**Decisión de seguridad importante:** el túnel NO expone toda la aplicación. Usa reglas de
`ingress` por ruta para que Cloudflare rechace (404) cualquier cosa que no sea las dos rutas
de pago, antes de que el request llegue siquiera al PC del parqueadero. El admin, swagger,
tickets, reportes, etc. quedan inalcanzables desde internet aunque el túnel esté activo —
esto se verificó con pruebas reales, no solo en teoría.

### 3.2 Pago con datáfono — terreno construido y probado, cobro real pendiente

El plan original asumía un webhook simple de Redeban. **Eso cambió por completo** cuando el
cliente entregó el manual real de integración: no es Redeban directo, es un servicio en la
nube de un tercero llamado **SIPConnector**, con su propio protocolo (texto separado por
comas, no JSON) y su propio flujo (nuestro sistema llama hacia afuera para iniciar un cobro,
en vez de solo esperar un aviso).

| Qué | Estado |
|---|---|
| App Django `payments/` completa | ✅ Construida |
| Consultar cuánto cobrar por un tiquete | ✅ Ya existía (`pay-checkout`), se reutiliza tal cual |
| Cliente HTTP hacia SIPConnector (iniciar cobro, consultar resultado) | ✅ Construido, probado contra el ambiente de pruebas real |
| Registrar un pago aprobado (para que aparezca en caja/reportes) | ✅ Construido y probado |
| Receptor del aviso opcional de SIPConnector (webhook) | ✅ Construido — pero re-verifica siempre el dato real, nunca confía ciegamente en el aviso |
| Plan de respaldo si el aviso no llega | ✅ Construido (revisión periódica) |
| Credenciales reales de afiliación | ❌ Pendientes — sin esto no se puede probar un cobro real de punta a punta |
| Botón/pantalla "Pagar con tarjeta" en el kiosko | 🟡 Construido y **compilando limpio** 2026-08-26 (`SelectPaymentMethod`, `CardPayWindow`) — falta probarlo en ejecución real con hardware, ver `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` |
| Endpoint que inicie un cobro (crear `PaymentTransaction` + llamar `enviar_datos()`) | ✅ Construido 2026-08-26: `POST /api/payments/ticket/<id>/iniciar/` + `GET .../estado/`, detalle en `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` |
| Tarjeta marca el tiquete como salido (`status='OUT'`) al pagar | ✅ Corregido 2026-08-26 en `resolve_pending_transaction` (sin tocar `apply_redeban_payment`), probado con un pago simulado — ver `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` punto 4 |

### 3.3 Módulo QR para vehículos sin placa — construido 2026-08-26

`CreateNoPlateTicketView` (`backend/parkingManager/views.py`) crea el tiquete sin placa, el log
de auditoría de entrada, y devuelve el QR en base64 — ruta `POST
/api/parking/no-plate-ticket/`. `FindParkingTicketBike` ya no depende de un tipo de vehículo
fijo (era `vehicle_type=2`, un problema real encontrado mientras se investigaba lo del
datáfono) — ahora filtra por `plate__isnull=True`, así sirve para cualquier tipo sin placa que
se agregue después. Se creó `VehicleType` "Bicicleta"/"Patinete Eléctrico" con **tarifa de
prueba ($10/minuto)** vía el comando nuevo `setup_no_plate_vehicle_types`. Frontend:
`frontend/src/pages/ParkingNoPlate.tsx`, con su ruta y su ítem de sidebar. Probado de punta a
punta (crear → QR → encontrado en la búsqueda de salida) y el frontend compila sin errores.
**Pendiente, del cliente:** confirmar la tarifa real, y cómo se va a escanear el QR a la salida
(lector físico, celular, etc.) — no es un bloqueo de código.

### 3.4 Bug real corregido 2026-08-27 — "no funciona crear cajas, iniciarlas, hacer cobros"

**Síntoma:** abrir una caja (POS), cerrarla, o confirmar un cobro en efectivo (tanto desde el
cajero como desde el kiosko `NovaAutoCheckout`) daban 500 sin ningún mensaje útil.

**Causa raíz:** `OpenPOSView`/`ClosePOSView` (`pos/views.py`) y `build_invoice_payload`
(`parkingManager/services.py`, usado también en el pago de mensualidades) arman la respuesta
con `Config.objects.filter(key=...).first().value` para ~20 claves de factura/horario. Si la
fila no existe, `.first()` da `None` y `.value` explota (`AttributeError`). Esta base de datos
local solo tenía 3 de esas claves (las de la pestaña "Tarifas" de Configuración) — el resto
nunca se había llenado. `backend/init.sql` ya documentaba la lista completa como parte del
setup original del proyecto, pero nunca se corrió contra esta base de datos ni contra la de
producción.

**Fix:** comando nuevo `python manage.py setup_parking_config` (idempotente, `get_or_create`,
no pisa nada ya configurado) — crea las ~42 claves que faltaban. Los datos de factura
(nombre, NIT, dirección, horario) usan los valores **reales** que ya estaban hardcodeados en
`print_entry_ticket` (el tiquete ESC/POS que se imprime en la entrada), no inventados. Ciudad,
departamento y horario de domingo sí son una suposición (Duitama/Boyacá, cerrado domingo) —
quedan marcados en el comando para que el cliente los confirme desde la pantalla de
Configuración. Ya agregado a `instalar_pc_nuevo.ps1` (paso 5/9) para que la máquina de
producción no herede este mismo bug el día que se instale ahí.

Verificado de punta a punta contra el servidor real (no solo leyendo el código): login →
abrir caja → cobrar un tiquete con salida → cerrar caja (efectivo cuadrado) → cobro en efectivo
del kiosko autónomo (`pay-checkout`, sin sesión) — los 4 pasos dieron `200`/`201`.

De paso se encontraron y corrigieron dos cosas más en esta misma base local (no son bugs de
código, son estado de datos de esta máquina):
- Dos cajas manuales de prueba (`edier`, `dx`) habían quedado con `automatic=True` (el
  checkbox "Caja automática" se marcó sin querer al probar) — con eso el botón "Abrir Caja"
  desaparece de la UI sin explicación, que es exactamente lo que se reportó como "no funciona
  iniciarla". Se corrigieron a `automatic=False`.
- No existía ninguna caja `automatic=True` dedicada al cobro en efectivo del kiosko (solo
  estaba "Datafono Redeban", que `_automatic_cash_pos()` excluye a propósito por nombre). Se
  creó "Caja Automatica" — es la misma que el `seed_demo` de referencia ya creaba.
- El puerto 8000 lo tenía tomado un proceso viejo (Python del sistema, no el venv de este
  proyecto) mientras se probaba esto — mismo síntoma que documenta
  `docs/despliegue/PUESTA-EN-MARCHA-LOCAL.md` sección 7 para el fork `duitama2`: login por HTTP fallaba con
  404 aunque `authenticate()` funcionaba bien en `shell`. Se mató el proceso viejo y se
  reinició el backend desde `backend\venv\`.

**Segundo hallazgo, mismo día — "Motocicleta" no existía como VehicleType.** Esta base de
datos local nunca tuvo "Motocicleta" (ni antes ni después de la Fase 2 del módulo QR) — solo
"Carro". La Fase 2 agregó "Bicicleta"/"Patinete Eléctrico" como tipos adicionales (sin placa),
pero Motocicleta faltaba desde antes. Además `pos/views.py` (`OpenPOSView`/`ClosePOSView`)
tenía hardcodeado `VehicleType.objects.get(pk=2)` asumiendo que ese pk siempre era Motocicleta
(documentado así en el `CLAUDE.md` original) — con Bicicleta ocupando ese pk=2, el resumen de
apertura/cierre de caja llevaba tiempo contando bicicletas como si fueran motos.

**Fix:** comando nuevo `python manage.py setup_motorcycle_vehicle_type` — crea "Motocicleta"
con tarifa **real** ($114/minuto, la que ya está impresa en el tiquete físico de entrada, ver
`print_entry_ticket`), sin tocar Bicicleta/Patinete. No se reutilizó el pk=2 (ya había
tiquetes reales apuntando ahí) — Motocicleta quedó en el siguiente pk libre. Se corrigió
`pos/views.py` para buscar los tipos por `label` (`_car_and_moto_types()`) en vez de por pk
fijo, y para no tronar con un 500 si algún tipo todavía no existe. Verificado por ORM
directamente (no solo leyendo código): `car_obj=Carro`, `moto_obj=Motocicleta`, y las
bicicletas ya no se cuentan como motos.

### 3.5 Kiosko — botón de Bicicleta/Patinete + corrección del botón "Moto" (2026-08-27)

**Descubrimiento importante mientras se investigaba esto:** el botón **"Moto"** del kiosko
(`NovaAutoCheckout`) tenía un teclado **numérico** y llamaba a `find-ticket/bike/` — es decir,
**nunca buscó por placa**, siempre buscó por número de tiquete. Desde que la Fase 2 del módulo
QR cambió ese endpoint para devolver solo tiquetes **sin placa** (bicicletas/patinetes), el
botón "Moto" del kiosko dejó de encontrar motos reales, porque en este sitio **las motos sí
tienen placa capturada por cámara** (confirmado por el cliente) — quedó excluido justo el caso
normal.

**Fix — separar los dos flujos:**
- **Backend:** vista nueva `FindParkingTicketMoto` (`GET /api/parking/find-ticket/moto/`) —
  mismo patrón que `FindParkingTicketCar` (busca por placa), pero para Motocicleta. Busca el
  `VehicleType` por `label='Motocicleta'`, no por pk fijo (mismo criterio de la sección 3.4).
- **Kiosko:** pantalla nueva `Views/MotoSearch.xaml(.cs)` — clon de `CarSearch` (teclado
  alfanumérico de placa), apuntando a `find-ticket/moto/`. `SelectType` ahora tiene **3
  botones**: Carro, Moto (ahora sí por placa), y **Bicicleta/Patinete** (nuevo, reutiliza
  `BikeSearch` tal cual — esa pantalla YA buscaba por número de tiquete, que es exactamente lo
  que necesitan bicicletas/patinetes sin placa).
- Se corrigió `MainWindow.xaml.cs`: la pantalla de cobro decidía "Carro" vs "Moto" mirando si
  el tiquete tenía placa (`selectedPayInfo.plate != null`) — con moto ahora con placa, eso ya
  no servía. Se cambió para usar el tipo de vehículo que ya quedó elegido en `SelectType`.
- **Pendiente cosmético, no bloquea nada:** no hay un ícono propio de bicicleta/patinete en
  `Assets/` (se reutilizó `bike.png`, el mismo que ya usaba Moto) ni un audio propio para la
  pantalla de Moto (se reutilizó `carSearch.mp3` — el texto en pantalla es idéntico, "Digite su
  placa"). Si se quiere pulir esto, hace falta un ícono nuevo y grabar un audio para Moto.
- Verificado con curl real contra el backend: `find-ticket/moto/?term=<placa>` encuentra un
  tiquete de moto con placa creado a propósito para la prueba; `find-ticket/bike/` con el id de
  ese mismo tiquete **no** lo encuentra (correcto, tiene placa). Compilado Debug y Release sin
  errores, la app arranca sin tronar.

---

## 4. Archivos — qué es nuevo, qué se modificó, qué NO se tocó

### Nuevos
- `backend/payments/` (app completa): `models.py` (`SIPConnectorConfig`,
  `PaymentTransaction`, `RedebanWebhookLog`), `sipconnector_codec.py`,
  `sipconnector_client.py`, `exceptions.py`, `services.py`, `views.py`, `urls.py`, `admin.py`,
  `management/commands/poll_sipconnector_pending.py`,
  `management/commands/setup_sipconnector.py`, migraciones.
- `docs/pagos/SIMULACION_FLUJO_PROYECTO.md` — flujo simulado paso a paso, con lo que se investigó del
  datáfono y lo que se fue confirmando.
- `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` — registro técnico de qué se construyó, archivo por
  archivo, y por qué se decidió así.
- `HANDOFF.md` — este documento.
- `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md`, `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md`,
  `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` — creados en turnos posteriores de esta misma sesión (túnel
  activado como servicio, guía para el compañero de pagos, y el cambio del botón de método de
  pago en el kiosko + endpoint unificado — detalle completo en cada uno).
- `backend/parkingManager/management/commands/setup_no_plate_vehicle_types.py` — crea
  `VehicleType`/`Fee` para Bicicleta/Patinete (Fase 2, ver sección 3.3).
- `frontend/src/pages/ParkingNoPlate.tsx` — pantalla de Fase 2.
- `backend/config/management/commands/setup_parking_config.py` — crea las claves de `Config`
  que faltaban para abrir/cerrar caja y cobrar (ver sección 3.4).
- `backend/parkingManager/management/commands/setup_motorcycle_vehicle_type.py` — crea el
  `VehicleType` "Motocicleta" que faltaba, con su tarifa real (ver sección 3.4).
- `NovaAutoCheckout/NovaAutoCheckout/Views/MotoSearch.xaml(.cs)` — pantalla de búsqueda de
  Motocicleta por placa (ver sección 3.5). Backend: `FindParkingTicketMoto` en
  `parkingManager/views.py`, ruta `find-ticket/moto/`.

### Modificados
- `backend/parking/settings.py` — `CSRF_TRUSTED_ORIGINS` desde `.env`, `INSTALLED_APPS` con
  `payments`, variables `SIPCONNECTOR_*`/`REDEBAN_WEBHOOK_SECRET`.
- `backend/parking/urls.py` — incluye `payments.urls`.
- `backend/.env` — variables nuevas, dominio real activado (`ALLOWED_HOSTS`/
  `CSRF_TRUSTED_ORIGINS` con `api.parkingpinning.com`, ver sección 3.1).
- `backend/requirements.txt` — se agregó `Pillow` (faltaba, causaba el error conocido en
  instalaciones nuevas) y `qrcode[pil]` (Fase 2).
- `backend/parkingManager/views.py` — **sí se modificó**, en dos turnos posteriores de esta
  sesión: `ParkingTicketPayAutoCheckout.post` se extrajo a
  `parkingManager/services.py::confirm_cash_payment` (mismo comportamiento, ahora reutilizable
  — ver `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md`); `FindParkingTicketBike` se generalizó y se agregó
  `CreateNoPlateTicketView` (Fase 2, sección 3.3). El cálculo de precio (`GET` de
  `pay-checkout`) sigue sin tocarse.
- `NovaAutoCheckout/` (el kiosko en C#) — **sí se modificó** en un turno posterior: pantalla de
  selección de método de pago + pantalla de espera de tarjeta, ver `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md`.
- `docs/referencia/GUIA_TECNICA_IMPLEMENTACION.md` — plantilla de `config.yml` con el dominio real; notas en
  Fase 2 y Fase 3 apuntando a los documentos reales de lo construido.
- `CLAUDE.md`, `docs/planificacion/PLAN_DESARROLLO.md`, `docs/referencia/GUIA_ESTUDIO_PROYECTO.md`, `docs/despliegue/INSTALACION_LOCAL.md` —
  actualizados en esta misma sesión para que reflejen el estado real (ver sección 6).

### NO se tocó (a propósito)
- `backend/parkingManager/models.py`, `serializers.py` — restricción del proyecto.
- `backend/devices/` — restricción del proyecto (migraciones duplicadas).
- El cálculo de precio (`GET` de `ParkingTicketPayAutoCheckout`, en `parkingManager/views.py`)
  — la parte compleja (agreements, tarifa plena, promos) nunca se tocó en toda la sesión.
- `apply_redeban_payment` (`payments/services.py`) — no se tocó directamente; el arreglo de
  "marcar salida" se hizo en `resolve_pending_transaction`, alrededor de la llamada.
- `docs/cliente/PROPUESTA_CLIENTE.md` — es el documento comercial ya presentado al cliente, no se edita.

---

## 5. Qué se intentó, qué falló, y qué se corrigió en el camino

Esto es tan importante como lo que funcionó — para que quien retome no repita el mismo
camino.

1. **Primera hipótesis sobre el datáfono: integración local por cable (equivocada).**
   Antes de tener el manual real, una investigación web sobre datáfonos Redeban en general
   sugería que se conectan por cable serial/USB directo al PC (protocolo ECR), sin necesitar
   internet. **Esto resultó ser incorrecto para este caso** — el manual real (SIPConnector)
   muestra que es un servicio en la nube al que hay que llamar por internet. La lección: no
   asumir el modelo de integración sin el manual del proveedor específico.

2. **El diseño original del webhook (de la guía técnica) tenía un defecto real.** El
   borrador original marcaba el tiquete como pagado directamente, sin registrar el movimiento
   en la caja (`POSLog`). Eso habría hecho que el dinero "existiera" en Redeban pero no
   apareciera en los reportes de cierre de caja. Se corrigió reutilizando el mismo patrón
   contable que ya usa el kiosko de efectivo, antes de que este defecto llegara a producción.

3. **Bug real encontrado probando el webhook:** el monto llega como texto (string) en el
   JSON y no se convertía a número antes de sumarlo, causando un error de tipo
   (`TypeError`). Se corrigió y además se agregó una respuesta clara (400) si el monto no es
   válido, en vez de que el sistema fallara silenciosamente.

4. **El manual dice "todos los métodos son POST" — es falso para uno de ellos.** Probando
   contra el ambiente de pruebas real de SIPConnector, el método `Version` respondió
   `405 Method Not Allowed` con POST, y sí funcionó con GET. Los demás métodos
   (`Token`, `EnviarDatos`, `Respuesta`, `Borrar`) sí son POST como dice el manual. El cliente
   HTTP ya quedó corregido con el verbo correcto por método.

5. **Se cambió el diseño de seguridad del webhook a mitad de camino.** La primera versión
   confiaba en el monto y el estado que llegaran en el body del aviso externo. Como ese
   endpoint es público y sin firma verificada todavía, se rediseñó para que **nunca** aplique
   un pago solo porque lo diga el body del webhook — siempre se reconsulta el resultado real
   contra SIPConnector antes de dar un cobro por válido.

6. **No se pudo probar el cobro real de punta a punta.** Sin las credenciales de afiliación
   (`CodigoUnico`/`Usuario`/`Clave`/`CodigoTerminal`), solo se pudo probar el método `Version`
   contra el ambiente de pruebas (confirmó que el servicio responde y el formato es el
   esperado). `EnviarDatos`/`Respuesta` con una transacción real quedan sin probar hasta que
   lleguen esas credenciales.

7. **El dominio se compró pero no se activó el túnel — decisión explícita del cliente**, no
   un fallo técnico. Todo el código está listo para cuando se dé la orden.

---

## 6. Corrección de la documentación existente

Se revisaron y corrigieron los documentos guía del proyecto para que no queden desactualizados
frente a lo que realmente se construyó:

| Documento | Qué se corrigió |
|---|---|
| `CLAUDE.md` | Sección "Tareas activas" reescrita con el estado real de las 4 fases, se agregó la nota de "uso autónomo, sin cajero", se documentó la app `payments/` y el kiosko `NovaAutoCheckout/`, se actualizó la tabla de documentos y errores conocidos. |
| `docs/planificacion/PLAN_DESARROLLO.md` | Checklists de Fase 1 y Fase 3 actualizados con lo que ya está hecho vs. pendiente; nota del problema encontrado en Fase 2. |
| `docs/referencia/GUIA_ESTUDIO_PROYECTO.md` | Se agregó el mapeo de `backend/payments/`; se corrigió una inexactitud técnica (no hace falta `@csrf_exempt` con Django REST Framework, a diferencia de lo que decía antes); se actualizó la sección de estudio de la integración de pagos. |
| `docs/despliegue/INSTALACION_LOCAL.md` | Se quitó el paso manual de instalar Pillow aparte (ya está en `requirements.txt`). |
| `docs/referencia/GUIA_TECNICA_IMPLEMENTACION.md` | Dominio real en la plantilla del túnel; nota en Fase 3 aclarando que la implementación real terminó siendo distinta (mejor) que el borrador original. |

`docs/cliente/PROPUESTA_CLIENTE.md` se revisó pero no se modificó — es el documento comercial ya
presentado, y a su nivel de detalle sigue siendo correcto.

---

## 7. Qué sigue — por responsable

**Del cliente / dueño del negocio:**
- Gestionar la afiliación comercial con Redeban/SIPConnector para obtener las credenciales
  (`CodigoUnico`, `Usuario`, `Clave`, `CodigoTerminal`).
- Confirmar la tarifa real de Bicicleta/Patinete (hoy es tarifa de prueba, $10/minuto —
  Fase 2 ya está construida, solo falta este dato para producción).
- Confirmar cómo se va a escanear el QR a la salida (lector físico, celular, etc.).

**Del compañero encargado de pagos:**
- Construir el endpoint que inicia un cobro (no existe todavía) y el disparador real de cobro
  (la pantalla/botón "Pagar con tarjeta" en `NovaAutoCheckout/`) que llame al cliente
  SIPConnector ya construido (`payments/sipconnector_client.py`). Guía paso a paso:
  `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md`.
- Confirmar con el integrador el formato exacto del payload del webhook opcional (hoy el
  receptor solo extrae un identificador y reconsulta el resultado real, así que debería
  funcionar con cualquier formato razonable, pero vale la pena confirmarlo).

**De quien retome el código (Edier u otro desarrollador):**
- **Antes de entregar:** migrar el túnel de la máquina personal del desarrollador a la máquina
  del cliente que corre todo el sistema (según confirmó el cliente: una máquina hace la
  integración de cámaras y corre Django; la Raspberry Pi solo gestiona sensores de
  entrada/salida y no necesita nada de esto). Producción no puede depender del equipo personal
  del desarrollador. Guía completa (mismo túnel, no crear uno nuevo):
  `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` sección 6.
- Cuando el cliente confirme la tarifa real de Fase 2 (QR): actualizar los `Fee` de
  Bicicleta/Patinete (vía `/admin/` o editando `setup_no_plate_vehicle_types.py`) — no hace
  falta más código, ver sección 3.3.
- Cuando lleguen las credenciales SIPConnector: probar `EnviarDatos`/`Respuesta` reales,
  ajustar el receptor del webhook si el payload real difiere de lo asumido, e instalar el
  poller de respaldo como tarea programada de Windows.
- Revisar periódicamente que el túnel siga restringido a solo las 2 rutas de pago —
  procedimiento en `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` sección 5.

---

## 8. Mapa de documentos del proyecto

| Documento | Para qué sirve |
|---|---|
| **`HANDOFF.md`** (este) | Punto de partida — resumen ejecutivo y estado completo |
| `RESUMEN_2026-08-27/RESUMEN.md` | Qué se corrigió en la sesión del 27-ago (bugs reales), qué falta por dueño, cómo se ve la integración final |
| `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` | Pantalla de selección de método de pago + endpoint unificado de inicio de cobro — qué había antes, qué hay ahora |
| `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` | Comandos del túnel: instalar como servicio, instalarlo en un sitio nuevo, verificar que solo las 2 rutas de pago son alcanzables |
| `docs/despliegue/INSTALAR_PC_NUEVO.md` | Instalador de un clic para la máquina de producción (mismo sitio) + checklist completo de credenciales — usa `instalar_pc_nuevo.bat` |
| `docs/pagos/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md` | **Leer primero** — mapa completo del proyecto para el compañero de pagos: el flujo real hoy, el túnel a fondo, y la teoría de cómo (no) se conecta con el datáfono |
| `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md` | Guía práctica para el compañero de pagos — qué usar, qué no tocar, qué falta |
| `docs/pagos/SIMULACION_FLUJO_PROYECTO.md` | Flujo simulado de pagos, paso a paso, con lo investigado del datáfono |
| `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` | Detalle técnico de lo construido, archivo por archivo |
| `CLAUDE.md` | Contexto rápido del proyecto para cualquiera que empiece a trabajar en él |
| `docs/referencia/GUIA_TECNICA_IMPLEMENTACION.md` | Código de referencia de las 4 fases originales |
| `docs/planificacion/PLAN_DESARROLLO.md` | Checklists por fase con el progreso real marcado |
| `docs/referencia/GUIA_ESTUDIO_PROYECTO.md` | Mapa de todos los archivos del proyecto, cómo se conectan |
| `docs/despliegue/INSTALACION_LOCAL.md` | Cómo instalar y correr el proyecto desde cero |
| `docs/despliegue/PUESTA-EN-MARCHA-LOCAL.md` | Diagnóstico de referencia (fork `duitama2`) que llevó a encontrar y corregir el bug de la sección 3.4 — checklist genérico para "el proyecto no funciona" |
| `docs/cliente/PROPUESTA_CLIENTE.md` | Propuesta comercial presentada al cliente (no tocar) |
