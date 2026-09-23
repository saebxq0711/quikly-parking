import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type ExcelJS from 'exceljs';

/**
 * Vestido de marca de los reportes en Excel.
 *
 * El reporte se imprime, se reenvia por correo y termina en manos del contador o
 * del dueno del parqueadero: es la cara de Quikly Parking para gente que nunca
 * va a abrir la aplicacion. Una hoja de calculo cruda —celdas sin formato,
 * fechas ISO, numeros sin separador— se ve como un volcado de base de datos.
 *
 * Aqui viven la portada, la barra de titulo, el encabezado de columnas y los
 * bordes: las hojas de `route.ts` solo dicen QUE datos llevan, no como se ven.
 *
 * Los colores son los del Manual de Marca Quikly (lavanda #b58fff, aqua #5CE1E6
 * y el ambar #F7B500 de la linea Parking), en los pasos oscuros que hacen falta
 * para sostener texto blanco encima.
 */

/* Excel escribe los colores en ARGB (alfa primero). */
export const COLOR = {
  marcaFondo: 'FF1A0F33', // violeta profundo de la portada
  marca: 'FF6D2FD4', // lavanda de marca, paso oscuro: encabezados
  marcaSuave: 'FFF1E9FF', // lavanda al 8%: filas alternas
  ambar: 'FFF7B500', // linea Parking: la franja de acento
  aqua: 'FF167E87',
  verde: 'FF4F7F39',
  rojo: 'FFC93434',
  texto: 'FF1A1629',
  textoSuave: 'FF5D5575',
  linea: 'FFE3DFEE',
  blanco: 'FFFFFFFF',
} as const;

export const MONEDA = '"$" #,##0';
export const FECHA = 'dd/mm/yyyy hh:mm';
export const FUENTE = 'Calibri';

const BORDE_FINO: ExcelJS.Border = { style: 'thin', color: { argb: COLOR.linea } };

/**
 * Logo para la portada.
 *
 * Es el positivo blanco, que es el que corresponde sobre la franja oscura
 * (Manual de Marca, "VARIACIONES DE COLOR"). Si el archivo no esta —empaquetados
 * raros del servidor— el reporte sale igual, solo sin logo: un reporte sin logo
 * sirve, un reporte que no se descarga no.
 */
export async function logoDeMarca(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), 'public', 'quikly-parking.png'));
  } catch {
    return null;
  }
}

/** Ancho total de la portada/banda de titulo de una hoja. */
function ultimaColumna(columnas: number): string {
  return String.fromCharCode(64 + columnas);
}

/**
 * Banda de titulo de una hoja de datos: fondo de marca, nombre de la hoja,
 * parqueadero y periodo. Deja libre la fila 4 como respiro y devuelve la fila
 * donde empieza el encabezado de columnas.
 */
export function bandaDeTitulo(
  hoja: ExcelJS.Worksheet,
  {
    titulo,
    subtitulo,
    columnas,
  }: { titulo: string; subtitulo: string; columnas: number },
): number {
  const fin = ultimaColumna(columnas);

  hoja.mergeCells(`A1:${fin}1`);
  const t = hoja.getCell('A1');
  t.value = titulo;
  t.font = { name: FUENTE, size: 16, bold: true, color: { argb: COLOR.blanco } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.marcaFondo } };
  t.alignment = { vertical: 'middle', indent: 1 };
  hoja.getRow(1).height = 30;

  hoja.mergeCells(`A2:${fin}2`);
  const s = hoja.getCell('A2');
  s.value = subtitulo;
  s.font = { name: FUENTE, size: 10, color: { argb: COLOR.blanco } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.marcaFondo } };
  s.alignment = { vertical: 'middle', indent: 1 };
  hoja.getRow(2).height = 18;

  // Franja ambar: el color propio de la linea Parking, como filo de la cabecera.
  hoja.mergeCells(`A3:${fin}3`);
  hoja.getCell('A3').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR.ambar },
  };
  hoja.getRow(3).height = 4;

  hoja.getRow(4).height = 6;
  return 5;
}

export interface Columna {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

/**
 * Anchos y formato de cada columna.
 *
 * Se llama ANTES de dibujar nada: el `columns` de ExcelJS escribe sus propias
 * cabeceras en la fila 1 y pisaria la banda de titulo. Por eso las columnas van
 * sin `header` y la cabecera se escribe aparte, en la fila que toca.
 */
export function definirColumnas(hoja: ExcelJS.Worksheet, columnas: Columna[]) {
  hoja.columns = columnas.map((c) => ({
    key: c.key,
    width: c.width,
    style: { font: { name: FUENTE, size: 10 }, ...(c.numFmt ? { numFmt: c.numFmt } : {}) },
  }));
}

/** Encabezado de columnas: fondo de marca, texto blanco, filtro y panel fijo. */
export function encabezadoDeColumnas(
  hoja: ExcelJS.Worksheet,
  fila: number,
  columnas: Columna[],
) {
  const cabecera = hoja.getRow(fila);
  columnas.forEach((columna, indice) => {
    const celda = cabecera.getCell(indice + 1);
    celda.value = columna.header;
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: COLOR.blanco } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.marca } };
    celda.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    celda.border = { bottom: { style: 'thin', color: { argb: COLOR.marca } } };
  });
  cabecera.height = 24;
  cabecera.commit();

  hoja.autoFilter = {
    from: { row: fila, column: 1 },
    to: { row: fila, column: columnas.length },
  };
  // Al bajar por la tabla, la cabecera se queda: sin esto, a la fila 60 nadie
  // sabe que columna esta mirando.
  hoja.views = [{ state: 'frozen', ySplit: fila }];
}

/** Bordes y fila alterna, aplicados a una fila de datos ya escrita. */
export function vestirFila(fila: ExcelJS.Row, indice: number, columnas: number) {
  const alterna = indice % 2 === 1;
  for (let i = 1; i <= columnas; i += 1) {
    const celda = fila.getCell(i);
    celda.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
    celda.alignment = { vertical: 'middle', ...(celda.alignment ?? {}) };
    if (alterna) {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.marcaSuave } };
    }
  }
  fila.height = 18;
}

/** Fila de totales al pie de una tabla. */
export function filaDeTotales(
  hoja: ExcelJS.Worksheet,
  valores: Record<string, string | number | null>,
  columnas: number,
) {
  const fila = hoja.addRow(valores);
  for (let i = 1; i <= columnas; i += 1) {
    const celda = fila.getCell(i);
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: COLOR.texto } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.marcaSuave } };
    celda.border = {
      top: { style: 'double', color: { argb: COLOR.marca } },
      bottom: BORDE_FINO,
    };
  }
  fila.height = 20;
  return fila;
}

/**
 * Preparacion para imprimir: horizontal, ajustado al ancho de la hoja y con la
 * cabecera repetida en cada pagina. El administrador imprime este reporte.
 */
export function listaParaImprimir(hoja: ExcelJS.Worksheet, filaCabecera: number) {
  hoja.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
    printTitlesRow: `${filaCabecera}:${filaCabecera}`,
  };
  hoja.headerFooter = {
    oddFooter: '&LQuikly Parking&CPagina &P de &N&R&D',
  };
}
