import type { PrismaClient } from '../generated/prisma/client.js';
import { DEMO_MARKERS } from './demo-accounts.js';

export interface DemoTraces {
  clean: boolean;
  companies: number;
  users: number;
  students: number;
  /** Identificadores (nunca correos ni contraseñas) de hasta 20 usuarios con marcas de demostración. */
  sampleUserIds: string[];
}

/**
 * Busca rastros de datos de demostración (punto A, db:check-clean). Solo lectura.
 * Una base de producción debe devolver `clean: true` antes de abrir la plataforma.
 */
export async function findDemoTraces(prisma: PrismaClient): Promise<DemoTraces> {
  const userWhere = {
    OR: [{ id: { in: [...DEMO_MARKERS.userIds] } }, { email: { endsWith: DEMO_MARKERS.emailSuffix } }],
  };
  const [companies, users, students, sample] = await Promise.all([
    prisma.company.count({ where: { OR: [{ id: DEMO_MARKERS.companyId }, { ruc: DEMO_MARKERS.ruc }] } }),
    prisma.user.count({ where: userWhere }),
    prisma.student.count({ where: { dni: { startsWith: DEMO_MARKERS.dniPrefix } } }),
    prisma.user.findMany({ where: userWhere, select: { id: true }, take: 20, orderBy: { id: 'asc' } }),
  ]);
  return {
    clean: companies + users + students === 0,
    companies,
    users,
    students,
    sampleUserIds: sample.map((u) => u.id),
  };
}
