'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdCheckCircle } from 'react-icons/md';
import { Alert, Button, Field, Input } from '@/components/ui';

/**
 * Formulario de la nueva contrasena.
 *
 * Pide confirmacion y la compara en el navegador. No es seguridad —el servidor
 * no sabe ni le importa si escribio dos veces— sino evitar el caso real y muy
 * incomodo de quedar fuera por una tecla mal puesta en la unica oportunidad que
 * da el enlace.
 */
export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirmacion = String(data.get('confirmacion') ?? '');

    if (password !== confirmacion) {
      setError('Las dos contrasenas no coinciden.');
      return;
    }
    if (password.length < 10) {
      setError('La contrasena debe tener al menos 10 caracteres.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/restablecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(
          payload?.message ??
            'No fue posible cambiar la contrasena. Intenta nuevamente.',
        );
        return;
      }

      setListo(true);
      // Un momento para que alcance a leer el mensaje antes de mandarlo a entrar.
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setError('No fue posible conectar. Revisa tu conexion e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (listo) {
    return (
      <div className="text-center">
        <MdCheckCircle
          className="mx-auto h-10 w-10 text-ok-400"
          aria-hidden
          focusable="false"
        />
        <p className="mt-3 text-sm font-medium text-ink-100">
          Contrasena actualizada
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Te llevamos al inicio de sesion.
        </p>
      </div>
    );
  }

  return (
    /* POST por lo mismo que el login: un envio antes de hidratar no debe poner
       la contrasena en la URL. */
    <form method="post" onSubmit={handleSubmit} className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Nueva contrasena" hint="Minimo 10 caracteres.">
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field label="Escribela de nuevo">
        <Input
          type="password"
          name="confirmacion"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Guardando...' : 'Guardar contrasena'}
      </Button>

      <p className="text-center text-xs text-[var(--text-muted)]">
        <Link
          href="/login"
          className="transition-colors duration-150 hover:text-ink-200"
        >
          Volver al inicio de sesion
        </Link>
      </p>
    </form>
  );
}
