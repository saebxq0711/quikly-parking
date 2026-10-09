import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MdArrowBack } from 'react-icons/md';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { requireRole } from '@/lib/auth/guards';
import { getConnectionSummary } from '@/lib/parking/config';
import { getRedebanStatus } from '@/lib/parking/redeban';
import { getSiigoCatalogs, getSiigoStatus } from '@/lib/parking/siigo';
import { getLotOverview } from '@/lib/parking/readiness';
import { getCredentials } from '@/lib/credentials';
import { PageHeader } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, CardHeader } from '@/components/ui';
import { LotStatus } from '@/components/admin/directory';
import { SectionIndex, type IndexEntry } from '@/components/admin/section-index';
import { updateParkingLot } from '../../actions';
import { CompanyFields, LocationFields, PolicyFields } from '../lot-fields';
import { IdentityFields } from '../identity-fields';
import { ConnectionCard } from './connection-card';
import { SiigoCard } from './siigo-card';
import { KiosksCard, type KioskView } from './kiosks-card';
import { TeamCard } from './team-card';
import { StatusPill } from './redeban-card';
import { EditableBlock } from '@/components/admin/editable-block';

export const metadata = { title: 'Parqueadero' };

/**
 * Ficha de UN parqueadero para el SuperAdmin.
 *
 * Cinco secciones en el orden en que se deja listo un sitio: los datos de la
 * empresa, su sistema, sus kioscos con su datafono, su facturacion y su equipo.
 * El indice de la izquierda lleva el mismo estado que el riel del directorio, y
 * cada punto pendiente del directorio aterriza en su seccion de aqui.
 *
 * Los botones de guardar van en negro: en una pagina con varios formularios, un
 * amarillo por formulario dejaba de decir cual es la accion principal.
 */
export default async function ParkingLotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  await requireRole('SUPERADMIN');
  const { slug } = await params;
  const { creado } = await searchParams;

  const lot = await db.parkingLot.findUnique({ where: { slug } });
  if (!lot) notFound();

  const ahora = new Date();
  const [overview, connection, siigo, siigoValues, catalogs, puntos, admins] = await Promise.all([
    getLotOverview(lot),
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
    db.user.findMany({
      where: { parkingLotId: lot.id, role: 'ADMIN_PARQUEADERO' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        lastLoginAt: true,
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: ahora } } } } },
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

  // Los mismos seis puntos del riel del directorio; Kioscos y Datafono llevan a la misma seccion.
  const punto = (key: string) => overview.readiness.find((item) => item.key === key)!;
  const indice: IndexEntry[] = overview.readiness.map((item) => ({
    id: item.key,
    target: item.anchor,
    label: item.label,
    ok: item.ok,
    detail: item.detail,
  }));

  const baseUrl = env.APP_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const empresaLista = punto('empresa').ok;

  return (
    <>
      <PageHeader
        back={
          <Link
            href="/admin/parqueaderos"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)]"
          >
            <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
            Parqueaderos
          </Link>
        }
        title={lot.name}
        description={`Los kioscos entran en ${baseUrl}/p/${lot.slug}/pos`}
        action={<LotStatus pending={overview.pending} active={lot.active} />}
      />

      {creado ? (
        <div className="mb-6">
          <Alert tone="success" title="Parqueadero creado">
            Sigue con su sistema, sus kioscos y su facturación. El índice te dice qué falta.
          </Alert>
        </div>
      ) : null}

      {/* `minmax(0,1fr)` tambien en el celular: sin el, la fila de pildoras del indice
          (que se desplaza de lado) ensanchaba la columna y la pagina entera. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 lg:sticky lg:top-8">
          <SectionIndex entries={indice} />
        </div>

        <div className="min-w-0 space-y-6">
          <section id="empresa" className="scroll-mt-8">
            <Card>
              <CardHeader
                title="Datos del parqueadero"
                description="El nombre, la dirección de sus kioscos y lo que va impreso en el comprobante y la factura de cada cliente."
                action={<StatusPill ok={empresaLista} okLabel="Completos" pendingLabel={punto('empresa').detail} />}
              />
              <div className="px-5 py-6 sm:px-6">
                <EditableBlock
                  defaultOpen={!empresaLista}
                  summary={[
                    { label: 'Razón social', value: lot.legalName ?? 'Falta', missing: !lot.legalName },
                    { label: 'NIT · régimen', value: `${lot.nit ?? 'Falta'}${lot.taxRegime ? ` · ${lot.taxRegime}` : ''}`, missing: !lot.nit, tabular: true },
                    {
                      label: 'Dirección',
                      value: lot.address ? [lot.address, lot.city, lot.department].filter(Boolean).join(', ') : 'Falta',
                      missing: !lot.address,
                    },
                    { label: 'Teléfono · correo', value: [lot.phone, lot.email].filter(Boolean).join(' · ') || 'Falta', missing: !lot.phone, tabular: true },
                    {
                      label: 'Póliza',
                      value: lot.insurancePolicy ? `${lot.insurer ?? ''} ${lot.insurancePolicy}`.trim() : 'Falta',
                      missing: !lot.insurancePolicy,
                      tabular: true,
                    },
                    { label: 'Horario', value: lot.businessHours || 'Sin informar' },
                  ]}
                >
                  <ActionForm
                    action={updateParkingLot}
                    submitLabel="Guardar datos"
                    submitVariant="confirm"
                    onSuccessReset={false}
                  >
                    <input type="hidden" name="parkingLotId" value={lot.id} />
                    <IdentityFields baseUrl={baseUrl} name={lot.name} slug={lot.slug} />
                    <CompanyFields lot={lot} markMissing />
                    <LocationFields lot={lot} markMissing />
                    <PolicyFields lot={lot} markMissing />
                  </ActionForm>
                </EditableBlock>
              </div>
            </Card>
          </section>

          <section id="sistema" className="scroll-mt-8">
            <ConnectionCard
              parkingLotId={lot.id}
              baseUrl={connection.baseUrl}
              hasOwnToken={connection.hasOwnToken}
              testMode={connection.testMode}
            />
          </section>

          <section id="kioscos" className="scroll-mt-8">
            <KiosksCard parkingLotId={lot.id} kiosks={kiosks} />
          </section>

          <section id="facturacion" className="scroll-mt-8">
            <SiigoCard
              parkingLotId={lot.id}
              catalogs={catalogs}
              baseUrl={siigoValues.baseUrl ?? 'https://api.siigo.com'}
              partnerId={siigoValues.partnerId ?? 'QuiklyParking'}
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
              credentialsRejected={overview.siigoAcceso === 'rejected'}
            />
          </section>

          <section id="equipo" className="scroll-mt-8">
            <TeamCard
              parkingLotId={lot.id}
              lotName={lot.name}
              members={admins.map((admin) => ({
                id: admin.id,
                name: admin.name,
                email: admin.email,
                active: admin.active,
                hasSession: admin._count.sessions > 0,
                lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
              }))}
            />
          </section>
        </div>
      </div>
    </>
  );
}
