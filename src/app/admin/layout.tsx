import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/guards';
import { AppShell } from '@/components/app-shell';

/**
 * Area del SuperAdmin. El control de rol se aplica aqui para todo el subarbol,
 * y cada accion de servidor lo vuelve a validar por su cuenta — una guarda de
 * layout protege la navegacion, no las mutaciones.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin/parqueaderos');
  if (user.role !== 'SUPERADMIN') redirect('/');

  return (
    <AppShell
      navItems={[
        {
          href: '/admin/parqueaderos',
          label: 'Parqueaderos',
          icon: 'lots',
          matchPrefix: true,
        },
        { href: '/admin/usuarios', label: 'Usuarios', icon: 'users' },
        { href: '/admin/integraciones', label: 'Integraciones', icon: 'plug' },
      ]}
      userName={user.name}
      role="SUPERADMIN"
      contextName="Administracion global"
      contextHint="Todos los parqueaderos"
    >
      {children}
    </AppShell>
  );
}
