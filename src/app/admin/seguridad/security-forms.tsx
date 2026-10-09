'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '@/components/action-form';
import { Field, Input, Select } from '@/components/ui';
import { blockIpAction, unblockIpAction } from '../actions';

/** Bloqueo manual de una IP. */
export function BlockIpForm() {
  return (
    <ActionForm action={blockIpAction} submitLabel="Bloquear IP">
      <Field label="IP" hint="La que aparece en los eventos de abajo.">
        <Input name="ip" required placeholder="181.49.12.30" spellCheck={false} autoComplete="off" />
      </Field>
      <Field label="Por cuanto tiempo">
        <Select name="duration" required defaultValue="1440">
          <option value="60">1 hora</option>
          <option value="1440">1 dia</option>
          <option value="10080">7 dias</option>
          <option value="permanente">Permanente</option>
        </Select>
      </Field>
      <Field label="Motivo (opcional)">
        <Input name="reason" maxLength={150} placeholder="Intentos de acceso al panel" />
      </Field>
    </ActionForm>
  );
}

/** Boton para levantar un bloqueo. */
export function UnblockButton({ ip }: { ip: string }) {
  const [state, formAction] = useActionState(unblockIpAction, null);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="ip" value={ip} />
      <Submit />
      {state && !state.ok ? <span className="ml-2 text-xs text-bad-600">{state.message}</span> : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
    >
      {pending ? '...' : 'Desbloquear'}
    </button>
  );
}
