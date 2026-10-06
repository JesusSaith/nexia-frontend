import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { UserRole } from '@core/models/user.model';
import { CustomButtonComponent } from '@shared/components/custom-button/custom-button';

interface AdminNavLink {
  label: string;
  path: string;
  exact: boolean;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  staff: 'Equipo',
};

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CustomButtonComponent],
  templateUrl: './admin-layout.html',
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly links: readonly AdminNavLink[] = [
    { label: 'Agenda', path: '/admin', exact: true },
    { label: 'Servicios', path: '/admin/servicios', exact: false },
    { label: 'Equipo', path: '/admin/equipo', exact: false },
    { label: 'Clientes', path: '/admin/clientes', exact: false },
  ];

  protected readonly currentUser = this.authService.currentUser;
  protected readonly sidebarOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal<string | null>(null);

  protected readonly businessName = computed(
    () => this.currentUser()?.businessName ?? 'Tu negocio',
  );

  protected readonly roleLabel = computed(() => {
    const role = this.authService.role();
    return role ? ROLE_LABELS[role] : 'Sin sesión';
  });

  protected readonly initials = computed(() => {
    const name = this.currentUser()?.fullName ?? '';
    const letters = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '');
    return letters.join('') || 'NX';
  });

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
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
