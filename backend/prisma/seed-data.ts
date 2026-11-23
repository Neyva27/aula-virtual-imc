/**
 * Semilla de DEMOSTRACIÓN para la base (solo desarrollo y pruebas). La usan prisma/seed.ts y las pruebas.
 *
 * - Reproduce las cuentas de src/app/core/data/seed.ts del frontend con los MISMOS identificadores
 *   (a1, u1…u6), para que en la etapa híbrida el usuario autenticado coincida con los datos de la demo.
 * - Datos ficticios (definidos en src/ops/demo-accounts.ts): DNI 0000000X, correos .test, RUC 00000000001.
 * - Idempotente y no destructiva: solo crea lo que falta; si un registro ya existe, NO lo modifica.
 * - Esta función NO comprueba si puede escribir: prisma/seed.ts llama antes a assertSeedAllowed().
 *
 * B2.1: el estudiante ya no guarda su empresa (`students.company_id` se retiró). La asociación con la empresa de
 * demostración se crea en `student_companies` SOLO junto con un estudiante nuevo: a un estudiante que ya existía no
 * se le agrega ni se le cambia ninguna empresa. El Instructor de demostración recibe su perfil (`instructors`) y se
 * asocia a la empresa de demostración (`instructor_companies`), para que pueda ver a los estudiantes de la demo.
 */
import argon2 from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';
import { DEMO_COMPANY, DEMO_INSTRUCTOR, DEMO_STUDENTS } from '../src/ops/demo-accounts.js';

export { DEMO_COMPANY, DEMO_INSTRUCTOR, DEMO_STUDENTS };

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export interface SeedCounts {
  companies: number;
  users: number;
  students: number;
  instructors: number;
  studentCompanies: number;
  instructorCompanies: number;
}

/** Crea los datos que falten. Devuelve cuántos registros creó en cada tabla. */
export async function seedDemo(prisma: PrismaClient, demoPassword: string): Promise<SeedCounts> {
  const created: SeedCounts = { companies: 0, users: 0, students: 0, instructors: 0, studentCompanies: 0, instructorCompanies: 0 };
  const passwordHash = await argon2.hash(demoPassword, ARGON2_OPTIONS);

  if (!(await prisma.company.findUnique({ where: { id: DEMO_COMPANY.id } }))) {
    await prisma.company.create({ data: DEMO_COMPANY });
    created.companies++;
  }

  const accounts = [
    { ...DEMO_INSTRUCTOR, role: Role.INSTRUCTOR, dni: null as string | null },
    ...DEMO_STUDENTS.map((s) => ({ ...s, role: Role.STUDENT })),
  ];
  for (const account of accounts) {
    if (!(await prisma.user.findUnique({ where: { id: account.id } }))) {
      await prisma.user.create({
        data: {
          id: account.id,
          email: account.email,
          role: account.role,
          firstNames: account.firstNames,
          lastNames: account.lastNames,
          passwordHash,
        },
      });
      created.users++;
    }

    if (account.role === Role.INSTRUCTOR) {
      if (!(await prisma.instructor.findUnique({ where: { userId: account.id } }))) {
        await prisma.instructor.create({ data: { userId: account.id } });
        created.instructors++;
      }
      const link = { instructorId: account.id, companyId: DEMO_COMPANY.id };
      if (!(await prisma.instructorCompany.findUnique({ where: { instructorId_companyId: link } }))) {
        await prisma.instructorCompany.create({ data: link });
        created.instructorCompanies++;
      }
    } else if (account.dni && !(await prisma.student.findUnique({ where: { userId: account.id } }))) {
      await prisma.student.create({ data: { userId: account.id, dni: account.dni } });
      await prisma.studentCompany.create({ data: { studentId: account.id, companyId: DEMO_COMPANY.id } });
      created.students++;
      created.studentCompanies++;
    }
  }
  return created;
}
