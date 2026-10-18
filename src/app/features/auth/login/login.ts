import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DEMO_ACCOUNTS } from '../../../core/data/seed';
import { DEMO_CONFIG } from '../../../core/config/demo.config';
import { DataRepository } from '../../../core/services/data-repository';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly repo = inject(DataRepository);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly resetDone = signal(false);

  readonly demoAccounts = DEMO_ACCOUNTS;
  readonly demoPassword = DEMO_CONFIG.demoPassword;

  fill(email: string): void {
    this.form.setValue({ email, password: this.demoPassword });
    this.errorMessage.set('');
  }

  resetDemo(): void {
    this.repo.resetDemo();
    this.resetDone.set(true);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.router.navigateByUrl(this.auth.homeFor(user.role));
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.errorMessage.set(err.message || 'No se pudo iniciar sesión.');
      },
    });
  }
}
