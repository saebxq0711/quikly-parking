import { after } from 'next/server';

/**
 * Trabajo que sigue despues de responder (la factura de SIIGO, el correo).
 *
 * En un servidor propio `void promesa` bastaba, pero en Vercel la funcion se congela en
 * cuanto sale la respuesta y la factura podia quedarse sin emitir. `after()` le pide a la
 * plataforma que la termine. Fuera de una peticion (scripts) `after` no existe: se lanza
 * igual que antes.
 */
export function enSegundoPlano(tarea: () => Promise<unknown>): void {
  try {
    after(tarea);
  } catch {
    void tarea();
  }
}
