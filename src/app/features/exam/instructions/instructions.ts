import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import { CourseRecord } from '../../../core/models/course.model';
import { Exam, ExamAvailability, MAX_ATTEMPTS } from '../../../core/models/exam.model';
import { RecoveryState } from '../../../core/models/recovery.model';
import { Icon } from '../../../shared/components/icon';

@Component({
  selector: 'app-exam-instructions',
  imports: [RouterLink, Icon, DatePipe],
  templateUrl: './instructions.html',
  styleUrl: './instructions.css',
})
export class ExamInstructions {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionSvc = inject(ExamSessionService);

  /** Parámetro :courseId de la ruta. */
  readonly courseId = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly course = signal<CourseRecord | null>(null);
  /** Examen activo del curso (interfaz provisional: uno por curso). */
  readonly exam = signal<Exam | null>(null);
  readonly availability = signal<ExamAvailability | null>(null);
  readonly questionCount = signal(0);
  /** R6: situación de recuperación del estudiante en el curso (null mientras carga). */
  readonly recovery = signal<RecoveryState | null>(null);
  /** R6: el examen que corresponde es una recuperación (autorizada, rendida o no rendida). */
  readonly recoveryInfo = computed(() => {
    const s = this.recovery();
    return s?.recovery && s.status && s.status !== 'anulada' && s.status !== 'pendiente' ? { status: s.status, recovery: s.recovery } : null;
  });
  /** R6: ya inició la recuperación (aunque sea en otra pestaña): se continúa con el mismo inicio. */
  readonly recoveryStarted = computed(() => !!this.recoveryInfo()?.recovery.startedAt);
  readonly startLabel = computed(() => {
    if (this.recoveryInfo()) return this.hasActive() || this.recoveryStarted() ? 'Continuar recuperación' : 'Comenzar recuperación';
    return this.hasActive() ? 'Continuar examen' : 'Comenzar examen';
  });
  /** Etapa 2B, Bloque 2 (R2): el inicio se está registrando (evita un doble clic). */
  readonly starting = signal(false);
  /** Motivo por el que el repositorio no registró el inicio (se muestra junto al botón). */
  readonly startError = signal('');

  readonly hasActive = computed(() => {
    const user = this.auth.user();
    const exam = this.exam();
    return !!user && !!exam && this.sessionSvc.isActiveForExam(user.id, exam);
  });
  /** RN-04: un solo intento activo a la vez, aunque sea de otro curso. */
  readonly otherActive = computed(() => {
    const user = this.auth.user();
    return !!user && this.sessionSvc.isActiveFor(user.id) && !this.hasActive();
  });

  /** Motivo por el que no se puede iniciar (cadena vacía si se puede). Lo decide el repositorio. */
  readonly blockReason = computed(() => {
    if (this.hasActive()) return '';
    if (this.otherActive()) return 'Tienes un examen en curso de otro curso. Termínalo antes de comenzar este.';
    const availability = this.availability();
    // El motivo del repositorio (curso en borrador, videos pendientes…) es más útil que «sin examen».
    if (availability && !availability.available && availability.reason) return availability.reason;
    if (!this.exam()) return 'El curso no tiene un examen activo.';
    return availability?.available ? '' : 'El examen no está disponible.';
  });

  /** Regla fija: un solo intento por alumno y examen (no es configurable). */
  readonly maxAttempts = MAX_ATTEMPTS;

  constructor() {
    effect(() => {
      const courseId = this.courseId();
      untracked(() => this.load(courseId));
    });
  }

  private load(courseId: string): void {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      content: this.repo.getParticipantCourseContent(user.id, courseId),
      exam: this.repo.getStudentExam(user.id, courseId), // R2: examen que le corresponde (por ahora, el regular)
      availability: this.repo.getExamAvailability(user.id, courseId),
      recovery: this.repo.getRecoveryStatus(user.id, courseId),
    })
      .pipe(
        switchMap((r) =>
          (r.exam ? this.repo.getExamQuestions(r.exam.id) : of([])).pipe(map((questions) => ({ ...r, questions }))),
        ),
      )
      .subscribe({
        next: (r) => {
          this.course.set(r.content.course);
          this.exam.set(r.exam);
          this.availability.set(r.availability);
          this.recovery.set(r.recovery);
          this.questionCount.set(r.questions.length);
          this.loading.set(false);
        },
        error: (e: Error) => {
          this.error.set(e.message || 'No se pudo cargar la información del examen.');
          this.loading.set(false);
        },
      });
  }

  /**
   * Etapa 2B, Bloque 2 (R2): el inicio lo registra el repositorio. Si el examen ya estaba iniciado (recarga u otra
   * pestaña), devuelve el mismo inicio y el tiempo no se reinicia. El navegador solo guarda las respuestas.
   */
  start(): void {
    const user = this.auth.user();
    const exam = this.exam();
    if (!user || !exam || this.blockReason() || this.starting()) return;
    this.starting.set(true);
    this.startError.set('');
    this.repo.startExam(user.id, this.courseId()).subscribe({
      next: (r) => {
        // Corrección de R3: con las respuestas guardadas en el repositorio (otra pestaña o recarga).
        const localOnly = this.sessionSvc.adopt(user.id, r.exam.id, Date.parse(r.startedAt), Date.parse(r.endsAt), r.answers);
        if (Object.keys(localOnly).length) {
          this.repo.saveExamAnswers(user.id, this.courseId(), localOnly).subscribe({ error: () => undefined });
        }
        this.starting.set(false);
        this.router.navigate(['/cursos', this.courseId(), 'examen', 'rendir']);
      },
      error: (e: Error) => {
        this.starting.set(false);
        this.startError.set(e.message || 'No se pudo iniciar el examen.');
      },
    });
  }
}
