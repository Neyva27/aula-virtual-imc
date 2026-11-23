import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Attempt, ExamQuestion, QuestionType, isPendingReview } from '../../core/models/exam.model';
import { AttemptDurationPipe } from '../../shared/pipes/attempt-duration.pipe';

const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Selección única',
  multiple: 'Selección múltiple',
  truefalse: 'Verdadero o falso',
  open: 'Respuesta abierta',
};

/**
 * R7: detalle de una evaluación rendida para el Instructor (solo lectura): cada pregunta con la respuesta del
 * estudiante y, en las objetivas, la respuesta correcta y los puntos obtenidos guardados al rendir. Las abiertas
 * muestran su calificación o, si faltan, que están pendientes; calificarlas usa el flujo existente (`grade`).
 * No modifica respuestas ni calificaciones: las preguntas no cambian desde el envío (RN-15).
 */
@Component({
  selector: 'app-admin-attempt-detail',
  imports: [DatePipe, AttemptDurationPipe],
  template: `
    <section class="card stack detail" aria-labelledby="detail-title" data-detail>
      <div class="row between">
        <h2 id="detail-title">Detalle de la evaluación</h2>
        <button type="button" class="btn btn-ghost btn-sm" (click)="closed.emit()">Cerrar detalle</button>
      </div>
      <dl class="data">
        <div><dt>Estudiante</dt><dd>{{ studentName() }}</dd></div>
        <div><dt>Curso</dt><dd>{{ courseName() }}</dd></div>
        <div><dt>Examen</dt><dd>{{ examTitle() }} · {{ attempt().kind === 'recuperacion' ? 'Recuperación' : 'Examen regular' }}</dd></div>
        <div><dt>Fecha</dt><dd>{{ attempt().date | date: 'dd/MM/yyyy HH:mm' : '-0500' }} (hora de Lima)</dd></div>
        <div><dt>Duración</dt><dd>{{ attempt().durationSec | attemptDuration }}</dd></div>
        <div><dt>Nota</dt><dd>{{ pending() ? 'Pendiente de calificación' : attempt().score + ' / ' + attempt().scaleMax }}</dd></div>
        <div><dt>Estado</dt><dd>{{ pending() ? 'Pendiente de calificación' : attempt().passed ? 'Aprobado' : 'Desaprobado' }}</dd></div>
        @if (attempt().autoSubmitted) { <div><dt>Entrega</dt><dd>Automática al agotarse el tiempo</dd></div> }
      </dl>

      @if (!attempt().answers) {
        <p class="alert alert-info small" data-no-answers>
          Este intento es anterior al registro de respuestas: solo se conserva su nota.
        </p>
      } @else {
        @if (pendingOpen() > 0) {
          <div class="alert alert-warning row between" data-pending-summary>
            <span>{{ pendingOpen() === 1 ? 'Hay 1 pregunta abierta pendiente de calificación.' : 'Hay ' + pendingOpen() + ' preguntas abiertas pendientes de calificación.' }}</span>
            <button type="button" class="btn btn-primary btn-sm" (click)="grade.emit()">Calificar respuestas abiertas</button>
          </div>
        }
        <ol class="questions" role="list">
          @for (q of questions(); track q.id; let i = $index) {
            <li class="question stack" [attr.data-detail-question]="q.id" [attr.data-kind]="q.type === 'open' ? 'abierta' : 'objetiva'">
              <div class="row between">
                <h3>{{ i + 1 }}. {{ q.text }}</h3>
                <span class="small muted">{{ typeLabel(q.type) }} · {{ q.type === 'open' ? 'abierta' : 'objetiva' }}</span>
              </div>
              @if (q.type === 'open') {
                <p class="reply" data-answer>{{ openAnswer(q.id) || 'Sin respuesta.' }}</p>
                @if (q.rubric) { <p class="small muted"><strong>Criterio:</strong> {{ q.rubric }}</p> }
                @if (pending()) {
                  <p class="small" data-points><span class="badge badge--warning" data-pending>Pendiente de calificación</span> (máximo {{ q.points }})</p>
                } @else {
                  <p class="small" data-points>Puntos: {{ manual(q.id) }} de {{ q.points }}</p>
                }
              } @else {
                <p class="small" data-answer><strong>Respuesta del estudiante:</strong> {{ marked(q) || 'Sin respuesta.' }}</p>
                <p class="small muted" data-correct><strong>Respuesta correcta:</strong> {{ correct(q) }}</p>
                <p class="small" data-points>
                  @if (scoreOf(q.id); as s) { Puntos: {{ s }} de {{ q.points }} } @else { Puntos: no disponible (intento anterior) }
                </p>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [
    `
      .detail h2, .detail h3, .detail p { margin: 0; }
      .detail h3 { font-size: 1rem; }
      .questions { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
      .question { border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 0.75rem; }
      .reply { white-space: pre-wrap; background: var(--c-surface-2, #f5f7fb); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; }
    `,
  ],
})
export class AdminAttemptDetail {
  readonly attempt = input.required<Attempt>();
  readonly questions = input.required<ExamQuestion[]>();
  readonly studentName = input('');
  readonly courseName = input('');
  readonly examTitle = input('');
  /** Pide calificar las preguntas abiertas pendientes (el panel de calificación existente). */
  readonly grade = output<void>();
  readonly closed = output<void>();

  readonly pending = computed(() => isPendingReview(this.attempt()));
  readonly pendingOpen = computed(() => (this.pending() ? this.questions().filter((q) => q.type === 'open').length : 0));

  typeLabel(type: QuestionType): string {
    return TYPE_LABEL[type];
  }

  private optionTexts(q: ExamQuestion, ids: readonly string[]): string {
    return ids.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ');
  }

  marked(q: ExamQuestion): string {
    return this.optionTexts(q, this.attempt().answers?.[q.id] ?? []);
  }

  correct(q: ExamQuestion): string {
    return this.optionTexts(q, q.correct);
  }

  openAnswer(questionId: string): string {
    return this.attempt().answers?.[questionId]?.[0]?.trim() ? this.attempt().answers![questionId][0] : '';
  }

  /** Puntos guardados al rendir (sin recalcular); los intentos anteriores al Bloque 1 no los tienen. */
  scoreOf(questionId: string): string | null {
    const s = this.attempt().questionScores?.[questionId];
    return s === undefined ? null : String(Math.round(s * 100) / 100).replace('.', ',');
  }

  manual(questionId: string): string {
    const s = this.attempt().review?.manualScores?.[questionId];
    return s === undefined ? '—' : String(s).replace('.', ',');
  }
}
