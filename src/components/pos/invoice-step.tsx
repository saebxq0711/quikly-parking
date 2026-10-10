'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MdChevronRight, MdOutlineReceiptLong, MdPersonOutline } from 'react-icons/md';
import { formatCOP } from '@/components/ui';
import type { PaymentDTO } from '@/lib/payments/serialize';
import { CustomerStep, type CustomerData } from './customer-step';
import { KioskStep, KioskTitle, Notice, ResultDisc, SecondaryButton } from './kiosk-ui';

/**
 * Despues del pago: a nombre de quien va la factura.
 *
 * Se pregunta al final y no antes de cobrar: nadie llena un formulario para un
 * cobro que despues no pasa, y quien no necesita factura propia sale mas rapido.
 *
 *   A mi nombre       documento -> se le saluda si ya vino, o se le piden los datos.
 *   Consumidor final  sin datos.
 *
 * La factura se emite al elegir (`/api/pos/payments/[id]/factura`). Si el cliente
 * se va sin elegir, a `INACTIVIDAD_MS` sin tocar la pantalla sale a consumidor
 * final, y se dice en pantalla para que no sea una sorpresa.
 */

/** Un minuto quieto: el cliente ya pago y probablemente ya se fue. */
const INACTIVIDAD_MS = 60_000;

type Eleccion =
  | { tipo: 'CONSUMIDOR_FINAL' }
  | {
      tipo: 'A_MI_NOMBRE';
      customer: Omit<CustomerData, 'hasEmail'>;
    };

export function InvoiceStep({
  payment,
  onDone,
}: {
  payment: PaymentDTO;
  /** Pago actualizado y si la factura le llegara al correo. */
  onDone: (payment: PaymentDTO, hasEmail: boolean) => void;
}) {
  const [modo, setModo] = useState<'elegir' | 'datos'>('elegir');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un doble toque o la inactividad justo al tocar no mandan dos elecciones.
  const enCurso = useRef(false);

  const enviar = useCallback(
    async (eleccion: Eleccion, hasEmail: boolean) => {
      if (enCurso.current) return;
      enCurso.current = true;
      setEnviando(true);
      setError(null);
      try {
        const response = await fetch(`/api/pos/payments/${payment.id}/factura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eleccion),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          setError(
            data?.error?.message ??
              'No pudimos registrar tu factura. Intenta de nuevo o elige consumidor final.',
          );
          setModo('elegir');
          return;
        }
        onDone(data as PaymentDTO, hasEmail);
      } catch {
        setError('Se perdió la conexión. Intenta de nuevo o elige consumidor final.');
        setModo('elegir');
      } finally {
        enCurso.current = false;
        setEnviando(false);
      }
    },
    [payment.id, onDone],
  );

  /*
    Cliente que se fue: tras un minuto sin tocar nada, consumidor final. Si eso
    tambien falla (sin red), se sigue al comprobante igual: el servidor emite la
    factura de los pagos sin eleccion a los pocos minutos. La pantalla nunca se
    queda esperando a alguien que no esta.
  */
  const fallosPorInactividad = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (fallosPorInactividad.current > 0) {
          onDone(payment, false);
          return;
        }
        fallosPorInactividad.current += 1;
        void enviar({ tipo: 'CONSUMIDOR_FINAL' }, false);
      }, INACTIVIDAD_MS);
    };
    reiniciar();
    const eventos = ['pointerdown', 'keydown'] as const;
    eventos.forEach((evento) => window.addEventListener(evento, reiniciar));
    return () => {
      clearTimeout(timer);
      eventos.forEach((evento) => window.removeEventListener(evento, reiniciar));
    };
  }, [enviar, onDone, payment]);

  if (enviando) {
    return (
      <KioskStep>
        <div className="flex flex-col items-center gap-6 text-center" aria-live="polite">
          <span className="relative flex h-5 w-5">
            <span className="halo absolute inset-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span className="relative h-5 w-5 rounded-full bg-brand-500" aria-hidden="true" />
          </span>
          <KioskTitle title="Generando tu factura" subtitle="Un momento, por favor." />
        </div>
      </KioskStep>
    );
  }

  if (modo === 'datos') {
    return (
      <CustomerStep
        onReady={(cliente) => {
          const { hasEmail, ...customer } = cliente;
          void enviar({ tipo: 'A_MI_NOMBRE', customer }, hasEmail);
        }}
        onBack={() => {
          setModo('elegir');
          setError(null);
        }}
      />
    );
  }

  return (
    <KioskStep>
      <div className="space-y-6 text-center kland:space-y-3">
        <ResultDisc tone="ok" size="md" />
        <KioskTitle
          title="¡Pago exitoso!"
          subtitle={
            <>
              Pagaste <span className="tnum font-semibold text-[var(--text-primary)]">{formatCOP(payment.amount)}</span>.
              ¿Cómo quieres tu factura electrónica?
            </>
          }
        />
      </div>

      <div className="grid gap-4 kland:grid-cols-2">
        <OpcionFactura
          icono={<MdPersonOutline className="h-9 w-9" aria-hidden focusable="false" />}
          titulo="A mi nombre"
          detalle="Con tu número de documento. Te llega al correo."
          onClick={() => {
            setError(null);
            setModo('datos');
          }}
        />
        <OpcionFactura
          icono={<MdOutlineReceiptLong className="h-9 w-9" aria-hidden focusable="false" />}
          titulo="Consumidor final"
          detalle="Sin datos personales. Sales más rápido."
          onClick={() => void enviar({ tipo: 'CONSUMIDOR_FINAL' }, false)}
        />
      </div>

      {error ? (
        <div className="space-y-3">
          <Notice tone="bad">{error}</Notice>
          {/* Sin red no se puede elegir: el pago ya esta hecho y la factura la emite
              el servidor despues. El cliente no se queda atrapado aqui. */}
          <SecondaryButton onClick={() => onDone(payment, false)}>
            Continuar sin elegir
          </SecondaryButton>
        </div>
      ) : (
        <p className="text-center text-lg text-[var(--text-muted)] kshort:text-sm">
          Si no eliges, en un minuto saldrá a consumidor final.
        </p>
      )}
    </KioskStep>
  );
}

/** Una de las dos opciones: grande, con icono, titulo y para que sirve. */
function OpcionFactura({
  icono,
  titulo,
  detalle,
  onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[7.5rem] w-full items-center gap-5 rounded-[1.6rem] bg-[var(--surface-tile)] px-7 text-left text-[var(--text-primary)] transition-[background-color,transform,color] duration-150 hover:bg-brand-500 hover:text-ink-950 active:scale-[0.98] active:bg-brand-600 active:text-ink-950 kshort:min-h-24 kshort:px-5"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-[var(--text-primary)] kshort:h-12 kshort:w-12">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.65rem] font-semibold leading-tight kshort:text-lg">{titulo}</span>
        <span className="mt-1 block text-lg leading-snug text-[var(--text-secondary)] group-hover:text-ink-950/75 group-active:text-ink-950/75 kshort:text-sm">
          {detalle}
        </span>
      </span>
      <MdChevronRight className="h-8 w-8 shrink-0 opacity-60" aria-hidden focusable="false" />
    </button>
  );
}
