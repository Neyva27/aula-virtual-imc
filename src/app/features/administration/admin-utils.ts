import { ParticipantStatus } from '../../core/models/course.model';
import { CourseContent, Enrollment } from '../../core/models/course.model';

export function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Ocurrió un error. Intenta nuevamente.';
}

/** Videos publicados de cada curso (id del curso → ids de sus videos publicados). */
export function publishedVideoIds(contents: CourseContent[]): Map<string, Set<string>> {
  return new Map(
    contents.map((c) => [c.course.id, new Set(c.modules.flatMap((m) => m.videos).filter((v) => v.published).map((v) => v.id))]),
  );
}

/** Porcentaje de avance de una inscripción, contando solo los videos publicados de su curso. */
export function enrollmentPercent(enrollment: Enrollment, published: Map<string, Set<string>>): number {
  const ids = published.get(enrollment.courseId);
  if (!ids || ids.size === 0) return 0;
  const done = enrollment.completedVideoIds.filter((id) => ids.has(id)).length;
  return Math.round((done / ids.size) * 100);
}

export const ALL_STATUSES: ParticipantStatus[] = [
  'pendiente',
  'en_progreso',
  'listo_examen',
  'en_revision',
  'aprobado',
  'desaprobado',
];
