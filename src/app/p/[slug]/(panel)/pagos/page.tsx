import type { Prisma } from '@prisma/client';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, scopeToParkingLot } from '@/lib/auth/guards';
import { PageHeader } from '@/components/app-shell';
import { VehicleIcon } from '@/components/vehicle-icon';
import {
  Card,
  EmptyState,
  StatusBadge,
  formatCOP,
  formatDateTime,
} from '@/components/ui';
import { PaymentFilters } from './filters';
import { Pager } from '@/components/pager';

export const metadata = { title: 'Pagos' };

const VEHICLE_LABEL: Record<string, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  BICYCLE: 'Bicicleta',
  SCOOTER: 'Patineta',
};

const INVOICE_LABEL: Record<string, string> = {
  NOT_REQUIRED: 'No aplica',
  PENDING: 'Pendiente',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  FAILED: 'Fallida',
};

const PAGE_SIZE = 25;

interface SearchParams extends Record<string, string | undefined> {
  q?: string;
  estado?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/**
 * Historial de pagos del parqueadero (CLAUDE.md seccion 17).
 *
 * Los filtros se aplican en la consulta a base de datos, siempre con el
 * `parkingLotId` derivado del usuario: ningun parametro de la URL puede sacar
 * la consulta de su parqueadero.
 */
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const filters = await searchParams;

  const lot = await db.parkingLot.findUnique({ where: { slug } });
  if (!lot) notFound();

  // Se revalida el alcance aqui: la pagina no confia en que el layout ya lo hizo.
  const parkingLotId = scopeToParkingLot(user, lot.id);

  const where: Prisma.PaymentWhereInput = { parkingLotId };
  const hasFilters = Boolean(
    filters.q || filters.estado || filters.tipo || filters.desde || filters.hasta,
  );

  if (filters.q) {
    const term = filters.q.trim();
    where.OR = [
      { plate: { contains: term, mode: 'insensitive' } },
      { vehicleIdentifier: { contains: term, mode: 'insensitive' } },
      { externalTicketId: term },
      { authorizationCode: term },
    ];
  }
  if (filters.estado && filters.estado !== 'TODOS') {
    where.status = filters.estado as Prisma.EnumPaymentStatusFilter['equals'];
  }
  if (filters.tipo && filters.tipo !== 'TODOS') {
    where.vehicleType = filters.tipo as Prisma.EnumVehicleTypeFilter['equals'];
  }
  if (filters.desde || filters.hasta) {
    where.createdAt = {};
    if (filters.desde) where.createdAt.gte = new Date(`${filters.desde}T00:00:00`);
    // `hasta` es inclusivo: se toma hasta el final de ese dia.
    if (filters.hasta) where.createdAt.lte = new Date(`${filters.hasta}T23:59:59`);
  }

  const page = Math.max(1, Number(filters.pagina ?? 1) || 1);

  const [payments, total, approved] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        paymentPoint: { select: { name: true } },
        invoice: { select: { status: true, number: true } },
      },
    }),
    db.payment.count({ where }),
    db.payment.aggregate({
      where: { ...where, status: 'APPROVED' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Pagos"
        description="Historial de cobros de este parqueadero, con su estado y su facturacion."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Recaudado"
          value={formatCOP(approved._sum.amount ?? 0)}
          hint="Solo pagos aprobados"
        />
        <SummaryCard
          label="Pagos aprobados"
          value={String(approved._count)}
          hint={`de ${total} registro(s)`}
        />
        <SummaryCard
          label="Registros"
          value={String(total)}
          hint={hasFilters ? 'con los filtros aplicados' : 'en total'}
        />
      </div>

      <Card className="mb-6 p-4">
        <PaymentFilters basePath={`/p/${slug}/pagos`} current={filters} />
      </Card>

      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Ningun pago coincide' : 'Todavia no hay pagos'}
            description={
              hasFilters
                ? 'Prueba con un rango de fechas mas amplio o limpia los filtros.'
                : 'Cuando se cobre desde un punto de pago, cada operacion aparecera aqui con su estado, su valor y su factura.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-subtle)] text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Vehiculo</th>
                  <th className="px-4 py-3 font-medium">Placa / Tiquete</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Punto</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Factura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-subtle)]">
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="transition-colors duration-100 hover:bg-white/[0.03]"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-[var(--text-secondary)]">
                      {formatDateTime(payment.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-ink-200">
                        <span className="h-4.5 w-4.5 shrink-0 text-[var(--text-muted)]">
                          <VehicleIcon type={payment.vehicleType} />
                        </span>
                        {VEHICLE_LABEL[payment.vehicleType] ?? payment.vehicleType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink-100">
                      {payment.plate ?? payment.vehicleIdentifier}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {payment.customerName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {payment.paymentPoint?.name ?? '—'}
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink-100">
                      {formatCOP(payment.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="px-5 py-3 text-[var(--text-secondary)]">
                      {payment.invoice
                        ? (payment.invoice.number ??
                          INVOICE_LABEL[payment.invoice.status])
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <Pager
            basePath={`/p/${slug}/pagos`}
            page={page}
            totalPages={totalPages}
            query={filters}
          />
        ) : null}
      </Card>
    </>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-ink-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
    </Card>
  );
}
