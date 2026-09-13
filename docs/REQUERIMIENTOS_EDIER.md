# Lo que necesitamos de tu sistema de parqueadero

> Para: **Edier Moyano**, responsable de Nova Parking.
> De: el equipo del kiosco de pago.
> Fecha: 2026-08-29. **Cuarta versión.** Si ya leíste una anterior, salta a la
> sección 9: el reparto cambió y ahora te pedimos bastante menos.

---

## 0. Resumen en 30 segundos

Somos un **kiosco de autoservicio a la salida del parqueadero**, con pantalla y
datáfono propios. El cliente paga solo, sin nadie atendiéndolo.

| Quién | Qué hace |
| --- | --- |
| **Tu sistema** | Los tiquetes y las tarifas. Registrar el pago y liberar el vehículo. |
| **Nuestro kiosco** | Toda la parte de cobro: pantalla, datáfono, identificación del cliente y facturación electrónica. |

**No manejas pagos con tarjeta y no compartimos datáfono.** El nuestro es un
aparato aparte, en el kiosco. El tuyo, si llega a haberlo, es independiente.

El cobro contra Redeban ya está construido y probado contra el ambiente real:
los cinco métodos de SIPConnector responden con las credenciales del comercio. La
facturación en SIIGO también, con facturas reales emitidas.

**Necesitamos 3 rutas tuyas**, y las tres ya existen en tu Django.

**Trabajo estimado: editar 2 archivos** (`config.yml` del túnel y `.env`), más un
decorador de autenticación en 3 vistas. Y dos decisiones: las de las secciones 4
y 5.

---

## 1. Las 3 rutas

```
Para qué                        Ruta                                        ¿Pasa hoy?
------------------------------  ------------------------------------------  ----------
Buscar el vehículo              /api/parking/find-ticket/<tipo>/             NO
Consultar cuánto cobrar         GET  /api/parking/ticket/<id>/pay-checkout/  Sí
Avisarte que se pagó            POST /api/parking/ticket/<id>/pay-checkout/  Sí (misma ruta)
```

**Ninguna hay que crearla.** Existen (`HANDOFF.md` 3.3 y 3.5, más el
`pay-checkout` que ya usa tu kiosko de efectivo). Lo que falta es **dejarlas
pasar por el túnel**.

El bloqueo concreto: `pay-checkout` recibe un **id de tiquete**, pero el cliente
que llega al kiosco no lo tiene a mano — trae su placa o su tiquete. La ruta que
traduce eso a un id da 404 en el borde de Cloudflare, así que el flujo no puede
ni empezar.

> **Ya no te pedimos** `POST /api/payments/ticket/<id>/iniciar/` ni
> `GET .../estado/`. En versiones anteriores te pedíamos que ejecutaras tú el
> cobro; eso cambió. Tu app `payments/` sigue sirviendo para tu kiosko C#;
> simplemente nosotros no la usamos.

---

## 2. OBLIGATORIO — Ampliar el `config.yml` del túnel

Archivo: `C:\Users\edier\.cloudflared\config.yml`

Agrega los bloques nuevos **antes** de la regla final `service: http_status:404`,
y deja los tuyos como están.

```yaml
tunnel: c575049a-da7f-4ef6-acb9-7d1baa48503f
credentials-file: C:\Users\edier\.cloudflared\c575049a-da7f-4ef6-acb9-7d1baa48503f.json
protocol: http2

ingress:
  # ---- Las que ya tenías (no tocar) --------------------------------------
  - hostname: api.parkingpinning.com
    path: ^/api/parking/ticket/[^/]+/pay-checkout/?$
    service: http://127.0.0.1:8000

  - hostname: api.parkingpinning.com
    path: ^/api/payments/redeban/webhook/?$
    service: http://127.0.0.1:8000

  # ---- NUEVA: búsqueda de vehículo ---------------------------------------
  # El patrón acepta cualquier segmento, por si el identificador de la
  # sección 4 termina necesitando una ruta distinta.
  - hostname: api.parkingpinning.com
    path: ^/api/parking/find-ticket/[a-z0-9-]+/?$
    service: http://127.0.0.1:8000

  # ---- NUEVA: verificación de enlace (opcional pero recomendada) ---------
  - hostname: api.parkingpinning.com
    path: ^/api/platform/health/?$
    service: http://127.0.0.1:8000

  # ---- Todo lo demás sigue dando 404 en el borde -------------------------
  - service: http_status:404
```

`/admin/`, `/swagger/`, tiquetes, reportes y usuarios siguen inalcanzables desde
internet: las reglas nuevas son expresiones regulares cerradas (`^...$`).

Reinicia el servicio. Según tu propia nota (`HANDOFF.md` 3.1),
`Restart-Service` es poco confiable con esta versión de `cloudflared`:

```powershell
Stop-Process -Name cloudflared -Force
Start-Service Cloudflared
```

### Verificar que quedó bien

```powershell
# Deben llegar a Django (200 o 404 de Django, no el 404 del borde)
curl.exe -i https://api.parkingpinning.com/api/platform/health/
curl.exe -i "https://api.parkingpinning.com/api/parking/find-ticket/car/?term=ABC123"

# Deben seguir dando 404 del borde
curl.exe -i https://api.parkingpinning.com/admin/
curl.exe -i https://api.parkingpinning.com/swagger/
```

El 404 del borde **no** trae la cabecera `Server: WSGIServer` de Django.

---

## 3. OBLIGATORIO — Token compartido

Esas rutas quedan expuestas a internet, así que no pueden ser públicas.

### 3.1. En tu `.env`

```env
PLATFORM_API_TOKEN=<una cadena larga y aleatoria>
```

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

**Envíanoslo por un canal privado.** Lo cargamos cifrado en la ficha de tu
parqueadero. Ya tenemos el dominio configurado
(`https://api.parkingpinning.com`): **el token es lo único que falta de tu lado
para que el enlace quede vivo.**

### 3.2. En tu Django

```python
# backend/parking/platform_auth.py  (archivo nuevo)
import hmac
import os
from functools import wraps
from django.http import JsonResponse


def require_platform_token(view_func):
    """Valida el token compartido del kiosco de pago.

    Se compara en tiempo constante para no filtrar informacion por el tiempo
    de respuesta. No usa sesion: el kiosco es un servicio, no un usuario.
    """

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        expected = os.environ.get('PLATFORM_API_TOKEN', '')
        received = request.headers.get('X-Platform-Token', '')
        if not expected or not hmac.compare_digest(expected, received):
            return JsonResponse({'detail': 'Token invalido.'}, status=403)
        return view_func(request, *args, **kwargs)

    return wrapper
```

Aplicado a una vista de DRF:

```python
from django.utils.decorators import method_decorator
from parking.platform_auth import require_platform_token


@method_decorator(require_platform_token, name='dispatch')
class FindParkingTicketCar(APIView):
    permission_classes = [AllowAny]   # el token reemplaza a la sesion
    ...
```

Vistas a decorar: `FindParkingTicketCar`, `FindParkingTicketMoto` y
`FindParkingTicketBike`, todas en `parkingManager/views.py`.

> `ParkingTicketPayAutoCheckout` (`pay-checkout`) ya funciona sin sesión para tu
> kiosko. Si le pones el decorador, avísanos: enviamos la cabecera en **todas**
> las llamadas, así que funciona igual con o sin él.

Si prefieres mTLS, un Service Token de Cloudflare Access o un JWT firmado, dinos
cuál: está aislado en un solo archivo de nuestro lado.

---

## 4. RESUELTO — Cómo identificamos cada vehículo

Esta sección era una decisión abierta. Quedó cerrada con tu entrega, y esto es lo
que quedó implementado de nuestro lado:

| Vehículo | Cómo lo buscamos | Ruta |
| --- | --- | --- |
| **Carro** | Por **placa** | `find-ticket/car/?term=<placa>&exact=true` |
| **Moto** | Por **número de tiquete** | `find-ticket/moto/?term=<nro>&by=id&exact=true` |
| **Bicicleta** | Por **número de tiquete** | `find-ticket/bike/?term=<nro>&exact=true` |
| **Patineta** | Por **número de tiquete** | `find-ticket/bike/?term=<nro>&exact=true` |

Tomaste la primera de las dos salidas que te planteábamos: `FindParkingTicketMoto`
ahora acepta `by=id` además de la búsqueda por placa. Nos cuadra, y la razón que
diste — que la lectura de placa de moto no es fiable porque la placa cambia de
posición según la moto — es justamente por lo que no quisimos asumirlo.

Bicicleta y patineta van las dos a `find-ticket/bike/`, que devuelve los tiquetes
sin placa y ya busca por id sin necesidad de `by`.

**`exact=true` va siempre**, en las tres. Gracias por agregarlo: sin él la
búsqueda es por prefijo y `term=3` devuelve los tiquetes 30, 31, 36… Cobrarle al
vehículo equivocado no tiene vuelta atrás, así que para un kiosco autónomo esa
era una diferencia importante.

### Sigue siendo configurable

Que esté definido no lo congela. La regla vive por parqueadero y por tipo de
vehículo en nuestra administración: el tipo de dato, la ruta, los parámetros
extra y el texto que ve el cliente. Si otro sitio numera distinto, o si cambias
una ruta, se ajusta ahí — **sin desplegar ni tocar código.**

---

## 5. RESUELTO — Cómo se entera tu sistema del pago

También estaba abierta, y también quedó cerrada con tu entrega. Habíamos propuesto
reusar `POST pay-checkout`; abriste una ruta aparte, y tienes razón: ese endpoint
es del kiosko C# de efectivo, que está en producción, y su serializer descarta en
silencio los campos del voucher. Adaptarlo habría movido el camino del efectivo,
que funciona.

Quedó así, y es contra lo que estamos programados:

```
POST /api/payments/ticket/<id>/confirmar-externo/
X-Platform-Token: <token>
```

```json
{
  "amount": 9500,
  "transaction_id": "M4K2P9XZ01",
  "authorization_code": "604863",
  "receipt_number": "000124",
  "franchise": "VISA",
  "source": "punto-de-pago-web"
}
```

**Las cuatro preguntas que hacíamos, respondidas por tu implementación:**

1. **Nombres de campo** — los tuyos son los que ya enviábamos. Sin cambios.
2. **Libera el vehículo** — sí: marca `PAID` y `OUT`, con `checked_out`. No hace
   falta una segunda llamada.
3. **Es idempotente** — por `transaction_id`, apoyado en el `unique` de
   `redeban_transaction_id`. Repetir el aviso devuelve `200` con
   `already_processed: true` y no vuelve a escribir. Lo tratamos como éxito.
4. **Cae en su propia caja** — la del kiosco externo, no la del efectivo, con el
   voucher completo en el comentario del `POSLog`.

**Cómo tratamos cada respuesta tuya:**

| Respuesta | Qué hacemos |
| --- | --- |
| `201` registrado | Pago confirmado, el cliente puede salir |
| `200 already_processed` | Igual que el anterior: ya estaba registrado |
| `409 already_paid_other_channel` | Se marca para revisión: se cobró por otro canal |
| `400` | Se marca para revisión, no se reintenta |
| `503 retry` | **Se reintenta** hasta 2 veces con espera, mismo `transaction_id` |

**Si aun así falla, el cobro no se pierde ni se revierte**: el pago queda
aprobado y marcado como *"requiere verificación manual"* en nuestra
administración, con el detalle en auditoría. El dinero ya salió de la cuenta del
cliente; fingir que no sería peor.

---

## 6. Contrato de las respuestas

Las **rutas** están documentadas; la **forma del JSON** no aparece en ningún
lado. Esto es lo que esperamos.

**No necesitas cambiar tu código para que coincida.** Nuestro normalizador acepta
variantes en camelCase y snake_case, en español e inglés, y el monto como número
o como texto. Lo que sí te pedimos es que **nos confirmes la forma real**, o nos
pases la salida de un `curl`.

### 6.1. `GET /api/parking/find-ticket/<tipo>/?term=<identificador>`

```json
[
  {
    "id": "9001",
    "plate": "ABC123",
    "vehicle_type": "Carro",
    "entry_at": "2026-08-29T10:32:00Z",
    "minutes": 95,
    "status": "IN",
    "customer_name": "Maria Rojas",
    "customer_document": "1098765432"
  }
]
```

- Lista vacía `[]` si no hay ingreso activo. **No** un 404.
- Solo `id` es imprescindible; lo demás, si falta, se muestra como "—".
- Aceptamos el objeto suelto o envuelto en `{ "ticket": ... }` / `{ "data": ... }`.

### 6.2. `GET /api/parking/ticket/<id>/pay-checkout/`

```json
{
  "ticket": { "...igual que arriba..." },
  "amount": 9500,
  "already_paid": false
}
```

- `amount` es el único campo obligatorio además del tiquete. Entero, en pesos.
- Aceptamos también `total`, `valor`, `precio`, y el monto como texto (`"9500"`)
  — tu `HANDOFF.md` 5.3 ya documenta que ha viajado como string.
- **La tarifa es tuya y no la replicamos.** Cobramos exactamente lo que
  devuelvas, y ese mismo valor va a la factura, sin recargos ni ajustes.
- `already_paid` en `true` nos evita cobrar dos veces el mismo tiquete.

### 6.3. `GET /api/platform/health/` (nueva, opcional)

Cinco líneas. Nos deja diagnosticar el enlace desde la administración en vez de
adivinar por qué no aparecen vehículos.

```python
class PlatformHealthView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(require_platform_token)
    def get(self, request):
        return Response({'ok': True, 'service': 'nova-parking'})
```

---

## 7. Para probar

Cuando tengas el túnel y el token listos, **mándanos un caso concreto** que
podamos consultar de punta a punta:

- Una **placa** de un carro que esté adentro en ese momento.
- Un **identificador** de una moto, bici o patineta que esté adentro (una vez
  definamos la sección 4).

Con eso verificamos el flujo completo sin tocar un vehículo real.

Si tienes un ambiente de pruebas separado del de producción, mejor todavía: dinos
su dominio y apuntamos ahí primero.

---

## 8. Lo que NO te pedimos

- **No tocamos** `parkingManager/models.py` ni `serializers.py`.
- **No tocamos** `backend/devices/`.
- **No tocamos** el cálculo de precio de `ParkingTicketPayAutoCheckout`.
- **No tocamos** tu app `payments/` ni tu kiosko C#.
- **No te pedimos** que ejecutes ningún cobro.
- **No compartimos datáfono.** El nuestro es un aparato propio del kiosco.

---

## 9. Qué cambió desde la versión anterior

- **El cobro es nuestro.** Antes te pedíamos exponer
  `payments/ticket/<id>/iniciar/` y `.../estado/` para que tú hablaras con
  SIPConnector. Ya no. **De 5 rutas bajamos a 3.**
- **Aparece la confirmación** (sección 5): el POST a `pay-checkout` con los datos
  del voucher, para que tu caja se entere y el vehículo salga. Con cuatro
  preguntas concretas.
- **El identificador de moto, bici y patineta quedó abierto** (sección 4). Este
  documento antes afirmaba que era la placa para la moto y el número de tiquete
  para el resto. **No lo sabemos**, así que ahora se plantea como decisión y no
  como hecho.
- **`terminal_code` ya no viaja hacia ti.** El datáfono lo administramos
  nosotros.
- **El dominio ya está configurado** de nuestro lado. Falta tu token.

---

## 10. Checklist

**Obligatorio**

- [ ] Agregar los bloques `ingress` al `config.yml` (sección 2).
- [ ] Reiniciar `Cloudflared` y verificar con los `curl`.
- [ ] Generar `PLATFORM_API_TOKEN`, ponerlo en `backend/.env` y **enviárnoslo**.
- [ ] Crear `parking/platform_auth.py` y decorar las 3 vistas (sección 3.2).

**Decisiones que necesitamos de ti**

- [ ] Qué **identificador** usan moto, bicicleta y patineta, si es numérico o
      alfanumérico, y qué ruta lo acepta (sección 4).
- [ ] Si el `POST pay-checkout` **libera el vehículo**, si es **idempotente** por
      `transaction_id`, y en **qué caja** cae (sección 5).
- [ ] Confirmar los nombres de campo de las respuestas (sección 6), o pasarnos un
      `curl` real.

**Cuando esté listo**

- [ ] Un caso de prueba: una placa y un identificador de vehículos que estén
      adentro (sección 7).
- [ ] (Opcional) Crear `PlatformHealthView`.
- [ ] (Opcional) Decirnos si `pay-checkout` quedará también detrás del token.

---

## 11. Otros pendientes, del cliente y no tuyos

1. **Tarifa de bicicleta y patineta** — hoy es la de prueba ($10/minuto).
   Mostramos y cobramos lo que devuelvas.
2. **Cómo se lee el identificador a la salida** — nuestra interfaz acepta el dato
   digitado y funciona con cualquier lector que actúe como teclado. Si van a usar
   la cámara del kiosco, dinos y agregamos el escáner.
3. **Anulaciones** — el manual soporta la operación de anulación (tipo 1) y ya
   está implementada en nuestro cliente de Redeban, pero no hay pantalla todavía.
   ¿Hace falta para la entrega?
