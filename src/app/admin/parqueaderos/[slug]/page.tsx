import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/guards';
import { getConnectionSummary, getVehicleRules } from '@/lib/parking/config';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { getSiigoStatus } from '@/lib/parking/siigo';
import { getCredentials } from '@/lib/credentials';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Card, CardHeader, Checkbox, EmptyState, Field, Input } from '@/components/ui';
import { savePaymentPoint, updateParkingLot } from '../../actions';
import { ConnectionCard } from './connection-card';
import { RedebanCard } from './redeban-card';
import { SiigoCard } from './siigo-card';
import { VehicleRules } from './vehicle-rules';

/**
 * Configuracion completa de UN parqueadero.
 *
 * Todo lo que distingue a este sitio de los demas esta aqui, en el orden en que
 * hace falta al ponerlo en marcha: sus datos, a que sistema se conecta, con que
 * datafono cobra, como identifica los vehiculos, y quien lo opera.
 */
export default async function ParkingLotDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRole('SUPERADMIN');
  const { slug } = await params;

  const lot = await db.parkingLot.findUnique({
    where: { slug },
    include: {
      paymentPoint: true,
      users: {
        orderBy: { role: 'asc' },
        select: { id: true, name: true, email: true, role: true, active: true },
      },
    },
  });
  if (!lot) notFound();

  const [connection, redeban, redebanValues, siigo, siigoValues, rules] =
    await Promise.all([
      getConnectionSummary(lot.id),
      getRedebanStatus(lot.id),
      getCredentials({ provider: 'REDEBAN', parkingLotId: lot.id }),
      getSiigoStatus(lot.id),
      getCredentials({ provider: 'SIIGO', parkingLotId: lot.id }),
      getVehicleRules(lot.id),
    ]);

  return (
    <>
      <PageHeader
        back={
          <Link
            href="/admin/parqueaderos"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-ink-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="m14.5 5.5-6.5 6.5 6.5 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Parqueaderos
          </Link>
        }
        title={lot.name}
        description="Configuracion del sitio: sistema, datafono, facturacion, identificacion de vehiculos y punto de pago."
        action={
          <Link
            href={`/p/${lot.slug}/pagos`}
            className="inline-flex h-11 items-center rounded-lg bg-white/[0.04] px-4 text-sm font-semibold text-ink-100 ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:ring-white/20"
          >
            Ver pagos
          </Link>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ConnectionCard
          parkingLotId={lot.id}
          baseUrl={connection.baseUrl}
          hasOwnToken={connection.hasOwnToken}
          testMode={connection.testMode}
        />

        <RedebanCard
          parkingLotId={lot.id}
          baseUrl={redeban.baseUrl}
          codigoUnico={redeban.codigoUnico}
          codigoTerminal={redeban.codigoTerminal}
          red={redeban.red}
          hasPassword={Boolean(redebanValues.clave)}
          missing={redeban.missing}
        />

        <SiigoCard
          parkingLotId={lot.id}
          baseUrl={siigoValues.baseUrl ?? 'https://api.siigo.com'}
          partnerId={siigoValues.partnerId ?? 'PuntoPagoParking'}
          enabled={siigo.enabled}
          missing={siigo.missing}
          username={siigo.username ?? ''}
          hasAccessKey={siigo.hasAccessKey}
          documentId={siigoValues.documentId ?? ''}
          sellerId={siigoValues.sellerId ?? ''}
          paymentTypeId={siigoValues.paymentTypeId ?? ''}
          itemCode={siigoValues.itemCode ?? ''}
          itemDescription={siigoValues.itemDescription ?? 'Servicio de parqueadero'}
          defaultCustomerIdType={siigoValues.defaultCustomerIdType ?? '13'}
          defaultCustomerIdentification={
            siigoValues.defaultCustomerIdentification ?? '222222222'
          }
          defaultCustomerName={siigoValues.defaultCustomerName ?? 'Consumidor final'}
          sendStamp={siigoValues.sendStamp === 'true'}
          sendMail={siigoValues.sendMail === 'true'}
        />

        <VehicleRules parkingLotId={lot.id} rules={rules} />

        {/* ---------------------------------------------- Datos del sitio --- */}
        <Card>
          <CardHeader
            title="Datos del parqueadero"
            description="Aparecen en la interfaz y en el soporte de las facturas."
          />
          <div className="p-5">
            <ActionForm
              action={updateParkingLot}
              submitLabel="Guardar datos"
              onSuccessReset={false}
            >
              <input type="hidden" name="parkingLotId" value={lot.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input name="name" required defaultValue={lot.name} />
                </Field>
                <Field
                  label="Identificador"
                  hint="Se usa en la direccion web del sitio."
                >
                  <Input
                    name="slug"
                    required
                    defaultValue={lot.slug}
                    spellCheck={false}
                  />
                </Field>
                <Field label="Ciudad">
                  <Input name="city" defaultValue={lot.city ?? ''} />
                </Field>
                <Field label="NIT">
                  <Input name="nit" defaultValue={lot.nit ?? ''} />
                </Field>
              </div>
              <Field label="Direccion">
                <Input name="address" defaultValue={lot.address ?? ''} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        {/* ---------------------------------------------- Punto de pago --- */}
        <Card>
          <CardHeader
            title="Punto de pago"
            description="Cada parqueadero tiene uno. Su codigo de cajero y numero de caja viajan al datafono en cada cobro."
          />
          <div className="space-y-5 p-5">
            <div className="rounded-lg bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                Direccion del kiosco
              </p>
              <p className="mt-1 break-all font-mono text-[13px] text-ink-100">
                /p/{lot.slug}/pos
              </p>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Deja esta pagina abierta en la pantalla del punto de pago.
              </p>
            </div>

            <ActionForm
              action={savePaymentPoint}
              submitLabel="Guardar punto de pago"
              onSuccessReset={false}
            >
              <input type="hidden" name="parkingLotId" value={lot.id} />
              <Field label="Nombre">
                <Input
                  name="name"
                  required
                  defaultValue={lot.paymentPoint?.name ?? 'Punto de pago'}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Codigo">
                  <Input
                    name="code"
                    required
                    defaultValue={lot.paymentPoint?.code ?? 'PP1'}
                  />
                </Field>
                <Field label="Cajero">
                  <Input
                    name="cashierCode"
                    defaultValue={lot.paymentPoint?.cashierCode ?? ''}
                  />
                </Field>
                <Field label="Numero de caja">
                  <Input
                    name="boxNumber"
                    defaultValue={lot.paymentPoint?.boxNumber ?? ''}
                  />
                </Field>
              </div>
              {/*
                Lo marca una persona porque la pagina no puede saberlo: un
                navegador no deja ver que impresoras hay conectadas.
              */}
              <div className="space-y-1.5 border-t border-[var(--line-subtle)] pt-4">
                <Checkbox
                  name="hasPrinter"
                  defaultChecked={lot.paymentPoint?.hasPrinter ?? false}
                  label="Este kiosco tiene impresora de recibos"
                />
                <p className="pl-6.5 text-xs text-[var(--text-muted)]">
                  Al aprobarse un pago imprime un comprobante con un QR hacia la
                  factura. Para que no aparezca el cuadro de impresion, abre el
                  navegador del kiosco con --kiosk --kiosk-printing.
                </p>
              </div>
            </ActionForm>
          </div>
        </Card>

        {/* --------------------------------------------------- Usuarios --- */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Usuarios de este parqueadero"
            description="Se crean y se administran desde la seccion Usuarios."
            action={
              <Link
                href="/admin/usuarios"
                className="shrink-0 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
              >
                Administrar usuarios
              </Link>
            }
          />
          {lot.users.length === 0 ? (
            <EmptyState
              title="Sin usuarios asignados"
              description="Nadie puede entrar a este parqueadero todavia. Crea un administrador y un operador de punto de pago."
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)]">
              {lot.users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-100">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {user.email}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {user.role === 'ADMIN_PARQUEADERO'
                      ? 'Administrador'
                      : 'Punto de pago'}
                    {!user.active ? ' · inactivo' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
