import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { Attempt, CourseResult, Exam, ExamAvailability, courseResult, isPendingReview } from '../../../core/models/exam.model';
import { Certificate } from '../../../core/models/certificate.model';
import { AttemptDurationPipe } from '../../../shared/pipes/attempt-duration.pipe';
import { Icon } from '../../../shared/components/icon';
import { CourseRecord } from '../../../core/models/course.model';

@Component({
  selector: 'app-exam-result',
  imports: [RouterLink, DatePipe, AttemptDurationPipe, Icon],
  templateUrl: './result.html',
  styleUrl: './result.css',
})
export class ExamResult {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);

  /** Parámetro :courseId de la ruta. */
  readonly courseId = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly attempt = signal<Attempt | null>(null);
  readonly exam = signal<Exam | null>(null);
  readonly availability = signal<ExamAvailability | null>(null);
  readonly certificate = signal<Certificate | null>(null);
  /** R4: nota del examen regular, de la recuperación y final (una sola vigente). */
  readonly result = signal<CourseResult | null>(null);

  readonly course = signal<CourseRecord | null>(null);
  /** M5: el intento tiene preguntas abiertas sin calificar. */
  readonly pending = isPendingReview;

  readonly remaining = computed(() => this.availability()?.remainingAttempts ?? 0);
  readonly maxAttempts = computed(() => this.availability()?.maxAttempts ?? 0);
  /** El último intento corresponde al examen activo del curso (y no a uno anterior ya inactivo). */
  readonly sameExam = computed(() => !!this.exam() && this.attempt()?.examId === this.exam()!.id);
  /**
   * Con un solo intento por examen, el examen ya rendido nunca vuelve a estar disponible. Solo puede
   * estarlo un examen nuevo del curso, distinto del que se rindió (lo decide el repositorio).
   */
  readonly newExamAvailable = computed(() => !!this.availability()?.available && !this.sameExam());

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
      attempts: this.repo.listAttempts({ userId: user.id, courseId }),
      exam: this.repo.getActiveExam(courseId),
      availability: this.repo.getExamAvailability(user.id, courseId),
      certificates: this.repo.listCertificates({ userId: user.id, courseId }),
      courses: this.repo.getCourses(),
    }).subscribe({
      next: (r) => {
        this.course.set(r.courses.find((c) => c.id === courseId) ?? null);
        // R4: el intento que vale es la recuperación si existe (reemplaza a la regular, aunque sea menor).
        const result = courseResult(r.attempts);
        this.result.set(result);
        this.attempt.set(result.current);
        this.exam.set(r.exam);
        this.availability.set(r.availability);
        this.certificate.set(r.certificates.find((c) => c.status === 'vigente') ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el resultado.');
        this.loading.set(false);
      },
    });
  }
}
