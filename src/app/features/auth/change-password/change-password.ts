import { Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Icon } from '../../../shared/components/icon';

/** Misma política que el backend (ChangePasswordDto): al menos 8 caracteres, con letras y números. */
const HAS_LETTER = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
const HAS_DIGIT = /\d/;

function passwordsValidator(group: AbstractControl): ValidationErrors | null {
  const current = group.get('currentPassword')?.value as string;
  const next = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  const errors: ValidationErrors = {};
  if (next && confirm && next !== confirm) errors['mismatch'] = true;
  if (next && current && next === current) errors['sameAsCurrent'] = true;
  return Object.keys(errors).length ? errors : null;
}

/**
 * Cambio obligatorio de la contraseña temporal (modo API, B1.3). Al terminar, el servidor cierra todas las sesiones:
 * se vuelve al inicio de sesión para ingresar con la nueva contraseña (no se guarda para entrar automáticamente).
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
})
export class ChangePassword {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly showPasswords = signal(false);

  readonly form = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(HAS_LETTER), Validators.pattern(HAS_DIGIT)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsValidator },
  );

  /** Mensaje de la nueva contraseña (política del backend). */
  newPasswordError(): string {
    const control = this.form.controls.newPassword;
    if (!control.touched || !control.errors) return '';
    if (control.errors['required']) return 'Ingresa la nueva contraseña.';
    if (control.errors['minlength']) return 'La nueva contraseña debe tener al menos 8 caracteres.';
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

  sameAsCurrent(): boolean {
    return this.form.controls.newPassword.touched && !!this.form.errors?.['sameAsCurrent'];
  }

  submit(): void {
    this.errorMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.loading.set(true);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/login'], { queryParams: { aviso: 'clave-actualizada' } });
      },
      error: (error: Error) => {
        this.loading.set(false);
        this.errorMessage.set(error.message || 'No se pudo cambiar la contraseña.');
      },
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
