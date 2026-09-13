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
        <span className="ml-2 text-xs text-bad-400">{state.message}</span>
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
      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-50"
    >
      {pending ? '...' : active ? 'Desactivar' : 'Activar'}
    </button>
  );
}
