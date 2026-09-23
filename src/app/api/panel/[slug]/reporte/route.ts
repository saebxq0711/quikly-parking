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
import {
  COLOR,
  FECHA,
  FUENTE,
  MONEDA,
  bandaDeTitulo,
  definirColumnas,
  encabezadoDeColumnas,
  filaDeTotales,
  listaParaImprimir,
  logoDeMarca,
  vestirFila,
  type Columna,
} from '@/lib/reports/excel-style';

export const runtime = 'nodejs';
/** El volcado de tiquetes por el tunel tarda ~12 s: con 10 s la descarga se cortaba. */
export const maxDuration = 60;

/**
 * Reporte en Excel del administrador de parqueadero.
 *
 * Tres hojas:
 *   Resumen           portada con la marca y las cifras del periodo.
 *   Vehiculos         del sistema del parqueadero (Nova Parking): quien entro, si sigue
 *                     adentro, si pago, cuanto, con que, a que hora entro y salio, y
 *                     cuanto tiempo estuvo.
 *   Pagos del kiosco  de nuestra base: los cobros con tarjeta del kiosco, con su factura.
 *
 * El formato no es adorno: este archivo se imprime y se reenvia al contador o al
 * dueno del parqueadero, gente que no entra a la aplicacion. Lo visual vive en
 * `lib/reports/excel-style.ts`; aqui solo estan los datos.
 *
 * Maximo 31 dias por archivo: el volcado de Nova Parking no pagina, y un rango mayor
 * lo pondria lento a el y a la descarga.
 */

const MAX_DIAS = 31;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

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

const formatoDia = (dia: string) => dia.split('-').reverse().join('/');

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fallo(401, 'Inicia sesion para descargar el reporte.');

  const { slug } = await params;
  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      legalName: true,
      nit: true,
      novaBaseUrl: true,
      testMode: true,
    },
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

  const [tickets, pagos, logo] = await Promise.all([
    lot.novaBaseUrl || lot.testMode
      ? novaClientFor(lot.id)
          .then((client) => getTicketsExport(client, { fromDate: desde, toDate: hasta }))
          .catch(() => null)
      : Promise.resolve(null),
    db.payment.findMany({
      where: { parkingLotId: lot.id, createdAt: { gte: inicio, lte: fin } },
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: { select: { number: true, status: true } },
        paymentPoint: { select: { name: true } },
      },
    }),
    logoDeMarca(),
  ]);

  const ahora = new Date();
  const generado = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(ahora);
  const periodo = `${formatoDia(desde)} a ${formatoDia(hasta)}`;

  const pagadosEnKiosco = new Set(
    pagos.filter((p) => p.status === 'APPROVED').map((p) => p.externalTicketId),
  );

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Quikly Parking';
  libro.lastModifiedBy = 'Quikly Parking';
  libro.company = 'Quikly Parking';
  libro.title = `Reporte de operacion - ${lot.name}`;
  libro.subject = `Periodo ${periodo}`;
  libro.created = ahora;

  const resumen = libro.addWorksheet('Resumen', {
    properties: { tabColor: { argb: COLOR.marca } },
  });
  const vehiculos = libro.addWorksheet('Vehiculos', {
    properties: { tabColor: { argb: COLOR.aqua } },
  });
  const kiosco = libro.addWorksheet('Pagos del kiosco', {
    properties: { tabColor: { argb: COLOR.ambar } },
  });

  /* ------------------------------------------------------------ Vehiculos */
  const columnasVehiculos: Columna[] = [
    { header: 'Codigo', key: 'codigo', width: 11 },
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Pago', key: 'pago', width: 8 },
    { header: 'Medio de pago', key: 'medio', width: 18 },
    { header: 'Valor', key: 'valor', width: 14, numFmt: MONEDA },
    { header: 'Entrada', key: 'entrada', width: 18, numFmt: FECHA },
    { header: 'Salida', key: 'salida', width: 18, numFmt: FECHA },
    { header: 'Permanencia', key: 'permanencia', width: 15 },
    { header: 'Registro la entrada', key: 'entradaPor', width: 22 },
    { header: 'Cobro', key: 'cobro', width: 22 },
  ];
  definirColumnas(vehiculos, columnasVehiculos);
  const filaCabeceraVehiculos = bandaDeTitulo(vehiculos, {
    titulo: 'Vehiculos del periodo',
    subtitulo: `${lot.name} · ${periodo} · Fuente: sistema del parqueadero`,
    columnas: columnasVehiculos.length,
  });
  encabezadoDeColumnas(vehiculos, filaCabeceraVehiculos, columnasVehiculos);

  const filas = tickets?.ok ? tickets.data : [];
  let adentro = 0;
  let salieron = 0;
  let pagados = 0;
  let sinPagar = 0;
  let anulados = 0;
  let recaudado = 0;

  filas.forEach((ticket, indice) => {
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

    const fila = vehiculos.addRow({
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
    vestirFila(fila, indice, columnasVehiculos.length);

    // Lo que importa de un vistazo: pagado en verde, sin pagar en rojo, anulado
    // tachado. Quien revisa el reporte busca justo eso y no quiere leer fila a fila.
    fila.getCell('pago').font = {
      name: FUENTE,
      size: 10,
      bold: true,
      color: { argb: pago ? COLOR.verde : COLOR.rojo },
    };
    if (ticket.cancelled) {
      fila.getCell('estado').font = {
        name: FUENTE,
        size: 10,
        color: { argb: COLOR.rojo },
        strike: true,
      };
    }
  });

  if (!tickets?.ok) {
    const aviso = vehiculos.addRow({
      codigo: 'No fue posible consultar el sistema del parqueadero para este periodo.',
    });
    aviso.getCell(1).font = { name: FUENTE, size: 10, italic: true, color: { argb: COLOR.rojo } };
  } else if (filas.length > 0) {
    filaDeTotales(
      vehiculos,
      { codigo: `${filas.length} vehiculos`, pago: `${pagados}`, valor: recaudado },
      columnasVehiculos.length,
    ).getCell('valor').numFmt = MONEDA;
  }
  listaParaImprimir(vehiculos, filaCabeceraVehiculos);

  /* ----------------------------------------------------- Pagos del kiosco */
  const columnasKiosco: Columna[] = [
    { header: 'Fecha', key: 'fecha', width: 18, numFmt: FECHA },
    { header: 'Kiosco', key: 'kiosco', width: 18 },
    { header: 'Codigo', key: 'codigo', width: 11 },
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 13 },
    { header: 'Entrada', key: 'entrada', width: 18, numFmt: FECHA },
    { header: 'Permanencia', key: 'permanencia', width: 15 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Documento', key: 'documento', width: 15 },
    { header: 'Valor', key: 'valor', width: 14, numFmt: MONEDA },
    { header: 'Estado', key: 'estado', width: 13 },
    { header: 'Tarjeta', key: 'tarjeta', width: 18 },
    { header: 'Autorizacion', key: 'autorizacion', width: 14 },
    { header: 'Recibo', key: 'recibo', width: 12 },
    { header: 'Referencia', key: 'referencia', width: 14 },
    { header: 'Factura', key: 'factura', width: 16 },
  ];
  definirColumnas(kiosco, columnasKiosco);
  const filaCabeceraKiosco = bandaDeTitulo(kiosco, {
    titulo: 'Pagos con tarjeta en el kiosco',
    subtitulo: `${lot.name} · ${periodo} · Fuente: Quikly Parking`,
    columnas: columnasKiosco.length,
  });
  encabezadoDeColumnas(kiosco, filaCabeceraKiosco, columnasKiosco);

  let aprobadosKiosco = 0;
  let recaudadoKiosco = 0;
  pagos.forEach((pago, indice) => {
    if (pago.status === 'APPROVED') {
      aprobadosKiosco += 1;
      recaudadoKiosco += pago.amount;
    }
    const fila = kiosco.addRow({
      fecha: enBogota(pago.resolvedAt ?? pago.createdAt),
      kiosco: pago.paymentPoint?.name ?? '',
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
    vestirFila(fila, indice, columnasKiosco.length);
    fila.getCell('estado').font = {
      name: FUENTE,
      size: 10,
      bold: pago.status === 'APPROVED',
      color: { argb: pago.status === 'APPROVED' ? COLOR.verde : COLOR.rojo },
    };
  });

  if (pagos.length > 0) {
    filaDeTotales(
      kiosco,
      { fecha: `${pagos.length} cobros`, estado: `${aprobadosKiosco} aprobados`, valor: recaudadoKiosco },
      columnasKiosco.length,
    ).getCell('valor').numFmt = MONEDA;
  }
  listaParaImprimir(kiosco, filaCabeceraKiosco);

  /* -------------------------------------------------------------- Resumen */
  portadaDelResumen(resumen, {
    // El cast es por los tipos de ExcelJS, que declaran su propio `Buffer` y no
    // el de Node; los bytes son los mismos.
    logo: logo
      ? libro.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' })
      : null,
    parqueadero: lot.name,
    razonSocial: lot.legalName,
    nit: lot.nit,
    periodo,
    generado,
  });

  const cifra = (dato: string, valor: string | number, moneda = false) => {
    const fila = resumen.addRow({ dato, valor });
    fila.getCell('dato').font = { name: FUENTE, size: 11, color: { argb: COLOR.textoSuave } };
    fila.getCell('valor').font = { name: FUENTE, size: 11, bold: true, color: { argb: COLOR.texto } };
    fila.getCell('valor').alignment = { horizontal: 'right' };
    fila.height = 20;
    if (moneda) fila.getCell('valor').numFmt = MONEDA;
    return fila;
  };

  const seccion = (titulo: string) => {
    resumen.addRow({});
    const fila = resumen.addRow({ dato: titulo.toUpperCase() });
    fila.getCell('dato').font = {
      name: FUENTE,
      size: 10,
      bold: true,
      color: { argb: COLOR.marca },
    };
    fila.getCell('dato').border = { bottom: { style: 'thin', color: { argb: COLOR.marca } } };
    fila.getCell('valor').border = { bottom: { style: 'thin', color: { argb: COLOR.marca } } };
    fila.height = 20;
  };

  seccion('El parqueadero en el periodo');
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

  seccion('Kiosco de pago con tarjeta');
  cifra('Cobros iniciados', pagos.length);
  cifra('Pagos aprobados', aprobadosKiosco);
  cifra('Recaudado en el kiosco', recaudadoKiosco, true);

  resumen.addRow({});
  const nota = resumen.addRow({
    dato: 'Los valores del kiosco salen de Quikly Parking; los del parqueadero, de su propio sistema.',
  });
  nota.getCell('dato').font = { name: FUENTE, size: 9, italic: true, color: { argb: COLOR.textoSuave } };

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-${lot.slug}-${desde}_${hasta}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Portada de la hoja Resumen: franja de marca con el logo y la ficha del
 * parqueadero. Es lo primero que se ve al abrir el archivo y lo que queda
 * arriba al imprimirlo.
 */
function portadaDelResumen(
  hoja: ExcelJS.Worksheet,
  datos: {
    logo: number | null;
    parqueadero: string;
    razonSocial: string | null;
    nit: string | null;
    periodo: string;
    generado: string;
  },
) {
  definirColumnas(hoja, [
    { header: 'Dato', key: 'dato', width: 42 },
    { header: 'Valor', key: 'valor', width: 30 },
  ]);

  // Franja oscura de cabecera (filas 1 a 5) con el logo blanco encima.
  for (let fila = 1; fila <= 5; fila += 1) {
    ['A', 'B'].forEach((columna) => {
      hoja.getCell(`${columna}${fila}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR.marcaFondo },
      };
    });
    hoja.getRow(fila).height = 18;
  }

  if (datos.logo !== null) {
    hoja.addImage(datos.logo, {
      tl: { col: 0.35, row: 0.7 },
      ext: { width: 176, height: 60 },
      editAs: 'oneCell',
    });
  } else {
    hoja.mergeCells('A2:A3');
    const marca = hoja.getCell('A2');
    marca.value = 'QUIKLY PARKING';
    marca.font = { name: FUENTE, size: 16, bold: true, color: { argb: COLOR.blanco } };
    marca.alignment = { vertical: 'middle', indent: 1 };
  }

  hoja.mergeCells('B2:B3');
  const titulo = hoja.getCell('B2');
  titulo.value = 'Reporte de operacion';
  titulo.font = { name: FUENTE, size: 14, bold: true, color: { argb: COLOR.blanco } };
  titulo.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

  // Filo ambar de la linea Parking.
  ['A6', 'B6'].forEach((celda) => {
    hoja.getCell(celda).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR.ambar },
    };
  });
  hoja.getRow(6).height = 5;
  hoja.getRow(7).height = 8;

  const ficha: [string, string][] = [
    ['Parqueadero', datos.parqueadero],
    ...(datos.razonSocial ? ([['Razon social', datos.razonSocial]] as [string, string][]) : []),
    ...(datos.nit ? ([['NIT', datos.nit]] as [string, string][]) : []),
    ['Periodo', datos.periodo],
    ['Generado', datos.generado],
  ];

  for (const [etiqueta, valor] of ficha) {
    const fila = hoja.addRow({ dato: etiqueta, valor });
    fila.getCell('dato').font = { name: FUENTE, size: 11, color: { argb: COLOR.textoSuave } };
    fila.getCell('valor').font = { name: FUENTE, size: 11, bold: true, color: { argb: COLOR.texto } };
    fila.getCell('valor').alignment = { horizontal: 'right' };
    fila.height = 20;
  }

  hoja.pageSetup = {
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
  };
  hoja.headerFooter = { oddFooter: '&LQuikly Parking&R&D' };
}
