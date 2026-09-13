import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';

/**
 * Direccion antigua del punto de pago, cuando la plataforma atendia un solo
 * sitio. Se conserva como redireccion para que los kioscos que ya tengan este
 * enlace guardado sigan funcionando: manda al usuario al punto de pago de su
 * propio parqueadero, que es quien decide desde donde cobra.
 */
export default async function LegacyPosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/pos');

  if (!user.parkingLot) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold text-ink-100">
            Sin parqueadero asignado
          </h1>
          <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
            Tu usuario no esta asociado a ningun parqueadero, asi que no es
            posible cobrar. Pide al administrador que te asigne uno.
          </p>
        </div>
      </main>
    );
  }

  redirect(`/p/${user.parkingLot.slug}/pos`);
}
