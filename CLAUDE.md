# CLAUDE.md — Plataforma Web de Gestión y Pago de Parqueaderos

## 1. CONTEXTO GENERAL DEL PROYECTO

Este proyecto consiste en construir una **plataforma web/cloud para la gestión y cobro de parqueaderos**, integrada con un proyecto existente desarrollado por otro integrante del equipo.

El proyecto existente actualmente gestiona el funcionamiento del parqueadero y mantiene información relacionada con:

* Ingreso de vehículos.
* Vehículos registrados.
* Placas.
* Clientes.
* Horarios de ingreso.
* Permanencia.
* Valores a cobrar.
* Registros relacionados con el parqueadero.

El proyecto existente actualmente utiliza un **Cloudflare Tunnel** como puente para exponer/controlar el acceso a la información necesaria desde servicios externos.

La nueva aplicación NO debe reemplazar ni modificar arbitrariamente la aplicación existente.

Debe funcionar como una **capa web de autenticación, consulta, pago, administración y visualización**, consumiendo los servicios/API/puente que ya existen cuando corresponda.

---

# 2. REGLA MÁS IMPORTANTE: ANALIZAR PRIMERO EL PROYECTO EXISTENTE

Antes de escribir código significativo, debes estudiar completamente la documentación proporcionada dentro de:

```text
/docs
```

Los documentos iniciales que debes leer obligatoriamente son:

```text
/docs/FUNCIONAMIENTO PROYECTO Y TUNEL.md
/docs/HANDOFF.md
/docs/CLAUDE.md
```

Estos documentos pertenecen al proyecto existente/desarrollado por el compañero y contienen información importante sobre:

* Arquitectura actual.
* Funcionamiento del sistema.
* Base de datos.
* Cloudflare Tunnel.
* Endpoints.
* Estructuras de datos.
* Flujo de ingreso de vehículos.
* Flujo de consulta.
* Restricciones.
* Decisiones técnicas existentes.
* Consideraciones que deben mantenerse.

### IMPORTANTE

No asumas cómo funciona el proyecto existente.

No inventes:

* Endpoints.
* Tablas.
* Campos.
* IDs.
* URLs.
* Credenciales.
* Métodos de autenticación.
* Respuestas de API.
* Estructuras de JSON.
* Reglas de negocio.

Primero revisa la documentación existente.

Si la documentación contradice una suposición, la documentación tiene prioridad.

Si algo necesario no está definido, **identifícalo explícitamente como pendiente** en lugar de inventarlo.

---

# 3. OBJETIVO DE LA NUEVA PLATAFORMA

Construir una aplicación web/cloud que permita:

1. Autenticación de usuarios.
2. Manejo de diferentes roles.
3. Administración de usuarios de parqueaderos.
4. Administración de puntos de pago.
5. Consulta de vehículos.
6. Consulta de valores a pagar.
7. Procesamiento de pagos.
8. Integración con el proveedor de pagos Redeban.
9. Integración con facturación electrónica/servicios de SIIGO.
10. Consulta y visualización de pagos realizados.
11. Consulta de información asociada al vehículo y cliente.
12. Separación estricta de permisos según el rol.
13. Comunicación segura con el backend/puente existente.
14. Funcionamiento completamente web/cloud.

---

# 4. LA APLICACIÓN NO ES LOCAL

La aplicación debe diseñarse como una **aplicación web desplegable en la nube**.

No diseñar el sistema suponiendo que solamente funcionará:

```text
localhost
```

La arquitectura debe permitir:

```text
Usuario
   ↓
Aplicación Web
   ↓
Backend/API
   ↓
Servicios de autenticación
   ↓
Servicios de parqueadero
   ↓
Cloudflare Tunnel / API existente
   ↓
Aplicación/Base de datos existente
```

Cuando sea necesario, las integraciones externas deberán ejecutarse desde el backend y nunca exponer credenciales sensibles al navegador.

---

# 5. ROLES DEL SISTEMA

Inicialmente existirán tres roles principales:

## 5.1 SUPERADMIN

Es el administrador global de la plataforma.

Responsabilidades:

* Crear usuarios administradores de parqueaderos.
* Crear/asignar usuarios de punto de pago.
* Asociar usuarios con un parqueadero.
* Configurar credenciales de servicios externos.
* Administrar configuraciones de Redeban.
* Administrar configuraciones de SIIGO.
* Consultar información global cuando corresponda.
* Gestionar permisos.
* Gestionar usuarios.
* Gestionar parqueaderos.
* Supervisar operaciones.

El SuperAdmin debe tener acceso a las configuraciones administrativas necesarias, pero **las credenciales sensibles nunca deben mostrarse innecesariamente ni almacenarse en texto plano**.

---

# 5.2 ADMINISTRADOR DE PARQUEADERO

Este usuario representa al administrador/responsable de un parqueadero.

Debe poder consultar información relacionada únicamente con el parqueadero o parqueaderos que tenga asignados.

Debe poder consultar, dependiendo de las reglas finales:

* Pagos realizados.
* Vehículo asociado al pago.
* Placa cuando aplique.
* Persona/cliente asociado.
* Fecha.
* Hora.
* Valor pagado.
* Medio de pago.
* Estado de la transacción.
* Estado de facturación.
* Información relevante del ingreso/salida.

Debe existir aislamiento de datos entre parqueaderos.

Un administrador del Parqueadero A NO debe poder consultar información perteneciente al Parqueadero B.

---

# 5.3 PUNTO DE PAGO

El usuario de punto de pago tendrá una interfaz mucho más sencilla.

Su función principal será:

1. Identificar el tipo de vehículo.
2. Buscar el vehículo/registro.
3. Obtener el valor a cobrar.
4. Mostrar la información necesaria.
5. Permitir iniciar/procesar el pago.
6. Generar/gestionar la facturación cuando corresponda.
7. Mostrar el resultado de la operación.

La interfaz debe estar optimizada para rapidez y facilidad de uso.

---

# 6. FLUJO PRINCIPAL DEL PUNTO DE PAGO

Al ingresar un usuario con rol `PUNTO_PAGO`, la pantalla inicial debe ser extremadamente sencilla.

Ejemplo conceptual:

```text
-----------------------------------------
              BIENVENIDO
       Selecciona tu vehículo
-----------------------------------------

┌─────────────────┐  ┌─────────────────┐
│                 │  │                 │
│      🚗         │  │      🏍️        │
│                 │  │                 │
│     CARRO       │  │      MOTO       │
│                 │  │                 │
└─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│                 │  │                 │
│      🛴         │  │      🚲         │
│                 │  │                 │
│    PATINETA     │  │    BICICLETA    │
│                 │  │                 │
└─────────────────┘  └─────────────────┘
```

Las cuatro opciones serán:

* Carro.
* Moto.
* Patineta.
* Bicicleta.

Usar iconos claros y consistentes.

El diseño debe ser responsive y funcionar correctamente en:

* Computadores.
* Tablets.
* Pantallas táctiles.
* Dispositivos utilizados como kioscos/puntos de pago.

---

# 7. FLUJO PARA CARRO

Cuando el usuario seleccione:

```text
CARRO
```

la aplicación deberá solicitar la:

```text
PLACA
```

Ejemplo:

```text
┌─────────────────────────────┐
│       CONSULTAR CARRO       │
│                             │
│ Placa                       │
│ ┌─────────────────────────┐ │
│ │ ABC123                  │ │
│ └─────────────────────────┘ │
│                             │
│       [ CONSULTAR ]         │
└─────────────────────────────┘
```

La consulta deberá realizarse mediante el backend de la nueva plataforma hacia el mecanismo existente.

Conceptualmente:

```text
Punto de Pago
      ↓
Frontend
      ↓
Backend de la nueva plataforma
      ↓
Cloudflare Tunnel / API existente
      ↓
Proyecto existente
      ↓
Base de datos
```

La aplicación existente devolverá la información necesaria para determinar el valor a cobrar.

No asumir cómo se calcula la tarifa.

La nueva aplicación debe consumir el valor determinado por el sistema existente si esa es la lógica definida por el proyecto anterior.

---

# 8. MOTO, BICICLETA Y PATINETA

Para:

* Moto.
* Bicicleta.
* Patineta.

Actualmente todavía NO está definido de forma definitiva cuál será el identificador utilizado para realizar la consulta.

Podría tratarse de:

* ID de registro.
* Código generado.
* Número de ticket.
* Identificador del ingreso.
* Código QR.
* Otro identificador definido por el proyecto existente.

### NO INVENTAR ESTA LÓGICA.

Primero revisar:

```text
/docs/FUNCIONAMIENTO PROYECTO Y TUNEL.md
/docs/HANDOFF.md
/docs/CLAUDE.md
```

Determinar si la documentación existente ya define este identificador.

Si no está definido:

1. Mantener la arquitectura preparada para recibir un identificador.
2. Crear una abstracción de búsqueda.
3. Documentar la decisión como `PENDIENTE`.
4. No modificar arbitrariamente la base de datos existente.
5. No crear un ID ficticio solamente para hacer funcionar el frontend.

La lógica deberá quedar preparada conceptualmente:

```text
Tipo de vehículo
       ↓
Identificador
       ↓
Backend
       ↓
Cloudflare Tunnel / API
       ↓
Sistema existente
       ↓
Registro del vehículo
       ↓
Valor a cobrar
```

---

# 9. ARQUITECTURA DE INTEGRACIÓN

La nueva plataforma debe actuar como intermediario seguro.

Preferir:

```text
Browser
   ↓ HTTPS
Web Application
   ↓
Backend/API
   ↓
Existing Parking System
   ↓
Cloudflare Tunnel
   ↓
Existing Application / Database
```

Evitar:

```text
Browser
   ↓
Cloudflare Tunnel directamente
   ↓
Base de datos
```

si esto implica exponer infraestructura o credenciales al cliente.

El navegador nunca debe conocer:

* Credenciales de base de datos.
* Tokens privados.
* Secretos de Cloudflare.
* Credenciales de Redeban.
* Credenciales de SIIGO.
* Claves privadas.
* Variables secretas.

---

# 10. AUTENTICACIÓN

Implementar autenticación segura.

Debe existir:

* Login.
* Logout.
* Sesión segura.
* Protección de rutas.
* Control de acceso basado en roles.
* Expiración de sesión.
* Manejo seguro de contraseñas.
* Recuperación de contraseña si resulta necesaria.
* Protección contra acceso no autorizado.

No almacenar contraseñas en texto plano.

Las contraseñas deben almacenarse utilizando un algoritmo moderno de hashing apropiado.

El frontend nunca debe decidir por sí mismo si un usuario tiene permisos.

El backend debe validar los permisos.

---

# 11. AUTORIZACIÓN RBAC

Implementar autorización basada en roles.

Ejemplo conceptual:

```text
SUPERADMIN
   ├── Usuarios
   ├── Parqueaderos
   ├── Configuración
   ├── Credenciales
   └── Reportes globales

ADMIN_PARQUEADERO
   ├── Dashboard
   ├── Pagos
   ├── Vehículos
   └── Reportes de su parqueadero

PUNTO_PAGO
   └── Flujo de cobro
```

No confiar en:

```text
localStorage.role
```

para autorizar operaciones sensibles.

Toda operación protegida debe validarse en backend.

---

# 12. USUARIOS Y PARQUEADEROS

El sistema debe contemplar entidades similares a:

```text
User
ParkingLot
Role
ParkingUser
PaymentPoint
```

La estructura exacta deberá definirse después de analizar el proyecto existente.

No crear modelos duplicados si el proyecto existente ya contiene una entidad equivalente que pueda reutilizarse mediante una integración adecuada.

---

# 13. CREDENCIALES DE REDEBAN

El SuperAdmin deberá poder configurar las credenciales necesarias para la integración con:

```text
Redeban
```

El usuario indicó que posteriormente proporcionará:

* Documentación.
* Credenciales de prueba.
* Información de integración.

Cuando estos archivos sean incorporados al proyecto, deben estudiarse antes de implementar la integración.

### REGLAS DE SEGURIDAD

Nunca:

* Hardcodear credenciales.
* Commitear secretos.
* Mostrar secretos en logs.
* Enviar secretos al frontend.
* Guardar secretos en archivos públicos.

Utilizar variables de entorno o un sistema seguro de gestión de secretos.

Ejemplo conceptual:

```env
REDEBAN_API_URL=
REDEBAN_CLIENT_ID=
REDEBAN_CLIENT_SECRET=
REDEBAN_API_KEY=
```

Los nombres anteriores son solamente ilustrativos.

Utilizar los nombres y mecanismos definidos por la documentación real de Redeban.

---

# 14. CREDENCIALES Y CONFIGURACIÓN DE SIIGO

El SuperAdmin también deberá poder configurar la integración con:

```text
SIIGO
```

La integración tendrá como objetivo soportar los procesos de facturación correspondientes al pago.

Primero analizar la documentación que será proporcionada.

No asumir:

* Método de autenticación.
* Endpoints.
* Estructura de factura.
* Impuestos.
* Numeración.
* Campos obligatorios.
* Ambiente de pruebas/producción.

Toda esa información debe provenir de la documentación oficial proporcionada para el proyecto.

---

# 15. FLUJO GENERAL DE PAGO

El flujo esperado es aproximadamente:

```text
Seleccionar vehículo
        ↓
Identificar vehículo
        ↓
Consultar sistema existente
        ↓
Obtener información del registro
        ↓
Obtener valor a cobrar
        ↓
Mostrar resumen
        ↓
Confirmar pago
        ↓
Procesar pago mediante Redeban
        ↓
Confirmar resultado
        ↓
Registrar transacción
        ↓
Generar/procesar facturación SIIGO
        ↓
Mostrar resultado final
```

Este flujo debe diseñarse de manera transaccional.

Nunca asumir que:

```text
Solicitud HTTP exitosa = pago exitoso
```

Debe existir un estado de pago.

Ejemplo conceptual:

```text
PENDING
AUTHORIZED
APPROVED
DECLINED
FAILED
CANCELLED
REFUNDED
```

Los estados finales deben adaptarse a los estados reales proporcionados por Redeban.

---

# 16. REGISTRO DE PAGOS

Cada pago debe poder relacionarse, cuando la información esté disponible, con:

* Parqueadero.
* Punto de pago.
* Usuario que realizó la operación.
* Tipo de vehículo.
* Identificador del vehículo.
* Placa, si existe.
* Cliente/persona.
* Registro de ingreso.
* Valor.
* Fecha.
* Hora.
* Medio de pago.
* Identificador de transacción.
* Estado.
* Factura.
* Estado de facturación.

Ejemplo conceptual:

```text
Payment
├── id
├── parkingLotId
├── paymentPointId
├── userId
├── vehicleType
├── vehicleIdentifier
├── plate
├── customerId
├── amount
├── paymentMethod
├── providerTransactionId
├── status
├── invoiceId
├── invoiceStatus
├── createdAt
└── updatedAt
```

Esto es conceptual.

La estructura definitiva debe diseñarse después de analizar los sistemas existentes y las APIs reales.

---

# 17. DASHBOARD DEL ADMINISTRADOR

El administrador de parqueadero debe tener un dashboard para consultar pagos.

Debe ser posible visualizar información como:

| Fecha      | Hora  | Vehículo | Placa/ID | Persona |   Valor | Estado   |
| ---------- | ----- | -------- | -------- | ------- | ------: | -------- |
| 28/08/2026 | 10:32 | Carro    | ABC123   | Cliente | $10.000 | Aprobado |
| 28/08/2026 | 11:10 | Moto     | ID-001   | Cliente |  $5.000 | Aprobado |

Agregar, cuando sea útil:

* Búsqueda.
* Filtros.
* Rango de fechas.
* Tipo de vehículo.
* Estado de pago.
* Punto de pago.
* Exportación de información si posteriormente se requiere.

---

# 18. MULTI-TENANCY / AISLAMIENTO DE PARQUEADEROS

El sistema debe considerar que existirán múltiples parqueaderos.

Ejemplo:

```text
SuperAdmin
     │
     ├── Parqueadero A
     │     ├── Admin A
     │     └── Punto Pago A
     │
     ├── Parqueadero B
     │     ├── Admin B
     │     └── Punto Pago B
     │
     └── Parqueadero C
           ├── Admin C
           └── Punto Pago C
```

Los usuarios deben estar vinculados al parqueadero correspondiente.

Toda consulta deberá verificar el alcance del usuario.

Un usuario de:

```text
Parqueadero A
```

no debe poder obtener información de:

```text
Parqueadero B
```

modificando parámetros de una petición.

Esto debe protegerse en backend.

---

# 19. BASE DE DATOS DE LA NUEVA PLATAFORMA

La nueva plataforma puede necesitar su propia base de datos para almacenar:

* Usuarios.
* Roles.
* Parqueaderos.
* Puntos de pago.
* Configuración.
* Credenciales cifradas/referencias a secretos.
* Pagos.
* Transacciones.
* Auditoría.
* Facturas.
* Integraciones.

No asumir que todo debe guardarse en la base de datos existente del proyecto de parqueadero.

La base de datos existente debe considerarse inicialmente como una fuente/sistema externo.

La separación debe evitar acoplamiento innecesario.

---

# 20. CLOUDFARE TUNNEL

El Cloudflare Tunnel es una parte crítica de la integración con el sistema existente.

Antes de implementar cualquier integración:

1. Leer la documentación del túnel.
2. Entender qué servicio expone.
3. Determinar qué endpoints están disponibles.
4. Entender autenticación.
5. Entender qué datos recibe.
6. Entender qué datos devuelve.
7. Identificar limitaciones.
8. Determinar si la nueva aplicación puede consumirlo directamente o debe existir un backend intermedio.

No modificar la configuración del túnel existente sin comprender primero su propósito y funcionamiento.

---

# 21. CONTRATOS DE API

Antes de desarrollar las pantallas finales, documentar los contratos de las APIs.

Ejemplo conceptual:

```http
POST /api/vehicles/search
```

Request:

```json
{
  "vehicleType": "CAR",
  "identifier": "ABC123"
}
```

Response conceptual:

```json
{
  "found": true,
  "vehicle": {},
  "amount": 10000
}
```

Este ejemplo NO representa necesariamente el contrato real.

El contrato definitivo debe derivarse de la documentación y del sistema existente.

---

# 22. MANEJO DE ERRORES

La aplicación debe manejar correctamente:

* Vehículo no encontrado.
* Registro inexistente.
* Parqueadero no disponible.
* Cloudflare Tunnel no disponible.
* Timeout.
* Error de API.
* Error de autenticación.
* Pago rechazado.
* Pago pendiente.
* Error de Redeban.
* Error de SIIGO.
* Facturación fallida.
* Datos incompletos.

No mostrar errores técnicos sensibles al usuario final.

En lugar de:

```text
ECONNREFUSED 10.0.0.23:5432
```

mostrar:

```text
No fue posible consultar la información en este momento.
Intenta nuevamente.
```

Registrar el detalle técnico en logs seguros.

---

# 23. IDEMPOTENCIA DE PAGOS

Los pagos son operaciones críticas.

Implementar mecanismos de idempotencia para evitar:

```text
doble cobro
```

por:

* Doble clic.
* Refresh.
* Reintento de red.
* Timeout.
* Reenvío de solicitud.
* Reconexión.

Toda transacción de pago debe tener un identificador único y un mecanismo para detectar solicitudes repetidas.

---

# 24. AUDITORÍA

Registrar eventos importantes como:

* Login.
* Logout.
* Creación de usuario.
* Cambio de rol.
* Cambio de configuración.
* Configuración de credenciales.
* Consulta de vehículo.
* Inicio de pago.
* Resultado del pago.
* Generación de factura.
* Errores críticos.

Los logs no deben contener secretos.

---

# 25. SEGURIDAD

Aplicar como mínimo:

* HTTPS.
* Hash seguro de contraseñas.
* Gestión segura de sesiones.
* RBAC.
* Validación de entrada.
* Sanitización.
* Protección contra SQL Injection.
* Protección contra XSS.
* Protección CSRF cuando aplique.
* Rate limiting en endpoints sensibles.
* Validación server-side.
* CORS correctamente configurado.
* Headers de seguridad.
* Secret management.
* Logs seguros.
* Principio de mínimo privilegio.

Nunca confiar únicamente en validaciones del frontend.

---

# 26. TECNOLOGÍAS

No existe un stack obligatorio.

Puedes seleccionar las tecnologías apropiadas considerando:

* Escalabilidad.
* Seguridad.
* Facilidad de mantenimiento.
* Integración con APIs.
* Despliegue cloud.
* Experiencia del equipo.
* Calidad del ecosistema.
* Facilidad para implementar autenticación y RBAC.

Antes de elegir tecnologías, inspecciona los documentos existentes.

Si el proyecto existente utiliza tecnologías que faciliten significativamente la integración, considera reutilizar conceptos, contratos o patrones compatibles.

No cambies tecnologías existentes sin una razón técnica.

---

# 27. FRONTEND

El frontend debe ser:

* Moderno.
* Responsive.
* Rápido.
* Accesible.
* Fácil de utilizar.
* Adecuado para pantallas táctiles en puntos de pago.

El punto de pago debe priorizar:

```text
CLARIDAD
VELOCIDAD
POCOS CLICS
BOTONES GRANDES
MENSAJES CLAROS
```

No sobrecargar el punto de pago con información administrativa.

---

# 28. DISEÑO DE INTERFAZ

Mantener una interfaz profesional y consistente.

Debe existir una identidad visual común para:

* Login.
* Dashboard.
* Punto de pago.
* Administración.
* Tablas.
* Formularios.
* Estados.
* Errores.

Los tipos de vehículo deben tener iconografía claramente diferenciada.

---

# 29. ESTRUCTURA RECOMENDADA

La estructura final puede variar dependiendo del stack seleccionado.

Conceptualmente:

```text
/
├── docs/
│   ├── FUNCIONAMIENTO PROYECTO Y TUNEL.md
│   ├── HANDOFF.md
│   └── CLAUDE.md
│
├── src/
│   ├── auth/
│   ├── users/
│   ├── parking/
│   ├── vehicles/
│   ├── payments/
│   ├── billing/
│   ├── integrations/
│   │   ├── cloudflare/
│   │   ├── redeban/
│   │   └── siigo/
│   ├── dashboard/
│   └── shared/
│
├── tests/
│
├── .env.example
├── CLAUDE.md
└── README.md
```

La estructura real debe adaptarse al framework elegido.

---

# 30. VARIABLES DE ENTORNO

Los secretos nunca deben quedar dentro del repositorio.

Crear:

```text
.env.example
```

con placeholders.

Ejemplo conceptual:

```env
DATABASE_URL=

AUTH_SECRET=

CLOUDFLARE_API_URL=
CLOUDFLARE_API_TOKEN=

REDEBAN_API_URL=
REDEBAN_CLIENT_ID=
REDEBAN_CLIENT_SECRET=

SIIGO_API_URL=
SIIGO_CLIENT_ID=
SIIGO_CLIENT_SECRET=
```

Los nombres definitivos dependerán de las documentaciones reales.

---

# 31. DOCUMENTACIÓN COMO FUENTE DE VERDAD

Prioridad de información:

### Nivel 1

Documentación y comportamiento real del proyecto existente.

### Nivel 2

Documentación oficial de las APIs externas.

### Nivel 3

Decisiones arquitectónicas documentadas en este proyecto.

### Nivel 4

Suposiciones razonables.

Las suposiciones siempre deben estar marcadas.

Nunca presentar una suposición como hecho.

---

# 32. PENDIENTES IMPORTANTES

Antes de considerar terminada la integración deben resolverse:

* [ ] Identificador para moto.
* [ ] Identificador para bicicleta.
* [ ] Identificador para patineta.
* [ ] Contrato exacto del Cloudflare Tunnel.
* [ ] Endpoints disponibles.
* [ ] Método de autenticación del servicio existente.
* [ ] Estructura exacta de respuestas.
* [ ] Documentación oficial de Redeban.
* [ ] Credenciales de prueba de Redeban.
* [ ] Flujo exacto de pago Redeban.
* [ ] Documentación de SIIGO.
* [ ] Credenciales de prueba de SIIGO.
* [ ] Flujo exacto de facturación.
* [ ] Reglas tributarias/fiscales.
* [ ] Reglas de tarifas.
* [ ] Estados de pago.
* [ ] Reglas de devolución/anulación.
* [ ] Reglas para pagos fallidos.
* [ ] Reglas de asociación entre parqueadero y usuario.

No bloquear el desarrollo de módulos independientes por estos pendientes, pero no inventar las respuestas.

---

# 33. PLAN DE DESARROLLO

Trabajar incrementalmente.

## FASE 1 — Descubrimiento

Primero:

1. Leer `/docs/FUNCIONAMIENTO PROYECTO Y TUNEL.md`.
2. Leer `/docs/HANDOFF.md`.
3. Leer `/docs/CLAUDE.md`.
4. Inspeccionar el código existente si está disponible.
5. Identificar arquitectura.
6. Identificar APIs.
7. Identificar entidades.
8. Identificar flujo de vehículos.
9. Identificar funcionamiento del Cloudflare Tunnel.
10. Crear un documento de hallazgos.

NO comenzar creando toda la aplicación inmediatamente.

---

## FASE 2 — Arquitectura

Definir:

* Stack.
* Arquitectura frontend/backend.
* Base de datos.
* Autenticación.
* RBAC.
* Integración con sistema existente.
* Integración Redeban.
* Integración SIIGO.
* Manejo de secretos.
* Despliegue cloud.

Documentar las decisiones.

---

## FASE 3 — Autenticación y usuarios

Implementar:

* Login.
* Logout.
* Sesiones.
* Roles.
* SuperAdmin.
* Administradores.
* Puntos de pago.
* Asociación con parqueaderos.
* Protección de rutas.

---

## FASE 4 — Integración con parqueadero

Implementar primero la consulta del sistema existente.

Primero conseguir que funcione:

```text
Placa
 ↓
Backend
 ↓
Cloudflare
 ↓
Sistema existente
 ↓
Registro
 ↓
Valor
```

Sin involucrar todavía Redeban o SIIGO.

---

## FASE 5 — Punto de pago

Construir:

```text
Bienvenido
 ↓
Seleccionar vehículo
 ↓
Identificar vehículo
 ↓
Consultar
 ↓
Mostrar valor
 ↓
Confirmar
```

---

## FASE 6 — Redeban

Una vez confirmada la documentación:

```text
Punto de pago
 ↓
Backend
 ↓
Redeban
 ↓
Resultado
```

Implementar idempotencia y estados transaccionales.

---

## FASE 7 — SIIGO

Implementar:

```text
Pago aprobado
 ↓
Facturación
 ↓
SIIGO
 ↓
Resultado
```

La facturación no debe depender de una suposición sobre la API.

---

## FASE 8 — Dashboard

Implementar:

* Historial.
* Filtros.
* Búsqueda.
* Detalle de pago.
* Estado.
* Información del vehículo.
* Información del cliente.
* Facturación.

---

## FASE 9 — Seguridad y pruebas

Realizar pruebas:

* Unitarias.
* Integración.
* Autenticación.
* Autorización.
* API.
* Pagos.
* Idempotencia.
* Errores.
* Seguridad.
* Responsive.
* Flujo completo.

---

## FASE 10 — Deploy

La aplicación debe poder desplegarse en infraestructura cloud.

Antes de producción comprobar:

* Variables de entorno.
* HTTPS.
* Dominios.
* CORS.
* Secretos.
* Logs.
* Base de datos.
* Backups.
* Monitoreo.
* Health checks.
* Integraciones externas.

---

# 34. REGLA PARA CAMBIOS

Antes de modificar código existente:

1. Entenderlo.
2. Identificar dependencias.
3. Determinar impacto.
4. Evitar romper funcionalidades existentes.
5. Hacer cambios pequeños.
6. Ejecutar pruebas.
7. Documentar cambios importantes.

No realizar refactors masivos sin necesidad.

---

# 35. REGLA PARA INTEGRACIONES EXTERNAS

Para cada integración externa crear una capa/adaptador.

Conceptualmente:

```text
Application
     ↓
PaymentService
     ↓
RedebanAdapter
     ↓
Redeban
```

Y:

```text
Application
     ↓
BillingService
     ↓
SiigoAdapter
     ↓
SIIGO
```

Esto permite reemplazar proveedores o modificar APIs sin contaminar toda la aplicación.

---

# 36. NO ACOPLAR EL FRONTEND A LOS PROVEEDORES

El frontend no debe conocer detalles internos de:

* Redeban.
* SIIGO.
* Cloudflare.
* Base de datos existente.

El frontend debe trabajar con modelos propios de la aplicación.

Por ejemplo:

```text
Frontend
    ↓
Payment API
    ↓
Payment Service
    ↓
Redeban
```

No:

```text
Frontend
    ↓
Redeban directamente
```

---

# 37. PRINCIPIO DE NO INVENTAR

Cuando falte información, utilizar:

```text
PENDIENTE DE DEFINICIÓN
```

en lugar de inventar una implementación.

Especialmente para:

* IDs.
* Tarifas.
* API.
* Credenciales.
* Estados.
* Facturación.
* Reglas de negocio.
* Estructuras de base de datos.

Si necesitas continuar el desarrollo, crea una abstracción que permita completar la información posteriormente.

---

# 38. CRITERIOS DE ACEPTACIÓN

La aplicación podrá considerarse funcional cuando:

### Autenticación

* [ ] Usuario puede iniciar sesión.
* [ ] Usuario puede cerrar sesión.
* [ ] Roles funcionan.
* [ ] Rutas están protegidas.

### SuperAdmin

* [ ] Puede crear usuarios.
* [ ] Puede asociarlos a parqueaderos.
* [ ] Puede administrar puntos de pago.
* [ ] Puede configurar integraciones.

### Punto de pago

* [ ] Puede seleccionar carro.
* [ ] Puede seleccionar moto.
* [ ] Puede seleccionar patineta.
* [ ] Puede seleccionar bicicleta.
* [ ] Puede identificar el vehículo.
* [ ] Puede consultar el registro.
* [ ] Puede obtener el valor.
* [ ] Puede iniciar el pago.
* [ ] Puede visualizar el resultado.

### Pagos

* [ ] Pago tiene estado.
* [ ] Pago no puede duplicarse accidentalmente.
* [ ] Se almacena identificador de transacción.
* [ ] Se registra correctamente.

### Administrador

* [ ] Puede consultar pagos.
* [ ] Puede ver vehículo.
* [ ] Puede ver persona/cliente.
* [ ] Puede ver fecha/hora.
* [ ] Puede ver valor.
* [ ] Solo puede ver información autorizada.

### Facturación

* [ ] Pago aprobado puede iniciar facturación.
* [ ] Se registra resultado de facturación.
* [ ] Errores de facturación se manejan correctamente.

---

# 39. INSTRUCCIÓN FINAL PARA CLAUDE

Tu primera tarea NO es escribir toda la aplicación.

Tu primera tarea es **comprender el ecosistema existente**.

Comienza leyendo:

```text
/docs/FUNCIONAMIENTO PROYECTO Y TUNEL.md
/docs/HANDOFF.md
/docs/CLAUDE.md
```

Después inspecciona el código disponible y genera un análisis técnico que incluya:

1. Arquitectura actual.
2. Tecnologías existentes.
3. Cómo funciona el Cloudflare Tunnel.
4. Cómo se consulta la información de vehículos.
5. Cómo se determina actualmente el valor a cobrar.
6. Qué identificadores existen para cada tipo de vehículo.
7. Qué APIs/endpoints existen.
8. Qué datos devuelve cada endpoint.
9. Qué partes pueden reutilizarse.
10. Qué partes deben construirse en la nueva aplicación.
11. Qué información falta.
12. Qué riesgos técnicos existen.
13. Qué arquitectura propones para la nueva plataforma.
14. Qué stack propones y por qué.

**No implementes funcionalidades críticas hasta comprender estos puntos.**

Después de presentar el análisis, continúa con la implementación de manera incremental.

Cuando exista información ambigua, pregunta o marca explícitamente el punto como pendiente.

La prioridad es:

```text
SEGURIDAD
   ↓
CORRECCIÓN
   ↓
COMPATIBILIDAD CON EL SISTEMA EXISTENTE
   ↓
MANTENIBILIDAD
   ↓
EXPERIENCIA DE USUARIO
   ↓
VELOCIDAD DE DESARROLLO
```

No sacrificar seguridad ni integridad de pagos por velocidad de implementación.
