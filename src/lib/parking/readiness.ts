import { db } from '../db';
import { getConnectionSummary } from './config';
import { getRedebanStatus } from './redeban';
import { checkSiigoCredentials, getSiigoStatus } from './siigo';

/**
 * Que tan listo esta un parqueadero para operar.
 *
 * Es la misma lista en el directorio de parqueaderos y en la ficha de cada uno: si
 * los dos lugares calcularan su propio "que falta", tarde o temprano dirian cosas
 * distintas. Cada punto apunta a su seccion de la ficha (`anchor`).
 */

export type ReadinessKey = 'empresa' | 'sistema' | 'kioscos' | 'datafono' | 'facturacion' | 'equipo';

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** Que esta bien o que falta, en una frase corta. */
  detail: string;
  /** Seccion de la ficha donde se resuelve. */
  anchor: string;
}

export interface LotPerson {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export interface LotKiosk {
  id: string;
  name: string;
  active: boolean;
  hasPrinter: boolean;
  datafonoListo: boolean;
  enLinea: boolean;
}

export interface LotOverview {
  readiness: ReadinessItem[];
  pending: number;
  admins: LotPerson[];
  kiosks: LotKiosk[];
  /** Si SIIGO acepta hoy las credenciales guardadas. */
  siigoAcceso: 'ok' | 'rejected' | 'unknown' | 'missing';
}

export async function getLotOverview(lot: {
  id: string;
  legalName: string | null;
  nit: string | null;
  address: string | null;
  insurancePolicy: string | null;
}): Promise<LotOverview> {
  const ahora = new Date();
  const [connection, siigo, siigoAcceso, admins, puntos] = await Promise.all([
    getConnectionSummary(lot.id),
    getSiigoStatus(lot.id),
    checkSiigoCredentials(lot.id),
    db.user.findMany({
      where: { parkingLotId: lot.id, role: 'ADMIN_PARQUEADERO' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, active: true },
    }),
    db.paymentPoint.findMany({
      where: { parkingLotId: lot.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        active: true,
        hasPrinter: true,
        users: {
          where: { role: 'PUNTO_PAGO' },
          take: 1,
          select: {
            _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: ahora } } } } },
          },
        },
      },
    }),
  ]);

  const kiosks: LotKiosk[] = await Promise.all(
    puntos.map(async (punto) => ({
      id: punto.id,
      name: punto.name,
      active: punto.active,
      hasPrinter: punto.hasPrinter,
      datafonoListo: (await getRedebanStatus(lot.id, punto.id)).configured,
      enLinea: (punto.users[0]?._count.sessions ?? 0) > 0,
    })),
  );

  const empresaFaltante = [
    !lot.legalName && 'razón social',
    !lot.nit && 'NIT',
    !lot.address && 'dirección',
    !lot.insurancePolicy && 'póliza',
  ].filter(Boolean) as string[];

  const enServicio = kiosks.filter((k) => k.active);
  const sinDatafono = enServicio.filter((k) => !k.datafonoListo);
  const sistemaListo = connection.testMode || Boolean(connection.baseUrl && connection.hasOwnToken);
  const adminsActivos = admins.filter((a) => a.active);

  const readiness: ReadinessItem[] = [
    {
      key: 'empresa',
      label: 'Empresa',
      ok: empresaFaltante.length === 0,
      detail: empresaFaltante.length === 0 ? 'Datos para el comprobante completos' : `Falta ${empresaFaltante.join(', ')}`,
      anchor: 'empresa',
    },
    {
      key: 'sistema',
      label: 'Sistema',
      ok: sistemaListo,
      detail: connection.testMode
        ? 'En modo de pruebas'
        : sistemaListo
          ? 'Conectado al sistema del parqueadero'
          : !connection.baseUrl
            ? 'Falta la dirección del sistema'
            : 'Falta el token de acceso',
      anchor: 'sistema',
    },
    {
      key: 'kioscos',
      label: 'Kioscos',
      ok: enServicio.length > 0,
      detail:
        enServicio.length === 0
          ? kiosks.length === 0
            ? 'Sin kioscos: no puede cobrar'
            : 'Ningún kiosco en servicio'
          : `${enServicio.length} en servicio`,
      anchor: 'kioscos',
    },
    {
      key: 'datafono',
      label: 'Datáfono',
      ok: enServicio.length > 0 && sinDatafono.length === 0,
      detail:
        enServicio.length === 0
          ? 'Primero un kiosco'
          : sinDatafono.length === 0
            ? 'Todos los kioscos con datáfono'
            : `${sinDatafono.length === 1 ? sinDatafono[0].name : `${sinDatafono.length} kioscos`} sin datáfono`,
      anchor: 'kioscos',
    },
    {
      key: 'facturacion',
      label: 'Facturación',
      ok: siigo.configured && siigo.enabled && siigoAcceso !== 'rejected',
      detail: !siigo.configured
        ? 'SIIGO sin configurar'
        : siigoAcceso === 'rejected'
          ? 'SIIGO rechaza las credenciales'
          : siigo.enabled
            ? 'Factura cada pago aprobado'
            : 'Configurada pero apagada',
      anchor: 'facturacion',
    },
    {
      key: 'equipo',
      label: 'Equipo',
      ok: adminsActivos.length > 0,
      detail:
        adminsActivos.length === 0
          ? 'Sin administrador'
          : `${adminsActivos.length} ${adminsActivos.length === 1 ? 'administrador' : 'administradores'}`,
      anchor: 'equipo',
    },
  ];

  return {
    readiness,
    pending: readiness.filter((item) => !item.ok).length,
    admins,
    kiosks,
    siigoAcceso,
  };
}
