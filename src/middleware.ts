import { NextResponse, type NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { SESSION_COOKIE_NAME, verifyToken } from '@/lib/auth/jwt';
import { isIpBlocked, strike } from '@/lib/security/blocklist';
import { clientIp, isAllowlisted } from '@/lib/security/ip';
import { MemoryWindow } from '@/lib/security/memory-window';
import {
  MAX_BODY_BYTES,
  METODOS_PERMITIDOS,
  detectMalicious,
  isSameOrigin,
} from '@/lib/security/policy';

/**
 * Primera linea de defensa, en cada peticion.
 *
 * DEFENSAS, antes de mirar la sesion (ver SEGURIDAD.md):
 *
 *  a. Metodos: solo GET, HEAD, POST y OPTIONS. El resto, 405.
 *  b. Trampas: rutas que solo pide un escaner (`/.env`, `/wp-login.php`) y
 *     herramientas de ataque en el User-Agent: 404 y faltas a la IP.
 *  c. IP bloqueada: 403. No aplica a quien trae una sesion firmada valida, para
 *     que un bloqueo por algo raro en la red del parqueadero (todos salen por
 *     la misma IP) no deje el kiosco sin funcionar; esos siguen sujetos a los
 *     limites por usuario.
 *  d. Rafagas: tope por IP en la memoria de la instancia, instantaneo. Los
 *     limites que tienen que valer entre instancias estan en cada ruta.
 *  e. Escrituras: cuerpo de 256 KB como maximo y mismo origen obligatorio
 *     (CSRF). Un POST sin origen no lo hizo nuestro navegador.
 *
 * Despues hace tres cosas:
 *
 *  1. Redirige al login a quien no tenga una cookie de sesion con firma valida.
 *  2. Impide que un usuario entre a un area que no es de su rol. Antes se
 *     confiaba solo en las guardas de cada pagina, y bastaba con escribir la
 *     direccion a mano para llegar a una pantalla de otro rol antes de que la
 *     comprobacion del servidor la rechazara.
 *  3. Marca toda pagina autenticada como no cacheable. Sin esto, tras cerrar
 *     sesion el boton "atras" del navegador mostraba la pantalla anterior
 *     sacada de su cache, aunque la sesion ya estuviera revocada.
 *
 * Corre en Node (no en Edge) para poder leer la lista de IPs bloqueadas, que
 * se cachea 15 s: no cuesta una consulta por peticion. La sesion se verifica
 * solo por la firma del JWT. La autorizacion definitiva
 * (sesion revocada, usuario desactivado, parqueadero real) se resuelve en el
 * servidor con `requireRole` / `scopeToParkingLot` leyendo la base de datos —
 * CLAUDE.md secciones 10 y 11: el frontend nunca decide permisos por si mismo.
 */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/recuperar-clave',
  '/api/auth/recuperar',
  // El enlace del correo lo abre alguien que, por definicion, no puede entrar.
  '/restablecer',
  '/api/auth/restablecer',
  // El QR del comprobante lo abre el cliente desde su celular, sin sesion. Lo
  // protege el token aleatorio del enlace, no el inicio de sesion.
  '/factura',
  // El tiquete en el celular: lo abre quien escanea el QR de la pantalla de entrada.
  // No consulta nada, solo dibuja el codigo que trae la direccion.
  '/t',
  // Protegida por su propio secreto (CRON_SECRET), no por sesion.
  '/api/cron',
  // Le dice a los buscadores que no recorran nada.
  '/robots.txt',
];

/** Areas y quien puede entrar a cada una. */
const AREAS: { test: (path: string) => boolean; roles: Role[] }[] = [
  { test: (p) => p.startsWith('/admin'), roles: ['SUPERADMIN'] },
  { test: (p) => p.startsWith('/api/admin'), roles: ['SUPERADMIN'] },
  { test: (p) => /^\/p\/[^/]+\/pos/.test(p), roles: ['PUNTO_PAGO'] },
  { test: (p) => p.startsWith('/api/pos'), roles: ['PUNTO_PAGO'] },
  /*
    Todo lo demas bajo /p/<sitio> es el panel del administrador: resumen,
    adentro, historial, cajas, reportes, pagos y auditoria.

    La regla es por AREA y no por lista de paginas, y eso es deliberado. Antes
    enumeraba `(pagos|auditoria)`, asi que cada pagina nueva del panel nacia sin
    control de rol —cualquier sesion valida entraba— hasta que alguien se
    acordara de volver aqui. Una regla que cubre el area entera falla del lado
    seguro: lo nuevo queda protegido por omision.

    Va despues de la regla del punto de pago a proposito: `AREAS.find` se queda
    con la primera que casa, y /p/<sitio>/pos ya quedo resuelta arriba.
  */
  {
    test: (p) => /^\/p\/[^/]+/.test(p),
    roles: ['ADMIN_PARQUEADERO', 'SUPERADMIN'],
  },
];

/** A donde pertenece cada rol cuando se equivoca de area. */
function homeFor(role: Role, parkingLotSlug: string | null): string {
  if (role === 'SUPERADMIN') return '/admin/parqueaderos';
  if (!parkingLotSlug) return '/login';
  return role === 'PUNTO_PAGO'
    ? `/p/${parkingLotSlug}/pos`
    : `/p/${parkingLotSlug}/pagos`;
}

/** Rafagas por IP: 300 peticiones por minuto, paginas y API juntas. */
const RAFAGA_LIMITE = 300;
const rafagas = new MemoryWindow();
/** Una falta por rafaga cada 10 s como mucho: la inundacion no se vuelve escrituras. */
const avisosRafaga = new MemoryWindow();

function rechazo(pathname: string, status: number, message: string): NextResponse {
  const respuesta = pathname.startsWith('/api/')
    ? NextResponse.json({ error: { code: 'BLOCKED', message } }, { status })
    : new NextResponse(paginaDeRechazo(message), {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
  if (status === 429) respuesta.headers.set('Retry-After', '60');
  return noStore(respuesta);
}

function paginaDeRechazo(message: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Acceso no disponible</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff;color:#0b0b0b"><main style="max-width:24rem;padding:1.5rem;text-align:center"><h1 style="font-size:1.25rem">Acceso no disponible</h1><p style="color:#555;line-height:1.5">${message}</p></main></body></html>`;
}

/** Ninguna pantalla autenticada debe quedar en la cache del navegador. */
function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const ip = clientIp(request.headers);
  const metodo = request.method.toUpperCase();

  /* a. Metodos */
  if (!METODOS_PERMITIDOS.has(metodo)) {
    return rechazo(pathname, 405, 'Metodo no permitido.');
  }

  /* b. Trampas de escaneo y herramientas de ataque */
  const hallazgo = detectMalicious(pathname, search, request.headers.get('user-agent'));
  if (hallazgo) {
    await strike(ip, hallazgo.kind, { path: pathname, detail: hallazgo.detail });
    return noStore(new NextResponse(null, { status: 404 }));
  }

  /* c. IP bloqueada (salvo sesion firmada valida) */
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyToken(token) : null;
  const confiable = isAllowlisted(ip);

  if (!claims && !confiable && (await isIpBlocked(ip))) {
    return rechazo(
      pathname,
      403,
      'Detectamos actividad sospechosa desde tu conexion y la bloqueamos temporalmente. Si crees que es un error, contacta al administrador.',
    );
  }

  /* d. Rafagas por IP */
  if (ip && !confiable) {
    const { count } = rafagas.hit(`ip:${ip}`, 60_000);
    if (count > RAFAGA_LIMITE) {
      if (avisosRafaga.hit(ip, 10_000).count === 1) {
        await strike(ip, 'RATE_LIMIT', { path: pathname, detail: 'rafaga' });
      }
      return rechazo(pathname, 429, 'Demasiadas peticiones seguidas. Espera un momento.');
    }
  }

  /* e. Escrituras: tamaño y mismo origen */
  if (metodo === 'POST') {
    const largo = Number(request.headers.get('content-length') ?? 0);
    if (largo > MAX_BODY_BYTES) {
      return rechazo(pathname, 413, 'La peticion es demasiado grande.');
    }
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (!isSameOrigin(request.headers, host)) {
      await strike(ip, 'BAD_ORIGIN', {
        path: pathname,
        detail: request.headers.get('origin') ?? 'sin origen',
      });
      return rechazo(pathname, 403, 'Peticion no permitida.');
    }
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!claims) {
    if (pathname.startsWith('/api/')) {
      return noStore(
        NextResponse.json(
          {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Debes iniciar sesion para continuar.',
            },
          },
          { status: 401 },
        ),
      );
    }

    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return noStore(NextResponse.redirect(loginUrl));
  }

  const area = AREAS.find((a) => a.test(pathname));
  if (area && !area.roles.includes(claims.role)) {
    if (pathname.startsWith('/api/')) {
      return noStore(
        NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'No tienes permisos para realizar esta accion.',
            },
          },
          { status: 403 },
        ),
      );
    }
    // Se le devuelve a su propia area en vez de mostrarle un error: llegar aqui
    // suele ser un enlace viejo o un marcador, no un intento de colarse.
    return noStore(
      NextResponse.redirect(
        new URL(homeFor(claims.role, claims.parkingLotSlug), request.url),
      ),
    );
  }

  return noStore(NextResponse.next());
}

export const config = {
  runtime: 'nodejs',
  // Se excluyen los assets estaticos: no tiene sentido pagar la verificacion
  // del token para servir una fuente o un icono.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff2)$).*)',
  ],
};
