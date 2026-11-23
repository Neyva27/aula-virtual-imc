/**
 * `npm run db:check-clean` (punto A). Comprueba, SOLO LEYENDO, que la base de DATABASE_URL no contenga datos
 * de demostración. Ejecutarlo en producción después de migrar y antes de abrir la plataforma.
 *
 * Código de salida: 0 = limpia; 1 = hay datos de demostración; 2 = no se pudo comprobar.
 */
import { findDemoTraces } from '../ops/demo-traces.js';
import { cliDatabase } from './cli-env.js';

async function main(): Promise<number> {
  const { prisma, name } = cliDatabase();
  try {
    const traces = await findDemoTraces(prisma);
    if (traces.clean) {
      console.log(`Base «${name}»: LIMPIA. No contiene empresas, usuarios ni estudiantes de demostración.`);
      return 0;
    }
    console.error(`Base «${name}»: CONTIENE DATOS DE DEMOSTRACIÓN. No debe usarse como base de producción.`);
    console.error(`- Empresas de demostración: ${traces.companies}`);
    console.error(`- Usuarios de demostración (identificador fijo o correo .test): ${traces.users}`);
    console.error(`- Estudiantes con DNI ficticio 0000000X: ${traces.students}`);
    if (traces.sampleUserIds.length) console.error(`- Identificadores: ${traces.sampleUserIds.join(', ')}`);
    console.error('Este comando no modifica nada.');
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`No se pudo comprobar la base: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
