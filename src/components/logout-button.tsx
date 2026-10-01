'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MdLogout } from 'react-icons/md';

/** Vive siempre sobre la barra negra del panel, lateral o superior en movil. */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={busy}
      aria-label={compact ? 'Cerrar sesión' : undefined}
      title={compact ? 'Cerrar sesión' : undefined}
      className={
        compact
          ? 'shrink-0 rounded-full p-2 text-[var(--text-on-chrome-muted)] transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-50'
          : 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[var(--text-on-chrome-muted)] transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-50'
      }
    >
      <MdLogout className={compact ? 'h-5 w-5' : 'h-4.5 w-4.5 shrink-0'} aria-hidden focusable="false" />
      {compact ? null : busy ? 'Saliendo...' : 'Cerrar sesión'}
    </button>
  );
}
