import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { novaClientFor } from '@/lib/parking/config';
import { getTicketsExport } from '@/integrations/nova-parking/panel';
import {
  parseUpstreamDate,
  paymentMethodLabel,
  stayMinutes,
  ticketPaid,
  ticketStateLabel,
} from '@/lib/parking/tickets-view';
import { VEHICULO, permanencia } from '@/lib/printing/receipt-data';

export const runtime = 'nodejs';
/** El volcado de tiquetes por el tunel tarda ~12 s: con 10 s la descarga se cortaba. */
export const maxDuration = 60;

/**
 * Reporte en Excel del administrador de parqueadero.
 *
 * Tres hojas:
 *   Resumen           cifras del periodo.
 *   Vehiculos         del sistema del parqueadero (Nova Parking): quien entro, si sigue
 *                     adentro, si pago, cuanto, con que, a que hora entro y salio, y
 *                     cuanto tiempo estuvo.
 *   Pagos del kiosco  de nuestra base: los cobros con tarjeta del kiosco, con su factura.
 *
 * Maximo 31 dias por archivo: el volcado de Nova Parking no pagina, y un rango mayor
 * lo pondria lento a el y a la descarga.
 */

const MAX_DIAS = 31;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MONEDA = '"$" #,##0';
const FECHA = 'dd/mm/yyyy hh:mm';

const ESTADO_PAGO: Record<string, string> = {
  APPROVED: 'Aprobado',
  DECLINED: 'Rechazado',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
  PENDING: 'En proceso',
  INITIATED: 'En proceso',
  IN_PROGRESS: 'En proceso',
};

function fallo(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status });
}

/**
 * Excel guarda la fecha sin zona y la muestra tal cual. Se corre a la hora de Bogota
 * para que el administrador vea la hora de su reloj y no la de UTC.
 */
function enBogota(fecha: Date | null): Date | null {
  return fecha ? new Date(fecha.getTime() - 5 * 3_600_000) : null;
}

function encabezado(hoja: ExcelJS.Worksheet) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  fila.alignment = { vertical: 'middle' };
  fila.height = 22;
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fallo(401, 'Inicia sesion para descargar el reporte.');

  const { slug } = await params;
  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, novaBaseUrl: true, testMode: true },
  });
  // 404 y no 403: no se confirma que exista un parqueadero ajeno.
  if (!lot || user.role !== 'ADMIN_PARQUEADERO' || user.parkingLotId !== lot.id) {
    return fallo(404, 'No encontrado.');
  }

  const url = new URL(request.url);
  const desde = url.searchParams.get('desde') ?? '';
  const hasta = url.searchParams.get('hasta') ?? '';
  if (!DIA.test(desde) || !DIA.test(hasta)) return fallo(400, 'Elige las fechas del reporte.');

  const inicio = new Date(`${desde}T00:00:00-05:00`);
  const fin = new Date(`${hasta}T23:59:59.999-05:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio > fin) {
    return fallo(400, 'La fecha inicial debe ser anterior a la final.');
  }
  if ((fin.getTime() - inicio.getTime()) / 86_400_000 > MAX_DIAS) {
    return fallo(400, `El reporte admite como maximo ${MAX_DIAS} dias.`);
  }

  const [tickets, pagos] = await Promise.all([
    lot.novaBaseUrl || lot.testMode
      ? novaClientFor(lot.id)
          .then((client) => getTicketsExport(client, { fromDate: desde, toDate: hasta }))
          .catch(() => null)
      : Promise.resolve(null),
    db.payment.findMany({
      where: { parkingLotId: lot.id, createdAt: { gte: inicio, lte: fin } },
      orderBy: { createdAt: 'asc' },
      include: { invoice: { select: { number: true, status: true } } },
    }),
  ]);

  const ahora = new Date();
  const pagadosEnKiosco = new Set(
    pagos.filter((p) => p.status === 'APPROVED').map((p) => p.externalTicketId),
  );

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Nova Parking';
  libro.created = ahora;

  const resumen = libro.addWorksheet('Resumen');
  const vehiculos = libro.addWorksheet('Vehiculos', { views: [{ state: 'frozen', ySplit: 1 }] });
  const kiosco = libro.addWorksheet('Pagos del kiosco', { views: [{ state: 'frozen', ySplit: 1 }] });

  /* ------------------------------------------------------------ Vehiculos */
  vehiculos.columns = [
    { header: 'Codigo', key: 'codigo', width: 10 },
    { header: 'Placa', key: 'placa', width: 11 },
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'Pago', key: 'pago', width: 8 },
    { header: 'Medio de pago', key: 'medio', width: 18 },
    { header: 'Valor', key: 'valor', width: 13, style: { numFmt: MONEDA } },
    { header: 'Entrada', key: 'entrada', width: 17, style: { numFmt: FECHA } },
    { header: 'Salida', key: 'salida', width: 17, style: { numFmt: FECHA } },
    { header: 'Permanencia', key: 'permanencia', width: 15 },
    { header: 'Registro la entrada', key: 'entradaPor', width: 22 },
    { header: 'Cobro', key: 'cobro', width: 22 },
  ];
  encabezado(vehiculos);

  const filas = tickets?.ok ? tickets.data : [];
  let adentro = 0;
  let salieron = 0;
  let pagados = 0;
  let sinPagar = 0;
  let anulados = 0;
  let recaudado = 0;

  for (const ticket of filas) {
    const entrada = parseUpstreamDate(ticket.checkedInAt);
    const salida = parseUpstreamDate(ticket.checkedOutAt);
    const pago = ticketPaid(ticket);
    const minutos = stayMinutes(entrada, ticket.status === 'IN' ? null : salida, ahora);

    if (ticket.cancelled) anulados += 1;
    else if (ticket.status === 'IN') adentro += 1;
    else salieron += 1;
    if (pago) {
      pagados += 1;
      recaudado += ticket.amount ?? 0;
    } else if (!ticket.cancelled) {
      sinPagar += 1;
    }

    vehiculos.addRow({
      codigo: ticket.code ?? '',
      placa: ticket.plate ?? 'Sin placa',
      tipo: ticket.vehicleType ?? '',
      estado: ticketStateLabel(ticket),
      pago: pago ? 'Si' : 'No',
      // Nova Parking deja "CASH" por defecto aun sin cobrar: el medio solo cuenta si pago.
      medio: !pago
        ? ''
        : pagadosEnKiosco.has(ticket.id)
          ? 'Tarjeta (kiosco)'
          : (paymentMethodLabel(ticket.paymentMethod) ?? ''),
      valor: ticket.amount ?? null,
      entrada: enBogota(entrada),
      salida: ticket.status === 'IN' ? null : enBogota(salida),
      permanencia: minutos !== null ? permanencia(minutos) : '',
      entradaPor: ticket.enteredBy ?? '',
      cobro: ticket.chargedBy ?? '',
    });
  }

  if (!tickets?.ok) {
    vehiculos.addRow({
      codigo: 'No fue posible consultar el sistema del parqueadero para este periodo.',
    });
  }

  /* ----------------------------------------------------- Pagos del kiosco */
  kiosco.columns = [
    { header: 'Fecha', key: 'fecha', width: 17, style: { numFmt: FECHA } },
    { header: 'Codigo', key: 'codigo', width: 10 },
    { header: 'Placa', key: 'placa', width: 11 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Entrada', key: 'entrada', width: 17, style: { numFmt: FECHA } },
    { header: 'Permanencia', key: 'permanencia', width: 15 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Documento', key: 'documento', width: 14 },
    { header: 'Valor', key: 'valor', width: 13, style: { numFmt: MONEDA } },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Tarjeta', key: 'tarjeta', width: 18 },
    { header: 'Autorizacion', key: 'autorizacion', width: 13 },
    { header: 'Recibo', key: 'recibo', width: 11 },
    { header: 'Referencia', key: 'referencia', width: 13 },
    { header: 'Factura', key: 'factura', width: 16 },
  ];
  encabezado(kiosco);

  let aprobadosKiosco = 0;
  let recaudadoKiosco = 0;
  for (const pago of pagos) {
    if (pago.status === 'APPROVED') {
      aprobadosKiosco += 1;
      recaudadoKiosco += pago.amount;
    }
    kiosco.addRow({
      fecha: enBogota(pago.resolvedAt ?? pago.createdAt),
      codigo: pago.ticketCode ?? (pago.plate ? '' : pago.vehicleIdentifier),
      placa: pago.plate ?? '',
      tipo: VEHICULO[pago.vehicleType] ?? pago.vehicleType,
      entrada: enBogota(pago.entryAt),
      permanencia: pago.stayMinutes !== null ? permanencia(pago.stayMinutes) : '',
      cliente: pago.customerName ?? '',
      documento: pago.customerDocument ?? '',
      valor: pago.amount,
      estado: ESTADO_PAGO[pago.status] ?? pago.status,
      tarjeta: pago.cardBrand ? `${pago.cardBrand}${pago.cardMask ? ` ${pago.cardMask}` : ''}` : '',
      autorizacion: pago.authorizationCode ?? '',
      recibo: pago.receiptNumber ?? '',
      referencia: pago.providerTransactionId ?? '',
      factura: pago.invoice?.number ?? (pago.invoice ? String(pago.invoice.status) : ''),
    });
  }

  /* -------------------------------------------------------------- Resumen */
  resumen.columns = [
    { header: 'Dato', key: 'dato', width: 34 },
    { header: 'Valor', key: 'valor', width: 26 },
  ];
  encabezado(resumen);
  const cifra = (dato: string, valor: string | number, moneda = false) => {
    const fila = resumen.addRow({ dato, valor });
    if (moneda) fila.getCell('valor').numFmt = MONEDA;
  };
  const formatoDia = (dia: string) => dia.split('-').reverse().join('/');

  cifra('Parqueadero', lot.name);
  cifra('Periodo', `${formatoDia(desde)} a ${formatoDia(hasta)}`);
  cifra(
    'Generado',
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    }).format(ahora),
  );
  if (tickets?.ok) {
    cifra('Vehiculos que entraron', filas.length);
    cifra('Siguen adentro', adentro);
    cifra('Salieron', salieron);
    cifra('Pagaron', pagados);
    cifra('Sin pagar', sinPagar);
    cifra('Anulados', anulados);
    cifra('Recaudado (sistema del parqueadero)', recaudado, true);
  } else {
    cifra('Vehiculos', 'Sistema del parqueadero no disponible');
  }
  cifra('Pagos aprobados en el kiosco', aprobadosKiosco);
  cifra('Recaudado en el kiosco', recaudadoKiosco, true);

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-${lot.slug}-${desde}_${hasta}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
