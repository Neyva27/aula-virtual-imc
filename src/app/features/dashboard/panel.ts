import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { Course, Enrollment } from '../../core/models/course.model';
import { Attempt, ExamConfig } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { ProgressBar } from '../../shared/components/progress-bar';

@Component({
  selector: 'app-panel',
  imports: [RouterLink, DatePipe, StatusBadge, ProgressBar],
  templateUrl: './panel.html',
  styleUrl: './panel.css',
})
export class Panel {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly loading = signal(true);
  readonly error = signal('');

  readonly course = signal<Course | null>(null);
  readonly enrollment = signal<Enrollment | null>(null);
  readonly exam = signal<ExamConfig | null>(null);
  readonly attempts = signal<Attempt[]>([]);
  readonly certificates = signal<Certificate[]>([]);

  readonly firstName = computed(() => this.user()?.fullName.split(' ')[0] ?? '');
  readonly total = computed(() => this.course()?.videos.filter((v) => v.published).length ?? 0);
  readonly completed = computed(() => this.enrollment()?.completedVideoIds.length ?? 0);
  readonly percent = computed(() =>
    this.total() ? Math.round((this.completed() / this.total()) * 100) : 0,
  );
  readonly remaining = computed(() =>
    Math.max(0, (this.exam()?.maxAttempts ?? 0) - this.attempts().length),
  );

  readonly examState = computed<'locked' | 'available' | 'passed' | 'exhausted'>(() => {
    const e = this.enrollment();
    if (!e) return 'locked';
    if (e.status === 'aprobado') return 'passed';
    if (this.total() === 0 || this.completed() < this.total()) return 'locked';
    return this.remaining() > 0 ? 'available' : 'exhausted';
  });

  readonly courseButton = computed(() => {
    if (this.completed() === 0) return 'Comenzar curso';
    return this.completed() < this.total() ? 'Continuar curso' : 'Revisar videos';
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
      exam: this.repo.getExamConfig(),
      attempts: this.repo.getAttempts(user.id),
      certificates: this.repo.getCertificates(user.id),
    }).subscribe({
      next: (r) => {
        this.course.set(r.course);
        this.enrollment.set(r.enrollment);
        this.exam.set(r.exam);
        this.attempts.set(r.attempts);
        this.certificates.set(r.certificates);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar tu panel. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }
}
