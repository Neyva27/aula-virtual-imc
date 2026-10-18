import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import { Course, Enrollment } from '../../../core/models/course.model';
import { Attempt, ExamConfig } from '../../../core/models/exam.model';

@Component({
  selector: 'app-exam-instructions',
  imports: [RouterLink],
  templateUrl: './instructions.html',
  styleUrl: './instructions.css',
})
export class ExamInstructions {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionSvc = inject(ExamSessionService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly course = signal<Course | null>(null);
  readonly enrollment = signal<Enrollment | null>(null);
  readonly config = signal<ExamConfig | null>(null);
  readonly attempts = signal<Attempt[]>([]);
  readonly questionCount = signal(0);

  readonly remaining = computed(() =>
    Math.max(0, (this.config()?.maxAttempts ?? 0) - this.attempts().length),
  );
  readonly hasActive = computed(() => {
    const user = this.auth.user();
    return !!user && this.sessionSvc.isActiveFor(user.id);
  });

  /** Motivo por el que no se puede iniciar (cadena vacía si se puede). */
  readonly blockReason = computed(() => {
    const e = this.enrollment();
    const c = this.course();
    if (!e || !c) return 'Aún no tienes un curso asignado.';
    if (e.status === 'aprobado') return 'Ya aprobaste el examen.';
    const total = c.videos.filter((v) => v.published).length;
    if (e.completedVideoIds.length < total) return 'Debes completar todos los videos para habilitar el examen.';
    if (this.remaining() <= 0 && !this.hasActive()) return 'Alcanzaste el límite de intentos permitidos.';
    return '';
  });

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      course: this.repo.getCourse(),
      enrollment: this.repo.getEnrollment(user.id),
      config: this.repo.getExamConfig(),
      attempts: this.repo.getAttempts(user.id),
      questions: this.repo.getQuestions(),
    }).subscribe({
      next: (r) => {
        this.course.set(r.course);
        this.enrollment.set(r.enrollment);
        this.config.set(r.config);
        this.attempts.set(r.attempts);
        this.questionCount.set(r.questions.length);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la información del examen.');
        this.loading.set(false);
      },
    });
  }

  start(): void {
    const user = this.auth.user();
    const config = this.config();
    if (!user || !config || this.blockReason()) return;
    if (!this.hasActive()) this.sessionSvc.start(user.id, config.timeMinutes);
    this.router.navigateByUrl('/examen');
  }
}
