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
import {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_TYPES,
  documentType,
  formatDocument,
  isValidDocument,
} from '@/lib/document-types';

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
  /** Tipo de documento, con el codigo de SIIGO (13 cedula, 31 NIT...). */
  idType: string;
  identification: string;
  /** Nombres, o la razon social si es una empresa. */
  firstName: string;
  /** Apellidos. Vacio en una empresa. */
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
  /** Lo devuelve el servidor; si faltara, vale el tipo elegido en pantalla. */
  idType?: string;
  identification: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

/** Los cuatro de siempre, a la vista; el resto detras de "Otro". */
const TIPOS_A_LA_VISTA = ['13', '31', '22', '41'];
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
  const [idType, setIdType] = useState(DEFAULT_DOCUMENT_TYPE);
  const [masTipos, setMasTipos] = useState(false);
  const [identification, setIdentification] = useState('');
  const tipo = documentType(idType);
  const valido = isValidDocument(idType, identification);
  /** Lo que se escribe, limpio para el tipo elegido: digitos, o letras y digitos. */
  const limpiar = (valor: string) =>
    (tipo.numeric ? valor.replace(/\D/g, '') : valor.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, tipo.max);
  const [lookup, setLookup] = useState<CustomerLookup | null>(null);
  const [missingEmail, setMissingEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    if (busy || !valido) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/pos/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType, identification }),
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
            <InfoRow label="Documento" value={formatDocument(lookup.idType ?? idType, lookup.identification)} />
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
                idType: lookup.idType ?? idType,
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
        idType={lookup.idType ?? idType}
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
            title="Tu documento"
            subtitle="Lo usamos para emitir tu factura electrónica."
          />

          {/*
            Tipo de documento: cedula por defecto, y a un toque el NIT de una empresa o
            el documento de un extranjero. Cambiar de tipo borra lo escrito: un numero
            de cedula no sirve como pasaporte.
          */}
          <div role="radiogroup" aria-label="Tipo de documento" className="flex flex-wrap justify-center gap-2.5">
            {DOCUMENT_TYPES.filter(
              (t) => masTipos || TIPOS_A_LA_VISTA.includes(t.code) || t.code === idType,
            ).map((t) => (
              <button
                key={t.code}
                type="button"
                role="radio"
                aria-checked={t.code === idType}
                onClick={() => {
                  setIdType(t.code);
                  setIdentification('');
                  setError(null);
                }}
                className={`min-h-14 rounded-2xl px-5 text-lg font-semibold transition-colors duration-150 kshort:min-h-11 kshort:text-sm ${
                  t.code === idType
                    ? 'bg-brand-500 text-ink-950'
                    : 'bg-[var(--surface-tile)] text-[var(--text-primary)] hover:bg-[var(--surface-tile-hover)]'
                }`}
              >
                {t.short}
              </button>
            ))}
            {!masTipos ? (
              <button
                type="button"
                onClick={() => setMasTipos(true)}
                className="min-h-14 rounded-2xl px-5 text-lg font-semibold text-[var(--text-secondary)] ring-2 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:text-[var(--text-primary)] kshort:min-h-11 kshort:text-sm"
              >
                Otro…
              </button>
            ) : null}
          </div>

          <div className="relative">
            <input
              value={identification}
              onChange={(e) => setIdentification(limpiar(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLookup();
              }}
              inputMode={tipo.numeric ? 'numeric' : 'text'}
              {...SIN_SUGERENCIAS}
              autoCapitalize="characters"
              autoFocus
              aria-label="Número de documento"
              placeholder={tipo.company ? '900123456' : tipo.numeric ? '1098765432' : 'AB123456'}
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

          {tipo.code === '31' ? (
            <p className="text-center text-lg text-[var(--text-muted)] kshort:text-sm">
              Sin el dígito de verificación: lo calculamos nosotros.
            </p>
          ) : null}

          {error ? <Notice tone="bad">{error}</Notice> : null}
        </div>

        <div className="mt-8 space-y-6 kland:mt-0 kland:space-y-4">
          <Keypad
            mode={tipo.numeric ? 'numeric' : 'alphanumeric'}
            onKey={(key) => setIdentification((v) => limpiar(v + key))}
            onBackspace={() => setIdentification((v) => v.slice(0, -1))}
            onClear={() => setIdentification('')}
          />
          <PrimaryButton onClick={handleLookup} disabled={busy || !valido}>
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
  idType,
  identification,
  onSubmit,
  onBack,
}: {
  idType: string;
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

  // Una empresa (NIT) tiene razon social, no nombres y apellidos.
  const empresa = documentType(idType).company;

  const ready =
    firstName.trim().length >= 2 &&
    (empresa || lastName.trim().length >= 2) &&
    (email === '' || EMAIL.test(email));

  return (
    <KioskStep pie={<BackLink onClick={onBack} />}>
      <KioskTitle
        title="Es tu primera vez aquí"
        subtitle={
          empresa
            ? 'Completa los datos de la empresa una sola vez. La próxima la reconoceremos con su NIT.'
            : 'Completa tus datos una sola vez. La próxima te reconoceremos con tu documento.'
        }
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-[1.1rem] bg-[var(--surface-tile)] px-6 py-4 text-lg kshort:text-sm">
          <span className="text-[var(--text-secondary)]">Documento</span>
          <span className="tnum font-semibold text-[var(--text-primary)]">
            {formatDocument(idType, identification)}
          </span>
        </div>

        {empresa ? (
          <TextField
            ref={firstField}
            value={firstName}
            onChange={setFirstName}
            placeholder="Razón social"
            autoCapitalize="words"
          />
        ) : (
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
        )}

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
            idType,
            identification,
            firstName: firstName.trim(),
            lastName: empresa ? '' : lastName.trim(),
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
