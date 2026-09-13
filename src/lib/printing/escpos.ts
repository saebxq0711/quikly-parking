/**
 * Comandos ESC/POS para impresoras termicas de recibos.
 *
 * Es el idioma nativo de estas impresoras (Gainscha / DigitalPos, Epson, Xprinter...):
 * con estos bytes la impresora imprime sin controlador instalado, que es como funciona
 * conectada por USB a una tablet. Ver `usb-printer.ts`.
 *
 * El texto se manda en ASCII: las tildes y la ñ se simplifican ("Electronica", "Pena"),
 * porque cada impresora trae su propia tabla de caracteres y una tilde mal mapeada sale
 * como un simbolo raro en la factura.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Columnas de la fuente normal en papel de 80 mm. */
export const COLUMNAS_80MM = 48;

export function aAscii(texto: string): string {
  return texto
    .replace(/[  ]/g, ' ')
    .replace(/[–—]/g, '-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

export class EscPos {
  private readonly bytes: number[] = [];

  constructor(private readonly columnas = COLUMNAS_80MM) {}

  /** Reinicia la impresora y fija la tabla de caracteres basica. */
  iniciar(): this {
    return this.crudo(ESC, 0x40, ESC, 0x74, 0x00);
  }

  alinear(modo: 'izquierda' | 'centro' | 'derecha'): this {
    return this.crudo(ESC, 0x61, modo === 'izquierda' ? 0 : modo === 'centro' ? 1 : 2);
  }

  negrita(activa: boolean): this {
    return this.crudo(ESC, 0x45, activa ? 1 : 0);
  }

  /** Tamaño de letra. Doble ancho reduce las columnas a la mitad; doble alto no. */
  tamano(ancho: 1 | 2, alto: 1 | 2): this {
    return this.crudo(GS, 0x21, ((ancho - 1) << 4) | (alto - 1));
  }

  texto(contenido: string): this {
    for (const caracter of aAscii(contenido)) this.bytes.push(caracter.charCodeAt(0));
    return this;
  }

  linea(contenido = ''): this {
    return this.texto(contenido).crudo(LF);
  }

  /** Texto largo partido en renglones del ancho del papel, sin cortar palabras si se puede. */
  parrafo(contenido: string, columnas = this.columnas): this {
    const palabras = aAscii(contenido).split(/\s+/).filter(Boolean);
    let actual = '';
    for (const palabra of palabras) {
      if (palabra.length > columnas) {
        if (actual) this.linea(actual);
        for (let i = 0; i < palabra.length; i += columnas) this.linea(palabra.slice(i, i + columnas));
        actual = '';
      } else if (!actual) {
        actual = palabra;
      } else if (actual.length + 1 + palabra.length <= columnas) {
        actual += ` ${palabra}`;
      } else {
        this.linea(actual);
        actual = palabra;
      }
    }
    if (actual) this.linea(actual);
    return this;
  }

  separador(caracter = '-'): this {
    return this.linea(caracter.repeat(this.columnas));
  }

  /** Etiqueta a la izquierda, valor a la derecha. Si no caben juntos, el valor baja. */
  fila(etiqueta: string, valor: string): this {
    const izquierda = aAscii(etiqueta);
    const derecha = aAscii(valor);
    const libre = this.columnas - izquierda.length - derecha.length;
    if (libre >= 1) return this.linea(`${izquierda}${' '.repeat(libre)}${derecha}`);
    this.linea(izquierda);
    return this.linea(derecha.padStart(this.columnas));
  }

  /** Codigo QR nativo de la impresora (modelo 2). */
  qr(datos: string, tamanoModulo = 6): this {
    const contenido = Array.from(new TextEncoder().encode(datos));
    const largo = contenido.length + 3;
    return this.crudo(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // modelo 2
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, tamanoModulo) // tamaño del modulo
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31) // correccion de errores M
      .crudo(GS, 0x28, 0x6b, largo & 0xff, (largo >> 8) & 0xff, 0x31, 0x50, 0x30, ...contenido)
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30) // imprimir
      .crudo(LF);
  }

  avanzar(lineas: number): this {
    return this.crudo(ESC, 0x64, Math.max(0, Math.min(255, lineas)));
  }

  /** Avanza el papel lo necesario y corta. */
  cortar(): this {
    return this.crudo(GS, 0x56, 0x42, 0x00);
  }

  crudo(...valores: number[]): this {
    this.bytes.push(...valores);
    return this;
  }

  bytesFinales(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
