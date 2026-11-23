import { Component, DestroyRef, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { ExamSessionService } from '../../../core/services/exam-session.service';
import {
  Exam as ExamRecord,
  OPEN_ANSWER_MAX,
  Question,
  SubmitMode,
  examKind,
  isComplete,
  requiredSelections,
  selectedCount,
} from '../../../core/models/exam.model';
import { ProgressBar } from '../../../shared/components/progress-bar';
import { Icon } from '../../../shared/components/icon';
import { trapTab } from '../../../shared/a11y/focus-trap';
import { ExamTimeWarning } from './time-warning';

/** Etapa 1: el aviso se muestra cuando quedan 5 minutos (300 s). */
export const TIME_WARNING_SEC = 300;
/** Corrección de R3: pausa antes de guardar una respuesta abierta mientras se escribe (no en cada tecla). */
const OPEN_SAVE_DELAY_MS = 600;

@Component({
  selector: 'app-exam',
  imports: [ProgressBar, RouterLink, Icon, ExamTimeWarning],
  templateUrl: './exam.html',
  styleUrl: './exam.css',
})
export class Exam implements OnInit {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sessionSvc = inject(ExamSessionService);
  private readonly destroyRef = inject(DestroyRef);

  /** Parámetro :courseId de la ruta. */
  readonly courseId = input.required<string>();

  readonly session = this.sessionSvc.session;
  private readonly exam = signal<ExamRecord | null>(null);
  /** R6: el estudiante tiene una recuperación en curso en este curso (también con la modalidad «examen original»). */
  private readonly recoveryInProgress = signal(false);
  /** R6: el examen que se rinde es de recuperación (para identificarlo en pantalla). */
  readonly isRecovery = computed(() => this.recoveryInProgress() || (!!this.exam() && examKind(this.exam()!) === 'recuperacion'));
  readonly questions = signal<Question[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly showConfirm = signal(false);
  /** El repositorio rechazó la entrega y el examen ya no se puede rendir: no se reintenta. */
  readonly rejected = signal(false);
  readonly now = signal(Date.now());
  /** El envío automático por tiempo agotado se intenta una sola vez. */
  private autoSubmitTried = false;
  /** Etapa 1: aviso no modal de que quedan 5 minutos (una sola vez por intento). */
  readonly showTimeWarning = signal(false);

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
  /** Etapa 2B (D3): una pregunta cuenta como respondida solo si está completa. */
  readonly answeredCount = computed(() => this.questions().filter((q) => this.isAnswered(q)).length);
  readonly unanswered = computed(() => this.questions().length - this.answeredCount());
  /** Números (desde 1) de las preguntas que faltan completar para la entrega voluntaria. */
  readonly pendingNumbers = computed(() => this.questions().flatMap((q, i) => (this.isAnswered(q) ? [] : [i + 1])));
  /** D3: la entrega voluntaria se bloquea si falta algo; al agotarse el tiempo se envía lo registrado (P4). */
  readonly submitBlocked = computed(() => this.pendingNumbers().length > 0 && this.remainingSec() > 0);
  /** M5: el examen tiene preguntas abiertas (quedará «Pendiente de calificación» al enviarlo). */
  readonly hasOpen = computed(() => this.questions().some((q) => q.type === 'open'));
  readonly openMax = OPEN_ANSWER_MAX;
  readonly percent = computed(() =>
    this.questions().length ? Math.round((this.answeredCount() / this.questions().length) * 100) : 0,
  );

  ngOnInit(): void {
    const user = this.auth.user();
    const s = this.session();
    const instructions = ['/cursos', this.courseId(), 'examen'];
    if (!user || !s || s.userId !== user.id) {
      this.router.navigate(instructions);
      return;
    }

    // La sesión debe pertenecer al examen que le corresponde rendir en este curso (R2: por ahora, el regular).
    // Etapa 2B, Bloque 2 (R2): el horario sale del inicio registrado en el repositorio, así que recargar o abrir
    // otra pestaña no reinicia el tiempo; con el tiempo ya agotado, la página envía lo registrado (P4).
    // Si el repositorio no puede confirmar el inicio (por ejemplo, el examen ya no está disponible), se conserva la
    // sesión del navegador y la entrega decide, como antes.
    this.repo
      .getStudentExam(user.id, this.courseId())
      .pipe(
        switchMap((exam) => {
          if (!exam || !this.sessionSvc.belongsToExam(user.id, exam)) return of(null);
          return this.repo.startExam(user.id, this.courseId()).pipe(
            map((r) => {
              // Corrección de R3: respuestas guardadas en el repositorio (otra pestaña, recarga); las que solo estaban
              // en este navegador se suben.
              const localOnly = this.sessionSvc.adopt(user.id, exam.id, Date.parse(r.startedAt), Date.parse(r.endsAt), r.answers);
              if (Object.keys(localOnly).length) this.persistAnswers(localOnly);
              return exam;
            }),
            catchError(() => of(exam)),
            switchMap((e) => this.repo.getExamQuestions(e.id).pipe(map((questions) => ({ exam: e, questions })))),
          );
        }),
      )
      .subscribe({
        next: (r) => {
          if (!r) {
            this.router.navigate(instructions);
            return;
          }
          this.exam.set(r.exam);
          this.questions.set(r.questions);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar las preguntas.');
          this.loading.set(false);
        },
      });

    // R6: solo para identificar en pantalla si es la recuperación (no cambia el inicio, el tiempo ni la entrega).
    this.repo.getRecoveryStatus(user.id, this.courseId()).subscribe({
      next: (s) => this.recoveryInProgress.set(s.status === 'autorizada'),
      error: () => undefined,
    });

    // Temporizador SIMULADO en el navegador. En producción lo controla el servidor (RN-14).
    const timer = setInterval(() => {
      this.now.set(Date.now());
      this.updateTimeWarning();
      if (this.remainingSec() === 0 && !this.autoSubmitTried && !this.submitting() && this.questions().length > 0) {
        this.autoSubmitTried = true;
        this.submit(); // P4: con el tiempo agotado se envía solo lo registrado, sin exigir completar nada
      }
    }, 1000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.flushPendingSaves();
    });
  }

  /**
   * Muestra el aviso cuando el contador cruza los 5 minutos, una sola vez por intento (queda registrado en la sesión,
   * así que tampoco se repite al recargar). No aparece si el examen terminó, se está enviando o fue rechazado, ni en
   * intentos de 5 minutos o menos (el umbral nunca se cruza). Se oculta solo al llegar a cero.
   */
  private updateTimeWarning(): void {
    const s = this.session();
    const remaining = this.remainingSec();
    if (remaining === 0) {
      this.showTimeWarning.set(false);
      return;
    }
    if (!s || s.timeWarningShown || this.loading() || this.submitting() || this.rejected() || !this.questions().length) return;
    if (remaining <= TIME_WARNING_SEC && s.endsAt - s.startedAt > TIME_WARNING_SEC * 1000) {
      this.showTimeWarning.set(true);
      this.sessionSvc.markTimeWarningShown();
    }
  }

  /** Cierra el aviso; el temporizador sigue corriendo. */
  dismissTimeWarning(): void {
    this.showTimeWarning.set(false);
  }

  isSelected(questionId: string, optionId: string): boolean {
    return this.session()?.answers[questionId]?.includes(optionId) ?? false;
  }

  choose(q: Question, optionId: string): void {
    if (q.type === 'multiple') {
      const now = this.session()?.answers[q.id] ?? [];
      if (now.includes(optionId)) {
        this.answer(q.id, now.filter((id) => id !== optionId)); // desmarcar siempre se puede
      } else if (!this.atLimit(q)) {
        this.answer(q.id, [...now, optionId]); // Etapa 2B: nunca más de la cantidad exigida
      }
    } else {
      this.answer(q.id, [optionId]);
    }
  }

  /** Respuestas que esperan a que el estudiante deje de escribir para guardarse (solo abiertas). */
  private readonly pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; values: string[] }>();

  /**
   * Corrección de R3: cada respuesta se guarda en la sesión del navegador y en el repositorio (para recargas, otras
   * pestañas y la entrega automática si se cierra el navegador). Un error al guardar no bloquea el examen: la
   * entrega vuelve a enviar todas las respuestas.
   */
  private answer(questionId: string, values: string[], delayMs = 0): void {
    this.sessionSvc.setAnswer(questionId, values);
    const waiting = this.pendingSaves.get(questionId);
    if (waiting) clearTimeout(waiting.timer);
    this.pendingSaves.delete(questionId);
    if (!delayMs) {
      this.persistAnswers({ [questionId]: values });
      return;
    }
    const timer = setTimeout(() => {
      this.pendingSaves.delete(questionId);
      this.persistAnswers({ [questionId]: values });
    }, delayMs);
    this.pendingSaves.set(questionId, { timer, values });
  }

  private persistAnswers(answers: Record<string, string[]>): void {
    const user = this.auth.user();
    if (!user) return;
    this.repo.saveExamAnswers(user.id, this.courseId(), answers).subscribe({ error: () => undefined });
  }

  /** Guarda de inmediato lo que esperaba (al salir de la página). */
  private flushPendingSaves(): void {
    const pending = Object.fromEntries([...this.pendingSaves].map(([id, p]) => (clearTimeout(p.timer), [id, p.values])));
    this.pendingSaves.clear();
    if (Object.keys(pending).length) this.persistAnswers(pending);
  }

  typeLabel(q: Question): string {
    return { single: 'Selección única', multiple: 'Selección múltiple', truefalse: 'Verdadero o falso', open: 'Respuesta abierta' }[q.type];
  }

  openText(questionId: string): string {
    return this.session()?.answers[questionId]?.[0] ?? '';
  }

  /** La respuesta abierta se guarda como `[texto]`; vacía (solo espacios) cuenta como sin responder. */
  setOpenAnswer(q: Question, text: string): void {
    const value = text.slice(0, OPEN_ANSWER_MAX);
    this.answer(q.id, value.trim() ? [value] : [], OPEN_SAVE_DELAY_MS); // al dejar de escribir
  }

  /** Etapa 2B (D3): completa (selección múltiple con exactamente la cantidad exigida; abierta con texto). */
  isAnswered(q: Question): boolean {
    return isComplete(q, this.session()?.answers[q.id]);
  }

  /** Tiene alguna respuesta, pero no está completa (selección múltiple con menos o más marcas). */
  isPartial(q: Question): boolean {
    return !this.isAnswered(q) && (this.session()?.answers[q.id]?.length ?? 0) > 0;
  }

  /** Alternativas que debe marcar (selección múltiple). */
  required(q: Question): number {
    return requiredSelections(q);
  }

  /** Alternativas marcadas (selección múltiple). */
  selected(q: Question): number {
    return selectedCount(q, this.session()?.answers[q.id]);
  }

  /** Ya marcó la cantidad exigida: las demás alternativas se desactivan hasta que desmarque alguna. */
  atLimit(q: Question): boolean {
    return q.type === 'multiple' && this.selected(q) >= this.required(q);
  }

  /** Lleva a la primera pregunta pendiente y cierra la confirmación. */
  goToPending(): void {
    const first = this.pendingNumbers()[0];
    this.showConfirm.set(false);
    if (first) this.go(first - 1);
  }

  go(i: number): void {
    if (i >= 0 && i < this.questions().length) this.sessionSvc.setIndex(i);
  }

  private readonly confirmDialog = viewChild<ElementRef<HTMLElement>>('confirmDialog');
  private readonly keepReviewing = viewChild<ElementRef<HTMLButtonElement>>('keepReviewing');
  private readonly finishButton = viewChild<ElementRef<HTMLButtonElement>>('finishButton');

  /** Abre la confirmación con el foco en «Seguir revisando», la opción que no envía nada (V5). */
  askSubmit(): void {
    this.showConfirm.set(true);
    setTimeout(() => this.keepReviewing()?.nativeElement.focus());
  }

  /** Cierra la confirmación sin enviar y devuelve el foco a «Finalizar y enviar». */
  cancelSubmit(): void {
    this.showConfirm.set(false);
    setTimeout(() => this.finishButton()?.nativeElement.focus());
  }

  /** Escape equivale a «Seguir revisando»; el tabulador no sale del diálogo. */
  dialogKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelSubmit();
      return;
    }
    const dialog = this.confirmDialog()?.nativeElement;
    if (dialog) trapTab(event, dialog);
  }

  /**
   * Etapa 2B. Antes de que se agote el tiempo solo hay entrega voluntaria, que exige todas las preguntas completas
   * (D3; el repositorio vuelve a validarlo). Con el tiempo agotado (envío automático o reenvío tras un error) se envía
   * lo registrado: como 'tiempo' si falta algo (P4) y como 'voluntaria' si está todo completo.
   */
  submit(): void {
    const s = this.session();
    const user = this.auth.user();
    const exam = this.exam();
    if (!s || !user || !exam || this.submitting() || this.rejected()) return;
    const pending = this.pendingNumbers().length > 0;
    if (pending && this.remainingSec() > 0) return; // entrega voluntaria incompleta: bloqueada
    const mode: SubmitMode = pending ? 'tiempo' : 'voluntaria';
    this.submitting.set(true);
    this.showConfirm.set(false);
    this.showTimeWarning.set(false);
    this.error.set('');

    const limitSec = Math.round((s.endsAt - s.startedAt) / 1000);
    const durationSec = Math.min(limitSec, Math.round((Date.now() - s.startedAt) / 1000));

    // Corrección de R3: primero se guardan todas las respuestas (con el tiempo agotado se califican las guardadas).
    for (const p of this.pendingSaves.values()) clearTimeout(p.timer);
    this.pendingSaves.clear();
    this.repo
      .saveExamAnswers(user.id, this.courseId(), s.answers)
      .pipe(
        catchError(() => of(null)),
        switchMap(() => this.repo.submitExamAttempt(user.id, exam.id, s.answers, durationSec, mode)),
      )
      .subscribe({
      next: () => {
        this.sessionSvc.clear();
        this.router.navigate(['/cursos', this.courseId(), 'examen', 'resultado']);
      },
      error: (e: Error) => {
        this.error.set(e.message || 'No se pudo enviar el examen.');
        this.checkRejection(user.id);
      },
    });
  }

  /**
   * Tras un rechazo se pregunta al repositorio si el examen sigue disponible. Si no lo está
   * (intento consumido, curso bloqueado…), el rechazo es definitivo: se cierra la sesión sin
   * registrar nada y no se ofrece reenviar. Si lo está, se permite reenviar a mano.
   */
  private checkRejection(userId: string): void {
    this.repo.getExamAvailability(userId, this.courseId()).subscribe({
      next: (a) => {
        if (!a.available) {
          this.rejected.set(true);
          this.sessionSvc.clear();
        }
        this.submitting.set(false);
      },
      error: () => this.submitting.set(false),
    });
  }
}
