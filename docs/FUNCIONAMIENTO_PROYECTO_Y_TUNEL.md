# Cómo funciona Nova Parking hoy — guía completa para el compañero de pagos

> Escrito 2026-08-27. Este documento es para que entiendas **todo el proyecto de arriba a
> abajo** y, en detalle, **cómo funciona el túnel de Cloudflare y cómo se conecta (o no) con
> el datáfono** — esa es la parte que más confunde y la razón principal de este documento.
>
> Cuando termines de leer esto, para la parte práctica ("qué endpoint llamar, qué archivo no
> tocar, qué código ya existe") sigue con `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md` — ese
> es el manual de implementación. Este documento es el mapa completo antes de entrar al
> detalle.

---

## 1. Qué es Nova Parking, en una foto

Es el sistema completo de un parqueadero real (Duitama). Un monorepo con 5 partes:

```
duitama/
  backend/          Django + DRF + SQLite — el cerebro, corre en el puerto 8000
  frontend/         React — la app que usan los cajeros (entrada/salida, cajas, reportes)
  desktopApp/       Electron — empaqueta el frontend de arriba como programa de escritorio
  NovaAutoCheckout/ C# / WPF — el KIOSKO, pantalla táctil sin cajero, para que el cliente
                     pague solo (billetes hoy, tarjeta es lo que falta conectar)
  pi-entry/         Raspberry Pi — abre la barrera de ENTRADA, lee placas con cámara
  pi-exit/          Raspberry Pi — abre la barrera de SALIDA
```

**Todo vive en una sola máquina física** (más adelante será la máquina de producción en el
sitio, hoy es la máquina del desarrollador): ahí corre Django, el frontend, y es a la que le
habla el kiosko. Las Raspberry Pi son aparte y solo manejan sensores/barreras — no corren
Django, no te importan para tu parte.

---

## 2. El flujo real, hoy, tal como está construido

### 2.1 Entrada de un vehículo

Cámara ANPR (Hikvision) detecta la placa → Raspberry Pi de entrada llama a Django → Django
crea un `ParkingTicket` (`status='IN'`) → se abre la barrera. Un vehículo sin placa (bici,
patinete) se registra distinto: un cajero lo hace desde el frontend y le entrega al cliente un
QR (el ticket no tiene placa, el QR trae el id numérico).

### 2.2 Mientras está adentro

El ticket vive en `status='IN'`. No pasa nada hasta que el vehículo va a salir.

### 2.3 Cobro y salida — DOS caminos distintos hoy

**A) Con cajero** (`frontend/`, pantalla "Entrada / Salida", `parkingLogs.tsx`):
un operario humano busca el ticket, ve el monto, y elige método de pago (efectivo, tarjeta,
transferencia) en un desplegable. **Importante para vos:** ese selector de "Tarjeta" en esta
pantalla **no dispara ningún cobro real con el datáfono** — es solo una etiqueta contable, para
cuando el cajero ya cobró por otro medio (por ejemplo un datáfono normal de banco, aparte) y
solo quiere que quede registrado así en el reporte. No tiene nada que ver con SIPConnector.

**B) Sin cajero — el kiosko** (`NovaAutoCheckout/`): esta es la parte que sí te importa. El
cliente busca su ticket en la pantalla táctil, ve el monto, y elige método de pago
(`SelectPaymentMethod.xaml`, ya construido esta semana). Si elige efectivo, mete los billetes a
un lector físico (ITL) y ya — eso funciona hoy, de punta a punta, probado. Si elige tarjeta,
hoy llega a una pantalla (`CardPayWindow.xaml`) que todavía no dispara nada real — **ese es el
hueco que hay que llenar**, y de eso trata este documento.

```
Cliente en el kiosko
        │
        ▼
  Busca su ticket (placa o QR)
        │
        ▼
  "Seleccionar método de pago"
        │
   ┌────┴─────┐
   ▼          ▼
EFECTIVO    TARJETA
(funciona    (falta conectar
 hoy,        el cobro real —
 con ITL)    esto es lo tuyo)
```

---

## 3. El túnel de Cloudflare — a fondo

### 3.1 Qué problema resuelve

Django corre en una máquina normal, dentro de la red del parqueadero, sin IP pública — como
cualquier PC de oficina. Nadie de internet puede llegar hasta él directamente, y eso está bien
así (es más seguro). El problema es que **SIPConnector (el servicio de pagos, en la nube) sí
necesita poder avisarle a Django** cuando un cobro con datáfono se aprueba o se rechaza —  y
para eso necesita una URL pública a la que mandarle ese aviso.

Un túnel de Cloudflare resuelve exactamente eso: abre un canal seguro entre esta máquina y la
red de Cloudflare, y expone **solo las rutas que uno decide** bajo un dominio público — sin
abrir ningún puerto en el router, sin exponer el resto del sistema.

### 3.2 Cómo está armado hoy (ya construido, probado, no hace falta tocarlo)

| Dato | Valor |
|---|---|
| Dominio | `parkingpinning.com` |
| Subdominio expuesto | `api.parkingpinning.com` |
| Nombre del túnel | `nova-parking` |
| Corre como | Servicio de Windows (`Cloudflared`) — arranca solo con el PC, sin que nadie abra nada a mano |
| Rutas que SÍ pasan | `/api/parking/ticket/<id>/pay-checkout/` (consultar el monto) y `/api/payments/redeban/webhook/` (avisos de pago) |
| Todo lo demás | Da `404` **en el borde de Cloudflare** — ni siquiera llega a tocar la máquina del parqueadero |

Confirmado funcionando sin intervención humana, probado varios días después de instalado.
Comandos exactos para administrarlo / instalarlo en otra máquina:
`docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md`.

### 3.3 Cómo se ve desde afuera

```
Internet ──▶ Cloudflare (borde) ──▶ [ solo 2 rutas pasan, el resto 404 ] ──▶ túnel (servicio Windows)
                                                                                   │
                                                                                   ▼
                                                                    Django local (127.0.0.1:8000)
```

El resto del sistema (kiosko, cajero, admin, reportes) le sigue hablando a Django por la **red
local**, exactamente igual que si el túnel no existiera. El túnel no reemplaza nada de eso —
solo agrega esas 2 puertas de entrada desde internet.

---

## 4. LA TEORÍA — cómo se conecta (o no) el túnel con el datáfono

Esta es la parte que hay que tener clara antes de escribir una sola línea de código: **la
comunicación con SIPConnector va en dos sentidos distintos, y el túnel solo participa en UNO de
los dos.**

### 4.1 Sentido saliente — Django llama a SIPConnector (NO usa el túnel)

Cuando alguien (el kiosko, o la interfaz que vas a construir) le dice a Django "cobra $X para
este ticket", Django le hace una petición HTTPS normal a SIPConnector, como cualquier llamada a
una API externa (igual que cuando tu navegador visita cualquier página):

```
Django (esta máquina) ──HTTPS normal, sale a internet como cualquier browser──▶ SIPConnector (nube)
```

**Esto NO pasa por el túnel de Cloudflare.** El túnel sirve para que algo de AFUERA entre hacia
Django — no para que Django salga hacia afuera. Django ya sale a internet sin ayuda de nada
especial, como cualquier programa. Esta parte ya está construida:
`SIPConnectorClient.enviar_datos(ticket, monto)`.

### 4.2 Sentido entrante — SIPConnector le avisa a Django (AQUÍ SÍ entra el túnel)

Después de que el cliente pasa la tarjeta en el datáfono físico, SIPConnector necesita avisarle
a Django "listo, se aprobó" (o se rechazó). Para eso SIPConnector le manda un webhook —una
petición HTTP— a una URL pública. Esa URL pública es, precisamente, la que expone el túnel:

```
https://api.parkingpinning.com/api/payments/redeban/webhook/
```

Esa es la ÚNICA razón por la que existe el túnel en este proyecto. Sin túnel, SIPConnector no
tendría ninguna forma de tocar la puerta de esta máquina desde internet.

### 4.3 El flujo completo, de punta a punta

```
 1. Cliente en el kiosko elige "Pagar con tarjeta"
              │
 2. La pantalla llama a Django (RED LOCAL, no toca el túnel):
    POST /api/payments/ticket/<id>/iniciar/
              │
              ▼
 3. Django llama a SIPConnector (INTERNET NORMAL, no toca el túnel):
    SIPConnectorClient().enviar_datos(ticket, monto)
              │
              ▼
 4. SIPConnector le manda la orden al datáfono físico N6202
              │
              ▼
 5. Cliente pasa/inserta la tarjeta en el datáfono
              │
              ▼
 6. SIPConnector avisa a Django que ya se resolvió (AQUÍ SÍ ES EL TÚNEL):
    POST https://api.parkingpinning.com/api/payments/redeban/webhook/
              │
              ▼
 7. Django, antes de creer el aviso, YA NO CONFÍA EN EL BODY DEL WEBHOOK —
    vuelve a preguntarle directo a SIPConnector "¿de verdad se aprobó?"
    (esto es a propósito: ese endpoint es público, cualquiera podría mandarle
    un POST falso, por eso Django siempre reconfirma antes de dar un cobro
    por bueno)
              │
              ▼
 8. Si se aprobó: se registra el pago (caja, reportes), el ticket queda
    pagado, el kiosko lo sabe porque mientras tanto estuvo preguntando:
    GET /api/payments/ticket/<id>/estado/   (RED LOCAL, no toca el túnel,
                                              se pregunta cada 1-2 segundos)
```

Hay también un **respaldo** por si el webhook del paso 6 nunca llega (internet falla, lo que
sea): un comando (`poll_sipconnector_pending`) que cada cierto tiempo revisa solo, de nuevo
preguntándole a SIPConnector directamente, si alguna transacción que quedó pendiente ya se
resolvió.

### 4.4 El malentendido más común — léelo dos veces

> ❌ **"La interfaz de pago tiene que conectarse al túnel para mandar la petición al
> datáfono."**

Eso es exactamente al revés de cómo funciona. Ni la pantalla que vas a construir, ni Django,
necesitan el túnel para **mandar** nada — Django sale a internet solo, como cualquier programa.
El túnel **no se usa para salir**, se usa para que algo de **afuera** (SIPConnector avisando)
pueda **entrar**. Vos, para tu parte, casi seguro **nunca vas a tocar el túnel ni pensar en
él** — lo único que te importa es:

1. Tu pantalla le habla a Django por la red local (como cualquier pantalla del sistema hoy).
2. Django le habla a SIPConnector por internet normal.
3. El túnel es un detalle de infraestructura, ya resuelto, que existe únicamente para que el
   paso 6 (el aviso de SIPConnector) pueda llegar. No es algo que tu pantalla "use" ni necesite
   configurar.

---

## 5. Qué ya está construido para pagos (`backend/payments/`)

| Pieza | Qué hace | ¿La tocas? |
|---|---|---|
| `SIPConnectorClient` (`sipconnector_client.py`) | Habla el protocolo con SIPConnector (`enviar_datos`, `consultar_respuesta`, `borrar`, `version`) | No, ya está lista para usar tal cual |
| `sipconnector_codec.py` | Codifica/decodifica el formato de texto del protocolo | No, es un detalle interno del cliente |
| `apply_redeban_payment()` (`services.py`) | Registra el cobro en caja y reportes, igual que el kiosko de efectivo | No, ya resuelve la contabilidad |
| `resolve_pending_transaction()` (`services.py`) | Decide si un pago se aprueba — siempre reconfirma con SIPConnector, nunca confía ciegamente en el webhook | No |
| `RedebanWebhookView` | Recibe el aviso del paso 6 | No |
| `poll_sipconnector_pending` | El respaldo si el webhook nunca llega | No |
| `IniciarPagoView` → `POST /api/payments/ticket/<id>/iniciar/` | Ya calcula el monto y llama a `enviar_datos()` | Podés llamarlo desde tu interfaz tal cual |
| `EstadoPagoView` → `GET /api/payments/ticket/<id>/estado/` | Devuelve `PENDING` / `APPROVED` / `REJECTED` / `TIMEOUT` | Podés llamarlo desde tu interfaz tal cual |

Es decir: **el backend completo ya existe y ya fue probado con una aprobación simulada de
punta a punta** (ticket queda pagado, log de auditoría correcto, caja cuadra). Lo único que
falta es la pantalla/interfaz que llame a esos dos endpoints y le muestre al cliente qué está
pasando mientras espera.

---

## 6. Qué te toca construir a vos

La "interfaz de gestión de pago" — sea una pantalla dentro del kiosko (`NovaAutoCheckout`) o
una página web aparte, **el contrato con el backend es el mismo en cualquiera de los dos
casos**:

1. Botón "Pagar con tarjeta" → `POST /api/payments/ticket/<id>/iniciar/`
2. Pantalla de espera → `GET /api/payments/ticket/<id>/estado/` cada 1-2 segundos, hasta que
   deje de ser `PENDING`
3. Pantalla de éxito (`APPROVED`) o de error (`REJECTED` / `TIMEOUT`)

Ambos endpoints se llaman por **red local** (`http://<ip-de-la-máquina>:8000`), nunca por el
dominio del túnel — el túnel es solo para el aviso entrante de SIPConnector (sección 4.2), no
para esto.

Si la interfaz termina siendo una página web en vez de una pantalla dentro del kiosko C#, no
cambia nada de lo anterior — sigue siendo una petición HTTP normal a esos mismos dos endpoints,
desde la misma red local. Lo único que definiría si necesita o no pasar por el túnel es **desde
dónde se abre esa página**: si se abre en un navegador dentro de la red del parqueadero, no
necesita el túnel para nada; solo haría falta exponerla por el túnel si alguien tuviera que
abrirla desde fuera de esa red (por ejemplo para gestionarla en remoto) — y en ese caso, sería
una ruta nueva a agregar al `config.yml` del túnel, algo que si hace falta se resuelve rápido
avisándole a quien mantiene el túnel.

Para el detalle completo de implementación (qué archivo, qué firma, qué no reescribir), seguir
con `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md`.

---

## 7. Lo único que bloquea probar con un cobro real

- **Credenciales de afiliación de SIPConnector** (`SIPCONNECTOR_CODIGO_UNICO`, `USUARIO`,
  `CLAVE`, `CODIGO_TERMINAL`) — hoy vacías en `backend/.env`. Sin esto, todo el código anterior
  funciona pero contra un ambiente de pruebas limitado (`sipconnectortest.azurewebsites.net`,
  solo el método `version()` responde sin credenciales reales).
- El resto (túnel, backend, base de datos, kiosko con efectivo) ya funciona hoy sin depender de
  nada más.

---

## 8. Mapa de dónde seguir leyendo

| Si necesitas... | Leer |
|---|---|
| El paso a paso de implementación (qué endpoint crear, qué código reusar) | `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md` |
| Comandos exactos del túnel (instalar, administrar, verificar, migrar de máquina) | `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` |
| El protocolo de SIPConnector al detalle (campos, códigos de error, decisiones de diseño) | `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` sección 9 |
| Cómo cambió la pantalla de selección de método de pago del kiosko | `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` |
| Estado general del proyecto, qué falta, quién tiene que entregar qué | `HANDOFF.md` (raíz del proyecto) |
