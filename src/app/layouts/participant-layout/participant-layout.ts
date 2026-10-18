import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';

@Component({
  selector: 'app-participant-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoPlaceholder],
  templateUrl: './participant-layout.html',
  styleUrl: './participant-layout.css',
})
export class ParticipantLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;

  readonly links = [
    { label: 'Mi panel', path: '/panel' },
    { label: 'Mi curso', path: '/curso' },
    { label: 'Examen', path: '/examen/instrucciones' },
    { label: 'Mis certificados', path: '/certificados' },
  ];

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
