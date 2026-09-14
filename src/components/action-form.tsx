'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button } from '@/components/ui';
import type { ActionResult } from '@/app/admin/actions';

/**
 * Envoltorio para formularios que llaman a una accion de servidor.
 *
 * Centraliza el estado de envio y el mensaje de resultado, para que cada
 * formulario administrativo se limite a declarar sus campos.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  onSuccessReset = true,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  onSuccessReset?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      // Limpiar tras el exito evita volver a enviar los mismos datos por error.
      key={onSuccessReset && state?.ok ? `ok-${state.message}` : 'form'}
      className="space-y-4"
    >
      {children}

      {state ? (
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <span
          className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-3px]"
          aria-hidden="true"
        />
      ) : null}
      {pending ? 'Guardando...' : label}
    </Button>
  );
}
