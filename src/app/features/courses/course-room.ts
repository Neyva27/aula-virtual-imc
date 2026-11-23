import { LevelBadge } from '../../shared/components/level-badge';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { CourseContent, Enrollment, LiveSession, VideoRecord, livePhase } from '../../core/models/course.model';
import { CourseResult, ExamAvailability, courseResult, isPendingReview } from '../../core/models/exam.model';
import { Certificate } from '../../core/models/certificate.model';
import { RecoveryState } from '../../core/models/recovery.model';
import { formatLima } from '../../core/utils/lima-time';
import { ProgressBar } from '../../shared/components/progress-bar';
import { VideoDurationPipe } from '../../shared/pipes/video-duration.pipe';
import { VideoPlayer } from '../../shared/components/video-player';
import { Icon } from '../../shared/components/icon';

/** Aula interna de un curso: módulos y videos, más el acceso al examen y al certificado de ese curso. */
@Component({
  selector: 'app-course-room',
  imports: [LevelBadge, RouterLink, DatePipe, ProgressBar, VideoDurationPipe, VideoPlayer, Icon],
  templateUrl: './course-room.html',
  styleUrl: './course-room.css',
})
export class CourseRoom {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Parámetros de la ruta. */
  readonly courseId = input.required<string>();
  readonly videoId = input<string>();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly marking = signal(false);
  readonly content = signal<CourseContent | null>(null);
  /** Sesiones en vivo del curso (20/11/2026): enlaces de Google Meet; las canceladas se muestran como «Cancelada». */
  readonly liveSessions = signal<LiveSession[]>([]);
  readonly enrollment = signal<Enrollment | null>(null);
  readonly availability = signal<ExamAvailability | null>(null);
  readonly certificate = signal<Certificate | null>(null);
  /** R6: nota final vigente del curso (la recuperación si existe, aunque sea menor) y si hay una recuperación abierta. */
  readonly result = signal<CourseResult | null>(null);
  readonly recoveryAuthorized = signal(false);
  /** Recuperación (20/11/2026): situación completa y título del examen original que se rinde. */
  readonly recovery = signal<RecoveryState | null>(null);
  readonly recoveryExamTitle = signal('');
  /**
   * Tarjeta «Recuperación disponible»: solo si el Instructor la autorizó (también rendida o vencida, como historial).
   * El botón se habilita solo con la recuperación autorizada, no anulada ni usada, dentro de la ventana (o ya iniciada:
   * se continúa con el mismo tiempo). La página del examen vuelve a validar todo.
   */
  readonly recoveryCard = computed(() => {
    const s = this.recovery();
    const r = s?.recovery;
    if (!s || !r || (s.status !== 'autorizada' && s.status !== 'rendida' && s.status !== 'no_rindio')) return null;
    const now = Date.now();
    const opens = Date.parse(r.opensAt);
    const closes = Date.parse(r.closesAt);
    const active = s.status === 'autorizada' && !r.cancelledAt && !r.attemptId;
    const started = !!r.startedAt;
    const canTake = active && (started || (now >= opens && now < closes));
    let label: string;
    let badge: string;
    let opportunity: string;
    if (s.status === 'rendida') {
      [label, badge, opportunity] = ['Recuperación rendida', 'badge--neutral', 'Utilizada: ya entregaste tu examen de recuperación.'];
    } else if (s.status === 'no_rindio' || (!started && now >= closes)) {
      [label, badge, opportunity] = ['Recuperación vencida', 'badge--danger', 'Vencida: no se inició dentro del plazo.'];
    } else if (started) {
      [label, badge, opportunity] = ['Recuperación en curso', 'badge--warning', 'En curso: continúa con el mismo tiempo y tus respuestas guardadas.'];
    } else if (now < opens) {
      [label, badge, opportunity] = ['Recuperación autorizada', 'badge--info', 'Aún no abre: podrás iniciarla desde la fecha de apertura.'];
    } else {
      [label, badge, opportunity] = ['Recuperación disponible', 'badge--success', 'Disponible: tienes una oportunidad para rendir el examen original.'];
    }
    return { recovery: r, active, canTake, started, label, badge, opportunity };
  });
  readonly pending = isPendingReview;

  readonly course = computed(() => this.content()?.course ?? null);
  readonly modules = computed(() => this.content()?.modules ?? []);
  readonly videos = computed<VideoRecord[]>(() => this.modules().flatMap((m) => m.videos));
  readonly total = computed(() => this.videos().length);
  readonly completed = computed(() => this.videos().filter((v) => this.isDone(v.id)).length);
  readonly percent = computed(() =>
    this.total() ? Math.round((this.completed() / this.total()) * 100) : 0,
  );

  readonly current = computed<VideoRecord | null>(() => {
    const list = this.videos();
    if (list.length === 0) return null;
    const id = this.videoId();
    return list.find((v) => v.id === id) ?? list.find((v) => !this.isDone(v.id)) ?? list[0];
  });
  readonly index = computed(() => this.videos().findIndex((v) => v.id === this.current()?.id));
  readonly prev = computed<VideoRecord | null>(() => (this.index() > 0 ? this.videos()[this.index() - 1] : null));
  readonly next = computed<VideoRecord | null>(() =>
    this.index() >= 0 && this.index() < this.total() - 1 ? this.videos()[this.index() + 1] : null,
  );

  /** M3: módulo del video actual, solo si el curso tiene varios módulos (con uno, el aula no cambia). */
  readonly currentModule = computed(() => {
    const list = this.modules();
    if (list.length < 2) return null;
    const i = list.findIndex((m) => m.videos.some((v) => v.id === this.current()?.id));
    return i < 0 ? null : { id: list[i].id, number: i + 1, title: list[i].title };
  });
  /** Módulos desplegados en el menú. El del video actual se despliega al llegar a él. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  readonly isDraft = computed(() => this.course()?.status === 'borrador');
  readonly approved = computed(() => this.enrollment()?.status === 'aprobado');

  constructor() {
    // Se recarga si cambia el curso de la ruta (el componente puede reutilizarse).
    effect(() => {
      const courseId = this.courseId();
      untracked(() => this.load(courseId));
    });
    effect(() => {
      const id = this.currentModule()?.id;
      if (id) untracked(() => this.expanded.set(new Set([...this.expanded(), id])));
    });
  }

  isOpen(moduleId: string): boolean {
    return this.expanded().has(moduleId);
  }

  toggle(moduleId: string): void {
    const next = new Set(this.expanded());
    if (!next.delete(moduleId)) next.add(moduleId);
    this.expanded.set(next);
  }

  doneIn(module: { videos: VideoRecord[] }): number {
    return module.videos.filter((v) => this.isDone(v.id)).length;
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
      enrollments: this.repo.listEnrollments({ userId: user.id, courseId }),
      availability: this.repo.getExamAvailability(user.id, courseId),
      certificates: this.repo.listCertificates({ userId: user.id, courseId }),
      attempts: this.repo.listAttempts({ userId: user.id, courseId }),
      recovery: this.repo.getRecoveryStatus(user.id, courseId),
    }).subscribe({
      next: (r) => {
        this.content.set(r.content);
        this.enrollment.set(r.enrollments[0] ?? null);
        this.availability.set(r.availability);
        this.certificate.set(r.certificates.find((c) => c.status === 'vigente') ?? null);
        this.result.set(courseResult(r.attempts, r.recovery.status === 'no_rindio'));
        this.recoveryAuthorized.set(r.recovery.status === 'autorizada');
        this.recovery.set(r.recovery);
        this.recoveryExamTitle.set('');
        if (r.recovery.recovery && r.recovery.status && r.recovery.status !== 'pendiente' && r.recovery.status !== 'anulada') {
          // Título del examen original que se rinde; si falla, la tarjeta dice «Examen original del curso».
          this.repo.getStudentExam(user.id, courseId).subscribe({ next: (exam) => this.recoveryExamTitle.set(exam?.title ?? ''), error: () => undefined });
        }
        this.loading.set(false);
        this.loadLiveSessions(user.id, courseId);
      },
      error: (e: Error) => {
        this.error.set(e.message || 'No se pudo cargar el curso. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }

  /** Aparte del resto: si fallan, el aula sigue funcionando (simplemente no se muestran sesiones). */
  private loadLiveSessions(userId: string, courseId: string): void {
    this.repo.getParticipantLiveSessions(userId, courseId).subscribe({
      next: (list) => {
        if (courseId === this.courseId()) this.liveSessions.set(list);
      },
      error: () => this.liveSessions.set([]),
    });
  }

  liveWhen(s: LiveSession): string {
    return formatLima(s.startsAt);
  }

  phase(s: LiveSession) {
    return livePhase(s);
  }

  phaseLabel(s: LiveSession): string {
    return { proxima: 'Programada', en_curso: 'En curso', finalizada: 'Finalizada', cancelada: 'Cancelada' }[this.phase(s)];
  }

  phaseBadge(s: LiveSession): string {
    return { proxima: 'badge--success', en_curso: 'badge--info', finalizada: 'badge--neutral', cancelada: 'badge--danger' }[this.phase(s)];
  }

  /** Próximas (y en curso) primero; luego las anteriores (finalizadas y canceladas), la más reciente arriba. */
  readonly liveGroups = computed(() => {
    const list = this.liveSessions();
    const next = list.filter((s) => ['proxima', 'en_curso'].includes(livePhase(s)) || (s.status === 'cancelada' && Date.parse(s.startsAt) > Date.now()));
    const past = list.filter((s) => !next.includes(s)).reverse();
    return [
      ...(next.length ? [{ label: 'Próximas clases', items: next }] : []),
      ...(past.length ? [{ label: 'Clases anteriores', items: past }] : []),
    ];
  });

  /** Lleva a una de las cuatro secciones del aula (sin cambiar la ruta). */
  goTo(id: string): void {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  }

  isDone(videoId: string): boolean {
    return this.enrollment()?.completedVideoIds.includes(videoId) ?? false;
  }

  /** Número del video dentro del curso (los módulos se numeran de forma continua). */
  position(video: VideoRecord): number {
    return this.videos().findIndex((v) => v.id === video.id) + 1;
  }

  videoLink(video: VideoRecord): string[] {
    return ['/cursos', this.courseId(), 'videos', video.id];
  }

  /** Progreso SIMULADO: el registro real de visualización requiere reproductor compatible y backend. */
  markDone(goNext: boolean): void {
    const user = this.auth.user();
    const video = this.current();
    const courseId = this.courseId();
    if (!user || !video || this.marking()) return;
    this.marking.set(true);
    this.actionError.set('');
    this.repo
      .markCourseVideoCompleted(user.id, courseId, video.id)
      .pipe(
        switchMap((enrollment) =>
          this.repo.getExamAvailability(user.id, courseId).pipe(map((availability) => ({ enrollment, availability }))),
        ),
      )
      .subscribe({
        next: ({ enrollment, availability }) => {
          this.enrollment.set(enrollment);
          this.availability.set(availability);
          this.marking.set(false);
          const next = this.next();
          if (goNext && next) this.router.navigate(this.videoLink(next));
        },
        error: (e: Error) => {
          this.marking.set(false);
          this.actionError.set(e.message || 'No se pudo registrar el avance.');
        },
      });
  }
}
