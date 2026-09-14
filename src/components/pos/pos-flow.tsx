'use client';

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
  MdPointOfSale,
  MdQrCodeScanner,
  MdWarningAmber,
} from 'react-icons/md';
import { VehicleIcon } from '@/components/vehicle-icon';
import { formatCOP, formatDuration } from '@/components/ui';
import type { PaymentDTO } from '@/lib/payments/serialize';
import type { InvoiceDocumentDTO, InvoicePrintDTO } from '@/lib/billing/invoice-print';
import { Keypad } from './keypad';
import { ExitGate } from './exit-gate';
import { CustomerStep, type CustomerData } from './customer-step';
import { ReceiptScreen } from './receipt';
import { impresoraEmparejada, imprimirPorUsb, vigilarImpresora } from '@/lib/printing/usb-printer';
import { comprobante, type ReceiptIssuer } from '@/lib/printing/receipt-data';
import { comprobanteEscPos, facturaEscPos } from '@/lib/printing/tickets';

/**
 * Flujo del punto de pago (CLAUDE.md secciones 6, 7, 8 y 27).
 *
 *   Seleccionar vehiculo -> Identificar -> Ver valor -> Confirmar -> Resultado
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
type Step = 'type' | 'identify' | 'customer' | 'summary' | 'waiting' | 'result';

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
  livePayment,
  testMode = false,
}: {
  vehicles: PosVehicle[];
  parkingLotName: string;
  /** Datos del parqueadero para el encabezado del papel impreso. */
  issuer: ReceiptIssuer;
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
    Impresora USB detectada sola: si este navegador tiene una autorizada y esta
    conectada, el kiosco imprime aunque la administracion no haya marcado impresora.
    Se vuelve a revisar cada vez que se conecta o desconecta algo por USB.
  */
  const [impresoraUsb, setImpresoraUsb] = useState(false);
  useEffect(() => vigilarImpresora(setImpresoraUsb), []);
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
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message ?? 'No fue posible consultar.');
        return;
      }
      const result = data as LookupResult;
      setLookup(result);
      // Solo se pide el documento si de verdad hay algo que cobrar.
      const cobrable = result.found && !result.alreadyPaid && (result.amount ?? 0) > 0;
      setStep(cobrable ? 'customer' : 'summary');
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
        setError('El total se actualizo porque paso mas tiempo. Revisalo antes de pagar.');
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
    Inactividad a media operacion: se vuelve al inicio para que el siguiente
    cliente encuentre la pantalla limpia. Cualquier toque reinicia la cuenta.
  */
  useEffect(() => {
    if (step !== 'identify' && step !== 'customer' && step !== 'summary') return;

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
          'No recibimos respuesta del datafono. Si el cobro salio de tu cuenta, acercate a la oficina del parqueadero con este mensaje.',
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
    <main className="touch-surface flex min-h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line-subtle)] px-5 py-3 kland:py-2">
        {/*
          El nombre del parqueadero es lo unico que el cliente necesita ver aqui.
          Mantenerlo pulsado tres segundos abre la salida del kiosco, que pide
          contrasena: asi el personal puede cerrarlo sin que haya un boton a la
          vista que cualquiera pulse.
        */}
        <ExitGate disabled={isWaiting}>
          <p className="truncate text-sm font-semibold text-ink-100">
            {parkingLotName}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">
            Punto de pago
            {testMode ? (
              <span className="ml-2 rounded bg-warn-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-300 ring-1 ring-warn-400/30">
                Modo de pruebas
              </span>
            ) : null}
          </p>
        </ExitGate>

        {step !== 'type' && step !== 'waiting' ? (
          <button
            onClick={reset}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100"
          >
            Cancelar
          </button>
        ) : null}
      </header>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-6 kland:py-3">
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

        {step === 'customer' ? (
          <CustomerStep
            onReady={(data) => {
              setCustomer(data);
              setStep('summary');
            }}
            onBack={() => {
              setStep('identify');
              setError(null);
            }}
          />
        ) : null}

        {step === 'summary' && lookup ? (
          <Summary
            lookup={lookup}
            customer={customer}
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
          <Waiting payment={payment} onCancel={handleCancel} busy={busy} />
        ) : null}

        {step === 'result' && payment ? (
          <Result
            payment={payment}
            error={error}
            onDone={reset}
            impresoraUsb={impresoraUsb}
            issuer={issuer}
          />
        ) : null}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------ Paso 1: tipo */

function SelectType({
  vehicles,
  onSelect,
}: {
  vehicles: PosVehicle[];
  onSelect: (vehicle: PosVehicle) => void;
}) {
  // Con 4 opciones, 2x2 en vertical y una sola fila en horizontal. Con menos,
  // la rejilla se ajusta sola para que no queden huecos.
  const columns =
    vehicles.length <= 2
      ? 'grid-cols-2'
      : 'grid-cols-2 kland:grid-cols-4';

  return (
    <div className="step-in w-full max-w-3xl text-center kland:max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight kland:text-2xl kshort:text-xl">
        Bienvenido
      </h1>
      <p className="mt-2 text-lg text-[var(--text-secondary)] kland:mt-1 kland:text-base">
        Selecciona tu vehiculo
      </p>

      <div className={`mt-8 grid gap-4 kland:mt-5 kland:gap-3 ${columns}`}>
        {vehicles.map((vehicle) => (
          <button
            key={vehicle.vehicleType}
            onClick={() => onSelect(vehicle)}
            className="group flex min-h-44 flex-col items-center justify-center gap-4 rounded-3xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)] transition-[background-color,box-shadow] duration-150 hover:bg-brand-600 hover:ring-brand-400/50 active:bg-brand-700 kland:min-h-36 kland:gap-2.5 kland:p-4 kshort:min-h-28"
          >
            <span className="h-24 w-24 text-brand-300 transition-colors duration-150 group-hover:text-white kland:h-16 kland:w-16 kshort:h-12 kshort:w-12">
              <VehicleIcon type={vehicle.vehicleType} />
            </span>
            <span className="text-xl font-semibold uppercase tracking-wide kland:text-base kshort:text-sm">
              {vehicle.label}
            </span>
          </button>
        ))}
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
      Tres bloques independientes cuyo ORDEN cambia con la orientacion:

        Vertical            Horizontal
        1 campo             1 campo    | 2 teclado
        2 teclado           3 botones  |
        3 botones

      Se colocan por rejilla en vez de anidarlos, porque anidando los botones
      junto al campo el teclado quedaba DEBAJO de "Consultar" en vertical: se
      escribia despues de ver el boton de enviar, que es justo al reves.
    */
    <div className="step-in grid w-full max-w-xl gap-5 kland:max-w-5xl kland:grid-cols-2 kland:grid-rows-[auto_auto] kland:items-center kland:gap-x-10 kland:gap-y-6">
      <div className="text-center kland:col-start-1 kland:row-start-1 kland:text-left">
        <h1 className="text-2xl font-semibold tracking-tight">
          {vehicle.inputLabel}
        </h1>
        {porCodigo ? (
          <div className="mt-3 space-y-2 text-left kland:mt-2">
            <p className="flex items-center gap-2.5 text-base font-medium text-ink-100 kshort:text-sm">
              <MdQrCodeScanner className="h-6 w-6 shrink-0 text-brand-300" aria-hidden focusable="false" />
              Usa el escaner con el QR de tu tiquete o de tu celular
            </p>
            <p className="flex items-center gap-2.5 text-base text-[var(--text-secondary)] kshort:text-sm">
              <MdKeyboard className="h-6 w-6 shrink-0 text-[var(--text-muted)]" aria-hidden focusable="false" />
              O digita manualmente el codigo de 5 caracteres
            </p>
          </div>
        ) : (
          <p className="mt-2 text-base text-[var(--text-secondary)] kshort:text-sm">
            Digita la placa de tu vehiculo
          </p>
        )}

        {/*
          Solo muestra: todo lo que se escribe entra por el teclado en pantalla o por el
          escaner, y lo maneja el oyente de arriba. Si el campo aceptara teclas por su
          cuenta, un QR con enlace leido con el foco aqui se limpiaria letra por letra y se
          cortaria antes de llegar al codigo.
        */}
        <input
          ref={campo}
          value={value}
          readOnly
          placeholder={vehicle.inputPlaceholder}
          inputMode="none"
          aria-label={vehicle.inputLabel}
          className="tnum mt-5 w-full rounded-2xl bg-[var(--surface-sunken)] px-5 py-6 text-center text-5xl font-bold tracking-[0.18em] text-ink-50 ring-2 ring-inset ring-white/12 transition-shadow duration-150 placeholder:text-2xl placeholder:font-medium placeholder:tracking-normal placeholder:text-[var(--text-muted)] focus:ring-brand-500 focus:outline-none kland:py-5 kland:text-4xl kshort:mt-4 kshort:py-3.5 kshort:text-3xl"
        />

        {error ? (
          <p
            role="alert"
            className="mt-3 text-[15px] leading-relaxed text-bad-400"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="kland:col-start-2 kland:row-start-1 kland:row-span-2 kland:self-center">
        <Keypad
          mode={numeric ? 'numeric' : 'alphanumeric'}
          onKey={(key) => onChange((value + key).slice(0, maxLength))}
          onBackspace={() => onChange(value.slice(0, -1))}
          onClear={() => onChange('')}
        />
      </div>

      <div className="flex gap-3 kland:col-start-1 kland:row-start-2">
        <button
          onClick={onBack}
          className="min-h-16 flex-1 rounded-2xl bg-white/[0.04] text-base font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:text-ink-100 kshort:min-h-13"
        >
          Atras
        </button>
        <button
          onClick={onSubmit}
          disabled={busy || value.length === 0}
          className="min-h-16 flex-[2] rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 disabled:bg-white/[0.05] disabled:text-ink-600 kshort:min-h-13"
        >
          {busy ? 'Consultando...' : 'Consultar'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Paso 3: resumen */

function Summary({
  lookup,
  customer,
  vehicleLabel,
  identifierKind,
  error,
  busy,
  onPay,
  onRetry,
}: {
  lookup: LookupResult;
  customer: CustomerData | null;
  /**
   * Lo que el cliente eligio en la primera pantalla. El sistema del parqueadero
   * no devuelve el tipo de vehiculo en la busqueda, asi que sin esto la fila
   * quedaba en un guion — justo el dato que el cliente acaba de indicar.
   */
  vehicleLabel: string | null;
  identifierKind: VehicleIdentifierKind;
  error: string | null;
  busy: boolean;
  onPay: () => void;
  onRetry: () => void;
}) {
  const canPay = lookup.found && !lookup.alreadyPaid && (lookup.amount ?? 0) > 0;

  if (!canPay) {
    return (
      <div className="step-in w-full max-w-lg text-center">
        <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-full bg-warn-500/12 ring-1 ring-warn-400/25 kland:h-14 kland:w-14">
          <MdWarningAmber
            className="h-9 w-9 text-warn-400 kland:h-7 kland:w-7"
            aria-hidden
            focusable="false"
          />
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight kland:text-xl">
          {lookup.alreadyPaid ? 'Este tiquete ya fue pagado' : 'No encontramos tu vehiculo'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[17px] leading-relaxed text-[var(--text-secondary)] kland:text-base">
          {lookup.notice ?? 'Verifica el dato ingresado e intenta nuevamente.'}
        </p>

        {/* Ayuda concreta en vez de dejar al operador adivinando. */}
        {!lookup.found && !lookup.alreadyPaid ? (
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
            {identifierKind === 'PLATE'
              ? 'Revisa que la placa este completa y sin espacios. Si el problema sigue, acercate a la oficina del parqueadero.'
              : 'Revisa el codigo impreso en tu tiquete: son cinco caracteres, como A7B48. Si el problema sigue, acercate a la oficina del parqueadero.'}
          </p>
        ) : null}

        <button
          onClick={onRetry}
          className="mt-7 min-h-15 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 kshort:min-h-12"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="step-in w-full max-w-lg kland:max-w-3xl">
      <div className="rounded-3xl bg-[var(--surface-raised)] p-7 ring-1 ring-[var(--line-subtle)] kland:grid kland:grid-cols-2 kland:items-center kland:gap-8 kland:p-6">
        <div className="text-center kland:text-left">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Total a pagar
          </p>
          <p className="tnum mt-2 text-6xl font-bold tracking-tight text-ink-50 kland:text-5xl kshort:text-4xl">
            {formatCOP(lookup.amount ?? 0)}
          </p>
        </div>

        <dl className="mt-7 space-y-3 border-t border-[var(--line-subtle)] pt-6 text-sm kland:mt-0 kland:border-l kland:border-t-0 kland:pt-0 kland:pl-8">
          <Row label="Vehiculo" value={lookup.vehicleTypeLabel ?? vehicleLabel ?? '—'} />
          {/*
            Se muestra la placa o el CODIGO, nunca el id interno de Nova
            Parking: ese es un autoincremental secuencial y enseñarlo dejaria
            deducir el de los vehiculos de al lado.
          */}
          <Row
            label={lookup.plate ? 'Placa' : 'Codigo'}
            value={lookup.plate ?? lookup.code ?? '—'}
          />
          <Row label="Permanencia" value={formatDuration(lookup.minutes)} />
          {customer ? (
            <Row
              label="Factura a"
              value={`${customer.firstName} ${customer.lastName}`.trim()}
            />
          ) : lookup.customerName ? (
            <Row label="Cliente" value={lookup.customerName} />
          ) : null}
        </dl>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 text-center text-[15px] leading-relaxed text-bad-400"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <button
          onClick={onRetry}
          className="min-h-15 flex-1 rounded-2xl bg-white/[0.04] text-base font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:text-ink-100 kshort:min-h-12"
        >
          Atras
        </button>
        <button
          onClick={onPay}
          disabled={busy}
          className="min-h-15 flex-[2] rounded-2xl bg-ok-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-ok-500 active:bg-ok-600 disabled:bg-white/[0.05] disabled:text-ink-600 kshort:min-h-12"
        >
          {busy ? 'Enviando al datafono...' : 'Pagar con tarjeta'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium text-ink-100">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------- Paso 4: espera */

/**
 * Espera del datafono.
 *
 * El aparato esta conectado por SERIAL y no cobra solo: la orden queda puesta y
 * alguien tiene que iniciarla fisicamente. Por eso esta pantalla no dice
 * "procesando" y ya, sino exactamente que hacer en cada etapa.
 *
 * Una vez el cliente inicia la operacion en el datafono NO hay salida: ni
 * cancelar, ni volver, ni recargar sin aviso. Abandonar la pantalla con una
 * transaccion viva es como se pierde el rastro de un cobro que quiza ya se
 * aprobo.
 */
function Waiting({
  payment,
  onCancel,
  busy,
}: {
  payment: PaymentDTO;
  onCancel: () => void;
  busy: boolean;
}) {
  // Mientras el datafono no haya tomado la operacion, cancelar es seguro.
  const canCancel = payment.stage === 'WAITING_TERMINAL';

  return (
    <div className="step-in w-full max-w-lg text-center kland:max-w-3xl kland:text-left">
      <div className="kland:flex kland:items-center kland:gap-10">
        <div className="relative mx-auto flex h-28 w-28 shrink-0 items-center justify-center kland:mx-0 kland:h-24 kland:w-24">
          <span className="halo absolute inset-0 rounded-full bg-brand-500/35" />
          <span className="relative flex h-22 w-22 items-center justify-center rounded-full bg-brand-600 kland:h-20 kland:w-20">
            <TerminalGlyph stage={payment.stage} />
          </span>
        </div>

        <div className="min-w-0">
          <p className="tnum mt-7 text-4xl font-bold tracking-tight text-ink-50 kland:mt-0 kland:text-3xl">
            {formatCOP(payment.amount)}
          </p>

          {/* La instruccion la decide el servidor a partir del estado real del
              datafono, no el navegador adivinando. */}
          <h1
            aria-live="polite"
            className="mt-3 text-2xl font-semibold leading-snug tracking-tight kland:text-xl"
          >
            {payment.instruction}
          </h1>

          <StageTrail stage={payment.stage} />

          {payment.cardBrand || payment.cardMask ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {[payment.cardBrand, payment.cardMask].filter(Boolean).join(' ')}
            </p>
          ) : null}
        </div>
      </div>

      {canCancel ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="mt-9 min-h-14 w-full rounded-2xl bg-white/[0.04] text-base font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:text-ink-100 disabled:text-ink-600 kland:mt-6 kshort:min-h-12"
        >
          {busy ? 'Cancelando...' : 'Cancelar cobro'}
        </button>
      ) : (
        <p className="mt-9 rounded-2xl bg-warn-500/10 px-5 py-4 text-sm leading-relaxed text-warn-300 ring-1 ring-inset ring-warn-400/25 kland:mt-6">
          Cobro en curso. Espera aqui hasta ver el resultado.
        </p>
      )}
    </div>
  );
}

/**
 * Las tres etapas del datafono, para que el operador vea el avance.
 * Sin esto, entre que se envia la orden y el cliente pasa la tarjeta pueden
 * pasar cuarenta segundos en los que la pantalla parece congelada.
 */
function StageTrail({ stage }: { stage: TerminalStage }) {
  const steps: { key: TerminalStage; label: string }[] = [
    { key: 'WAITING_TERMINAL', label: 'Iniciar en el datafono' },
    { key: 'STARTED', label: 'Operacion iniciada' },
    { key: 'READING_CARD', label: 'Leyendo la tarjeta' },
  ];
  const current = steps.findIndex((s) => s.key === stage);

  return (
    <ol className="mt-5 space-y-2.5">
      {steps.map((item, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li
            key={item.key}
            className={`flex items-center gap-3 text-sm ${
              active
                ? 'text-ink-100'
                : done
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${
                done
                  ? 'bg-ok-500/20 ring-ok-400/40'
                  : active
                    ? 'bg-brand-500/25 ring-brand-400/50'
                    : 'ring-white/12'
              }`}
            >
              {done ? (
                <MdCheck className="h-3 w-3 text-ok-400" aria-hidden focusable="false" />
              ) : active ? (
                <span className="h-2 w-2 rounded-full bg-brand-300" />
              ) : null}
            </span>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
}

function TerminalGlyph({ stage }: { stage: TerminalStage }) {
  if (stage === 'READING_CARD') {
    return (
      <MdCreditCard
        className="h-11 w-11 text-white kland:h-10 kland:w-10"
        aria-hidden
        focusable="false"
      />
    );
  }

  // Datafono con teclado: el mismo aparato que el cliente tiene delante.
  return (
    <MdPointOfSale
      className="h-11 w-11 text-white kland:h-10 kland:w-10"
      aria-hidden
      focusable="false"
    />
  );
}

/* ------------------------------------------------------ Paso 5: resultado */

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
  issuer,
}: {
  payment: PaymentDTO;
  error: string | null;
  onDone: () => void;
  /** Hay una impresora USB autorizada y conectada: el papel sale por ahi. */
  impresoraUsb: boolean;
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
    ? (error ?? payment.failureReason ?? 'La transaccion no se completo.')
    : mostrarComprobante
      ? 'Puedes retirar el vehiculo. Este comprobante tambien te llega al correo, y alli recibiras tu factura electronica.'
      : impresion === 'factura-en-camino'
        ? 'Estamos generando tu factura. Espera un momento para recogerla.'
        : impresion === 'factura'
          ? 'Puedes retirar el vehiculo. Recoge tu factura. Tambien llegara a tu correo.'
          : 'Puedes retirar el vehiculo. Recoge tu comprobante: la factura electronica llegara a tu correo.';

  return (
    <div className="step-in w-full max-w-xl text-center">
      <div
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ring-1 kland:h-16 kland:w-16 ${
          approved
            ? 'bg-ok-500/12 ring-ok-400/25'
            : 'bg-bad-500/12 ring-bad-400/25'
        }`}
      >
        {approved ? (
          <MdCheck
            className="h-10 w-10 text-ok-400 kland:h-8 kland:w-8"
            aria-hidden
            focusable="false"
          />
        ) : (
          <MdClose
            className="h-10 w-10 text-bad-400 kland:h-8 kland:w-8"
            aria-hidden
            focusable="false"
          />
        )}
      </div>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight kland:text-2xl">
        {approved ? 'Pago aprobado' : 'Pago no completado'}
      </h1>
      <p
        aria-live="polite"
        className="mx-auto mt-3 max-w-md text-[17px] leading-relaxed text-[var(--text-secondary)] kland:text-base"
      >
        {mensaje}
      </p>

      {mostrarComprobante ? (
        <ReceiptScreen doc={comprobante(payment, issuer)} />
      ) : approved ? (
        <dl className="mt-7 space-y-3 rounded-2xl bg-[var(--surface-raised)] p-6 text-left text-sm ring-1 ring-[var(--line-subtle)] kland:mt-5 kland:grid kland:grid-cols-2 kland:gap-x-8 kland:space-y-0">
          <Row label="Valor pagado" value={formatCOP(payment.amount)} />
          {payment.authorizationCode ? (
            <Row label="Autorizacion" value={payment.authorizationCode} />
          ) : null}
          {payment.receiptNumber ? (
            <Row label="Recibo" value={payment.receiptNumber} />
          ) : null}
          {payment.cardBrand ? (
            <Row
              label="Tarjeta"
              value={`${payment.cardBrand}${payment.cardMask ? ` ${payment.cardMask}` : ''}`}
            />
          ) : null}
        </dl>
      ) : null}

      {listo ? (
        <>
          <button
            onClick={onDone}
            autoFocus
            className="mt-8 min-h-15 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 kland:mt-6 kshort:min-h-12"
          >
            Finalizar
          </button>

          <p aria-live="polite" className="mt-3 text-sm text-[var(--text-muted)]">
            La pantalla vuelve al inicio en {seconds} s
          </p>
        </>
      ) : (
        /* Sin boton de terminar mientras sale el papel: cerrar aqui cancelaria la impresion. */
        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl bg-white/[0.04] px-5 py-4 text-base text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 kland:mt-6">
          <span className="halo relative h-3 w-3 rounded-full bg-brand-400" aria-hidden="true" />
          {impresion === 'factura-en-camino' ? 'Generando tu factura...' : 'Imprimiendo...'}
        </div>
      )}

    </div>
  );
}
