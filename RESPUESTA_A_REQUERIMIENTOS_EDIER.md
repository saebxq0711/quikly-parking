# Lo que se hizo de lo que pidieron — entrega de Nova Parking

> De: **Edier Moyano**, Nova Parking.
> Para: el equipo del kiosco de pago.
> Fecha: 2026-08-31, **actualizado el 2026-09-12**. Responde punto por punto a
> `REQUERIMIENTOS_EDIER(1).md` (cuarta versión).
>
> **Si ya leyeron este documento, cambiaron dos cosas:**
> 1. **El dominio** pasó a `api.parqueadero122.com` (el token sigue igual).
> 2. **La sección 2:** moto, bici y patineta ya no se identifican con el número de tiquete
>    sino con un **código alfanumérico de 5 caracteres** (`A7B48`). Búsquenlos por ese
>    código, **no por el id**.
>
> Todo lo demás sigue igual.
>
> Este documento es la **nota de entrega**: qué se hizo, qué cambió respecto a lo que pidieron,
> y qué NO está listo todavía. El contrato técnico completo —con la forma real de cada JSON y
> sus trampas— está en `docs/pagos/RESPUESTA_KIOSCO_DE_PAGO.md`, dentro de este mismo proyecto.

---

## 0. En una línea

**Todo lo que pidieron está construido y probado.** El token va por canal privado, no está
escrito en ningún documento.

> 🔴 **OJO — el dominio cambió. Es `api.parqueadero122.com`, ya no `api.parkingpinning.com`.**
>
> El dominio anterior se traspasó a otra cuenta de Cloudflare y esa cuenta quedó bloqueada, así
> que hubo que montar todo en un dominio nuevo. **El enlace ya está arriba y probado por
> internet** (2026-09-12). **El token NO cambió** — sigue siendo el mismo que les enviamos.
> Lo único que tienen que actualizar de su lado es el dominio.

**Un cambio importante respecto a lo que pidieron:** el aviso de pago **no va al POST de
`pay-checkout`**, sino a una ruta nueva. El porqué está en la sección 3 — resumido: como
ustedes lo propusieron, habrían perdido los datos del voucher, el pago habría quedado
registrado como efectivo, y **el vehículo se habría quedado sin liberar**.

---

## 1. Su checklist (sección 10), con nuestro estado real

### Lo obligatorio que pidieron

| Lo que pidieron | Estado | Dónde quedó |
|---|---|---|
 — de 2 reglas a **13**, que cubren **19 rutas** (7 de operación + 12 de solo lectura para el panel) | `C:\Users\edier\.cloudflared\config.yml` |
| Reiniciar `Cloudflared` y verificar con los `curl` | ✅ Hecho y verificado desde internet | Ver sección 4 |
| Generar `PLATFORM_API_TOKEN` y enviárselo | ✅ Generado. **Se los enviamos por canal privado** | `backend/.env` |
| Crear `platform_auth.py` y decorar las 3 vistas | ✅ Hecho — y también `pay-checkout` | `backend/parking/platform_auth.py` |

### Las decisiones que necesitaban de nosotros

| Lo que preguntaron | Respuesta |
|---|---|
| Qué identificador usan moto, bici y patineta | **Código alfanumérico `A7B48`** los tres (cambió el 2026-09-11). Sección 2 |
| Si el aviso de pago libera el vehículo | **Sí**, la ruta nueva lo libera. Sección 3 |
| Si es idempotente por `transaction_id` | **Sí**, y además atómico. Sección 3 |
| En qué caja cae | Caja propia: **`Kiosco Web Tarjeta`**. Sección 3 |
| Confirmar la forma real de las respuestas | Hecha con `curl` real, no ejemplos: `docs/pagos/RESPUESTA_KIOSCO_DE_PAGO.md` sección 4 |

### Lo opcional

| | |
|---|---|
| `PlatformHealthView` | ✅ Creada, tal como la propusieron |
| ¿`pay-checkout` queda también detrás del token? | ✅ **Sí** — ver la advertencia de seguridad más abajo |

---

## 1.bis. Mapa completo de rutas (validado el 2026-09-11)

El túnel pasó de 2 reglas a **13**, que cubren **19 rutas** (algunas reglas agrupan varias,
como la de `find-ticket` o la de reportes). Todas exigen `X-Platform-Token`; **ninguna es
pública**. Validadas una por una contra el `config.yml` real con
`cloudflared tunnel ingress rule`, y probadas contra Django.

### Operación — cobrar y liberar el vehículo

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/platform/health/` | Verificar que el enlace y el token están bien |
| `GET` | `/api/parking/find-ticket/car/?term=<placa>&exact=true` | Buscar un carro |
| `GET` | `/api/parking/find-ticket/moto/?term=<codigo>&exact=true` | Buscar una moto |
| `GET` | `/api/parking/find-ticket/bike/?term=<codigo>&exact=true` | Buscar bici o patineta |
| `GET` | `/api/parking/ticket/<codigo-o-id>/pay-checkout/` | Cuánto cobrar |
| `POST` | `/api/payments/ticket/<codigo-o-id>/confirmar-externo/` | Avisar que se pagó y liberar |

> `/api/payments/redeban/webhook/` también está abierta, pero **no es de ustedes**: es del
> datáfono propio de Nova Parking (el kiosko C#). No la usen.

### Panel del administrador — SOLO LECTURA

Las 12 rutas que pidieron para el panel. Detalle completo, con el código HTTP esperado de cada
una y las trampas de cada respuesta, en **`docs/pagos/PANEL_ADMIN_KIOSCO.md`**.

| Método | Ruta |
|---|---|
| `GET` | `/api/parking/dashboard/` |
| `GET` | `/api/parking/vehicleType/` |
| `GET` | `/api/parking/ticket/` · `/api/parking/ticket/export/` · `/api/parking/ticket/<id>/` |
| `GET` | `/api/reports/daily/` · `monthly/` · `consolidated/` · `detailed-transactions/` · `vehicles-in-parking/` |
| `GET` | `/api/pos/` · `/api/pos/<id>/` |

**La regla de solo-lectura la aplica el servidor, no el cliente.** Un `POST`, `PUT` o `DELETE`
que entre por el túnel a cualquiera de esas 12 recibe **`405`** *antes* de que el token se
compare siquiera. Se hizo así porque varias de esas vistas también escriben
(`/api/parking/ticket/` crea tiquetes, `/api/pos/<id>/` borra cajas): sin eso, el token les
habría dado permiso de crear y borrar sin querer.

Comprobado: `GET /api/parking/ticket/` → `200`, `POST` a la misma → `405`,
`DELETE /api/pos/7/` → `405`, y cualquiera de ellas sin token → `403`.

### Lo que sigue bloqueado en el borde de Cloudflare

Da `404` sin llegar siquiera a nuestra máquina: `/admin/`, `/swagger/`, `/api/auth/*`
(incluido `login`), `/api/config/*`, `/api/billing/*`, `/api/pos/<id>/open/` y `/close/`,
`/api/parking/no-plate-ticket/`, `/api/parking/entry-create-ticket/`, `/media/*`,
`/__debug__/`, los reportes que no están en la lista de arriba, y cualquier
`find-ticket/<otra-cosa>/`.

**`/media/` está fuera a propósito** — son fotos de vehículos y placas, dato personal. Por eso
el campo `front_image` que devuelven las búsquedas no les va a cargar; ignórenlo.

---

## 2. Su sección 4 — el identificador de cada vehículo (DEFINIDO)

> ⚠️ **Esto cambió el 2026-09-11**, después de la primera entrega. Antes era un número de
> tiquete numérico; ahora es un **código alfanumérico de 5 caracteres**. Como ustedes dijeron
> que el tipo de dato y el texto de pantalla son configurables por parqueadero sin desplegar,
> debería ser solo un ajuste en su administración.

| Vehículo | Qué digita el cliente | Tipo | Ruta |
|---|---|---|---|
| **Carro** | Placa | Alfanumérico | `find-ticket/car/?term=<placa>&exact=true` |
| **Moto** | Código del tiquete | Alfanumérico, 5 | `find-ticket/moto/?term=<codigo>&exact=true` |
| **Bicicleta** | Código del tiquete | Alfanumérico, 5 | `find-ticket/bike/?term=<codigo>&exact=true` |
| **Patineta** | Código del tiquete | Alfanumérico, 5 | `find-ticket/bike/?term=<codigo>&exact=true` |

Texto en pantalla: **"Placa"** para carro, **"Código del tiquete"** para los otros tres.

### El código: `A7B48`

Patrón fijo **letra · número · letra · número · número**, impreso en el tiquete de entrada y
también dentro del QR.

```
Placa carro:   ABC123    3 letras seguidas, luego 3 números   (6 caracteres)
Placa moto:    ABC12D    3 letras seguidas                     (6 caracteres)
Código:        A7B48     alterna desde el 2º carácter          (5 caracteres)
```

Se diseñó así para que **no se pueda confundir con una placa**, ni a la vista ni con una
expresión regular. Para validarlo de su lado: `^[A-HJ-NP-Z][0-9][A-HJ-NP-Z][0-9]{2}$`

- **El alfabeto excluye la I y la O**, porque se confunden con el 1 y el 0 al teclear. Si
  validan la entrada, mejor traducirlas (I→1, O→0) que rechazarlas.
- **Nuestra búsqueda es tolerante:** `a7b48`, `A7B48` y `A7-B48` dan el mismo resultado.
- **Sigue aceptándose el número de tiquete viejo**, porque los vehículos que ya estaban adentro
  cuando hicimos el cambio llevan un QR con el número. Manden lo que el cliente escriba o
  escanee; nosotros resolvemos cuál de los dos es.
- **El código también sirve en las rutas de cobro:**
  `GET /api/parking/ticket/A7B48/pay-checkout/` y
  `POST /api/payments/ticket/A7B48/confirmar-externo/`. Así manejan un solo identificador de
  punta a punta. La respuesta trae `id` y `code` por separado, para que no haya confusión.

**Hicieron bien en no asumirlo.** El cliente confirmó que la lectura de placa de moto por
cámara **no es confiable** — la placa cambia de posición según la moto y la cámara no siempre
la alcanza. Por eso la moto también va por código y no por placa.

Como ustedes detectaron, ninguna ruta servía para eso: `find-ticket/moto/` buscaba solo por
placa y `find-ticket/bike/` **excluye todo tiquete que tenga placa**. Ahora
`find-ticket/moto/` acepta el código directamente, sin parámetros extra, y encuentra la moto
tenga o no placa registrada. (El `?by=id` que documentamos en la primera entrega sigue
existiendo, pero ya no les hace falta.)

### ⚠️ Lo más importante de este cambio: busquen por CÓDIGO, no por el id

Es el punto que más fácil se pasa por alto, así que va explícito:

| | |
|---|---|
| ❌ **NO** | Buscar o mostrar el **id** del tiquete (`41`, `38`, `84`…) |
| ✅ **SÍ** | Buscar y mostrar el **código** (`C1X94`, `R7M57`…) |

**El id es un número autoincremental interno nuestro.** Es secuencial: quien tenga uno puede
deducir el de al lado y cobrar —o intentar sacar— un vehículo que no es suyo. Por eso dejó de
imprimirse, dejó de ir en el QR y dejó de mostrarse a los clientes.

**El código es el único identificador que el cliente conoce.** Es el que va impreso en su
tiquete, el que lleva el QR, y el que va a teclear en su kiosco si perdió el papel.

El id **sigue existiendo** y lo van a seguir viendo en el campo `id` de todas las respuestas,
porque es lo que va en las URLs de cobro. Pero es un dato de máquina: no lo muestren en
pantalla ni le pidan al cliente que lo teclee.

> **Sobre la compatibilidad:** nuestras búsquedas todavía aceptan el id numérico, pero **solo
> como transición** — los vehículos que ya estaban adentro el día del cambio llevan un QR con
> el número viejo y tienen que poder salir. No lo tomen como una alternativa válida: en unos
> días no va a quedar ninguno de esos, y la búsqueda por id de un vehículo sin placa deja de
> tener sentido.

### Qué cambió en nuestra base de datos

Para que sepan de dónde sale el código y por qué es confiable:

- Se agregó la columna **`ParkingTicket.code`**, con restricción **única** e indexada.
- Se genera **al azar** en el momento de crear el tiquete, y se **guarda**. No se calcula al
  vuelo ni se deriva del id, así que no hay forma de adivinarlo a partir de otro.
- Lo llevan los vehículos **sin placa**, más moto/bici/patineta aunque tengan placa. **Un carro
  con placa lo trae en `null`** — su identificador es la placa, como siempre.
- Los tiquetes que ya existían se rellenaron con un código al aplicar el cambio, así que **no
  hay vehículos sin código** adentro.
- En nuestro panel de administrador se agregó una columna **"Código"** al lado de "Placa", y
  también sale en las exportaciones a Excel. Así, si ustedes nos reportan un cobro con un
  código, lo podemos ubicar de inmediato desde nuestro lado.

### `exact=true` — por favor mándenlo siempre

Las búsquedas son **por prefijo** por defecto, porque nuestro kiosko las usa en carrusel. Caso
real de esta base:

```
find-ticket/bike/?term=3              → [{"id":31,...},{"id":36,...}]   dos vehículos distintos
find-ticket/bike/?term=3&exact=true   → []                              correcto
```

En un kiosco autónomo, cobrarle al vehículo equivocado por una coincidencia de prefijo no
tiene vuelta atrás.

---

## 3. Su sección 5 — el aviso de pago (aquí está el cambio)

### Por qué NO usamos el POST de `pay-checkout`

Lo revisamos en el código y **no habría funcionado como esperaban**:

1. **El vehículo no se liberaba.** Sin `"exit": true` en el cuerpo, ese endpoint deja el
   tiquete en `PAID` con `checked_out` vacío. Su payload propuesto no traía ese campo.
2. **Los datos del voucher se descartaban en silencio.** `transaction_id`,
   `authorization_code`, `receipt_number`, `franchise` y `source` no están declarados en el
   serializer de esa vista, así que Django los ignora sin error. Y sin `transaction_id`
   guardado, **no hay forma de ser idempotente**.
3. **El pago quedaba como efectivo.** Esa vista nunca escribe `payment_method`, así que el
   tiquete se queda con el valor por defecto (`CASH`). Su cobro no habría aparecido en el total
   de tarjetas del cierre de caja, y habría descuadrado el arqueo del efectivo.

Adaptar `pay-checkout` significaba tocar el camino que hoy usa nuestro kiosko de efectivo en
producción. Preferimos darles una ruta propia:

```
POST /api/payments/ticket/<id>/confirmar-externo/
X-Platform-Token: <token>

{ "amount": 9500, "transaction_id": "M4K2P9XZ01", "authorization_code": "604863",
  "receipt_number": "000124", "franchise": "VISA", "source": "punto-de-pago-web" }
```

**Los nombres de campo son los suyos, sin cambios.** Obligatorios: `amount` y
`transaction_id`. `payment_method` pueden seguir mandándolo; se ignora, esta ruta siempre
registra tarjeta.

### Sus cuatro preguntas

1. **¿Los nombres sirven?** Sí, tal cual.
2. **¿Libera el vehículo?** **Sí** — `status='OUT'`, `checked_out`, y los registros de
   auditoría `PAID` y `OUT`. No hace falta ninguna llamada adicional.
3. **¿Es idempotente?** **Sí, por `transaction_id`.** Y además atómico: lo probamos con 3
   peticiones simultáneas con el mismo id — una respondió `201`, dos `200`, y en la base quedó
   **un solo movimiento de caja**.
4. **¿En qué caja cae?** En **`Kiosco Web Tarjeta`**, propia, separada del efectivo y del
   datáfono nuestro. Se crea sola. No tienen que mandarnos nada para identificarla.

### Códigos de respuesta

| HTTP | Significa | Qué hacer |
|---|---|---|
| `201` | Registrado, vehículo liberado | Listo |
| `200` | Ya estaba registrado (`already_processed: true`) | Listo, no reintentar |
| `409` | El tiquete ya se pagó por otro canal | Revisión manual |
| `400` | Falta o es inválido `amount` / `transaction_id` | Corregir payload |
| `403` | Token ausente o incorrecto | Revisar token |
| `503` | Base ocupada, **el cobro NO quedó registrado** | Reintentar el mismo POST |

---

## 4. Verificación

### Por internet, contra el dominio real (2026-08-31)

Flujo completo ejecutado contra `https://api.parqueadero122.com` (carro de prueba, tiquete 5):

```
1. find-ticket/car/?term=TESTPLAN2&exact=true   → 200  [{"id":5,...}]
2. GET  ticket/5/pay-checkout/                  → 200  {"price":788600.0,...}
3. POST payments/ticket/5/confirmar-externo/    → 201  OUT, CREDIT_CARD, Kiosco Web Tarjeta
4. el MISMO POST otra vez                       → 200  already_processed:true
5. GET  ticket/5/pay-checkout/                  → 400  {"paid":true,"left":14}
```

En base quedó un solo movimiento de caja con el voucher completo, los dos registros de
auditoría, y el vehículo liberado.

### Con el código nuevo (2026-09-11, en local — el DNS estaba caído)

```
1. find-ticket/bike/?term=N1G81&exact=true      → 200  [{"id":36,"code":"N1G81",...}]
2. GET  ticket/N1G81/pay-checkout/              → 200  {"id":"36","code":"N1G81",...}
3. POST payments/ticket/N1G81/confirmar-externo/→ 201  OUT, CREDIT_CARD, Kiosco Web Tarjeta
4. el MISMO POST otra vez                       → 200  already_processed:true
```

También: `n1g81` y `N1-G81` encuentran el mismo tiquete, y el id viejo (`36`) sigue
funcionando. **El comportamiento por el túnel es idéntico** — el único cambio fue aceptar el
código además del id.

### Lo que quedó bloqueado en el borde

> ⚠️ **Ojo, esto cambió:** `/api/parking/ticket/`, `/api/parking/vehicleType/` y
> `/api/reports/daily/` aparecían antes en esta lista como bloqueadas. **Ya no lo están** —
> son parte de las 12 rutas de solo lectura del panel del administrador (sección 1.bis).

Siguen dando `404` sin llegar a Django: `/admin/`, `/swagger/`, `/api/auth/*` (incluido
`login`), `/api/config/*`, `/api/billing/*`, `/api/pos/<id>/open/` y `/close/`,
`/api/parking/no-plate-ticket/`, `/api/parking/entry-create-ticket/`, `/media/…`,
`/__debug__/`, `/api/payments/ticket/<id>/iniciar/` (esa es de nuestro kiosko), los reportes
que no están en la lista, y cualquier `find-ticket/<otra-cosa>/` que no sea `car`, `moto` o
`bike`.

---

## 5. Sobre el token — una diferencia con lo que propusieron

Implementamos su decorador, pero con otra regla de **cuándo** se exige. La suya, atada a una
lista de dominios, tenía un problema: el dominio del túnel **cambia en cada instalación**. Si
en el próximo parqueadero alguien olvida configurar esa lista, el token dejaría de exigirse *en
silencio* y las rutas quedarían abiertas sin que nadie se entere.

La regla que quedó no necesita configurarse por sitio:

> **Se exige el token salvo que el request venga de la red local** (loopback o IP privada).

Para ustedes el efecto es el que esperaban: **todo lo que entra por el túnel exige el token,
siempre**, en este sitio y en cualquiera futuro. Si el token no está configurado en el
servidor, los requests externos reciben **`503`**, no un "pasa igual".

### Advertencia de seguridad que encontramos de paso

Al revisar esto descubrimos que **`pay-checkout` llevaba tiempo expuesto a internet sin
autenticación de ningún tipo** (`permission_classes = []`). Cualquiera que conociera el dominio
podía marcar tiquetes como pagados y sacar vehículos sin pagar. No lo introdujo esta
integración —ya estaba— pero quedó cerrado. Como ustedes ya mandan la cabecera en todas las
llamadas, no tienen que cambiar nada.

---

## 6. ⚠️ Lo que tienen que saber antes de empezar

### 6.1. Esto apunta a un PC de desarrollo, no a producción

El túnel entra a la **máquina personal del desarrollador**. Consecuencias concretas:

- **Ese PC tiene que estar prendido** para que ustedes puedan probar.
- Cuando el sistema se mude a la máquina del parqueadero, **los ids de prueba de abajo no van a
  existir allá**.
- El instalador de la máquina nueva **genera un token distinto**, así que habrá que
  reenviárselo o el enlace se les cae sin aviso.

Coordinemos esa migración cuando llegue; va a haber un corte.

### 6.2. Nadie ha cobrado con una tarjeta real todavía

Ni ustedes ni nosotros. Su lado está probado contra el ambiente de pruebas de Redeban, con
credenciales de otro comercio y sin datáfono físico. Eso está fuera del alcance de ambos hasta
que el cliente entregue las credenciales de producción.

### 6.3. La tarifa de bicicleta y patineta está mal a propósito

Sigue en la de prueba, **$10/minuto**. Como ustedes cobran exactamente lo que devolvemos,
**hoy cobrarían mal esos dos tipos**. Falta que el cliente confirme el precio real.

### 6.4. Anulaciones: no existen de nuestro lado

No tenemos ninguna ruta de reverso. Si el cliente las pide (su sección 11.3), es trabajo nuevo
de los dos lados —ustedes contra Redeban, nosotros revirtiendo el movimiento de caja y
devolviendo el tiquete a `IN`— y hay que decidir qué pasa si el vehículo ya salió. Nuestra
recomendación: **dejarlo fuera de la primera entrega** y resolver a mano los pocos casos.

---

## 7. Casos de prueba vigentes

Vehículos adentro en esta base ahora mismo:

| Tipo | Cómo buscarlo |
|---|---|
| Carro | `find-ticket/car/?term=HKM872&exact=true` |
| **Moto** | `find-ticket/moto/?term=R7M57&exact=true` |
| Bicicleta | `find-ticket/bike/?term=C1X94&exact=true` |
| Bicicleta | `find-ticket/bike/?term=X1S24&exact=true` |

Prueben también `c1x94` y `C1-X94`: tienen que dar el mismo resultado. Prueba mínima sugerida, sin
cobrar:

```bash
curl -H "X-Platform-Token: <token>" \
  "https://api.parqueadero122.com/api/platform/health/"

curl -H "X-Platform-Token: <token>" \
  "https://api.parqueadero122.com/api/parking/find-ticket/moto/?term=R7M57&exact=true"

curl -H "X-Platform-Token: <token>" \
  "https://api.parqueadero122.com/api/parking/ticket/R7M57/pay-checkout/"
```

Cuando quieran probar el aviso de pago completo, avísennos y coordinamos con un tiquete que
podamos sacrificar.

---

## 8. Lo que necesitamos de ustedes

- [ ] Cambiar el aviso de pago a `POST /api/payments/ticket/<id>/confirmar-externo/`
- [ ] **Cambiar moto/bici/patineta a alfanumérico de 5 caracteres** y el texto de pantalla
      a "Código del tiquete" (sección 2) — esto es lo único nuevo desde la primera entrega
- [ ] Mandar `exact=true` siempre en las tres búsquedas
- [ ] Tratar el `400 {"paid":true,"left":N}` del GET como **"ya pagado"**, no como error —
      no existe el campo `already_paid` que esperaban
- [ ] **Redondear `price` antes de cobrar** (viene como decimal, ej. `4419.999999999999`) y
      mandarnos en `amount` el valor exactamente cobrado
- [ ] Confirmar que su pantalla tolera la **ausencia de `plate`** en `find-ticket/bike/`
- [ ] Ojo con `checked_in`: **no es ISO-8601**, viene como `31/08/26 07:15:49`, hora local de
      Bogotá y sin zona horaria
- [ ] `front_image` no les sirve: `/media/` no está expuesto a propósito (son fotos de
      vehículos y placas). Siempre va a dar 404 desde su lado

---

## 9. Dónde está todo, dentro del proyecto que les pasamos

| Qué | Dónde |
|---|---|
| **El contrato técnico completo, con la forma real de cada JSON** | `docs/pagos/RESPUESTA_KIOSCO_DE_PAGO.md` |
| El decorador del token y su lógica | `backend/parking/platform_auth.py` |
| La ruta nueva de confirmación de pago | `backend/payments/views.py` (`ConfirmarPagoExternoView`) y `backend/payments/services.py` (`apply_external_kiosk_payment`) |
| Las tres búsquedas | `backend/parkingManager/views.py` (`FindParkingTicketCar` / `Moto` / `Bike`) |
| El health | `backend/parking/platform_views.py` |
| Reglas del túnel | `C:\Users\edier\.cloudflared\config.yml` (fuera del repo) |
| Comandos del túnel: instalar, verificar, migrar de máquina | `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` |
| Estado general del proyecto y qué falta por responsable | `HANDOFF.md` (raíz) sección 3.6 |
| Cómo funciona todo el sistema, de arriba a abajo | `docs/pagos/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md` |
| **Las 12 rutas del panel del administrador**, una por una, con el código HTTP esperado y las trampas de cada respuesta | `docs/pagos/PANEL_ADMIN_KIOSCO.md` |
| Sus propios documentos, tal como los entregaron | esta misma carpeta (`Integracion compañero/`) |

**Nada de lo que pidieron que no tocáramos se tocó:** `parkingManager/models.py`,
`serializers.py`, `backend/devices/`, el cálculo de precio de `pay-checkout`, ni nuestro kiosko
C#. No hizo falta ninguna migración de base de datos.
