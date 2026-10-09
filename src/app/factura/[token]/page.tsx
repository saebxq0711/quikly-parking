import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rate-limit';
import { strike } from '@/lib/security/blocklist';
import { clientIp } from '@/lib/security/ip';
import { formatCOP } from '@/components/ui';

export const metadata = { title: 'Tu factura' };

// Cambia de "se esta generando" a la factura sin que nadie despliegue nada.
export const dynamic = 'force-dynamic';

/**
 * El enlace del QR impreso en el comprobante.
 *
 * POR QUE EXISTE Y NO SE IMPRIME DIRECTO EL ENLACE DE SIIGO
 * ---------------------------------------------------------
 * El comprobante se imprime en el instante en que se aprueba el pago, y en ese
 * momento la factura de SIIGO todavia no existe: se genera un rato despues, y a
 * veces SIIGO falla y hay que reintentar. Hacer esperar al cliente frente a la
 * barrera por eso no tiene sentido.
 *
 * Asi que el QR apunta aqui, a un enlace que ya existe desde el principio. Si la
 * factura esta lista, este enlace lleva a ella; si no, dice que se esta
 * generando y que tambien le llega al correo.
 *
 * El enlace es PUBLICO — lo abre el cliente desde su celular, sin sesion. Lo
 * protege el token: 24 bytes aleatorios, imposibles de adivinar. Aun asi se
 * muestra lo minimo, sin documento ni datos de la tarjeta, porque un
 * comprobante puede quedar tirado en el parqueadero.
 */
export default async function FacturaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ip = clientIp(await headers());

  /*
    Es la unica pagina publica que consulta la base. El token tiene 24 bytes
    aleatorios y no se adivina, pero sin limite cualquiera podria martillar la
    base probando enlaces; asi, quien insiste queda bloqueado.
  */
  try {
    await consumeRateLimit({ key: `factura:${ip ?? 'desconocida'}`, limit: 30, windowMs: 60_000, ip, path: '/factura' });
  } catch {
    return <Aviso titulo="Demasiadas consultas" texto="Espera un minuto y vuelve a abrir el enlace." />;
  }

  // Forma del token antes de ir a la base: descarta basura sin consultar.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    await strike(ip, 'BAD_TOKEN', { path: '/factura' });
    notFound();
  }

  const payment = await db.payment.findUnique({
    where: { receiptToken: token },
    select: {
      status: true,
      amount: true,
      resolvedAt: true,
      parkingLot: { select: { name: true } },
      invoice: { select: { status: true, publicUrl: true, number: true } },
    },
  });

  if (!payment) {
    await strike(ip, 'BAD_TOKEN', { path: '/factura' });
    notFound();
  }
  if (payment.status !== 'APPROVED') notFound();

  // Solo se sigue un enlace de SIIGO por https: la URL la guardamos nosotros de
  // su respuesta, pero no se redirige a ciegas a lo que haya en la base.
  const url = payment.invoice?.publicUrl;
  if (url && url.startsWith('https://')) redirect(url);

  const fallida = payment.invoice?.status === 'FAILED';

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/quikly-parking-positivo.png"
          alt="Quikly Parking"
          width={783}
          height={269}
          priority
          className="mx-auto h-16 w-auto"
        />

        <h1 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">
          {fallida ? 'Tu factura tuvo un problema' : 'Tu factura se esta generando'}
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-secondary)]">
          {fallida
            ? 'Tu pago quedo registrado. La factura se esta revisando; si dejaste tu correo, te llegara ahi.'
            : 'Tu pago quedo registrado. Vuelve a abrir este enlace en unos minutos. Si dejaste tu correo, tambien te llega ahi.'}
        </p>

        <dl className="mt-7 space-y-3 rounded-2xl bg-[var(--surface-raised)] p-5 text-left text-sm ring-1 ring-[var(--line-subtle)]">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Parqueadero</dt>
            <dd className="text-right font-medium text-[var(--text-primary)]">{payment.parkingLot.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--text-muted)]">Valor pagado</dt>
            <dd className="tnum font-medium text-[var(--text-primary)]">{formatCOP(payment.amount)}</dd>
          </div>
          {payment.resolvedAt ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Fecha</dt>
              <dd className="tnum font-medium text-[var(--text-primary)]">
                {new Intl.DateTimeFormat('es-CO', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'America/Bogota',
                }).format(payment.resolvedAt)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </main>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{titulo}</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-secondary)]">{texto}</p>
      </div>
    </main>
  );
}
