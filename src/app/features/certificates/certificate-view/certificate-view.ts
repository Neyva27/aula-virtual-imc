import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Certificate } from '../../../core/models/certificate.model';
import { courseLevelLabel } from '../../../core/models/course.model';
import { certificateIdentity } from '../../../core/services/certificate.service';
import { TrainingHoursPipe } from '../../../shared/pipes/training-hours.pipe';

@Component({
  selector: 'app-certificate-view',
  imports: [DatePipe, TrainingHoursPipe],
  templateUrl: './certificate-view.html',
  styleUrl: './certificate-view.css',
})
export class CertificateView {
  readonly cert = input.required<Certificate>();
  readonly qr = input<string | null>(null);
  readonly identity = computed(() => certificateIdentity(this.cert()));
  readonly levelLabel = computed(() => courseLevelLabel(this.cert().courseLevel));
}
