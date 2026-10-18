import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { Course, Enrollment, Video } from '../../core/models/course.model';
import { ProgressBar } from '../../shared/components/progress-bar';

@Component({
  selector: 'app-course-room',
  imports: [RouterLink, ProgressBar],
  templateUrl: './course-room.html',
  styleUrl: './course-room.css',
})
export class CourseRoom implements OnInit {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Parámetro :videoId de la ruta (opcional). */
  readonly videoId = input<string>();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly marking = signal(false);
  readonly course = signal<Course | null>(null);
  readonly enrollment = signal<Enrollment | null>(null);

  readonly videos = computed<Video[]>(() =>
    (this.course()?.videos ?? []).filter((v) => v.published).sort((a, b) => a.order - b.order),
  );
  readonly total = computed(() => this.videos().length);
  readonly completed = computed(
    () => this.videos().filter((v) => this.isDone(v.id)).length,
  );
  readonly percent = computed(() =>
    this.total() ? Math.round((this.completed() / this.total()) * 100) : 0,
  );

  readonly current = computed<Video | null>(() => {
    const list = this.videos();
    if (list.length === 0) return null;
    const id = this.videoId();
    return list.find((v) => v.id === id) ?? list.find((v) => !this.isDone(v.id)) ?? list[0];
  });
  readonly index = computed(() => this.videos().findIndex((v) => v.id === this.current()?.id));
  readonly prev = computed<Video | null>(() => (this.index() > 0 ? this.videos()[this.index() - 1] : null));
  readonly next = computed<Video | null>(() =>
    this.index() >= 0 && this.index() < this.total() - 1 ? this.videos()[this.index() + 1] : null,
  );

  readonly examUnlocked = computed(() => this.total() > 0 && this.completed() >= this.total());
  readonly approved = computed(() => this.enrollment()?.status === 'aprobado');

  ngOnInit(): void {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      course: this.repo.getCourse(),
      enrollment: this.repo.getEnrollment(user.id),
    }).subscribe({
      next: ({ course, enrollment }) => {
        this.course.set(course);
        this.enrollment.set(enrollment);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el curso. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }

  isDone(videoId: string): boolean {
    return this.enrollment()?.completedVideoIds.includes(videoId) ?? false;
  }

  /** Progreso SIMULADO: el registro real de visualización requiere reproductor compatible y backend. */
  markDone(goNext: boolean): void {
    const user = this.auth.user();
    const video = this.current();
    if (!user || !video || this.marking()) return;
    this.marking.set(true);
    this.error.set('');
    this.repo.markVideoCompleted(user.id, video.id).subscribe({
      next: (enrollment) => {
        this.enrollment.set(enrollment);
        this.marking.set(false);
        const next = this.next();
        if (goNext && next) this.router.navigate(['/curso', next.id]);
      },
      error: (e: Error) => {
        this.marking.set(false);
        this.error.set(e.message || 'No se pudo registrar el avance.');
      },
    });
  }
}
