'use client';

import { useEffect, useRef, useState } from 'react';
import { MdOutlineMail } from 'react-icons/md';
import { Keypad } from './keypad';

/**
 * Identificacion del cliente, antes de pagar.
 *
 * Se le pide el numero de documento. Si ya pago antes, se le saluda por su
 * nombre y no se le vuelve a pedir nada; si es la primera vez, se le piden los
 * datos una sola vez y quedan guardados para la proxima.
 *
 * Por que se pide: la factura electronica sale a su nombre y le llega al CORREO.
 * Por eso el correo es obligatorio: sin el, la factura se emite pero el cliente
 * nunca la recibe. Si un cliente conocido no tiene correo guardado, se le pide
 * antes de continuar.
 */

export interface CustomerData {
  identification: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface CustomerLookup {
  found: boolean;
  identification: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

const MAX_ID = 15;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export function CustomerStep({
  onReady,
  onBack,
}: {
  onReady: (customer: CustomerData) => void;
  onBack: () => void;
}) {
  const [identification, setIdentification] = useState('');
  const [lookup, setLookup] = useState<CustomerLookup | null>(null);
  const [missingEmail, setMissingEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (busy || identification.length < 5) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/pos/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identification }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message ?? 'No fue posible consultar.');
        return;
      }
      setMissingEmail('');
      setLookup(data as CustomerLookup);
    } catch {
      setError('No fue posible consultar. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------------- Cliente conocido: se le saluda ------ */
  if (lookup?.found) {
    const needsEmail = !lookup.email;
    const email = needsEmail ? missingEmail : (lookup.email ?? '');
    const emailOk = EMAIL.test(email);

    return (
      <div className="step-in w-full max-w-lg text-center">
        <p className="text-lg text-[var(--text-secondary)]">Hola,</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-ink-50 kland:text-3xl">
          {lookup.fullName}
        </h1>

        <dl className="mt-7 space-y-3 rounded-2xl bg-[var(--surface-raised)] p-6 text-left text-sm ring-1 ring-[var(--line-subtle)]">
          <Row label="Documento" value={lookup.identification} />
          {lookup.phone ? <Row label="Telefono" value={lookup.phone} /> : null}
          {lookup.email ? <Row label="Correo" value={lookup.email} /> : null}
        </dl>

        {needsEmail ? (
          <div className="mt-5 text-left">
            <EmailField value={missingEmail} onChange={setMissingEmail} autoFocus />
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Tu factura electronica saldra con estos datos y te llegara a este correo.
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              setLookup(null);
              setIdentification('');
              setMissingEmail('');
            }}
            className="min-h-16 flex-1 rounded-2xl bg-white/[0.04] text-base font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:text-ink-100 kshort:min-h-13"
          >
            No soy yo
          </button>
          <button
            onClick={() =>
              onReady({
                identification: lookup.identification,
                firstName: lookup.firstName,
                lastName: lookup.lastName,
                phone: lookup.phone ?? '',
                email: email.trim().toLowerCase(),
              })
            }
            disabled={!emailOk}
            className="min-h-16 flex-[2] rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 disabled:bg-white/[0.05] disabled:text-ink-600 kshort:min-h-13"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------- Cliente nuevo: se piden los datos ----- */
  if (lookup && !lookup.found) {
    return (
      <NewCustomerForm
        identification={lookup.identification}
        onSubmit={onReady}
        onBack={() => {
          setLookup(null);
          setIdentification('');
        }}
      />
    );
  }

  /* ------------------------------------------- Se pide el documento ------ */
  return (
    <div className="step-in grid w-full max-w-xl gap-5 kland:max-w-5xl kland:grid-cols-2 kland:grid-rows-[auto_auto] kland:items-center kland:gap-x-10 kland:gap-y-6">
      <div className="text-center kland:col-start-1 kland:row-start-1 kland:text-left">
        <h1 className="text-2xl font-semibold tracking-tight">
          Numero de documento
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Lo usamos para emitir tu factura electronica.
        </p>

        <input
          value={identification}
          onChange={(e) =>
            setIdentification(e.target.value.replace(/\D/g, '').slice(0, MAX_ID))
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleLookup();
          }}
          inputMode="numeric"
          autoFocus
          aria-label="Numero de documento"
          placeholder="1098765432"
          className="tnum mt-5 w-full rounded-2xl bg-[var(--surface-sunken)] px-5 py-6 text-center text-5xl font-bold tracking-[0.12em] text-ink-50 ring-2 ring-inset ring-white/12 transition-shadow duration-150 placeholder:text-2xl placeholder:font-medium placeholder:tracking-normal placeholder:text-[var(--text-muted)] focus:ring-brand-500 focus:outline-none kland:py-5 kland:text-4xl kshort:mt-4 kshort:py-3.5 kshort:text-3xl"
        />

        {error ? (
          <p role="alert" className="mt-3 text-[15px] text-bad-400">
            {error}
          </p>
        ) : null}
      </div>

      <div className="kland:col-start-2 kland:row-start-1 kland:row-span-2 kland:self-center">
        <Keypad
          mode="numeric"
          onKey={(key) => setIdentification((v) => (v + key).slice(0, MAX_ID))}
          onBackspace={() => setIdentification((v) => v.slice(0, -1))}
          onClear={() => setIdentification('')}
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
          onClick={handleLookup}
          disabled={busy || identification.length < 5}
          className="min-h-16 flex-[2] rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 disabled:bg-white/[0.05] disabled:text-ink-600 kshort:min-h-13"
        >
          {busy ? 'Consultando...' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

/**
 * Datos de un cliente nuevo.
 *
 * Nombre, apellido y correo son obligatorios: los dos primeros van en la factura
 * y el correo es a donde llega la factura electronica. El telefono es opcional.
 */
function NewCustomerForm({
  identification,
  onSubmit,
  onBack,
}: {
  identification: string;
  onSubmit: (customer: CustomerData) => void;
  onBack: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  const ready =
    firstName.trim().length >= 2 && lastName.trim().length >= 2 && EMAIL.test(email);

  const field =
    'block w-full rounded-xl bg-[var(--surface-sunken)] px-4 py-4 text-lg text-ink-50 ring-2 ring-inset ring-white/12 transition-shadow duration-150 placeholder:text-[var(--text-muted)] focus:ring-brand-500 focus:outline-none kshort:py-3 kshort:text-base';

  return (
    <div className="step-in w-full max-w-xl">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Es tu primera vez aqui
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Completa tus datos una sola vez. La proxima te reconoceremos con tu
          documento.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
          <span className="text-[var(--text-muted)]">Documento</span>
          <span className="tnum ml-3 font-medium text-ink-100">
            {identification}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            ref={firstField}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Nombres"
            aria-label="Nombres"
            autoComplete="given-name"
            className={field}
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Apellidos"
            aria-label="Apellidos"
            autoComplete="family-name"
            className={field}
          />
        </div>

        <EmailField value={email} onChange={setEmail} />

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
          placeholder="Telefono (opcional)"
          aria-label="Telefono"
          inputMode="tel"
          autoComplete="tel"
          className={`tnum ${field}`}
        />
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="min-h-16 flex-1 rounded-2xl bg-white/[0.04] text-base font-semibold text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:text-ink-100 kshort:min-h-13"
        >
          Atras
        </button>
        <button
          onClick={() =>
            onSubmit({
              identification,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
              email: email.trim().toLowerCase(),
            })
          }
          disabled={!ready}
          className="min-h-16 flex-[2] rounded-2xl bg-brand-600 text-lg font-bold text-white transition-colors duration-150 hover:bg-brand-500 active:bg-brand-700 disabled:bg-white/[0.05] disabled:text-ink-600 kshort:min-h-13"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

/**
 * Campo de correo con la explicacion a la vista.
 *
 * El texto de ayuda no es decoracion: en un kiosco a la salida la gente desconfia
 * de dar su correo, y lo da con gusto cuando entiende que es para su factura.
 */
function EmailField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const looksWrong = value.length > 3 && !EMAIL.test(value);

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-100">
        <MdOutlineMail className="h-4.5 w-4.5 text-brand-300" aria-hidden focusable="false" />
        Correo electronico
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="nombre@correo.com"
        aria-label="Correo electronico"
        aria-describedby="ayuda-correo"
        inputMode="email"
        type="email"
        autoComplete="email"
        autoFocus={autoFocus}
        className="mt-2 block w-full rounded-xl bg-[var(--surface-sunken)] px-4 py-4 text-lg text-ink-50 ring-2 ring-inset ring-white/12 transition-shadow duration-150 placeholder:text-[var(--text-muted)] focus:ring-brand-500 focus:outline-none kshort:py-3 kshort:text-base"
      />
      {looksWrong ? (
        <p role="alert" className="mt-1.5 text-sm text-bad-400">
          Revisa el correo: parece incompleto.
        </p>
      ) : (
        <p id="ayuda-correo" className="mt-1.5 text-sm text-[var(--text-muted)]">
          Aqui te enviaremos tu factura electronica.
        </p>
      )}
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
