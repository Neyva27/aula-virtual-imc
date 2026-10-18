import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { Attempt, ExamConfig } from '../../../core/models/exam.model';

@Component({
  selector: 'app-exam-result',
  imports: [RouterLink, DatePipe],
  templateUrl: './result.html',
  styleUrl: './result.css',
})
export class ExamResult {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly attempt = signal<Attempt | null>(null);
  readonly config = signal<ExamConfig | null>(null);
  readonly attemptsCount = signal(0);

  readonly remaining = computed(() =>
    Math.max(0, (this.config()?.maxAttempts ?? 0) - this.attemptsCount()),
  );

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      attempts: this.repo.getAttempts(user.id),
      config: this.repo.getExamConfig(),
    }).subscribe({
      next: ({ attempts, config }) => {
        const sorted = [...attempts].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        this.attempt.set(sorted[0] ?? null);
        this.attemptsCount.set(attempts.length);
        this.config.set(config);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el resultado.');
        this.loading.set(false);
      },
    });
  }

  duration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  }
}
