import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

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
  imports: [RouterLink],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });

  protected readonly period = signal<'day' | 'week' | 'month'>('day');
  protected readonly metric = signal<'revenue' | 'count'>('revenue');
  protected readonly pickerOpen = signal(false);
  protected readonly metrics = [
    { id: 'revenue' as const, title: 'Ingresos', badge: 'Suma', text: 'El dinero de las citas del periodo.' },
    { id: 'count' as const, title: 'Citas', badge: 'Conteo', text: 'Cuántas citas hay en el periodo.' },
  ];
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly greetingName = computed(() => this.auth.currentUser()?.fullName?.split(' ')[0] ?? 'hola');
  protected readonly points = computed(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    if (this.period() === 'month') {
      return summary.month_trend ?? [];
    }
    if (this.period() === 'day') {
      return summary.week_trend.filter((point) => this.isToday(point.date));
    }
    return summary.week_trend;
  });
  protected readonly plotted = computed(() =>
    this.points().map((point) => (this.metric() === 'revenue' ? point.revenue : point.count)),
  );
  protected readonly maxTrend = computed(() => Math.max(1, ...this.plotted()));

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
    if (this.period() === 'month') {
      return String(parsed.getDate());
    }
    return label.charAt(0).toUpperCase() + label.slice(1, 3);
  }

  protected pointLabel(index: number): string {
    const amount = this.plotted()[index] ?? 0;
    return this.metric() === 'revenue' ? this.money(amount) : String(amount);
  }

  protected chartCaption(): string {
    if (this.period() === 'day') {
      return 'Este día';
    }
    if (this.period() === 'month') {
      return 'Cada día del mes';
    }
    return 'Cada día de la semana';
  }

  protected isToday(value: string): boolean {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return value === `${now.getFullYear()}-${month}-${day}`;
  }

  protected barHeight(index: number): number {
    const amount = this.plotted()[index] ?? 0;
    if (!amount) {
      return 0;
    }
    return Math.round((amount / this.maxTrend()) * 100);
  }

  protected chartLine(): string {
    const values = this.plotted();
    if (values.length === 1) {
      const y = 120 - ((values[0] || 0) / this.maxTrend()) * 100;
      return `M0.0,120.0 L280.0,${y.toFixed(1)} L560.0,120.0`;
    }
    if (values.length < 2) {
      return '';
    }
    const max = this.maxTrend();
    return values
      .map((amount, index) => {
        const x = (index / (values.length - 1)) * 560;
        const y = 120 - (amount / max) * 100;
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  protected chartArea(): string {
    const line = this.chartLine();
    return line ? `${line} L560,140 L0,140 Z` : '';
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

  protected metricTitle(): string {
    return this.metrics.find((item) => item.id === this.metric())?.title ?? 'Ingresos';
  }

  protected metricValue(): string {
    const total = this.plotted().reduce((sum, amount) => sum + amount, 0);
    return this.metric() === 'revenue' ? this.money(total) : String(total);
  }

  protected pickMetric(id: 'revenue' | 'count'): void {
    this.metric.set(id);
    this.pickerOpen.set(false);
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
