import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DEMO_SUFFIX } from '../../core/config/app-environment';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { DataRepository } from '../../core/services/data-repository';
import { DEMO_CONFIG } from '../../core/config/demo.config';
import { CourseRecord, PublicationCheck } from '../../core/models/course.model';
import {
  EXAM_LOCKED_MESSAGE,
  Exam,
  ExamQuestion,
  MAX_ATTEMPTS,
  MAX_OPTIONS,
  Question,
  QuestionOption,
  QuestionType,
  examKind,
  requiredSelections,
  scoreDistribution,
  selectionError,
} from '../../core/models/exam.model';
import { AdminCourseSelect } from './admin-course-select';
import { errMsg } from './admin-utils';
import { Icon } from '../../shared/components/icon';

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
  /** Solo preguntas abiertas (M5). */
  rubric: string;
  /** Etapa 2B (P1, P2): solo selección múltiple. Cantidad exacta de alternativas que debe marcar el alumno. */
  selectCount: number;
  /** El instructor cambió la cantidad a mano: deja de seguir a la cantidad de correctas. */
  selectTouched: boolean;
}

/** Identificadores de opción: tantos como MAX_OPTIONS (M5 amplía de 5 a 8 alternativas). */
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, MAX_OPTIONS);
const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Selección única',
  multiple: 'Selección múltiple',
  truefalse: 'Verdadero o falso',
  open: 'Respuesta abierta',
};

function blankOptions(): DraftOption[] {
  return LETTERS.slice(0, 4).map((id) => ({ id, text: '', correct: false }));
}

@Component({
  selector: 'app-admin-evaluations',
  imports: [ReactiveFormsModule, AdminCourseSelect, Icon],
  template: `
    <div class="stack">
      <header class="page-head">
        <h1>Evaluaciones</h1>
        <p class="muted">Configura el tiempo, la nota mínima y las preguntas del examen de cada curso.</p>
      </header>

      @if (courses().length) {
        <app-admin-course-select [courses]="courses()" [selected]="courseId()" (selectedChange)="selectCourse($event)" />
      }
      @if (unknownCourse()) {
        <p class="alert alert-warning small" role="status">No se encontró el curso indicado; se muestra «{{ course()?.name }}».</p>
      }

      @if (message()) { <p class="alert alert-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="alert alert-danger" role="alert">No se pudo completar la operación: {{ error() }}</p> }

      @if (loading()) {
        <p class="card muted" role="status">Cargando…</p>
      } @else if (course() && !exam()) {
        <section class="card stack" aria-labelledby="no-exam-title">
          <h2 id="no-exam-title">Sin evaluación</h2>
          <p class="alert alert-warning" role="status">
            Este curso no tiene una evaluación activa. Mientras no la tenga, los participantes no pueden rendir el examen ni
            obtener el certificado.
          </p>
          <p class="small muted demo-only">
            Se creará con la configuración de demostración ({{ defaults.timeMinutes }} minutos, sobre {{ defaults.scaleMax }},
            nota mínima {{ defaults.passScore }}, {{ maxAttempts }} intento por alumno) y sin preguntas. Luego podrás
            modificarla y agregar las preguntas.
          </p>
          <div>
            <button type="button" class="btn btn-primary" [class.is-loading]="creatingExam()" [disabled]="creatingExam()" (click)="createExam()">
              <app-icon name="plus" size="sm" /> Crear evaluación
            </button>
          </div>
        </section>
      } @else if (exam(); as ex) {
        @if (isRecovery()) {
          <!-- R5: se está viendo un examen de recuperación independiente (no el regular del curso). -->
          <section class="alert alert-info stack recovery-banner" aria-labelledby="recovery-banner-title" data-recovery-exam>
            <h2 id="recovery-banner-title">Recuperación independiente</h2>
            <p>
              Examen de recuperación creado a partir de <strong>«{{ regularExam()?.title }}»</strong>. Sus preguntas son
              propias: editarlas no cambia las del examen original.
            </p>
            <div><button type="button" class="btn btn-secondary btn-sm" (click)="selectExam(null)">Volver al examen regular</button></div>
          </section>
        }
        <section class="card stack" aria-labelledby="exam-state-title">
          <h2 id="exam-state-title">Estado de la evaluación</h2>
          <dl class="data">
            <div><dt>Evaluación</dt><dd>{{ ex.title }}</dd></div>
            <div><dt>Curso</dt><dd>{{ course()?.status === 'publicado' ? 'Publicado' : 'Borrador' }}</dd></div>
            <div><dt>Preguntas</dt><dd>{{ questions().length }}</dd></div>
            <div><dt>Puntaje total</dt><dd>{{ totalPoints() }}</dd></div>
            <div><dt>Nota máxima</dt><dd>{{ ex.scaleMax }}</dd></div>
          </dl>
          <p class="alert small" [class]="examStateTone()" role="status">{{ examState() }}</p>
          @if (distribution(); as dist) {
            <!-- Etapa 2A: la suma de los puntajes debe ser exactamente la nota máxima. -->
            <p class="alert small score-check" id="score-check" role="status" [class.alert-success]="dist.valid" [class.alert-warning]="!dist.valid">
              <strong>{{ dist.message }}</strong> {{ scoreAdvice() }}
            </p>
          }
          @if (locked()) {
            <div class="alert alert-warning locked" id="exam-locked" role="status">
              <p><strong>Edición bloqueada.</strong> {{ lockedMessage }}</p>
              <p class="small">
                {{ attemptCount() === 1 ? 'Hay 1 intento registrado' : 'Hay ' + attemptCount() + ' intentos registrados' }}
                en esta evaluación. Puedes consultar la configuración y las preguntas, pero no cambiarlas.
              </p>
            </div>
          }
        </section>

        @if (isRecovery()) {
          <!-- R5: configuración heredada del examen original; no se puede modificar. -->
          <section class="card stack" aria-labelledby="inherited-title" data-inherited>
            <h2 id="inherited-title">Configuración heredada del examen original</h2>
            <dl class="data">
              <div><dt>Examen original</dt><dd>{{ regularExam()?.title }}</dd></div>
              <div><dt>Curso</dt><dd>{{ course()?.name }}</dd></div>
              <div><dt>Tiempo (minutos)</dt><dd>{{ ex.timeMinutes }}</dd></div>
              <div><dt>Escala de nota</dt><dd>Sobre {{ ex.scaleMax }}</dd></div>
              <div><dt>Nota mínima aprobatoria</dt><dd>{{ ex.passScore }}</dd></div>
              <div><dt>Intentos permitidos</dt><dd>{{ maxAttempts }}</dd></div>
              <div><dt>Calificación</dt><dd>Proporcional en selección múltiple (la misma del examen original)</dd></div>
            </dl>
            <p class="small muted">
              Estos datos se heredan del examen original y no se pueden modificar en la recuperación. Solo puedes elegir y
              editar sus preguntas; sus puntajes deben sumar exactamente {{ ex.scaleMax }}.
            </p>
          </section>
        } @else {
        <form
          class="card stack"
          [formGroup]="config"
          (ngSubmit)="saveConfig()"
          novalidate
          [attr.aria-describedby]="locked() ? 'exam-locked' : null"
        >
          <h2>Configuración del examen</h2>
          <div class="grid grid-3">
            <div class="field">
              <label for="e-time">Tiempo (minutos)</label>
              <input id="e-time" class="input" type="number" formControlName="timeMinutes" />
            </div>
            <div class="field">
              <label for="e-scale">Escala de nota</label>
              <select id="e-scale" class="input" formControlName="scaleMax" aria-describedby="e-scale-help">
                <option [ngValue]="100">Sobre 100</option>
                <option [ngValue]="20">Sobre 20</option>
              </select>
              <span id="e-scale-help" class="small muted">
                Con esta escala, los puntajes deben sumar {{ config.controls.scaleMax.value }} (hoy suman {{ totalPoints() }}).
              </span>
            </div>
            <div class="field">
              <label for="e-pass">Nota mínima aprobatoria</label>
              <input id="e-pass" class="input" type="number" formControlName="passScore" />
            </div>
            <div class="field">
              <span class="label" id="e-att-label">Intentos permitidos</span>
              <p class="fixed-value" id="e-att" aria-labelledby="e-att-label" aria-describedby="e-att-help">{{ maxAttempts }}</p>
              <span id="e-att-help" class="small muted">Regla de negocio: un solo intento por alumno en cada examen. No es configurable.</span>
            </div>
            @if (apiMode) {
              <div class="field">
                <label for="e-from">Disponible desde (opcional)</label>
                <input id="e-from" class="input" type="datetime-local" formControlName="availableFrom" aria-describedby="e-from-help" />
                <span id="e-from-help" class="small muted">Antes de esta fecha el estudiante no puede rendir. Vacío: sin restricción.</span>
              </div>
            }
          </div>
          @if (locked()) {
            <p class="small muted">Configuración de solo lectura: la evaluación tiene intentos registrados.</p>
          } @else {
            <div><button type="submit" class="btn btn-primary" [class.is-loading]="savingConfig()" [disabled]="savingConfig()">Guardar configuración</button></div>
          }
          <p class="small muted demo-only">
            Valores de demostración pendientes de confirmar. Los intentos y certificados ya registrados conservan su nota y
            su escala. Tiempo de 1 a 240 minutos; escala 20 o 100; nota mínima entre 0 y la escala. Un solo intento por alumno.
          </p>
        </form>
        }

        <!-- 20/11/2026: las recuperaciones usan solo el examen original; ya no se crean exámenes independientes. -->

        <section class="card stack">
          <div class="row between">
            <div>
              <h2>Preguntas ({{ questions().length }})</h2>
              <p class="small muted">
                Puntaje total: {{ totalPoints() }} de {{ exam()?.scaleMax }}. Los puntajes de las preguntas deben sumar exactamente la nota máxima.
              </p>
            </div>
            @if (!locked()) {
              <button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" size="sm" /> Agregar pregunta</button>
            }
          </div>

          @if (questions().length === 0) {
            <p class="muted">Esta evaluación aún no tiene preguntas. Sin preguntas, el curso no puede publicarse.</p>
          } @else {
          <div class="table-wrap table-cards">
            <table>
              <caption class="sr-only">Preguntas de la evaluación de {{ course()?.name }}</caption>
              <thead>
                <tr>
                  <th scope="col">N.°</th><th scope="col">Enunciado</th><th scope="col">Tipo</th><th scope="col">Puntos</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (q of questions(); track q.id; let i = $index) {
                  <tr [attr.data-question]="q.id">
                    <td data-label="N.°">{{ i + 1 }}</td>
                    <td data-label="Enunciado">{{ q.text }}</td>
                    <td data-label="Tipo">
                      {{ typeLabel(q.type) }}
                      @if (q.type === 'multiple') { <span class="small muted">(elegir {{ required(q) }})</span> }
                    </td>
                    <td data-label="Puntos">{{ q.points }}</td>
                    <td class="actions">
                      @if (locked()) {
                        <span class="small muted">Solo lectura</span>
                      } @else {
                      <div class="row act">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(q)" [attr.aria-label]="'Editar pregunta ' + (i + 1)">Editar</button>
                        @if (confirmDeleteId() === q.id) {
                          <button type="button" class="btn btn-danger btn-sm" (click)="remove(q)">Confirmar</button>
                          <button type="button" class="btn btn-ghost btn-sm" (click)="confirmDeleteId.set(null)">No</button>
                        } @else {
                          <button type="button" class="btn btn-ghost btn-sm is-danger" (click)="confirmDeleteId.set(q.id)" [attr.aria-label]="'Eliminar pregunta ' + (i + 1)">Eliminar</button>
                        }
                      </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          }
          <p class="small muted">
            Las preguntas las registra el instructor; las de la demostración no son oficiales. Los cambios se guardan
            solo en este navegador.
          </p>
        </section>

        @if (draft(); as d) {
          @if (!locked()) {
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
                  <option value="open" [selected]="d.type === 'open'">Respuesta abierta</option>
                </select>
              </div>
              <div class="field">
                <label for="d-points">{{ d.type === 'open' ? 'Puntaje máximo' : 'Puntaje' }}</label>
                <input id="d-points" class="input" type="number" min="1" [value]="d.points" (input)="setPoints($any($event.target).value)" aria-describedby="d-points-total" />
                <span id="d-points-total" class="small muted">Con esta pregunta, el total será {{ draftTotal() }} de {{ exam()?.scaleMax }}.</span>
              </div>
            </div>

            <div class="field">
              <label for="d-text">Enunciado</label>
              <textarea id="d-text" class="input" rows="2" [value]="d.text" (input)="setText($any($event.target).value)"></textarea>
            </div>

            @if (d.type === 'open') {
              <!-- M5: excepción autorizada a RN-12: sin opciones ni respuesta correcta. -->
              <div class="field">
                <label for="d-rubric">Criterio de calificación (opcional)</label>
                <textarea id="d-rubric" class="input" rows="3" maxlength="1000" [value]="d.rubric"
                  (input)="setRubric($any($event.target).value)" aria-describedby="d-rubric-help"></textarea>
                <span id="d-rubric-help" class="small muted">
                  Guía para quien califica; el alumno no la ve. El alumno responde con un texto libre y esta pregunta no se
                  califica automáticamente: el instructor la califica en Evaluaciones rendidas. Mientras tanto, el
                  intento queda «En revisión», sin aprobado ni desaprobado ni certificado.
                </span>
              </div>
            } @else {
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
                <button type="button" class="btn btn-secondary" [disabled]="d.options.length >= maxOptions" (click)="addOption()">Agregar opción</button>
              }
            </fieldset>
            @if (d.type === 'multiple') {
              <!-- Etapa 2B (P1, P2): cantidad exacta que debe marcar el alumno; calificación proporcional. -->
              <div class="field">
                <label for="d-select">Alternativas que debe seleccionar el alumno</label>
                <input id="d-select" class="input select-count" type="number" min="1" [attr.max]="d.options.length - 1"
                  [value]="d.selectCount" (input)="setSelectCount($any($event.target).value)"
                  aria-describedby="d-select-help" [attr.aria-invalid]="selectionHint() ? 'true' : null" />
                <span id="d-select-help" class="small muted">
                  Debe estar entre la cantidad de respuestas correctas y el total de alternativas menos una. Se completa sola
                  al marcar las correctas; puedes cambiarla. Cada respuesta correcta marcada vale {{ pointsPerHit() }}
                  {{ pointsPerHit() === 1 ? 'punto' : 'puntos' }}; las incorrectas no restan, pero ocupan espacios de selección.
                </span>
                @if (selectionHint()) { <span class="small select-error" role="status">{{ selectionHint() }}</span> }
              </div>
            }
            }

            <div class="row">
              <button type="button" class="btn btn-primary" [class.is-loading]="savingQuestion()" [disabled]="savingQuestion()" (click)="saveDraft()">Guardar pregunta</button>
              <button type="button" class="btn btn-secondary" (click)="draft.set(null)">Cancelar</button>
            </div>
          </section>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .between { align-items: flex-start; }
      .act { flex-wrap: nowrap; gap: 0.15rem; }
      .opts { border: 1px solid var(--c-border); border-radius: var(--radius-sm); padding: 0.75rem; display: grid; gap: 0.6rem; }
      .opts legend { font-weight: 600; padding: 0 0.4rem; }
      .optrow { display: flex; align-items: center; gap: 0.6rem; }
      .optrow input[type='radio'], .optrow input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--c-primary); flex-shrink: 0; }
      .fixed { font-weight: 600; }
      .label { font-weight: 600; font-size: 0.95rem; }
      .fixed-value { margin: 0; padding: 0.6rem 0; font-weight: 700; }
      .locked { display: grid; gap: 0.35rem; }
      .input:disabled { background: #eef1f6; color: var(--c-muted); cursor: not-allowed; }
      .locked p { margin: 0; }
      .pick { display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer; }
      .pick input { width: 18px; height: 18px; margin-top: 0.15rem; accent-color: var(--c-primary); flex-shrink: 0; }
      .recovery-banner h2 { margin: 0; font-size: 1.05rem; }
      .recovery-banner p { margin: 0; }
      .select-count { max-width: 8rem; }
      .select-error { color: var(--c-danger); font-weight: 600; }
      @media (max-width: 700px) { .optrow { flex-wrap: wrap; } }
    `,
  ],
})
export class AdminEvaluations {
  private readonly repo = inject(DataRepository);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  /** Parámetro ?curso= (curso seleccionado). */
  readonly curso = input<string>();

  /** Configuración con la que se crea una evaluación nueva (la misma que al crear un curso). */
  readonly defaults = DEMO_CONFIG.exam;
  /** Un solo intento por alumno y examen (regla de negocio, no configurable). */
  readonly maxAttempts = MAX_ATTEMPTS;
  /** RN-15: mismo texto con el que el repositorio rechaza los cambios. */
  readonly lockedMessage = EXAM_LOCKED_MESSAGE;
  readonly maxOptions = MAX_OPTIONS;

  readonly loading = signal(true);
  readonly creatingExam = signal(false);
  readonly savingConfig = signal(false);
  readonly savingQuestion = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly draftError = signal('');
  readonly confirmDeleteId = signal<string | null>(null);

  readonly courses = signal<CourseRecord[]>([]);
  /**
   * Datos del curso cargado: su examen activo (o null), sus preguntas, sus requisitos de publicación y
   * el número de intentos registrados en ese examen (RN-15).
   */
  private readonly loaded = signal<{
    courseId: string;
    exam: Exam | null;
    questions: ExamQuestion[];
    check: PublicationCheck;
    attemptCount: number;
    /** R5: examen regular del curso, sus preguntas y sus exámenes de recuperación independientes. */
    regular: Exam | null;
    regularQuestions: ExamQuestion[];
    recoveryExams: { exam: Exam; count: number; total: number }[];
  } | null>(null);
  readonly draft = signal<Draft | null>(null);

  /** R5: parámetro ?examen= (examen de recuperación independiente que se está viendo). */
  readonly examen = input<string>();
  readonly isRecovery = computed(() => !!this.exam() && examKind(this.exam()!) === 'recuperacion');
  readonly regularExam = computed(() => this.current()?.regular ?? null);

  /** Curso pedido en la URL; si no existe, el curso principal o el primero. */
  readonly courseId = computed(() => {
    const list = this.courses();
    const wanted = this.curso();
    return (
      list.find((c) => c.id === wanted)?.id ??
      list.find((c) => c.id === DEMO_CONFIG.legacyCourseId)?.id ??
      list[0]?.id ??
      null
    );
  });
  readonly unknownCourse = computed(() => !!this.curso() && this.courses().length > 0 && this.curso() !== this.courseId());
  readonly course = computed(() => this.courses().find((c) => c.id === this.courseId()) ?? null);
  private readonly current = computed(() => {
    const data = this.loaded();
    return data && data.courseId === this.courseId() ? data : null;
  });
  readonly exam = computed(() => this.current()?.exam ?? null);
  readonly questions = computed<Question[]>(() => this.current()?.questions ?? []);
  /** Etapa 2A: total, nota máxima y diferencia (misma regla que aplica el repositorio). */
  readonly distribution = computed(() => {
    const exam = this.exam();
    return exam ? scoreDistribution(this.questions(), exam.scaleMax) : null;
  });
  readonly totalPoints = computed(() => this.distribution()?.total ?? 0);
  /** Total que quedaría al guardar la pregunta que se está editando. */
  readonly draftTotal = computed(() => {
    const d = this.draft();
    if (!d) return this.totalPoints();
    const others = this.questions().filter((q) => d.isNew || q.id !== d.id);
    return scoreDistribution([...others, { points: Number(d.points) || 0 }], this.exam()?.scaleMax ?? 0).total;
  });
  /** Qué se puede hacer según la suma, el estado del curso y RN-15. */
  readonly scoreAdvice = computed(() => {
    const dist = this.distribution();
    if (!dist) return '';
    if (dist.valid) return this.locked() ? '' : 'Puedes guardar la evaluación.';
    if (this.locked()) return 'La evaluación tiene intentos registrados y se conserva sin cambios (RN-15).';
    if (this.isRecovery()) {
      return 'No se podrá autorizar una recuperación con este examen hasta que la suma sea exacta. Si ya está asignado, solo se aceptan cambios que la mantengan.';
    }
    if (this.course()?.status === 'publicado') {
      return 'Los participantes no pueden rendirla hasta corregirla. Con el curso publicado solo se aceptan cambios que dejen la suma exacta; para reorganizar los puntajes, pasa el curso a borrador.';
    }
    return 'Puedes seguir editando, pero la evaluación no podrá publicarse ni rendirse hasta que la suma sea exacta.';
  });
  readonly attemptCount = computed(() => this.current()?.attemptCount ?? 0);
  /** RN-15: con intentos registrados, la evaluación es de solo lectura (el repositorio también lo impide). */
  readonly locked = computed(() => !!this.exam() && this.attemptCount() > 0);

  /** Situación de la evaluación para los participantes (según los requisitos del repositorio). */
  readonly examState = computed(() => {
    const data = this.current();
    if (!data?.exam) return '';
    if (this.isRecovery()) {
      return 'Examen de recuperación independiente: solo lo rinden los estudiantes a los que se autorice una recuperación con la modalidad «examen independiente». No reemplaza al examen regular del curso.';
    }
    if (data.questions.length === 0) return 'Sin preguntas: los participantes no pueden rendir esta evaluación.';
    if (this.course()?.status !== 'publicado') {
      return 'Evaluación con preguntas. El curso está en borrador: los participantes podrán rendirla cuando el curso se publique.';
    }
    if (!data.check.canPublish) return `El curso no cumple los requisitos: ${data.check.blocking.join(' ')}`;
    return 'Evaluación habilitada: los participantes que completen los videos pueden rendirla.';
  });
  readonly examStateTone = computed(() => {
    const data = this.current();
    if (!data?.exam || data.questions.length === 0) return 'alert-warning';
    return this.course()?.status === 'publicado' && data.check.canPublish ? 'alert-success' : 'alert-info';
  });

  readonly config = this.fb.group({
    timeMinutes: [20, [Validators.required, Validators.min(1)]],
    scaleMax: [100],
    passScore: [60, [Validators.required, Validators.min(0)]],
    // Fijo: no se muestra como campo editable (un solo intento por alumno).
    maxAttempts: [MAX_ATTEMPTS],
    /** Modo API (18/11/2026): fecha y hora locales `AAAA-MM-DDTHH:mm`; vacío = sin restricción. */
    availableFrom: [''],
  });

  /** La fecha de disponibilidad solo existe en el servidor (modo API). */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));

  private static toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  constructor() {
    this.repo.getCourses().subscribe({
      next: (list) => this.courses.set(list),
      error: (e) => {
        this.error.set(errMsg(e));
        this.loading.set(false);
      },
    });
    effect(() => {
      const id = this.courseId();
      const examId = this.examen();
      if (id) untracked(() => this.load(id, examId));
    });
  }

  // ----- Exámenes de recuperación históricos (R5; ya no se crean desde el 20/11/2026) -----
  /** Abre el examen regular (null) o uno de recuperación histórico del curso (solo por ?examen=). */
  selectExam(examId: string | null): void {
    this.draft.set(null);
    this.confirmDeleteId.set(null);
    this.clearMessages();
    this.router.navigate([], { queryParams: { examen: examId }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /**
   * Carga el examen regular activo del curso o, con `?examen=` (R5), uno de sus exámenes de recuperación
   * independientes; si el examen pedido no existe, el regular. El editor de preguntas es el mismo para ambos.
   */
  private load(courseId: string, examId?: string): void {
    this.loading.set(true);
    forkJoin({ regular: this.repo.getActiveExam(courseId), all: this.repo.getExams(courseId) })
      .pipe(
        switchMap(({ regular, all }) => {
          const recoveries = all.filter((e) => examKind(e) === 'recuperacion' && !!regular && e.parentExamId === regular.id);
          const exam = (examId ? recoveries.find((e) => e.id === examId) : undefined) ?? regular;
          return forkJoin({
            questions: exam ? this.repo.getExamQuestions(exam.id) : of<ExamQuestion[]>([]),
            check: this.repo.getPublicationCheck(courseId),
            attempts: exam ? this.repo.listAttempts({ examId: exam.id }) : of([]),
            regularQuestions: regular ? this.repo.getExamQuestions(regular.id) : of<ExamQuestion[]>([]),
            recoveryQuestions: recoveries.length ? forkJoin(recoveries.map((r) => this.repo.getExamQuestions(r.id))) : of<ExamQuestion[][]>([]),
          }).pipe(
            map((r) => ({
              courseId,
              exam,
              questions: r.questions,
              check: r.check,
              attemptCount: r.attempts.length,
              regular,
              regularQuestions: r.regularQuestions,
              recoveryExams: recoveries.map((e, i) => ({
                exam: e,
                count: r.recoveryQuestions[i].length,
                total: scoreDistribution(r.recoveryQuestions[i], e.scaleMax).total,
              })),
            })),
          );
        }),
      )
      .subscribe({
        next: (data) => {
          if (data.courseId !== this.courseId()) return; // respuesta de un curso anterior
          this.loaded.set(data);
          if (data.exam) {
            const { timeMinutes, scaleMax, passScore, availableFrom } = data.exam;
            this.config.reset({ timeMinutes, scaleMax, passScore, maxAttempts: MAX_ATTEMPTS, availableFrom: AdminEvaluations.toLocalInput(availableFrom) });
          }
          // R5: la configuración de un examen de recuperación es heredada (solo lectura).
          if (data.attemptCount > 0 || (data.exam && examKind(data.exam) === 'recuperacion')) {
            this.config.disable();
            this.draft.set(null);
            this.confirmDeleteId.set(null);
          } else {
            this.config.enable();
          }
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errMsg(e));
          this.loading.set(false);
        },
      });
  }

  /** Tras guardar o eliminar preguntas se recargan los requisitos de publicación del curso. */
  private reloadCheck(courseId: string, questions: ExamQuestion[]): void {
    this.repo.getPublicationCheck(courseId).subscribe((check) => {
      const data = this.loaded();
      if (data && data.courseId === courseId) this.loaded.set({ ...data, questions, check });
    });
  }

  selectCourse(courseId: string): void {
    this.draft.set(null);
    this.confirmDeleteId.set(null);
    this.clearMessages();
    // R5: al cambiar de curso se vuelve a su examen regular.
    this.router.navigate([], { queryParams: { curso: courseId, examen: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  typeLabel(type: QuestionType): string {
    return TYPE_LABEL[type];
  }

  /** Solo se ofrece cuando el curso no tiene evaluación activa; el repositorio evita duplicarla. */
  createExam(): void {
    const courseId = this.courseId();
    if (!courseId) return;
    this.clearMessages();
    this.creatingExam.set(true);
    this.repo.createCourseExam(courseId).subscribe({
      next: () => {
        this.creatingExam.set(false);
        this.message.set('Evaluación creada' + DEMO_SUFFIX + '. Agrega sus preguntas.');
        this.load(courseId);
      },
      error: (e) => {
        this.creatingExam.set(false);
        this.error.set(errMsg(e));
        this.load(courseId);
      },
    });
  }

  // ----- Configuración -----
  saveConfig(): void {
    const exam = this.exam();
    this.clearMessages();
    if (!exam) return;
    if (this.config.invalid) {
      this.config.markAllAsTouched();
      this.error.set('Revisa los valores de la configuración.');
      return;
    }
    this.savingConfig.set(true);
    const { availableFrom, ...rest } = this.config.getRawValue();
    const config = this.apiMode ? { ...rest, availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null } : rest;
    this.repo.updateExamConfigById(exam.id, config).subscribe({
      next: (saved) => {
        this.savingConfig.set(false);
        const data = this.loaded();
        if (data && data.exam?.id === saved.id) this.loaded.set({ ...data, exam: saved });
        this.message.set('Configuración guardada' + DEMO_SUFFIX + '.');
      },
      error: (e) => {
        this.savingConfig.set(false);
        this.error.set(errMsg(e));
        this.reloadIfLocked(e);
      },
    });
  }

  /**
   * Si el repositorio rechaza por RN-15 (por ejemplo, alguien rindió mientras la pantalla estaba abierta),
   * se recarga el curso para mostrar la evaluación como bloqueada.
   */
  private reloadIfLocked(e: unknown): void {
    const courseId = this.courseId();
    if (courseId && errMsg(e) === EXAM_LOCKED_MESSAGE) this.load(courseId);
  }

  // ----- Preguntas -----
  openNew(): void {
    if (this.locked()) return;
    this.clearMessages();
    this.draft.set({
      id: '',
      isNew: true,
      type: 'single',
      text: '',
      points: 10,
      options: blankOptions(),
      rubric: '',
      selectCount: 0,
      selectTouched: false,
    });
  }

  openEdit(q: Question): void {
    if (this.locked()) return;
    this.clearMessages();
    this.draft.set({
      id: q.id,
      isNew: false,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options.map((o) => ({ ...o, correct: q.correct.includes(o.id) })),
      rubric: q.rubric ?? '',
      // Preguntas anteriores a la 2B: sin cantidad guardada, vale la cantidad de correctas (y la sigue).
      selectCount: requiredSelections(q),
      selectTouched: q.type === 'multiple' && requiredSelections(q) !== q.correct.length,
    });
  }

  /** P2: mientras el instructor no la cambie a mano, la cantidad exigida sigue a la cantidad de correctas marcadas. */
  private patch(change: Partial<Draft>): void {
    const d = this.draft();
    if (!d) return;
    const next = { ...d, ...change };
    if (!next.selectTouched) next.selectCount = next.options.filter((o) => o.correct).length;
    this.draft.set(next);
  }

  setSelectCount(value: string): void {
    this.patch({ selectCount: Number(value), selectTouched: true });
  }

  /** P1 en vivo (el repositorio vuelve a validarlo al guardar). */
  readonly selectionHint = computed(() => {
    const d = this.draft();
    if (!d || d.type !== 'multiple') return '';
    return selectionError({
      type: d.type,
      options: d.options,
      correct: d.options.filter((o) => o.correct).map((o) => o.id),
      selectCount: d.selectCount,
    });
  });

  /** Puntos por cada respuesta correcta marcada (ayuda para el instructor). */
  readonly pointsPerHit = computed(() => {
    const d = this.draft();
    const correct = d?.options.filter((o) => o.correct).length ?? 0;
    return d && correct ? Math.round((d.points / correct) * 100) / 100 : 0;
  });

  required(q: Question): number {
    return requiredSelections(q);
  }

  setType(type: QuestionType): void {
    const d = this.draft();
    if (!d || d.type === type) return;
    if (type === 'open') {
      this.patch({ type, options: [] });
    } else if (d.type === 'open') {
      this.patch({
        type,
        options:
          type === 'truefalse'
            ? [
                { id: 'v', text: 'Verdadero', correct: false },
                { id: 'f', text: 'Falso', correct: false },
              ]
            : blankOptions(),
      });
    } else if (type === 'truefalse') {
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

  setRubric(rubric: string): void {
    this.patch({ rubric });
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
    if (!d || d.options.length >= MAX_OPTIONS) return;
    const used = new Set(d.options.map((o) => o.id));
    const id = LETTERS.find((l) => !used.has(l));
    if (id) this.patch({ options: [...d.options, { id, text: '', correct: false }] });
  }

  removeOption(i: number): void {
    const d = this.draft();
    if (!d || d.options.length <= 2) return;
    this.patch({ options: d.options.filter((_, idx) => idx !== i) });
  }

  /** Las validaciones (RN-12: respuesta correcta y puntaje) las hace el repositorio. */
  saveDraft(): void {
    const d = this.draft();
    const exam = this.exam();
    const courseId = this.courseId();
    if (!d || !exam || !courseId) return;
    this.draftError.set('');
    this.savingQuestion.set(true);
    const question: Question = {
      id: d.id,
      type: d.type,
      text: d.text,
      points: d.points,
      options: d.options.map((o) => ({ id: o.id, text: o.text })),
      correct: d.options.filter((o) => o.correct).map((o) => o.id),
      ...(d.type === 'open' && d.rubric.trim() ? { rubric: d.rubric } : {}),
      ...(d.type === 'multiple' ? { selectCount: d.selectCount } : {}),
    };
    this.repo.saveExamQuestion(exam.id, question).subscribe({
      next: (list) => {
        this.savingQuestion.set(false);
        this.draft.set(null);
        this.reloadCheck(courseId, list);
        this.message.set('Pregunta guardada' + DEMO_SUFFIX + '.');
      },
      error: (e) => {
        this.savingQuestion.set(false);
        if (errMsg(e) === EXAM_LOCKED_MESSAGE) {
          this.error.set(errMsg(e));
          this.reloadIfLocked(e);
        } else {
          this.draftError.set(errMsg(e));
        }
      },
    });
  }

  remove(q: Question): void {
    const exam = this.exam();
    const courseId = this.courseId();
    this.confirmDeleteId.set(null);
    this.clearMessages();
    if (!exam || !courseId) return;
    this.repo.deleteExamQuestion(exam.id, q.id).subscribe({
      next: (list) => {
        this.reloadCheck(courseId, list);
        this.message.set('Pregunta eliminada' + DEMO_SUFFIX + '.');
      },
      error: (e) => {
        this.error.set(errMsg(e));
        this.reloadIfLocked(e);
      },
    });
  }

  private clearMessages(): void {
    this.message.set('');
    this.error.set('');
    this.draftError.set('');
  }
}
