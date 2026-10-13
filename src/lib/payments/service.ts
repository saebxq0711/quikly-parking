import { randomBytes as bytesAleatorios } from 'node:crypto';
import type {
  Customer,
  Payment,
  PaymentStatus,
  TerminalStage,
  VehicleType,
} from '@prisma/client';
import { db } from '../db';
import { AppError, scrubSecrets } from '../errors';
import { AuditAction, recordAudit } from '../audit';
import {
  attachPaymentToKey,
  buildProviderTransactionId,
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from '../idempotency';
import type { CurrentUser } from '../auth/guards';
import {
  recognizeSearchTerm,
  type SearchTerm,
} from '@/integrations/nova-parking/vehicle-types';
import { getVehicleRule, novaClientFor } from '../parking/config';
import { redebanClientFor } from '../parking/redeban';
import { isSipTransient, type SipConnectorClient } from '@/integrations/sipconnector/client';
import type { CompraInput, SipTransactionResult } from '@/integrations/sipconnector/codec';
import type { OperablePoint } from '../parking/payment-point';
import type { NovaCheckout } from '@/integrations/nova-parking/types';
import { declineReason, maskCard } from '@/integrations/sipconnector/codec';
import {
  vehicleTypeIdForConfirm,
  vehicleTypeIdForQuote,
} from '@/lib/parking/nova-vehicle-types';
import { SIP_CODE, describeSipFailure } from '@/integrations/sipconnector/codes';
import { invoiceAbandonedPayments } from '../billing/service';
import { enSegundoPlano } from '../background';

/**
 * Orquestacion del cobro (CLAUDE.md secciones 15, 16 y 23).
 *
 * COMO FUNCIONA
 * -------------
 *  1. El vehiculo y el valor a cobrar los entrega el sistema del parqueadero.
 *     Las tarifas son suyas y esta plataforma no las calcula ni las ajusta.
 *  2. El cobro lo ejecuta esta plataforma contra SIPConnector (Redeban),
 *     enviando la trama del Anexo 1.1 al datafono del punto de pago.
 *  3. El datafono esta conectado por SERIAL y no cobra solo: la orden queda
 *     puesta y el cliente tiene que iniciarla en el aparato. Por eso el estado
 *     se sigue paso a paso (Cod:00 esperando, Cod:01 iniciada, Cod:02 leyendo
 *     tarjeta) y se le va diciendo al operador que esta pasando.
 *  4. Cuando la red aprueba, se le avisa al sistema del parqueadero para que
 *     registre el pago y libere el vehiculo, y se dispara la facturacion.
 *
 * El datafono es exclusivo de este punto de pago: el kiosco esta a la salida
 * del parqueadero con su propia pantalla y su propio aparato. El sistema del
 * parqueadero no cobra ni comparte terminal, solo aporta el tiquete y la tarifa
 * y recibe la confirmacion.
 *
 * Un cobro aprobado por la red pero no confirmado al parqueadero NO se pierde:
 * queda marcado para reintento y visible en la administracion. El dinero ya se
 * cobro; fingir que no seria peor.
 */

/**
 * Minutos que la orden sigue vigente en el datafono (campo Vigencia, Anexo 1).
 * Pasado ese tiempo el aparato rechaza la solicitud por datos vencidos.
 */
const TERMINAL_VALIDITY_MINUTES = 5;

/**
 * Regla 3 de la guia de certificacion de Redeban: si el cliente nunca opera el
 * datafono, el POS corta la espera a los 3 minutos y BORRA la orden en SIP, para
 * que nadie pueda cobrarla despues (pago fantasma).
 */
const POS_TIMEOUT_MS = 3 * 60_000;

/**
 * Iniciada en el datafono pero sin resultado (el aparato se reinicio a mitad: SIP
 * queda en Cod:02 para siempre). Pasada la vigencia y un margen, se cierra. Si el
 * datafono aprobara despues, la conciliacion lo recupera (`conciliarCobrosCerrados`).
 */
const STARTED_TIMEOUT_MS = (TERMINAL_VALIDITY_MINUTES + 1) * 60_000;

/**
 * Regla 2 (Anexo 3): nunca consultar `Respuesta` de una operacion mas seguido que
 * cada 3 segundos. Consultar mas rapido BLOQUEA la terminal.
 */
const MIN_CONSULTA_MS = 3_000;

/**
 * Ultimo recurso: un cobro que no se pudo ni consultar (la nube de SIP caida) se
 * cierra a los 20 minutos. Normalmente lo cierran los topes de arriba.
 */
const STALE_PAYMENT_MS = 20 * 60_000;

/** Estados de un cobro vivo: ocupan el datafono de su kiosco. */
const LIVE_STATUSES: PaymentStatus[] = ['PENDING', 'INITIATED', 'IN_PROGRESS'];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Estados de los que un pago ya no se mueve. */
const TERMINAL_STATUSES: PaymentStatus[] = [
  'APPROVED',
  'DECLINED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'REFUNDED',
];

export function isFinalStatus(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/* ------------------------------------------------------------- Consulta */

export interface VehicleLookupResult {
  found: boolean;
  ticketId: string | null;
  /**
   * Codigo del tiquete. Es lo unico que se le muestra al cliente cuando el
   * vehiculo no tiene placa: el `ticketId` es el autoincremental de Nova
   * Parking y es secuencial, asi que enseñarlo permitiria deducir el de otro.
   */
  code: string | null;
  plate: string | null;
  vehicleTypeLabel: string | null;
  entryAt: string | null;
  minutes: number | null;
  customerName: string | null;
  amount: number | null;
  alreadyPaid: boolean;
  notice: string | null;
  /**
   * Ruta de la foto de entrada dentro del sistema del parqueadero. El kiosco la
   * pide por `/api/pos/foto`, que es quien tiene el token del tunel.
   */
  photo: string | null;
}

/**
 * Busca el vehiculo y obtiene el valor a cobrar en un solo paso.
 * El monto SIEMPRE viene del sistema del parqueadero.
 */
/**
 * Busca el tiquete segun lo que se reconocio.
 *
 * - Placa: en la ruta configurada para el tipo (la del carro), como siempre.
 * - Numero del QR o codigo: primero `find-ticket/car/`, que desde el 2026-10-10 los
 *   busca sin filtrar por tipo (un numero de tiquete identifica UN vehiculo, sea carro,
 *   moto o "Por Definir"). Si no aparece, las rutas de codigo de siempre: la del tipo
 *   elegido y la otra (`bike` encuentra los "Por Definir", `moto` los ya tipados).
 * Sin riesgo de cruzar vehiculos: numero y codigo son unicos en su sistema, y toda
 * busqueda va con `exact=true`.
 */
async function findTicketForTerm(
  client: Awaited<ReturnType<typeof novaClientFor>>,
  config: { searchSegment: string; searchQuery: string | null },
  termino: SearchTerm,
) {
  if (termino.kind === 'PLATE') {
    return client.findTicket(config.searchSegment, termino.value, config.searchQuery);
  }

  const rutas = ['car', config.searchSegment, config.searchSegment === 'bike' ? 'moto' : 'bike'];
  for (const ruta of [...new Set(rutas)]) {
    const ticket = await client.findTicket(
      ruta,
      termino.value,
      ruta === config.searchSegment ? config.searchQuery : null,
    );
    if (ticket) return ticket;
  }
  return null;
}

export async function lookupVehicle(params: {
  user: CurrentUser;
  parkingLotId: string;
  vehicleType: VehicleType;
  identifier: string;
}): Promise<VehicleLookupResult> {
  const config = await getVehicleRule(params.parkingLotId, params.vehicleType);
  const termino = recognizeSearchTerm(params.identifier, config.identifierKind);

  if (!termino) {
    // El nombre del dato sale de la configuracion del sitio ("Placa del
    // vehiculo", "Codigo del tiquete"), para que el mensaje coincida con lo que
    // el cliente acaba de leer en pantalla.
    throw new AppError('VALIDATION', {
      publicMessage: `${config.inputLabel}: revisa el dato ingresado.`,
    });
  }

  const client = await novaClientFor(params.parkingLotId);

  await recordAudit({
    action: AuditAction.VEHICLE_SEARCH,
    actorId: params.user.id,
    parkingLotId: params.parkingLotId,
    metadata: { vehicleType: params.vehicleType, identifier: termino.value, forma: termino.kind },
  });

  const ticket = await findTicketForTerm(client, config, termino);

  if (!ticket) {
    return {
      found: false,
      ticketId: null,
      code: null,
      plate: null,
      vehicleTypeLabel: null,
      entryAt: null,
      minutes: null,
      customerName: null,
      amount: null,
      alreadyPaid: false,
      notice: `No encontramos un ingreso activo con ese dato (${config.inputLabel.toLowerCase()}). Verifica e intenta de nuevo.`,
      photo: null,
    };
  }

  /*
    Ya se cobro en este kiosco y el parqueadero no lo registro: se muestra como pagado
    (no se puede volver a cobrar) y se reintenta el aviso en segundo plano.
  */
  const sinRegistrar = await unregisteredApprovedPayment(params.parkingLotId, ticket.id);
  if (sinRegistrar) {
    if (sinRegistrar.parkingConfirmStatus === 'PENDING') {
      enSegundoPlano(() => confirmToParkingSystem(sinRegistrar).catch(() => undefined));
    }
    return {
      found: true,
      ticketId: ticket.id,
      code: ticket.code,
      plate: ticket.plate,
      vehicleTypeLabel: ticket.vehicleTypeLabel,
      entryAt: ticket.entryAt,
      minutes: ticket.minutes,
      customerName: ticket.customerName,
      amount: null,
      alreadyPaid: true,
      notice:
        'Este tiquete ya se pago en el kiosco. Si la barrera no abre, acercate a la oficina del parqueadero con tu comprobante.',
      photo: ticket.photo,
    };
  }

  /*
    Con que tipo se cotiza. El carro va por placa y ya entro tipado: sin tipo. Sin placa,
    si el tiquete ya tiene tipo se usa el valor que trae el parqueadero tal cual (y solo
    si el cliente eligio ese tipo); si esta "Por Definir", se cotiza con el tipo elegido.
  */
  // Por placa es un carro que ya entro tipado. Por QR, numero o codigo puede ser
  // cualquier vehiculo, "Por Definir" incluido: se cotiza con el tipo elegido.
  const vehicleTypeId =
    termino.kind === 'PLATE'
      ? null
      : await vehicleTypeIdForQuote(client, params.parkingLotId, ticket.id, params.vehicleType);

  let checkout: NovaCheckout;
  try {
    checkout = await client.getCheckout(ticket.id, vehicleTypeId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      return {
        found: false,
        ticketId: ticket.id,
        code: ticket.code,
        plate: ticket.plate,
        vehicleTypeLabel: ticket.vehicleTypeLabel,
        entryAt: ticket.entryAt,
        minutes: ticket.minutes,
        customerName: ticket.customerName,
        amount: null,
        alreadyPaid: false,
        notice: 'No fue posible obtener el valor a cobrar para este tiquete.',
        photo: ticket.photo,
      };
    }
    throw error;
  }

  return {
    found: true,
    ticketId: checkout.ticket.id,
    code: checkout.ticket.code ?? ticket.code,
    plate: checkout.ticket.plate ?? ticket.plate,
    vehicleTypeLabel: checkout.ticket.vehicleTypeLabel ?? ticket.vehicleTypeLabel,
    entryAt: checkout.ticket.entryAt ?? ticket.entryAt,
    minutes: checkout.ticket.minutes ?? ticket.minutes,
    customerName: checkout.ticket.customerName ?? ticket.customerName,
    amount: checkout.amount,
    alreadyPaid: checkout.alreadyPaid,
    notice: checkout.alreadyPaid
      ? 'Este tiquete ya fue pagado. No corresponde cobrarlo de nuevo.'
      : null,
    // `pay-checkout` no devuelve la foto; la trae la busqueda.
    photo: checkout.ticket.photo ?? ticket.photo,
  };
}

/* --------------------------------------------------------- Inicio del cobro */

export interface StartPaymentInput {
  user: CurrentUser;
  parkingLotId: string;
  paymentPoint: OperablePoint;
  /** Cliente que paga, si se identifico en el kiosco. */
  customer: Customer | null;
  vehicleType: VehicleType;
  identifier: string;
  ticketId: string;
  idempotencyKey: string;
  /**
   * Valor que el cliente vio y acepto en pantalla. Si el del parqueadero ya es otro
   * (la tarifa siguio corriendo), no se cobra: se le muestra el nuevo total.
   */
  expectedAmount?: number;
}

/**
 * Inicia un cobro con tarjeta contra el datafono.
 *
 * El monto NUNCA se toma de la peticion del navegador: se vuelve a consultar al
 * sistema del parqueadero justo antes de cobrar.
 */
export async function startCardPayment(
  input: StartPaymentInput,
): Promise<Payment> {
  const claim = await claimIdempotencyKey(
    input.idempotencyKey,
    `payment:${input.parkingLotId}`,
  );

  if (!claim.isNew) {
    if (claim.paymentId) {
      const existing = await db.payment.findUnique({
        where: { id: claim.paymentId },
      });
      if (existing) return existing;
    }
    throw new AppError('CONFLICT', {
      publicMessage:
        'Ya hay un cobro en proceso para esta operacion. Espera el resultado.',
    });
  }

  try {
    const config = await getVehicleRule(input.parkingLotId, input.vehicleType);
    const lot = await db.parkingLot.findUniqueOrThrow({
      where: { id: input.parkingLotId },
      select: { id: true, name: true },
    });

    const nova = await novaClientFor(input.parkingLotId);

    /*
      Este es el monto que se le cobra al datafono: sale igual que el que se le mostro.
      "Por Definir" se cotiza con el tipo elegido (sin tipo se cobraria como moto); un
      tiquete con tipo definido, con el valor que ya trae el parqueadero. La validacion
      se repite aqui: el cobro no depende de que la pantalla haya buscado antes.
    */
    // Se reconoce igual que en la busqueda: lo cotizado aqui es lo que se mostro.
    const termino = recognizeSearchTerm(input.identifier, config.identifierKind);
    if (!termino) {
      throw new AppError('VALIDATION', {
        publicMessage: `${config.inputLabel}: revisa el dato ingresado.`,
      });
    }
    const vehicleTypeId =
      termino.kind === 'PLATE'
        ? null
        : await vehicleTypeIdForQuote(nova, input.parkingLotId, input.ticketId, input.vehicleType);
    const checkout = await nova.getCheckout(input.ticketId, vehicleTypeId);

    if (checkout.alreadyPaid) {
      throw new AppError('CONFLICT', {
        publicMessage: 'Este tiquete ya fue pagado.',
      });
    }
    if (checkout.amount <= 0) {
      throw new AppError('VALIDATION', {
        publicMessage: 'Este tiquete no tiene un valor pendiente por cobrar.',
      });
    }

    /*
      La tarifa sigue corriendo mientras el cliente lee la pantalla o llena sus datos.
      Se cobra lo que dice el sistema del parqueadero AHORA, pero nunca un valor
      distinto del que el cliente acaba de aceptar: si cambio, no se toca el datafono
      y la pantalla le muestra el nuevo total para que confirme otra vez.

      Una vez enviado al datafono el valor queda fijo. Si la tarifa sube mientras pasa
      la tarjeta, al parqueadero se le confirma el valor cobrado: su
      `confirmar-externo` registra el monto que recibe (solo exige que sea mayor a 0).
    */
    if (input.expectedAmount !== undefined && checkout.amount !== input.expectedAmount) {
      throw new AppError('CONFLICT', {
        publicMessage: `El valor se actualizo a $ ${checkout.amount.toLocaleString('es-CO')} porque paso mas tiempo. Revisa el nuevo total y toca Pagar de nuevo.`,
        detail: { expectedAmount: input.expectedAmount, amount: checkout.amount },
      });
    }

    // Ya cobrado aqui y sin registrar en el parqueadero: nunca se cobra dos veces.
    if (await unregisteredApprovedPayment(lot.id, input.ticketId)) {
      throw new AppError('CONFLICT', {
        publicMessage:
          'Este tiquete ya se pago en el kiosco. Si la barrera no abre, acercate a la oficina del parqueadero.',
      });
    }

    /*
      Regla 13: el kiosco tiene que tener SU datafono configurado. Se comprueba antes
      de crear el pago: sin datafono no hay a donde enviarlo, y un pago creado para
      fallar enseguida solo ensucia el historial.
    */
    const redeban = await redebanClientFor(lot.id, input.paymentPoint.id);

    // Cobros de este kiosco cerrados por tiempo: si el datafono alcanzo a aprobar
    // alguno, se recupera (ver `conciliarCobrosCerrados`).
    enSegundoPlano(() =>
      conciliarCobrosCerrados(input.paymentPoint.id).catch((error) =>
        console.error('[payments] fallo la conciliacion de cobros cerrados', { error }),
      ),
    );

    /*
      Regla 8, la unica que Redeban pidio corregir en su certificacion: NUNCA dos
      operaciones a la vez en el mismo datafono. SIP no lo impide —acepta la segunda
      con Cod:00 y el datafono cancela la primera—, asi que el control es de este
      servidor: un cobro vivo por kiosco (cada kiosco tiene su datafono) y uno por
      tiquete.

      Primero se pone al dia el que haya (puede estar vencido y cerrarse ahora);
      despues, con el candado del kiosco, se vuelve a mirar y se crea en la misma
      transaccion: dos peticiones al mismo tiempo no pueden crear dos cobros.
    */
    const ocupan = {
      status: { in: LIVE_STATUSES },
      OR: [
        { paymentPointId: input.paymentPoint.id },
        { parkingLotId: lot.id, externalTicketId: input.ticketId },
      ],
    };
    const previo = await db.payment.findFirst({ where: ocupan, orderBy: { createdAt: 'desc' } });
    if (previo) await refreshPaymentStatus(previo.id);

    const providerTransactionId = buildProviderTransactionId();
    const reserva = await db.$transaction(async (tx) => {
      // Candado por kiosco, solo mientras dura esta transaccion (sirve con pgbouncer).
      const llave = `cobro:${input.paymentPoint.id}`;
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${llave}))) AS candado`;

      const vivo = await tx.payment.findFirst({ where: ocupan, orderBy: { createdAt: 'desc' } });
      if (vivo) return { vivo, creado: null };

      const creado = await tx.payment.create({
        data: {
          parkingLotId: lot.id,
          paymentPointId: input.paymentPoint.id,
          userId: input.user.id,
          vehicleType: input.vehicleType,
          vehicleIdentifier: termino.value,
          /*
            La forma REAL con que se encontro, no la del tipo elegido: al confirmar, un
            tiquete que no se encontro por placa (QR de un "Por Definir") manda el tipo
            elegido para que el parqueadero lo deje tipado.
          */
          identifierKind: termino.kind,
          plate: checkout.ticket.plate,
          externalTicketId: input.ticketId,
          // Para el comprobante: el cliente se lleva su codigo, entrada y permanencia.
          ticketCode: checkout.ticket.code,
          entryAt:
            checkout.ticket.entryAt && !Number.isNaN(Date.parse(checkout.ticket.entryAt))
              ? new Date(checkout.ticket.entryAt)
              : null,
          stayMinutes:
            checkout.ticket.minutes !== null ? Math.round(checkout.ticket.minutes) : null,
          /*
            Los datos del cliente los da el propio cliente en el kiosco; el
            sistema del parqueadero solo se usa como respaldo si no se identifico.
            La copia queda desnormalizada porque es el soporte de la factura: si
            el cliente cambia sus datos manana, la factura ya emitida no cambia.
          */
          customerId: input.customer?.id ?? null,
          customerName: input.customer
            ? [input.customer.firstName, input.customer.lastName]
                .filter(Boolean)
                .join(' ')
            : checkout.ticket.customerName,
          customerDocument:
            input.customer?.identification ?? checkout.ticket.customerDocument,
          amount: checkout.amount,
          method: 'CARD',
          status: 'PENDING',
          terminalStage: 'WAITING_TERMINAL',
          providerTransactionId,
          // Token del enlace del comprobante. 24 bytes aleatorios: el enlace es
          // publico y abre datos de un pago real, asi que no puede adivinarse.
          receiptToken: bytesAleatorios(24).toString('base64url'),
        },
      });
      return { vivo: null, creado };
    });

    if (reserva.vivo) {
      const vivo = reserva.vivo;
      // El mismo cobro (mismo tiquete, este kiosco): la pantalla recargada o un reintento.
      if (vivo.paymentPointId === input.paymentPoint.id && vivo.externalTicketId === input.ticketId) {
        await attachPaymentToKey(input.idempotencyKey, vivo.id);
        return vivo;
      }
      throw new AppError('CONFLICT', {
        publicMessage:
          vivo.paymentPointId === input.paymentPoint.id
            ? 'El datafono esta procesando otro pago. Espera a que termine e intenta de nuevo.'
            : 'Este tiquete ya se esta cobrando en otro punto de pago.',
        detail: { cobroVivo: vivo.id },
      });
    }

    const payment = reserva.creado as Payment;
    await attachPaymentToKey(input.idempotencyKey, payment.id);

    await recordAudit({
      action: AuditAction.PAYMENT_START,
      actorId: input.user.id,
      parkingLotId: lot.id,
      entity: 'Payment',
      entityId: payment.id,
      metadata: {
        amount: checkout.amount,
        ticketId: input.ticketId,
        providerTransactionId,
        paymentPoint: input.paymentPoint.code,
      },
    });

    return await enviarAlDatafono(
      payment,
      redeban,
      {
        amount: checkout.amount,
        invoiceNumber: providerTransactionId,
        cashierCode: input.paymentPoint.cashierCode ?? 'CAJA',
        boxNumber: input.paymentPoint.boxNumber ?? input.paymentPoint.code,
        receiptNumber: input.ticketId.slice(0, 10),
        validityMinutes: TERMINAL_VALIDITY_MINUTES,
        // `N` para que una operacion rechazada se limpie sola y el datafono
        // quede libre para reintentar con una orden nueva.
        persist: 'N',
      },
      input.user.id,
    );
  } catch (error) {
    await releaseIdempotencyKey(input.idempotencyKey);
    throw error;
  }
}

type OrdenDeCompra = Omit<CompraInput, 'terminalCode' | 'merchantCode'>;
type ConsultaSip = Awaited<ReturnType<SipConnectorClient['respuesta']>>;

/**
 * Deja la orden en la nube de SIP (EnviarDatos) y registra como quedo.
 */
async function enviarAlDatafono(
  payment: Payment,
  redeban: SipConnectorClient,
  orden: OrdenDeCompra,
  actorId: string,
): Promise<Payment> {
  let id = payment.providerTransactionId as string;
  let sent: Awaited<ReturnType<SipConnectorClient['enviarCompra']>>;

  try {
    sent = await redeban.enviarCompra(id, orden);

    // Cod:09: el Id ya existia en SIP (un choque improbable). Uno nuevo, una sola vez.
    if (sent.code === SIP_CODE.TRANSACCION_DUPLICADA) {
      id = buildProviderTransactionId();
      await db.payment.update({ where: { id: payment.id }, data: { providerTransactionId: id } });
      sent = await redeban.enviarCompra(id, { ...orden, invoiceNumber: id });
    }
  } catch (error) {
    // Sin respuesta de la nube aun reintentando: no se sabe si la orden quedo alla.
    if (isSipTransient(error)) {
      return envioIncierto({ ...payment, providerTransactionId: id }, redeban);
    }
    const message =
      error instanceof AppError ? error.publicMessage : 'No fue posible iniciar el cobro.';
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', terminalStage: 'RESOLVED', resolvedAt: new Date(), failureReason: message },
    });
    await recordAudit({
      action: AuditAction.UPSTREAM_ERROR,
      actorId,
      parkingLotId: payment.parkingLotId,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { stage: 'enviarDatos' },
    });
    throw error;
  }

  if (sent.accepted) {
    return db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'INITIATED',
        terminalStage: 'WAITING_TERMINAL',
        providerCode: sent.code,
        startedAt: new Date(),
        providerRaw: scrubSecrets({ enviarDatos: sent.raw }) as object,
      },
    });
  }

  /*
    Cod:06, la terminal ya tiene otra operacion. Regla 8: NO se manda otra encima (antes
    se borraba y reenviaba, y ademas se borraba el Id nuevo, no el que la ocupaba). Si lo
    que la ocupa es una orden nuestra ya cerrada que quedo en la nube, se libera aparte.
  */
  if (sent.code === SIP_CODE.TERMINAL_OCUPADA) {
    enSegundoPlano(() =>
      liberarOrdenesCerradas(payment.paymentPointId).catch((error) =>
        console.error('[payments] no se pudieron liberar ordenes cerradas', { error }),
      ),
    );
  }

  // El cliente lee `publico`; el motivo real queda en `providerRaw` y el panel
  // de pagos lo muestra (`enviarDatosFailureFromRaw`).
  const fallo = describeSipFailure(sent.code, sent.message);
  console.warn('[payments] el datafono no recibio el cobro', {
    paymentId: payment.id,
    code: sent.code,
    motivo: fallo.motivo,
  });
  return db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'FAILED',
      terminalStage: 'RESOLVED',
      providerCode: sent.code,
      resolvedAt: new Date(),
      failureReason: fallo.publico,
      providerRaw: scrubSecrets({ enviarDatos: sent.raw }) as object,
    },
  });
}

/**
 * EnviarDatos no respondio (regla 7): no se sabe si la orden quedo en la nube.
 *
 * Darlo por fallido sin mas podia dejar una orden VIVA que el cliente pagara despues
 * (cobro fantasma) mientras el kiosco decia "no se completo". Se averigua: si no
 * llego, o se alcanza a borrar, se da por fallido; si llego o no se sabe, queda vivo y
 * el sondeo lo resuelve (a los 3 minutos sin iniciarse, la borra y lo cierra).
 */
async function envioIncierto(payment: Payment, redeban: SipConnectorClient): Promise<Payment> {
  const id = payment.providerTransactionId as string;
  const fallido = () =>
    db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        terminalStage: 'RESOLVED',
        resolvedAt: new Date(),
        failureReason: 'No fue posible comunicarse con el datafono. No se cobro nada; intenta nuevamente.',
      },
    });

  await esperar(MIN_CONSULTA_MS);
  const consulta = await redeban.respuesta(id).then((r) => r.consulta).catch(() => null);
  if (consulta?.kind === 'no_existe') return fallido();
  if (consulta?.kind === 'esperando') {
    const borrado = await redeban.borrar(id).catch(() => null);
    if (borrado?.deleted) return fallido();
  }

  console.warn('[payments] envio sin respuesta: el cobro queda vivo hasta resolverse', {
    paymentId: payment.id,
    consulta: consulta?.kind ?? 'sin respuesta',
  });
  return db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'INITIATED',
      terminalStage: 'WAITING_TERMINAL',
      startedAt: new Date(),
      providerRaw: { enviarDatos: 'sin respuesta de la nube: se sigue consultando' },
    },
  });
}

/**
 * Borra en SIP las ordenes de este kiosco que ya se cerraron aqui (no aprobadas, de
 * los ultimos 15 minutos). Es lo que libera la terminal si una quedo colgada en la
 * nube: cerrada para nosotros, pero viva alla y cobrable (regla 10).
 */
async function liberarOrdenesCerradas(paymentPointId: string | null): Promise<void> {
  if (!paymentPointId) return;
  const cerradas = await db.payment.findMany({
    where: {
      paymentPointId,
      status: { in: ['DECLINED', 'FAILED', 'TIMEOUT', 'CANCELLED'] },
      resolvedAt: { gte: new Date(Date.now() - 15 * 60_000) },
      providerTransactionId: { not: null },
    },
    orderBy: { resolvedAt: 'desc' },
    take: 5,
  });
  if (cerradas.length === 0) return;
  const redeban = await redebanClientFor(cerradas[0].parkingLotId, paymentPointId);
  for (const cobro of cerradas) {
    await redeban.borrar(cobro.providerTransactionId as string).catch(() => undefined);
  }
}

/**
 * Cobros de este kiosco cerrados POR TIEMPO en la ultima media hora: se consulta una
 * vez cada uno, y si el datafono alcanzo a aprobarlo se registra como aprobado.
 *
 * Es la red de seguridad del tope de tiempo: un cobro iniciado en el datafono que se
 * cerro sin resultado (el aparato se reinicio, la nube no respondia) pudo aprobarse
 * despues. Sin esto seria un cobro fantasma: el cliente pago y el sistema dice que no.
 */
export async function conciliarCobrosCerrados(paymentPointId: string): Promise<number> {
  const cerrados = await db.payment.findMany({
    where: {
      paymentPointId,
      status: 'TIMEOUT',
      authorizationCode: null,
      resolvedAt: { gte: new Date(Date.now() - 30 * 60_000) },
      providerTransactionId: { not: null },
    },
    orderBy: { resolvedAt: 'desc' },
    take: 5,
  });
  if (cerrados.length === 0) return 0;

  const redeban = await redebanClientFor(cerrados[0].parkingLotId, paymentPointId);
  let recuperados = 0;
  for (const cobro of cerrados) {
    const r = await redeban.respuesta(cobro.providerTransactionId as string).catch(() => null);
    if (r?.consulta.kind === 'resuelta' && r.consulta.result.approved) {
      console.error('[payments] cobro cerrado por tiempo que el datafono SI aprobo: se recupera', {
        paymentId: cobro.id,
      });
      await aplicarResultado(cobro, redeban, r.code, r.raw, r.consulta.result);
      recuperados += 1;
    }
  }
  return recuperados;
}

/* -------------------------------------------------------- Estado del cobro */

/**
 * Consulta el datafono y actualiza el pago.
 *
 * Reglas de la guia de certificacion de Redeban que se cumplen aqui:
 *  - 2: nunca mas de una consulta cada 3 s por operacion, aunque la pidan a la vez
 *       el sondeo, otra pestana, la recuperacion del kiosco y la cancelacion.
 *  - 3: sin iniciarse a los 3 min, se borra en SIP y se cierra.
 *  - 6: solo un resultado completo es un pago; lo incierto se sigue esperando.
 *  - 7: un fallo puntual de la nube nunca cambia el estado.
 *  - 10: lo rechazado, vencido o fallido se borra en SIP.
 *  - 11: un pago ya resuelto se responde desde la base, sin consultar SIP.
 */
export async function refreshPaymentStatus(paymentId: string): Promise<Payment> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (isFinalStatus(payment.status)) return payment;

  const transactionId = payment.providerTransactionId;
  if (!transactionId) {
    return db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        terminalStage: 'RESOLVED',
        resolvedAt: new Date(),
        failureReason: 'El cobro no llego a enviarse al datafono.',
      },
    });
  }

  /*
    Turno de consulta (regla 2). La fecha de actualizacion del pago es la de su ultima
    consulta: si fue hace menos de 3 s, se responde lo que hay. Y el turno se toma con
    una escritura condicionada: si dos peticiones llegan a la vez, solo una consulta.
  */
  if (Date.now() - payment.updatedAt.getTime() < MIN_CONSULTA_MS) return payment;
  const turno = await db.payment.updateMany({
    where: { id: payment.id, updatedAt: payment.updatedAt, status: { in: LIVE_STATUSES } },
    data: { updatedAt: new Date() },
  });
  if (turno.count === 0) return db.payment.findUniqueOrThrow({ where: { id: payment.id } });

  let redeban: SipConnectorClient;
  let consulta: ConsultaSip;
  try {
    redeban = await redebanClientFor(payment.parkingLotId, payment.paymentPointId);
    consulta = await redeban.respuesta(transactionId);
  } catch (error) {
    // Un fallo de consulta NO resuelve el pago: sigue vivo y se reintenta (regla 7).
    console.error('[payments] no se pudo consultar el datafono', { paymentId, error });
    return expireIfStale(payment);
  }

  return aplicarConsulta(payment, redeban, consulta);
}

/** Aplica lo que respondio `Respuesta` (ya interpretado por `classifyRespuesta`). */
async function aplicarConsulta(
  payment: Payment,
  redeban: SipConnectorClient,
  r: ConsultaSip,
): Promise<Payment> {
  const c = r.consulta;
  const desde = Date.now() - (payment.startedAt ?? payment.createdAt).getTime();
  const yaIniciado = payment.terminalStage === 'STARTED' || payment.terminalStage === 'READING_CARD';

  switch (c.kind) {
    case 'esperando':
    case 'iniciada':
    case 'leyendo': {
      const enDatafono = c.kind !== 'esperando';
      const updated = await db.payment.update({
        where: { id: payment.id },
        data: {
          status: enDatafono ? 'IN_PROGRESS' : 'INITIATED',
          terminalStage:
            c.kind === 'leyendo' ? 'READING_CARD' : enDatafono ? 'STARTED' : 'WAITING_TERMINAL',
          providerCode: r.code,
          // Cod:02 entrega BIN, tipo de cuenta y franquicia mientras el cliente
          // decide en el aparato: se muestran para que vea que va avanzando.
          ...(c.kind === 'leyendo' ? readingFields(c.lectura) : {}),
        },
      });
      if (!enDatafono && desde > POS_TIMEOUT_MS) {
        return vencerPorTiempo(updated, redeban, false, r);
      }
      if (enDatafono && desde > STARTED_TIMEOUT_MS) {
        return vencerPorTiempo(updated, redeban, true, r);
      }
      return updated;
    }

    case 'no_existe':
    case 'incierta': {
      /*
        Regla 6: no se sabe (un Cod:00 corto, un Cod:99 desconocido, un timeout de la
        nube, o la orden aun no aparece). Se sigue esperando: cortar aqui puede dejar
        un pago aprobado que el sistema dio por fallido. Solo el tiempo lo cierra.
      */
      if (c.kind === 'incierta') {
        console.warn('[payments] respuesta incierta del datafono: se sigue esperando', {
          paymentId: payment.id,
          mensaje: c.mensaje.slice(0, 160),
        });
      }
      if (desde > (yaIniciado ? STARTED_TIMEOUT_MS : POS_TIMEOUT_MS)) {
        return vencerPorTiempo(payment, redeban, yaIniciado, r);
      }
      return payment;
    }

    case 'vencida':
      await borrarSinFallar(redeban, payment.providerTransactionId);
      return resolvePayment(payment, {
        status: 'TIMEOUT',
        code: r.code,
        reason: 'La vigencia del cobro en el datafono se agoto. No se cobro nada.',
        raw: r.raw,
      });

    case 'error':
      await borrarSinFallar(redeban, payment.providerTransactionId);
      return resolvePayment(payment, {
        status: 'FAILED',
        code: r.code,
        reason: describeSipFailure(r.code, c.mensaje).publico,
        raw: r.raw,
      });

    case 'resuelta':
      return aplicarResultado(payment, redeban, r.code, r.raw, c.result);
  }
}

/**
 * Se acabo el tiempo del POS: se borra la orden en SIP y se cierra el cobro.
 *
 * Que dice Borrar decide (regla 10):
 *  - `Cod:00`: estaba esperando y ya no se puede cobrar. Se cierra.
 *  - `Cod:18`: ya se resolvio. NO se cierra: la siguiente consulta trae el resultado
 *    (pudo haberse aprobado).
 *  - `Cod:17` sin iniciarse: el cliente la acaba de iniciar. Se sigue esperando.
 *  - Iniciada y sin resultado tras la vigencia (el datafono se reinicio): se cierra;
 *    si aprobara despues, la conciliacion lo recupera.
 *  - Sin respuesta de Borrar: se intenta de nuevo en la siguiente consulta.
 */
async function vencerPorTiempo(
  payment: Payment,
  redeban: SipConnectorClient,
  iniciado: boolean,
  r: ConsultaSip,
): Promise<Payment> {
  const borrado = await redeban
    .borrar(payment.providerTransactionId as string)
    .catch(() => null);
  const desdeCreado = Date.now() - payment.createdAt.getTime();
  const cerrar = () =>
    resolvePayment(payment, {
      status: 'TIMEOUT',
      code: r.code,
      reason: iniciado
        ? 'El datafono no termino la operacion. Verifica en el aparato antes de volver a cobrar.'
        : 'El cobro no se inicio en el datafono a tiempo. No se cobro nada.',
      raw: borrado ? `${r.raw} | Borrar: ${borrado.raw}` : r.raw,
    });

  if (borrado?.deleted || r.consulta.kind === 'no_existe') return cerrar();
  if (desdeCreado > STALE_PAYMENT_MS) return cerrar();
  if (borrado?.code === SIP_CODE.YA_RESUELTA) return payment;
  if (iniciado && borrado) return cerrar();
  return payment;
}

/**
 * Registra el desenlace financiero (Anexo 2) y lo que sigue: consecutivo, aviso al
 * parqueadero y, si no se aprobo, Borrar en SIP (regla 10).
 */
async function aplicarResultado(
  payment: Payment,
  redeban: SipConnectorClient,
  code: string,
  raw: string,
  result: SipTransactionResult,
): Promise<Payment> {
  /*
    Anexo 2: "En la respuesta se debe validar el monto aprobado".
    Si la red aprobo un valor distinto al cobrado, NO se da por bueno: queda
    para revision manual. Un descuadre silencioso es peor que un cobro parado.
  */
  const amountMismatch =
    result.approved &&
    result.totalValue !== null &&
    result.totalValue !== payment.amount;

  if (amountMismatch) {
    console.error('[payments] monto aprobado distinto al solicitado', {
      paymentId: payment.id,
      solicitado: payment.amount,
      aprobado: result.totalValue,
    });
  }

  const status: PaymentStatus = amountMismatch
    ? 'FAILED'
    : result.approved
      ? 'APPROVED'
      : 'DECLINED';

  const updated = await db.payment.update({
    where: { id: payment.id },
    data: {
      status,
      terminalStage: 'RESOLVED',
      providerCode: code,
      resolvedAt: new Date(),
      authorizationCode: result.approvalCode,
      receiptNumber: result.receiptNumber,
      rrn: result.rrn,
      cardBrand: result.franchise,
      cardMask: maskCard(result.cardName) ?? maskCard(result.bin),
      bin: result.bin,
      accountType: result.accountType,
      installments: result.installments,
      terminalNumber: result.terminalNumber,
      transactionDate: result.date,
      transactionTime: result.time,
      network: result.network,
      failureReason: amountMismatch
        ? 'El valor aprobado no coincide con el valor cobrado. Requiere revision.'
        : result.approved
          ? null
          : declineReason(result),
      providerRaw: scrubSecrets({ respuesta: raw }) as object,
    },
  });

  await recordAudit({
    action: AuditAction.PAYMENT_RESULT,
    actorId: payment.userId,
    parkingLotId: payment.parkingLotId,
    entity: 'Payment',
    entityId: payment.id,
    metadata: {
      status,
      amount: payment.amount,
      approvedAmount: result.totalValue,
      responseCode: result.responseCode,
      ...(payment.status === 'TIMEOUT' ? { conciliado: true } : {}),
    },
  });

  if (status === 'DECLINED') {
    // Regla 10: rechazada, se borra en SIP (con Persiste=N ya deberia, por si acaso).
    enSegundoPlano(() => borrarSinFallar(redeban, payment.providerTransactionId));
  }

  if (status === 'APPROVED') {
    // Primero el consecutivo: el comprobante que se muestra, se imprime o se envia lo lleva.
    await assignReceiptNumber(updated.id, updated.parkingLotId).catch((error) =>
      console.error('[payments] no se pudo numerar el comprobante', { paymentId: payment.id, error }),
    );
    // El parqueadero tiene que enterarse para liberar el vehiculo. Eso no puede
    // invalidar un cobro ya hecho.
    await confirmToParkingSystem(updated).catch((error) =>
      console.error('[payments] no se pudo confirmar al parqueadero', {
        paymentId: payment.id,
        error,
      }),
    );
    /*
      La factura NO se emite aqui: despues del pago el kiosco le pregunta al cliente
      si la quiere a su nombre o a consumidor final, y se emite al elegir
      (`invoice-choice.ts`), igual que el comprobante al correo. Aqui solo se rescatan
      los pagos de clientes que se fueron sin elegir hace mas de unos minutos.
    */
    enSegundoPlano(() =>
      invoiceAbandonedPayments().catch((error) =>
        console.error('[payments] fallo al facturar pagos sin eleccion', { paymentId: payment.id, error }),
      ),
    );
    // Tras avisar al parqueadero se relee: la pantalla necesita saber si quedo registrado.
    return db.payment.findUniqueOrThrow({ where: { id: updated.id } });
  }

  return updated;
}

/** Borra la operacion en SIP sin que un fallo cambie nada (regla 10). */
async function borrarSinFallar(redeban: SipConnectorClient, id: string | null): Promise<void> {
  if (!id) return;
  await redeban.borrar(id).catch(() => undefined);
}

/** Campos que entrega el datafono mientras lee la tarjeta (Cod:02). */
function readingFields(message: string) {
  // El manual ilustra "Cod:02, Msj:498861, CR, VISA" — BIN, tipo, franquicia.
  const [bin, accountType, franchise] = message.split(',').map((f) => f.trim());
  return {
    bin: bin || null,
    accountType: accountType || null,
    cardBrand: franchise || null,
  };
}

async function resolvePayment(
  payment: Payment,
  params: { status: PaymentStatus; code: string; reason: string; raw: string },
): Promise<Payment> {
  const updated = await db.payment.update({
    where: { id: payment.id },
    data: {
      status: params.status,
      terminalStage: 'RESOLVED',
      providerCode: params.code,
      resolvedAt: new Date(),
      failureReason: params.reason,
      providerRaw: scrubSecrets({ respuesta: params.raw }) as object,
    },
  });

  await recordAudit({
    action: AuditAction.PAYMENT_RESULT,
    actorId: payment.userId,
    parkingLotId: payment.parkingLotId,
    entity: 'Payment',
    entityId: payment.id,
    metadata: { status: params.status, code: params.code },
  });

  return updated;
}

/**
 * Ultimo recurso: un cobro que no se ha podido ni consultar (la nube de SIP caida)
 * se cierra a los 20 minutos, borrandolo antes para liberar la terminal.
 */
async function expireIfStale(payment: Payment): Promise<Payment> {
  if (Date.now() - payment.createdAt.getTime() <= STALE_PAYMENT_MS) return payment;

  if (payment.providerTransactionId) {
    await redebanClientFor(payment.parkingLotId, payment.paymentPointId)
      .then((client) => client.borrar(payment.providerTransactionId!))
      .catch(() => undefined);
  }

  return resolvePayment(payment, {
    status: 'TIMEOUT',
    code: payment.providerCode ?? '',
    reason:
      'La operacion vencio sin respuesta del datafono. Verifica en el aparato antes de volver a cobrar.',
    raw: '',
  });
}

/**
 * Avisa al sistema del parqueadero que el tiquete quedo pagado.
 *
 * Si falla, el pago sigue siendo valido y queda registrado el fallo: el dinero
 * ya se cobro y el operador debe poder verlo para resolverlo a mano.
 */
async function confirmToParkingSystem(payment: Payment): Promise<void> {
  const client = await novaClientFor(payment.parkingLotId);

  // Nova Parking fija el tipo en el tiquete dentro de la misma transaccion del cobro,
  // pero solo se le manda si el tiquete sigue "Por Definir": a uno con tipo no se le
  // cambia. Aqui el dinero ya se cobro, asi que esto nunca impide confirmar.
  const vehicleTypeId =
    payment.identifierKind === 'PLATE'
      ? null
      : await vehicleTypeIdForConfirm(
          client,
          payment.parkingLotId,
          payment.externalTicketId,
          payment.vehicleType,
        );

  const attempt = () =>
    client.confirmPayment({
      ticketId: payment.externalTicketId,
      amount: payment.amount,
      transactionId: payment.providerTransactionId ?? '',
      authorizationCode: payment.authorizationCode,
      receiptNumber: payment.receiptNumber,
      franchise: payment.cardBrand,
      vehicleTypeId,
    });

  let result = await attempt();

  /*
    Un 503 significa que su base estaba ocupada y el cobro NO quedo registrado:
    reintentar es correcto y necesario. La llamada es idempotente por
    `transaction_id`, asi que repetirla no puede duplicar el movimiento de caja.
    Dos reintentos cortos cubren el bloqueo momentaneo sin dejar al conductor
    esperando en la barrera.
  */
  for (let i = 0; i < 2 && result.retryable; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200 * (i + 1)));
    result = await attempt();
  }

  /*
    Un rechazo explicito (4xx: datos invalidos, tiquete inexistente o ya pagado por otro
    canal) no se arregla reintentando: queda REJECTED para revision. Un error del
    servidor o la falta de respuesta queda PENDING y se reintenta solo.
  */
  const rechazado =
    !result.confirmed &&
    !result.retryable &&
    typeof result.status === 'number' &&
    result.status >= 400 &&
    result.status < 500;
  const estado = result.confirmed ? 'CONFIRMED' : rechazado ? 'REJECTED' : 'PENDING';

  await db.payment.update({
    where: { id: payment.id },
    data: {
      parkingConfirmStatus: estado,
      parkingConfirmAttempts: { increment: 1 },
      parkingConfirmedAt: result.confirmed ? new Date() : null,
      failureReason: result.confirmed
        ? null
        : `El cobro se aprobo, pero el parqueadero no lo registro: ${
            result.detail ?? 'sin detalle'
          } El vehiculo no se libera solo.`,
    },
  });

  if (!result.confirmed) {
    await recordAudit({
      action: AuditAction.UPSTREAM_ERROR,
      actorId: payment.userId,
      parkingLotId: payment.parkingLotId,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { stage: 'confirmPayment', estado, http: result.status ?? null, detalle: result.detail },
    });
  }
}

/**
 * Cobro aprobado de ESTE tiquete que el parqueadero todavia no registro.
 *
 * Mientras exista, el tiquete no se vuelve a cobrar: el sistema del parqueadero lo sigue
 * mostrando como pendiente (nunca se entero del pago) y, sin esta revision, el kiosco le
 * cobraba otra vez al mismo cliente.
 */
export async function unregisteredApprovedPayment(
  parkingLotId: string,
  ticketId: string,
): Promise<Payment | null> {
  return db.payment.findFirst({
    where: {
      parkingLotId,
      externalTicketId: ticketId,
      status: 'APPROVED',
      parkingConfirmStatus: { in: ['PENDING', 'REJECTED'] },
      resolvedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
    orderBy: { resolvedAt: 'asc' },
  });
}

/** Reintenta los avisos pendientes (tarea diaria). Devuelve cuantos intento. */
export async function retryParkingConfirmations(limit = 20): Promise<number> {
  const pendientes = await db.payment.findMany({
    where: { status: 'APPROVED', parkingConfirmStatus: 'PENDING', parkingConfirmAttempts: { lt: 12 } },
    orderBy: { resolvedAt: 'asc' },
    take: limit,
  });
  for (const pago of pendientes) {
    await confirmToParkingSystem(pago).catch((error) =>
      console.error('[payments] reintento de aviso al parqueadero fallo', { paymentId: pago.id, error }),
    );
  }
  return pendientes.length;
}

/* --------------------------------------------------------------- Cancelar */

/**
 * Cancela un cobro que aun no se resolvio y libera el datafono.
 *
 * Solo se da por cancelado si es SEGURO que ya no se puede cobrar (regla 10):
 *  - Borrar responde `Cod:00`: estaba esperando y se elimino.
 *  - Borrar responde `Cod:17`/`Cod:18` y la consulta dice que la orden ya no existe o
 *    vencio: no hay nada que cobrar.
 * Si la consulta dice que ya se inicio en el datafono o que se resolvio, NO se cancela:
 * se registra lo que paso (pudo aprobarse) o se responde que se termine en el aparato.
 */
export async function cancelPayment(
  paymentId: string,
  user: CurrentUser,
): Promise<Payment> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });

  if (isFinalStatus(payment.status)) {
    throw new AppError('CONFLICT', {
      publicMessage: 'Este cobro ya fue resuelto y no puede cancelarse.',
    });
  }

  const enCurso = new AppError('CONFLICT', {
    publicMessage:
      'El cobro ya se inicio en el datafono. Terminalo o cancelalo en el aparato.',
  });
  if (payment.terminalStage === 'STARTED' || payment.terminalStage === 'READING_CARD') {
    throw enCurso;
  }

  const id = payment.providerTransactionId;
  if (id) {
    const redeban = await redebanClientFor(payment.parkingLotId, payment.paymentPointId);

    let borrado: Awaited<ReturnType<SipConnectorClient['borrar']>>;
    try {
      borrado = await redeban.borrar(id);
    } catch (error) {
      if (isSipTransient(error)) {
        throw new AppError('CONFLICT', {
          publicMessage: 'El medio de pago no respondio. Intenta cancelar de nuevo.',
        });
      }
      throw error;
    }

    if (!borrado.deleted) {
      // No estaba entre las borrables: antes de cancelar hay que saber que paso con ella.
      const espera = MIN_CONSULTA_MS - (Date.now() - payment.updatedAt.getTime());
      if (espera > 0) await esperar(espera);
      const r = await redeban.respuesta(id).catch(() => null);
      if (!r) {
        throw new AppError('CONFLICT', {
          publicMessage: 'No se pudo confirmar el estado del cobro. Intenta cancelar de nuevo.',
        });
      }
      if (r.consulta.kind !== 'no_existe' && r.consulta.kind !== 'vencida') {
        const actual = await aplicarConsulta(payment, redeban, r);
        if (isFinalStatus(actual.status)) return actual;
        throw enCurso;
      }
    }
  }

  const updated = await db.payment.update({
    where: { id: paymentId },
    data: {
      status: 'CANCELLED',
      terminalStage: 'RESOLVED',
      resolvedAt: new Date(),
      failureReason: 'Cancelado por el operador.',
    },
  });

  await recordAudit({
    action: AuditAction.PAYMENT_CANCELLED,
    actorId: user.id,
    parkingLotId: payment.parkingLotId,
    entity: 'Payment',
    entityId: payment.id,
  });

  return updated;
}

/**
 * Cobro vivo del punto de pago, si lo hay.
 *
 * Permite que la pantalla del kiosco retome una operacion en curso cuando el
 * navegador se recarga o alguien sale y vuelve: el cliente no puede quedarse
 * con la tarjeta pasada y la pantalla en blanco.
 */
export async function findLivePayment(
  parkingLotId: string,
  paymentPointId: string,
): Promise<Payment | null> {
  const live = await db.payment.findFirst({
    where: {
      parkingLotId,
      paymentPointId,
      status: { in: ['PENDING', 'INITIATED', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!live) return null;

  const refreshed = await refreshPaymentStatus(live.id);
  return isFinalStatus(refreshed.status) ? null : refreshed;
}

/**
 * Consecutivo del comprobante, por parqueadero, sin saltos ni repetidos.
 *
 * El estado del pago se consulta cada pocos segundos y dos consultas pueden ver la
 * aprobacion a la vez. Por eso se bloquea la fila del pago (`FOR UPDATE`) dentro de la
 * transaccion: la segunda espera, ve que ya tiene numero y no gasta otro.
 */
async function assignReceiptNumber(paymentId: string, parkingLotId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ receiptSeq: number | null }[]>`
      SELECT "receiptSeq" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
    if (!filas[0] || filas[0].receiptSeq !== null) return;

    const lot = await tx.parkingLot.update({
      where: { id: parkingLotId },
      data: { receiptCounter: { increment: 1 } },
      select: { receiptCounter: true },
    });
    await tx.payment.update({
      where: { id: paymentId },
      data: { receiptSeq: lot.receiptCounter },
    });
  });
}
