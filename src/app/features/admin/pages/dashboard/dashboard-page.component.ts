import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DashboardStats } from '@core/models/dashboard.model';
import { DashboardService } from '@core/services/dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });

  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly maxServiceAppointments = computed(() => {
    const counts = this.stats()?.top_services.map((item) => item.total_appointments) ?? [];
    return Math.max(1, ...counts);
  });

  constructor() {
    this.load();
  }

  protected formatMoney(amount: number): string {
    return this.currency.format(amount);
  }

  protected barWidth(totalAppointments: number): number {
    return Math.round((totalAppointments / this.maxServiceAppointments()) * 100);
  }

  private load(): void {
    this.dashboardApi
      .getStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar las métricas.'));
        },
      });
  }
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
  }
  return fallback;
}
