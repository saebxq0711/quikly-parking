'use client';

import { useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Salida del kiosco, oculta a la vista.
 *
 * El kiosco es de autoservicio y esta a la salida del parqueadero: lo usa el
 * cliente, sin nadie del parqueadero al lado. Un boton de "cerrar sesion"
 * visible seria pulsado tarde o temprano y dejaria la caja fuera de servicio.
 *
 * Por eso la salida no se ve: se abre manteniendo pulsado el nombre del
 * parqueadero durante tres segundos, y ademas pide la contrasena. Quien
 * administra el kiosco lo sabe; el cliente no tiene por que descubrirlo.
 *
 * El administrador tambien puede cerrar la sesion a distancia desde su panel,
 * sin desplazarse hasta el kiosco.
 *
 * Se desactiva mientras hay un cobro vivo: no se abandona una transaccion.
 */

const HOLD_MS = 3000;

export function ExitGate({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startHold = () => {
    if (disabled) return;
    timer.current = setTimeout(() => setOpen(true), HOLD_MS);
  };
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  async function handleExit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error?.message ?? 'No fue posible cerrar la sesion.');
        return;
      }

      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setPassword('');
    setError(null);
  }

  return (
    <>
      <div
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        className="min-w-0"
      >
        {children}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6">
          <form
            onSubmit={handleExit}
            className="w-full max-w-sm rounded-2xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)]"
          >
            <h2 className="text-lg font-semibold text-ink-100">
              Cerrar el punto de pago
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Escribe la contrasena del kiosco para salir. El punto de pago
              quedara fuera de servicio hasta que alguien vuelva a entrar.
            </p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="mt-4 block w-full rounded-lg border-0 bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-ink-100 ring-1 ring-inset ring-white/10 transition-shadow duration-150 focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:outline-none"
            />

            {error ? (
              <p role="alert" className="mt-3 text-sm text-bad-400">
                {error}
              </p>
            ) : null}

            {/* La configuracion de la impresora vive detras de este mismo gesto oculto. */}
            <a
              href={`${pathname.replace(/\/pos(\/.*)?$/, '/pos')}/impresora`}
              className="mt-4 inline-block text-sm font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
            >
              Configurar la impresora del kiosco
            </a>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={close}
                className="h-11 flex-1 rounded-lg bg-white/[0.04] text-sm font-semibold text-ink-200 ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/[0.09] hover:ring-white/20"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={busy || password.length === 0}
                className="h-11 flex-1 rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-500 disabled:bg-white/[0.05] disabled:text-ink-600"
              >
                {busy ? 'Saliendo...' : 'Salir'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
