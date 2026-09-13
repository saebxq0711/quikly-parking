import type { SiigoClient } from './client';

/**
 * Clientes en SIIGO.
 *
 * El kiosco reconoce a quien paga por su numero de documento: si ya existe, lo
 * saluda por su nombre y no le vuelve a pedir los datos; si no, se los pide una
 * vez y queda registrado para la proxima.
 *
 * Verificado contra el ambiente real: `GET /v1/customers?identification=` filtra
 * por documento y `POST /v1/customers` crea, devolviendo el id.
 */

export interface SiigoCustomer {
  siigoId: string;
  identification: string;
  idType: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

interface RawCustomer {
  id?: string;
  id_type?: { code?: string } | string;
  identification?: string;
  name?: string[];
  phones?: { number?: string }[];
  contacts?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: { number?: string };
  }[];
}

/**
 * SIIGO devuelve el nombre como arreglo `[nombres, apellidos]` y el tipo de
 * documento a veces como objeto y a veces como texto. Se normaliza aqui para
 * que el resto de la aplicacion no tenga que saberlo.
 */
function normalize(raw: RawCustomer): SiigoCustomer | null {
  if (!raw.id || !raw.identification) return null;

  const [first = '', ...rest] = raw.name ?? [];
  const contact = raw.contacts?.[0];

  return {
    siigoId: raw.id,
    identification: raw.identification,
    idType:
      typeof raw.id_type === 'string' ? raw.id_type : (raw.id_type?.code ?? '13'),
    firstName: first || contact?.first_name || '',
    lastName: rest.join(' ') || contact?.last_name || '',
    phone: raw.phones?.[0]?.number ?? contact?.phone?.number ?? null,
    email: contact?.email ?? null,
  };
}

/** Busca un cliente por su numero de documento. */
export async function findCustomerByIdentification(
  client: SiigoClient,
  identification: string,
): Promise<SiigoCustomer | null> {
  const response = await client.get<{ results?: RawCustomer[] }>(
    `/v1/customers?identification=${encodeURIComponent(identification)}`,
  );

  const first = response.results?.[0];
  return first ? normalize(first) : null;
}

export interface NewCustomer {
  identification: string;
  idType: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

/**
 * Crea el cliente en SIIGO.
 *
 * La direccion es obligatoria para SIIGO pero el kiosco no la pide: a quien esta
 * pagando a la salida de un parqueadero no se le puede exigir su direccion. Se
 * envia un valor neutro y se documenta; si el cliente necesita direcciones
 * reales, es un campo mas en el formulario.
 */
export async function createCustomer(
  client: SiigoClient,
  input: NewCustomer,
): Promise<SiigoCustomer | null> {
  const created = await client.post<RawCustomer>('/v1/customers', {
    person_type: 'Person',
    id_type: input.idType,
    identification: input.identification,
    name: [input.firstName, input.lastName],
    active: true,
    vat_responsible: false,
    address: {
      address: 'No registra',
      city: { country_code: 'Co', state_code: '11', city_code: '11001' },
    },
    phones: input.phone ? [{ number: input.phone }] : [],
    contacts: [
      {
        first_name: input.firstName,
        last_name: input.lastName || input.firstName,
        email: input.email ?? undefined,
        phone: input.phone ? { number: input.phone } : undefined,
      },
    ],
  });

  return normalize(created);
}
