import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Icon } from '../../../shared/components/icon';

/** Misma política que el backend (NewPasswordPolicy): de 8 a 128 caracteres, con letras y números. */
const HAS_LETTER = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const HAS_DIGIT = /\d/;
/** Formato del token del enlace (256 bits en base64url). Un token con otro formato ni se envía. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const ACTIVATION_PATH = '/activar-cuenta';

function matchValidator(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

/** Token del fragmento `#token=…` (el fragmento no se envía al servidor ni queda en sus registros). */
export function tokenFromFragment(fragment: string | null): string | null {
  const token = new URLSearchParams(fragment ?? '').get('token');
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Activación de la cuenta del estudiante (modo API): abre el enlace `<ACTIVATION_URL>#token=…` y crea su contraseña
 * (POST /auth/activate). Al leer el token se quita de la barra de direcciones. No inicia sesión: al terminar lleva al
 * inicio de sesión con un aviso. Reutiliza el diseño de «Cambia tu contraseña».
 */
@Component({
  selector: 'app-activate-account',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  styleUrl: '../change-password/change-password.css',
  template: `
    <section class="card change">
      <header class="change__head">
        <h1>Activa tu cuenta</h1>
        <p class="muted">Crea tu contraseña para ingresar al Aula Virtual IMC.</p>
      </header>

      @if (!token) {
        <p class="alert alert-danger change__error" role="alert" data-test="invalid-link">
          <app-icon name="alert" size="sm" />
          <span>El enlace de activación no es válido o está incompleto. Pide a tu instructor que te envíe uno nuevo.</span>
        </p>
        <div class="change__foot">
          <a class="btn btn-ghost btn-sm" routerLink="/login">Ir al inicio de sesión</a>
        </div>
      } @else {
        @if (errorMessage()) {
          <p class="alert alert-danger change__error" role="alert" data-test="error">
            <app-icon name="alert" size="sm" /><span>{{ errorMessage() }}</span>
          </p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="new-password">Nueva contraseña</label>
            <input
              id="new-password"
              class="input"
              [type]="showPasswords() ? 'text' : 'password'"
              autocomplete="new-password"
              formControlName="newPassword"
              [class.is-invalid]="!!newPasswordError()"
              [attr.aria-invalid]="!!newPasswordError()"
              aria-describedby="new-help"
            />
            <span class="small muted" id="new-help">Al menos 8 caracteres, con letras y números.</span>
            @if (newPasswordError()) {
              <span class="error-text" id="new-error">{{ newPasswordError() }}</span>
            }
          </div>

          <div class="field">
            <label for="confirm-password">Repite la nueva contraseña</label>
            <input
              id="confirm-password"
              class="input"
              [type]="showPasswords() ? 'text' : 'password'"
              autocomplete="new-password"
              formControlName="confirmPassword"
              [class.is-invalid]="!!confirmError()"
              [attr.aria-invalid]="!!confirmError()"
              [attr.aria-describedby]="confirmError() ? 'confirm-error' : null"
            />
            @if (confirmError()) {
              <span class="error-text" id="confirm-error">{{ confirmError() }}</span>
            }
          </div>

          <label class="check change__show">
            <input type="checkbox" [checked]="showPasswords()" (change)="showPasswords.set(!showPasswords())" /> Mostrar contraseñas
          </label>

          <button type="submit" class="btn btn-primary full" [class.is-loading]="loading()" [disabled]="loading()">
            Activar cuenta
          </button>
        </form>
      }
    </section>
  `,
})
export class ActivateAccount {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Se lee una sola vez y se quita de la dirección visible (historial y capturas de pantalla). */
  readonly token = tokenFromFragment(inject(ActivatedRoute).snapshot.fragment);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly showPasswords = signal(false);

  readonly form = this.fb.group(
    {
      newPassword: [
        '',
        [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(HAS_LETTER), Validators.pattern(HAS_DIGIT)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchValidator },
  );

  constructor() {
    inject(Location).replaceState(ACTIVATION_PATH);
  }

  newPasswordError(): string {
    const control = this.form.controls.newPassword;
    if (!control.touched || !control.errors) return '';
    if (control.errors['required']) return 'Ingresa la nueva contraseña.';
    if (control.errors['minlength']) return 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (control.errors['maxlength']) return 'La nueva contraseña es demasiado larga.';
    if (!HAS_LETTER.test(control.value)) return 'La nueva contraseña debe incluir al menos una letra.';
    return 'La nueva contraseña debe incluir al menos un número.';
  }

  confirmError(): string {
    const control = this.form.controls.confirmPassword;
    if (!control.touched) return '';
    if (control.errors?.['required']) return 'Repite la nueva contraseña.';
    if (this.form.errors?.['mismatch']) return 'Las contraseñas no coinciden.';
    return '';
  }

  submit(): void {
    this.errorMessage.set('');
    if (!this.token) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.auth.activateAccount(this.token, this.form.getRawValue().newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/login'], { queryParams: { aviso: 'cuenta-activada' } });
      },
      error: (error: Error) => {
        // Enlace vencido, usado o inválido: el servidor responde siempre el mismo mensaje.
        this.loading.set(false);
        this.errorMessage.set(error.message || 'No se pudo activar la cuenta.');
      },
    });
  }
}
