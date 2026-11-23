import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataRepository } from '../../../core/services/data-repository';
import { Certificate } from '../../../core/models/certificate.model';
import { TrainingHoursPipe } from '../../../shared/pipes/training-hours.pipe';
import { Icon } from '../../../shared/components/icon';

type Mode = 'code' | 'dni';

@Component({
  selector: 'app-verify',
  imports: [ReactiveFormsModule, DatePipe, TrainingHoursPipe, Icon],
  templateUrl: './verify.html',
  styleUrl: './verify.css',
})
export class Verify {
  private readonly repo = inject(DataRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  /**
   * Validación pública por DNI (20/11/2026, ruta /validar-certificado): solo DNI, textos para empresas y terceros, y
   * por cada certificado solo titular, curso, código, emisión, estado y resultado. /verificar no cambia.
   */
  readonly publicDni = this.route.snapshot.data['publicDni'] === true;

  readonly mode = signal<Mode>(this.publicDni ? 'dni' : 'code');
  readonly query = this.fb.control('', Validators.required);

  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly inputError = signal('');
  readonly results = signal<Certificate[]>([]);
  readonly lastQuery = signal('');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const code = params.get('codigo');
      if (code && !this.publicDni) {
        this.mode.set('code');
        this.query.setValue(code);
        this.search();
      }
    });
  }

  setMode(mode: Mode): void {
    if (this.publicDni) return; // la validación pública es solo por DNI
    this.mode.set(mode);
    this.query.reset('');
    this.searched.set(false);
    this.inputError.set('');
  }

  search(): void {
    const q = this.query.value.trim();
    this.inputError.set('');
    if (!q) {
      this.query.markAsTouched();
      return;
    }
    if (this.mode() === 'dni' && !/^\d{8}$/.test(q)) {
      this.inputError.set(this.publicDni ? 'Ingresa un DNI peruano válido: 8 dígitos numéricos.' : 'El DNI debe tener 8 dígitos numéricos.');
      return;
    }

    this.searching.set(true);
    this.searched.set(false);
    this.lastQuery.set(q);

    const done = (list: Certificate[]) => {
      this.results.set(list);
      this.searching.set(false);
      this.searched.set(true);
    };

    if (this.mode() === 'code') {
      this.repo.findCertificateByCode(q).subscribe({
        next: (c) => done(c ? [c] : []),
        error: () => done([]),
      });
    } else {
      this.repo.findCertificatesByDni(q).subscribe({
        next: (list) => done(list),
        error: () => done([]),
      });
    }
  }
}
