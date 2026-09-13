'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui';
import {
  forceLogout,
  resetUserPassword,
  toggleUserActive,
  type ActionResult,
} from '../actions';

/**
 * Acciones sobre un usuario.
 *
 * Las tres son la misma decision desde tres angulos: dar o quitar acceso.
 * Restablecer la contrasena muestra la nueva UNA sola vez —no se guarda en
 * claro en ningun lado— y el administrador la entrega por el canal que ya use
 * con esa persona.
 */
export function UserActions({
  userId,
  active,
  hasSession,
}: {
  userId: string;
  active: boolean;
  hasSession: boolean;
}) {
  const [reset, resetAction] = useActionState(resetUserPassword, null);
  const [logout, logoutAction] = useActionState(forceLogout, null);
  const [toggle, toggleAction] = useActionState(toggleUserActive, null);
  const [copied, setCopied] = useState(false);

  const feedback: ActionResult | null = reset ?? logout ?? toggle;

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap gap-2">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <SmallButton label="Restablecer clave" pendingLabel="Generando..." />
        </form>

        {hasSession ? (
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

      {reset?.secret ? (
        <div className="mt-3 rounded-lg bg-ok-500/10 px-4 py-3 ring-1 ring-inset ring-ok-400/25">
          <p className="text-[13px] text-ok-300">
            Contrasena temporal. Se muestra una sola vez.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/30 px-2.5 py-1 font-mono text-sm text-ink-50">
              {reset.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(reset.secret ?? '')
                  .then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-ok-300 ring-1 ring-inset ring-ok-400/30 transition-colors duration-150 hover:bg-ok-500/15"
            >
              {copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
      ) : feedback ? (
        <div className="mt-3">
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
  tone?: 'default' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors duration-150 disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-bad-300 ring-bad-400/30 hover:bg-bad-500/12'
          : 'text-[var(--text-secondary)] ring-white/10 hover:bg-white/[0.06] hover:text-ink-100'
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
