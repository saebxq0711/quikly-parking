import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getCurrentUser, homePathForRole } from '@/lib/auth/guards';
import { BrandSwoosh } from '@/components/brand-swoosh';
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
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/*
        El trazo amarillo del logo, llevado a la esquina: la unica decoracion del
        ingreso. Es la primera pantalla que ve cualquiera y la unica que no esta
        haciendo un trabajo, asi que es la que presenta la marca.
      */}
      <BrandSwoosh className="swoosh-in pointer-events-none absolute -bottom-24 -right-24 -z-10 h-72 w-72 text-brand-500 sm:-bottom-10 sm:-right-10 sm:h-[30rem] sm:w-[30rem]" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/*
            La version vertical del logo: aqui hay espacio y es la primera
            pantalla que ve cualquiera, asi que la marca va completa. En el
            panel se usa la horizontal, que cabe en la barra lateral.
          */}
          <Image
            src="/quikly-parking-positivo.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="mx-auto h-24 w-auto"
          />
          <p className="mt-5 text-sm text-[var(--text-secondary)]">
            Gestión y cobro de parqueaderos
          </p>
        </div>

        <div className="rounded-3xl bg-[var(--surface-raised)] p-7 ring-1 ring-[var(--line-subtle)] shadow-[var(--shadow-lift)]">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          El acceso a esta plataforma queda registrado.
        </p>
      </div>
    </main>
  );
}
