import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MdArrowBack } from 'react-icons/md';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireRole } from '@/lib/auth/guards';
import { getConnectionSummary } from '@/lib/parking/config';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { getSiigoStatus } from '@/lib/parking/siigo';
import { getCredentials } from '@/lib/credentials';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Card, CardHeader, EmptyState, Field, Input } from '@/components/ui';
import { updateParkingLot } from '../../actions';
import { ConnectionCard } from './connection-card';
import { RedebanCard } from './redeban-card';
import { SiigoCard } from './siigo-card';
import { ParkingLotDataFields } from '../lot-fields';

export const metadata = { title: 'Parqueadero' };

/**
 * Ficha de UN parqueadero para el SuperAdmin.
 *
 * Solo lo que de verdad le toca decidir: los datos de la empresa, a que servidor se
 * conecta, con que datafono cobra, con que empresa factura y quien lo opera. Lo que es
 * configuracion de la plataforma (como se identifica cada vehiculo, codigos internos
 * del punto de pago) ya viene resuelto y no se muestra.
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
      users: {
        orderBy: { role: 'asc' },
        select: { id: true, name: true, email: true, role: true, active: true },
      },
    },
  });
  if (!lot) notFound();

  const [connection, redeban, redebanValues, siigo, siigoValues] = await Promise.all([
    getConnectionSummary(lot.id),
    getRedebanStatus(lot.id),
    getCredentials({ provider: 'REDEBAN', parkingLotId: lot.id }),
    getSiigoStatus(lot.id),
    getCredentials({ provider: 'SIIGO', parkingLotId: lot.id }),
  ]);

  return (
    <>
      <PageHeader
        back={
          <Link
            href="/admin/parqueaderos"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-ink-100"
          >
            <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
            Parqueaderos
          </Link>
        }
        title={lot.name}
        description={`Kiosco de pago: ${env.APP_URL.replace(/\/+$/, '')}/p/${lot.slug}/pos`}
      />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Datos del parqueadero"
            description="Encabezan el comprobante y la factura que recibe el cliente."
          />
          <div className="p-5">
            <ActionForm action={updateParkingLot} submitLabel="Guardar datos" onSuccessReset={false}>
              <input type="hidden" name="parkingLotId" value={lot.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input name="name" required defaultValue={lot.name} />
                </Field>
                <Field label="Identificador" hint="Va en la direccion web del sitio.">
                  <Input name="slug" required defaultValue={lot.slug} spellCheck={false} />
                </Field>
              </div>
              <ParkingLotDataFields lot={lot} />
            </ActionForm>
          </div>
        </Card>

        <div className="grid gap-6">
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
            usuario={redebanValues.usuario ?? null}
            red={redeban.red}
            hasPassword={Boolean(redebanValues.clave)}
            missing={redeban.missing}
          />
        </div>

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
          defaultCustomerIdentification={siigoValues.defaultCustomerIdentification ?? '222222222'}
          defaultCustomerName={siigoValues.defaultCustomerName ?? 'Consumidor final'}
          sendStamp={siigoValues.sendStamp === 'true'}
          sendMail={siigoValues.sendMail === 'true'}
        />

        <Card>
          <CardHeader
            title="Usuarios"
            description="Quien administra este parqueadero y quien opera su kiosco."
            action={
              <Link
                href="/admin/usuarios"
                className="shrink-0 text-[13px] font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
              >
                Administrar
              </Link>
            }
          />
          {lot.users.length === 0 ? (
            <EmptyState
              title="Sin usuarios"
              description="Crea un administrador y un usuario de punto de pago desde Usuarios."
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)]">
              {lot.users.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-100">{user.name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {user.role === 'ADMIN_PARQUEADERO' ? 'Administrador' : 'Punto de pago'}
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
