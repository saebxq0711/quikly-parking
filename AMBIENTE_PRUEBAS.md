# Modo de pruebas y regreso a producción — Parqueadero 122

> **Actualización 14/09/2026: el modo de pruebas del 122 está APAGADO.** El kiosco ya consulta el sistema real por `https://api.parqueadero122.com` (el servidor Linux de Moyano). Redeban y SIIGO siguen con credenciales de pruebas hasta tener las de producción. El 122 tiene un kiosco, *Kiosco principal*, **sin impresora**: muestra el comprobante en pantalla y lo envía al correo del cliente si lo dio. Lo de abajo queda como referencia de cómo se usó el modo de pruebas.

## 1. Qué está activo hoy (13/09/2026)

El parqueadero **122** está en **modo de pruebas**. El kiosco no consulta el sistema de Moyano: usa un **parqueadero simulado** dentro de la web (`src/integrations/nova-parking/simulator.ts`). Sirve para probar el escáner QR, la impresora y el datáfono sin depender del túnel ni del servidor Linux.

| Pieza | En modo de pruebas |
|---|---|
| Sistema del parqueadero (vehículos, valores, confirmación) | **Simulado** |
| Datáfono Redeban (SIPConnector) | **Real**, ambiente de **pruebas** de Redeban |
| Factura SIIGO | **Real**, ambiente de **pruebas** de SIIGO (comprobante no electrónico, sin envío por correo) |
| Correo (Resend) | Real (recuperación de contraseña) |
| Impresora del kiosco | Real (el punto de pago está marcado *con impresora*) |

En el kiosco y en el panel del administrador aparece el aviso **"Modo de pruebas"**.

### Datos para probar

| Qué escribir o escanear | Resultado | Valor |
|---|---|---|
| Cualquier placa válida (`ABC123`, `ABC12D`) en **Carro** | Carro adentro | **$2.000** |
| Cualquier código válido (`A7B48`) en **Moto** | Moto adentro | **$1.500** |
| Cualquier código válido en **Bicicleta** o **Patineta** | Adentro | **$1.000** |
| `ZZZ999` (placa) o `Z9Z99` (código) | "No encontramos tu vehículo" | — |
| El mismo vehículo, justo después de pagarlo | "Ya fue pagado" (15 minutos) | — |

- Los códigos válidos tienen 5 caracteres, letra-número-letra-número-número, sin I ni O.
- La permanencia que se muestra es fija para cada placa o código.
- El panel del administrador no tiene datos simulados: sus tarjetas dicen "no disponible por ahora". Los **Pagos del kiosco** sí son reales y aparecen ahí.

---

## 2. Configuración de producción guardada

El modo de pruebas **no borra nada**. Esto es lo que había en Supabase justo antes de activarlo, y sigue guardado:

| Dato | Valor |
|---|---|
| Parqueadero | `122` — Parqueadero 122, activo |
| Sistema del parqueadero (túnel) | `https://api.parqueadero122.com` |
| Token de Nova Parking | Guardado **cifrado** en la base (el mismo de Moyano) |
| Datos del emisor (razón social, NIT, régimen, dirección, ciudad, departamento, teléfono) | **Sin cargar.** El proyecto de Moyano solo trae los de su base de pruebas ("PARQUEADERO GOMEZ GOMEZ", marcados "confirmar con el cliente"). Hay que pedirlos al cliente |
| Punto de pago | `PP1` — Punto de pago, activo, **sin impresora** (se marcó *con impresora* para las pruebas) |
| Reglas de búsqueda | Las de fábrica: carro por placa; moto, bici y patineta por código |
| Redeban | Ambiente de **pruebas** (`sipconnectortest.azurewebsites.net`), red 0. Usuario y clave cifrados |
| SIIGO | Ambiente de **pruebas**: comprobante 27939, vendedor 916, forma de pago 9441 "Datáfono Redeban", servicio `PARQUEADERO`, cliente por defecto 222222222 "Consumidor final". Timbre DIAN **apagado**, correo **apagado**, facturación **activa**. Clave cifrada |

Las claves (token, Redeban, SIIGO, Resend, base de datos) están cifradas en Supabase y en `Punto de pago/.env.produccion.local`, que no se sube a git. (No se llama `.env.production.local` a proposito: Next.js carga ese nombre solo al correr en produccion, y cualquier `npm start` en el PC quedaria apuntando a la base de produccion.)

---

## 3. Cómo volver a producción

1. **Moyano:** el túnel tiene que responder. Desde el 14/09/2026 `https://api.parqueadero122.com` ya responde desde el servidor Linux (`health` da 403 sin token y 200 con el token guardado, que es el mismo del `.env` de Moyano). Se comprueba con `npm run nova:check`: debe decir `Enlace OK`.
2. **SuperAdmin → Parqueaderos → 122 → Sistema del parqueadero:** desmarcar **Modo de pruebas** y *Guardar modo*. Desde ese momento el kiosco vuelve a usar el túnel con el token guardado. Pulsar **Probar conexión**.
3. **Redeban:** reemplazar las credenciales de pruebas por las de producción del comercio (código único, usuario, clave y código del datáfono real).
4. **SIIGO:** credenciales de la empresa real, comprobante **electrónico** con su resolución DIAN, vendedor y forma de pago reales. Activar *Enviar la factura a la DIAN* y *Enviar la factura electrónica al correo del cliente*.
5. **Datos del parqueadero:** cargar razón social, NIT, régimen, dirección, ciudad, departamento y teléfono reales (el formulario ya no deja guardar sin ellos); encabezan el comprobante y la factura impresos.
6. **Punto de pago:** dejar *con impresora* solo si el kiosco de producción la tiene.
7. **Vercel:** poner `APP_URL` con el dominio definitivo (va en los QR impresos).
8. **Servidor del parqueadero:** que Moyano ponga `url_publica_tiquete = https://<dominio>/t` en `deploy/sitios/parqueadero_122.json` y corra `configurar_sitio`.
9. **Resend:** remitente de un dominio propio verificado.
