import { NextResponse, type NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { SESSION_COOKIE_NAME, verifyToken } from '@/lib/auth/jwt';

/**
 * Primera linea de defensa, en cada peticion.
 *
 * Hace tres cosas:
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
 * Solo importa `jwt.ts`: aqui se verifica la firma del JWT sin tocar la base de
 * datos, porque esto corre en el Edge Runtime. La autorizacion definitiva
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

/** Ninguna pantalla autenticada debe quedar en la cache del navegador. */
function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyToken(token) : null;

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
  // Se excluyen los assets estaticos: no tiene sentido pagar la verificacion
  // del token para servir una fuente o un icono.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|woff2)$).*)',
  ],
};
