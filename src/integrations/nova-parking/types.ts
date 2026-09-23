import type { VehicleIdentifierKind, VehicleType } from '@prisma/client';

/**
 * Contrato con Nova Parking (el sistema existente, Django + DRF).
 *
 * FUENTE DE VERDAD de estos endpoints:
 *   docs/FUNCIONAMIENTO_PROYECTO_Y_TUNEL.md  (seccion 5 y 6)
 *   docs/HANDOFF.md                          (secciones 3.2, 3.3, 3.5)
 *
 * ESTADO DEL CONTRATO
 * -------------------
 * Las RUTAS y su semantica estan confirmadas por la documentacion.
 * La FORMA EXACTA de las respuestas JSON no esta documentada en ningun lado, asi
 * que aqui se define el contrato que esta plataforma espera y `normalize.ts`
 * acepta las variantes de nombres mas probables. Lo que Edier debe confirmar o
 * ajustar esta listado en `docs/REQUERIMIENTOS_EDIER.md`.
 *
 * No se inventa ninguna regla de negocio: el monto a cobrar SIEMPRE lo calcula
 * Nova Parking (`pay-checkout`), esta plataforma solo lo lee y lo muestra.
 */

/** Como buscar cada tipo de vehiculo. Confirmado en HANDOFF.md 3.3 y 3.5. */
export interface VehicleTypeConfig {
  type: VehicleType;
  label: string;
  identifierKind: VehicleIdentifierKind;
  /** Segmento de la ruta `find-ticket/<segment>/` en Nova Parking. */
  searchSegment: 'car' | 'moto' | 'bike';
  /** Parametros extra de la consulta, sin el `?` (ej. `by=id`). */
  searchQuery?: string | null;
  /** Texto de ayuda mostrado al operador del punto de pago. */
  inputLabel: string;
  inputPlaceholder: string;
}

/** Tiquete tal como lo entiende esta plataforma, ya normalizado. */
export interface NovaTicket {
  /** Id del ParkingTicket en Nova Parking. Llave de union entre sistemas. */
  id: string;
  /**
   * Codigo del tiquete (`A7B48`): lo unico que el cliente conoce, impreso en su
   * tiquete y dentro del QR. Viene en `null` para los carros, que se identifican
   * por placa.
   *
   * NUNCA se le muestra el `id` al cliente: es el autoincremental de su base, y
   * siendo secuencial permitiria deducir el de otro vehiculo.
   */
  code: string | null;
  plate: string | null;
  vehicleTypeLabel: string | null;
  /** Momento de ingreso, ISO 8601. */
  entryAt: string | null;
  /** Minutos de permanencia, si el sistema existente los reporta. */
  minutes: number | null;
  customerName: string | null;
  customerDocument: string | null;
  status: string | null;
  /**
   * Foto que tomo la camara al entrar el vehiculo, como la nombra Nova Parking:
   * una ruta suya (`/media/parking_tickets/...`), no una URL publica. Su
   * buscador de tiquetes ya la devuelve (`front_image`).
   *
   * Quien la quiera ver pasa por nuestro proxy, que es el unico que conoce el
   * tunel y el token.
   */
  photo: string | null;
}

/** Resultado de `pay-checkout` (GET): el monto que Nova Parking determino. */
export interface NovaCheckout {
  ticket: NovaTicket;
  /** Monto total a cobrar, en pesos enteros. */
  amount: number;
  /** Desglose opcional, si el sistema existente lo entrega. */
  breakdown?: Record<string, unknown> | null;
  /** True si el tiquete ya fue pagado y no corresponde volver a cobrar. */
  alreadyPaid: boolean;
  /**
   * Minutos que le quedan al cliente para salir sin volver a pagar.
   * Solo viene cuando el tiquete ya estaba pagado.
   */
  minutesLeft?: number | null;
}
