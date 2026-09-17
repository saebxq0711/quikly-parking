'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import { PasswordInput } from '@/components/password-input';
import {
  forceLogout,
  resetUserPassword,
  toggleUserActive,
  type ActionResult,
} from '../actions';

/**
 * Acciones sobre un usuario: cambiarle la contrasena, cerrarle la sesion y darle o
 * quitarle acceso.
 *
 * La contrasena nueva la escribe el SuperAdmin dos veces y la entrega por su canal
 * habitual. Sobre la propia cuenta no se ofrece nada de esto: esa se cambia en
 * "Cambiar contrasena", pidiendo la actual.
 */
export function UserActions({
  userId,
  active,
  hasSession,
  isSelf,
  allowLogout = true,
}: {
  userId: string;
  active: boolean;
  hasSession: boolean;
  isSelf: boolean;
  /** Los kioscos los cierra a distancia el administrador del parqueadero, no el SuperAdmin. */
  allowLogout?: boolean;
}) {
  const [reset, resetAction] = useActionState(resetUserPassword, null);
  const [logout, logoutAction] = useActionState(forceLogout, null);
  const [toggle, toggleAction] = useActionState(toggleUserActive, null);
  const [cambiando, setCambiando] = useState(false);

  const feedback: ActionResult | null = reset ?? logout ?? toggle;

  if (isSelf) {
    return <span className="text-xs text-[var(--text-muted)]">Tu cuenta</span>;
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => setCambiando((abierto) => !abierto)}
          aria-expanded={cambiando}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors duration-150 ${
            cambiando
              ? 'bg-brand-500/15 text-brand-200 ring-brand-400/30'
              : 'text-[var(--text-secondary)] ring-white/10 hover:bg-white/[0.06] hover:text-ink-100'
          }`}
        >
          Cambiar contrasena
        </button>

        {hasSession && allowLogout ? (
          <form action={logoutAction}>
            <input type="hidden" name="userId" value={userId} />
            <SmallButton label="Cerrar sesion" pendingLabel="Cerrando..." />
          </form>
        ) : null}

        <form action={toggleAction}>
          <input type="hidden" name="userId" value={userId} />
          <SmallButton
            label={active ? 'Desactivar' : 'Activar'}
            pendingLabel="..."
            tone={active ? 'danger' : 'default'}
          />
        </form>
      </div>

      {cambiando ? (
        <form
          action={resetAction}
          // Tras guardar se limpia, para no volver a enviar la misma contrasena.
          key={reset?.ok ? `ok-${reset.message}` : 'clave'}
          className="page-in mt-3 grid gap-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/10 sm:ml-auto sm:w-80"
        >
          <input type="hidden" name="userId" value={userId} />
          <PasswordInput
            name="password"
            required
            minLength={10}
            placeholder="Nueva contrasena"
            autoComplete="new-password"
            aria-label="Nueva contrasena"
          />
          <PasswordInput
            name="confirmPassword"
            required
            minLength={10}
            placeholder="Repite la contrasena"
            autoComplete="new-password"
            aria-label="Repite la contrasena"
          />
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            Minimo 10 caracteres, con mayusculas, minusculas y un numero.
          </p>
          <SmallButton label="Guardar contrasena" pendingLabel="Guardando..." tone="primary" />
        </form>
      ) : null}

      {feedback ? (
        <div className="mt-3 sm:ml-auto sm:w-80">
          <Alert tone={feedback.ok ? 'success' : 'error'}>{feedback.message}</Alert>
        </div>
      ) : null}
    </div>
  );
}

function SmallButton({
  label,
  pendingLabel,
  tone = 'default',
}: {
  label: string;
  pendingLabel: string;
  tone?: 'default' | 'danger' | 'primary';
}) {
  const { pending } = useFormStatus();
  const tones = {
    default:
      'text-[var(--text-secondary)] ring-white/10 hover:bg-white/[0.06] hover:text-ink-100',
    danger: 'text-bad-300 ring-bad-400/30 hover:bg-bad-500/12',
    primary: 'bg-brand-600 text-white ring-brand-500 hover:bg-brand-500',
  };
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors duration-150 disabled:opacity-60 ${tones[tone]}`}
    >
      {pending ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
