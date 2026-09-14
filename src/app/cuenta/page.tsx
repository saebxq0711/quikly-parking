import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MdArrowBack } from 'react-icons/md';
import { getCurrentUser, homePathForRole } from '@/lib/auth/guards';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Cambiar contrasena' };

/**
 * Cambio de contrasena de la propia cuenta, para cualquier rol.
 *
 * Es el unico camino para cambiar la propia: el SuperAdmin cambia la de los demas desde
 * Usuarios, pero no la suya, para que un descuido no lo deje fuera de su cuenta.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/cuenta');

  const volver = homePathForRole({ role: user.role, parkingLot: user.parkingLot });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="page-in w-full max-w-sm">
        <Link
          href={volver}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-ink-100"
        >
          <MdArrowBack className="h-4 w-4" aria-hidden focusable="false" />
          Volver
        </Link>

        <div className="mb-8 mt-6 text-center">
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="mx-auto h-12 w-auto"
          />
          <h1 className="mt-5 text-xl font-semibold text-white">Cambiar contrasena</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{user.email}</p>
          {user.mustChangePassword ? (
            <p className="mt-4 rounded-lg bg-warn-500/10 px-3 py-2 text-[13px] text-warn-300 ring-1 ring-warn-400/25">
              Tu contrasena es temporal. Elige una propia para seguir.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-[var(--surface-raised)] p-6 shadow-[0_1px_2px_rgb(0_0_0/0.4),0_24px_48px_-24px_rgb(0_0_0/0.8)] ring-1 ring-[var(--line-subtle)]">
          <PasswordForm />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Al cambiarla se cierran las demas sesiones abiertas de tu cuenta.
        </p>
      </div>
    </main>
  );
}
