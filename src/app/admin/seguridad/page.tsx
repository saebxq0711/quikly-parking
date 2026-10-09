import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { Alert, Card, CardHeader, EmptyState, formatDateTime } from '@/components/ui';
import { STRIKE_THRESHOLD } from '@/lib/security/blocklist';
import { BlockIpForm, UnblockButton } from './security-forms';

export const metadata = { title: 'Seguridad' };
export const dynamic = 'force-dynamic';

const TIPO_EVENTO: Record<string, string> = {
  TRAP: 'Ruta de escaneo',
  BAD_AGENT: 'Herramienta de ataque',
  BAD_ORIGIN: 'Peticion desde otro sitio',
  RATE_LIMIT: 'Demasiadas peticiones',
  LOGIN_FAILED: 'Inicio de sesion fallido',
  BAD_TOKEN: 'Enlace inexistente',
  BLOCKED: 'IP bloqueada',
  UNBLOCKED: 'IP desbloqueada',
};

/**
 * Seguridad de la plataforma: IPs bloqueadas y lo que hizo saltar las defensas.
 *
 * El sistema bloquea solo (ver lib/security/blocklist.ts); aqui el SuperAdmin ve
 * por que, levanta un bloqueo equivocado o bloquea a mano una IP que vio en los
 * eventos.
 */
export default async function SecurityPage() {
  await requireRole('SUPERADMIN');
  const ahora = new Date();
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60_000);

  const [bloqueos, eventos, conteo] = await Promise.all([
    db.blockedIp
      .findMany({
        where: { OR: [{ permanent: true }, { blockedUntil: { gt: ahora } }] },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      })
      .catch(() => null),
    db.securityEvent
      .findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      .catch(() => null),
    db.securityEvent
      .groupBy({ by: ['kind'], where: { createdAt: { gt: hace24h } }, _count: { _all: true } })
      .catch(() => null),
  ]);

  const sinTablas = bloqueos === null || eventos === null;

  return (
    <>
      <PageHeader
        title="Seguridad"
        description="IPs bloqueadas y actividad sospechosa de las ultimas horas."
      />

      {sinTablas ? (
        <div className="mb-6">
          <Alert tone="warning" title="Falta preparar la base">
            Las tablas de seguridad no existen todavia. Corre <code>npx prisma migrate deploy</code>{' '}
            con la base de produccion. Mientras tanto los limites funcionan en memoria y no se
            bloquea ninguna IP.
          </Alert>
        </div>
      ) : null}

      {conteo && conteo.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {conteo
            .sort((a, b) => b._count._all - a._count._all)
            .map((fila) => (
              <span
                key={fila.kind}
                className="rounded-full bg-[var(--surface-raised)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--line-subtle)]"
              >
                {TIPO_EVENTO[fila.kind] ?? fila.kind}:{' '}
                <span className="tnum font-semibold text-[var(--text-primary)]">{fila._count._all}</span>{' '}
                en 24 h
              </span>
            ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader
              title="IPs bloqueadas"
              description="No pueden entrar a ninguna pantalla mientras dure el bloqueo."
            />
            {!bloqueos || bloqueos.length === 0 ? (
              <EmptyState title="Ninguna IP bloqueada" description="Cuando el sistema bloquee una, aparece aqui." />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {bloqueos.map((b) => (
                  <li key={b.ip} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="tnum font-medium text-[var(--text-primary)]">{b.ip}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{b.reason}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {b.permanent ? 'Permanente' : `Hasta ${formatDateTime(b.blockedUntil)}`}
                        {' · '}
                        {b.offenses === 1 ? 'primera vez' : `${b.offenses} veces`}
                        {' · '}
                        {b.automatic ? 'automatico' : 'manual'}
                      </p>
                    </div>
                    <UnblockButton ip={b.ip} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Actividad reciente" description="Los ultimos 100 eventos." />
            {!eventos || eventos.length === 0 ? (
              <EmptyState title="Sin eventos" description="Nada ha hecho saltar las defensas." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Cuando</th>
                      <th className="px-3 py-2.5 font-medium">IP</th>
                      <th className="px-3 py-2.5 font-medium">Que paso</th>
                      <th className="px-5 py-2.5 font-medium">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line-subtle)]">
                    {eventos.map((e) => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap px-5 py-2.5 text-[var(--text-secondary)]">
                          {formatDateTime(e.createdAt)}
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 text-[var(--text-primary)]">{e.ip ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[var(--text-primary)]">
                          {TIPO_EVENTO[e.kind] ?? e.kind}
                        </td>
                        <td className="max-w-[22rem] truncate px-5 py-2.5 text-[var(--text-muted)]" title={[e.path, e.detail].filter(Boolean).join(' · ')}>
                          {[e.path, e.detail].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Bloquear una IP" description="Para una IP que viste en la actividad." />
            <div className="p-5">
              <BlockIpForm />
            </div>
          </Card>

          <Alert tone="info" title="Como bloquea el sistema">
            Cada cosa sospechosa suma faltas a la IP: buscar rutas de escaneo, pasarse de los
            limites de peticiones, fallar el inicio de sesion o mandar peticiones desde otro sitio.
            Con {STRIKE_THRESHOLD} faltas en una hora queda bloqueada, y cada vez que reincide el
            bloqueo dura mas: 15 minutos, 1 hora, 6 horas, 1 dia, 7 dias. Quien tiene una sesion
            abierta no queda bloqueado, para que un kiosco no se caiga por algo que paso en la
            misma red; sigue sujeto a los limites por usuario.
          </Alert>
        </div>
      </div>
    </>
  );
}
