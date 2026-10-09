'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { MdLockReset } from 'react-icons/md';
import { formatDateTime } from '@/components/ui';
import { dismissResetRequest } from '../actions';

/**
 * Solicitudes de contrasena olvidada.
 *
 * Es lo unico de Usuarios que alguien esta esperando, por eso va primero y en el
 * tono de aviso. Se resuelven yendo a la persona ("Atender" abre su fila con
 * "Cambiar contrasena" a la mano) o se descartan si no proceden.
 *
 * Una solicitud cuyo correo no corresponde a ningun usuario tambien aparece: a
 * quien la envio no se le confirma nada (eso le diria a un atacante que correos
 * existen), pero el administrador si debe poder verla.
 */
export function ResetRequests({
  requests,
}: {
  requests: {
    id: string;
    email: string;
    createdAt: string;
    userId: string | null;
    userName: string | null;
  }[];
}) {
  const [, dismissAction] = useActionState(dismissResetRequest, null);

  return (
    <section
      aria-labelledby="solicitudes"
      className="overflow-hidden rounded-2xl bg-warn-100/60 ring-1 ring-inset ring-warn-400/40"
    >
      <header className="flex items-start gap-3 px-5 pt-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn-500 text-white">
          <MdLockReset className="h-4.5 w-4.5" aria-hidden focusable="false" />
        </span>
        <div>
          <h2 id="solicitudes" className="text-[15px] font-semibold text-warn-700">
            {requests.length === 1
              ? '1 persona pidió una contraseña nueva'
              : `${requests.length} personas pidieron una contraseña nueva`}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-warn-700/90">
            Cámbiasela desde su fila y entrégasela por tu canal habitual. Después descarta la solicitud.
          </p>
        </div>
      </header>
      <ul className="mt-3 divide-y divide-warn-400/25 border-t border-warn-400/25">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {request.userName ?? request.email}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {request.userName ? `${request.email} · ` : 'No corresponde a ningún usuario · '}
                {formatDateTime(request.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {request.userId ? (
                <a
                  href={`#usuario-${request.userId}`}
                  className="inline-flex h-8 items-center rounded-full bg-ink-950 px-3.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-ink-800"
                >
                  Atender
                </a>
              ) : null}
              <form action={dismissAction}>
                <input type="hidden" name="requestId" value={request.id} />
                <DismissButton />
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DismissButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center rounded-full bg-[var(--surface-raised)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:text-[var(--text-primary)] hover:ring-[var(--ring-strong)] disabled:opacity-50"
    >
      {pending ? '…' : 'Descartar'}
    </button>
  );
}
