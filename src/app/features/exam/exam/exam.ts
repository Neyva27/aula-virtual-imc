import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import { Question } from '../../../core/models/exam.model';
import { ProgressBar } from '../../../shared/components/progress-bar';

@Component({
  selector: 'app-exam',
  imports: [ProgressBar],
  templateUrl: './exam.html',
  styleUrl: './exam.css',
})
export class Exam implements OnInit {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionSvc = inject(ExamSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly session = this.sessionSvc.session;
  readonly questions = signal<Question[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly showConfirm = signal(false);
  readonly now = signal(Date.now());

  readonly remainingSec = computed(() => {
    const s = this.session();
    return s ? Math.max(0, Math.ceil((s.endsAt - this.now()) / 1000)) : 0;
  });
  readonly timeLabel = computed(() => {
    const t = this.remainingSec();
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${m}:${s}`;
  });
  readonly lowTime = computed(() => this.remainingSec() <= 120);

  readonly index = computed(() => this.session()?.index ?? 0);
  readonly current = computed<Question | null>(() => this.questions()[this.index()] ?? null);
  readonly answeredCount = computed(
    () => this.questions().filter((q) => (this.session()?.answers[q.id]?.length ?? 0) > 0).length,
  );
  readonly unanswered = computed(() => this.questions().length - this.answeredCount());
  readonly percent = computed(() =>
    this.questions().length ? Math.round((this.answeredCount() / this.questions().length) * 100) : 0,
  );

  ngOnInit(): void {
    const user = this.auth.user();
    const s = this.session();
    if (!user || !s || s.userId !== user.id) {
      this.router.navigateByUrl('/examen/instrucciones');
      return;
    }

    this.repo.getQuestions().subscribe({
      next: (list) => {
        this.questions.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las preguntas.');
        this.loading.set(false);
      },
    });

    // Temporizador SIMULADO en el navegador. En producción lo controla el servidor (RN-14).
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.remainingSec() === 0 && !this.submitting() && this.questions().length > 0) {
        this.submit();
      }
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  isSelected(questionId: string, optionId: string): boolean {
    return this.session()?.answers[questionId]?.includes(optionId) ?? false;
  }

  choose(q: Question, optionId: string): void {
    if (q.type === 'multiple') {
      const now = this.session()?.answers[q.id] ?? [];
      const next = now.includes(optionId) ? now.filter((id) => id !== optionId) : [...now, optionId];
      this.sessionSvc.setAnswer(q.id, next);
    } else {
      this.sessionSvc.setAnswer(q.id, [optionId]);
    }
  }

  isAnswered(q: Question): boolean {
    return (this.session()?.answers[q.id]?.length ?? 0) > 0;
  }

  go(i: number): void {
    if (i >= 0 && i < this.questions().length) this.sessionSvc.setIndex(i);
  }

  askSubmit(): void {
    this.showConfirm.set(true);
  }

  cancelSubmit(): void {
    this.showConfirm.set(false);
  }

  submit(): void {
    const s = this.session();
    const user = this.auth.user();
    if (!s || !user || this.submitting()) return;
    this.submitting.set(true);
    this.showConfirm.set(false);
    this.error.set('');

    const limitSec = Math.round((s.endsAt - s.startedAt) / 1000);
    const durationSec = Math.min(limitSec, Math.round((Date.now() - s.startedAt) / 1000));

    this.repo.submitAttempt(user.id, s.answers, durationSec).subscribe({
      next: () => {
        this.sessionSvc.clear();
        this.router.navigateByUrl('/examen/resultado');
      },
      error: (e: Error) => {
        this.submitting.set(false);
        this.error.set(e.message || 'No se pudo enviar el examen.');
      },
    });
  }
}
