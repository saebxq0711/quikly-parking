---
version: 1
slug: "src-app-admin-parqueaderos-page-tsx"
primary_target: "src/app/admin/parqueaderos/page.tsx"
related_targets: ["src/app/admin/parqueaderos/[slug]/page.tsx","src/app/admin/parqueaderos/nuevo/page.tsx","src/app/admin/usuarios/page.tsx"]
---

# SuperAdmin: Parqueaderos, alta de parqueadero y Usuarios

**Modo:** Operate. Lo usa el super administrador de Quikly desde un PC, bajo techo, pocas veces por semana: dar de alta un sitio, ver qué le falta a cada uno, gestionar usuarios y contraseñas, ajustar credenciales (Redeban, SIIGO). Pocos parqueaderos (1 a 10). Se conserva toda la funcionalidad actual (campos, validaciones, acciones); se rehace la organización y la presentación.

**Decidido con el usuario (2026-10-09):** estructura "Directorio por parqueadero", elegida en la segunda tanda del sorteo de superficie.

## Direction contract

THESIS: La unidad de trabajo es el parqueadero con su gente. Cada sitio se lee de un vistazo como un bloque: si está listo para operar, qué le falta, quién lo administra y cómo están sus kioscos. Rechaza el arreglo de siempre del admin: una lista delgada al lado de un formulario gigante siempre abierto, y una ficha que es un muro de formularios con un botón amarillo por bloque.

OWN-WORLD: el de DESIGN.md sin cambios: área gris de trabajo, bloques blancos de sombra suave y esquina de 1rem, negro letrero para texto y botones de guardar (`confirm`), amarillo Parking solo en la única acción principal de cada pantalla (Nuevo parqueadero, Nuevo usuario, Crear parqueadero) y en la navegación activa. Estado de preparación con verde resultado (listo) y naranja advertencia (falta), con su ícono. Personas con iniciales en círculo gris, nunca fotos inventadas.

STORY: El SuperAdmin entra a Parqueaderos y en cada bloque ve el riel de seis puntos de preparación (Empresa, Sistema, Kioscos, Datáfono, Facturación, Equipo), los administradores y los kioscos del sitio. Toca un punto pendiente y cae en esa sección de la ficha. Para dar de alta un sitio va a una página propia, corta y por secciones, que al guardar lo deja en la ficha nueva. En Usuarios ve a las personas agrupadas por sitio, filtra por nombre o rol, y gestiona a cada una desplegando su fila.

FIRST VIEWPORT: Parqueaderos: título "Parqueaderos" con la cuenta de sitios y la frase de estado ("1 de 1 listo" o "1 por terminar"), y a la derecha el botón amarillo "Nuevo parqueadero". Debajo, el primer bloque de sitio a ancho completo: nombre a 20px bold, dirección del kiosco, insignia de estado y "Configurar" secundario en la cabecera; el riel de seis puntos como fila de píldoras con ícono; y dos columnas: Equipo (administradores) y Kioscos (datáfono, impresora, en línea). Ficha: cabecera del sitio con índice de secciones pegajoso, cada entrada con su punto verde o naranja. Usuarios: buscador y filtros de rol arriba, solicitudes de contraseña como aviso naranja si existen, y grupos por sitio.

FORM: Directorio por parqueadero, posición 4 de mi lista ordenada en la segunda tanda (re-roll 1), seed key de7433e1. Interacción firma: el riel de preparación enlaza cada punto pendiente con su sección exacta de la ficha, y el índice de la ficha muestra el mismo estado.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Adaptaciones decididas en el build

- Usuarios: el aviso de solicitudes de contraseña va ANTES del buscador y los filtros, aunque el FIRST VIEWPORT lista primero el buscador. Es lo único de la pantalla que alguien está esperando (pidió su contraseña desde el login), así que tiene prioridad de lectura; solo aparece cuando hay solicitudes.
- Ficha: las secciones listas se muestran como resumen de solo lectura con «Editar»; las pendientes llegan abiertas (respuesta al muro de formularios).
- Ficha en el celular: el índice es una franja de píldoras no pegajosa (la cabecera negra del panel ya es pegajosa).

## Pendientes

- Ninguna decisión abierta con el usuario.
