/**
 * Pruebas de certificacion de SIPConnector (Redeban), con el MISMO cliente que usa la
 * plataforma: lo que se certifica es lo que corre.
 *
 * Las credenciales salen de la base, cifradas, del kiosco que se indique (no del .env).
 * El script solo LEE la base; no crea pagos ni guarda nada. Cada paso imprime la
 * respuesta literal (`Cod:XX,Msj:...`) para pegarla como evidencia en el formulario.
 *
 * Uso:
 *   npx tsx --env-file=<archivo .env> scripts/sip-cert.ts --kiosco <codigo> [--parqueadero 122] <comando> [opciones]
 *
 * Comandos:
 *   version                                  healthcheck: version del servicio
 *   token                                    verifica las credenciales (no imprime el token)
 *   compra    --valor N [--vigencia M] [--id ID] [--caja C] [--cajero C]
 *   anulacion --valor N --recibo NNNNNN --clave-super XXXX [--vigencia M] [--id ID]
 *   respuesta --id ID [--sin-borrar]         1.a consulta a los 10 s, luego cada 5 s; a los
 *                                            3 min sin resultado corta y borra (como el POS)
 *   borrar    --id ID
 *
 * El IdTransaccion por defecto es el epoch en segundos (10 digitos, unico).
 * Vigencia por defecto: 20 min (la prueba 9 se envia con --vigencia 3 y se espera 5 min).
 * Las anulaciones (pruebas 12-13) necesitan el recibo de una compra aprobada (prueba 1).
 */
import { db } from '../src/lib/db';
import { getCredentials } from '../src/lib/credentials';
import { normalizeCodigoTerminal, normalizeCodigoUnico, redebanClientFor } from '../src/lib/parking/redeban';
import { buildAnulacionData, buildCompraData } from '../src/integrations/sipconnector/codec';
import { SIP_CODE_MEANING } from '../src/integrations/sipconnector/codes';

const PRIMERA_CONSULTA_MS = 10_000;
const CADA_MS = 5_000;
const CORTE_MS = 3 * 60_000;

function opciones(argv: string[]) {
  const sueltos: string[] = [];
  const valores = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const siguiente = argv[i + 1];
      if (siguiente !== undefined && !siguiente.startsWith('--')) {
        valores.set(a.slice(2), siguiente);
        i += 1;
      } else {
        valores.set(a.slice(2), true);
      }
    } else {
      sueltos.push(a);
    }
  }
  const texto = (k: string) => {
    const v = valores.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  return { comando: sueltos[0], texto, bandera: (k: string) => valores.has(k) };
}

function numero(valor: string | undefined, nombre: string): number {
  const n = Number(valor);
  if (!valor || !Number.isInteger(n)) throw new Error(`Falta --${nombre} (entero).`);
  return n;
}

const hora = () => new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
const literal = (titulo: string, raw: string, code: string) =>
  console.log(`${hora()}  ${titulo.padEnd(12)} ${raw}   [${SIP_CODE_MEANING[code] ?? 'codigo ' + code}]`);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { comando, texto, bandera } = opciones(process.argv.slice(2));
  const codigoKiosco = texto('kiosco');
  if (!comando || !codigoKiosco) {
    console.log('Uso: npx tsx --env-file=<.env> scripts/sip-cert.ts --kiosco <codigo> <comando> [opciones]');
    console.log('Ver el encabezado del archivo para los comandos.');
    process.exitCode = 1;
    return;
  }

  const lot = await db.parkingLot.findUniqueOrThrow({ where: { slug: texto('parqueadero') ?? '122' } });
  const point = await db.paymentPoint.findFirst({ where: { parkingLotId: lot.id, code: codigoKiosco } });
  if (!point) throw new Error(`No existe el kiosco ${codigoKiosco} en ${lot.slug}.`);

  const creds = await getCredentials({ provider: 'REDEBAN', parkingLotId: lot.id, paymentPointId: point.id });
  const client = await redebanClientFor(lot.id, point.id);
  const codigoUnico = normalizeCodigoUnico(creds.codigoUnico ?? '');
  const terminal = normalizeCodigoTerminal(creds.codigoTerminal ?? '');
  console.log(`Ambiente : ${creds.baseUrl}`);
  console.log(`Kiosco   : ${point.name} (${point.code}) | comercio ${codigoUnico} | terminal ${terminal}\n`);

  const id = texto('id') ?? String(Math.floor(Date.now() / 1000));
  const caja = texto('caja') ?? point.boxNumber ?? point.code;
  const cajero = texto('cajero') ?? point.cashierCode ?? point.code;
  const vigencia = Number(texto('vigencia') ?? 20);

  switch (comando) {
    case 'version': {
      const v = await client.version();
      literal('Version', `Cod:${v.code},Msj:${v.message}`, v.code);
      break;
    }
    case 'token': {
      await client.token(true);
      console.log(`${hora()}  Token        Cod:00 (token recibido; no se muestra)`);
      break;
    }
    case 'compra': {
      const data = buildCompraData({
        amount: numero(texto('valor'), 'valor'),
        invoiceNumber: id,
        cashierCode: cajero,
        boxNumber: caja,
        receiptNumber: '',
        validityMinutes: vigencia,
        persist: 'N',
        terminalCode: terminal,
        merchantCode: codigoUnico,
      });
      console.log(`IdTransaccion: ${id}`);
      console.log(`Data         : ${data}`);
      const r = await client.enviarDatos({ idTransaccion: id, data });
      literal('EnviarDatos', r.raw, r.code);
      break;
    }
    case 'anulacion': {
      const clave = texto('clave-super');
      if (!clave) throw new Error('Falta --clave-super (la entrega Redeban).');
      const data = buildAnulacionData({
        amount: numero(texto('valor'), 'valor'),
        invoiceNumber: id,
        cashierCode: cajero,
        boxNumber: caja,
        approvalReceiptNumber: texto('recibo') ?? '',
        supervisorKey: clave,
        validityMinutes: vigencia,
        persist: 'N',
        terminalCode: terminal,
        merchantCode: codigoUnico,
      });
      console.log(`IdTransaccion: ${id}`);
      // La clave de supervisor no se imprime.
      console.log(`Data         : ${data.replace(`,${clave.slice(0, 4)},`, ',****,')}`);
      const r = await client.enviarDatos({ idTransaccion: id, data });
      literal('EnviarDatos', r.raw, r.code);
      break;
    }
    case 'respuesta': {
      if (!texto('id')) throw new Error('Falta --id.');
      const inicio = Date.now();
      await esperar(PRIMERA_CONSULTA_MS);
      for (;;) {
        const r = await client.respuesta(id).catch((e: Error) => {
          console.log(`${hora()}  Respuesta    sin respuesta de la nube (${e.message}): se sigue esperando`);
          return null;
        });
        if (r) {
          literal('Respuesta', r.raw, r.code);
          const k = r.consulta.kind;
          if (k === 'resuelta') {
            const res = r.consulta.result;
            console.log(`\nRESULTADO: ${res.approved ? 'APROBADA' : 'RECHAZADA'} | respuesta ${res.responseCode} | aprobacion ${res.approvalCode ?? '-'} | recibo ${res.receiptNumber ?? '-'} | RRN ${res.rrn ?? '-'} | ${res.franchise ?? '-'} | terminal ${res.terminalNumber ?? '-'} | ${res.date ?? ''} ${res.time ?? ''} | valor ${res.totalValue ?? '-'}`);
            break;
          }
          if (k === 'vencida' || k === 'error') {
            console.log(`\nRESULTADO: ${k === 'vencida' ? 'VENCIDA' : 'ERROR'}`);
            break;
          }
        }
        if (Date.now() - inicio >= CORTE_MS) {
          console.log(`\n${hora()}  TimeOut del POS (3 min sin resultado).`);
          if (!bandera('sin-borrar')) {
            const b = await client.borrar(id);
            literal('Borrar', b.raw, b.code);
          }
          break;
        }
        await esperar(CADA_MS);
      }
      break;
    }
    case 'borrar': {
      if (!texto('id')) throw new Error('Falta --id.');
      const b = await client.borrar(id);
      literal('Borrar', b.raw, b.code);
      break;
    }
    default:
      throw new Error(`Comando desconocido: ${comando}`);
  }
}

main()
  .catch((error: Error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
