# Publicar el punto de pago — Vercel + Supabase

## 1. Qué va en cada lugar

| Pieza | Dónde vive | Notas |
|---|---|---|
| **Web del punto de pago** (kiosco de pago, panel del administrador, SuperAdmin) **y su backend** | **Vercel** | Las rutas `/api/...` de Next.js *son* el backend: corren en Vercel junto con las pantallas. No hay otro servidor que montar para esta web. |
| **Base de datos de la web** (usuarios, pagos, facturas, clientes, credenciales cifradas) | **Supabase** | Solo se usa su PostgreSQL. No se usa Supabase Auth ni Storage: el inicio de sesión es propio de la web. |
| **Nova Parking** (Django), cámaras, barreras, Raspberry | **Servidor Linux del parqueadero** | Ya instalado por Moyano. No va a la nube: abre las barreras por la red local. |
| **Túnel de Cloudflare** (`api.parqueadero122.com`) | Servidor Linux del parqueadero | Por ahí la web consulta vehículos y confirma pagos. |
| **Facturación** | SIIGO (nube) | La web la llama; se configura en Administración. |
| **Datáfono** | SIPConnector de Redeban (nube) | La web la llama; no hay programa local en el kiosco. |
| **Correo** (recuperar contraseña) | Resend | Requiere un dominio propio verificado. |
| **Kioscos** | Equipos en el parqueadero | Solo un navegador abierto en la web publicada. |

En resumen: **Vercel y Supabase para la web**. El backend del parqueadero ya está en el servidor Linux. No hace falta un backend aparte.

---

## 2. Supabase (base de datos)

1. Crear un proyecto en la región **South America (São Paulo)**, la más cercana a Colombia.
2. En *Project Settings → Database → Connection string*, copiar **dos** cadenas:
   - **Transaction pooler** (puerto **6543**). Es la que usa Vercel. Al final se le agrega `?pgbouncer=true&connection_limit=1`.
   - **Direct connection** (puerto **5432**). Solo para crear las tablas desde tu PC.
3. Crear las tablas y los usuarios iniciales **desde tu PC**, en PowerShell dentro de `Punto de pago`:
   ```powershell
   $env:DATABASE_URL = "<cadena DIRECTA de Supabase>"
   npx prisma migrate deploy
   $env:SEED_SUPERADMIN_EMAIL = "tu-correo@dominio.com"
   $env:SEED_SUPERADMIN_PASSWORD = "<contraseña larga y nueva>"
   $env:SEED_ADMIN_PASSWORD = "<otra>"
   $env:SEED_POS_PASSWORD = "<otra>"
   npm run db:seed
   ```
   **Importante:** el seed trae contraseñas de ejemplo si no se le pasan las variables `SEED_*_PASSWORD`. En producción siempre hay que pasarlas.

**¿Y los datos que ya tienes en local?** (credenciales de SIIGO y Redeban, clientes, pagos de prueba) Hay dos caminos:
- **Empezar limpio (recomendado):** tras el seed, entra como SuperAdmin y vuelve a cargar la conexión con Nova Parking, SIIGO y Redeban.
- **Llevar la base local:** exportarla con `pg_dump` desde el contenedor local y restaurarla en Supabase. En ese caso, en Vercel hay que usar **exactamente el mismo** `CREDENTIALS_ENCRYPTION_KEY` del `.env` local; si no, las credenciales guardadas no se pueden descifrar.

---

## 3. Vercel (la web)

1. **Subir el código.** Hay dos formas:
   - Crear un repositorio de GitHub **solo con la carpeta `Punto de pago`** e importarlo en Vercel; o
   - Desde la carpeta, `npx vercel` y seguir las preguntas.
   
   `.vercelignore` ya deja fuera el `.env`, los documentos con credenciales de prueba y `node_modules`. En GitHub, revisa que `.env` no se suba.
2. **Framework:** Next.js, detectado solo. Comando de build: `npm run build`, que ya incluye `prisma generate`.
3. **Variables de entorno** (*Settings → Environment Variables*, entorno Production):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | Cadena **pooler** de Supabase (puerto 6543) con `?pgbouncer=true&connection_limit=1` |
   | `AUTH_SECRET` | Cadena aleatoria nueva de 64 caracteres o más |
   | `CREDENTIALS_ENCRYPTION_KEY` | Nueva si empiezas limpio, o la misma del local si llevas la base |
   | `SESSION_TTL_MINUTES` | Igual que en local |
   | `NOVA_PARKING_TIMEOUT_MS` | Igual que en local |
   | `APP_URL` | `https://<tu dominio>`. Va en el QR de la factura y en los enlaces de correo; con `127.0.0.1` los QR impresos no abren |
   | `RESEND_API_KEY`, `MAIL_FROM` | Resend, con un remitente de **tu** dominio (hoy el remitente es de otro producto) |
   | `CRON_SECRET` | Cadena aleatoria larga |
   | `SIIGO_*`, `REDEBAN_*` | Solo si los usas como valores globales. Lo normal es configurarlos por parqueadero en Administración |

   Para generar una cadena aleatoria en PowerShell:
   `[Convert]::ToBase64String((1..48 | % { Get-Random -Max 256 }))`
4. **Dominio:** en *Settings → Domains*, agregar por ejemplo `pago.parqueadero122.com`. En el DNS de Cloudflare del dominio, crear el `CNAME` que indique Vercel, con la nube en **gris** (solo DNS).
5. **Tarea programada:** `vercel.json` ya trae una diaria que reintenta las facturas que SIIGO no emitió (`/api/cron/invoices`, protegida con `CRON_SECRET`).

**Plan:** el plan gratuito de Vercel (Hobby) es solo para uso personal, no comercial, y permite una sola tarea programada al día. Para un parqueadero en operación va el plan **Pro**. En Supabase, el plan gratuito pausa el proyecto tras días sin actividad: para producción, plan de pago.

---

## 4. Después de publicar

1. Entrar como SuperAdmin en `https://<tu dominio>/login`.
2. **Administración → Parqueadero 122:**
   - Conexión: `https://api.parqueadero122.com` y el token de Nova Parking.
   - Facturación SIIGO: activar *Enviar la factura electrónica al correo del cliente* y usar un comprobante **electrónico**.
   - Datáfono (Redeban).
   - Marcar *Este kiosco tiene impresora de recibos* si el kiosco de pago tiene impresora.
   - En *Datos del parqueadero*: NIT y dirección, que salen en la factura impresa.
3. **Pedirle a Moyano** que en el servidor ponga `"url_publica_tiquete": "https://<tu dominio>/t"` en `deploy/sitios/parqueadero_122.json` y corra `configurar_sitio`. Así el QR de la pantalla de entrada abre el tiquete en el celular.
4. **Resend:** verificar el dominio del remitente.

---

## 5. El kiosco de pago en el parqueadero

Pantalla táctil con el escáner QR, el datáfono y la impresora de recibos (probada con **DigitalPos / Gainscha GA-E200I**, 80 mm). Hay dos formas de montarlo.

### A. Tablet Android (recomendado: sin controladores)

La web le habla a la impresora por USB con sus propios comandos (ESC/POS). No se instala nada.

1. Conectar la impresora a la tablet con un cable **OTG** (USB-C o micro-USB a USB) y encenderla.
2. Abrir **Google Chrome** (no otro navegador: WebUSB solo está en Chrome) en `https://<tu dominio>/login` e iniciar sesión con el usuario del punto de pago.
3. En el kiosco, mantener presionado el nombre del parqueadero 3 segundos → **Configurar la impresora del kiosco** → **Conectar impresora** → elegirla → **Imprimir prueba**. Chrome la recuerda: no se vuelve a pedir.
4. Dejar la tablet fija en el kiosco: *Ajustes → Seguridad → Fijar aplicación* (o "Anclar pantalla") sobre Chrome.

### B. PC con Windows

Windows toma la impresora USB con su controlador de impresión (`usbprint`), y así Chrome no la puede abrir: la web cae al cuadro de impresión del navegador. Se arregla una sola vez por PC:

1. **Impresora térmica de 80 mm, por USB directo (recomendado):**
   - Conectarla y encenderla.
   - Correr `scripts\windows\impresora-winusb.ps1` (clic derecho → *Ejecutar con PowerShell*; pide permiso de administrador). Le pone el controlador **WinUSB** que ya trae Windows; no se descarga nada.
   - El mismo script **autoriza la impresora para la web en Chrome y Edge** (política `WebUsbAllowDevicesForUrls`). Al cerrar y reabrir el navegador, el kiosco la detecta sola: no hay que entrar a `/impresora` ni tocar nada. Se comprueba en `chrome://policy`. Si la web tiene otro dominio: `impresora-winusb.ps1 -Url https://<tu dominio>`.
   - Para probarla: `https://<tu dominio>/p/122/pos/impresora` → **Imprimir prueba**. Desde ahí la web imprime sola la factura o el comprobante: sin cuadro de impresión, con QR y corte de papel.
   - Con WinUSB la impresora ya no aparece como impresora de Windows (solo la usa la web). Para devolverla: `impresora-winusb.ps1 -Revertir`.
2. **Alternativa, por el navegador:** instalar el controlador del fabricante (Gainscha/DigitalPos), dejarla **predeterminada** con papel de 80 mm y abrir Chrome con `--kiosk-printing` (paso 4). Si solo aparecen "Microsoft Print to PDF" o "XPS", falta el controlador.
3. **Escáner QR USB:** funciona como un teclado; no se configura nada.
4. **Chrome en modo kiosco,** con un acceso directo que se abra al iniciar Windows:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing https://<tu dominio>/p/122/pos
   ```
   `--kiosk-printing` solo hace falta en la alternativa del paso 2; no estorba en la del paso 1.
5. Iniciar sesión una vez con el usuario del punto de pago. La sesión y la impresora autorizada quedan guardadas en ese navegador.

---

## 6. Riesgos a confirmar antes de producción

- **IP fija:** Vercel no sale a internet con una IP fija. No encontré en la documentación de Redeban/SIPConnector ni de SIIGO que exijan registrar una IP, pero **confírmalo con Redeban**. Si la exigieran, el cobro con datáfono tendría que salir por un servidor con IP fija.
- **Túnel:** hoy `api.parqueadero122.com` responde 502 (el túnel está arriba pero no llega al backend del servidor). Hasta que Moyano lo corrija, la web publicada tampoco podrá consultar vehículos.
