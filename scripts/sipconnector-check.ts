/**
 * Comprueba el enlace con SIPConnector ejercitando TODOS sus metodos contra el
 * ambiente configurado: Version, Token, EnviarDatos, Respuesta y Borrar.
 *
 * Uso:  npx tsx scripts/sipconnector-check.ts [monto]
 *
 * Deja el ambiente como lo encontro: la transaccion de prueba se borra al
 * final. Sirve para verificar credenciales nuevas sin tener que montar un cobro
 * real desde la interfaz.
 */

import 'dotenv/config';
import { SipConnectorClient } from '../src/integrations/sipconnector/client';
import { buildCompraData } from '../src/integrations/sipconnector/codec';
import { SIP_CODE_MEANING, networkLabel } from '../src/integrations/sipconnector/codes';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el .env`);
  return value;
}

async function main() {
  const amount = Number(process.argv[2] ?? 100);

  const client = new SipConnectorClient({
    baseUrl: required('REDEBAN_BASE_URL'),
    codigoUnico: required('REDEBAN_CODIGO_UNICO'),
    usuario: required('REDEBAN_USUARIO'),
    clave: required('REDEBAN_CLAVE'),
    codigoTerminal: required('REDEBAN_CODIGO_TERMINAL'),
    red: process.env.REDEBAN_RED ?? '0',
  });

  console.log(`\nAmbiente : ${process.env.REDEBAN_BASE_URL}`);
  console.log(`Comercio : ${process.env.REDEBAN_CODIGO_UNICO}`);
  console.log(`Terminal : ${process.env.REDEBAN_CODIGO_TERMINAL}`);
  console.log(`Red      : ${networkLabel(process.env.REDEBAN_RED ?? '0')}\n`);

  /* 1. Version — prueba de vida, sin token */
  const version = await client.version();
  console.log(`Version      ${version.ok ? 'OK' : 'FALLO'}  ${version.version ?? version.code}`);

  /* 2. Token */
  const token = await client.token(true);
  console.log(`Token        OK  (${token.length} caracteres, vigencia 3 min)`);

  /* 3. EnviarDatos */
  const idTransaccion = `CHK${Date.now().toString(36).slice(-7).toUpperCase()}`;
  const data = buildCompraData({
    amount,
    invoiceNumber: idTransaccion,
    cashierCode: 'CHEQUEO',
    terminalCode: required('REDEBAN_CODIGO_TERMINAL'),
    boxNumber: 'CHEQUEO',
    receiptNumber: idTransaccion,
    validityMinutes: 1,
    persist: 'N',
    merchantCode: required('REDEBAN_CODIGO_UNICO'),
  });
  console.log(`\nTrama enviada (Anexo 1.1, 20 campos):\n  ${data}\n`);

  const sent = await client.enviarDatos({ idTransaccion, data });
  console.log(
    `EnviarDatos  ${sent.accepted ? 'OK' : 'FALLO'}  Cod:${sent.code} — ${SIP_CODE_MEANING[sent.code] ?? '?'}`,
  );
  if (!sent.accepted) {
    console.log(`  mensaje: ${sent.message}`);
    return;
  }

  /* 4. Respuesta */
  const state = await client.respuesta(idTransaccion);
  console.log(
    `Respuesta    Cod:${state.code} — ${SIP_CODE_MEANING[state.code] ?? '?'}`,
  );
  if (state.pending && !state.started) {
    console.log('  La orden esta puesta y el datafono aun no la ha tomado.');
    console.log('  Es lo esperado sin un datafono fisico conectado.');
  }
  if (state.result) {
    console.log(`  resultado: ${state.result.approved ? 'APROBADA' : 'RECHAZADA'}`);
    console.log(`  valor aprobado: ${state.result.totalValue}`);
  }

  /* 5. Borrar — deja el ambiente limpio y libera la terminal */
  const deleted = await client.borrar(idTransaccion);
  console.log(
    `Borrar       ${deleted.deleted ? 'OK' : 'FALLO'}  Cod:${deleted.code} — ${SIP_CODE_MEANING[deleted.code] ?? '?'}`,
  );

  console.log('\nTodos los metodos del servicio respondieron.\n');
}

main().catch((error) => {
  console.error(`\nFALLO: ${error.message ?? error}\n`);
  process.exit(1);
});
