import { db } from '@/lib/db';

/**
 * Logo de un parqueadero (`lib/parking/logo.ts`).
 *
 * Pide sesion como todo lo de /api (el middleware), pero no se limita al parqueadero
 * del usuario: un logo no es un dato reservado, y el id es aleatorio.
 *
 * Con `?v=` (la fecha del cambio) se guarda en el navegador para siempre: al cambiar
 * el logo cambia la URL. Sin `v`, se revalida cada vez.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logo = await db.parkingLotLogo.findUnique({
    where: { parkingLotId: id },
    select: { data: true, mimeType: true },
  });
  if (!logo) return new Response(null, { status: 404 });

  const conVersion = new URL(request.url).searchParams.has('v');
  return new Response(new Uint8Array(logo.data), {
    headers: {
      'Content-Type': logo.mimeType,
      'Cache-Control': conVersion ? 'private, max-age=31536000, immutable' : 'private, no-cache',
      // Por si alguna vez se cuela algo que no es una imagen: que no se ejecute.
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
