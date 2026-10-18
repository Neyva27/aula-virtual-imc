import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoPlaceholder],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly menuOpen = signal(false);

  readonly links = [
    { label: 'Dashboard', path: '/admin', exact: true },
    { label: 'Participantes', path: '/admin/participantes', exact: false },
    { label: 'Cursos', path: '/admin/cursos', exact: false },
    { label: 'Videos', path: '/admin/videos', exact: false },
    { label: 'Evaluaciones', path: '/admin/evaluaciones', exact: false },
    { label: 'Seguimiento y resultados', path: '/admin/resultados', exact: false },
    { label: 'Certificados', path: '/admin/certificados', exact: false },
  ];

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
