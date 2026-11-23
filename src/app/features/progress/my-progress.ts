import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { ExamSessionService } from '../../core/services/exam-session.service';
import { ParticipantCourse } from '../../core/models/course.model';
import { Attempt, CourseResult, ExamAvailability, courseResult, isPendingReview } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { ProgressBar } from '../../shared/components/progress-bar';
import { AttemptDurationPipe } from '../../shared/pipes/attempt-duration.pipe';
import { Icon } from '../../shared/components/icon';

/** Estado de la evaluación del curso que puede deducirse de los datos guardados. */
/** «en_revision» (M5): rindió un examen con preguntas abiertas que el administrador aún no califica. */
export type ExamState = 'pendiente' | 'disponible' | 'en_curso' | 'en_revision' | 'aprobada' | 'desaprobada';

export const EXAM_STATE_LABELS: Record<ExamState, string> = {
  pendiente: 'Pendiente',
  disponible: 'Disponible',
  en_curso: 'En curso',
  en_revision: 'Pendiente de calificación', // R6: texto para el estudiante
  aprobada: 'Aprobada',
  desaprobada: 'Desaprobada',
};

const EXAM_STATE_TONES: Record<ExamState, string> = {
  pendiente: 'neutral',
  disponible: 'warning',
  en_curso: 'info',
  en_revision: 'warning',
  aprobada: 'success',
  desaprobada: 'danger',
};

/**
 * Deduce el estado de la evaluación sin inventar datos:
 * - un intento del examen activo (o el último, si ya no hay examen disponible) decide aprobada o desaprobada;
 * - si no, el repositorio dice si el examen está disponible y, si no lo está, por qué (pendiente);
 * - «En curso» solo si este navegador tiene una sesión de examen abierta para ese examen.
 * `attempts` debe venir ordenado del más reciente al más antiguo.
 */
export function examState(
  availability: ExamAvailability,
  attempts: Attempt[],
  activeExamId: string | null,
  inSession: boolean,
): { state: ExamState; reason: string } {
  if (inSession) return { state: 'en_curso', reason: '' };
  const result = (a: Attempt): ExamState => (isPendingReview(a) ? 'en_revision' : a.passed ? 'aprobada' : 'desaprobada');
  // R4: con recuperación, el estado sale de ella (es la nota vigente), aunque su examen no sea el activo.
  const recovery = attempts.find((a) => a.kind === 'recuperacion');
  if (recovery) return { state: result(recovery), reason: '' };
  const onActive = attempts.find((a) => a.examId === activeExamId);
  if (onActive) return { state: result(onActive), reason: '' };
  if (availability.available) return { state: 'disponible', reason: '' };
  const latest = attempts[0];
  if (latest) return { state: result(latest), reason: '' };
  return { state: 'pendiente', reason: availability.reason };
}

export interface CourseProgress {
  item: ParticipantCourse;
  state: ExamState;
  /** Motivo por el que la evaluación está pendiente (lo indica el repositorio). */
  reason: string;
  availability: ExamAvailability;
  /** Intentos registrados en el curso, del más reciente al más antiguo. */
  attempts: Attempt[];
  certificate: Certificate | null;
  /** R4: nota del examen regular, de la recuperación y final (una sola vigente). */
  result: CourseResult;
}

/** «Mi progreso»: avance del alumno autenticado en sus cursos asignados. No reemplaza a «Mis certificados». */
@Component({
  selector: 'app-my-progress',
  imports: [RouterLink, DatePipe, StatusBadge, ProgressBar, AttemptDurationPipe, Icon],
  templateUrl: './my-progress.html',
  styleUrl: './my-progress.css',
})
export class MyProgress {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly sessions = inject(ExamSessionService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly courses = signal<CourseProgress[]>([]);

  readonly labels = EXAM_STATE_LABELS;
  readonly pending = isPendingReview;
  readonly tones = EXAM_STATE_TONES;

  readonly completedCourses = computed(
    () => this.courses().filter((c) => c.item.totalVideos > 0 && c.item.completedVideos >= c.item.totalVideos).length,
  );
  readonly approvedExams = computed(() => this.courses().filter((c) => c.state === 'aprobada').length);
  /**
   * M6: certificados vigentes emitidos al alumno autenticado, calculados de sus datos en cada carga (nunca un número
   * fijo). No cuentan revocados, ni evaluaciones en revisión o desaprobadas (no generan certificado).
   */
  private readonly ownCertificates = signal<Certificate[]>([]);
  readonly earnedCertificates = computed(() => this.ownCertificates().filter((c) => c.status === 'vigente').length);
  /** Ningún video completado ni intento registrado en ningún curso. */
  readonly noProgress = computed(() =>
    this.courses().every((c) => c.item.completedVideos === 0 && c.attempts.length === 0),
  );

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    // Solo se consultan los datos del alumno autenticado.
    forkJoin({
      list: this.repo.getParticipantCourses(user.id),
      attempts: this.repo.listAttempts({ userId: user.id }),
      certificates: this.repo.listCertificates({ userId: user.id }),
    })
      .pipe(
        switchMap(({ list, attempts, certificates }) => {
          this.ownCertificates.set(certificates.filter((c) => c.userId === user.id));
          if (list.length === 0) return of([] as CourseProgress[]);
          return forkJoin(
            list.map((item) =>
              forkJoin({
                availability: this.repo.getExamAvailability(user.id, item.course.id),
                exam: this.repo.getActiveExam(item.course.id),
              }).pipe(
                map(({ availability, exam }): CourseProgress => {
                  const own = attempts
                    .filter((a) => a.courseId === item.course.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  const inSession = !!exam && this.sessions.isActiveForExam(user.id, exam);
                  return {
                    item,
                    ...examState(availability, own, exam?.id ?? null, inSession),
                    availability,
                    attempts: own,
                    result: courseResult(own),
                    certificate:
                      certificates.find((c) => c.courseId === item.course.id && c.status === 'vigente') ?? null,
                  };
                }),
              ),
            ),
          );
        }),
      )
      .subscribe({
        next: (courses) => {
          this.courses.set(courses);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar tu progreso. Intenta nuevamente.');
          this.loading.set(false);
        },
      });
  }

  cta(p: ParticipantCourse): string {
    if (p.completedVideos === 0) return 'Comenzar curso';
    return p.completedVideos < p.totalVideos ? 'Continuar curso' : 'Revisar curso';
  }
}
