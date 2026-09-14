import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MdArrowBack } from 'react-icons/md';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireRole } from '@/lib/auth/guards';
import { getConnectionSummary } from '@/lib/parking/config';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { getSiigoCatalogs, getSiigoStatus } from '@/lib/parking/siigo';
import { getCredentials } from '@/lib/credentials';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Card, CardHeader, EmptyState, Field, Input } from '@/components/ui';
import { updateParkingLot } from '../../actions';
import { ConnectionCard } from './connection-card';
import { SiigoCard } from './siigo-card';
import { KiosksCard, type KioskView } from './kiosks-card';
import { ParkingLotDataFields } from '../lot-fields';

export const metadata = { title: 'Parqueadero' };

/**
 * Ficha de UN parqueadero para el SuperAdmin.
 *
 * Solo lo que de verdad le toca decidir: los datos de la empresa, a que servidor se
 * conecta, con que empresa factura, sus kioscos de pago (cada uno con su usuario, su
 * datafono y su impresora) y sus administradores.
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
        where: { role: 'ADMIN_PARQUEADERO' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, email: true, active: true },
      },
    },
  });
  if (!lot) notFound();

  const ahora = new Date();
  const [connection, siigo, siigoValues, catalogs, puntos] = await Promise.all([
    getConnectionSummary(lot.id),
    getSiigoStatus(lot.id),
    getCredentials({ provider: 'SIIGO', parkingLotId: lot.id }),
    getSiigoCatalogs(lot.id),
    db.paymentPoint.findMany({
      where: { parkingLotId: lot.id },
      orderBy: { createdAt: 'asc' },
      include: {
        users: {
          where: { role: 'PUNTO_PAGO' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            email: true,
            active: true,
            _count: {
              select: { sessions: { where: { revokedAt: null, expiresAt: { gt: ahora } } } },
            },
          },
        },
      },
    }),
  ]);

  const kiosks: KioskView[] = await Promise.all(
    puntos.map(async (punto) => {
      const [estado, valores] = await Promise.all([
        getRedebanStatus(lot.id, punto.id),
        getCredentials({ provider: 'REDEBAN', parkingLotId: lot.id, paymentPointId: punto.id }),
      ]);
      const usuario = punto.users[0];
      return {
        id: punto.id,
        name: punto.name,
        active: punto.active,
        hasPrinter: punto.hasPrinter,
        user: usuario
          ? {
              id: usuario.id,
              email: usuario.email,
              active: usuario.active,
              activeSessions: usuario._count.sessions,
            }
          : null,
        redeban: {
          baseUrl: estado.baseUrl,
          codigoUnico: estado.codigoUnico,
          codigoTerminal: estado.codigoTerminal,
          usuario: valores.usuario ?? null,
          red: estado.red,
          hasPassword: Boolean(valores.clave),
          missing: estado.missing,
        },
      };
    }),
  );

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
        description={`Los kioscos entran en ${env.APP_URL.replace(/\/+$/, '')}/p/${lot.slug}/pos`}
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

          <Card>
            <CardHeader
              title="Administradores"
              description="Quienes ven el panel de este parqueadero."
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
              <EmptyState title="Sin administradores" description="Crea uno desde Usuarios." />
            ) : (
              <ul className="divide-y divide-[var(--line-subtle)]">
                {lot.users.map((user) => (
                  <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-100">{user.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
                    </div>
                    {!user.active ? <span className="text-xs text-[var(--text-muted)]">Inactivo</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <KiosksCard parkingLotId={lot.id} kiosks={kiosks} />

        <div className="xl:col-span-2">
          <SiigoCard
            parkingLotId={lot.id}
            catalogs={catalogs}
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
        </div>
      </div>
    </>
  );
}
