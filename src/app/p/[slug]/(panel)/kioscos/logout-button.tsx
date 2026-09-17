'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MdLogout } from 'react-icons/md';
import { closeKioskSession } from './actions';

export function KioskLogoutButton({ userId, enLinea }: { userId: string; enLinea: boolean }) {
  const [estado, accion] = useActionState(closeKioskSession, null);

  return (
    <form
      action={accion}
      onSubmit={(event) => {
        if (!window.confirm('¿Cerrar la sesion de este kiosco? La pantalla tendra que volver a iniciar sesion.')) {
          event.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <Boton disabled={!enLinea} />
      {estado ? (
        <p className={`text-xs leading-relaxed ${estado.ok ? 'text-ok-300' : 'text-bad-300'}`}>
          {estado.message}
        </p>
      ) : null}
    </form>
  );
}

function Boton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-bad-300 ring-1 ring-inset ring-bad-400/30 transition-colors duration-150 hover:bg-bad-500/12 disabled:cursor-not-allowed disabled:text-[var(--text-muted)] disabled:ring-white/10 disabled:hover:bg-transparent"
    >
      {pending ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        <MdLogout className="h-4 w-4" aria-hidden focusable="false" />
      )}
      {pending ? 'Cerrando...' : 'Cerrar sesion'}
    </button>
  );
}
