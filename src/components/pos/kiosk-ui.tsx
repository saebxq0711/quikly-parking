'use client';

import { MdArrowBack, MdCheck, MdClose, MdPriorityHigh } from 'react-icons/md';
import type { VehicleType } from '@prisma/client';
import { VehicleIcon } from '@/components/vehicle-icon';

/**
 * Piezas del kiosco.
 *
 * El kiosco se lee como senaletica de parqueadero: un panel por decision, el
 * amarillo solo en lo que hay que tocar ahora y en el dinero, y los datos que
 * importan (la placa, el total) a escala de letrero. Estas piezas fijan ese
 * vocabulario para que las siete pantallas hablen igual.
 *
 * Todo en `rem`: en el monitor de 27" la raiz sube (globals.css) y la pantalla
 * entera crece en proporcion.
 */

/* ------------------------------------------------------------ Paso */

/**
 * Esqueleto de un paso: el contenido centrado en el alto disponible y, abajo,
 * la fila de "Atras". En el monitor vertical sobra alto; centrar evita que todo
 * se amontone arriba con un vacio enorme debajo.
 */
export function KioskStep({
  children,
  pie,
  ancho = 'max-w-[36rem]',
}: {
  children: React.ReactNode;
  pie?: React.ReactNode;
  ancho?: string;
}) {
  return (
    <div className={`step-in mx-auto flex w-full flex-1 flex-col ${ancho} kland:max-w-5xl`}>
      <div className="flex flex-1 flex-col justify-center gap-8 py-6 kland:gap-4 kland:py-3">
        {children}
      </div>
      {pie ? <div className="flex items-center gap-4">{pie}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Titulo */

export function KioskTitle({
  title,
  subtitle,
  align = 'center',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'text-center' : 'text-left'}>
      <h1 className="text-balance text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)] kland:text-3xl kshort:text-2xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-[32rem] text-pretty text-xl leading-snug text-[var(--text-secondary)] kland:mt-2 kland:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Botones */

const BOTON_BASE =
  'inline-flex w-full items-center justify-center gap-3 rounded-[1.1rem] font-bold transition-[background-color,transform,box-shadow,color] duration-150 active:scale-[0.985] disabled:active:scale-100';

/**
 * La accion principal: amarilla con texto negro. Una sola por pantalla.
 * Sin color propio cuando esta deshabilitada: un amarillo apagado sigue
 * pareciendo tocable.
 */
export function PrimaryButton({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BOTON_BASE} min-h-[4.6rem] bg-brand-500 px-8 text-[1.45rem] text-ink-950 hover:bg-brand-400 active:bg-brand-600 disabled:bg-[var(--fill-strong)] disabled:text-[var(--text-muted)] disabled:shadow-none kshort:min-h-14 kshort:text-lg ${className}`}
    />
  );
}

/** Accion secundaria: blanca con borde, del mismo alto que la principal. */
export function SecondaryButton({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BOTON_BASE} min-h-[4.6rem] bg-[var(--surface-raised)] px-6 text-[1.2rem] font-semibold text-[var(--text-primary)] ring-2 ring-inset ring-[var(--ring-soft)] hover:ring-[var(--ring-strong)] disabled:text-[var(--text-muted)] kshort:min-h-14 kshort:text-base ${className}`}
    />
  );
}

/**
 * "Atras", como en la referencia: un enlace quieto abajo a la izquierda, no un
 * boton que compita con la accion principal.
 */
export function BackLink({
  onClick,
  label = 'Atrás',
  disabled,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-14 items-center gap-2.5 rounded-xl px-3 text-xl font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--fill-soft)] disabled:opacity-40 kshort:min-h-11 kshort:text-base"
    >
      <MdArrowBack className="h-7 w-7 kshort:h-5 kshort:w-5" aria-hidden focusable="false" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------ Resultado */

const DISCO = {
  ok: 'bg-ok-50 text-ok-600 night:bg-ok-500/15 night:text-ok-300',
  bad: 'bg-bad-50 text-bad-600 night:bg-bad-500/15 night:text-bad-300',
  warn: 'bg-warn-100/70 text-warn-600 night:bg-warn-500/15 night:text-warn-300',
} as const;

/**
 * El disco de un resultado: verde con chulito, rojo con equis, naranja con
 * admiracion. El chulito se DIBUJA (es el cierre del cobro, el momento que el
 * cliente estaba esperando); los otros dos aparecen quietos.
 */
export function ResultDisc({
  tone,
  size = 'lg',
}: {
  tone: keyof typeof DISCO;
  size?: 'lg' | 'md';
}) {
  const caja = size === 'lg' ? 'h-[6.4rem] w-[6.4rem]' : 'h-20 w-20';
  return (
    <div
      className={`settle mx-auto flex shrink-0 items-center justify-center rounded-full ${caja} ${DISCO[tone]} kland:h-16 kland:w-16`}
    >
      {tone === 'ok' ? (
        <svg viewBox="0 0 48 48" className="h-1/2 w-1/2" aria-hidden="true" focusable="false">
          <path
            d="M11 25 L20 34 L37 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="draw-check"
            style={{ '--trazo': 48 } as React.CSSProperties}
          />
        </svg>
      ) : tone === 'bad' ? (
        <MdClose className="h-1/2 w-1/2" aria-hidden focusable="false" />
      ) : (
        <MdPriorityHigh className="h-1/2 w-1/2" aria-hidden focusable="false" />
      )}
    </div>
  );
}

/** Chulito pequeno junto a un titulo ("Vehiculo encontrado"). */
export function CheckBadge() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ok-500 text-white kland:h-10 kland:w-10">
      <MdCheck className="h-7 w-7" aria-hidden focusable="false" />
    </span>
  );
}

/* ------------------------------------------------------------ Datos */

/** Tarjeta de datos del vehiculo o del pago: blanca, de borde fino. */
export function InfoCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.4rem] bg-[var(--surface-raised)] ring-1 ring-[var(--line-subtle)] shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="text-lg text-[var(--text-secondary)] kshort:text-sm">{label}</dt>
      <dd className="tnum text-right text-lg font-semibold text-[var(--text-primary)] kshort:text-sm">
        {value}
      </dd>
    </div>
  );
}

/** Cabecera de la tarjeta: la placa o el codigo a escala de letrero, y el tipo. */
export function PlateHeader({
  identifier,
  vehicleType,
  vehicleLabel,
}: {
  identifier: string;
  vehicleType: VehicleType | null;
  vehicleLabel: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line-subtle)] px-7 py-5 kland:px-5 kland:py-3">
      <p className="tnum text-[2.3rem] font-bold leading-none tracking-[0.04em] text-[var(--text-primary)] kland:text-3xl">
        {identifier}
      </p>
      {vehicleLabel ? (
        <span className="inline-flex items-center gap-2.5 rounded-full bg-brand-500 px-4 py-2 text-lg font-semibold text-ink-950 kshort:text-sm">
          {vehicleType ? <VehicleIcon type={vehicleType} className="h-6 w-7" /> : null}
          {vehicleLabel}
        </span>
      ) : null}
    </div>
  );
}

/**
 * El total. Amarillo palido y la cifra enorme: es lo unico que el cliente tiene
 * que leer antes de pagar, asi que se lee desde lejos.
 */
export function TotalBlock({ amount, label = 'Total a pagar' }: { amount: string; label?: string }) {
  return (
    <div className="rounded-[1.4rem] bg-[var(--accent-soft)] px-7 py-6 ring-1 ring-inset ring-[var(--accent-soft-line)] kland:px-5 kland:py-4">
      <p className="text-xl font-medium text-[var(--text-primary)] kshort:text-sm">{label}</p>
      <p className="tnum mt-1 text-[3.6rem] font-bold leading-none tracking-[-0.03em] text-[var(--text-primary)] kland:text-5xl kshort:text-4xl">
        {amount}
        <span className="ml-3 text-[1.6rem] font-semibold tracking-normal kshort:text-lg">COP</span>
      </p>
    </div>
  );
}

/** Aviso en linea: rojo para errores, naranja para lo que pide atencion. */
export function Notice({
  tone,
  children,
}: {
  tone: 'bad' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <p
      role="alert"
      className={`rounded-2xl px-5 py-4 text-lg leading-snug ring-1 ring-inset kshort:text-sm ${
        tone === 'bad'
          ? 'bg-bad-50 text-bad-700 ring-bad-500/25 night:bg-bad-500/10 night:text-bad-300'
          : 'bg-warn-100/60 text-warn-700 ring-warn-500/30 night:bg-warn-500/10 night:text-warn-300'
      }`}
    >
      {children}
    </p>
  );
}
