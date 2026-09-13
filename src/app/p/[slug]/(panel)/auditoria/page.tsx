import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, scopeToParkingLot } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { Card, EmptyState, formatCOP, formatDateTime } from '@/components/ui';
import { Pager } from '@/components/pager';

export const metadata = { title: 'Auditoria' };

/** Etiquetas legibles de los eventos auditados (CLAUDE.md seccion 24). */
const ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN: 'Inicio de sesion',
  AUTH_LOGIN_FAILED: 'Intento fallido de inicio de sesion',
  AUTH_LOGOUT: 'Cierre de sesion',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario modificado',
  USER_PASSWORD_CHANGED: 'Contrasena cambiada',
  PARKING_LOT_CREATED: 'Parqueadero creado',
  PARKING_LOT_UPDATED: 'Parqueadero modificado',
  PAYMENT_POINT_CREATED: 'Punto de pago creado',
  PAYMENT_POINT_UPDATED: 'Punto de pago modificado',
  CREDENTIAL_UPDATED: 'Credencial actualizada',
  VEHICLE_SEARCH: 'Consulta de vehiculo',
  PAYMENT_START: 'Cobro iniciado',
  PAYMENT_RESULT: 'Resultado del cobro',
  PAYMENT_CANCELLED: 'Cobro cancelado',
  INVOICE_REQUESTED: 'Facturacion solicitada',
  INVOICE_RESULT: 'Resultado de facturacion',
  UPSTREAM_ERROR: 'Error con el sistema del parqueadero',
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Aprobado',
  DECLINED: 'Rechazado',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
  TIMEOUT: 'Sin respuesta',
  PENDING: 'Pendiente',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
};

const VEHICLE_LABEL: Record<string, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  SCOOTER: 'Patineta',
};

const PAGE_SIZE = 25;

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Detalle del evento en una linea legible.
 *
 * Solo toma los datos que le dicen algo a una persona (vehiculo, valor, estado,
 * factura). Nada de volcar la metadata tal cual: ids internos y nombres de campos no
 * le sirven a quien lee.
 */
function describe(metadata: unknown): string {
  if (!isDict(metadata)) return '—';
  const parts: string[] = [];

  const vehicle = typeof metadata.vehicleType === 'string' ? VEHICLE_LABEL[metadata.vehicleType] : null;
  if (vehicle) parts.push(vehicle);

  const identifier = metadata.plate ?? metadata.identifier ?? metadata.vehicleIdentifier;
  if (typeof identifier === 'string' && identifier) parts.push(identifier);

  if (typeof metadata.amount === 'number') parts.push(formatCOP(metadata.amount));

  if (typeof metadata.status === 'string') {
    parts.push(STATUS_LABEL[metadata.status] ?? metadata.status);
  }
  if (typeof metadata.number === 'string' || typeof metadata.number === 'number') {
    parts.push(`Factura ${metadata.number}`);
  }
  if (typeof metadata.email === 'string' && metadata.email) parts.push(metadata.email);

  return parts.length > 0 ? parts.join(' · ') : '—';
}

/**
 * Auditoria del parqueadero. Solo para el SuperAdmin: son registros de soporte de
 * la plataforma (sesiones, consultas, errores de conexion), no informacion de la
 * operacion del parqueadero.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const user = await requireUser();
  if (user.role !== 'SUPERADMIN') notFound();

  const { slug } = await params;
  const { pagina } = await searchParams;

  const lot = await db.parkingLot.findUnique({ where: { slug } });
  if (!lot) notFound();

  const parkingLotId = scopeToParkingLot(user, lot.id);
  const page = Math.max(1, Number(pagina ?? 1) || 1);

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where: { parkingLotId },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count({ where: { parkingLotId } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Auditoria"
        description={`${total} evento(s) registrados en este parqueadero`}
      />

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <EmptyState
            title="Todavia no hay eventos"
            description="Aqui quedara registrado quien entra, quien consulta un vehiculo y como termina cada cobro."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-subtle)] text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Evento</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-subtle)]">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors duration-100 hover:bg-white/[0.03]"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-[var(--text-secondary)]">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-100">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {log.actor?.name ?? 'Sistema'}
                    </td>
                    <td className="max-w-md truncate px-5 py-3 text-[var(--text-secondary)]">
                      {describe(log.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <Pager
            basePath={`/p/${slug}/auditoria`}
            page={page}
            totalPages={totalPages}
          />
        ) : null}
      </Card>
    </>
  );
}
