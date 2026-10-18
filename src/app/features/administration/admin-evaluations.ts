import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { Question, QuestionOption, QuestionType } from '../../core/models/exam.model';
import { errMsg } from './admin-utils';

interface DraftOption extends QuestionOption {
  correct: boolean;
}
interface Draft {
  id: string;
  isNew: boolean;
  type: QuestionType;
  text: string;
  points: number;
  options: DraftOption[];
}

const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Selección única',
  multiple: 'Selección múltiple',
  truefalse: 'Verdadero o falso',
};

function blankOptions(): DraftOption[] {
  return LETTERS.slice(0, 4).map((id) => ({ id, text: '', correct: false }));
}

@Component({
  selector: 'app-admin-evaluations',
  imports: [ReactiveFormsModule],
  template: `
    <div class="stack">
      <header>
        <h1>Evaluaciones</h1>
        <p class="muted">Configura el tiempo, la nota mínima, los intentos y las preguntas del examen.</p>
      </header>

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else {
        <form class="card stack" [formGroup]="config" (ngSubmit)="saveConfig()" novalidate>
          <h2>Configuración del examen</h2>
          <div class="grid grid-3">
            <div class="field">
              <label for="e-time">Tiempo (minutos)</label>
              <input id="e-time" class="input" type="number" formControlName="timeMinutes" />
            </div>
            <div class="field">
              <label for="e-scale">Escala de nota</label>
              <select id="e-scale" class="input" formControlName="scaleMax">
                <option [ngValue]="100">Sobre 100</option>
                <option [ngValue]="20">Sobre 20</option>
              </select>
            </div>
            <div class="field">
              <label for="e-pass">Nota mínima aprobatoria</label>
              <input id="e-pass" class="input" type="number" formControlName="passScore" />
            </div>
            <div class="field">
              <label for="e-att">Intentos permitidos</label>
              <input id="e-att" class="input" type="number" formControlName="maxAttempts" />
            </div>
          </div>
          <div><button type="submit" class="btn btn-primary" [class.is-loading]="savingConfig()" [disabled]="savingConfig()">Guardar configuración</button></div>
          <p class="small muted">
            Valores de demostración pendientes de confirmar. Los intentos ya registrados conservan su nota.
          </p>
        </form>

        <section class="card stack">
          <div class="row between">
            <div>
              <h2>Preguntas ({{ questions().length }})</h2>
              <p class="small muted">Puntaje total: {{ totalPoints() }}. La nota se calcula como la proporción de puntaje obtenido, escalada a la nota máxima.</p>
            </div>
            <button type="button" class="btn btn-primary" (click)="openNew()">Agregar pregunta</button>
          </div>

          <div class="table-wrap">
            <table>
              <thead><tr><th>N.°</th><th>Enunciado</th><th>Tipo</th><th>Puntos</th><th>Acciones</th></tr></thead>
              <tbody>
                @for (q of questions(); track q.id; let i = $index) {
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td>{{ q.text }}</td>
                    <td>{{ typeLabel(q.type) }}</td>
                    <td>{{ q.points }}</td>
                    <td>
                      <div class="row act">
                        <button type="button" class="btn btn-ghost" (click)="openEdit(q)">Editar</button>
                        @if (confirmDeleteId() === q.id) {
                          <button type="button" class="btn btn-danger" (click)="remove(q)">Confirmar</button>
                          <button type="button" class="btn btn-ghost" (click)="confirmDeleteId.set(null)">No</button>
                        } @else {
                          <button type="button" class="btn btn-ghost" (click)="confirmDeleteId.set(q.id)">Eliminar</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="small muted">Preguntas de demostración, no oficiales. Los cambios se guardan solo en este navegador.</p>
        </section>

        @if (draft(); as d) {
          <section class="card stack" aria-labelledby="draft-title">
            <h2 id="draft-title">{{ d.isNew ? 'Nueva pregunta' : 'Editar pregunta' }}</h2>

            @if (draftError()) { <p class="alert alert-danger" role="alert">{{ draftError() }}</p> }

            <div class="grid grid-2">
              <div class="field">
                <label for="d-type">Tipo de pregunta</label>
                <select id="d-type" class="input" (change)="setType($any($event.target).value)">
                  <option value="single" [selected]="d.type === 'single'">Selección única</option>
                  <option value="multiple" [selected]="d.type === 'multiple'">Selección múltiple</option>
                  <option value="truefalse" [selected]="d.type === 'truefalse'">Verdadero o falso</option>
                </select>
              </div>
              <div class="field">
                <label for="d-points">Puntaje</label>
                <input id="d-points" class="input" type="number" min="1" [value]="d.points" (input)="setPoints($any($event.target).value)" />
              </div>
            </div>

            <div class="field">
              <label for="d-text">Enunciado</label>
              <textarea id="d-text" class="input" rows="2" [value]="d.text" (input)="setText($any($event.target).value)"></textarea>
            </div>

            <fieldset class="opts">
              <legend>Opciones (marca la respuesta correcta)</legend>
              @for (o of d.options; track o.id; let i = $index) {
                <div class="optrow">
                  <input
                    [type]="d.type === 'multiple' ? 'checkbox' : 'radio'"
                    name="correct"
                    [checked]="o.correct"
                    (change)="toggleCorrect(i)"
                    [attr.aria-label]="'Marcar opción ' + (i + 1) + ' como correcta'"
                  />
                  @if (d.type === 'truefalse') {
                    <span class="fixed">{{ o.text }}</span>
                  } @else {
                    <input
                      class="input"
                      [value]="o.text"
                      (input)="setOptionText(i, $any($event.target).value)"
                      [attr.aria-label]="'Texto de la opción ' + (i + 1)"
                    />
                    <button type="button" class="btn btn-ghost" [disabled]="d.options.length <= 2" (click)="removeOption(i)">Quitar</button>
                  }
                </div>
              }
              @if (d.type !== 'truefalse') {
                <button type="button" class="btn btn-secondary" [disabled]="d.options.length >= 5" (click)="addOption()">Agregar opción</button>
              }
            </fieldset>

            <div class="row">
              <button type="button" class="btn btn-primary" [class.is-loading]="savingQuestion()" [disabled]="savingQuestion()" (click)="saveDraft()">Guardar pregunta</button>
              <button type="button" class="btn btn-secondary" (click)="draft.set(null)">Cancelar</button>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [
    `
      .between { justify-content: space-between; align-items: flex-start; }
      .act { flex-wrap: nowrap; gap: 0.15rem; }
      .act .btn { min-height: 34px; padding: 0.25rem 0.55rem; font-size: 0.85rem; }
      .opts { border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 0.75rem; display: grid; gap: 0.6rem; }
      .opts legend { font-weight: 600; padding: 0 0.4rem; }
      .optrow { display: flex; align-items: center; gap: 0.6rem; }
      .optrow input[type='radio'], .optrow input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--c-primary); flex-shrink: 0; }
      .fixed { font-weight: 600; }
    `,
  ],
})
export class AdminEvaluations {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly savingConfig = signal(false);
  readonly savingQuestion = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly draftError = signal('');
  readonly confirmDeleteId = signal<string | null>(null);

  readonly questions = signal<Question[]>([]);
  readonly draft = signal<Draft | null>(null);
  readonly totalPoints = computed(() => this.questions().reduce((sum, q) => sum + q.points, 0));

  readonly config = this.fb.group({
    timeMinutes: [20, [Validators.required, Validators.min(1)]],
    scaleMax: [100],
    passScore: [60, [Validators.required, Validators.min(0)]],
    maxAttempts: [2, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    forkJoin({ exam: this.repo.getExamConfig(), questions: this.repo.getQuestions() }).subscribe({
      next: ({ exam, questions }) => {
        this.config.setValue({
          timeMinutes: exam.timeMinutes,
          scaleMax: exam.scaleMax,
          passScore: exam.passScore,
          maxAttempts: exam.maxAttempts,
        });
        this.questions.set(questions);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
  }

  typeLabel(type: QuestionType): string {
    return TYPE_LABEL[type];
  }

  // ----- Configuración -----
  saveConfig(): void {
    this.message.set('');
    this.error.set('');
    if (this.config.invalid) {
      this.config.markAllAsTouched();
      this.error.set('Revisa los valores de la configuración.');
      return;
    }
    this.savingConfig.set(true);
    this.repo.updateExamConfig(this.config.getRawValue()).subscribe({
      next: () => {
        this.savingConfig.set(false);
        this.message.set('Configuración guardada (demostración).');
      },
      error: (e) => {
        this.savingConfig.set(false);
        this.error.set(errMsg(e));
      },
    });
  }

  // ----- Preguntas -----
  openNew(): void {
    this.clearMessages();
    this.draft.set({ id: '', isNew: true, type: 'single', text: '', points: 10, options: blankOptions() });
  }

  openEdit(q: Question): void {
    this.clearMessages();
    this.draft.set({
      id: q.id,
      isNew: false,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options.map((o) => ({ ...o, correct: q.correct.includes(o.id) })),
    });
  }

  private patch(change: Partial<Draft>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...change });
  }

  setType(type: QuestionType): void {
    const d = this.draft();
    if (!d || d.type === type) return;
    if (type === 'truefalse') {
      this.patch({
        type,
        options: [
          { id: 'v', text: 'Verdadero', correct: false },
          { id: 'f', text: 'Falso', correct: false },
        ],
      });
    } else if (d.type === 'truefalse') {
      this.patch({ type, options: blankOptions() });
    } else {
      let seen = false;
      const options =
        type === 'single'
          ? d.options.map((o) => {
              const keep = o.correct && !seen;
              if (o.correct) seen = true;
              return { ...o, correct: keep };
            })
          : d.options;
      this.patch({ type, options });
    }
  }

  setText(text: string): void {
    this.patch({ text });
  }

  setPoints(value: string): void {
    this.patch({ points: Number(value) });
  }

  setOptionText(i: number, text: string): void {
    const d = this.draft();
    if (!d) return;
    this.patch({ options: d.options.map((o, idx) => (idx === i ? { ...o, text } : o)) });
  }

  toggleCorrect(i: number): void {
    const d = this.draft();
    if (!d) return;
    const options =
      d.type === 'multiple'
        ? d.options.map((o, idx) => (idx === i ? { ...o, correct: !o.correct } : o))
        : d.options.map((o, idx) => ({ ...o, correct: idx === i }));
    this.patch({ options });
  }

  addOption(): void {
    const d = this.draft();
    if (!d || d.options.length >= 5) return;
    const used = new Set(d.options.map((o) => o.id));
    const id = LETTERS.find((l) => !used.has(l));
    if (id) this.patch({ options: [...d.options, { id, text: '', correct: false }] });
  }

  removeOption(i: number): void {
    const d = this.draft();
    if (!d || d.options.length <= 2) return;
    this.patch({ options: d.options.filter((_, idx) => idx !== i) });
  }

  saveDraft(): void {
    const d = this.draft();
    if (!d) return;
    this.draftError.set('');
    this.savingQuestion.set(true);
    const question: Question = {
      id: d.id,
      type: d.type,
      text: d.text,
      points: d.points,
      options: d.options.map((o) => ({ id: o.id, text: o.text })),
      correct: d.options.filter((o) => o.correct).map((o) => o.id),
    };
    this.repo.saveQuestion(question).subscribe({
      next: (list) => {
        this.questions.set(list);
        this.savingQuestion.set(false);
        this.draft.set(null);
        this.message.set('Pregunta guardada (demostración).');
      },
      error: (e) => {
        this.savingQuestion.set(false);
        this.draftError.set(errMsg(e));
      },
    });
  }

  remove(q: Question): void {
    this.confirmDeleteId.set(null);
    this.clearMessages();
    this.repo.deleteQuestion(q.id).subscribe({
      next: (list) => {
        this.questions.set(list);
        this.message.set('Pregunta eliminada (demostración).');
      },
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  private clearMessages(): void {
    this.message.set('');
    this.error.set('');
    this.draftError.set('');
  }
}
