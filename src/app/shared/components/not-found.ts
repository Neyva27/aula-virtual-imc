import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LogoPlaceholder } from './logo-placeholder';
import { Icon } from './icon';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, LogoPlaceholder, Icon],
  template: `
    <main class="wrap">
      <div class="brand"><app-logo-placeholder /></div>
      <div class="card stack box">
        <span class="icon-wrap" aria-hidden="true"><app-icon name="alert" size="lg" /></span>
        <p class="code" aria-hidden="true">404</p>
        <h1>Página no encontrada</h1>
        <p class="muted">La dirección que buscas no existe o fue movida.</p>
        <div><a class="btn btn-primary" [routerLink]="home()"><app-icon name="arrow-left" size="sm" /> Ir al inicio</a></div>
      </div>
    </main>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: var(--space-6);
        padding: var(--space-8) var(--space-4);
        background: radial-gradient(circle at 50% 0%, var(--c-primary-100) 0, transparent 60%), var(--c-bg);
      }
      .box { width: 100%; max-width: 460px; text-align: center; padding: var(--space-8) var(--space-6); justify-items: center; }
      .icon-wrap {
        display: grid; place-items: center; width: 56px; height: 56px; margin: 0 auto; border-radius: var(--radius-pill);
        background: var(--c-warning-100); color: var(--c-warning);
      }
      /* Solo margin-bottom: la separación entre bloques la da .stack. */
      .code { font-size: 3.5rem; font-weight: 800; line-height: 1; margin-bottom: 0; color: var(--c-primary); letter-spacing: -0.02em; }
      h1 { margin-bottom: 0; font-size: var(--text-xl); }
      @media (max-width: 600px) { .box { padding: var(--space-6) var(--space-4); } }
    `,
  ],
})
export class NotFound {
  private readonly auth = inject(AuthService);

  /** Inicio según la sesión: el de su rol si hay sesión; si no, el inicio de sesión. Los guards siguen aplicando. */
  readonly home = computed(() => {
    const user = this.auth.user();
    return user ? this.auth.homeFor(user.role) : '/login';
  });
}
