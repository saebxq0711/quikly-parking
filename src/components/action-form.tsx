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
  submitVariant = 'primary',
  secondaryAction,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  onSuccessReset?: boolean;
  /**
   * `confirm` (negro) cuando la pantalla tiene varios formularios: el amarillo es
   * para la UNICA accion principal de cada pantalla (DESIGN.md, The Siguiente Paso Rule).
   */
  submitVariant?: 'primary' | 'confirm';
  /** Accion secundaria junto al boton de enviar (por ejemplo, Cancelar). */
  secondaryAction?: React.ReactNode;
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

      {secondaryAction ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} variant={submitVariant} />
          {secondaryAction}
        </div>
      ) : (
        <SubmitButton label={submitLabel} variant={submitVariant} />
      )}
    </form>
  );
}

function SubmitButton({ label, variant }: { label: string; variant: 'primary' | 'confirm' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
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
