# Panel del administrador de parqueadero — lo que necesitamos de Nova Parking

**Para:** Edier Moyano · **De:** equipo del kiosco de pago
**Fecha:** 2026-09-02 · **Actualizado el 2026-09-12**

> ✅ **ENTREGADO Y VERIFICADO.** Todo lo que pide este documento está publicado y
> comprobado contra `https://api.parqueadero122.com` el 2026-09-12:
> **las 12 consultas responden, y las 12 rechazan cualquier escritura con `405`.**
> Se comprueba en cualquier momento con `npm run nova:panel`.
>
> El documento se conserva porque explica **por qué** se pidió cada cosa, y
> porque la sección 4 todavía tiene puntos abiertos — dos de ellos nuevos,
> encontrados al conectar el panel de verdad (4.4 y 4.5).

---

## 1. Qué es esto y por qué te lo pedimos

Cada parqueadero que use nuestra plataforma tiene un **administrador**. Hoy ese
usuario solo ve los cobros que hizo nuestro kiosco, que es una porción mínima de
lo que pasa en su parqueadero: no ve quién entró, ni qué hay adentro ahora, ni
cómo va la caja.

Queremos darle esa vista completa, y toda esa información ya vive en tu sistema.
No queremos duplicarla ni sincronizarla — queremos **leerla de ti**.

### La regla que rige todo este documento

> **El panel es de SOLO LECTURA. No modifica absolutamente nada de tu sistema.**

No creamos tiquetes, no abrimos ni cerramos cajas, no cambiamos tarifas, no
anulamos, no marcamos salidas. Ni siquiera por accidente: más abajo te pedimos
que lo hagas **imposible desde tu lado**, no solo desde el nuestro.

Lo único que nuestra plataforma sigue escribiendo en tu sistema es lo que ya
acordamos: el aviso de pago del kiosco
(`POST /api/payments/ticket/<id>/confirmar-externo/`). Nada más.

---

## 2. Lo más importante: que la lectura sea lectura de verdad

Esto es lo único de este documento que te pedimos que no negocies, porque es lo
que nos deja dormir tranquilos a los dos.

**El problema:** varias de las vistas que necesitamos leer están en clases que
también escriben.

| Vista | Método que necesitamos | Método que también tiene |
| --- | --- | --- |
| `ParkingTicketsView` | `GET` — listar tiquetes | **`POST` crea un tiquete**, y hoy con `permission_classes = []` |
| `POSView` | `GET` — listar cajas | **`POST` crea una caja** |
| `POSDetailView` | `GET` — detalle y movimientos | **`DELETE` borra la caja** |

Si esas rutas se exponen por el túnel tal como están, quien tenga el token puede
**crear tiquetes y borrar cajas**. Nosotros no lo haríamos, pero el token es un
secreto compartido, y un secreto compartido se filtra algún día — de hecho el que
nos diste viajó dentro del `.env` del proyecto que nos enviaste.

Ocultar los botones en nuestra interfaz **no es una garantía**: es una decisión
nuestra, revisable, y no te protege de nosotros.

### Lo que te proponemos

Un decorador hermano del que ya tienes, en `backend/parking/platform_auth.py`:

```python
def require_platform_token_readonly(view_func):
    """
    Como require_platform_token, pero ademas rechaza todo lo que no sea GET.

    Lo usan las vistas que el panel del kiosco de pago consulta. Varias de ellas
    viven en clases que tambien escriben (ParkingTicketsView crea tiquetes,
    POSView crea cajas, POSDetailView las borra). El panel es de solo lectura, y
    esto lo vuelve cierto del lado del servidor en vez de depender de que el
    cliente se porte bien.

    El request local sigue pasando sin restriccion: el frontend React y el kiosko
    C# usan estas mismas vistas para escribir, y no deben verse afectados.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not is_local_request(request) and request.method not in ('GET', 'HEAD'):
            return JsonResponse(
                {'detail': 'Esta ruta es de solo lectura para integraciones externas.'},
                status=405,
            )
        return require_platform_token(view_func)(request, *args, **kwargs)

    return wrapper
```

Y aplicarlo a las vistas de la sección 3:

```python
@method_decorator(require_platform_token_readonly, name='dispatch')
class ParkingTicketsView(APIView):
    ...
```

Con eso, aunque el token se filtre, lo único que se puede hacer con él es
**mirar**. Y tu frontend y tu kiosko C# siguen funcionando igual, porque entran
por la red local.

> Si prefieres resolverlo de otra forma —un usuario de servicio de solo lectura,
> vistas nuevas separadas, lo que se te ocurra— nos sirve igual. Lo que
> necesitamos es la garantía, no esta implementación en particular.

---

## 3. Las rutas que necesitamos

Todas **ya existen**. No te estamos pidiendo construir funcionalidad nueva: te
pedimos exponerlas y protegerlas.

### 3.1. Resumen

Estado al 2026-09-12: **las doce publicadas y verificadas**. La columna de la
derecha conserva lo que se pidió en su momento.

| Ruta | Estado | Autenticación antes | Lo que se pidió |
| --- | :---: | --- | --- |
| `GET /api/parking/dashboard/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/parking/ticket/` | ✅ | **ninguna** | decorador + túnel |
| `GET /api/parking/ticket/<id>/` | ✅ | **ninguna** | decorador + túnel |
| `GET /api/parking/ticket/export/` | ✅ | **ninguna** | decorador + túnel |
| `GET /api/parking/vehicleType/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/reports/vehicles-in-parking/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/reports/daily/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/reports/monthly/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/reports/consolidated/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/reports/detailed-transactions/` | ✅ | `IsAuthenticated` | decorador + túnel |
| `GET /api/pos/` | ✅ | ninguna en `GET` | decorador + túnel |
| `GET /api/pos/<id>/` | ✅ | `IsCashier` | decorador + túnel |

Las que decían **ninguna** eran las que más preocupaban: estaban públicas para
cualquiera que alcanzara el servidor. Quedaron resueltas — hoy ninguna es
pública y todas exigen el token.

### 3.2. Qué mostramos con cada una

**`GET /api/parking/dashboard/`** → la pantalla de resumen.
Devuelve `presentTickets`, `todayTickets`, `thisMonthTickets`,
`totalProfitThisMonth`. Es lo primero que ve el administrador al entrar.

**`GET /api/reports/vehicles-in-parking/`** → "quién está adentro ahora".
Devuelve los totales —ahora también `total_bicycles`, `total_scooters` y
`total_undefined`, que ya se muestran por separado— y la lista, cada uno con
`plate`, `vehicle_type` (ya como nombre), `checked_in` y `client_type`.
Lo único que le falta es el `code`: ver 4.4.

**`GET /api/parking/ticket/`** → el historial.
Acepta `page`, `plate`, `status`, `vehicle_type`, `from_date`, `to_date`.
Cada tiquete trae sus `logs` anidados, y ahí está lo que más nos interesa: cada
log tiene `log_type` (`IN`/`PAID`/`OUT`/`COPY`), `timestamp`, `cash_charged` y
**`responsible`** — o sea *quién* registró la entrada y *quién* cobró.

**`GET /api/parking/ticket/<id>/`** → el detalle de un tiquete, con sus logs,
imágenes y la referencia de factura si la tiene.

**`GET /api/parking/vehicleType/`** → el catálogo de tipos de vehículo.
Se pidió porque el serializer devolvía `vehicle_type` como el id, y en la tabla
del administrador eso salía como un `4`. **Tomaste la otra salida que
planteábamos y agregaste `vehicle_type_label` al serializer**, que es mejor: se
resuelve en la misma respuesta y nos ahorra una consulta. La ruta queda publicada
por si hiciera falta, pero el panel ya no la usa.

**`GET /api/pos/`** → las cajas.
Ya devuelve, por caja, `status` (`OPEN`/`CLOSE`), `responsibleName`, `lastUsed`,
`open` y `close`. Es exactamente la pantalla de "cajas activas".

**`GET /api/pos/<id>/`** → los movimientos de esa caja.
Devuelve `cashAvailable` y la lista completa de `logs` (`POSLog`), cada uno con
tipo, responsable, tiquete, monto y comentario. En los cobros de nuestro kiosco
el comentario trae el voucher completo.

**`GET /api/reports/*`** → los reportes descargables.
`daily`, `monthly` y `consolidated` devuelven totales, desglose por método de
pago y por tipo de transacción, con `cash_at_start` / `cash_at_end`.
`detailed-transactions` devuelve la lista fila por fila. Filtros:
`from_date`, `to_date`, `date`, `month`, `pos_id`, `cashier_id`.

**`GET /api/parking/ticket/export/`** → el volcado sin paginar para exportar.
Devuelve `tickets`, `monthly_subscriptions` y `miscellaneous_services` filtrados
por `status`, `vehicle_type`, `from_date`, `to_date`.

> El archivo que descarga el administrador (CSV o Excel) **lo generamos
> nosotros** con esos datos. No necesitas construir ninguna descarga.

### 3.3. Reglas del túnel

Al `config.yml`, con el mismo patrón de regex que ya usas:

```yaml
  # --- Panel del administrador (solo lectura) ---
  - hostname: api.parkingpinning.com
    path: ^/api/parking/dashboard/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/parking/vehicleType/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/parking/ticket/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/parking/ticket/export/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/parking/ticket/[^/]+/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/reports/(daily|monthly|consolidated|detailed-transactions|vehicles-in-parking)/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/pos/?$
    service: http://localhost:8000

  - hostname: api.parkingpinning.com
    path: ^/api/pos/[0-9]+/?$
    service: http://localhost:8000
```

**Cuidado con el orden.** La regla `^/api/parking/ticket/[^/]+/?$` también casa
con `/api/parking/ticket/export/`, así que la de `export` va **antes**. Y ninguna
de estas debe quedar por encima de las de pago que ya tienes.

Después de agregarlas:

```powershell
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://api.parkingpinning.com/api/pos/
cloudflared tunnel ingress rule https://api.parkingpinning.com/admin/   # debe seguir dando 404
```

---

## 4. Puntos abiertos

Ninguno bloquea: podemos salir a producción sin ellos. Los dos últimos (4.4 y
4.5) aparecieron al conectar el panel de verdad y no estaban en la versión
anterior de este documento.

### 4.1. Tamaño de página configurable en el listado de tiquetes

`ParkingTicketsView` tiene `page_size = 10` fijo. Para una tabla de historial son
demasiadas vueltas: mostrar 50 filas son 5 peticiones por el túnel.

```python
page_size = min(int(request.GET.get('page_size', 10)), 200)
```

El tope evita que alguien pida 100.000 filas de una vez.

### 4.2. Los movimientos de caja, paginados y por fecha

`GET /api/pos/<id>/` devuelve **todos** los `POSLog` de esa caja, desde siempre,
sin límite. Hoy son pocos; en un año son decenas de miles, y esa respuesta se
vuelve pesada para el túnel y para el navegador.

Nos serviría que aceptara `from_date`, `to_date` y `page` / `page_size`, o bien
una ruta aparte:

```
GET /api/pos/<id>/movimientos/?from_date=&to_date=&page=&page_size=
```

Mientras tanto lo consumimos como está y recortamos del lado nuestro.

### 4.3. El responsable, con nombre — ✅ RESUELTO

En los `logs` del tiquete, `responsible` viene como el **id** del usuario. Para
mostrar "cobró: Juan Pérez" tendríamos que resolver cada id contra una lista de
usuarios que hoy no nos expones — y no queremos pedirte el listado de usuarios
solo para eso.

Lo ideal sería que el serializer incluyera el nombre junto al id, como ya hace
`POSView` con `responsibleName`:

```python
responsible_name = serializers.SerializerMethodField()

def get_responsible_name(self, obj):
    u = obj.responsible
    return f'{u.name} {u.surname}'.strip() if u else None
```

**Ya viene resuelto:** los `logs` traen `responsible` como el nombre de usuario
(`"Admin"`), no como el id. La columna "Entrada por" y "Cobró" del historial ya
muestran algo legible. Gracias.

---

### 4.4. Falta el `code` en `vehicles-in-parking`

La pantalla "Adentro ahora" es la única del panel que no puede mostrar el código,
porque `VehicleInParkingSerializer` devuelve `id`, `plate`, `vehicle_type`,
`checked_in` y `client_type`, pero no `code`.

Es justo la pantalla donde más se necesita: el administrador la mira cuando un
cliente se acerca a reclamar, y lo único que ese cliente puede citar es su código.
Hoy ahí mostramos el id, que es interno.

```python
code = serializers.CharField(allow_null=True)
```

### 4.5. `pay-checkout` cambia de forma cuando no hay nada que cobrar

Cuando el monto es cero, la respuesta viene sin ningún dato del tiquete:

```
GET /api/parking/ticket/L6Q57/pay-checkout/   →  200  {"price": 0}
GET /api/parking/ticket/C1X94/pay-checkout/   →  200  {"id":"41","code":"C1X94","plate":null,
                                                      "checked_in":"...","price":344340.0,
                                                      "billedTime":22956,"vehicle_type_label":"Bicicleta"}
```

Nos pasó con una patineta recién ingresada. Lo toleramos de este lado —cero es un
monto válido, no una respuesta rota— pero nos costó un rato entender por qué esa
consulta "fallaba" y las demás no. Si la forma fuera siempre la misma, con
`price: 0`, nadie más tropieza con esto.

De paso: nos hace pensar que **Patinete Eléctrico no tiene tarifa configurada**,
porque un vehículo con horas adentro debería deber algo. Encaja con lo que
advirtieron en su sección 6.3.

---

## 5. Qué NO te estamos pidiendo

Para que quede claro el alcance, y para que no dediques tiempo a nada de esto:

- **Ninguna vista nueva de escritura.** Ninguna.
- **Ninguna migración**, ningún cambio de modelos.
- **Ningún cambio en el cálculo de tarifas** ni en la lógica de cobro.
- **Ninguna generación de archivos.** Los CSV/Excel los armamos nosotros.
- **Nada del frontend React** ni del kiosko C#.
- **No tocar `backend/devices/`.**

---

## 6. Cómo lo probamos cuando lo tengas

Avísanos y corremos esto de nuestro lado:

```
npm run nova:panel
```

Comprueba, una por una, que las doce rutas responden, que devuelven lo esperado,
y —lo más importante— que **un `POST` a cualquiera de ellas es rechazado**.

Resultado del 2026-09-12:

```
Consultas que responden : 12 de 12
Escrituras bloqueadas   : 12 de 12
```

Mientras tanto el panel ya está construido. Cada pantalla que todavía no tiene su
ruta expuesta dice explícitamente que está esperando, en vez de mostrar datos
inventados o una tabla vacía que se leería como "este parqueadero no tuvo
movimiento".

---

## 7. Un aparte sobre el logo

Vamos a usar el logo de **Nova Parking** en toda nuestra plataforma —el
`logotipo.png` y el `newLogo.png` de tu `frontend/src/assets/img/`—. El
administrador entra a un panel de Nova Parking, no a un producto distinto, y
tiene más sentido que sea una sola marca.

Si prefieres que no, o si tienes los originales en vectorial (SVG o AI), dinos.
Los PNG se ven bien pero pierden nitidez en pantallas grandes.

---

## 8. Resumen para tu checklist

- [x] Agregar el decorador de solo lectura — hecho, responde `405`
- [x] Aplicarlo a las 12 vistas de la sección 3.1 — verificadas una por una
- [x] Publicar las rutas en el túnel — hechas, en `api.parqueadero122.com`
- [x] Nombre del responsable en los logs del tiquete — ya viene
- [x] Nombre del tipo de vehículo (`vehicle_type_label`) — ya viene
- [ ] *(opcional)* `page_size` en el listado de tiquetes — 4.1
- [ ] *(opcional)* fechas y paginación en los movimientos de caja — 4.2
- [ ] **`code` en `vehicles-in-parking`** — 4.4
- [ ] **Misma forma de respuesta en `pay-checkout` cuando el monto es cero** — 4.5

Cualquier cosa que no te cuadre, dinos y lo ajustamos: nada de esto vale la pena
si te desordena el sistema que ya funciona.
