import { redirect } from 'next/navigation';
import { getCurrentUser, homePathForRole } from '@/lib/auth/guards';

/**
 * La raiz no tiene contenido propio: envia a cada usuario al area que le
 * corresponde. La decision la toma el servidor a partir del rol real en base de
 * datos, no de nada que el navegador pueda modificar.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(homePathForRole(user));
}
