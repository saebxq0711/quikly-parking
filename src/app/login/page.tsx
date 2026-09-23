import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getCurrentUser, homePathForRole } from '@/lib/auth/guards';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesion' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user));

  const { next } = await searchParams;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/*
        Resplandor de marca detras del formulario: lavanda arriba, aqua abajo,
        los dos colores primarios del manual. Es la unica decoracion de todo el
        producto y esta aqui a proposito — es la primera pantalla, la unica que
        no esta haciendo un trabajo.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_32rem_at_50%_-10%,rgb(181_143_255/0.16),transparent_70%),radial-gradient(40rem_24rem_at_50%_110%,rgb(92_225_230/0.1),transparent_70%)]"
      />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/*
            La version vertical del logo: aqui hay espacio y es la primera
            pantalla que ve cualquiera, asi que la marca va completa. En el
            panel se usa la horizontal, que cabe en la barra lateral.
          */}
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="mx-auto h-24 w-auto"
          />
          <p className="mt-5 text-sm text-[var(--text-secondary)]">
            Gestion y cobro de parqueaderos
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border-t-2 border-gold-500 bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)] shadow-[var(--shadow-card)]">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          El acceso a esta plataforma queda registrado.
        </p>
      </div>
    </main>
  );
}
