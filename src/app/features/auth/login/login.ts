import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { DEMO_ACCOUNTS } from '../../../core/data/seed';
import { DEMO_CONFIG } from '../../../core/config/demo.config';
import { DataRepository } from '../../../core/services/data-repository';
import { Icon } from '../../../shared/components/icon';

/** Avisos que llegan con `?aviso=` (modo API). */
const LOGIN_NOTICES: Record<string, string> = {
  'sesion-expirada': 'Tu sesión expiró o se cerró. Inicia sesión nuevamente.',
  'clave-actualizada': 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
  'cuenta-activada': 'Tu cuenta está activada. Inicia sesión con tu correo y la contraseña que creaste.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly repo = inject(DataRepository);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly resetDone = signal(false);
  /** V5: «Restablecer datos de demostración» pide confirmación antes de ejecutarse. */
  readonly confirmingReset = signal(false);
  private readonly resetTrigger = viewChild<ElementRef<HTMLButtonElement>>('resetTrigger');
  private readonly cancelResetButton = viewChild<ElementRef<HTMLButtonElement>>('cancelResetButton');

  readonly demoAccounts = DEMO_ACCOUNTS;
  readonly demoPassword = DEMO_CONFIG.demoPassword;
  /** B1.3: el inicio de sesión se valida en el backend (`npm run start:api`). */
  readonly apiMode = this.auth.apiMode;
  /** Aviso al llegar (sesión expirada, contraseña actualizada) o de la restauración de sesión (API no disponible). */
  readonly notice = computed(() => LOGIN_NOTICES[this.route.snapshot.queryParamMap.get('aviso') ?? ''] ?? this.auth.notice());

  constructor() {
    // El aviso de credenciales se refiere a los datos enviados: deja de aplicar en cuanto se editan.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.errorMessage.set(''));
  }

  fill(email: string): void {
    this.form.setValue({ email, password: this.demoPassword });
  }

  /** Abre la confirmación; el foco va a «Cancelar», la opción que no cambia nada. */
  askReset(): void {
    this.resetDone.set(false);
    this.confirmingReset.set(true);
    setTimeout(() => this.cancelResetButton()?.nativeElement.focus());
  }

  /** Cierra la confirmación sin tocar los datos y devuelve el foco al botón que la abrió. */
  cancelReset(): void {
    this.confirmingReset.set(false);
    setTimeout(() => this.resetTrigger()?.nativeElement.focus());
  }

  /** Solo se llama al confirmar. El restablecimiento es el mismo de siempre (repositorio). */
  resetDemo(): void {
    this.repo.resetDemo();
    this.resetDone.set(true);
    this.confirmingReset.set(false);
    setTimeout(() => this.resetTrigger()?.nativeElement.focus());
  }

  /** Rol de una cuenta de prueba («Participante · …» → «Participante»). Solo presentación. */
  accountRole(label: string): string {
    return label.split(' · ')[0];
  }

  /** Estado de una cuenta de prueba, sin el rol («Participante · aprobada…» → «aprobada…»). */
  accountState(label: string): string {
    return label.split(' · ').slice(1).join(' · ');
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) {
      this.errorMessage.set('');
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: (user) => {
        this.loading.set(false);
        // Modo API: con una contraseña temporal, primero hay que cambiarla.
        this.router.navigateByUrl(user.mustChangePassword ? '/cambiar-clave' : this.auth.homeFor(user.role));
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.errorMessage.set(err.message || 'No se pudo iniciar sesión.');
      },
    });
  }
}
