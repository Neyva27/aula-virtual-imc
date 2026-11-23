import { Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { ApiDataRepository } from '../../core/services/api-data-repository';
import { GENERAL_ADMIN } from '../../core/models/admin.model';

interface NavLink {
  label: string;
  path: string;
  exact: boolean;
  icon: IconName;
}
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DataRepository } from '../../core/services/data-repository';
import { APP_ENVIRONMENT, isApiMode } from '../../core/config/app-environment';
import { LogoPlaceholder } from '../../shared/components/logo-placeholder';
import { Icon, IconName } from '../../shared/components/icon';
import { skipToContent } from '../../shared/a11y/skip-link';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoPlaceholder, Icon],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
  // El cajón del menú (móvil) se cierra también con Escape.
  host: { '(document:keydown.escape)': 'closeMenu()' },
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly menuOpen = signal(false);
  /** «Saltar al contenido» (V5): lleva el foco al contenido principal. */
  readonly skip = skipToContent;
  /** Estado de los datos guardados al abrir la aplicación (migración, respaldo). Solo se lee. */
  readonly storage = inject(DataRepository).getStorageStatus();
  /** El aviso se puede ocultar durante esta visita; no se guarda ni modifica ningún dato. */
  readonly storageDismissed = signal(false);

  /** Modo API: sin avisos de demostración. */
  readonly apiMode = isApiMode(inject(APP_ENVIRONMENT));
  private readonly injector = inject(Injector);

  constructor() {
    if (this.apiMode) {
      this.injector
        .get(ApiDataRepository)
        .myPermissions()
        .subscribe({ next: (p) => this.generalAdmin.set(p.includes(GENERAL_ADMIN)), error: () => this.generalAdmin.set(false) });
    }
  }

  /** Mismo menú en los dos modos: desde el 18/11/2026 todos los módulos están conectados al servidor en modo API. */
  private readonly baseLinks: NavLink[] = [
    { label: 'Dashboard', path: '/instructor', exact: true, icon: 'grid' },
    { label: 'Participantes', path: '/instructor/participantes', exact: false, icon: 'users' },
    { label: 'Cursos', path: '/instructor/cursos', exact: false, icon: 'book' },
    { label: 'Videos', path: '/instructor/videos', exact: false, icon: 'video' },
    { label: 'Evaluaciones', path: '/instructor/evaluaciones', exact: false, icon: 'clipboard' },
    { label: 'Evaluaciones rendidas', path: '/instructor/evaluaciones-rendidas', exact: false, icon: 'chart' }, // R7
    { label: 'Certificados', path: '/instructor/certificados', exact: false, icon: 'award' },
  ];

  /**
   * Administración general de IMC (modo API): «Empresas» e «Importar certificados» se agregan al MISMO panel solo si el
   * servidor confirma el permiso IMC_GENERAL_ADMIN (no hay un tercer panel). Si la consulta falla, no se muestran.
   */
  private readonly generalAdmin = signal(false);
  readonly links = computed<NavLink[]>(() =>
    this.generalAdmin()
      ? [
          ...this.baseLinks,
          { label: 'Empresas', path: '/instructor/empresas', exact: false, icon: 'building' },
          { label: 'Importar certificados', path: '/instructor/importar-certificados', exact: false, icon: 'upload' },
        ]
      : this.baseLinks,
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Sección actual, para la barra superior («Panel del instructor / Participantes»). */
  readonly section = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    return this.links().find((l) => (l.exact ? path === l.path : path === l.path || path.startsWith(`${l.path}/`)))?.label ?? '';
  });
  readonly initials = computed(() =>
    (this.user()?.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );

  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly menuClose = viewChild<ElementRef<HTMLButtonElement>>('menuClose');

  /** Al abrir el cajón (móvil) el foco pasa a «Cerrar menú»; el resto del panel queda inerte. */
  toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    this.menuOpen.set(true);
    setTimeout(() => this.menuClose()?.nativeElement.focus());
  }

  /** Cierra el cajón y, si estaba abierto, devuelve el foco al botón «Menú». */
  closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    setTimeout(() => this.menuToggle()?.nativeElement.focus());
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
