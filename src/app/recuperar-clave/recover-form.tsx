'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';

export function RecoverForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error?.message ?? 'No fue posible registrar la solicitud.');
        return;
      }
      setSent(true);
    } catch {
      setError('No fue posible conectar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title="Solicitud registrada">
        Si ese correo pertenece a un usuario del sistema, el administrador vera
        la solicitud y te entregara una contrasena nueva. No se envia ningun
        correo automatico.
      </Alert>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
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

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Enviando...' : 'Solicitar restablecimiento'}
      </Button>
    </form>
  );
}
