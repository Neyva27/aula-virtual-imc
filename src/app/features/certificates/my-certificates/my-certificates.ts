import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DataRepository } from '../../../core/services/data-repository';
import { CertificateService } from '../../../core/services/certificate.service';
import { Certificate } from '../../../core/models/certificate.model';
import { ParticipantCourse } from '../../../core/models/course.model';
import { ExamAvailability } from '../../../core/models/exam.model';
import { TrainingHoursPipe } from '../../../shared/pipes/training-hours.pipe';
import { Icon } from '../../../shared/components/icon';

/** Curso asignado que aún no tiene certificado, con su disponibilidad de examen. */
interface CourseWithoutCertificate {
  course: ParticipantCourse;
  availability: ExamAvailability;
}

@Component({
  selector: 'app-my-certificates',
  imports: [RouterLink, DatePipe, TrainingHoursPipe, Icon],
  templateUrl: './my-certificates.html',
  styleUrl: './my-certificates.css',
})
export class MyCertificates {
  private readonly repo = inject(DataRepository);
  private readonly auth = inject(AuthService);
  private readonly certService = inject(CertificateService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly downloadError = signal('');
  readonly downloadingId = signal<string | null>(null);

  readonly certificates = signal<Certificate[]>([]);
  readonly withoutCertificate = signal<CourseWithoutCertificate[]>([]);

  /** Aprobó, pero el certificado aún no se emite. */
  readonly pending = computed(() =>
    this.withoutCertificate().filter((c) => c.course.enrollment.status === 'aprobado'),
  );
  readonly inProgress = computed(() =>
    this.withoutCertificate().filter((c) => c.course.enrollment.status !== 'aprobado'),
  );

  constructor() {
    const user = this.auth.user();
    if (!user) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      certificates: this.repo.listCertificates({ userId: user.id }),
      courses: this.repo.getParticipantCourses(user.id),
    })
      .pipe(
        switchMap(({ certificates, courses }) => {
          const certified = new Set(certificates.filter((c) => c.status === 'vigente').map((c) => c.courseId));
          const rest = courses.filter((p) => !certified.has(p.course.id));
          const availability = rest.length
            ? forkJoin(rest.map((p) => this.repo.getExamAvailability(user.id, p.course.id)))
            : of<ExamAvailability[]>([]);
          return availability.pipe(
            map((list) => ({ certificates, withoutCertificate: rest.map((course, i) => ({ course, availability: list[i] })) })),
          );
        }),
      )
      .subscribe({
        next: (r) => {
          this.certificates.set(r.certificates);
          this.withoutCertificate.set(r.withoutCertificate);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar tus certificados. Intenta nuevamente.');
          this.loading.set(false);
        },
      });
  }

  async download(cert: Certificate): Promise<void> {
    this.downloadError.set('');
    this.downloadingId.set(cert.id);
    try {
      await this.certService.downloadPdf(cert);
    } catch {
      this.downloadError.set('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      this.downloadingId.set(null);
    }
  }
}
