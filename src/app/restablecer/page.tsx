import Image from 'next/image';
import Link from 'next/link';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Nueva contrasena' };

/**
 * Pantalla que abre el enlace del correo.
 *
 * El token viaja en la URL y no se valida aqui: se valida al enviar la nueva
 * contrasena. Comprobarlo antes obligaria a una consulta extra y, peor, dejaria
 * la puerta abierta a que alguien pruebe tokens solo cargando paginas — sin
 * pasar por el limite de intentos, que vive en la ruta del POST.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/quikly-parking.png"
            alt="Quikly Parking"
            width={783}
            height={269}
            priority
            className="mx-auto h-14 w-auto"
          />
          <h1 className="mt-5 text-xl font-semibold text-white">
            Elige tu nueva contrasena
          </h1>
        </div>

        <div className="rounded-2xl bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line-subtle)] shadow-[0_1px_2px_rgb(0_0_0/0.4),0_24px_48px_-24px_rgb(0_0_0/0.8)]">
          {token ? (
            <ResetForm token={token} />
          ) : (
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                Este enlace esta incompleto. Abrelo directamente desde el correo
                que recibiste, sin copiar solo una parte.
              </p>
              <Link
                href="/recuperar-clave"
                className="mt-4 inline-block text-sm font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
              >
                Solicitar un enlace nuevo
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Al cambiarla se cierran todas las sesiones abiertas de tu cuenta.
        </p>
      </div>
    </main>
  );
}
