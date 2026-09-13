/**
 * Codigos del servicio SIPConnector V1.5.
 *
 * Fuente: "Descripcion Tecnica Web Service SIPConnector V1.5", Anexos 4 y 5.
 * Verificados contra el ambiente de pruebas: `Cod:00`, `Cod:04` y `Cod:99` se
 * comprobaron con peticiones reales.
 */

/** Codigo tecnico del consumo del servicio. NO es el resultado financiero. */
export const SIP_CODE = {
  OK: '00',
  /** El datafono ya inicio la operacion (se presiono la tecla verde). */
  INICIANDO: '01',
  /** El datafono esta pidiendo datos: entrega BIN, tipo de cuenta y franquicia. */
  LEYENDO_TARJETA: '02',
  PARAMETROS_INCORRECTOS: '03',
  TOKEN_INVALIDO: '04',
  ID_TRANSACCION_INCORRECTO: '05',
  TERMINAL_OCUPADA: '06',
  CODIGO_UNICO_INVALIDO: '07',
  ESTRUCTURA_INCOMPLETA: '08',
  TRANSACCION_DUPLICADA: '09',
  ERROR_BD_1: '10',
  ERROR_BD_2: '11',
  ESTRUCTURA_ERRADA: '12',
  ERROR_INTERNO: '14',
  DATOS_TOKEN_INVALIDOS: '15',
  CREDENCIALES_INVALIDAS: '16',
  NO_ENCONTRO_PARA_BORRAR: '17',
  YA_RESUELTA: '18',
  ERROR_TECNICO: '99',
} as const;

/** Descripcion tecnica de cada codigo, tal como la define el Anexo 4. */
export const SIP_CODE_MEANING: Record<string, string> = {
  '00': 'El consumo del servicio fue correcto.',
  '01': 'El datafono inicio la operacion, sin respuesta financiera todavia.',
  '02': 'El datafono esta leyendo la tarjeta.',
  '03': 'Parametros de la operacion incorrectos.',
  '04': 'Token no valido.',
  '05': 'Id de transaccion incorrecto.',
  '06': 'Ya existe una transaccion asignada a esta terminal.',
  '07': 'Codigo unico invalido.',
  '08': 'Estructura incompleta.',
  '09': 'Ya existe un registro con este numero de transaccion.',
  '10': 'No pudo insertar en la base de datos interna del proveedor.',
  '11': 'No pudo insertar en la base de datos interna del proveedor.',
  '12': 'Estructura errada (error de LRC).',
  '14': 'Error interno de proceso.',
  '15': 'Datos de token invalidos.',
  '16': 'Error en credenciales de autenticacion.',
  '17': 'No encontro registro para borrar.',
  '18': 'Esta operacion ya se resolvio.',
  '99': 'Error tecnico en el proceso.',
};

/**
 * Mensaje apto para mostrarle al CLIENTE en el kiosco.
 *
 * El kiosco es de autoservicio: quien lee esto es la persona que vino a pagar,
 * no un tecnico. Nunca ve el codigo crudo ni el texto tecnico —eso va al log— y
 * cuando el problema no esta en sus manos se le dice a donde acudir, porque no
 * hay nadie del parqueadero a su lado.
 */
export const SIP_CODE_PUBLIC: Record<string, string> = {
  '03': 'No pudimos procesar el cobro. Acercate a la oficina del parqueadero.',
  '04': 'La conexion con el medio de pago expiro. Intenta de nuevo.',
  '05': 'Hubo un problema con este cobro. Intenta de nuevo.',
  '06': 'El datafono esta ocupado con otra operacion. Espera un momento e intenta de nuevo.',
  '07': 'Este punto de pago no esta habilitado. Acercate a la oficina del parqueadero.',
  '08': 'No pudimos enviar el cobro al datafono. Acercate a la oficina del parqueadero.',
  '09': 'Ese cobro ya esta en el datafono. Continua en el aparato.',
  '12': 'Los datos del cobro no llegaron completos. Intenta de nuevo.',
  '16': 'Este punto de pago no esta habilitado. Acercate a la oficina del parqueadero.',
  '17': 'No hay ninguna operacion activa en el datafono.',
  '18': 'Esta operacion ya se resolvio.',
};

export function publicMessageForCode(code: string): string {
  return (
    SIP_CODE_PUBLIC[code] ??
    'No fue posible comunicarse con el datafono. Intenta nuevamente.'
  );
}

/**
 * Redes que procesan el pago (Anexo 5). El campo `Red` viaja en cada metodo.
 */
export const SIP_NETWORKS: { value: string; label: string }[] = [
  { value: '0', label: 'Redeban' },
  { value: '1', label: 'Credibanco' },
  { value: '2', label: 'Bold' },
  { value: '3', label: 'Nequi' },
  { value: '4', label: 'Visa Net' },
  { value: '5', label: 'Ecopay' },
  { value: '6', label: 'PlacetoPay' },
  { value: '7', label: 'PayGroup' },
  { value: '8', label: 'PaySmart' },
];

export function networkLabel(value: string): string {
  return SIP_NETWORKS.find((n) => n.value === value)?.label ?? `Red ${value}`;
}

/** Tipos de operacion del campo "Tipo Operacion" del Anexo 1. */
export const SIP_OPERATION = {
  COMPRA: '0',
  ANULACION: '1',
  COMPRA_ACUMULA: '3',
  LEALTAD_ACUMULA: '4',
  LEALTAD_REDIME: '5',
  RECARGA_BONO: '6',
} as const;
