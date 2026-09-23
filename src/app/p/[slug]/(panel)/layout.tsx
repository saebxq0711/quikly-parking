import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';

/**
 * Area del administrador de parqueadero.
 *
 * El aislamiento se aplica aqui, una sola vez, para todas las paginas hijas:
 * si el slug de la URL no corresponde al parqueadero del usuario, la pagina no
 * existe para el. Se devuelve 404 y no 403 a proposito — asi no se confirma la
 * existencia de parqueaderos ajenos (CLAUDE.md seccion 18).
 */
/**
 * Tiempo maximo de estas paginas en Vercel. Consultan varias veces el sistema del
 * parqueadero por el tunel y el volcado de tiquetes tarda ~12 s: con el limite por
 * defecto (10 s) la pagina se cortaba.
 */
export const maxDuration = 60;

export default async function ParkingLotLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  const { slug } = await params;

  if (!user) redirect(`/login?next=/p/${slug}`);

  const lot = await db.parkingLot.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, city: true, testMode: true },
  });
  if (!lot) notFound();

  /*
    El panel es del administrador de ESTE parqueadero. El SuperAdmin configura desde
    su propia area y no entra aqui: antes podia, y quedaba metido en un panel ajeno
    sin camino de vuelta a su vista.
  */
  if (user.role === 'SUPERADMIN') redirect('/admin/parqueaderos');
  if (user.role !== 'ADMIN_PARQUEADERO' || user.parkingLotId !== lot.id) notFound();

  /*
    El orden sigue lo que el administrador pregunta primero: que hay adentro
    ahora, que paso, como va la caja. Los pagos de nuestro kiosco van despues
    porque son una parte del movimiento del parqueadero, no el todo.

    Las cinco primeras leen del sistema del parqueadero y son de solo lectura.
    La auditoria (inicios de sesion, consultas, errores) es informacion de soporte
    de la plataforma: solo la ve el SuperAdmin.
  */
  const navItems: NavItem[] = [
    { href: `/p/${slug}`, label: 'Resumen', icon: 'dashboard' },
    { href: `/p/${slug}/adentro`, label: 'Adentro ahora', icon: 'inside' },
    { href: `/p/${slug}/historial`, label: 'Historial', icon: 'history' },
    { href: `/p/${slug}/cajas`, label: 'Cajas', icon: 'cash', matchPrefix: true },
    { href: `/p/${slug}/reportes`, label: 'Reportes', icon: 'reports' },
    { href: `/p/${slug}/pagos`, label: 'Pagos del kiosco', icon: 'payments' },
    { href: `/p/${slug}/kioscos`, label: 'Kioscos', icon: 'pos' },
  ];

  return (
    <AppShell
      navItems={navItems}
      userName={user.name}
      role={user.role}
      contextName={lot.name}
      contextHint={lot.city ?? undefined}
    >
      {lot.testMode ? (
        <div className="mb-5 rounded-xl bg-warn-500/10 px-4 py-3 text-sm text-warn-300 ring-1 ring-warn-400/25">
          Modo de pruebas: el kiosco usa un parqueadero simulado. Los datos del sistema del
          parqueadero no estan disponibles mientras dure.
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
