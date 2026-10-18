import { ParticipantStatus } from '../../core/models/course.model';
import { Course, Enrollment } from '../../core/models/course.model';

export function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Ocurrió un error. Intenta nuevamente.';
}

/** Porcentaje de avance contando solo videos publicados. */
export function progressPercent(course: Course | null, enrollment: Enrollment | null): number {
  if (!course || !enrollment) return 0;
  const ids = new Set(course.videos.filter((v) => v.published).map((v) => v.id));
  if (ids.size === 0) return 0;
  const done = enrollment.completedVideoIds.filter((id) => ids.has(id)).length;
  return Math.round((done / ids.size) * 100);
}

export const ALL_STATUSES: ParticipantStatus[] = [
  'pendiente',
  'en_progreso',
  'listo_examen',
  'aprobado',
  'desaprobado',
];
