import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { UsersWorkspace, type DirectoryUser, type DirectoryGroup } from './users-workspace';
import { ResetRequests } from './reset-requests';

export const metadata = { title: 'Usuarios' };

/**
 * Usuarios de la plataforma, agrupados por el parqueadero al que pertenecen.
 *
 * Antes era una sola lista con los tres roles mezclados y los botones en un lugar
 * distinto en cada fila. Ahora cada persona aparece dentro de su sitio, se busca
 * por nombre o correo, se filtra por rol, y se gestiona desplegando su fila.
 * Las solicitudes de contrasena van primero: son lo unico de esta pantalla que
 * alguien esta esperando.
 */
export default async function UsersPage() {
  const actor = await requireRole('SUPERADMIN');
  const ahora = new Date();

  const [users, lots, requests] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        parkingLotId: true,
        paymentPoint: { select: { name: true } },
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: ahora } } } } },
      },
    }),
    db.parkingLot.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, active: true },
    }),
    db.passwordResetRequest.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const directorio: DirectoryUser[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    hasSession: user._count.sessions > 0,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lotId: user.parkingLotId,
    kioskName: user.paymentPoint?.name ?? null,
    isSelf: user.id === actor.id,
  }));

  const grupos: DirectoryGroup[] = [
    { id: 'superadmin', title: 'Super administradores', subtitle: 'Configuran toda la plataforma', href: null },
    ...lots.map((lot) => ({
      id: lot.id,
      title: lot.name,
      subtitle: lot.active ? `Administradores y kioscos de ${lot.name}` : 'Parqueadero inactivo',
      href: `/admin/parqueaderos/${lot.slug}#equipo`,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description={`${users.length} ${users.length === 1 ? 'persona' : 'personas'} con acceso. Cada una pertenece a un parqueadero, salvo los super administradores.`}
      />

      {requests.length > 0 ? (
        <div className="mb-6">
          <ResetRequests
            requests={requests.map((r) => ({
              id: r.id,
              email: r.email,
              createdAt: r.createdAt.toISOString(),
              userId: r.user?.id ?? null,
              userName: r.user?.name ?? null,
            }))}
          />
        </div>
      ) : null}

      <UsersWorkspace
        users={directorio}
        groups={grupos}
        parkingLots={lots.filter((lot) => lot.active).map((lot) => ({ id: lot.id, name: lot.name }))}
      />
    </>
  );
}
