/**
 * Niveles oficiales de los cursos (23/11/2026). Son exactamente estos tres. Un curso sin nivel (NULL) está «Pendiente de
 * clasificación»: a los cursos existentes no se les asigna ninguno de forma automática.
 */
export const COURSE_LEVELS = ['persona_autorizada', 'persona_competente', 'persona_certificada'] as const;
export type CourseLevelValue = (typeof COURSE_LEVELS)[number];
export type CourseLevelColumn = 'PERSONA_AUTORIZADA' | 'PERSONA_COMPETENTE' | 'PERSONA_CERTIFICADA';

export const COURSE_LEVEL_LABELS: Record<CourseLevelValue, string> = {
  persona_autorizada: 'Persona autorizada',
  persona_competente: 'Persona competente',
  persona_certificada: 'Persona certificada',
};

export const COURSE_LEVEL_INVALID = 'El nivel del curso debe ser Persona autorizada, Persona competente o Persona certificada.';
/** Valor del filtro `GET /courses?level=` para los cursos sin nivel. */
export const LEVEL_PENDING = 'pendiente';

export const levelToColumn = (level: CourseLevelValue | null | undefined): CourseLevelColumn | null =>
  level ? (level.toUpperCase() as CourseLevelColumn) : null;
export const levelFromColumn = (level: CourseLevelColumn | null | undefined): CourseLevelValue | null =>
  level ? (level.toLowerCase() as CourseLevelValue) : null;
