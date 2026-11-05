import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';

import { BUSINESS_KINDS } from '@core/business-kinds';
import { BetaRequestItem, BetaStatus, LandingFunnel, PlatformBusiness } from '@core/models/platform-business.model';
import { AuthService } from '@core/services/auth.service';
import { SuperAdminService } from '@core/services/super-admin.service';

@Component({
  selector: 'app-super-admin-page',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTableModule],
  templateUrl: './super-admin-page.component.html',
})
export class SuperAdminPageComponent {
  private readonly platformApi = inject(SuperAdminService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly columns = ['name', 'slug', 'staff', 'appointments', 'status', 'actions'];
  protected readonly businesses = signal<PlatformBusiness[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loggingOut = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly currentUser = this.auth.currentUser;
  protected readonly betaRequests = signal<BetaRequestItem[]>([]);
  protected readonly funnel = signal<LandingFunnel | null>(null);
  protected readonly betaPendingId = signal<number | null>(null);
  protected readonly newRequests = computed(() => this.betaRequests().filter((item) => item.status === 'nueva').length);

  constructor() {
    this.load();
    this.loadBeta();
  }

  protected kindLabel(kind: string): string {
    return BUSINESS_KINDS.find((item) => item.value === kind)?.label ?? kind;
  }

  /** Mensaje listo para escribirle por WhatsApp a quien pidió acceso. */
  protected whatsappLink(item: BetaRequestItem): string {
    const text = `Hola ${item.name.split(' ')[0]}, te escribimos de Nexia. Recibimos tu solicitud para la beta de ${item.business_name}.`;
    return `https://wa.me/52${item.phone}?text=${encodeURIComponent(text)}`;
  }

  protected setBetaStatus(item: BetaRequestItem, status: BetaStatus): void {
    if (this.betaPendingId() !== null) {
      return;
    }
    this.betaPendingId.set(item.id);
    this.platformApi
      .setBetaStatus(item.id, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.betaRequests.update((items) => items.map((row) => (row.id === updated.id ? updated : row)));
          this.betaPendingId.set(null);
        },
        error: (error: unknown) => {
          this.betaPendingId.set(null);
          this.loadError.set(readError(error, 'No pudimos cambiar el estado de la solicitud.'));
        },
      });
  }

  private loadBeta(): void {
    this.platformApi
      .getBetaRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.betaRequests.set(items), error: () => undefined });
    this.platformApi
      .getLandingFunnel()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.funnel.set(data), error: () => undefined });
  }

  protected toggle(business: PlatformBusiness): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(business.id);
    this.loadError.set(null);
    this.platformApi
      .updateBusinessStatus(business.id, !business.is_active)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.businesses.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.pendingId.set(null);
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.loadError.set(readError(error, 'No pudimos cambiar el estado del negocio.'));
        },
      });
  }

  protected logout(): void {
    if (this.loggingOut()) {
      return;
    }
    this.loggingOut.set(true);
    this.auth
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/auth/login');
        },
        error: () => this.loggingOut.set(false),
      });
  }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.platformApi
      .getBusinesses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.businesses.set(items);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar los negocios.'));
        },
      });
  }
}

function readError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'No hay conexión con el servidor.';
  }
  const detail = error.error?.detail;
  if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
    return detail;
  }
  return fallback;
}
