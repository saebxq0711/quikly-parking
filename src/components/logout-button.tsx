'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
      className={
        compact
          ? 'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-50'
          : 'w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-50'
      }
    >
      {busy ? 'Saliendo...' : 'Cerrar sesion'}
    </button>
  );
}
