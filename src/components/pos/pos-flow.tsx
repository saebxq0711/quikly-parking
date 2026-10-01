'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TerminalStage,
  VehicleIdentifierKind,
  VehicleType,
} from '@prisma/client';
import {
  MdCheck,
  MdClose,
  MdCreditCard,
  MdKeyboard,
  MdNoPhotography,
  MdQrCodeScanner,
} from 'react-icons/md';
import { VehicleIcon } from '@/components/vehicle-icon';
import { BrandSwoosh } from '@/components/brand-swoosh';
import { formatCOP, formatDuration } from '@/components/ui';
import type { PaymentDTO } from '@/lib/payments/serialize';
import type { InvoiceDocumentDTO, InvoicePrintDTO } from '@/lib/billing/invoice-print';
import { Keypad } from './keypad';
import { ExitGate } from './exit-gate';
import { CustomerStep, type CustomerData } from './customer-step';
import { ReceiptScreen } from './receipt';
import { ThemeToggle } from './theme';
import {
  BackLink,
  CheckBadge,
  InfoCard,
  InfoRow,
  KioskStep,
  KioskTitle,
  Notice,
  PlateHeader,
  PrimaryButton,
  ResultDisc,
  SecondaryButton,
  TotalBlock,
} from './kiosk-ui';
import { impresoraEmparejada, imprimirPorUsb, vigilarImpresora } from '@/lib/printing/usb-printer';
import { comprobante, type ReceiptIssuer } from '@/lib/printing/receipt-data';
import { comprobanteEscPos, facturaEscPos } from '@/lib/printing/tickets';

/**
 * Flujo del punto de pago (CLAUDE.md secciones 6, 7, 8 y 27).
 *
 *   Seleccionar vehiculo -> Identificar -> Reconocer el vehiculo (foto) ->
 *   Datos del cliente -> Ver valor -> Pagar -> Resultado
 *
 * ORIENTACION
 * -----------
 * La misma pantalla se usa en un totem vertical y en una tablet o monitor
 * horizontal. No son dos disenos: es una composicion que reordena.
 * En horizontal el problema no es el ancho sino la ALTURA — el teclado, el
 * campo y los botones no caben apilados en 600 u 800 px de alto. Por eso las
 * variantes `kland` y `kshort` (definidas en globals.css a partir de la altura
 * disponible, no de un breakpoint de ancho) pasan el paso de identificacion a
 * dos columnas y ajustan las escalas.
 */

export interface PosVehicle {
  vehicleType: VehicleType;
  label: string;
  identifierKind: VehicleIdentifierKind;
  inputLabel: string;
  inputPlaceholder: string;
}

/**
 * El flujo del kiosco. `customer` va despues de identificar el vehiculo porque
 * primero hay que saber si hay algo que cobrar: pedirle los datos a alguien
 * cuyo tiquete no existe seria hacerle perder el tiempo.
 */
type Step =
  | 'type'
  | 'identify'
  | 'confirm'
  | 'customer'
  | 'summary'
  | 'waiting'
  | 'result';

interface LookupResult {
  found: boolean;
  ticketId: string | null;
  /** Lo que el cliente reconoce de su tiquete. El `ticketId` no se muestra. */
  code: string | null;
  plate: string | null;
  vehicleTypeLabel: string | null;
  entryAt: string | null;
  minutes: number | null;
  customerName: string | null;
  amount: number | null;
  alreadyPaid: boolean;
  notice: string | null;
  /** Ruta de la foto de entrada en el sistema del parqueadero. */
  photo: string | null;
}

/** El manual de SIPConnector (Anexo 3) exige no consultar mas seguido que 3 s. */
const POLL_INTERVAL_MS = 3000;
/** Corte de seguridad del sondeo: 4 minutos sin resolucion. */
const POLL_TIMEOUT_MS = 240_000;

/**
 * Segundos que se muestra el resultado antes de volver al inicio.
 *
 * El kiosco es de autoservicio: si la pantalla se quedara en el comprobante del
 * cliente anterior, el siguiente encontraria datos ajenos y no sabria que hacer.
 * Vuelve sola, y aun asi hay un boton para terminar antes.
 */
const RESULT_TIMEOUT_S = 15;

/** Con el comprobante en pantalla hay que dar tiempo de leerlo o de escanear su QR. */
const RECEIPT_TIMEOUT_S = 45;

/**
 * Cada cuanto se vuelve a cotizar mientras el cliente mira el total. La tarifa del
 * parqueadero sigue corriendo: asi el valor en pantalla es el que se va a cobrar.
 */
const REQUOTE_INTERVAL_MS = 30_000;

/**
 * Inactividad tras la cual se vuelve al inicio a media operacion.
 *
 * Alguien empieza a escribir su placa, se arrepiente y se va: la pantalla no
 * puede quedarse con sus datos esperando indefinidamente. Nunca aplica durante
 * un cobro — ahi jamas se interrumpe.
 */
const IDLE_TIMEOUT_MS = 90_000;

export function PosFlow({
  vehicles,
  parkingLotName,
  paymentPointName,
  issuer,
  hasPrinter,
  livePayment,
  testMode = false,
}: {
  vehicles: PosVehicle[];
  parkingLotName: string;
  /** Datos del parqueadero para el encabezado del papel impreso. */
  issuer: ReceiptIssuer;
  /** Si este kiosco imprime el comprobante. Sin impresora se muestra en pantalla. */
  hasPrinter: boolean;
  /** Solo para soporte: no se muestra al cliente. */
  paymentPointName: string;
  /**
   * Cobro en curso al abrir la pantalla, si lo hay. Permite retomar una
   * operacion viva tras una recarga o tras salir y volver.
   */
  livePayment: PaymentDTO | null;
  /** Modo de pruebas: el sistema del parqueadero esta simulado. Se avisa en pantalla. */
  testMode?: boolean;
}) {
  const [step, setStep] = useState<Step>(livePayment ? 'waiting' : 'type');
  const [vehicle, setVehicle] = useState<PosVehicle | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [payment, setPayment] = useState<PaymentDTO | null>(livePayment);

  /*
    Impresora USB detectada sola, solo en los kioscos que imprimen: si este navegador
    tiene una autorizada y esta conectada, el comprobante sale por ahi. Se vuelve a
    revisar cada vez que se conecta o desconecta algo por USB.
  */
  const [impresoraUsb, setImpresoraUsb] = useState(false);
  useEffect(() => (hasPrinter ? vigilarImpresora(setImpresoraUsb) : undefined), [hasPrinter]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setStep('type');
    setVehicle(null);
    setIdentifier('');
    setLookup(null);
    setCustomer(null);
    setPayment(null);
    setError(null);
    setBusy(false);
  }, []);

  async function handleLookup() {
    if (!vehicle || busy || identifier.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/pos/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleType: vehicle.vehicleType, identifier }),
      });
      // Una respuesta que no es JSON (corte de red, bloqueo del proveedor, pagina de
      // error) no debe romper la pantalla: se explica como problema de conexion.
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        setError(
          data?.error?.message ??
            'No hay conexión con el servidor en este momento. Intenta de nuevo en unos segundos.',
        );
        return;
      }
      const result = data as LookupResult;
      setLookup(result);
      // Solo se sigue si de verdad hay algo que cobrar. Antes de pedir datos, el
      // cliente confirma que el vehiculo encontrado es el suyo.
      const cobrable = result.found && !result.alreadyPaid && (result.amount ?? 0) > 0;
      setStep(cobrable ? 'confirm' : 'summary');
    } catch {
      setError('No fue posible consultar. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  /*
    Cotizacion en vivo. La tarifa sigue corriendo mientras el cliente llena sus datos
    o lee el total, asi que al llegar al resumen y cada 30 s se vuelve a consultar.
    Si el valor cambio se avisa: el cliente nunca paga algo distinto de lo que ve.
  */
  const montoVisto = useRef<number | null>(null);
  useEffect(() => {
    montoVisto.current = lookup?.amount ?? null;
  }, [lookup]);

  const requote = useCallback(async () => {
    if (!vehicle || identifier.length === 0) return;
    try {
      const response = await fetch('/api/pos/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleType: vehicle.vehicleType, identifier }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as LookupResult;
      if (montoVisto.current !== null && result.amount !== montoVisto.current) {
        setError('El total se actualizó porque pasó más tiempo. Revísalo antes de pagar.');
      }
      setLookup(result);
    } catch {
      // Sin red se conserva el ultimo valor; el servidor lo vuelve a comprobar al pagar.
    }
  }, [vehicle, identifier]);

  const enResumen = step === 'summary';
  useEffect(() => {
    if (!enResumen) return;
    void requote();
    const timer = setInterval(() => void requote(), REQUOTE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enResumen, requote]);

  async function handlePay() {
    if (!vehicle || !lookup?.ticketId || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/pos/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleType: vehicle.vehicleType,
          identifier,
          ticketId: lookup.ticketId,
          customer: customer ?? undefined,
          // Una clave por intento: si el operador toca dos veces o la red
          // reintenta, el servidor devuelve el MISMO cobro, no crea otro.
          idempotencyKey: crypto.randomUUID(),
          // El total que el cliente esta viendo: si ya cambio, el servidor no cobra.
          expectedAmount: lookup.amount ?? undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const mensaje = data?.error?.message ?? 'No fue posible iniciar el cobro.';
        // Lo mas comun es que la tarifa subio: se trae el total nuevo y se deja el aviso.
        if (data?.error?.code === 'CONFLICT') {
          montoVisto.current = null;
          await requote();
        }
        setError(mensaje);
        return;
      }
      setPayment(data as PaymentDTO);
      setStep(data.isFinal ? 'result' : 'waiting');
    } catch {
      setError('No fue posible iniciar el cobro. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!payment || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/pos/payments/${payment.id}/cancel`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        setPayment(data as PaymentDTO);
        setStep('result');
      }
    } finally {
      setBusy(false);
    }
  }

  const paymentId = payment?.id;
  const isWaiting = step === 'waiting';

  /*
    Sesion cerrada a distancia por el administrador del parqueadero. Mientras la pantalla
    espera al siguiente cliente se comprueba cada minuto; si ya no hay sesion, vuelve al
    inicio de sesion en vez de fallar cuando alguien intente pagar.
  */
  useEffect(() => {
    if (step !== 'type') return;
    const revisar = async () => {
      try {
        const response = await fetch('/api/pos/payments', { cache: 'no-store' });
        if (response.status === 401 || (response.redirected && response.url.includes('/login'))) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        }
      } catch {
        // Sin red: se vuelve a intentar en el siguiente minuto.
      }
    };
    const timer = setInterval(revisar, 60_000);
    return () => clearInterval(timer);
  }, [step]);

  /*
    Inactividad a media operacion: se vuelve al inicio para que el siguiente
    cliente encuentre la pantalla limpia. Cualquier toque reinicia la cuenta.
  */
  useEffect(() => {
    if (
      step !== 'identify' &&
      step !== 'confirm' &&
      step !== 'customer' &&
      step !== 'summary'
    ) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, IDLE_TIMEOUT_MS);
    };

    restart();
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach((event) => window.addEventListener(event, restart));

    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, restart));
    };
  }, [step, reset]);

  /*
    Con una transaccion ya iniciada en el datafono no se puede abandonar la
    pantalla: el cliente puede tener la tarjeta dentro y el resultado a medio
    camino. Se avisa antes de recargar o cerrar, y se anula el gesto de
    "atras" del navegador reponiendo la entrada en el historial.

    No es una barrera infranqueable —ningun navegador lo permite— pero convierte
    un accidente en una decision consciente, y al volver a entrar la pantalla
    retoma el cobro igualmente.
  */
  const locked =
    isWaiting &&
    payment !== null &&
    payment.stage !== 'WAITING_TERMINAL' &&
    !payment.isFinal;

  useEffect(() => {
    if (!locked) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const keepHere = () => window.history.pushState(null, '', window.location.href);

    window.addEventListener('beforeunload', warn);
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', keepHere);

    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('popstate', keepHere);
    };
  }, [locked]);

  useEffect(() => {
    if (!isWaiting || !paymentId) return;

    let cancelled = false;
    const startedAt = Date.now();

    const timer = setInterval(async () => {
      if (cancelled) return;

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setError(
          'No recibimos respuesta del datáfono. Si el cobro salió de tu cuenta, acércate a la oficina del parqueadero con este mensaje.',
        );
        setStep('result');
        return;
      }

      try {
        const response = await fetch(`/api/pos/payments/${paymentId}`);
        if (!response.ok) return; // un fallo puntual no resuelve el pago
        const data = (await response.json()) as PaymentDTO;
        if (cancelled) return;

        setPayment(data);
        if (data.isFinal) {
          clearInterval(timer);
          setStep('result');
        }
      } catch {
        // Un corte momentaneo de red no cancela el cobro: se reintenta.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isWaiting, paymentId]);

  return (
    /*
      `kiosk-root` no pinta nada: es la marca que usa `globals.css` para subir el
      tamano de la raiz en pantallas grandes (el 27" vertical del 122). Al escalar
      la raiz crece todo a la vez —texto, botones, margenes— sin duplicar clases.

      `isolate` crea la capa propia donde vive la franja amarilla de la esquina,
      detras del contenido y delante del fondo. `overflow-clip` y no `hidden`:
      recorta igual lo que sale por los bordes (la franja, el sedan) sin volverse
      un contenedor de desplazamiento, que anularia el "Finalizar" fijo al pie.
    */
    <main className="touch-surface kiosk-root relative isolate flex min-h-dvh flex-col overflow-clip bg-[var(--surface-base)]">
      <header className="flex shrink-0 items-center justify-between gap-6 px-8 pb-2 pt-7 kland:px-6 kland:pt-3">
        {/*
          El logo cambia de version con el tema, como pide el manual de marca:
          texto negro sobre blanco de dia, texto blanco sobre negro de noche.
        */}
        <div className="shrink-0">
          <Image
            src="/quikly-parking-positivo.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="h-[3.1rem] w-auto night:hidden kland:h-9"
          />
          <Image
            src="/quikly-parking.png"
            alt=""
            aria-hidden
            width={783}
            height={269}
            priority
            className="hidden h-[3.1rem] w-auto night:block kland:h-9"
          />
        </div>

        <div className="flex min-w-0 items-center gap-4">
          {/*
            Empezar de nuevo desde cualquier paso antes del cobro. Va arriba y en
            texto, lejos de la accion principal: es una salida, no una opcion mas.
          */}
          {step !== 'type' && step !== 'identify' && step !== 'waiting' && step !== 'result' ? (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-xl px-3 py-2 text-lg font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] hover:text-[var(--text-primary)] kshort:text-sm"
            >
              Cancelar
            </button>
          ) : null}

          {/*
            Mantener pulsado el nombre del parqueadero tres segundos abre la salida
            del kiosco, que pide contrasena: el personal puede cerrarlo sin que haya
            un boton a la vista que cualquiera pulse.
          */}
          <ExitGate disabled={isWaiting}>
            <p className="truncate text-right text-lg font-semibold leading-tight text-[var(--text-primary)] kshort:text-sm">
              {parkingLotName}
            </p>
            <p className="truncate text-right text-base text-[var(--text-muted)] kshort:text-xs">
              {testMode ? (
                <span className="mr-2 rounded-md bg-warn-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-warn-700 night:bg-warn-500/15 night:text-warn-300">
                  Modo de pruebas
                </span>
              ) : null}
              Punto de pago
            </p>
          </ExitGate>

          {/* Dia/noche. A la vista y no escondido: quien atiende el parqueadero
              es quien sabe si le esta pegando el sol a la pantalla. */}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col px-8 pb-7 kland:px-6 kland:pb-4">
        {step === 'type' ? (
          <SelectType
            vehicles={vehicles}
            onSelect={(v) => {
              setVehicle(v);
              setIdentifier('');
              setError(null);
              setStep('identify');
            }}
          />
        ) : null}

        {step === 'identify' && vehicle ? (
          <Identify
            vehicle={vehicle}
            value={identifier}
            onChange={setIdentifier}
            onSubmit={handleLookup}
            onBack={() => {
              setStep('type');
              setError(null);
            }}
            busy={busy}
            error={error}
          />
        ) : null}

        {step === 'confirm' && lookup ? (
          <ConfirmVehicle
            lookup={lookup}
            vehicleType={vehicle?.vehicleType ?? null}
            vehicleLabel={vehicle?.label ?? null}
            onConfirm={() => setStep('customer')}
            onReject={() => {
              // Se vuelve al campo vacio: si la foto no era su vehiculo, el dato
              // que escribio tampoco servia.
              setIdentifier('');
              setLookup(null);
              setStep('identify');
              setError(null);
            }}
          />
        ) : null}

        {step === 'customer' ? (
          <CustomerStep
            onReady={(data) => {
              setCustomer(data);
              setStep('summary');
            }}
            onBack={() => {
              setStep('confirm');
              setError(null);
            }}
          />
        ) : null}

        {step === 'summary' && lookup ? (
          <Summary
            lookup={lookup}
            customer={customer}
            searched={identifier}
            vehicleType={vehicle?.vehicleType ?? null}
            vehicleLabel={vehicle?.label ?? null}
            identifierKind={vehicle?.identifierKind ?? 'PLATE'}
            error={error}
            busy={busy}
            onPay={handlePay}
            onRetry={() => {
              setStep(customer ? 'customer' : 'identify');
              setError(null);
            }}
          />
        ) : null}

        {step === 'waiting' && payment ? (
          <Waiting
            payment={payment}
            vehicleType={vehicle?.vehicleType ?? (payment.vehicleType as VehicleType)}
            onCancel={handleCancel}
            busy={busy}
          />
        ) : null}

        {step === 'result' && payment ? (
          <Result
            payment={payment}
            error={error}
            onDone={reset}
            impresoraUsb={hasPrinter && impresoraUsb}
            conCorreo={Boolean(customer?.email)}
            issuer={issuer}
          />
        ) : null}
      </div>

      {/*
        La franja amarilla de la esquina: el trazo del logo llevado al borde. En
        la bienvenida la dibuja la propia escena (detras del sedan), asi que aqui
        solo va en los demas pasos.
      */}
      {step !== 'type' ? (
        <BrandSwoosh className="swoosh-in pointer-events-none absolute -bottom-8 -right-8 -z-10 h-[12rem] w-[12rem] text-brand-500 kland:h-32 kland:w-32" />
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------ Paso 1: tipo */

/**
 * Bienvenida: cuatro mosaicos iguales y el sedan llegando por la esquina.
 *
 * Ningun vehiculo viene marcado: los cuatro esperan igual, y el amarillo aparece
 * solo cuando el cliente pasa por encima (en un PC) o lo toca. Al tocarlo, el
 * mosaico se queda amarillo un instante antes de pasar al siguiente paso: es la
 * confirmacion de "esto elegiste", que en una pantalla tactil no da el cursor.
 */
function SelectType({
  vehicles,
  onSelect,
}: {
  vehicles: PosVehicle[];
  onSelect: (vehicle: PosVehicle) => void;
}) {
  const columns = vehicles.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 kland:grid-cols-4';
  const [elegido, setElegido] = useState<VehicleType | null>(null);

  function elegir(vehicle: PosVehicle) {
    if (elegido) return;
    setElegido(vehicle.vehicleType);
    // Lo justo para ver el amarillo; mas, y se siente lento.
    setTimeout(() => onSelect(vehicle), 180);
  }

  return (
    <div className="step-in relative mx-auto flex w-full max-w-[38rem] flex-1 flex-col kland:max-w-5xl">
      <div className="pt-[6vh] kland:pt-2">
        <KioskTitle title="Bienvenido" subtitle="Selecciona tu vehículo para continuar" />
      </div>

      <div className={`mt-12 grid gap-5 kland:mt-6 kland:gap-4 ${columns}`}>
        {vehicles.map((vehicle) => {
          const activo = elegido === vehicle.vehicleType;
          return (
            <button
              key={vehicle.vehicleType}
              onClick={() => elegir(vehicle)}
              aria-pressed={activo}
              className={`group flex aspect-[1.22] flex-col items-center justify-center gap-5 rounded-[1.6rem] transition-[background-color,transform,color] duration-150 hover:bg-brand-500 hover:text-ink-950 active:scale-[0.97] active:bg-brand-600 active:text-ink-950 kland:aspect-auto kland:min-h-36 kland:gap-3 kshort:min-h-28 ${
                activo
                  ? 'scale-[0.98] bg-brand-500 text-ink-950'
                  : 'bg-[var(--surface-tile)] text-[var(--text-primary)]'
              }`}
            >
              <VehicleIcon
                type={vehicle.vehicleType}
                className="h-[4.4rem] w-[6rem] kland:h-14 kland:w-20 kshort:h-10 kshort:w-14"
              />
              <span className="text-[1.65rem] font-semibold kland:text-xl kshort:text-base">
                {vehicle.label}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        La escena de la bienvenida, como en la referencia: una franja amarilla a
        cada lado, la de la izquierda subiendo desde la esquina y la de la derecha
        en arco detras del sedan, que entra por la derecha cortado por el borde.
        Decorativo: no se anuncia a lectores de pantalla. En horizontal no cabe y
        se omite; los mosaicos son lo que importa.
      */}
      <div aria-hidden="true" className="pointer-events-none relative mt-auto h-[21rem] kland:hidden">
        <BrandSwoosh
          corner="bottom-left"
          className="swoosh-in absolute -bottom-7 -left-16 h-[19rem] w-[19rem] text-brand-500"
        />
        <BrandSwoosh className="swoosh-in absolute -bottom-12 -right-20 h-[27rem] w-[27rem] text-brand-500" />
        <Image
          src="/kiosco/sedan.webp"
          alt=""
          width={1400}
          height={1005}
          priority
          unoptimized
          className="drive-in absolute -bottom-6 -right-[6.5rem] w-[30rem] max-w-none drop-shadow-[0_22px_18px_rgb(11_11_11/0.22)]"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------ Paso 2: identificar */

function Identify({
  vehicle,
  value,
  onChange,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  vehicle: PosVehicle;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  // El CODIGO es alfanumerico (`A7B48`), asi que lleva teclado completo igual
  // que la placa. Solo el TICKET_ID —que Nova Parking ya no usa— es numerico.
  const numeric = vehicle.identifierKind === 'TICKET_ID';
  const maxLength = numeric ? 12 : 7;
  const porCodigo = vehicle.identifierKind !== 'PLATE';

  /*
    Lector de codigos QR.

    El escaner del kiosco se comporta como un teclado: "escribe" el contenido del
    QR a toda velocidad y termina con Enter. Si el campo tiene el foco, eso ya
    funciona solo. El problema es que casi nunca lo tiene: el cliente toca el
    teclado en pantalla, el foco se va a un boton, y lo que manda el escaner cae
    en el vacio.

    Por eso se escucha en toda la ventana mientras dure este paso. Se acumula en
    una referencia y no en el estado, porque el escaner manda las teclas mas
    rapido de lo que React vuelve a pintar, y leyendo `value` del cierre se
    perderian caracteres.
  */
  const actual = useRef(value);
  actual.current = value;
  const campo = useRef<HTMLInputElement>(null);

  /*
    Texto crudo de la lectura en curso.

    El QR puede traer el codigo solo (tiquete impreso) o un ENLACE que termina en el
    codigo (`https://.../t/A7B48`, el de la pantalla de entrada, o la foto que el cliente
    le tomo). Si se limpiara tecla por tecla, el enlace quedaria en algo como
    "HTTPSPAG..." y ademas se cortaria a los 7 caracteres, antes de llegar al codigo. Por
    eso se guarda lo que manda el escaner tal cual y se extrae el codigo del final.

    Una pausa larga entre teclas marca el comienzo de otra lectura.
  */
  const crudo = useRef('');
  const ultimaTecla = useRef(0);

  useEffect(() => {
    const extraer = (texto: string) => {
      const tramo = texto.includes('/')
        ? (texto.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() ?? '')
        : texto;
      const limpio = numeric
        ? tramo.replace(/\D/g, '')
        : tramo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return limpio.slice(0, maxLength);
    };

    const alTeclear = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === 'Enter') {
        if (actual.current.length > 0) {
          event.preventDefault();
          crudo.current = '';
          onSubmit();
        }
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        const siguiente = actual.current.slice(0, -1);
        crudo.current = siguiente;
        actual.current = siguiente;
        onChange(siguiente);
        return;
      }

      if (event.key.length !== 1) return;
      event.preventDefault();

      const ahora = Date.now();
      if (ahora - ultimaTecla.current > 600) crudo.current = actual.current;
      ultimaTecla.current = ahora;

      crudo.current += event.key;
      const siguiente = extraer(crudo.current);
      actual.current = siguiente;
      onChange(siguiente);
    };

    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [numeric, maxLength, onChange, onSubmit]);

  return (
    /*
      Vertical: titulo, campo, teclado, Consultar y Atras, en ese orden, porque se
      escribe antes de enviar. Horizontal (kland): campo y botones a la izquierda,
      teclado a la derecha, porque ahi lo que falta es alto.
    */
    <KioskStep pie={<BackLink onClick={onBack} />}>
      <div className="kland:grid kland:grid-cols-2 kland:items-center kland:gap-10">
        <div className="space-y-7 kland:space-y-4">
          {/*
            El titulo sale del tipo de dato y no de la configuracion guardada del
            sitio: asi dice lo mismo que la referencia ("Ingresa la placa") y no
            depende de como alguien lo escribio en la base.
          */}
          <KioskTitle
            title={porCodigo ? 'Ingresa el código' : 'Ingresa la placa'}
            subtitle={porCodigo ? undefined : 'Digita la placa de tu vehículo'}
          />

          {porCodigo ? (
            <div className="mx-auto max-w-[30rem] space-y-3 kshort:space-y-1">
              <p className="flex items-center gap-3 text-lg font-semibold text-[var(--text-primary)] kshort:text-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-ink-950">
                  <MdQrCodeScanner className="h-6 w-6" aria-hidden focusable="false" />
                </span>
                Acerca el QR de tu tiquete o de tu celular al escáner
              </p>
              <p className="flex items-center gap-3 text-lg text-[var(--text-secondary)] kshort:text-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tile)]">
                  <MdKeyboard className="h-6 w-6" aria-hidden focusable="false" />
                </span>
                O escribe el código de 5 caracteres
              </p>
            </div>
          ) : null}

          {/*
            Solo muestra: todo lo que se escribe entra por el teclado en pantalla o
            por el escaner, y lo maneja el oyente de arriba. Si el campo aceptara
            teclas por su cuenta, un QR con enlace leido con el foco aqui se
            limpiaria letra por letra y se cortaria antes de llegar al codigo.
          */}
          <div className="relative">
            <input
              ref={campo}
              value={value}
              readOnly
              placeholder={vehicle.inputPlaceholder}
              inputMode="none"
              aria-label={porCodigo ? 'Código del tiquete' : 'Placa del vehículo'}
              className="tnum h-[6.2rem] w-full rounded-[1.4rem] bg-[var(--surface-sunken)] px-20 text-center text-[3.4rem] font-bold tracking-[0.14em] text-[var(--text-primary)] ring-2 ring-inset ring-[var(--ring-soft)] transition-shadow duration-150 placeholder:font-semibold placeholder:tracking-[0.14em] placeholder:text-[var(--ring-strong)] focus:outline-none focus:ring-brand-500 kland:h-20 kland:text-4xl kshort:h-16 kshort:text-3xl"
            />
            {value ? (
              <button
                type="button"
                onClick={() => onChange('')}
                aria-label="Borrar lo escrito"
                className="absolute right-5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface-tile)] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-tile-hover)]"
              >
                <MdClose className="h-6 w-6" aria-hidden focusable="false" />
              </button>
            ) : null}
          </div>

          {error ? <Notice tone="bad">{error}</Notice> : null}
        </div>

        <div className="mt-8 space-y-6 kland:mt-0 kland:space-y-4">
          <Keypad
            mode={numeric ? 'numeric' : 'alphanumeric'}
            onKey={(key) => onChange((value + key).slice(0, maxLength))}
            onBackspace={() => onChange(value.slice(0, -1))}
            onClear={() => onChange('')}
          />
          <PrimaryButton onClick={onSubmit} disabled={busy || value.length === 0}>
            {busy ? 'Consultando...' : 'Consultar'}
          </PrimaryButton>
        </div>
      </div>
    </KioskStep>
  );
}

/* ------------------------------------- Paso 3: confirmar que es su vehiculo */

/**
 * "¿Este es tu vehiculo?" con la foto de la entrada.
 *
 * POR QUE ESTE PASO. Una placa mal tecleada o un codigo de otro tiquete llevan
 * a cobrarle a un vehiculo que no es el suyo, y de eso nadie se entera hasta que
 * la barrera no abre. La foto la tomo la camara al entrar: el cliente reconoce
 * su carro en un segundo, mucho antes de que pueda leer una placa en la pantalla.
 *
 * SIN FOTO TAMBIEN SIRVE. Mientras el sistema del parqueadero no publique sus
 * imagenes —hoy estan cerradas en el tunel— el paso se queda igual, con los
 * datos del tiquete en grande. El paso NO se salta al faltar la foto: la
 * confirmacion es el punto, la foto es la ayuda.
 */
function ConfirmVehicle({
  lookup,
  vehicleType,
  vehicleLabel,
  onConfirm,
  onReject,
}: {
  lookup: LookupResult;
  vehicleType: VehicleType | null;
  vehicleLabel: string | null;
  onConfirm: () => void;
  onReject: () => void;
}) {
  // `falla` cubre los dos casos de "no se ve": que no haya ruta y que la imagen
  // no cargue (que es lo que pasa hoy, con /media/ cerrado en el tunel).
  const [falla, setFalla] = useState(!lookup.photo);
  const url = lookup.photo
    ? `/api/pos/foto?src=${encodeURIComponent(lookup.photo)}`
    : null;

  return (
    <KioskStep>
      <KioskTitle
        title={falla ? 'Confirma tu vehículo' : '¿Este es tu vehículo?'}
        subtitle={
          falla
            ? 'Revisa que los datos sean los de tu vehículo antes de continuar.'
            : 'Así entró al parqueadero. Si no es el tuyo, vuelve y revisa el dato.'
        }
      />

      <InfoCard className="overflow-hidden">
        {falla ? (
          <div className="flex h-[13rem] flex-col items-center justify-center gap-3 bg-[var(--surface-tile)] text-[var(--text-muted)] kland:h-32">
            <MdNoPhotography className="h-14 w-14" aria-hidden focusable="false" />
            <p className="px-6 text-lg kshort:text-sm">El parqueadero no tiene foto de esta entrada.</p>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- la sirve
             nuestra propia ruta; pasarla por el optimizador de Next la volveria
             a bajar por el tunel en cada tamano. */
          <img
            src={url ?? ''}
            alt="Foto del vehículo al entrar al parqueadero"
            onError={() => setFalla(true)}
            className="h-[19rem] w-full bg-[var(--surface-tile)] object-cover kland:h-44"
          />
        )}
        <PlateHeader
          identifier={lookup.plate ?? lookup.code ?? '—'}
          vehicleType={vehicleType}
          vehicleLabel={lookup.vehicleTypeLabel ?? vehicleLabel}
        />
        <dl className="divide-y divide-[var(--line-subtle)] px-7 py-2 kland:px-5">
          <InfoRow label="Hora de entrada" value={horaDeEntrada(lookup.entryAt)} />
          <InfoRow label="Tiempo de estadía" value={formatDuration(lookup.minutes)} />
        </dl>
      </InfoCard>

      <div className="grid gap-4">
        <PrimaryButton onClick={onConfirm}>
          Sí, es mi vehículo
        </PrimaryButton>
        <SecondaryButton onClick={onReject}>No es el mío</SecondaryButton>
      </div>
    </KioskStep>
  );
}

/** Fecha y hora de ingreso como la reconoce el cliente: "29 sep 2026 - 10:24 a. m.". */
function horaDeEntrada(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  const dia = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  }).format(fecha);
  const hora = new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  }).format(fecha);
  return `${dia.replace('.', '')} - ${hora}`;
}

/* ------------------------------------------------------- Paso 5: resumen */

function Summary({
  lookup,
  customer,
  searched,
  vehicleType,
  vehicleLabel,
  identifierKind,
  error,
  busy,
  onPay,
  onRetry,
}: {
  lookup: LookupResult;
  customer: CustomerData | null;
  /** Lo que el cliente escribio, para mostrarselo si no se encontro. */
  searched: string;
  vehicleType: VehicleType | null;
  /**
   * Lo que el cliente eligio en la primera pantalla. El sistema del parqueadero
   * no siempre devuelve el tipo de vehiculo, y sin esto la fila quedaba en un
   * guion — justo el dato que el cliente acaba de indicar.
   */
  vehicleLabel: string | null;
  identifierKind: VehicleIdentifierKind;
  error: string | null;
  busy: boolean;
  onPay: () => void;
  onRetry: () => void;
}) {
  const canPay = lookup.found && !lookup.alreadyPaid && (lookup.amount ?? 0) > 0;
  /*
    Encontrado pero en $0: el sistema del parqueadero no tiene tarifa para ese tipo (o
    el vehiculo acaba de entrar). Antes caia en "No encontramos tu vehiculo", que es
    falso y hacia creer que la busqueda fallo.
  */
  const sinValor = lookup.found && !lookup.alreadyPaid && (lookup.amount ?? 0) <= 0;

  if (!canPay) {
    const noEncontrado = !lookup.found && !lookup.alreadyPaid;
    return (
      <KioskStep>
        <div className="space-y-6 text-center">
          <ResultDisc tone={noEncontrado ? 'bad' : 'warn'} />
          <KioskTitle
            title={
              lookup.alreadyPaid
                ? 'Este tiquete ya fue pagado'
                : sinValor
                  ? 'No hay valor por cobrar'
                  : identifierKind === 'PLATE'
                    ? 'No se encontró la placa'
                    : 'No se encontró el código'
            }
            subtitle={
              sinValor
                ? 'Encontramos tu vehículo, pero el parqueadero no tiene un valor para cobrar en este momento. Acércate a la oficina del parqueadero.'
                : (lookup.notice ?? 'Verifica el dato ingresado e intenta nuevamente.')
            }
          />
        </div>

        {noEncontrado && searched ? (
          <div className="tnum flex h-[6.2rem] items-center justify-center rounded-[1.4rem] bg-[var(--surface-sunken)] text-[3rem] font-bold tracking-[0.14em] text-[var(--text-primary)] ring-2 ring-inset ring-[var(--ring-soft)] kland:h-20 kland:text-4xl">
            {searched}
          </div>
        ) : null}

        {/* Ayuda concreta en vez de dejar al cliente adivinando. */}
        {noEncontrado ? (
          <p className="mx-auto max-w-[30rem] text-center text-lg leading-snug text-[var(--text-muted)] kshort:text-sm">
            {identifierKind === 'PLATE'
              ? 'Revisa que la placa esté completa y sin espacios. Si el problema sigue, acércate a la oficina del parqueadero.'
              : 'Revisa el código impreso en tu tiquete: son cinco caracteres, como A7B48. Si el problema sigue, acércate a la oficina del parqueadero.'}
          </p>
        ) : null}

        <PrimaryButton onClick={onRetry}>Intentar de nuevo</PrimaryButton>
      </KioskStep>
    );
  }

  return (
    <KioskStep pie={<BackLink onClick={onRetry} disabled={busy} />}>
      <div className="flex items-center justify-center gap-4">
        <CheckBadge />
        <div>
          <h1 className="text-[2.2rem] font-bold leading-tight tracking-[-0.03em] text-[var(--text-primary)] kland:text-2xl">
            Vehículo encontrado
          </h1>
          <p className="text-lg text-[var(--text-secondary)] kshort:text-sm">
            Revisa el detalle antes de pagar
          </p>
        </div>
      </div>

      <InfoCard>
        {/*
          Se muestra la placa o el CODIGO, nunca el id interno de Nova Parking: es
          un autoincremental y ensenarlo dejaria deducir el de los vehiculos de al
          lado.
        */}
        <PlateHeader
          identifier={lookup.plate ?? lookup.code ?? '—'}
          vehicleType={vehicleType}
          vehicleLabel={lookup.vehicleTypeLabel ?? vehicleLabel}
        />
        <dl className="divide-y divide-[var(--line-subtle)] px-7 py-2 kland:px-5">
          <InfoRow label="Hora de entrada" value={horaDeEntrada(lookup.entryAt)} />
          <InfoRow label="Tiempo de estadía" value={formatDuration(lookup.minutes)} />
          {customer ? (
            <InfoRow label="Factura a" value={`${customer.firstName} ${customer.lastName}`.trim()} />
          ) : lookup.customerName ? (
            <InfoRow label="Cliente" value={lookup.customerName} />
          ) : null}
        </dl>
      </InfoCard>

      <TotalBlock amount={formatCOP(lookup.amount ?? 0)} />

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <PrimaryButton onClick={onPay} disabled={busy}>
        <MdCreditCard className="h-8 w-8" aria-hidden focusable="false" />
        {busy ? 'Enviando al datáfono...' : 'Pagar con tarjeta'}
      </PrimaryButton>
    </KioskStep>
  );
}

/* -------------------------------------------------------- Paso 6: espera */

/**
 * Espera del datafono.
 *
 * El aparato esta conectado por SERIAL y no cobra solo: la orden queda puesta y
 * alguien tiene que iniciarla fisicamente. Por eso la pantalla dice exactamente
 * que hacer en cada etapa: primero, con la foto del datafono y el boton
 * senalado; despues, con el arco amarillo dando vueltas mientras se procesa.
 *
 * Una vez el cliente inicia la operacion NO hay salida: ni cancelar, ni volver,
 * ni recargar sin aviso. Abandonar la pantalla con una transaccion viva es como
 * se pierde el rastro de un cobro que quiza ya se aprobo.
 */
function Waiting({
  payment,
  vehicleType,
  onCancel,
  busy,
}: {
  payment: PaymentDTO;
  vehicleType: VehicleType;
  onCancel: () => void;
  busy: boolean;
}) {
  // Mientras el datafono no haya tomado la operacion, cancelar es seguro, y es
  // tambien el unico momento en que el cliente tiene que tocar el aparato.
  const enDatafono = payment.stage === 'WAITING_TERMINAL';

  if (enDatafono) {
    return (
      <KioskStep>
        {/* La instruccion la decide el servidor a partir del estado real del
            datafono, no el navegador adivinando. */}
        <div aria-live="polite">
          <KioskTitle
            title={
              <>
                Toca{' '}
                <span className="whitespace-nowrap rounded-[0.35em] bg-brand-500 px-[0.25em] text-ink-950 [box-decoration-break:clone]">
                  Iniciar cobro
                </span>{' '}
                en el datáfono
              </>
            }
            subtitle="Está en la pantalla del datáfono, como en esta foto."
          />
        </div>

        {/*
          Foto real del datafono con el boton que hay que pulsar. Escrito con
          palabras, la gente se queda mirando el kiosco esperando que pase algo;
          con la foto del mismo aparato que tiene delante, lo encuentra sola.
        */}
        <figure className="mx-auto w-full max-w-[24rem] kland:max-w-[14rem]">
          <Image
            src="/datafono-iniciar-cobro.jpg"
            alt="Pantalla del datáfono con el botón verde Iniciar cobro resaltado"
            width={1254}
            height={1254}
            priority
            className="w-full rounded-[1.4rem] ring-1 ring-[var(--line-subtle)]"
          />
        </figure>

        <TotalBlock amount={formatCOP(payment.amount)} label="Valor a pagar" />

        <SecondaryButton onClick={onCancel} disabled={busy}>
          {busy ? 'Cancelando...' : 'Cancelar cobro'}
        </SecondaryButton>
      </KioskStep>
    );
  }

  return (
    <KioskStep>
      <div className="space-y-10 text-center kland:space-y-5">
        <Orbita>
          {payment.stage === 'READING_CARD' ? (
            <MdCreditCard className="h-[4.2rem] w-[4.2rem]" aria-hidden focusable="false" />
          ) : (
            <VehicleIcon type={vehicleType} className="h-[4.2rem] w-[5.6rem]" />
          )}
        </Orbita>

        <div aria-live="polite">
          <KioskTitle title="Procesando tu pago" subtitle={payment.instruction} />
        </div>

        <p className="tnum text-[2.6rem] font-bold tracking-[-0.02em] text-[var(--text-primary)] kland:text-3xl">
          {formatCOP(payment.amount)}
        </p>
      </div>

      <StageTrail stage={payment.stage} />

      {payment.cardBrand || payment.cardMask ? (
        <p className="text-center text-lg text-[var(--text-secondary)]">
          {[payment.cardBrand, payment.cardMask].filter(Boolean).join(' ')}
        </p>
      ) : null}

      <Notice tone="warn">Cobro en curso. Espera aquí hasta ver el resultado.</Notice>
    </KioskStep>
  );
}

/**
 * El arco amarillo que da vueltas alrededor del vehiculo: la unica animacion
 * continua del kiosco, reservada para el unico momento en que el cliente no
 * puede hacer nada y necesita saber que el sistema sigue vivo.
 */
function Orbita({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[13rem] w-[13rem] kland:h-36 kland:w-36">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="7" className="stroke-[var(--accent-soft)]" />
        <g className="orbit">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="90 186"
            className="stroke-brand-500"
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[var(--text-primary)]">
        {children}
      </div>
    </div>
  );
}

/**
 * Las tres etapas del datafono, para que el cliente vea el avance. Sin esto,
 * entre que se envia la orden y pasa la tarjeta pueden correr cuarenta segundos
 * en los que la pantalla parece congelada.
 */
function StageTrail({ stage }: { stage: TerminalStage }) {
  const steps: { key: TerminalStage; label: string }[] = [
    { key: 'WAITING_TERMINAL', label: 'Iniciar en el datáfono' },
    { key: 'STARTED', label: 'Operación iniciada' },
    { key: 'READING_CARD', label: 'Leyendo la tarjeta' },
  ];
  const current = steps.findIndex((s) => s.key === stage);

  return (
    <ol className="mx-auto grid w-full max-w-[30rem] gap-3">
      {steps.map((item, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li
            key={item.key}
            className={`flex items-center gap-4 text-xl kshort:text-sm ${
              active
                ? 'font-semibold text-[var(--text-primary)]'
                : done
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                done
                  ? 'bg-ok-500 text-white'
                  : active
                    ? 'bg-brand-500 text-ink-950'
                    : 'ring-2 ring-inset ring-[var(--ring-soft)]'
              }`}
            >
              {done ? (
                <MdCheck className="h-5 w-5" aria-hidden focusable="false" />
              ) : active ? (
                <span className="h-2.5 w-2.5 rounded-full bg-ink-950" />
              ) : null}
            </span>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------ Paso 7: resultado */

/** Cuanto se espera a que SIIGO emita la factura antes de imprimir el comprobante en su lugar. */
const ESPERA_FACTURA_MS = 30_000;
const SONDEO_FACTURA_MS = 2_000;

/**
 * Que papel sale del kiosco.
 *   factura-en-camino  SIIGO la esta emitiendo: se espera.
 *   factura            ya existe: se imprime la factura.
 *   comprobante        no llego a tiempo (o la facturacion no esta activa): se imprime
 *                      el comprobante de pago, con el QR que abre la factura despues.
 */
type Impresion = 'factura-en-camino' | 'factura' | 'comprobante';

function Result({
  payment,
  error,
  onDone,
  impresoraUsb,
  conCorreo,
  issuer,
}: {
  payment: PaymentDTO;
  error: string | null;
  onDone: () => void;
  /** Hay una impresora USB autorizada y conectada: el papel sale por ahi. */
  impresoraUsb: boolean;
  /** El cliente dio correo: el comprobante y la factura le llegan alli. */
  conCorreo: boolean;
  issuer: ReceiptIssuer;
}) {
  const approved = payment.status === 'APPROVED';
  // Se decide al mostrar el resultado: desconectar el cable a mitad no cambia el plan.
  const [imprimir] = useState(() => approved && impresoraUsb);
  /** La impresora no respondio: el comprobante queda en pantalla, como sin impresora. */
  const [sinPapel, setSinPapel] = useState(false);
  const mostrarComprobante = approved && (!imprimir || sinPapel);
  const [seconds, setSeconds] = useState(RESULT_TIMEOUT_S);
  const [impresion, setImpresion] = useState<Impresion>('factura-en-camino');
  const [factura, setFactura] = useState<InvoiceDocumentDTO | null>(null);
  /** true cuando ya se imprimio (o no hay que imprimir): empieza la cuenta atras. */
  const [listo, setListo] = useState(!imprimir);

  /*
    Espera de la factura. SIIGO la emite en segundo plano unos segundos despues de
    aprobarse el pago; se pregunta cada 2 s. El cliente no se queda esperando mas de
    30 s: pasado ese tiempo sale el comprobante y la factura le llega al correo.
  */
  useEffect(() => {
    if (!imprimir || impresion !== 'factura-en-camino') return;

    let vigente = true;
    let timer: ReturnType<typeof setTimeout>;
    const inicio = Date.now();

    const consultar = async () => {
      try {
        const response = await fetch(`/api/pos/payments/${payment.id}/factura`);
        if (response.ok) {
          const data = (await response.json()) as InvoicePrintDTO;
          if (!vigente) return;
          if (data.status === 'READY' && data.document) {
            setFactura(data.document);
            setImpresion('factura');
            return;
          }
          if (data.status === 'UNAVAILABLE') {
            setImpresion('comprobante');
            return;
          }
        }
      } catch {
        // Un corte de red momentaneo no cambia nada: se vuelve a preguntar.
      }
      if (!vigente) return;
      if (Date.now() - inicio >= ESPERA_FACTURA_MS) {
        setImpresion('comprobante');
        return;
      }
      timer = setTimeout(consultar, SONDEO_FACTURA_MS);
    };

    timer = setTimeout(consultar, 1_000);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [imprimir, impresion, payment.id]);

  /*
    Respaldo: si por algo el papel no llega a imprimirse (el QR no se dibuja, el
    navegador no responde), la pantalla no se queda detenida.
  */
  useEffect(() => {
    if (listo || impresion === 'factura-en-camino') return;
    const respaldo = setTimeout(() => setListo(true), 10_000);
    return () => clearTimeout(respaldo);
  }, [listo, impresion]);

  /*
    Se imprime UNA vez, por USB directo (`usb-printer.ts`). La referencia evita dos
    papeles: en modo estricto React monta los efectos dos veces. No hay boton de
    "imprimir de nuevo" a proposito — en un kiosco sin nadie vigilando, alguien lo
    pulsaria hasta acabar el rollo.

    Sin impresora, o si no responde, NO se imprime por el navegador: el comprobante
    queda en pantalla y el servidor lo envia al correo del cliente (`receipt-email.ts`).
  */
  const yaImprimio = useRef(false);

  useEffect(() => {
    if (!imprimir || impresion === 'factura-en-camino' || yaImprimio.current) return;

    let vigente = true;
    (async () => {
      const impresora = await impresoraEmparejada().catch(() => null);
      if (!vigente) return;
      if (!impresora) {
        setSinPapel(true);
        setListo(true);
        return;
      }

      yaImprimio.current = true;
      try {
        const datos =
          impresion === 'factura' && factura
            ? facturaEscPos(factura, payment)
            : comprobanteEscPos(payment, issuer);
        await imprimirPorUsb(impresora, datos);
        if (vigente) setListo(true);
      } catch (error) {
        // Autorizada pero no abre (cable suelto, sin papel): el comprobante queda en pantalla.
        console.error('[kiosco] no se pudo imprimir por USB', error);
        if (!vigente) return;
        setSinPapel(true);
        setListo(true);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [imprimir, impresion, factura, payment, issuer]);

  /*
    La pantalla vuelve sola: nadie del parqueadero esta ahi para dejarla lista
    para el siguiente cliente.

    Son dos temporizadores a proposito. El regreso al inicio va por su cuenta, y
    la cuenta atras solo alimenta el texto de la pantalla. Estaban juntos: se
    llamaba a `onDone()` dentro del updater de `setSeconds`, y React ejecuta esos
    updaters durante el renderizado — o sea que se cambiaba el estado del padre
    mientras este componente se pintaba (el aviso "Cannot update a component
    while rendering a different component"), y en modo estricto podia dispararse
    dos veces.
  */
  useEffect(() => {
    // Mientras se espera o se imprime el papel, la pantalla no vuelve al inicio.
    if (!listo) return;

    const total = mostrarComprobante ? RECEIPT_TIMEOUT_S : RESULT_TIMEOUT_S;
    setSeconds(total);
    const volverAlInicio = setTimeout(onDone, total * 1000);
    const cuentaAtras = setInterval(() => {
      setSeconds((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    return () => {
      clearTimeout(volverAlInicio);
      clearInterval(cuentaAtras);
    };
  }, [onDone, listo, mostrarComprobante]);

  const mensaje = !approved
    ? (error ?? payment.failureReason ?? 'La transacción no se completó.')
    : mostrarComprobante
      ? conCorreo
        ? 'Puedes retirar el vehículo. Este comprobante también te llega al correo, y allí recibirás tu factura electrónica.'
        : 'Puedes retirar el vehículo. Si necesitas este comprobante, tómale una foto.'
      : impresion === 'factura-en-camino'
        ? 'Estamos generando tu factura. Espera un momento para recogerla.'
        : impresion === 'factura'
          ? 'Puedes retirar el vehículo. Recoge tu factura. También llegará a tu correo.'
          : 'Puedes retirar el vehículo. Recoge tu comprobante: la factura electrónica llegará a tu correo.';

  const identificador = payment.plate ?? payment.ticketCode ?? payment.vehicleIdentifier;

  return (
    <KioskStep>
      <div className="space-y-6 text-center">
        <ResultDisc tone={approved ? 'ok' : 'bad'} size={mostrarComprobante ? 'md' : 'lg'} />
        <div aria-live="polite">
          <KioskTitle
            title={approved ? '¡Pago exitoso!' : 'Pago no completado'}
            subtitle={mensaje}
          />
        </div>
      </div>

      {approved && payment.parkingPending ? (
        <Notice tone="warn">
          Tu pago quedó aprobado, pero la barrera no recibió el aviso. Acércate a la oficina del
          parqueadero con tu comprobante para salir.
        </Notice>
      ) : null}

      {mostrarComprobante ? (
        <ReceiptScreen doc={comprobante(payment, issuer)} />
      ) : approved ? (
        <InfoCard>
          <dl className="divide-y divide-[var(--line-subtle)] px-7 py-2 kland:px-5">
            {identificador ? (
              <InfoRow label={payment.plate ? 'Placa' : 'Código'} value={identificador} />
            ) : null}
            <InfoRow
              label="Fecha y hora"
              value={horaDeEntrada(payment.resolvedAt ?? payment.createdAt)}
            />
            {payment.stayMinutes !== null ? (
              <InfoRow label="Tiempo total" value={formatDuration(payment.stayMinutes)} />
            ) : null}
            <InfoRow label="Valor pagado" value={`${formatCOP(payment.amount)} COP`} />
            {payment.cardBrand || payment.cardMask ? (
              <InfoRow
                label="Método de pago"
                value={`${payment.cardBrand ?? 'Tarjeta'}${payment.cardMask ? ` ${payment.cardMask}` : ''}`}
              />
            ) : null}
            {payment.authorizationCode ? (
              <InfoRow label="Autorización" value={payment.authorizationCode} />
            ) : null}
          </dl>
        </InfoCard>
      ) : null}

      {listo ? (
        /*
          Fijo al pie: con el comprobante en pantalla (y su QR) el contenido pasa
          del alto del monitor, y "Finalizar" no puede quedar escondido debajo.
        */
        <div className="sticky bottom-0 -mx-2 space-y-3 bg-[var(--surface-base)] px-2 pb-1 pt-4">
          <PrimaryButton onClick={onDone}>
            Finalizar
          </PrimaryButton>
          <p aria-live="polite" className="text-center text-lg text-[var(--text-muted)] kshort:text-sm">
            La pantalla vuelve al inicio en {seconds} s
          </p>
        </div>
      ) : (
        /* Sin boton de terminar mientras sale el papel: cerrar aqui cancelaria la impresion. */
        <div className="flex min-h-[4.6rem] items-center justify-center gap-4 rounded-[1.1rem] bg-[var(--surface-tile)] px-6 text-xl font-semibold text-[var(--text-primary)] kshort:min-h-14 kshort:text-base">
          <span className="relative flex h-4 w-4">
            <span className="halo absolute inset-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span className="relative h-4 w-4 rounded-full bg-brand-500" aria-hidden="true" />
          </span>
          {impresion === 'factura-en-camino' ? 'Generando tu factura...' : 'Imprimiendo tu comprobante...'}
        </div>
      )}
    </KioskStep>
  );
}
