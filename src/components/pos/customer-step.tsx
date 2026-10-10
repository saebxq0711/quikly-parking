'use client';

import { useEffect, useRef, useState } from 'react';
import { MdClose, MdOutlineMail } from 'react-icons/md';
import { Keypad } from './keypad';
import {
  BackLink,
  InfoCard,
  InfoRow,
  KioskStep,
  KioskTitle,
  Notice,
  PrimaryButton,
  SecondaryButton,
} from './kiosk-ui';

/**
 * Identificacion del cliente, antes de pagar.
 *
 * Se le pide el numero de documento. Si ya pago antes, se le saluda por su
 * nombre y no se le vuelve a pedir nada; si es la primera vez, se le piden los
 * datos una sola vez y quedan guardados para la proxima.
 *
 * Por que se pide: la factura electronica sale a su nombre y le llega al CORREO.
 * El correo no se exige (hay personas, sobre todo mayores, que no tienen), pero
 * se pide con su porque a la vista, que es lo que hace que la gente lo de.
 */

export interface CustomerData {
  identification: string;
  firstName: string;
  lastName: string;
  /** Vacio en un cliente que ya existe: el servidor conserva el guardado. */
  phone: string;
  /** Vacio en un cliente que ya existe y tiene correo: el servidor conserva el guardado. */
  email: string;
  /** Si la factura le llegara por correo (para el aviso del final). */
  hasEmail: boolean;
}

/** `phone` y `email` llegan enmascarados (`ju•••@hotmail.com`): solo para mostrar. */
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

/**
 * El kiosco lo usan muchas personas en el mismo navegador: nada de lo que una
 * escriba puede aparecerle sugerido a la siguiente. Por eso ningun campo pide
 * ayuda al navegador (sin `name`, sin `given-name`/`email`/`tel`, el correo es
 * `type="text"`) y todos llevan esto:
 *   - autoComplete off: el navegador no guarda ni ofrece lo escrito antes.
 *   - autoCorrect/spellCheck off: el teclado en pantalla no aprende ni propone
 *     nombres o correos de otros clientes.
 *   - data-lpignore / data-1p-ignore / data-form-type: los gestores de
 *     contrasenas (LastPass, 1Password, Dashlane) no se ofrecen a rellenar.
 */
const SIN_SUGERENCIAS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-form-type': 'other',
} as const;

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
    // El correo no se exige (hay quien no tiene): solo se valida si lo escriben.
    const emailOk = missingEmail === '' || EMAIL.test(missingEmail);

    return (
      <KioskStep>
        <KioskTitle title={`Hola, ${lookup.firstName || lookup.fullName}`} subtitle="Tu factura saldrá con estos datos." />

        <InfoCard>
          <dl className="divide-y divide-[var(--line-subtle)] px-7 py-2 kland:px-5">
            <InfoRow label="Nombre" value={lookup.fullName} />
            <InfoRow label="Documento" value={lookup.identification} />
            {lookup.phone ? <InfoRow label="Teléfono" value={lookup.phone} /> : null}
            {lookup.email ? <InfoRow label="Correo" value={lookup.email} /> : null}
          </dl>
        </InfoCard>

        {needsEmail ? (
          <EmailField value={missingEmail} onChange={setMissingEmail} autoFocus />
        ) : (
          <p className="text-center text-lg text-[var(--text-muted)] kshort:text-sm">
            Tu factura electrónica te llegará a este correo.
          </p>
        )}

        <div className="grid gap-4">
          <PrimaryButton
            onClick={() =>
              onReady({
                identification: lookup.identification,
                firstName: lookup.firstName,
                lastName: lookup.lastName,
                // Lo que se ve esta enmascarado: no se reenvia. Solo viaja el
                // correo que escriba quien no tenia uno.
                phone: '',
                email: needsEmail ? missingEmail.trim().toLowerCase() : '',
                hasEmail: !needsEmail || missingEmail !== '',
              })
            }
            disabled={!emailOk}
          >
            Continuar
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setLookup(null);
              setIdentification('');
              setMissingEmail('');
            }}
          >
            No soy yo
          </SecondaryButton>
        </div>
      </KioskStep>
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
    <KioskStep pie={<BackLink onClick={onBack} />}>
      <div className="kland:grid kland:grid-cols-2 kland:items-center kland:gap-10">
        <div className="space-y-7 kland:space-y-4">
          <KioskTitle
            title="Número de documento"
            subtitle="Lo usamos para emitir tu factura electrónica."
          />

          <div className="relative">
            <input
              value={identification}
              onChange={(e) =>
                setIdentification(e.target.value.replace(/\D/g, '').slice(0, MAX_ID))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup();
              }}
              inputMode="numeric"
              {...SIN_SUGERENCIAS}
              autoFocus
              aria-label="Número de documento"
              placeholder="1098765432"
              className="tnum h-[6.2rem] w-full rounded-[1.4rem] bg-[var(--surface-sunken)] px-20 text-center text-[3.2rem] font-bold tracking-[0.1em] text-[var(--text-primary)] ring-2 ring-inset ring-[var(--ring-soft)] transition-shadow duration-150 placeholder:font-semibold placeholder:text-[var(--ring-strong)] focus:outline-none focus:ring-brand-500 kland:h-20 kland:text-4xl kshort:h-16 kshort:text-3xl"
            />
            {identification ? (
              <button
                type="button"
                onClick={() => setIdentification('')}
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
            mode="numeric"
            onKey={(key) => setIdentification((v) => (v + key).slice(0, MAX_ID))}
            onBackspace={() => setIdentification((v) => v.slice(0, -1))}
            onClear={() => setIdentification('')}
          />
          <PrimaryButton onClick={handleLookup} disabled={busy || identification.length < 5}>
            {busy ? 'Consultando...' : 'Continuar'}
          </PrimaryButton>
        </div>
      </div>
    </KioskStep>
  );
}

/**
 * Datos de un cliente nuevo.
 *
 * Nombre y apellido van en la factura. El correo es a donde llega la factura
 * electronica: se pide sin marcarlo como opcional (casi todos lo dan), pero no
 * se exige. El telefono es opcional y lo dice.
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
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    (email === '' || EMAIL.test(email));

  return (
    <KioskStep pie={<BackLink onClick={onBack} />}>
      <KioskTitle
        title="Es tu primera vez aquí"
        subtitle="Completa tus datos una sola vez. La próxima te reconoceremos con tu documento."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-[1.1rem] bg-[var(--surface-tile)] px-6 py-4 text-lg kshort:text-sm">
          <span className="text-[var(--text-secondary)]">Documento</span>
          <span className="tnum font-semibold text-[var(--text-primary)]">{identification}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            ref={firstField}
            value={firstName}
            onChange={setFirstName}
            placeholder="Nombres"
            autoCapitalize="words"
          />
          <TextField
            value={lastName}
            onChange={setLastName}
            placeholder="Apellidos"
            autoCapitalize="words"
          />
        </div>

        <EmailField value={email} onChange={setEmail} />

        <TextField
          value={phone}
          onChange={(v) => setPhone(v.replace(/[^\d+]/g, ''))}
          placeholder="Teléfono (opcional)"
          inputMode="tel"
          numeric
        />
      </div>

      <PrimaryButton
        onClick={() =>
          onSubmit({
            identification,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim().toLowerCase(),
            hasEmail: email.trim() !== '',
          })
        }
        disabled={!ready}
      >
        Continuar
      </PrimaryButton>
    </KioskStep>
  );
}

/** Campo de texto del kiosco: alto, letra grande y borde que se enciende en amarillo. */
const CAMPO =
  'block h-[4.4rem] w-full rounded-[1.1rem] bg-[var(--surface-sunken)] px-6 text-[1.4rem] text-[var(--text-primary)] ring-2 ring-inset ring-[var(--ring-soft)] transition-shadow duration-150 placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-brand-500 kshort:h-14 kshort:text-base';

function TextField({
  ref,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'off',
  inputMode,
  numeric = false,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'off' | 'words';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  numeric?: boolean;
}) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      {...SIN_SUGERENCIAS}
      autoCapitalize={autoCapitalize}
      inputMode={inputMode}
      className={`${numeric ? 'tnum ' : ''}${CAMPO}`}
    />
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
      <label className="mb-2 flex items-center gap-2.5 text-lg font-semibold text-[var(--text-primary)] kshort:text-sm">
        <MdOutlineMail className="h-6 w-6" aria-hidden focusable="false" />
        Correo electrónico
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="nombre@correo.com"
        aria-label="Correo electrónico"
        aria-describedby="ayuda-correo"
        // Texto y no `type="email"`: ese tipo es lo que mas empuja al navegador a
        // ofrecer correos guardados. El teclado sigue siendo el de correo (inputMode)
        // y la validacion es la de EMAIL.
        inputMode="email"
        type="text"
        {...SIN_SUGERENCIAS}
        autoCapitalize="off"
        autoFocus={autoFocus}
        className={CAMPO}
      />
      {looksWrong ? (
        <p role="alert" className="mt-2 text-lg text-bad-600 night:text-bad-300 kshort:text-sm">
          Revisa el correo: parece incompleto.
        </p>
      ) : (
        <p id="ayuda-correo" className="mt-2 text-lg text-[var(--text-muted)] kshort:text-sm">
          Aquí te enviaremos tu factura electrónica.
        </p>
      )}
    </div>
  );
}
