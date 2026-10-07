import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';

import { AppointmentStatus } from '@core/models/appointment.model';
import { DashboardSummary } from '@core/models/dashboard.model';
import { AuthService } from '@core/services/auth.service';
import { DashboardService } from '@core/services/dashboard.service';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No llegó',
  awaiting_deposit: 'Falta el anticipo',
};

@Component({
  selector: 'app-dashboard-page',
  imports: [MatIconModule],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly greetingName = computed(() => this.auth.currentUser()?.fullName?.split(' ')[0] ?? 'hola');
  protected readonly maxTrend = computed(() =>
    Math.max(1, ...(this.summary()?.week_trend.map((point) => point.count) ?? [1])),
  );

  constructor() {
    this.dashboardApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el resumen.'));
        },
      });
  }

  protected money(amount: number): string {
    return this.currency.format(amount);
  }

  protected hour(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : this.timeFormat.format(parsed);
  }

  protected dayLabel(value: string): string {
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    const label = this.dayFormat.format(parsed).replace('.', '');
    return label.charAt(0).toUpperCase() + label.slice(1, 3);
  }

  protected barHeight(count: number): number {
    return Math.max(8, Math.round((count / this.maxTrend()) * 100));
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '·'
    );
  }

  protected statusLabel(status: AppointmentStatus): string {
    return STATUS_LABEL[status];
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
