# Seguridad de la plataforma

Qué protege la plataforma web, dónde vive cada defensa y qué hacer cuando algo salta.

## 1. Capas, en el orden en que actúan

| Capa | Dónde | Qué hace |
|---|---|---|
| Métodos | `src/middleware.ts` | Solo GET, HEAD, POST y OPTIONS. El resto responde 405. |
| Trampas de escaneo | `src/lib/security/policy.ts` | `/.env`, `/.git`, `/wp-login.php`, `*.php`, `/phpmyadmin`, recorridos `../`, `${jndi:`, herramientas como sqlmap o nikto: responde 404 y suma faltas a la IP. |
| IP bloqueada | `src/lib/security/blocklist.ts` | 403 en todas las pantallas y en la API. Ver sección 2. |
| Ráfagas | middleware | 300 peticiones por minuto por IP, contadas en la memoria de la instancia. Es la primera barrera y no cuesta ninguna consulta. |
| Escrituras | middleware | Cuerpo de 256 KB como máximo. Todo POST tiene que venir de este mismo sitio (`Origin` / `Sec-Fetch-Site`): un POST sin origen no lo hizo nuestro navegador, y uno con otro origen es CSRF. |
| Sesión y rol | middleware + `src/lib/auth/guards.ts` | Firma del JWT, sesión viva en la base y rol por área. Cada ruta y cada server action vuelven a validar el rol y el parqueadero. |
| Límites por acción | `src/lib/rate-limit.ts` | Contador **compartido entre instancias** (tabla `rate_limit_buckets`). Ver tabla de límites. |
| Cabeceras | `next.config.ts` | CSP, HSTS de 2 años, `X-Frame-Options: DENY`, COOP/CORP, `nosniff`, `noindex`. |
| Sistema del parqueadero | `src/integrations/nova-parking/guard.ts` | Ver sección 3. |

### Límites por acción

| Acción | Límite | Llave |
|---|---|---|
| Login | 10/min | por IP |
| Login | 20/hora | por cuenta, sumando todas las IPs |
| Cuenta con 5 fallos | bloqueada 15 min | por usuario (`users.lockedUntil`) |
| Recuperar contraseña | 5 / 10 min | por IP |
| Restablecer contraseña | 10 / 10 min | por IP |
| Buscar vehículo (kiosco) | 40/min | por usuario |
| Crear cobro | 20/min | por usuario |
| Estado del cobro / factura (sondeo) | 90/min | por usuario |
| Cliente (kiosco) | 30/min | por usuario |
| Foto (kiosco / panel) | 30 / 240 por min | por usuario |
| Reporte Excel | 6/min | por usuario |
| Factura pública `/factura/<token>` | 30/min | por IP |

## 2. Bloqueo de IPs

Cada comportamiento sospechoso suma faltas a la IP, en una ventana de una hora:

| Falta | Peso |
|---|---|
| Herramienta de ataque en el User-Agent | 5 |
| Ruta de escaneo | 4 |
| POST desde otro sitio o sin origen | 3 |
| Pasarse de un límite | 2 |
| Login fallido, incluidos los intentos contra una cuenta ya bloqueada | 1 |
| Token de factura o de restablecimiento inexistente | 1 |

Con **10 faltas** la IP queda bloqueada. Cada reincidencia dura más: 15 min → 1 h → 6 h → 1 día → 7 días. Tres rutas de escaneo bastan para bloquear una IP.

**Excepciones:**
- **Las peticiones con una sesión firmada válida no se bloquean por IP.** El kiosco y el administrador del parqueadero salen a internet por la misma IP. Sin esta excepción, algo raro en esa red dejaría el kiosco fuera de servicio. Esas sesiones siguen sujetas a los límites por usuario.
- **`SECURITY_ALLOWLIST_IPS`** (variable de entorno, IPs separadas por comas) nunca se bloquea. Sirve, por ejemplo, para la IP fija de la oficina.

**Pantalla:** SuperAdmin → **Seguridad** (`/admin/seguridad`). Muestra las IPs bloqueadas y su motivo, permite desbloquear y bloquear a mano, y lista los últimos eventos. Los eventos se guardan 90 días; los depura la tarea programada diaria (`/api/cron/invoices`).

**Si el SuperAdmin queda bloqueado** (sin sesión abierta), hay dos salidas: agregar su IP a `SECURITY_ALLOWLIST_IPS` en Vercel, o desbloquearla en la base:

```sql
UPDATE blocked_ips SET "blockedUntil" = now(), permanent = false WHERE ip = '<ip>';
```

## 3. El sistema del parqueadero (Nova Parking)

Al túnel de Moyano solo llega esta plataforma: el token vive cifrado en la base y en el servidor, y el navegador nunca habla con el túnel. Además:

- **Límite compartido:** 240 lecturas por minuto por parqueadero, sumando todas las instancias.
- **Cortacircuito:** con 5 fallas seguidas (caído, timeout o 5xx), se deja de consultarlo 20 s.
- **Caché corta de 10 s** para las lecturas del panel. Antes, varias pestañas y el refresco automático pedían lo mismo una y otra vez.
- **Confirmar un pago nunca se frena:** un cobro aprobado en el datáfono tiene que llegar siempre a su sistema.

**Recomendado del lado de Moyano**, porque nosotros no podemos hacerlo:
- Una regla de *rate limiting* de Cloudflare en el túnel, sobre `/api/`.
- Que toda ruta exija `X-Platform-Token`. Hoy la responden con 403 si falta.
- Rotar el token si alguna vez circuló por chat o correo.

## 4. Base de datos

Las tablas `rate_limit_buckets`, `blocked_ips` y `security_events` las crea la migración `20261008120000_seguridad`. Solo agrega tablas, no toca datos, y les pone RLS igual que al resto.

**Si la migración no está aplicada**, nada se rompe: los límites se cuentan en memoria y no se bloquea a nadie. La pantalla de Seguridad lo avisa.

Para aplicarla en Supabase, con la conexión **directa** o el pooler en **modo sesión** (puerto 5432, no el 6543 de Vercel):

```powershell
$env:DATABASE_URL = "<cadena de Supabase, puerto 5432>"
npx prisma migrate status   # debe listar solo 20261008120000_seguridad como pendiente
npx prisma migrate deploy
```

## 5. Qué NO cubre esto

- **Un ataque de volumen (DDoS) de verdad** lo frena Vercel antes de que llegue a la aplicación. Si hace falta más, se puede activar *Attack Challenge Mode* en el Firewall del proyecto en Vercel.
- **La CSP permite scripts en línea**, porque los usan el tema del kiosco y Next. Sí bloquea iframes ajenos, el envío de datos a otros dominios y los plugins.
