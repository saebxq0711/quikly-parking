import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { Alert, Card, CardHeader, EmptyState, formatDateTime } from '@/components/ui';
import { UserForm } from './user-form';
import { UserActions } from './user-actions';
import { ResetRequests } from './reset-requests';

export const metadata = { title: 'Usuarios' };

const ROLE_LABEL = {
  SUPERADMIN: 'Super administrador',
  ADMIN_PARQUEADERO: 'Administrador',
  PUNTO_PAGO: 'Punto de pago',
} as const;

/**
 * Administracion de usuarios.
 *
 * Ademas de crearlos, es desde aqui donde se resuelven las dos cosas que no
 * puede hacer el propio usuario: restablecer una contrasena olvidada y cerrar
 * la sesion de un punto de pago a distancia — el kiosco esta de cara al publico
 * y no tiene un boton de salida a la vista.
 */
export default async function UsersPage() {
  const actor = await requireRole('SUPERADMIN');

  const [users, lots, requests] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        parkingLot: { select: { name: true } },
        paymentPoint: { select: { name: true } },
        // Solo las sesiones vivas: las cerradas o vencidas no son "sesion abierta".
        _count: {
          select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } },
        },
      },
    }),
    db.parkingLot.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.passwordResetRequest.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Cada usuario pertenece a un parqueadero, salvo el super administrador."
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <Card className="overflow-hidden">
          {users.length === 0 ? (
            <EmptyState
              title="No hay usuarios"
              description="Crea el primero con el formulario de la derecha."
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)]">
              {users.map((user) => (
                <li key={user.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-ink-100">
                          {user.name}
                        </p>
                        <span
                          className={
                            user.active
                              ? 'rounded-full bg-ok-500/12 px-2 py-0.5 text-[11px] font-medium text-ok-300 ring-1 ring-inset ring-ok-400/30'
                              : 'rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-ink-400 ring-1 ring-inset ring-white/15'
                          }
                        >
                          {user.active ? 'Activo' : 'Inactivo'}
                        </span>
                        {user._count.sessions > 0 ? (
                          <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[11px] font-medium text-brand-200 ring-1 ring-inset ring-brand-400/30">
                            Sesion abierta
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                        {user.email}
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                        {ROLE_LABEL[user.role]}
                        {user.parkingLot ? ` · ${user.parkingLot.name}` : ''}
                        {user.paymentPoint ? ` · kiosco ${user.paymentPoint.name}` : ''}
                        {' · '}
                        {user.lastLoginAt
                          ? `ultimo ingreso ${formatDateTime(user.lastLoginAt)}`
                          : 'nunca ha ingresado'}
                      </p>
                    </div>

                    <UserActions
                      userId={user.id}
                      active={user.active}
                      hasSession={user._count.sessions > 0}
                      isSelf={user.id === actor.id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader
              title="Nuevo usuario"
              description="Entregale su correo y su contrasena por tu canal habitual."
            />
            <div className="p-5">
              <UserForm
                parkingLots={lots.map((lot) => ({ id: lot.id, name: lot.name }))}
              />
            </div>
          </Card>

          <Alert tone="info" title="Sobre los kioscos">
            Los usuarios de kiosco se crean en la ficha de cada parqueadero, junto con su
            kiosco. La pantalla no tiene un boton de salida a la vista, para que ningun
            cliente la deje fuera de servicio: su sesion se cierra a distancia desde aqui o
            desde la ficha del parqueadero.
          </Alert>
        </div>
      </div>
    </>
  );
}
