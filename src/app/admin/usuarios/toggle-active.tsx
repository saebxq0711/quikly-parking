'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { toggleUserActive } from '../actions';

/**
 * Activa o desactiva un usuario. Al desactivarlo, el servidor revoca sus
 * sesiones abiertas, asi que pierde el acceso de inmediato.
 */
export function ToggleActiveButton({
  userId,
  active,
}: {
  userId: string;
  active: boolean;
}) {
  const [state, formAction] = useActionState(toggleUserActive, null);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton active={active} />
      {state && !state.ok ? (
        <span className="ml-2 text-xs text-bad-600">{state.message}</span>
      ) : null}
    </form>
  );
}

function SubmitButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--ring-soft)] transition-colors duration-150 hover:bg-[var(--fill-soft-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
    >
      {pending ? '...' : active ? 'Desactivar' : 'Activar'}
    </button>
  );
}
