/**
 * Impresora de recibos por USB directo, desde el navegador (WebUSB).
 *
 * POR QUE: el kiosco puede ser una tablet. Una tablet no instala controladores de
 * impresora; lo que si puede es hablarle a la impresora por USB con sus propios comandos
 * (ESC/POS, ver `escpos.ts`). Chrome lo permite con WebUSB: se empareja la impresora UNA
 * vez (Configuracion de impresora del kiosco) y desde ahi el navegador la recuerda y la
 * usa sin preguntar.
 *
 * DONDE FUNCIONA: Chrome o Edge en Android (tablet con cable OTG), ChromeOS y Windows.
 * En Windows la impresora llega tomada por su controlador de impresion (`usbprint`) y
 * WebUSB no la puede abrir: hay que cambiarle el controlador por "WinUsb Device", que
 * ya viene con Windows (guia de despliegue, seccion del PC con Windows). Si no se hace,
 * queda el camino viejo: controlador del fabricante y Chrome con `--kiosk-printing`.
 */

/** Clase USB "impresora". */
const CLASE_IMPRESORA = 0x07;
/** Gainscha / Philips (NXP): el motor de las impresoras DigitalPos. */
const VENDOR_GAINSCHA = 0x0471;

export const FILTROS_IMPRESORA: USBDeviceFilter[] = [
  { classCode: CLASE_IMPRESORA },
  { vendorId: VENDOR_GAINSCHA },
];

export function usbDisponible(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.usb);
}

function esImpresora(dispositivo: USBDevice): boolean {
  return (
    dispositivo.vendorId === VENDOR_GAINSCHA ||
    dispositivo.configurations.some((conf) =>
      conf.interfaces.some((i) => i.alternates.some((a) => a.interfaceClass === CLASE_IMPRESORA)),
    )
  );
}

export function nombreImpresora(dispositivo: USBDevice): string {
  return (
    [dispositivo.manufacturerName, dispositivo.productName].filter(Boolean).join(' ') ||
    'Impresora USB'
  );
}

/** La impresora que este navegador ya tiene autorizada, si hay una conectada. */
export async function impresoraEmparejada(): Promise<USBDevice | null> {
  if (!navigator.usb) return null;
  const dispositivos = await navigator.usb.getDevices();
  return dispositivos.find(esImpresora) ?? null;
}

/**
 * Detecta la impresora sola: avisa si hay una autorizada conectada al empezar y cada vez
 * que se conecta o se quita algo por USB. Devuelve la funcion para dejar de escuchar.
 *
 * "Autorizada" es por navegador: la da el toque en Conectar impresora
 * (`emparejarImpresora`) o, en un PC preparado con `scripts/windows/impresora-winusb.ps1`,
 * la politica de Chrome/Edge, sin ningun toque.
 */
export function vigilarImpresora(alCambiar: (conectada: boolean) => void): () => void {
  const usb = typeof navigator !== 'undefined' ? navigator.usb : undefined;
  if (!usb) return () => undefined;

  let vigente = true;
  const revisar = () => {
    impresoraEmparejada()
      .then((dispositivo) => {
        if (vigente) alCambiar(Boolean(dispositivo));
      })
      .catch(() => {
        if (vigente) alCambiar(false);
      });
  };

  revisar();
  usb.addEventListener('connect', revisar);
  usb.addEventListener('disconnect', revisar);
  return () => {
    vigente = false;
    usb.removeEventListener('connect', revisar);
    usb.removeEventListener('disconnect', revisar);
  };
}

/** Abre el selector de Chrome para autorizar la impresora. Tiene que venir de un toque. */
export async function emparejarImpresora(): Promise<USBDevice> {
  if (!navigator.usb) {
    throw new Error('Este navegador no permite conectar impresoras USB.');
  }
  return navigator.usb.requestDevice({ filters: FILTROS_IMPRESORA });
}

function salidaDeDatos(dispositivo: USBDevice): { interfaz: number; endpoint: number } {
  const configuracion = dispositivo.configuration;
  if (!configuracion) throw new Error('La impresora no tiene una configuracion activa.');

  // Primero las interfaces de clase impresora; si no hay, cualquiera con salida de datos.
  const interfaces = [...configuracion.interfaces].sort(
    (a, b) =>
      Number(b.alternate.interfaceClass === CLASE_IMPRESORA) -
      Number(a.alternate.interfaceClass === CLASE_IMPRESORA),
  );
  for (const interfaz of interfaces) {
    const endpoint = interfaz.alternate.endpoints.find(
      (e) => e.direction === 'out' && e.type === 'bulk',
    );
    if (endpoint) return { interfaz: interfaz.interfaceNumber, endpoint: endpoint.endpointNumber };
  }
  throw new Error('La impresora no expone una salida de datos por USB.');
}

/** Manda los comandos a la impresora. */
export async function imprimirPorUsb(dispositivo: USBDevice, datos: Uint8Array): Promise<void> {
  if (!dispositivo.opened) await dispositivo.open();
  if (dispositivo.configuration === null) await dispositivo.selectConfiguration(1);

  const { interfaz, endpoint } = salidaDeDatos(dispositivo);
  await dispositivo.claimInterface(interfaz);
  try {
    const TROZO = 4096;
    for (let inicio = 0; inicio < datos.length; inicio += TROZO) {
      const resultado = await dispositivo.transferOut(endpoint, datos.slice(inicio, inicio + TROZO));
      if (resultado.status !== 'ok') {
        throw new Error(`La impresora rechazo los datos (${resultado.status}).`);
      }
    }
  } finally {
    await dispositivo.releaseInterface(interfaz).catch(() => undefined);
    await dispositivo.close().catch(() => undefined);
  }
}
