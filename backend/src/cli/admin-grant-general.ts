/**
 * `npm run admin:grant-general` (B2.2a). Habilita la PRIMERA cuenta de administración general de IMC: otorga el
 * permiso IMC_GENERAL_ADMIN a un Instructor que YA existe. La cuenta conserva el rol INSTRUCTOR.
 *
 * No crea usuarios: en una base nueva, primero `npm run admin:create` (crea el primer Instructor) y después este
 * comando con el mismo correo. No cambia la contraseña ni el cambio obligatorio de contraseña.
 *
 * Uso interactivo (pide el correo y una confirmación):
 *   npm run admin:grant-general
 * Uso sin preguntas (por ejemplo, por SSH en el servidor):
 *   npm run admin:grant-general -- --email=correo@empresa.pe --si
 *
 * Se niega si ya hay una cuenta activa con el permiso, si la cuenta no existe, no es Instructor, está desactivada o
 * no tiene perfil de Instructor.
 * Código de salida: 0 = otorgado; 1 = rechazado o cancelado; 2 = error.
 */
import { createInterface } from 'node:readline/promises';
import { BootstrapRefusedError } from '../ops/bootstrap-instructor.js';
import { grantFirstGeneralAdmin, normalizeEmail } from '../ops/bootstrap-general-admin.js';
import { cliDatabase } from './cli-env.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function readInput(): Promise<{ email: string; confirmed: boolean }> {
  const fromArgs = argValue('email');
  if (fromArgs) return { email: normalizeEmail(fromArgs), confirmed: process.argv.includes('--si') };
  if (!process.stdin.isTTY) throw new BootstrapRefusedError('Sin terminal interactiva: indica --email y --si.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = normalizeEmail(await rl.question('Correo del Instructor que recibirá la administración general: '));
    const answer = await rl.question(`¿Otorgar el permiso de administración general de IMC a <${email}>? (s/N): `);
    return { email, confirmed: ['s', 'si', 'sí'].includes(answer.trim().toLowerCase()) };
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const { email, confirmed } = await readInput();
  if (!confirmed) {
    console.log('Cancelado: no se otorgó ningún permiso.');
    return 1;
  }
  const { prisma, name } = cliDatabase();
  try {
    const result = await grantFirstGeneralAdmin(prisma, email);
    console.log('');
    console.log(`Permiso de administración general otorgado en la base «${name}» a: ${result.email}`);
    console.log('La cuenta conserva el rol Instructor. La acción quedó registrada en la bitácora.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof BootstrapRefusedError) {
      console.error(`No se otorgó ningún permiso: ${error.message}`);
      process.exit(1);
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
