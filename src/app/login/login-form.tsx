'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/components/ui';

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message ?? 'No fue posible iniciar sesion.');
        return;
      }

      // El destino lo decide el servidor segun el rol: el cliente no elige
      // a que area entra.
      // Con una contrasena temporal, lo primero es elegir una propia.
      router.replace(data.mustChangePassword ? '/cuenta' : (nextPath ?? data.redirectTo));
      router.refresh();
    } catch {
      setError('No fue posible conectar. Verifica tu conexion e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /*
      `method="post"` aunque el envio real lo haga `handleSubmit` con fetch.

      Si alguien pulsa Enter antes de que hidrate el JS —conexion lenta, kiosco
      recien encendido—, el navegador envia el formulario de forma nativa. Por
      defecto eso es un GET, y la contrasena termina en la URL: queda en el
      historial del navegador, en el `Referer` y en los registros del servidor.
      Se reprodujo de verdad, no es teorico.

      Con POST el envio prematuro falla de forma limpia y la contrasena viaja en
      el cuerpo, no en la barra de direcciones.
    */
    <form
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <Field label="Correo electronico">
        <Input
          type="email"
          name="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@parqueadero.com"
        />
      </Field>

      <Field label="Contrasena">
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? 'Verificando...' : 'Entrar'}
      </Button>

      <p className="pt-1 text-center text-sm">
        <Link
          href="/recuperar-clave"
          className="font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
        >
          Olvide mi contraseña
        </Link>
      </p>
    </form>
  );
}
