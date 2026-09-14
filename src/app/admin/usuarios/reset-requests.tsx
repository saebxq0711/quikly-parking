'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardHeader, formatDateTime } from '@/components/ui';
import { dismissResetRequest } from '../actions';

/**
 * Solicitudes de contrasena olvidada.
 *
 * El sistema no envia correos, asi que estas solicitudes son el canal real: la
 * persona las registra desde el login y aparecen aqui. Se resuelven con
 * "Restablecer clave" sobre su usuario, o se descartan si no procede.
 *
 * Una solicitud cuyo correo no corresponde a ningun usuario tambien aparece: a
 * quien la envio no se le confirma nada —eso le diria a un atacante que correos
 * existen— pero el administrador si debe poder verla.
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
    <Card>
      <CardHeader
        title={`Solicitudes de contrasena (${requests.length})`}
        description="Cambiale la contrasena al usuario desde la lista y entregasela por tu canal habitual."
      />
      <ul className="divide-y divide-[var(--line-subtle)]">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-100">
                {request.email}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {formatDateTime(request.createdAt)}
                {request.userName
                  ? ` · ${request.userName}`
                  : ' · no corresponde a ningun usuario'}
              </p>
            </div>

            <form action={dismissAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <DismissButton />
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DismissButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-50"
    >
      {pending ? '...' : 'Descartar'}
    </button>
  );
}
