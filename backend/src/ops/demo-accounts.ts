/**
 * Datos de DEMOSTRACIÓN (solo desarrollo y pruebas): fuente única de sus identificadores y marcas reconocibles.
 * Los usa la semilla (prisma/seed-data.ts) y también la comprobación de limpieza de producción (db:check-clean),
 * que necesita saber qué buscar. Ningún dato real puede tener estas marcas:
 * - correos con el dominio reservado `.test` (RFC 2606);
 * - DNI `0000000X` y RUC `00000000001`;
 * - identificadores fijos `emp-demo`, `a1`, `u1`…`u6` (los de la demo del frontend).
 */

export const DEMO_COMPANY = { id: 'emp-demo', name: 'Empresa de demostración', ruc: '00000000001' };

export const DEMO_INSTRUCTOR = {
  id: 'a1',
  email: 'admin@ejemplo.test', // mismo correo que la cuenta de la demo del frontend
  firstNames: 'Instructor',
  lastNames: 'de Prueba',
};

export const DEMO_STUDENTS = [
  { id: 'u1', email: 'ana@ejemplo.test', firstNames: 'Ana', lastNames: 'Torres Quispe', dni: '00000001' },
  { id: 'u2', email: 'luis@ejemplo.test', firstNames: 'Luis', lastNames: 'Mendoza Rojas', dni: '00000002' },
  { id: 'u3', email: 'carla@ejemplo.test', firstNames: 'Carla', lastNames: 'Vega Soto', dni: '00000003' },
  { id: 'u4', email: 'pedro@ejemplo.test', firstNames: 'Pedro', lastNames: 'Ramos Díaz', dni: '00000004' },
  { id: 'u5', email: 'rosa@ejemplo.test', firstNames: 'Rosa', lastNames: 'Cruz Huamán', dni: '00000005' },
  { id: 'u6', email: 'jorge@ejemplo.test', firstNames: 'Jorge', lastNames: 'Salas León', dni: '00000006' },
];

/** Marcas que identifican un dato ficticio. */
export const DEMO_MARKERS = {
  userIds: [DEMO_INSTRUCTOR.id, ...DEMO_STUDENTS.map((s) => s.id)],
  companyId: DEMO_COMPANY.id,
  ruc: DEMO_COMPANY.ruc,
  /** Dominio reservado para pruebas: nunca pertenece a una persona real. */
  emailSuffix: '.test',
  /** DNI ficticios 00000001…00000009. */
  dniPrefix: '0000000',
} as const;
