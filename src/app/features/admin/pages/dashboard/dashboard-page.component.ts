import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AppointmentStatus } from '@core/models/appointment.model';
import { DashboardSummary } from '@core/models/dashboard.model';
import { AuthService } from '@core/services/auth.service';
import { DashboardService } from '@core/services/dashboard.service';
import { SalesReport, ShopExpense, ShopService } from '@core/services/shop.service';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No llegó',
  awaiting_deposit: 'Falta el anticipo',
};

type DashView = 'income' | 'staff' | 'commission' | 'expenses';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly shop = inject(ShopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });

  protected readonly tabs: { id: DashView; label: string }[] = [
    { id: 'income', label: 'Ingresos' },
    { id: 'staff', label: 'Ingresos por colaborador' },
    { id: 'commission', label: 'Comisiones por colaborador' },
    { id: 'expenses', label: 'Gastos' },
  ];
  protected readonly view = signal<DashView>('income');
  protected readonly period = signal<'day' | 'week' | 'month'>('day');
  protected readonly metric = signal<'revenue' | 'count'>('revenue');
  protected readonly pickerOpen = signal(false);
  protected readonly metrics = [
    { id: 'revenue' as const, title: 'Ingresos', badge: 'Suma', text: 'El dinero de las citas del periodo.' },
    { id: 'count' as const, title: 'Citas', badge: 'Conteo', text: 'Cuántas citas hay en el periodo.' },
  ];
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly books = signal<SalesReport | null>(null);
  protected readonly closeout = signal<SalesReport | null>(null);
  protected readonly previous = signal<SalesReport | null>(null);
  protected readonly goal = signal(Number(localStorage.getItem('nexia-profit-goal') || 0));
  protected readonly goalMode = signal<'money' | 'percent'>(localStorage.getItem('nexia-profit-mode') === 'percent' ? 'percent' : 'money');
  protected readonly expenseName = signal('');
  protected readonly expenseAmount = signal('');
  protected readonly expenseKind = signal<'fixed' | 'variable'>('fixed');
  protected readonly expenseCadence = signal<'month' | 'week' | 'day'>('month');
  protected readonly editingExpense = signal<number | null>(null);
  protected readonly rangeStart = signal('');
  protected readonly rangeEnd = signal('');
  protected readonly margin = computed(() => {
    const row = this.books();
    if (!row || row.total <= 0) {
      return 0;
    }
    return Math.round((row.profit / row.total) * 100);
  });
  protected readonly gap = computed(() => {
    const profit = this.books()?.profit ?? 0;
    const total = this.books()?.total ?? 0;
    const target = this.goalMode() === 'percent' ? (total * this.goal()) / 100 : this.goal();
    return target - profit;
  });
  private readonly reloadBooks = signal(0);
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
  protected readonly series = computed(() => {
    const books = this.books();
    if (this.view() === 'staff') {
      return (books?.staff ?? []).map((person) => ({ label: person.staff_name, amount: person.income }));
    }
    if (this.view() === 'commission') {
      return (books?.staff ?? []).map((person) => ({
        label: `${person.staff_name} · ${person.percent}%`,
        amount: person.commission,
      }));
    }
    if (this.view() === 'expenses') {
      return (books?.expenses ?? []).map((item) => ({
        label: item.kind === 'fixed' ? `${item.name} · ${cadenceLabel(item.cadence)}` : `${item.name} · Variable`,
        amount: item.amount,
      }));
    }
    return this.points().map((point) => ({
      label: this.dayLabel(point.date),
      amount: this.metric() === 'revenue' ? point.revenue : point.count,
    }));
  });
  protected readonly headline = computed(() => {
    const total = this.series().reduce((sum, point) => sum + point.amount, 0);
    return this.view() === 'income' && this.metric() === 'count' ? String(total) : this.money(total);
  });
  protected readonly chartLine = computed(() => this.lineFrom(this.series().map((point) => point.amount)));
  protected readonly chartArea = computed(() => {
    const line = this.chartLine();
    return line ? `${line} L560,140 L0,140 Z` : '';
  });

  constructor() {
    effect(() => {
      this.reloadBooks();
      const today = new Date();
      const end = iso(today);
      const startDate = new Date(today);
      if (this.period() === 'week') {
        startDate.setDate(startDate.getDate() - 6);
      }
      const start =
        this.period() === 'month'
          ? iso(new Date(today.getFullYear(), today.getMonth(), 1))
          : this.period() === 'day'
            ? end
            : iso(startDate);
      this.rangeStart.set(start);
      this.rangeEnd.set(end);
      const prev = previousRange(this.period(), today);
      forkJoin({
        current: this.shop.report(start, end),
        previous: this.shop.report(prev.start, prev.end),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ current, previous }) => {
          this.books.set(current);
          this.previous.set(previous);
        });
    });
    const today = iso(new Date());
    this.shop.report(today, today).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((row) => this.closeout.set(row));
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

  protected setGoalMode(mode: 'money' | 'percent'): void {
    this.goalMode.set(mode);
    localStorage.setItem('nexia-profit-mode', mode);
  }

  protected saveGoal(value: string): void {
    const amount = Number(value) || 0;
    this.goal.set(amount);
    localStorage.setItem('nexia-profit-goal', String(amount));
  }

  protected editExpense(item: ShopExpense): void {
    this.editingExpense.set(item.id);
    this.expenseName.set(item.name);
    this.expenseAmount.set(String(item.base || item.amount));
    this.expenseKind.set(item.kind === 'fixed' ? 'fixed' : 'variable');
    this.expenseCadence.set(item.cadence === 'week' || item.cadence === 'day' ? item.cadence : 'month');
  }

  protected removeExpense(id: number): void {
    this.shop.removeExpense(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.reloadBooks.update((value) => value + 1);
    });
  }

  protected addExpense(): void {
    const name = this.expenseName().trim();
    const amount = Number(this.expenseAmount());
    if (!name || !amount) {
      return;
    }
    const cadence = this.expenseKind() === 'fixed' ? this.expenseCadence() : null;
    const editing = this.editingExpense();
    const request = editing
      ? this.shop.updateExpense(editing, name, amount, this.expenseKind(), cadence)
      : this.shop.addExpense(name, amount, this.expenseKind(), cadence);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.editingExpense.set(null);
      this.expenseName.set('');
      this.expenseAmount.set('');
      this.reloadBooks.update((value) => value + 1);
    });
  }

  protected owed(commission: number, paid: number): number {
    return Math.max(0, commission - paid);
  }

  protected markPaid(staffId: number, amount: number, paid: boolean): void {
    this.shop
      .markCommission(staffId, this.rangeStart(), this.rangeEnd(), amount, paid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadBooks.update((value) => value + 1));
  }

  protected compareText(): string {
    const now = this.books()?.total ?? 0;
    const before = this.previous()?.total ?? 0;
    const diff = now - before;
    const percent = before ? Math.round((diff / before) * 100) : 0;
    const sign = diff > 0 ? '+' : '';
    const name = this.period() === 'day' ? 'Ayer' : this.period() === 'week' ? 'Semana pasada' : 'Mes pasado';
    return `${name} ${this.money(before)} · ${sign}${this.money(diff)}${before ? ` (${sign}${percent}%)` : ''}`;
  }

  protected expenseShare(): number {
    const row = this.books();
    if (!row || row.total <= 0) {
      return 0;
    }
    return Math.round(((row.expense_fixed + row.expense_variable) / row.total) * 100);
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

  protected chartCaption(): string {
    if (this.view() === 'staff' || this.view() === 'commission') {
      return 'Cada colaborador del periodo';
    }
    if (this.view() === 'expenses') {
      return 'Cada gasto del periodo';
    }
    if (this.period() === 'day') {
      return 'Este día';
    }
    if (this.period() === 'month') {
      return 'Cada día del mes';
    }
    return 'Cada día de la semana';
  }

  protected viewTitle(): string {
    if (this.view() === 'income') {
      return this.metrics.find((item) => item.id === this.metric())?.title ?? 'Ingresos';
    }
    return this.tabs.find((item) => item.id === this.view())?.label ?? 'Ingresos';
  }

  protected isToday(value: string): boolean {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return value === `${now.getFullYear()}-${month}-${day}`;
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

  protected pickMetric(id: 'revenue' | 'count'): void {
    this.metric.set(id);
    this.pickerOpen.set(false);
  }

  private lineFrom(values: number[]): string {
    if (values.length === 0) {
      return '';
    }
    const max = Math.max(1, ...values);
    if (values.length === 1) {
      const y = 120 - ((values[0] || 0) / max) * 100;
      return `M0.0,120.0 L280.0,${y.toFixed(1)} L560.0,120.0`;
    }
    return values
      .map((amount, index) => {
        const x = (index / (values.length - 1)) * 560;
        const y = 120 - (amount / max) * 100;
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
}

function cadenceLabel(value: string | null | undefined): string {
  if (value === 'week') {
    return 'Semanal';
  }
  if (value === 'day') {
    return 'Por día';
  }
  return 'Mensual';
}

function previousRange(period: 'day' | 'week' | 'month', today: Date): { start: string; end: string } {
  if (period === 'day') {
    const day = new Date(today);
    day.setDate(day.getDate() - 1);
    const key = iso(day);
    return { start: key, end: key };
  }
  if (period === 'week') {
    const end = new Date(today);
    end.setDate(end.getDate() - 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { start: iso(start), end: iso(end) };
  }
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const end = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), last));
  return { start: iso(start), end: iso(end) };
}

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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
