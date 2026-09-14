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
  isValidIdentifier,
  normalizeIdentifier,
} from '@/integrations/nova-parking/vehicle-types';
import { getVehicleRule, novaClientFor } from '../parking/config';
import { redebanClientFor } from '../parking/redeban';
import type { OperablePoint } from '../parking/payment-point';
import type { NovaCheckout } from '@/integrations/nova-parking/types';
import { maskCard } from '@/integrations/sipconnector/codec';
import {
  novaVehicleTypeId,
  novaVehicleTypeIdOrNull,
} from '@/lib/parking/nova-vehicle-types';
import { SIP_CODE, publicMessageForCode } from '@/integrations/sipconnector/codes';
import { queueInvoice } from '../billing/service';
import { after } from 'next/server';

/**
 * Trabajo que sigue despues de responder (la factura de SIIGO).
 *
 * En un servidor propio `void promesa` bastaba, pero en Vercel la funcion se congela en
 * cuanto sale la respuesta y la factura podia quedarse sin emitir. `after()` le pide a la
 * plataforma que la termine. Fuera de una peticion (scripts) `after` no existe: se lanza
 * igual que antes.
 */
function enSegundoPlano(tarea: () => Promise<unknown>): void {
  try {
    after(tarea);
  } catch {
    void tarea();
  }
}

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
 * Margen despues del cual un cobro sin resolver se da por vencido.
 * Es holgado a proposito sobre la vigencia: cerrar antes de tiempo algo que
 * quiza se aprobo seria peor que esperar de mas.
 */
const STALE_PAYMENT_MS = 20 * 60_000;

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
}

/**
 * Busca el vehiculo y obtiene el valor a cobrar en un solo paso.
 * El monto SIEMPRE viene del sistema del parqueadero.
 */
export async function lookupVehicle(params: {
  user: CurrentUser;
  parkingLotId: string;
  vehicleType: VehicleType;
  identifier: string;
}): Promise<VehicleLookupResult> {
  const config = await getVehicleRule(params.parkingLotId, params.vehicleType);
  const identifier = normalizeIdentifier(params.identifier, config.identifierKind);

  if (!isValidIdentifier(identifier, config.identifierKind)) {
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
    metadata: { vehicleType: params.vehicleType, identifier },
  });

  let ticket = await client.findTicket(
    config.searchSegment,
    identifier,
    config.searchQuery,
  );

  /*
    Respaldo entre las dos rutas de codigo. Los vehiculos que la camara no leyo
    entran como "Por Definir" y solo los encuentra `find-ticket/bike/` (filtra por
    ausencia de placa); `find-ticket/moto/` solo encuentra los que ya quedaron
    tipados como Motocicleta. Se prueba la otra antes de decir "no encontrado".
    Sin riesgo de cruzar vehiculos: el codigo es unico en todo su sistema.
  */
  if (!ticket && config.identifierKind !== 'PLATE') {
    const otra = config.searchSegment === 'bike' ? 'moto' : 'bike';
    ticket = await client.findTicket(otra, identifier, null);
  }

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
    };
  }

  // El tipo que eligio el cliente. Solo los que no van por placa: un carro ya
  // entro tipado por la camara y no hace falta decirselo.
  const vehicleTypeId =
    config.identifierKind === 'PLATE'
      ? null
      : await novaVehicleTypeId(client, params.parkingLotId, params.vehicleType);

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
      Este es el monto que se le cobra al datafono, asi que tiene que salir con
      el tipo que eligio el cliente — el mismo con que se le mostro el precio.
      Si se cotizara sin tipo, un "Por Definir" se cobraria como moto.
    */
    const vehicleTypeId =
      config.identifierKind === 'PLATE'
        ? null
        : await novaVehicleTypeId(nova, input.parkingLotId, input.vehicleType);
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

    // Un tiquete no puede tener dos cobros vivos al mismo tiempo.
    const inFlight = await db.payment.findFirst({
      where: {
        externalTicketId: input.ticketId,
        parkingLotId: lot.id,
        status: { in: ['PENDING', 'INITIATED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (inFlight) {
      const refreshed = await refreshPaymentStatus(inFlight.id);
      if (!isFinalStatus(refreshed.status)) {
        await attachPaymentToKey(input.idempotencyKey, refreshed.id);
        return refreshed;
      }
    }

    const providerTransactionId = buildProviderTransactionId();
    const identifier = normalizeIdentifier(input.identifier, config.identifierKind);

    const payment = await db.payment.create({
      data: {
        parkingLotId: lot.id,
        paymentPointId: input.paymentPoint.id,
        userId: input.user.id,
        vehicleType: input.vehicleType,
        vehicleIdentifier: identifier,
        identifierKind: config.identifierKind,
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

    try {
      const redeban = await redebanClientFor(lot.id);

      const orden = {
        amount: checkout.amount,
        invoiceNumber: providerTransactionId,
        cashierCode: input.paymentPoint.cashierCode ?? 'CAJA',
        boxNumber: input.paymentPoint.boxNumber ?? input.paymentPoint.code,
        receiptNumber: input.ticketId.slice(0, 10),
        validityMinutes: TERMINAL_VALIDITY_MINUTES,
        // `N` para que una operacion rechazada se limpie sola y el datafono
        // quede libre para reintentar con una orden nueva.
        persist: 'N' as const,
      };

      let sent = await redeban.enviarCompra(providerTransactionId, orden);

      /*
        La terminal quedo ocupada por una operacion anterior (Cod:06).

        El datafono de este punto de pago es EXCLUSIVO nuestro —el kiosco tiene
        su propia pantalla y su propio aparato—, asi que una operacion colgada
        ahi solo puede ser nuestra. Por eso se puede liberar y reintentar sin
        riesgo: no hay otro sistema al que se le este interrumpiendo un cobro.

        Sin este reintento la caja se queda bloqueada hasta que alguien
        intervenga el datafono a mano, con el cliente esperando.
      */
      if (sent.code === SIP_CODE.TERMINAL_OCUPADA) {
        await redeban.borrar(providerTransactionId).catch(() => undefined);
        sent = await redeban.enviarCompra(providerTransactionId, orden);
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

      return db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          terminalStage: 'RESOLVED',
          providerCode: sent.code,
          resolvedAt: new Date(),
          failureReason: publicMessageForCode(sent.code),
          providerRaw: scrubSecrets({ enviarDatos: sent.raw }) as object,
        },
      });
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.publicMessage
          : 'No fue posible iniciar el cobro.';

      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          terminalStage: 'RESOLVED',
          resolvedAt: new Date(),
          failureReason: message,
        },
      });
      await recordAudit({
        action: AuditAction.UPSTREAM_ERROR,
        actorId: input.user.id,
        parkingLotId: lot.id,
        entity: 'Payment',
        entityId: payment.id,
        metadata: { stage: 'enviarDatos' },
      });
      throw error;
    }
  } catch (error) {
    await releaseIdempotencyKey(input.idempotencyKey);
    throw error;
  }
}

/* -------------------------------------------------------- Estado del cobro */

/**
 * Consulta el datafono y actualiza el pago.
 *
 * El Anexo 3 pide no consultar mas seguido que cada tres segundos; el intervalo
 * lo respeta la interfaz.
 */
export async function refreshPaymentStatus(paymentId: string): Promise<Payment> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (isFinalStatus(payment.status)) return payment;

  const age = Date.now() - payment.createdAt.getTime();
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

  let state;
  try {
    const redeban = await redebanClientFor(payment.parkingLotId);
    state = await redeban.respuesta(transactionId);
  } catch (error) {
    // Un fallo de consulta NO resuelve el pago: sigue vivo y se reintenta.
    console.error('[payments] no se pudo consultar el datafono', {
      paymentId,
      error,
    });
    return expireIfStale(payment, age);
  }

  /* --- Todavia sin desenlace: se refleja en que va el datafono --------- */
  if (state.pending) {
    const stage: TerminalStage = state.reading
      ? 'READING_CARD'
      : state.started
        ? 'STARTED'
        : 'WAITING_TERMINAL';

    const updated = await db.payment.update({
      where: { id: payment.id },
      data: {
        status: state.started ? 'IN_PROGRESS' : 'INITIATED',
        terminalStage: stage,
        providerCode: state.code,
        // Cod:02 entrega BIN, tipo de cuenta y franquicia mientras el cliente
        // decide en el aparato: se muestran para que vea que va avanzando.
        ...(state.reading ? readingFields(state.reading) : {}),
      },
    });

    return expireIfStale(updated, age);
  }

  /* --- Error tecnico del servicio -------------------------------------- */
  if (!state.result) {
    // `Cod:99 No existe IdTransaccion` significa que el servicio ya la cerro.
    const gone =
      state.code === SIP_CODE.ERROR_TECNICO &&
      /no existe/i.test(state.message);

    if (gone && age > STALE_PAYMENT_MS) {
      return resolvePayment(payment, {
        status: 'TIMEOUT',
        code: state.code,
        reason:
          'La operacion vencio y el medio de pago ya no la tiene registrada. Verifica en el datafono antes de volver a cobrar.',
        raw: state.raw,
      });
    }

    if (state.code === SIP_CODE.OK || gone) {
      return expireIfStale(payment, age);
    }

    return resolvePayment(payment, {
      status: 'FAILED',
      code: state.code,
      reason: publicMessageForCode(state.code),
      raw: state.raw,
    });
  }

  /* --- Desenlace financiero -------------------------------------------- */
  const result = state.result;

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
      paymentId,
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
      providerCode: state.code,
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
          : 'La transaccion fue rechazada por el banco emisor.',
      providerRaw: scrubSecrets({ respuesta: state.raw }) as object,
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
    },
  });

  if (status === 'APPROVED') {
    // El parqueadero tiene que enterarse para liberar el vehiculo, y hay que
    // facturar. Ninguna de las dos cosas puede invalidar un cobro ya hecho.
    await confirmToParkingSystem(updated).catch((error) =>
      console.error('[payments] no se pudo confirmar al parqueadero', {
        paymentId,
        error,
      }),
    );
    enSegundoPlano(() =>
      queueInvoice(updated.id).catch((error) =>
        console.error('[payments] fallo al encolar la factura', { paymentId, error }),
      ),
    );
  }

  return updated;
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
 * Cierra un cobro que lleva demasiado tiempo sin resolverse.
 *
 * Hace falta porque un cobro vivo bloquea el tiquete: sin esto, un vehiculo
 * cuyo cobro quedo colgado no se podria volver a cobrar nunca.
 */
async function expireIfStale(payment: Payment, age: number): Promise<Payment> {
  if (age <= STALE_PAYMENT_MS) return payment;

  // Se libera la terminal antes de cerrar, para que la caja siga operando.
  if (payment.providerTransactionId) {
    await redebanClientFor(payment.parkingLotId)
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

  // Nova Parking fija el tipo en el tiquete dentro de la misma transaccion del
  // cobro. Aqui el dinero ya se cobro, asi que si el tipo no se resuelve se
  // confirma igual sin el: peor seria dejar el vehiculo sin salir.
  const vehicleTypeId =
    payment.identifierKind === 'PLATE'
      ? null
      : await novaVehicleTypeIdOrNull(client, payment.parkingLotId, payment.vehicleType);

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

  await db.payment.update({
    where: { id: payment.id },
    data: {
      failureReason: result.confirmed
        ? null
        : (result.detail ??
          'El cobro se aprobo, pero el sistema del parqueadero no confirmo la salida. Verificalo manualmente.'),
    },
  });

  if (!result.confirmed) {
    await recordAudit({
      action: AuditAction.UPSTREAM_ERROR,
      actorId: payment.userId,
      parkingLotId: payment.parkingLotId,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { stage: 'confirmPayment', detalle: result.detail },
    });
  }
}

/* --------------------------------------------------------------- Cancelar */

/** Cancela un cobro que aun no se resolvio y libera el datafono. */
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

  /*
    Antes de cancelar se consulta una ultima vez: si el cliente acaba de pasar
    la tarjeta y la red aprobo, cancelar aqui dejaria un cobro real sin
    registrar. Primero se comprueba, y solo si sigue sin resolverse se cancela.
  */
  const latest = await refreshPaymentStatus(paymentId);
  if (isFinalStatus(latest.status)) return latest;

  if (payment.providerTransactionId) {
    await redebanClientFor(payment.parkingLotId)
      .then((client) => client.borrar(payment.providerTransactionId!))
      .catch(() => undefined);
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
