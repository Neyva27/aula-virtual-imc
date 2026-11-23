/**
 * `npm run admin:create` (punto C). Crea el PRIMER Instructor en una base sin instructores activos.
 *
 * Uso interactivo (pide los datos y una confirmación):
 *   npm run admin:create
 * Uso sin preguntas (por ejemplo, por SSH en el servidor):
 *   npm run admin:create -- --email=correo@empresa.pe --nombres="Nombres" --apellidos="Apellidos" --si
 *
 * Muestra la contraseña temporal UNA sola vez. El Instructor debe cambiarla en su primer ingreso:
 * mientras no lo haga, la API solo le permite ver su perfil, cambiar la contraseña y cerrar sesión.
 * Código de salida: 0 = creado; 1 = rechazado (ya hay un Instructor, datos inválidos); 2 = error.
 */
import { createInterface } from 'node:readline/promises';
import { PasswordService } from '../modules/auth/password.service.js';
import { BootstrapRefusedError, createFirstInstructor, validateInstructorInput, type FirstInstructorInput } from '../ops/bootstrap-instructor.js';
import { cliDatabase } from './cli-env.js';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function readInput(): Promise<{ input: FirstInstructorInput; confirmed: boolean }> {
  const fromArgs = { email: argValue('email'), firstNames: argValue('nombres'), lastNames: argValue('apellidos') };
  const yes = process.argv.includes('--si');
  if (fromArgs.email && fromArgs.firstNames && fromArgs.lastNames) {
    return { input: fromArgs as FirstInstructorInput, confirmed: yes };
  }
  if (!process.stdin.isTTY) {
    throw new BootstrapRefusedError('Sin terminal interactiva: indica --email, --nombres, --apellidos y --si.');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const input = {
      email: fromArgs.email ?? (await rl.question('Correo electrónico del Instructor: ')),
      firstNames: fromArgs.firstNames ?? (await rl.question('Nombres: ')),
      lastNames: fromArgs.lastNames ?? (await rl.question('Apellidos: ')),
    };
    const clean = validateInstructorInput(input);
    const answer = await rl.question(`¿Crear el Instructor ${clean.firstNames} ${clean.lastNames} <${clean.email}>? (s/N): `);
    return { input: clean, confirmed: ['s', 'si', 'sí'].includes(answer.trim().toLowerCase()) };
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const { input, confirmed } = await readInput();
  validateInstructorInput(input);
  if (!confirmed) {
    console.log('Cancelado: no se creó ningún usuario.');
    return 1;
  }
  const { prisma, name } = cliDatabase();
  try {
    const passwords = new PasswordService();
    const result = await createFirstInstructor(prisma, input, (plain) => passwords.hash(plain));
    console.log('');
    console.log(`Instructor creado en la base «${name}»: ${result.email}`);
    console.log('');
    console.log('  Contraseña temporal (se muestra UNA sola vez; no se guarda en ningún lugar):');
    console.log(`  ${result.temporaryPassword}`);
    console.log('');
    console.log('Entrégala por un canal seguro. Al iniciar sesión, la plataforma exigirá cambiarla.');
    console.log('Los demás instructores se crean desde la administración.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof BootstrapRefusedError) {
      console.error(`No se creó ningún usuario: ${error.message}`);
      process.exit(1);
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
