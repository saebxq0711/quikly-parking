# Nova Parking System — Contexto para Claude

## Que es este proyecto

Sistema de gestión de parqueadero real 
Desarrollado y mantenido por **Edier Moyano** (ediersmb@gmail.com).

Monorepo con 5 subproyectos:
- `backend/` — Django 3.1.2 + DRF + SQLite, puerto 8000
- `frontend/` — React 18 + TypeScript + Tailwind + Vite, puerto 5173
- `desktopApp/` — Electron que empaqueta el frontend para Windows
- `pi-entry/` — Script Python para Raspberry Pi (entrada de vehículos)
- `pi-exit/` — Script Python para Raspberry Pi (salida de vehículos)

---

## Como correr el proyecto localmente

**Opcion rapida — doble clic en `iniciar.bat`** (en la raiz del proyecto o en `archvios bat ejecutar facil\`)

**Opcion manual:**

Terminal 1 — Backend:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py runserver
```

Terminal 2 — Frontend:
```powershell
cd frontend
npm run dev
```

URLs:
- `http://127.0.0.1:5173` — aplicacion principal (**no** `localhost:5173` — el navegador trata
  `localhost` y `127.0.0.1` como sitios distintos para las cookies `SameSite=Lax`; como
  `VITE_API` apunta a `127.0.0.1:8000`, entrar por `localhost:5173` hace que el login funcione
  en el backend pero el navegador descarte la cookie de sesión sin ningún error visible)
- `http://127.0.0.1:8000/swagger/` — documentacion API
- `http://127.0.0.1:8000/admin/` — panel admin Django

Python requerido: **3.11** (no funciona con 3.13 por incompatibilidad con gevent).

---

## Tareas activas (Agosto 2026)

> **Empezar por `HANDOFF.md`** — tiene el estado real y detallado de todo. Esta sección es
> solo el resumen rápido. Docs vivos con más detalle: `docs/pagos/SIMULACION_FLUJO_PROYECTO.md` (flujo
> simulado + pendientes) e `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` (qué se construyó, archivo
> por archivo).

**Importante — modelo de uso del datáfono:** el pago con tarjeta es **100% autónomo, sin
cajero**. El cliente interactúa solo con el kiosko (`NovaAutoCheckout/`, app de escritorio
C#) — no hay ningún operario en ese flujo. Cualquier diseño nuevo debe asumir esto.

### FASE 1 — Cloudflare Tunnel (activo — falta solo instalarlo como servicio)
Dominio **`parkingpinning.com`** agregado a Cloudflare y túnel `nova-parking` activado el
2026-08-21 (id `c575049a-da7f-4ef6-acb9-7d1baa48503f`). Probado de punta a punta: `/admin/` y
`/swagger/` dan 404 en el borde de Cloudflare, las rutas de pago llegan normalmente a Django.
- `backend/parking/settings.py` lee `CSRF_TRUSTED_ORIGINS` extra desde `.env` — activo
- `C:\Users\edier\.cloudflared\config.yml` con el UUID real, rutas restringidas solo a pagos,
  y `protocol: http2` fijo (la red del parqueadero bloquea UDP/QUIC, se detectó al activar)
- `backend/.env` → `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` con el dominio real, activo
- Corriendo ahora en modo manual (`cloudflared tunnel run`) — no sobrevive un reinicio
- Falta: `cloudflared service install` (necesita Administrador de Windows, pendiente)

### FASE 2 — Modulo QR para vehiculos sin placa (construido 2026-08-26)
Pantalla dedicada para bicicletas/patinetes: registrar ingreso → mostrar QR en pantalla → cobrar a la salida.

**Construido:**
- Backend: `CreateNoPlateTicketView` (`parkingManager/views.py`, cerca de `FindParkingTicketBike`)
  — crea el tiquete (`plate=None`), el log de auditoría `IN`, y devuelve el QR en base64.
  `permission_classes=[IsAuthenticated]` — la usa un operario desde el frontend React, no el
  kiosko autónomo.
- Ruta: `POST /api/parking/no-plate-ticket/`
- `FindParkingTicketBike` (`views.py:2270`) ya **no** filtra por `vehicle_type=2` — ahora
  filtra por `plate__isnull=True` (más `plate=''`), así sirve para cualquier tipo sin placa
  sin mantener una lista de IDs.
- El QR codifica solo `str(ticket.id)`, sin prefijo — así lo encuentra la búsqueda existente
  (`id_str__startswith`) y es consistente con el QR ESC/POS de vehículos con placa
  (`views.py:96-175`, que tampoco usa prefijo).
- `backend/parkingManager/management/commands/setup_no_plate_vehicle_types.py` — crea
  `VehicleType` "Bicicleta"/"Patinete Eléctrico" + su `Fee` con **tarifa de prueba
  ($10/minuto)** — el cliente debe confirmar el precio real antes de producción.
- Frontend: `frontend/src/pages/ParkingNoPlate.tsx`, ruta `parking/no-plate` en `router.tsx`,
  ítem "Sin Placa" en el sidebar de `mainLayout.tsx`.
- Probado de punta a punta: crear tiquete → QR generado → encontrado por
  `find-ticket/bike/?term=<id>`. Frontend compila (`npm run build`) sin errores.

**Pendiente (depende del cliente, no de código):** confirmar la tarifa real para
Bicicleta/Patinete, y cómo se va a escanear el QR a la salida (lector físico, celular, etc.).

### FASE 3 — Pagos con datáfono: Redeban N6202 vía SIPConnector (terreno construido)
**Ya NO es un webhook simple.** El cliente entregó el manual real de integración
("SIPConnector V1.5"): es un servicio intermediario en la nube (no el datáfono directo, no
Redeban directo). Construido y probado contra el sandbox real: app `backend/payments/`
completa — `SIPConnectorConfig`, cliente HTTP (`Token`/`EnviarDatos`/`Respuesta`/`Borrar`),
codec del protocolo (texto por comas, no JSON), resolución de transacciones, poller de
respaldo. Falta: credenciales de afiliación (bloquea probar cobros reales) y el disparador
real de cobro en el kiosko (a propósito no se construyó — es trabajo del compañero de pagos).
Detalle completo: `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` sección 9.

### FASE 4 — Scripts de despliegue y ejecutables (listos)
Scripts `.bat` para instalacion y ejecucion con doble clic. Electron configurado para generar instalador `.exe` de Windows.

**Archivos creados:**
- `instalar.bat` — instalacion completa desde cero (venv, deps, migrate, grupos)
- `iniciar.bat` — arranca Django + React y abre el navegador
- `detener.bat` — mata procesos en puertos 8000 y 5173
- `archvios bat ejecutar facil\` — mismos bat + `MANUAL_RAPIDO.md` para el usuario final
- `desktopApp/package.json` — agregado `"build:win"` y config NSIS para instalador Windows

**Para generar el instalador `.exe` del frontend (Electron):**
```powershell
cd frontend && npm run build   # genera dist/
cd ..\desktopApp && npm run build:win  # genera instalador .exe
```

**Para desplegar en un sitio nuevo:** misma carpeta `duitama\`, nuevo tunnel en la cuenta Cloudflare, actualizar `.env` con la URL del sitio. Ver `docs/referencia/GUIA_TECNICA_IMPLEMENTACION.md` → FASE 1 sección 9.

---

## Arquitectura y decisiones importantes

### Autenticación
- **Django Session con cookies** — NO es JWT
- El cookie `sessionid` se envía automáticamente en cada request
- Axios configurado con `withCredentials: true` y `xsrfCookieName: 'csrftoken'`
- Grupos de usuarios: `Admin` y `Cashier`

### Modelos clave

**ParkingTicket** (`parkingManager/models.py:210`):
- `plate` — nullable (vehículos sin placa)
- `vehicle_type` — FK a VehicleType
- `status` — `IN` → `PAID` → `OUT`
- `cancelled` — bool

**VehicleType** (`parkingManager/models.py:12`):
- Solo tiene `label` (nombre)
- Tipos: Carro, Motocicleta (con placa) + Bicicleta, Patinete Eléctrico (sin placa, Fase 2)
- **No asumir el pk** — varía entre entornos (ej. en la BD local Motocicleta quedó en pk=4,
  no pk=2, porque Bicicleta ya ocupaba el 2 cuando se creó). Código nuevo debe buscar por
  `label`, no por pk fijo — un pk=2 hardcodeado asumiendo que es Motocicleta fue justo el bug
  que hizo que `pos/views.py` contara bicicletas como motos (corregido 2026-08-27, ver
  `HANDOFF.md` 3.4)

**Fee** (`parkingManager/models.py:70`):
- OneToOne con VehicleType
- Campos: `mainFee`, `nightFee`, `fullFeeDia`, `fullFeeNoche`, `monthlyFee`

### App `backend/payments/` (nueva — integración de pagos)
- `SIPConnectorConfig` — credenciales/config del datáfono, singleton (mismo patrón que
  `billing.SiigoConfig`)
- `sipconnector_client.py` — cliente HTTP del protocolo SIPConnector
- `sipconnector_codec.py` — codifica/decodifica el formato de texto por comas del manual
- `PaymentTransaction` / `RedebanWebhookLog` — auditoría de cobros y del webhook
- Ver `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` para el detalle completo

### Kiosko autónomo `NovaAutoCheckout/` (C#, WPF)
App de escritorio separada (Visual Studio) para cobro sin cajero. Hoy solo acepta **efectivo**
(lector de billetes ITL). Habla con Django por **red local** (`Global.ServerIP:8000`, no por
el túnel) — `GET/POST /api/parking/ticket/<id>/pay-checkout/`. Es donde eventualmente se
agrega la opción de tarjeta (Redeban/SIPConnector) — no tocada todavía.

### Frontend
- `axiosConfig.ts` — instancia Axios con baseURL desde `VITE_API`
- `sessionContext.tsx` — estado global: sessionId, userName, groups
- `router.tsx` — verifica auth con `GET /api/auth/user/` al cargar
- `mainLayout.tsx` — sidebar con secciones colapsables (Parqueadero, Mensualidades, Reportes, Config)
- Hooks en `frontend/src/hooks/` — cada entidad tiene su hook (useVehicleType, useParkingTickets, etc.)

---

## Archivos que NO se deben tocar

- `backend/devices/` — tiene migraciones con nombres duplicados, rompe si se toca
- `backend/parkingManager/models.py` — no necesita cambios para las tareas actuales
- `backend/parkingManager/serializers.py` — `FindTicketBikeSerializer` ya existe y funciona
- Cualquier migración existente — solo crear migraciones nuevas

---

## Variables de entorno

**`backend/.env`** (requeridas):
- `SECRET_KEY` — clave Django
- `CAMERA_USERNAME`, `CAMERA_PASSWORD` — credenciales Hikvision
- `DEFAULT_RESET_PASSWORD`, `TEST_USER_PASSWORD`, `CANCEL_PASSWORD` — contraseñas internas
- `DEBUG=True`, `DEBUG_OVERRIDE=True` — para desarrollo local
- `ALLOWED_HOSTS=localhost,127.0.0.1`

**`backend/.env`** (opcionales, pagos — vacías hasta que lleguen credenciales, todas tienen
default y no rompen el arranque si faltan):
- `REDEBAN_WEBHOOK_SECRET` — secreto compartido para el webhook (`/api/payments/redeban/webhook/`)
- `SIPCONNECTOR_BASE_URL`, `SIPCONNECTOR_CODIGO_UNICO`, `SIPCONNECTOR_USUARIO`,
  `SIPCONNECTOR_CLAVE`, `SIPCONNECTOR_CODIGO_TERMINAL`, `SIPCONNECTOR_RED`,
  `SIPCONNECTOR_CODIGO_CAJERO`, `SIPCONNECTOR_NUMERO_CAJA` — credenciales del datáfono N6202

**`frontend/.env`**:
- `VITE_API=http://127.0.0.1:8000`
- `VITE_CARDS=true`, `VITE_DEVICES=true`, `VITE_SINGLE=true`

---

## Errores conocidos del entorno de desarrollo

| Error | Causa | Solucion |
|-------|-------|----------|
| gevent no compila | Python 3.13 | Usar Python 3.11 |
| `No module named PIL` | ~~Pillow falta en requirements.txt~~ — ya corregido, esta en requirements.txt | Si aun asi falla: `pip install Pillow` |
| `Group matching query does not exist` | Grupos no creados | `python manage.py shell -c "from django.contrib.auth.models import Group; Group.objects.get_or_create(name='Admin'); Group.objects.get_or_create(name='Cashier')"` |
| Emojis UnicodeEncodeError en consola | Consola Windows en cp1252 | Solo es warning de logging, no afecta funcionamiento |
| Siigo 500 en `/app/parking/clients` | Requiere credenciales Siigo (solo produccion) | Normal en desarrollo local, ignorar |
| 500 al abrir/cerrar caja o al cobrar un tiquete | Faltan las claves de `Config` (factura/horario) — `.first().value` explota si la fila no existe (ver `HANDOFF.md` 3.4) | `python manage.py setup_parking_config` |
| Login da 404 por HTTP pero `authenticate()` funciona en `shell` | Otro `runserver`/`vite` viejo (de otro proyecto o intento anterior) sigue ocupando el puerto 8000/5173 con otra base de datos | Matar el proceso viejo y arrancar `runserver`/`npm run dev` desde el venv/carpeta correctos — ver `docs/despliegue/PUESTA-EN-MARCHA-LOCAL.md` seccion 7 |

---

## Documentos del proyecto

| Archivo | Contenido |
|---------|-----------|
| `HANDOFF.md` | **Empezar por aquí.** Estado real y detallado: objetivo, qué se hizo, qué falló, qué sigue |
| `RESUMEN_2026-08-27/RESUMEN.md` | Qué se corrigió en esa sesión (bugs reales: Config faltante, Motocicleta faltante, botón Moto del kiosko roto), qué falta por dueño (cliente/Edier/compañero de pagos), y cómo se ve la integración final |
| `docs/pagos/CAMBIO_METODO_PAGO_KIOSKO.md` | Pantalla de selección de método de pago en el kiosko + endpoint unificado de inicio de cobro (efectivo/tarjeta) — qué había antes, qué hay ahora, pendientes |
| `docs/despliegue/COMANDOS_TUNEL_CLOUDFLARE.md` | Comandos copia-pega del túnel: instalar como servicio en esta máquina, guía para instalarlo en un sitio/PC nuevo, y cómo verificar que solo las 2 rutas de pago son alcanzables |
| `docs/despliegue/INSTALAR_PC_NUEVO.md` | Instalador completo para la máquina de producción (mismo sitio, migra el túnel existente) — qué automatiza el script, qué queda manual, y el checklist completo de credenciales |
| `docs/pagos/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md` | **Leer primero** — mapa completo del proyecto para el compañero de pagos: el flujo real hoy, el túnel a fondo, y la teoría de cómo (no) se conecta con el datáfono (saliente vs. entrante) |
| `docs/pagos/INTEGRACION_DATAFONO_COMPANERO.md` | Guía práctica para el compañero de pagos: qué ya está construido, qué falta (el disparador real de cobro), y dónde entra el túnel |
| `docs/pagos/SIMULACION_FLUJO_PROYECTO.md` | Flujo simulado de pagos (Redeban/SIPConnector), módulo QR (preparación), qué depende de quién |
| `docs/pagos/IMPLEMENTACION_CLOUDFLARE_REDEBAN.md` | Qué se construyó exactamente, archivo por archivo, y por qué |
| `docs/planificacion/PLAN_DESARROLLO.md` | Plan de 30 dias con checklists por fase (ver estado actualizado en cada fase) |
| `docs/referencia/GUIA_TECNICA_IMPLEMENTACION.md` | Codigo de referencia para las 4 fases originales, con notas de qué cambió en la implementación real |
| `docs/referencia/GUIA_ESTUDIO_PROYECTO.md` | Mapa de todos los archivos, como se conectan frontend/backend |
| `docs/despliegue/INSTALACION_LOCAL.md` | Como instalar y correr el proyecto desde cero (manual detallado) |
| `docs/despliegue/PUESTA-EN-MARCHA-LOCAL.md` | Diagnostico de referencia (fork `duitama2`) — llevo a encontrar y corregir el bug de Config faltante (crear/abrir caja, cobrar), ver `HANDOFF.md` 3.4 |
| `docs/cliente/PROPUESTA_CLIENTE.md` | Propuesta comercial para el cliente ($3.200.000 COP, 30 dias) |
| `archvios bat ejecutar facil\MANUAL_RAPIDO.md` | Manual simplificado de instalacion y ejecucion para el usuario final |

---

## Convenciones del proyecto

- Los endpoints del backend siempre terminan en `/` (Django `APPEND_SLASH=True` esta desactivado pero los urls.py los tienen)
- El frontend usa `client` (instancia Axios) importado desde `../axiosConfig`
- Las paginas nuevas siguen el patron: `RouteLayout` como wrapper, hooks propios para datos, `toast` para notificaciones
- No hay tests automatizados — probar manualmente en el navegador
- La BD es SQLite local — hacer backup de `backend/db.sqlite3` antes de cualquier migracion
