import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

import { UserRole } from '@core/models/user.model';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';

interface AdminNavLink {
  label: string;
  path: string;
  exact: boolean;
  icon: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  staff: 'Equipo',
  super_admin: 'Plataforma',
  client: 'Cliente',
};

const MANAGER_LINKS: readonly AdminNavLink[] = [
  { label: 'Perfil', path: '/admin/negocio', exact: true, icon: 'storefront' },
  { label: 'Home', path: '/admin/home', exact: true, icon: 'home' },
  { label: 'Dashboard', path: '/admin/dashboard', exact: true, icon: 'space_dashboard' },
  { label: 'Agenda', path: '/admin/agenda', exact: true, icon: 'calendar_month' },
  { label: 'Servicios', path: '/admin/services', exact: false, icon: 'content_cut' },
  { label: 'Equipo', path: '/admin/staff', exact: false, icon: 'groups' },
  { label: 'Horarios', path: '/admin/schedules', exact: false, icon: 'schedule' },
  { label: 'Clientes', path: '/admin/clientes', exact: false, icon: 'person' },
  { label: 'Configuración', path: '/admin/settings', exact: true, icon: 'tune' },
];

const STAFF_LINKS: readonly AdminNavLink[] = [
  { label: 'Mi Agenda', path: '/admin/agenda', exact: true, icon: 'calendar_month' },
  { label: 'Mi Perfil', path: '/admin/profile', exact: true, icon: 'account_circle' },
];

const PLATFORM_LINKS: readonly AdminNavLink[] = [
  { label: 'Negocios / Plataforma', path: '/super-admin', exact: true, icon: 'apartment' },
];

@Component({
  selector: 'app-admin-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  templateUrl: './admin-layout.html',
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly bookingApi = inject(BookingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly handset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly links = computed(() => {
    if (this.authService.isSuperAdmin()) {
      return PLATFORM_LINKS;
    }
    if (this.authService.isStaff()) {
      return STAFF_LINKS;
    }
    return MANAGER_LINKS;
  });

  protected readonly currentUser = this.authService.currentUser;
  protected readonly brandColor = signal('#E11D48');
  protected readonly canvasColor = signal<string | null>(null);
  protected readonly sidebarOpen = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal<string | null>(null);
  protected readonly isHandset = this.handset;

  protected readonly businessName = computed(
    () => this.currentUser()?.businessName ?? 'Tu negocio',
  );

  constructor() {
    this.destroyRef.onDestroy(() => applyTheme('#E11D48', null));
    effect(() => applyTheme(this.brandColor(), this.canvasColor()));
    if (!this.authService.isSuperAdmin()) {
      this.bookingApi
        .getMyBrand()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((brand) => {
          this.brandColor.set(safeHex(brand.primary_color));
          this.canvasColor.set(safeHexOrNull(brand.canvas_color));
        });
    }
  }

  protected readonly roleLabel = computed(() => {
    const role = this.authService.role();
    return role ? ROLE_LABELS[role] : 'Sin sesión';
  });

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected onNavigate(): void {
    if (this.handset()) {
      this.closeSidebar();
    }
  }

  protected logout(): void {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);
    this.logoutError.set(null);

    this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/auth/login');
        },
        error: () => {
          this.loggingOut.set(false);
          this.logoutError.set('No pudimos cerrar la sesión.');
        },
      });
  }
}

function safeHex(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#E11D48';
}

function safeHexOrNull(value: string | null | undefined): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function applyTheme(primary: string, canvas: string | null): void {
  const root = document.documentElement;
  root.style.setProperty('--business-primary', primary);
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--mat-sys-primary', primary);
  if (canvas) {
    root.style.setProperty('--bg-app', canvas);
  } else {
    root.style.removeProperty('--bg-app');
  }
}
