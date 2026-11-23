import { LevelBadge } from '../../shared/components/level-badge';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { ParticipantCourse } from '../../core/models/course.model';
import { StatusBadge } from '../../shared/components/status-badge';
import { ProgressBar } from '../../shared/components/progress-bar';
import { CourseCover } from '../../shared/components/course-cover';
import { Icon } from '../../shared/components/icon';

/** Tablero del alumno: sus cursos asignados (estilo Hotmart, reunión del 23/10). */
@Component({
  selector: 'app-panel',
  imports: [LevelBadge, RouterLink, StatusBadge, ProgressBar, CourseCover, Icon],
  templateUrl: './panel.html',
  styleUrl: './panel.css',
})
export class Panel {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);

  /** Parámetro ?aviso= (por ejemplo, al intentar abrir un curso no asignado). */
  readonly aviso = input<string>();

  readonly user = this.auth.user;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly courses = signal<ParticipantCourse[]>([]);

  readonly firstName = computed(() => this.user()?.fullName.split(' ')[0] ?? '');
  readonly hasPreview = computed(() => this.courses().some((p) => p.preview));

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    this.repo.getParticipantCourses(user.id).subscribe({
      next: (list) => {
        this.courses.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar tus cursos. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }

  cta(p: ParticipantCourse): string {
    if (p.completedVideos === 0) return 'Comenzar curso';
    return p.completedVideos < p.totalVideos ? 'Continuar curso' : 'Revisar curso';
  }
}
