import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval, of } from 'rxjs';
import { catchError, filter, map, startWith, switchMap } from 'rxjs/operators';

import { UserRole } from '@core/models/user.model';
import { AuthService } from '@core/services/auth.service';
import { BusinessCopy } from '@core/business-copy';
import { BookingService } from '@core/services/booking.service';
import { Toasts } from '@core/toasts';
import { DashboardService } from '@core/services/dashboard.service';

interface AdminNavLink {
  label: string;
  path: string;
  exact: boolean;
  icon: string;
  /** Título del bloque en el menú lateral; los enlaces sin grupo van arriba, sin título. */
  group?: string;
}

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'nexia-theme';

const THEME_OPTIONS: readonly { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: 'light_mode' },
  { value: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  { value: 'system', label: 'Sistema', icon: 'contrast' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  staff: 'Equipo',
  super_admin: 'Plataforma',
  client: 'Cliente',
};

const MANAGER_LINKS: readonly AdminNavLink[] = [
  { label: 'Inicio', path: '/admin/home', exact: true, icon: 'home' },
  { label: 'Agenda', path: '/admin/agenda', exact: true, icon: 'calendar_month' },
  { label: 'Clientes', path: '/admin/clientes', exact: false, icon: 'person' },
  { label: 'Reportes', path: '/admin/dashboard', exact: true, icon: 'space_dashboard' },
  { label: 'Servicios', path: '/admin/services', exact: false, icon: 'category', group: 'Tu negocio' },
  { label: 'Equipo', path: '/admin/staff', exact: false, icon: 'groups', group: 'Tu negocio' },
  { label: 'Horarios', path: '/admin/schedules', exact: false, icon: 'schedule', group: 'Tu negocio' },
  { label: 'Mi negocio', path: '/admin/negocio', exact: true, icon: 'storefront', group: 'Tu negocio' },
  { label: 'Inventario', path: '/admin/caja', exact: true, icon: 'inventory_2', group: 'Tu negocio' },
  { label: 'Configuración', path: '/admin/settings', exact: true, icon: 'tune', group: 'Tu negocio' },
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
  styles: `
    .nexia-toast {
      animation: nexia-toast-in 0.4s ease;
    }
    @keyframes nexia-toast-in {
      from {
        opacity: 0;
        transform: translateY(-18px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly bookingApi = inject(BookingService);
  private readonly copy = inject(BusinessCopy);
  protected readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly noticesApi = inject(DashboardService);
  private seenNotice = Number(readSeen() || 0);
  private toastedNotice = this.seenNotice;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
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
    const clients = this.copy.text().clients;
    return MANAGER_LINKS.map((link) => (link.path === '/admin/clientes' ? { ...link, label: clients } : link));
  });

  /** Los enlaces en bloques para el menú lateral: [{ title, links }]. */
  protected readonly linkGroups = computed(() => {
    const groups: { title: string; links: AdminNavLink[] }[] = [];
    for (const link of this.links()) {
      const title = link.group ?? '';
      const last = groups.at(-1);
      if (last && last.title === title) {
        last.links.push(link);
      } else {
        groups.push({ title, links: [link] });
      }
    }
    return groups;
  });

  protected readonly currentUser = this.authService.currentUser;
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly headerLogo = computed(() => this.copy.logo() ?? this.logoUrl());
  protected readonly brandName = signal<string | null>(null);
  protected readonly brandColor = signal('#E11D48');
  protected readonly canvasColor = signal<string | null>(null);
  protected readonly sidebarOpen = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal<string | null>(null);
  protected readonly unread = signal(0);
  protected readonly toast = signal<string | null>(null);
  protected readonly isHandset = this.handset;
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly themeMode = signal<ThemeMode>(readThemeMode());
  private readonly systemDark = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  protected readonly isDark = computed(() =>
    this.themeMode() === 'system' ? this.systemDark() : this.themeMode() === 'dark',
  );

  protected readonly businessName = computed(
    () => this.currentUser()?.businessName ?? 'Tu negocio',
  );

  constructor() {
    this.destroyRef.onDestroy(() => applyTheme('#E11D48', null));
    effect(() => applyTheme(this.brandColor(), this.canvasColor()));
    // Modo claro/oscuro solo dentro del panel: al salir (p. ej. a /:slug/book) se vuelve a claro.
    effect(() => applyMode(this.themeMode(), this.isDark()));
    this.destroyRef.onDestroy(() => applyMode('light', false));
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    if (media) {
      const onChange = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
      media.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => media.removeEventListener?.('change', onChange));
    }
    if (!this.authService.isSuperAdmin()) {
      this.bookingApi
        .getMyBrand()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((brand) => {
          this.brandColor.set(safeHex(brand.primary_color));
          this.canvasColor.set(safeHexOrNull(brand.canvas_color));
          this.logoUrl.set(brand.logo_url);
          this.brandName.set(brand.name);
          this.copy.setLabel(brand.staff_label);
          this.copy.setLogo(brand.logo_url);
          this.copy.setTemplates(brand.message_templates);
        });
      interval(20000)
        .pipe(
          startWith(0),
          switchMap(() => this.noticesApi.getNotices().pipe(catchError(() => of([])))),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((rows) => this.applyNotices(rows));
      this.router.events
        .pipe(
          filter((event) => event instanceof NavigationEnd),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          if (this.router.url.startsWith('/admin/home')) {
            this.seenNotice = Math.max(this.seenNotice, this.toastedNotice);
            saveSeen(this.seenNotice);
            this.unread.set(0);
          }
        });
    }
  }

  protected readonly roleLabel = computed(() => {
    const role = this.authService.role();
    return role ? ROLE_LABELS[role] : 'Sin sesión';
  });

  private applyNotices(rows: { id: number; message: string }[]): void {
    // Primera vez en este navegador: lo anterior cuenta como visto (sin aviso emergente de algo viejo).
    if (!this.seenNotice && rows.length) {
      this.seenNotice = this.toastedNotice = rows.reduce((top, row) => Math.max(top, row.id), 0);
      saveSeen(this.seenNotice);
      return;
    }
    const fresh = rows.filter((row) => row.id > this.seenNotice);
    if (this.router.url.startsWith('/admin/home')) {
      const max = rows.reduce((top, row) => Math.max(top, row.id), this.seenNotice);
      this.seenNotice = max;
      this.toastedNotice = max;
      saveSeen(max);
      this.unread.set(0);
      return;
    }
    this.unread.set(fresh.length);
    const newest = fresh[0];
    if (newest && newest.id > this.toastedNotice) {
      this.toastedNotice = newest.id;
      this.toast.set(newest.message.replace(/\s*#\d+\s*$/, ''));
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
      this.toastTimer = setTimeout(() => this.toast.set(null), 7000);
    }
  }

  protected closeToast(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toast.set(null);
  }

  protected setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Sin almacenamiento la preferencia dura solo esta visita.
    }
  }

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

  protected clearLogo(): void {
    this.copy.setLogo(null);
    this.logoUrl.set(null);
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

function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

// Mismo criterio que el script inline de index.html (evita parpadeo al cargar).
function applyMode(mode: ThemeMode, dark: boolean): void {
  document.documentElement.dataset['theme'] = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131211' : '#f6f5f3');
}

// En localStorage para que sobreviva al cerrar la app; sessionStorage se borraba en cada visita.
function readSeen(): string | null {
  try {
    return localStorage.getItem('nexia-seen-notice');
  } catch {
    return null;
  }
}

function saveSeen(id: number): void {
  try {
    localStorage.setItem('nexia-seen-notice', String(id));
  } catch {
    // Sin almacenamiento solo se repite el aviso.
  }
}
