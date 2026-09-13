import Link from 'next/link';
import { RecoverForm } from './recover-form';

export const metadata = { title: 'Recuperar contrasena' };

/**
 * Recuperacion de contrasena.
 *
 * No se envia ningun correo, y la pantalla lo dice con todas las letras: el
 * sistema no tiene un servicio de correo configurado, asi que la solicitud la
 * atiende un administrador. Prometer un enlace que nunca va a llegar dejaria a
 * la persona esperando.
 */
export default function RecoverPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-ink-50">
            Recuperar contrasena
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Escribe tu correo y avisaremos al administrador para que restablezca
            tu acceso.
          </p>
        </div>

        <div className="rounded-2xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)] shadow-[0_1px_2px_rgb(0_0_0/0.4),0_24px_48px_-24px_rgb(0_0_0/0.8)]">
          <RecoverForm />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
          >
            Volver a iniciar sesion
          </Link>
        </p>
      </div>
    </main>
  );
}
