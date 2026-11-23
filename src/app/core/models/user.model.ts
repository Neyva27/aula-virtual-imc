/** Solo dos perfiles (decisión D-4): Instructor y Participante (estudiante). */
export type Role = 'participant' | 'instructor';

/** Valor que usaban las versiones anteriores para el Instructor (estado v2/v3 y sesiones guardadas). */
export type LegacyRole = 'admin';

export interface User {
  id: string;
  /** Nombre completo para mostrar. Se conserva junto a nombres y apellidos (v4). */
  fullName: string;
  /** Nombres y apellidos en campos separados (decisión D-9). */
  firstNames: string;
  lastNames: string;
  /**
   * La separación de nombres y apellidos se dedujo automáticamente de `fullName` al migrar (v4)
   * y conviene revisarla. Las pantallas siguen mostrando `fullName`.
   */
  nameReview?: boolean;
  /**
   * Modo API (B1.3): la contraseña es temporal y debe cambiarse antes de usar la plataforma.
   * En modo demostración no se usa.
   */
  mustChangePassword?: boolean;
  email: string;
  dni?: string; // DNI ficticio de prueba
  role: Role;
  /** Etapa 2B, Bloque 2 (R1): empresa del estudiante (filtro de «Evaluaciones rendidas»). Opcional. */
  companyId?: string;
  /** Modo API (23/11/2026): TODAS las empresas del participante, para los reportes. */
  companyNames?: string[];
  whatsapp?: string | null;
}

/** Etapa 2B, Bloque 2 (R1): empresa a la que pertenecen los estudiantes. En la demostración son ficticias. */
export interface Company {
  id: string;
  name: string;
}

/**
 * Convierte un rol guardado por cualquier versión al rol vigente: «admin» (anterior) pasa a «instructor».
 * Devuelve null si el valor no es un rol conocido.
 */
export function normalizeRole(role: unknown): Role | null {
  if (role === 'admin' || role === 'instructor') return 'instructor';
  if (role === 'participant') return 'participant';
  return null;
}

/**
 * Separación automática de un nombre completo: la primera palabra como nombres y el resto como apellidos.
 * Puede equivocarse con nombres compuestos, por eso quien la usa marca el registro para revisión.
 */
export function splitFullName(fullName: string): { firstNames: string; lastNames: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstNames: words[0] ?? '', lastNames: words.slice(1).join(' ') };
}
