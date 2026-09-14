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
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
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

        <div className="rounded-2xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)] shadow-[0_1px_2px_rgb(0_0_0/0.4),0_24px_48px_-24px_rgb(0_0_0/0.8)]">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          El acceso a esta plataforma queda registrado.
        </p>
      </div>
    </main>
  );
}
