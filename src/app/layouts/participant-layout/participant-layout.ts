import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';
import { Icon, IconName } from '../../shared/components/icon';
import { skipToContent } from '../../shared/a11y/skip-link';
import { SupportButton } from '../../shared/components/support-button';

interface NavLink {
  label: string;
  path: string;
  prefixes: string[];
  icon: IconName;
}

/** Ruta donde se rinde el examen: se muestra en modo enfoque, sin la navegación general. */
const EXAM_RUN = /^\/cursos\/[^/]+\/examen\/rendir$/;

@Component({
  selector: 'app-participant-layout',
  imports: [RouterOutlet, RouterLink, LogoPlaceholder, Icon, SupportButton],
  templateUrl: './participant-layout.html',
  styleUrl: './participant-layout.css',
})
export class ParticipantLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  /** «Saltar al contenido» (V5): lleva el foco al contenido principal. */
  readonly skip = skipToContent;

  // Tablero de cursos, progreso y certificados; el examen se abre desde cada curso (reunión del 23/10).
  // «Mis cursos» también queda activo dentro de cada curso (/cursos/...).
  /** Modo API: sin avisos de demostración. Mismo menú en los dos modos (todo conectado al servidor desde el 18/11/2026). */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
  readonly links: NavLink[] = [
    { label: 'Mis cursos', path: '/panel', prefixes: ['/panel', '/cursos'], icon: 'book' },
    { label: 'Mi progreso', path: '/progreso', prefixes: ['/progreso'], icon: 'chart' },
    { label: 'Mis certificados', path: '/certificados', prefixes: ['/certificados'], icon: 'award' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  private readonly path = computed(() => this.url().split(/[?#]/)[0]);
  /** Modo enfoque del examen: sin menú ni «Salir», para evitar salidas accidentales. */
  readonly focusMode = computed(() => EXAM_RUN.test(this.path()));
  readonly initials = computed(() =>
    (this.user()?.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );

  isActive(link: { prefixes: string[] }): boolean {
    const path = this.path();
    return link.prefixes.some((p) => path === p || path.startsWith(`${p}/`));
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
