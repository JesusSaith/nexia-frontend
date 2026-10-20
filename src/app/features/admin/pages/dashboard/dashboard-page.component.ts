import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { METHOD_LABELS } from '@core/payment-methods';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { BusinessCopy } from '@core/business-copy';
import { Appointment } from '@core/models/appointment.model';
import { DashboardSummary, WeekTrendPoint } from '@core/models/dashboard.model';
import { Service } from '@core/models/service.model';
import { AppointmentsService } from '@core/services/appointments.service';
import { AuthService } from '@core/services/auth.service';
import { Toasts } from '@core/toasts';
import { DashboardService } from '@core/services/dashboard.service';
import { ServicesService } from '@core/services/services.service';
import { CashDay, SalesReport, ShopExpense, ShopService } from '@core/services/shop.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';
import { ReportSheet, downloadExcel, downloadPdf } from './dashboard-export';

type DashView = 'income' | 'staff' | 'commission' | 'expenses' | 'cash';

@Component({
  selector: 'app-dashboard-page',
  imports: [PickFieldComponent, RouterLink, MatIconModule, KeyValuePipe],
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(Toasts);
  protected readonly copy = inject(BusinessCopy);
  private readonly shop = inject(ShopService);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly servicesApi = inject(ServicesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });

  private readonly catalog = signal<Service[]>([]);
  private readonly rangePoints = signal<WeekTrendPoint[]>([]);
  protected readonly tabs = computed(() => {
    const person = this.copy.text().person.toLowerCase();
    return [
      { id: 'income' as const, label: 'Ingresos' },
      // Cortas para que quepan las pestañas en celular.
      { id: 'staff' as const, label: `Por ${person}` },
      { id: 'commission' as const, label: 'Comisiones' },
      { id: 'expenses' as const, label: 'Gastos' },
      { id: 'cash' as const, label: 'Corte de caja' },
    ];
  });
  protected readonly shownTabs = computed(() => {
    const pays = (this.books()?.staff ?? []).some((person) => person.percent > 0);
    return pays ? this.tabs() : this.tabs().filter((tab) => tab.id !== 'commission');
  });
  protected readonly topService = computed(() => {
    const raw = this.books()?.top_name?.trim();
    if (!raw) {
      return 'Sin citas';
    }
    const match = this.catalog().find((service) => service.name.toLocaleLowerCase('es-MX') === raw.toLocaleLowerCase('es-MX'));
    return match?.name ?? raw;
  });
  protected readonly kindPicks = [
    { value: 'fixed', label: 'Fijo' },
    { value: 'variable', label: 'Variable' },
  ];
  protected readonly categoryPicks = [
    { value: 'renta', label: 'Renta' },
    { value: 'nomina', label: 'Nómina' },
    { value: 'insumos', label: 'Insumos' },
    { value: 'servicios', label: 'Luz, agua, internet' },
    { value: 'publicidad', label: 'Publicidad' },
    { value: 'otros', label: 'Otros' },
  ];
  protected readonly cadencePicks = [
    { value: 'month', label: 'Mensual' },
    { value: 'week', label: 'Semanal' },
    { value: 'day', label: 'Por día' },
  ];
  protected readonly view = signal<DashView>('income');
  /** Abre en Mes (en Día casi todo sale en $0 a media jornada) y recuerda el último periodo elegido. */
  protected readonly period = signal<'day' | 'week' | 'month' | 'range'>(savedPeriod());
  protected readonly periods = [
    { id: 'day', label: 'Día' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'range', label: 'Rango' },
  ] as const;
  protected readonly customStart = signal(iso(new Date()));
  protected readonly customEnd = signal(iso(new Date()));
  protected readonly metric = signal<'revenue' | 'count'>('revenue');
  protected readonly pickerOpen = signal(false);
  protected readonly metrics = [
    { id: 'revenue' as const, title: 'Ingresos', badge: 'Suma', text: 'El dinero de las citas del periodo.' },
    { id: 'count' as const, title: 'Citas', badge: 'Conteo', text: 'Cuántas citas hay en el periodo.' },
  ];
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly books = signal<SalesReport | null>(null);
  protected readonly previous = signal<SalesReport | null>(null);
  protected readonly goal = signal(Number(localStorage.getItem('nexia-profit-goal') || 0));
  protected readonly goalMode = signal<'money' | 'percent'>(localStorage.getItem('nexia-profit-mode') === 'percent' ? 'percent' : 'money');
  protected readonly expenseName = signal('');
  protected readonly expenseAmount = signal('');
  protected readonly expenseKind = signal<'fixed' | 'variable'>('fixed');
  protected readonly expenseCadence = signal<'month' | 'week' | 'day'>('month');
  protected readonly expenseCategory = signal('otros');

  // Corte de caja: un día a la vez (por defecto hoy).
  protected readonly cashDay = signal(iso(new Date()));
  protected readonly cash = signal<CashDay | null>(null);
  protected readonly cashCounted = signal('');
  protected readonly cashNote = signal('');
  protected readonly cashSaving = signal(false);
  protected readonly cashDiff = computed(() => {
    const counted = this.cashCounted().trim();
    return counted === '' ? null : Math.round((Number(counted) - (this.cash()?.expected_cash ?? 0)) * 100) / 100;
  });

  /** Proyección: lo cobrado más lo ya agendado de aquí al fin del periodo. */
  protected readonly projection = computed(() => {
    const row = this.books();
    if (!row || !(row.expected_count ?? 0) || this.period() === 'day') {
      return null;
    }
    const total = row.total + (row.expected_income ?? 0);
    const goal = this.goalMode() === 'money' ? this.goal() : 0;
    return { done: row.total, expected: row.expected_income ?? 0, count: row.expected_count ?? 0, total, goalPercent: goal > 0 ? Math.round((total / goal) * 100) : null };
  });
  /** Avance hacia el punto de equilibrio del periodo. */
  protected readonly breakEven = computed(() => {
    const row = this.books();
    if (!row || !(row.break_even ?? 0)) {
      return null;
    }
    const need = row.break_even ?? 0;
    return { need, visits: row.break_even_visits ?? 0, percent: Math.min(100, Math.round((row.total / need) * 100)), covered: row.total >= need, left: Math.max(0, need - row.total) };
  });
  protected readonly editingExpense = signal<number | null>(null);
  protected readonly rangeStart = signal('');
  protected readonly rangeEnd = signal('');
  protected readonly team = computed(() => {
    const staff = this.books()?.staff ?? [];
    const sum = (pick: (person: (typeof staff)[number]) => number) => staff.reduce((total, person) => total + pick(person), 0);
    const top = [...staff].sort((a, b) => b.income - a.income)[0];
    const topPay = [...staff].sort((a, b) => b.commission - a.commission)[0];
    const commission = sum((person) => person.commission);
    const paid = sum((person) => person.paid);
    return {
      count: staff.length,
      visits: sum((person) => person.visits),
      free: sum((person) => person.free_hours),
      commission,
      paid,
      owed: Math.max(0, commission - paid),
      top: top?.staff_name || 'Nadie',
      topPay: topPay?.staff_name || 'Nadie',
    };
  });
  /** Los 4 números de arriba, cada uno contra el periodo anterior. */
  protected readonly kpis = computed(() => {
    const now = this.books();
    const before = this.previous();
    if (!now) {
      return [];
    }
    return [
      { label: 'Ingresos', icon: 'trending_up', value: this.money(now.total), delta: change(now.total, before?.total) },
      { label: 'Ganancia', icon: 'savings', value: this.money(now.profit), delta: change(now.profit, before?.profit) },
      { label: 'Citas completadas', icon: 'event_available', value: String(now.completed_count), delta: change(now.completed_count, before?.completed_count) },
      { label: 'Ticket promedio', icon: 'receipt_long', value: this.money(now.average_ticket), delta: change(now.average_ticket, before?.average_ticket) },
    ];
  });
  /** Contra qué se compara: el periodo anterior o el mismo periodo del año pasado. */
  protected readonly compareTo = signal<'prev' | 'year'>('prev');
  protected readonly versus = computed(() =>
    this.compareTo() === 'year' ? 'vs. hace un año' : this.period() === 'day' ? 'vs. ayer' : this.period() === 'week' ? 'vs. semana pasada' : this.period() === 'month' ? 'vs. mes pasado' : 'vs. periodo anterior',
  );
  /** Sin nada en el periodo: se muestra un aviso en lugar de una fila de $0.00. */
  protected readonly isEmpty = computed(() => {
    const row = this.books();
    return Boolean(row) && !row!.total && !row!.completed_count && !row!.missed_count && !row!.deposit_due && !row!.expense_fixed && !row!.expense_variable;
  });
  /** Ocupación de cada colaboradora: horas ocupadas sobre horas de trabajo. */
  protected readonly occupancyRows = computed(() =>
    (this.books()?.staff ?? [])
      .filter((person) => (person.open_hours ?? 0) > 0)
      .map((person) => ({ name: person.staff_name, percent: person.occupancy ?? 0 }))
      .sort((left, right) => right.percent - left.percent),
  );
  protected readonly occupancyHint = computed(() => {
    const value = this.books()?.occupancy ?? 0;
    return value >= 85 ? 'Casi lleno: quizá te falta equipo u horario.' : value >= 50 ? 'Buen nivel de ocupación.' : 'Hay espacio: buen momento para promociones o "Les toca volver".';
  });
  protected readonly clientShare = computed(() => {
    const fresh = this.books()?.new_clients ?? 0;
    const back = this.books()?.returning_clients ?? 0;
    return { fresh, back, total: fresh + back, freshPercent: fresh + back ? Math.round((fresh / (fresh + back)) * 100) : 0 };
  });
  protected readonly topMax = computed(() => Math.max(1, ...(this.books()?.top_services ?? []).map((item) => item.income)));
  /** Mapa de calor: filas = días (lun–dom), columnas = horas con actividad (mínimo 9 a 19 h). */
  protected readonly heat = computed(() => {
    const rows = this.books()?.busy_hours ?? [];
    const hours = rows.map((item) => item.hour);
    const first = Math.min(9, ...hours);
    const last = Math.max(19, ...hours);
    const columns = Array.from({ length: last - first + 1 }, (_, index) => first + index);
    const max = Math.max(1, ...rows.map((item) => item.count));
    const count = new Map(rows.map((item) => [`${item.day}-${item.hour}`, item.count]));
    return {
      columns,
      days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label, day) => ({
        label,
        cells: columns.map((hour) => {
          const value = count.get(`${day}-${hour}`) ?? 0;
          return { hour, value, level: value / max };
        }),
      })),
      empty: rows.length === 0,
    };
  });
  /** La meta solo aparece cuando la dueña la pone ("Poner meta"). */
  protected readonly editingGoal = signal(false);
  protected readonly margin = computed(() => {
    const row = this.books();
    if (!row || row.total <= 0) {
      return 0;
    }
    return Math.round((row.profit / row.total) * 100);
  });
  protected readonly goalProgress = computed(() => {
    const profit = this.books()?.profit ?? 0;
    const total = this.books()?.total ?? 0;
    const target = this.goalMode() === 'percent' ? (total * this.goal()) / 100 : this.goal();
    if (target <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((profit / target) * 100)));
  });
  protected readonly shifts = computed(() => {
    const before = new Map((this.previous()?.staff ?? []).map((person) => [person.staff_id, person]));
    return (this.books()?.staff ?? []).map((person) => {
      const old = before.get(person.staff_id);
      return {
        ...person,
        incomeDelta: person.income - (old?.income ?? 0),
        commissionDelta: person.commission - (old?.commission ?? 0),
        hadCommission: person.percent > 0 || person.commission > 0 || (old?.commission ?? 0) > 0,
      };
    });
  });
  protected readonly gap = computed(() => {
    const profit = this.books()?.profit ?? 0;
    const total = this.books()?.total ?? 0;
    const target = this.goalMode() === 'percent' ? (total * this.goal()) / 100 : this.goal();
    return target - profit;
  });
  private readonly reloadBooks = signal(0);
  protected readonly loadError = signal<string | null>(null);
  protected readonly points = computed(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    if (this.period() === 'range') {
      return this.rangePoints();
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
    // Lo cobrado día por día sale del reporte; si no viene, de la tendencia del resumen.
    const daily = books?.daily ?? [];
    if (daily.length > 1) {
      return daily.map((day) => ({ label: this.dayLabel(day.date), amount: this.metric() === 'revenue' ? day.total : day.count }));
    }
    return this.points().map((point) => ({
      label: this.dayLabel(point.date),
      amount: this.metric() === 'revenue' ? point.revenue : point.count,
    }));
  });
  /** El periodo de comparación, día por día, alineado con el actual (día 1 con día 1). */
  protected readonly prevSeries = computed(() => {
    if (this.view() !== 'income') {
      return [];
    }
    const length = this.series().length;
    return (this.previous()?.daily ?? []).slice(0, length).map((day) => (this.metric() === 'revenue' ? day.total : day.count));
  });
  protected readonly headline = computed(() => {
    const total = this.series().reduce((sum, point) => sum + point.amount, 0);
    return this.view() === 'income' && this.metric() === 'count' ? String(total) : this.money(total);
  });
  private readonly pieColors = ['#b76e79', '#1E1B1E', '#c4a484', '#6f8f72', '#d4a0a7', '#8d8680'];
  protected readonly bars = computed(() => {
    const points = this.series();
    const max = Math.max(1, ...points.map((point) => point.amount));
    return points.map((point) => ({
      label: point.label,
      amount: point.amount,
      height: Math.round(Math.max(point.amount > 0 ? 8 : 2, (point.amount / max) * 100)),
    }));
  });
  protected readonly pieSlices = computed(() => {
    if (this.view() !== 'expenses') {
      return [];
    }
    // Por categoría cuando las hay; si todo es "otros", gasto por gasto como antes.
    const categories = Object.entries(this.books()?.by_category ?? {}).filter(([, amount]) => amount > 0);
    const labels = Object.fromEntries(this.categoryPicks.map((item) => [item.value, item.label]));
    const points = categories.some(([key]) => key !== 'otros')
      ? categories.map(([key, amount]) => ({ label: labels[key] ?? key, amount })).sort((left, right) => right.amount - left.amount)
      : this.series().filter((point) => point.amount > 0);
    const total = points.reduce((sum, point) => sum + point.amount, 0);
    if (points.length < 1 || total <= 0) {
      return [];
    }
    return points.map((point, index) => ({
      label: point.label,
      amount: point.amount,
      share: Math.round((point.amount / total) * 100),
      color: pieShade(index),
    }));
  });
  protected readonly pieGradient = computed(() => {
    const slices = this.pieSlices();
    if (slices.length === 0) {
      return 'none';
    }
    let cursor = 0;
    const stops = slices.map((slice) => {
      const start = cursor;
      cursor += slice.share;
      return `${slice.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });
  protected readonly area = computed(() => {
    const points = this.series();
    if (points.length === 0) {
      return null;
    }
    const before = this.prevSeries();
    const max = Math.max(this.metric() === 'count' ? 4 : 100, ...points.map((point) => point.amount), ...before) * 1.15;
    const left = 58;
    const top = 12;
    const plotW = 570;
    const plotH = 160;
    const base = top + plotH;
    const yOf = (amount: number) => top + plotH - (amount / max) * plotH;
    const spots =
      points.length === 1
        ? [
            { x: left, y: yOf(points[0].amount) },
            { x: left + plotW, y: yOf(points[0].amount) },
          ]
        : points.map((point, index) => ({
            x: left + (index / (points.length - 1)) * plotW,
            y: yOf(point.amount),
          }));
    const line = spots.map((spot, index) => `${index ? 'L' : 'M'}${spot.x.toFixed(1)},${spot.y.toFixed(1)}`).join(' ');
    const ticks = [0, 0.5, 1].map((step) => ({
      y: yOf(max * step),
      label: this.view() === 'income' && this.metric() === 'count' ? String(Math.round(max * step)) : this.money(Math.round(max * step)),
    }));
    const step = Math.max(1, Math.ceil(points.length / 6));
    const labels = points
      .map((point, index) => ({ x: points.length === 1 ? left + plotW / 2 : left + (index / (points.length - 1)) * plotW, label: point.label, index }))
      .filter((point) => point.index % step === 0 || point.index === points.length - 1);
    const prevLine = before.length > 1 && points.length > 1
      ? before.map((amount, index) => `${index ? 'L' : 'M'}${(left + (index / (points.length - 1)) * plotW).toFixed(1)},${yOf(amount).toFixed(1)}`).join(' ')
      : null;
    return { prevLine, line, area: `${line} L${spots.at(-1)!.x.toFixed(1)},${base} L${spots[0].x.toFixed(1)},${base} Z`, ticks, labels, base, spots, slot: points.length > 1 ? plotW / (points.length - 1) : plotW };
  });

  /** Punto de la gráfica que se tocó: muestra su monto exacto. */
  protected readonly pointAt = signal<number | null>(null);
  protected readonly pointInfo = computed(() => {
    const index = this.pointAt();
    const chart = this.area();
    const points = this.series();
    if (index === null || !chart || !points[index]) {
      return null;
    }
    const value = this.view() === 'income' && this.metric() === 'count' ? String(points[index].amount) : this.money(points[index].amount);
    return { ...chart.spots[index], label: points[index].label, value };
  });

  /** Tabla por colaboradora: lo que deja por hora trabajada, ocupación, propinas, faltas y cuántas clientas regresan. */
  protected readonly staffTable = computed(() =>
    (this.books()?.staff ?? []).map((person) => {
      const worked = Math.max(0, (person.open_hours ?? 0) - person.free_hours);
      return {
        ...person,
        perHour: worked > 0 ? person.income / worked : 0,
        returnShare: person.clients ? Math.round(((person.returning ?? 0) / person.clients) * 100) : null,
      };
    }),
  );

  /** Faltas y cancelaciones sobre todas las citas que debían ocurrir en el periodo. */
  protected readonly misses = computed(() => {
    const row = this.books();
    if (!row) {
      return null;
    }
    const lost = (row.cancelled_count ?? 0) + (row.no_show_count ?? 0);
    const due = row.completed_count + lost;
    return { cancelled: row.cancelled_count ?? 0, noShow: row.no_show_count ?? 0, rate: due ? Math.round((lost / due) * 100) : 0, money: row.missed_amount };
  });

  /** Clientas: re-reserva, valor promedio, descuentos y de dónde llegan las citas. */
  protected readonly loyalty = computed(() => {
    const row = this.books();
    if (!row) {
      return null;
    }
    const sources = row.by_source ?? {};
    const made = Object.values(sources).reduce((sum, value) => sum + value, 0);
    return {
      rebook: row.completed_count ? Math.round(((row.rebooked ?? 0) / row.completed_count) * 100) : null,
      value: row.client_value ?? 0,
      discounts: row.discount_count ?? 0,
      discountAmount: row.discount_amount ?? 0,
      page: made ? Math.round(((sources['page'] ?? 0) / made) * 100) : null,
      made,
      known: (sources['page'] ?? 0) + (sources['admin'] ?? 0),
      lead: row.lead_days ?? null,
    };
  });

  /** Últimos 12 meses en barras. */
  protected readonly yearBars = computed(() => {
    const months = this.books()?.months ?? [];
    const max = Math.max(1, ...months.map((item) => item.total));
    const name = new Intl.DateTimeFormat('es-MX', { month: 'short' });
    return months.map((item) => ({
      ...item,
      label: name.format(new Date(`${item.month}-15T12:00:00`)).replace('.', ''),
      height: Math.max(item.total > 0 ? 4 : 1, Math.round((item.total / max) * 100)),
    }));
  });
  protected readonly yearTotal = computed(() => (this.books()?.months ?? []).reduce((sum, item) => sum + item.total, 0));

  /** Gastos por categoría: % de los ingresos y cambio contra el periodo anterior. */
  protected readonly categoryRows = computed(() => {
    const row = this.books();
    const before = this.previous()?.by_category ?? {};
    const labels = Object.fromEntries(this.categoryPicks.map((item) => [item.value, item.label]));
    return Object.entries(row?.by_category ?? {})
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({
        label: labels[key] ?? key,
        amount,
        share: row && row.total > 0 ? Math.round((amount / row.total) * 100) : null,
        delta: amount - (before[key] ?? 0),
      }))
      .sort((left, right) => right.amount - left.amount);
  });

  /** Pago (o abono) de comisión: se guarda el total pagado del periodo. */
  protected readonly payDraft = signal<Record<number, string>>({});

  protected typePay(staffId: number, value: string): void {
    this.payDraft.update((draft) => ({ ...draft, [staffId]: value }));
  }

  protected pay(person: { staff_id: number; commission: number; paid: number }): void {
    const typed = Number(this.payDraft()[person.staff_id] ?? this.owed(person.commission, person.paid));
    if (!(typed > 0)) {
      return;
    }
    this.markPaid(person.staff_id, Math.min(person.commission, person.paid + typed), true);
    this.payDraft.update((draft) => ({ ...draft, [person.staff_id]: '' }));
  }

  /** Recibo para mandarle por WhatsApp: periodo, citas, comisión, propinas y lo pagado. */
  protected receipt(person: { staff_name: string; visits: number; income: number; percent: number; commission: number; paid: number; tips?: number }): string {
    const text = [
      `Hola ${person.staff_name.split(' ')[0]}, este es tu resumen del ${this.rangeStart()} al ${this.rangeEnd()}:`,
      `• Citas: ${person.visits}`,
      `• Vendiste: ${this.money(person.income)}`,
      `• Comisión (${person.percent}%): ${this.money(person.commission - (person.tips ?? 0))}`,
      person.tips ? `• Propinas: ${this.money(person.tips)}` : '',
      `• Total: ${this.money(person.commission)}`,
      `• Pagado: ${this.money(person.paid)}`,
      `• Pendiente: ${this.money(this.owed(person.commission, person.paid))}`,
    ].filter(Boolean).join('\n');
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  /** CSV del año para el contador: por mes, ingresos por método y gastos por categoría. */
  protected downloadAccounting(): void {
    const year = new Date().getFullYear();
    this.shop
      .accounting(year)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((months) => {
        const methods = [...new Set(months.flatMap((row) => Object.keys(row.by_method)))];
        const categories = [...new Set(months.flatMap((row) => Object.keys(row.by_category)))];
        const catLabels = Object.fromEntries(this.categoryPicks.map((item) => [item.value, item.label]));
        const head = ['Mes', ...methods.map((key) => `Cobrado ${METHOD_LABELS[key] ?? key}`), 'Servicios', 'Productos', 'Ingresos', ...categories.map((key) => `Gasto ${catLabels[key] ?? key}`), 'Gastos', 'Comisiones', 'Propinas (aparte)', 'Ganancia'];
        const rows = months.map((row) => [
          row.month, ...methods.map((key) => row.by_method[key] ?? 0), row.service_income, row.product_income, row.total,
          ...categories.map((key) => row.by_category[key] ?? 0), row.expenses, row.commissions, row.tips, row.profit,
        ]);
        const csv = [head, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
        link.download = `contador-${year}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
  }

  protected percentOf(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  constructor() {
    // El corte de caja se carga al abrir su pestaña.
    effect(() => {
      if (this.view() === 'cash' && !this.cash()) {
        this.loadCash();
      }
    });
    effect(() => {
      const value = this.period();
      try {
        localStorage.setItem('nexia-report-period', value);
      } catch {
        // Sin almacenamiento (modo privado): solo no se recuerda.
      }
    });
    effect(() => {
      this.reloadBooks();
      this.customStart();
      this.customEnd();
      const today = new Date();
      const todayKey = iso(today);
      let start = todayKey;
      let end = todayKey;
      if (this.period() === 'range') {
        start = this.customStart() || todayKey;
        end = this.customEnd() || todayKey;
        if (start > end) {
          const swap = start;
          start = end;
          end = swap;
        }
      } else if (this.period() === 'week') {
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 6);
        start = iso(startDate);
      } else if (this.period() === 'month') {
        start = iso(new Date(today.getFullYear(), today.getMonth(), 1));
      }
      this.rangeStart.set(start);
      this.rangeEnd.set(end);
      const prev =
        this.compareTo() === 'year'
          ? { start: yearAgo(start), end: yearAgo(end) }
          : this.period() === 'range'
            ? previousSpan(start, end)
            : previousRange(this.period(), today);
      const prices = new Map(this.catalog().map((service) => [service.id, service.price]));
      const trend = [...(this.summary()?.month_trend ?? []), ...(this.summary()?.week_trend ?? [])];
      forkJoin({
        current: this.shop.report(start, end),
        previous: this.shop.report(prev.start, prev.end),
        days: this.period() === 'range' ? this.appointmentsApi.getAppointments({ start_date: start, end_date: end }) : of([] as Appointment[]),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(({ current, previous, days }) => {
          this.books.set(current);
          this.pointAt.set(null);
          this.previous.set(previous);
          this.rangePoints.set(this.period() === 'range' ? dailyCut(start, end, trend, days, prices) : []);
        });
    });
    effect(() => {
      const pays = (this.books()?.staff ?? []).some((person) => person.percent > 0);
      if (!pays && this.view() === 'commission') {
        this.view.set('income');
      }
    });
    this.servicesApi.getServices().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((rows) => this.catalog.set(rows));
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
    this.expenseCategory.set(item.category || 'otros');
  }

  protected loadCash(day = this.cashDay()): void {
    this.cashDay.set(day);
    this.shop.getCash(day).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.cash.set(data);
      this.cashCounted.set(data.count ? String(data.count.counted) : '');
      this.cashNote.set(data.count?.note ?? '');
    });
  }

  protected saveCash(): void {
    const counted = Number(this.cashCounted());
    if (this.cashCounted().trim() === '' || Number.isNaN(counted) || counted < 0) {
      return;
    }
    this.cashSaving.set(true);
    this.shop.saveCash(this.cashDay(), counted, this.cashNote()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.cash.set(data);
        this.cashSaving.set(false);
        this.toasts.show('Corte de caja guardado.');
      },
      error: () => this.cashSaving.set(false),
    });
  }

  protected methodLabel(key: string): string {
    return METHOD_LABELS[key] ?? key;
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
      ? this.shop.updateExpense(editing, name, amount, this.expenseKind(), cadence, this.expenseCategory())
      : this.shop.addExpense(name, amount, this.expenseKind(), cadence, this.expenseCategory());
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

  protected kpiTone(delta: { up: boolean | null }): string {
    return delta.up === null ? 'text-muted' : delta.up ? 'text-(--nx-ok-fg)' : 'text-(--nx-bad-fg)';
  }


  protected expenseShare(): number {
    const row = this.books();
    if (!row || row.total <= 0) {
      return 0;
    }
    return Math.round(((row.expense_fixed + row.expense_variable) / row.total) * 100);
  }

  protected methodRows(rows: Record<string, number> | undefined): { label: string; amount: number }[] {
    return Object.entries(rows ?? {})
      .map(([key, amount]) => ({ label: METHOD_LABELS[key] ?? key, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  protected money(amount: number): string {
    return this.currency.format(amount);
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

  protected legend(): string {
    if (this.view() === 'staff') {
      return `Ingreso de cada ${this.copy.text().person.toLowerCase()}`;
    }
    if (this.view() === 'commission') {
      return `Comisión de cada ${this.copy.text().person.toLowerCase()}`;
    }
    if (this.view() === 'expenses') {
      return 'Monto de cada gasto';
    }
    return this.metric() === 'count' ? 'Número de citas' : 'Ingresos de las citas completadas';
  }

  protected chartCaption(): string {
    if (this.view() === 'staff' || this.view() === 'commission') {
      return `Cada ${this.copy.text().person.toLowerCase()} del periodo`;
    }
    if (this.view() === 'expenses') {
      return 'Cada gasto del periodo';
    }
    if (this.period() === 'range') {
      return `${this.rangeStart()} a ${this.rangeEnd()}`;
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
    return this.tabs().find((item) => item.id === this.view())?.label ?? 'Ingresos';
  }

  protected isToday(value: string): boolean {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return value === `${now.getFullYear()}-${month}-${day}`;
  }

  protected agendaQuery(kind: 'missed' | 'deposit'): Record<string, string> {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    const from = new Date(`${start}T12:00:00`);
    const to = new Date(`${end}T12:00:00`);
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    return { estado: kind, dia: start, vista: days <= 1 ? 'day' : days <= 7 ? 'week' : 'month' };
  }

  protected deltaText(amount: number): string {
    const name = this.period() === 'day' ? 'ayer' : this.period() === 'week' ? 'la semana pasada' : this.period() === 'month' ? 'el mes pasado' : 'el periodo anterior';
    if (amount === 0) {
      return `Igual que ${name}`;
    }
    return `${amount > 0 ? '+' : '−'}${this.money(Math.abs(amount))} vs ${name}`;
  }

  protected pickMetric(id: 'revenue' | 'count'): void {
    this.metric.set(id);
    this.pickerOpen.set(false);
  }

  protected downloadExcel(all: boolean): void {
    const sheets = all ? this.reportSheets() : [this.reportSheets().find((sheet) => sheet.name === this.sheetName()) ?? this.reportSheets()[0]];
    downloadExcel(`nexia-${all ? 'dashboard' : this.view()}-${this.rangeStart()}.xls`, sheets);
  }

  protected downloadPdf(): void {
    const shop = this.auth.currentUser()?.businessName ?? 'Negocio';
    const period = this.period() === 'day' ? 'Día' : this.period() === 'week' ? 'Semana' : this.period() === 'range' ? 'Rango' : 'Mes';
    const target = this.goalMode() === 'percent' ? `${this.goal()}%` : this.money(this.goal());
    downloadPdf(
      `nexia-reporte-${this.rangeStart()}.pdf`,
      `Reporte · ${shop}`,
      `${period} ${this.rangeStart()} a ${this.rangeEnd()}`,
      this.reportSheets(),
      {
        goal: this.goal() > 0 ? `Meta ${target} · ${this.goalProgress()}% cubierta · ganancia ${this.money(this.books()?.profit ?? 0)}` : `Ganancia ${this.money(this.books()?.profit ?? 0)}`,
        chart: this.series().map((point) => ({ label: point.label, amount: point.amount })),
      },
    );
  }

  private sheetName(): string {
    if (this.view() === 'staff') {
      return 'Colaboradores';
    }
    if (this.view() === 'commission') {
      return 'Comisiones';
    }
    if (this.view() === 'expenses') {
      return 'Gastos';
    }
    return 'Ingresos';
  }

  private reportSheets(): ReportSheet[] {
    const row = this.books();
    const money = (amount: number) => this.money(amount);
    const staff = row?.staff ?? [];
    const expenses = row?.expenses ?? [];
    const trend = this.period() === 'month' ? (this.summary()?.month_trend ?? []) : this.period() === 'day' ? this.points() : (this.summary()?.week_trend ?? []);
    return [
      {
        name: 'Ingresos',
        rows: [
          ['Concepto', 'Valor'],
          ['Periodo', `${this.rangeStart()} a ${this.rangeEnd()}`],
          ['Ingresos', row ? money(row.total) : 0],
          ['Citas completadas', row?.completed_count ?? 0],
          ['Ticket promedio', row ? money(row.average_ticket) : 0],
          ['No se hicieron', row?.missed_count ?? 0],
          ['Monto no cobrado', row ? money(row.missed_amount) : 0],
          ['Anticipos por cobrar', row ? money(row.deposit_due) : 0],
          ['Ganancia', row ? money(row.profit) : 0],
          ['Servicio más pedido', this.topService()],
          [],
          ['Fecha', 'Citas', 'Ingresos'],
          ...trend.map((point) => [point.date, point.count, money(point.revenue)]),
        ],
      },
      {
        name: 'Colaboradores',
        rows: [['Colaborador', 'Ingresos', 'Visitas', 'Ticket'], ...staff.map((person) => [person.staff_name, money(person.income), person.visits, money(person.ticket)])],
      },
      {
        name: 'Comisiones',
        rows: [
          ['Colaborador', 'Porcentaje', 'Comisión', 'Pagado', 'Por pagar'],
          ...staff.map((person) => [person.staff_name, `${person.percent}%`, money(person.commission), money(person.paid), money(this.owed(person.commission, person.paid))]),
        ],
      },
      {
        name: 'Gastos',
        rows: [
          ['Gasto', 'Tipo', 'Cadencia', 'Monto'],
          ...expenses.map((item) => [item.name, item.kind === 'fixed' ? 'Fijo' : 'Variable', item.kind === 'fixed' ? cadenceLabel(item.cadence) : '-', money(item.amount)]),
          [],
          ['Fijos', row ? money(row.expense_fixed) : 0],
          ['Variables', row ? money(row.expense_variable) : 0],
        ],
      },
    ];
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

function dailyCut(start: string, end: string, trend: WeekTrendPoint[], rows: Appointment[], prices: Map<number, number>): WeekTrendPoint[] {
  const known = new Map(trend.map((point) => [point.date, point]));
  const extra = new Map<string, { count: number; revenue: number }>();
  for (const item of rows) {
    if (item.status !== 'completed') {
      continue;
    }
    const date = item.starts_at.slice(0, 10);
    const slot = extra.get(date) ?? { count: 0, revenue: 0 };
    slot.count += 1;
    slot.revenue += item.quoted_price ?? prices.get(item.service_id) ?? 0;
    extra.set(date, slot);
  }
  const days: WeekTrendPoint[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && days.length < 93) {
    const date = iso(cursor);
    const hit = known.get(date);
    const built = extra.get(date);
    days.push(hit ?? { date, count: built?.count ?? 0, revenue: built?.revenue ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function savedPeriod(): 'day' | 'week' | 'month' | 'range' {
  try {
    const value = localStorage.getItem('nexia-report-period');
    return value === 'day' || value === 'week' || value === 'range' ? value : 'month';
  } catch {
    return 'month';
  }
}

/** "↑ 18%" contra el periodo anterior; sin dato anterior no se compara. */
function change(now: number, before: number | null | undefined): { text: string; up: boolean | null } {
  if (!before) {
    return { text: now ? 'Sin dato anterior' : '—', up: null };
  }
  const percent = Math.round(((now - before) / Math.abs(before)) * 100);
  if (percent === 0) {
    return { text: 'Igual', up: null };
  }
  return { text: `${percent > 0 ? '↑' : '↓'} ${Math.abs(percent)}%`, up: percent > 0 };
}

function yearAgo(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(month === 2 && date === 29 ? 28 : date).padStart(2, '0')}`;
}

function previousSpan(start: string, end: string): { start: string; end: string } {
  const from = new Date(`${start}T12:00:00`);
  const to = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevEnd = new Date(from);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start: iso(prevStart), end: iso(prevEnd) };
}

function previousRange(period: 'day' | 'week' | 'month' | 'range', today: Date): { start: string; end: string } {
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

function pieShade(index: number): string {
  const mixes = [100, 70, 45, 25];
  const mix = mixes[index % mixes.length];
  return `color-mix(in srgb, var(--color-ink) ${mix}%, white)`;
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
