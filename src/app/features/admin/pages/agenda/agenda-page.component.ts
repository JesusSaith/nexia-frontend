import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Confirm } from '@shared/components/confirm/confirm';
import { Component, DestroyRef, TemplateRef, computed, effect, inject, signal, viewChild, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin, interval, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { Progress, appointmentProgress, attendanceState } from '@core/appointment-progress';
import { staffColorOf } from '@core/staff-colors';
import { ALL_METHODS, PAYMENT_METHODS } from '@core/payment-methods';
import { MessageVars, firstName, longDay, whatsappLink } from '@core/message-templates';
import { Toasts } from '@core/toasts';
import { Appointment, AppointmentStatus } from '@core/models/appointment.model';
import { ScheduleItem } from '@core/models/schedule.model';
import { Service } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { DateFieldComponent, PickFieldComponent, TimeFieldComponent } from '@shared/components/when-field/when-field';
import { AgendaService } from '@core/services/agenda.service';
import { AppointmentsService, StatusCharge, TimeBlock } from '@core/services/appointments.service';
import { ShopProduct, ShopService } from '@core/services/shop.service';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { ReviewsService } from '@core/services/reviews.service';
import { SchedulesService } from '@core/services/schedules.service';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';

type CalendarView = 'month' | 'week' | 'day';

interface DateRange {
  start: string;
  end: string;
}

interface SelectedAppointment {
  appointment: Appointment;
  x: number;
  y: number;
  maxHeight: number;
  history: string[];
}

// Rango de la cuadrícula si aún no hay horarios; luego se ajusta a los horarios y citas.
const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;
const VIEW_KEY = 'nexia-agenda-view';
const SLOT_HEIGHT = 28;
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
@Component({
  selector: 'app-agenda-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    DateFieldComponent,
    TimeFieldComponent,
    PickFieldComponent,
  ],
  templateUrl: './agenda-page.component.html',
})
export class AgendaPageComponent {
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(Confirm);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly booking = inject(BookingService);
  private readonly shopApi = inject(ShopService);
  private openRequest = 0;
  /** ?cita=ID abre la ficha una sola vez (no en cada recarga). */
  private citaOpened = false;
  /** Teléfono que llega por ?tel= para prellenar la nueva cita en cuanto carguen los clientes. */
  private pendingTel: string | null = null;

  protected photoIndexes(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
  }

  protected referencePhoto(token: string, index: number): string {
    return this.booking.referencePhotoUrl(token, index);
  }
  private readonly toasts = inject(Toasts);
  protected readonly copy = inject(BusinessCopy);
  protected readonly petName = signal('');
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly servicesApi = inject(ServicesService);
  private readonly staffApi = inject(StaffService);
  private readonly schedulesApi = inject(SchedulesService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private dialogRef: MatDialogRef<unknown> | null = null;
  private requestId = 0;
  private readonly ownStaffReady = signal(!inject(AuthService).isStaff());
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

  protected readonly views: { id: CalendarView; label: string }[] = [
    { id: 'month', label: 'Mes' },
    { id: 'week', label: 'Semana' },
    { id: 'day', label: 'Día' },
  ];
  protected readonly weekdayLabels = WEEKDAY_LABELS;

  protected readonly isStaff = this.auth.isStaff;
  protected readonly focus = signal<'missed' | 'deposit' | null>(null);
  // Abre en la última vista elegida; la primera vez, Día en celular y Semana en escritorio.
  protected readonly currentView = signal<CalendarView>(readView() ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'));
  /** Hora actual, al minuto: línea de "ahora" en Día y Semana. */
  protected readonly now = signal(Date.now());
  private scrolledToNow = false;
  protected readonly openTimes = signal<string[]>([]);
  protected readonly holdHours = signal(3);
  protected readonly depositRules = signal<{ account: string | null; amount: number | null; percent: number | null }>({
    account: null,
    amount: null,
    percent: null,
  });
  protected readonly exporting = signal(false);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly linkCopied = signal(false);
  protected readonly monthService = computed(() => this.pickedService()?.name ?? '');
  protected readonly cursor = signal(startOfDay(new Date()));
  protected readonly serviceId = signal<number | null>(null);
  protected readonly staffId = signal<number | null>(null);
  protected readonly services = signal<Service[]>([]);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly schedules = signal<ReadonlyMap<number, ScheduleItem[]>>(new Map());
  protected readonly appointments = signal<Appointment[]>([]);
  protected readonly blocks = signal<TimeBlock[]>([]);
  protected readonly blocking = signal(false);
  protected readonly blockSaving = signal(false);
  protected readonly blockError = signal<string | null>(null);
  private readonly agendaApi = inject(AgendaService);
  protected readonly blockStaff = computed(() =>
    this.staff()
      .filter((member) => member.is_active)
      .map((member) => ({ value: member.id, label: member.full_name })),
  );
  protected readonly repeatPicks = [
    { value: 'day', label: 'Solo este día' },
    { value: 'weekdays', label: 'Lun a vie de esta semana' },
    { value: 'weeks', label: 'Lun a vie, 4 semanas' },
    { value: 'always', label: 'Siempre, lun a vie' },
  ];
  protected readonly blockForm = new FormGroup({
    staff_id: new FormControl<number | null>(null, Validators.required),
    date: new FormControl('', { nonNullable: true, validators: Validators.required }),
    start: new FormControl('14:00', { nonNullable: true, validators: Validators.required }),
    end: new FormControl('15:00', { nonNullable: true, validators: Validators.required }),
    note: new FormControl('Hora de comida', { nonNullable: true }),
    repeat: new FormControl<'day' | 'weekdays' | 'weeks' | 'always'>('day', { nonNullable: true }),
  });
  protected readonly selected = signal<SelectedAppointment | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly slotTimes = signal<string[]>([]);
  protected readonly slotsReady = signal(false);
  protected readonly guests = signal<{ phone: string; visit_count: number; total_spent: number; cancel_count: number; full_name: string }[]>([]);
  protected readonly known = signal<{ visit_count: number; total_spent: number; cancel_count: number; full_name: string } | null>(null);
  protected readonly freshPhone = signal(false);
  protected readonly freed = signal<{ name: string; href: string }[]>([]);
  private readonly pesosFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  protected readonly bookableDay = (iso: string): boolean => {
    const staffId = this.form.controls.staff_id.value;
    if (staffId == null) {
      return false;
    }
    const day = new Date(`${iso}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return day >= today && this.workingWindow(staffId, day) !== null;
  };

  protected readonly form = new FormGroup({
    service_id: new FormControl<number | null>(null, Validators.required),
    staff_id: new FormControl<number | null>(null, Validators.required),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    client_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    client_phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    client_email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    quoted_price: new FormControl('', { nonNullable: true }),
    waive_deposit: new FormControl(false, { nonNullable: true }),
  });

  protected readonly activeServices = computed(() => this.services().filter((item) => item.is_active));
  protected readonly servicePicks = computed(() => [
    { value: null, label: 'Elegir' },
    ...this.activeServices().map((item) => ({ value: item.id, label: item.name })),
  ]);
  protected readonly staffPicks = computed(() => [
    { value: null, label: 'Elegir' },
    ...this.staff()
      .filter((member) => member.is_active)
      .map((member) => ({ value: member.id, label: member.full_name })),
  ]);
  protected readonly filterServices = computed(() => [
    { value: '', label: 'Todos los servicios' },
    ...this.activeServices().map((item) => ({ value: item.id, label: item.name })),
  ]);
  protected readonly filterStaff = computed(() => [
    { value: '', label: 'Todo el equipo' },
    ...this.staff()
      .filter((member) => member.is_active)
      .map((member) => ({ value: member.id, label: member.full_name })),
  ]);
  protected readonly weekDays = computed(() => {
    const start = startOfWeek(this.cursor());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  });
  protected readonly monthWeeks = computed(() => buildMonthWeeks(this.cursor()));
  protected readonly visibleStaff = computed(() => {
    const selectedStaff = this.staffId();
    return this.staff().filter(
      (member) => member.is_active && (selectedStaff === null || member.id === selectedStaff),
    );
  });
  protected readonly periodLabel = computed(() => formatPeriod(this.currentView(), this.cursor(), this.weekDays()));
  private readonly range = computed<DateRange>(() => {
    const view = this.currentView();
    const cursor = this.cursor();
    if (view === 'day') {
      const day = toInputDate(cursor);
      return { start: day, end: day };
    }
    if (view === 'week') {
      const days = this.weekDays();
      return { start: toInputDate(days[0]), end: toInputDate(days[6]) };
    }
    const weeks = this.monthWeeks();
    const last = weeks[weeks.length - 1];
    return { start: toInputDate(weeks[0][0]), end: toInputDate(last[6]) };
  });

  /**
   * Horas que abarca la cuadrícula: del turno más temprano al más tarde del equipo visible,
   * ampliado si hay citas fuera de turno. Así una cita a las 7:00 o a las 21:00 no se encima.
   */
  private readonly dayBounds = computed(() => {
    let start = Infinity;
    let end = -Infinity;
    for (const member of this.visibleStaff()) {
      for (const row of this.schedules().get(member.id) ?? []) {
        if (row.is_active) {
          start = Math.min(start, minutesOf(row.start_time));
          end = Math.max(end, minutesOf(row.end_time));
        }
      }
    }
    for (const item of this.appointments()) {
      const begin = parseTimestamp(item.starts_at);
      const minutes = begin.getHours() * 60 + begin.getMinutes();
      start = Math.min(start, minutes);
      end = Math.max(end, minutes + this.durationMinutes(item));
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return { start: DAY_START_MINUTES, end: DAY_END_MINUTES };
    }
    return { start: Math.floor(start / 60) * 60, end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
  });
  protected readonly slots = computed(() => {
    const { start, end } = this.dayBounds();
    return Array.from({ length: (end - start) / SLOT_MINUTES }, (_, index) => start + index * SLOT_MINUTES);
  });
  protected readonly gridHeight = computed(() => this.slots().length * SLOT_HEIGHT);

  /**
   * Citas que coinciden en hora van lado a lado: cada una recibe su carril dentro del grupo.
   * En Semana se agrupa por día (todo el equipo en una columna); en Día, por día y colaboradora.
   */
  private readonly lanes = computed(() => {
    const byDay = new Map<string, Appointment[]>();
    const byStaff = new Map<string, Appointment[]>();
    for (const item of this.appointments()) {
      const day = item.starts_at.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
      byStaff.set(`${day}|${item.staff_id}`, [...(byStaff.get(`${day}|${item.staff_id}`) ?? []), item]);
    }
    const week = new Map<number, { lane: number; lanes: number }>();
    const day = new Map<number, { lane: number; lanes: number }>();
    byDay.forEach((items) => this.packLanes(items, week));
    byStaff.forEach((items) => this.packLanes(items, day));
    return { week, day };
  });

  private packLanes(items: Appointment[], out: Map<number, { lane: number; lanes: number }>): void {
    const spans = items
      .map((item) => {
        const start = parseTimestamp(item.starts_at).getTime();
        return { id: item.id, start, end: start + this.durationMinutes(item) * 60_000 };
      })
      .sort((left, right) => left.start - right.start || left.end - right.end);
    let group: { id: number; lane: number }[] = [];
    let laneEnds: number[] = [];
    let groupEnd = -Infinity;
    const close = () => group.forEach((row) => out.set(row.id, { lane: row.lane, lanes: laneEnds.length }));
    for (const span of spans) {
      if (span.start >= groupEnd) {
        close();
        group = [];
        laneEnds = [];
      }
      let lane = laneEnds.findIndex((end) => end <= span.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(span.end);
      } else {
        laneEnds[lane] = span.end;
      }
      group.push({ id: span.id, lane });
      groupEnd = Math.max(groupEnd, span.end);
    }
    close();
  }

  /** Posición horizontal de la cita dentro de su columna. */
  protected laneStyle(item: Appointment, view: 'week' | 'day'): { left: string; width: string } {
    const row = this.lanes()[view].get(item.id) ?? { lane: 0, lanes: 1 };
    return { left: `calc(${(row.lane / row.lanes) * 100}% + 2px)`, width: `calc(${100 / row.lanes}% - 4px)` };
  }

  /** Línea de "ahora" si el día se ve en pantalla. */
  protected nowTop(day: Date): string | null {
    const now = new Date(this.now());
    if (toInputDate(day) !== toInputDate(now)) {
      return null;
    }
    const { start, end } = this.dayBounds();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < start || minutes > end) {
      return null;
    }
    return `${((minutes - start) / (end - start)) * 100}%`;
  }

  /** Marca de "ahora" en la columna de horas (sirve también para bajar la pantalla hasta ahí). */
  protected gutterNow(): string | null {
    const today = new Date(this.now());
    if (this.currentView() === 'day') {
      return this.nowTop(this.cursor());
    }
    return this.weekDays().some((day) => toInputDate(day) === toInputDate(today)) ? this.nowTop(today) : null;
  }

  /** Posición vertical de una hora (minutos del día) en la cuadrícula. */
  protected hourTop(minutes: number): number {
    return ((minutes - this.dayBounds().start) / SLOT_MINUTES) * SLOT_HEIGHT;
  }

  constructor() {
    const estado = this.route.snapshot.queryParamMap.get('estado');
    if (estado === 'missed' || estado === 'deposit') {
      this.focus.set(estado);
    }
    const vista = this.route.snapshot.queryParamMap.get('vista');
    if (vista === 'day' || vista === 'week' || vista === 'month') {
      this.currentView.set(vista);
    }
    // ?nueva=1 (botón "Nueva cita" de Inicio): abre el formulario en cuanto carga el equipo.
    if (this.route.snapshot.queryParamMap.get('nueva')) {
      const opener = effect(() => {
        if (this.staff().length) {
          untracked(() => {
            this.openCreate();
            this.prefillFromUrl();
          });
          opener.destroy();
        }
      });
    }
    const dia = this.route.snapshot.queryParamMap.get('dia');
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      this.cursor.set(new Date(`${dia}T12:00:00`));
    }
    // ?cita=ID sin ?dia (Avisos, correos): se busca la cita y la agenda salta a su día.
    const citaId = Number(this.route.snapshot.queryParamMap.get('cita'));
    if (citaId && !dia) {
      this.appointmentsApi
        .getAppointment(citaId)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of(null)),
        )
        .subscribe((found) => {
          if (found) {
            this.cursor.set(new Date(`${found.starts_at.slice(0, 10)}T12:00:00`));
          }
        });
    }
    this.destroyRef.onDestroy(() => this.dialogRef?.close());
    this.loadCatalog();
    this.booking
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((brand) => {
        this.holdHours.set(brand.deposit_hold_hours || 3);
        this.acceptedMethods.set(brand.payment_methods?.length ? brand.payment_methods : ALL_METHODS);
        this.depositRules.set({
          account: brand.deposit_account ?? null,
          amount: brand.deposit_amount ?? null,
          percent: brand.deposit_percent ?? null,
        });
      });
    effect(() => {
      if (!this.ownStaffReady()) {
        return;
      }
      const range = this.range();
      const staffId = this.staffId();
      const serviceId = this.serviceId();
      this.loadAppointments(range, staffId, serviceId);
    });
    this.form.valueChanges
      .pipe(
        map((value) => `${value.service_id ?? ''}|${value.staff_id ?? ''}|${value.date}`),
        distinctUntilChanged(),
        switchMap((key) => {
          const [serviceId, staffId, date] = key.split('|');
          const slug = this.auth.currentUser()?.slug;
          if (!slug || !serviceId || !staffId || !date) {
            return of(null);
          }
          return this.booking.getAvailability(slug, Number(serviceId), Number(staffId), date).pipe(
            map((rows) => rows.map((row) => row.starts_at.slice(11, 16))),
            catchError(() => of([] as string[])),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((times) => {
        this.slotsReady.set(times !== null);
        this.slotTimes.set(times ?? []);
        const current = this.form.controls.time.value;
        if (current && times && !times.includes(current)) {
          this.form.controls.time.setValue('', { emitEvent: false });
        }
      });
    interval(20000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.now.set(Date.now());
        if (this.ownStaffReady()) {
          this.loadAppointments(this.range(), this.staffId(), this.serviceId(), true);
        }
      });
    effect(() => {
      const slug = this.auth.currentUser()?.slug;
      const service = this.pickedService();
      const member = this.pickedStaff();
      const day = this.dayKey(this.cursor());
      if (!slug || !service || !member) {
        this.openTimes.set([]);
        return;
      }
      const request = ++this.openRequest;
      this.booking
        .getAvailability(slug, service.id, member.id, day)
        .pipe(
          map((rows) => rows.map((row) => row.starts_at.slice(11, 16))),
          catchError(() => of([] as string[])),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((times) => {
          if (request === this.openRequest) {
            this.openTimes.set(times);
          }
        });
    });
  }

  protected setView(view: CalendarView): void {
    this.currentView.set(view);
    this.selected.set(null);
    this.scrolledToNow = false;
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Sin almacenamiento, la próxima vez abre en la vista de siempre.
    }
  }

  protected shift(direction: -1 | 1): void {
    const cursor = this.cursor();
    if (this.currentView() === 'month') {
      this.cursor.set(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
    } else if (this.currentView() === 'week') {
      this.cursor.set(addDays(cursor, 7 * direction));
    } else {
      this.cursor.set(addDays(cursor, direction));
    }
    this.selected.set(null);
  }

  protected goToday(): void {
    this.cursor.set(startOfDay(new Date()));
    this.selected.set(null);
    this.scrolledToNow = false;
  }

  protected onService(value: number | ''): void {
    this.serviceId.set(value === '' ? null : value);
    this.selected.set(null);
  }

  protected readonly clientNotice = signal<string | null>(null);
  /** Tras cobrar: WhatsApp listo para pedir la opinión del cliente. */
  protected readonly reviewNotice = signal<{ name: string; href: string } | null>(null);

  protected pickFilterService(value: string | number | null): void {
    this.onService(typeof value === 'number' ? value : '');
  }

  protected pickFilterStaff(value: string | number | null): void {
    this.onStaff(typeof value === 'number' ? value : '');
  }

  protected onStaff(value: number | ''): void {
    if (this.isStaff()) {
      return;
    }
    this.staffId.set(value === '' ? null : value);
    this.selected.set(null);
  }

  protected openAtTime(label: string): void {
    const [hour, minute] = label.split(':').map(Number);
    this.openCreateAt(this.cursor(), hour * 60 + minute);
  }

  protected exportMonth(): void {
    const slug = this.auth.currentUser()?.slug;
    const service = this.pickedService();
    const member = this.pickedStaff();
    const members = (this.staffId() === null ? this.staff().filter((person) => person.is_active) : [member]).filter(
      (person): person is Staff => !!person,
    );
    if (!slug || !service || members.length === 0 || this.exporting()) {
      return;
    }
    const cursor = this.cursor();
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: count }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), index + 1));
    const many = members.length > 1;
    this.exporting.set(true);
    forkJoin({
      brand: this.booking.getPublicBusiness(slug).pipe(catchError(() => of(null))),
      rows: forkJoin(
        members.flatMap((person) =>
          days.map((day) =>
            this.booking.getAvailability(slug, service.id, person.id, this.dayKey(day)).pipe(
              map((slots) => ({
                id: person.id,
                name: person.full_name.split(' ')[0],
                key: this.dayKey(day),
                clocks: (person.slot_times ?? '').split(',').map((part) => part.trim()).filter(Boolean),
                free: slots.map((row) => row.starts_at.slice(11, 16)),
              })),
              catchError(() =>
                of({
                  id: person.id,
                  name: person.full_name.split(' ')[0],
                  key: this.dayKey(day),
                  clocks: [] as string[],
                  free: [] as string[],
                }),
              ),
            ),
          ),
        ),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ brand, rows }) => {
          const sheets = days.map((day) => {
            const free: string[] = [];
            const taken: string[] = [];
            let open = false;
            for (const person of members) {
              const row = rows.find((item) => item.id === person.id && item.key === this.dayKey(day));
              const slots = row?.free ?? [];
              const visits = this.appointmentsOn(day, person.id).map((item) => item.starts_at.slice(11, 16));
              const blocked = this.blocksOn(day, person.id).length > 0;
              if (slots.length === 0 && visits.length === 0 && !blocked) {
                continue;
              }
              open = true;
              const tag = (label: string) => (many ? `${row?.name ?? ''} ${label}` : label);
              const busy = row?.clocks.length ? row.clocks.filter((clock) => !slots.includes(clock)) : visits;
              slots.forEach((clock) => free.push(tag(clock)));
              busy.forEach((clock) => taken.push(tag(clock)));
            }
            return { free, taken, closed: !open };
          });
          const who = many ? members.map((person) => person.full_name.split(' ')[0]).join(', ') : members[0].full_name;
          this.paintMonth(days, sheets, who, service.name, brand);
        },
        error: () => this.exporting.set(false),
      });
  }

  protected selectDay(day: Date): void {
    this.cursor.set(startOfDay(day));
    this.selected.set(null);
  }

  protected isSelected(day: Date): boolean {
    return this.dayKey(day) === this.dayKey(this.cursor());
  }

  protected openDay(day: Date): void {
    this.cursor.set(startOfDay(day));
    this.currentView.set('day');
    this.selected.set(null);
  }

  private pickedService(): Service | undefined {
    const id = this.serviceId();
    return this.services().find((item) => (id === null ? item.is_active : item.id === id));
  }

  private pickedStaff(): Staff | undefined {
    const id = this.staffId();
    return this.staff().find((item) => (id === null ? item.is_active : item.id === id));
  }

  private paintMonth(
    days: Date[],
    sheets: { free: string[]; taken: string[]; closed: boolean }[],
    who: string,
    service: string,
    brand: { name: string; logo_url: string | null; primary_color: string; canvas_color?: string | null } | null,
  ): void {
    const slug = this.auth.currentUser()?.slug;
    const bookingUrl = slug ? `${location.origin}/${slug}/book` : '';
    const images = { logo: null as HTMLImageElement | null, mark: null as HTMLImageElement | null, qr: null as HTMLImageElement | null };
    let pending = bookingUrl ? 3 : 2;
    const done = () => {
      pending -= 1;
      if (pending > 0) {
        return;
      }
      try {
        this.drawMonth(days, sheets, who, service, brand, images.logo, images.mark, images.qr, bookingUrl);
      } catch {
        this.drawMonth(days, sheets, who, service, brand, null, images.mark, null, bookingUrl);
      }
      this.exporting.set(false);
    };
    const load = (src: string | null, key: 'logo' | 'mark' | 'qr') => {
      if (!src) {
        done();
        return;
      }
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        images[key] = image;
        done();
      };
      image.onerror = () => done();
      image.src = src;
    };
    load(brand?.logo_url ?? null, 'logo');
    load('/nexia-mark.png', 'mark');
    if (bookingUrl) {
      load(`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(bookingUrl)}`, 'qr');
    }
  }

  private drawMonth(
    days: Date[],
    sheets: { free: string[]; taken: string[]; closed: boolean }[],
    who: string,
    service: string,
    brand: { name: string; logo_url: string | null; primary_color: string; canvas_color?: string | null } | null,
    logo: HTMLImageElement | null,
    mark: HTMLImageElement | null,
    qr: HTMLImageElement | null,
    bookingUrl: string,
  ): void {
    const theme = monthTheme(days[0].getMonth());
    const ink = brand?.primary_color || '#1E1B1E';
    const paper = brand?.canvas_color || '#f7f4f5';
    const lead = (days[0].getDay() + 6) % 7;
    const cols = 7;
    const cellW = 156;
    const cellH = 132;
    const rows = Math.ceil((lead + days.length) / cols);
    const canvas = document.createElement('canvas');
    canvas.width = 48 + cols * cellW;
    canvas.height = 148 + rows * cellH + 86;
    const pen = canvas.getContext('2d');
    if (!pen) {
      return;
    }
    pen.fillStyle = theme?.wash ?? paper;
    pen.fillRect(0, 0, canvas.width, canvas.height);
    if (mark) {
      pen.save();
      pen.globalAlpha = 0.12;
      pen.drawImage(mark, (canvas.width - 320) / 2, (canvas.height - 400) / 2, 320, 320);
      pen.restore();
    }
    pen.fillStyle = ink;
    pen.fillRect(0, 0, canvas.width, 8);
    if (logo) {
      pen.save();
      pen.beginPath();
      pen.arc(52, 52, 22, 0, Math.PI * 2);
      pen.clip();
      pen.drawImage(logo, 30, 30, 44, 44);
      pen.restore();
    }
    pen.fillStyle = theme?.ink ?? '#1E1B1E';
    pen.font = '600 22px sans-serif';
    pen.fillText(brand?.name || this.periodLabel(), logo ? 84 : 24, 44);
    pen.font = '14px sans-serif';
    pen.fillText(`${this.periodLabel()} · ${who} · ${service}`, logo ? 84 : 24, 68);
    if (theme) {
      pen.font = '20px sans-serif';
      pen.fillText(`${theme.mark}  ${theme.title}`, 24, 108);
    }
    const names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    pen.font = '13px sans-serif';
    pen.fillStyle = ink;
    names.forEach((name, index) => pen.fillText(name, 24 + index * cellW, 136));
    days.forEach((day, index) => {
      const cell = lead + index;
      const x = 24 + (cell % cols) * cellW;
      const y = 148 + Math.floor(cell / cols) * cellH;
      pen.fillStyle = '#ffffff';
      pen.fillRect(x, y, cellW - 8, cellH - 8);
      pen.strokeStyle = ink;
      pen.strokeRect(x, y, cellW - 8, cellH - 8);
      pen.fillStyle = ink;
      pen.font = '600 16px sans-serif';
      pen.fillText(String(day.getDate()), x + 8, y + 22);
      if (theme) {
        pen.font = '14px sans-serif';
        pen.fillText(theme.mark, x + cellW - 28, y + 20);
      }
      const sheet = sheets[index];
      const lines = [...sheet.free, ...sheet.taken].sort();
      pen.font = '13px sans-serif';
      if (sheet.closed || lines.length === 0) {
        pen.fillStyle = '#a8a29e';
        pen.fillText(sheet.closed ? 'Cerrado' : 'Sin horario', x + 8, y + 46);
        return;
      }
      lines.slice(0, 8).forEach((label, line) => {
        const taken = sheet.taken.includes(label);
        const top = y + 46 + line * 16;
        pen.fillStyle = taken ? '#a8a29e' : '#1E1B1E';
        pen.fillText(label, x + 8, top);
        if (taken) {
          const width = pen.measureText(label).width;
          pen.strokeStyle = '#a8a29e';
          pen.beginPath();
          pen.moveTo(x + 8, top - 4);
          pen.lineTo(x + 8 + width, top - 4);
          pen.stroke();
        }
      });
    });
    const foot = canvas.height - 78;
    pen.fillStyle = ink;
    pen.fillRect(24, foot, canvas.width - 48, 62);
    const textX = qr ? 100 : 40;
    if (qr) {
      pen.drawImage(qr, 36, foot + 6, 50, 50);
    }
    pen.fillStyle = '#ffffff';
    pen.font = '600 15px sans-serif';
    pen.fillText('Agenda tu cita aquí', textX, foot + 24);
    pen.font = '700 16px sans-serif';
    pen.fillText(bookingUrl || 'Tu enlace de reservas', textX, foot + 48);
    if (mark) {
      pen.drawImage(mark, canvas.width - 108, foot + 6, 52, 52);
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `agenda-${this.dayKey(days[0]).slice(0, 7)}.png`;
    this.previewUrl.set(link.href);
  }

  /** Mes: un punto por colaboradora con citas ese día (mismo color que en Semana y Día). */
  protected staffDots(day: Date): number[] {
    return [...new Set(this.activeOn(day).map((item) => item.staff_id))].slice(0, 4);
  }

  /** Citas que siguen en pie (sin canceladas ni faltas), para contar en el mes. */
  protected activeOn(day: Date): Appointment[] {
    return this.appointmentsOn(day).filter((item) => item.status !== 'cancelled' && item.status !== 'no_show');
  }

  protected mark(item: Appointment): string {
    if (item.needs_approval && item.status !== 'cancelled') {
      return 'Por aprobar';
    }
    if (item.status === 'awaiting_deposit') {
      if (item.payment_proof) {
        return 'Comprobante listo';
      }
      if (item.paid_claim) {
        return 'Dice que pagó';
      }
      const created = item.created_at ? new Date(item.created_at) : null;
      const amount = item.deposit_amount ? ` $${item.deposit_amount}` : '';
      if (created && !Number.isNaN(created.getTime())) {
        const left = created.getTime() + this.holdHours() * 3_600_000 - Date.now();
        if (left < 3_600_000) {
          return `Anticipo${amount} · ${Math.max(0, Math.round(left / 60000))} min`;
        }
      }
      return `Anticipo${amount}`;
    }
    if (item.price_accepted) {
      return 'Precio aceptado';
    }
    if (item.client_confirmed) {
      return 'Confirmó';
    }
    if (item.status === 'scheduled') {
      return attendanceState(item) === 'deposit' ? 'Anticipo pagado' : 'Sin confirmar';
    }
    return '';
  }

  protected async sharePreview(): Promise<void> {
    const src = this.previewUrl();
    if (!src) {
      return;
    }
    const file = new File([await (await fetch(src)).blob()], 'agenda-mes.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: this.bookingUrl() });
      return;
    }
    window.open(this.whatsappHref(), '_blank', 'noopener');
  }

  protected savePreview(): void {
    const src = this.previewUrl();
    if (!src) {
      return;
    }
    const link = document.createElement('a');
    link.href = src;
    link.download = `agenda-${this.dayKey(this.cursor()).slice(0, 7)}.png`;
    link.click();
  }

  protected bookingUrl(): string {
    const slug = this.auth.currentUser()?.slug;
    return slug ? `${location.origin}/${slug}/book` : '';
  }

  protected copyBooking(): void {
    const url = this.shareLink();
    if (!url) {
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1600);
    });
  }

  /** Enlace con vista previa (logo y nombre) para mandar por WhatsApp o redes. */
  protected shareLink(): string {
    const slug = this.auth.currentUser()?.slug;
    return slug ? this.booking.shareUrl(slug) : '';
  }

  protected whatsappHref(): string {
    return whatsappLink(null, this.copy.message('share_link', { negocio: this.shopName(), enlace: this.shareLink() }));
  }

  private shopName(): string {
    return this.auth.currentUser()?.businessName ?? '';
  }

  /** Enlace de la cita para el cliente (verla, confirmarla, cambiarla o cancelarla). */
  private manageLink(appointment: Appointment): string {
    const slug = this.auth.currentUser()?.slug ?? '';
    return appointment.cancel_token && slug ? `${location.origin}/${slug}/manage/${appointment.cancel_token}` : '';
  }

  protected dayKey(day: Date): string {
    return toInputDate(day);
  }

  protected isToday(day: Date): boolean {
    return toInputDate(day) === toInputDate(new Date());
  }

  protected inCurrentMonth(day: Date): boolean {
    return day.getMonth() === this.cursor().getMonth();
  }

  protected weekdayName(day: Date): string {
    return WEEKDAY_LABELS[(day.getDay() + 6) % 7];
  }

  protected appointmentsOn(day: Date, staffId?: number): Appointment[] {
    const key = toInputDate(day);
    const focus = this.focus();
    return this.appointments().filter((item) => {
      if (!item.starts_at.startsWith(key) || (staffId != null && item.staff_id !== staffId)) {
        return false;
      }
      if (focus === 'missed') {
        return item.status === 'cancelled' || item.status === 'no_show';
      }
      if (focus === 'deposit') {
        return item.status === 'awaiting_deposit';
      }
      return true;
    });
  }

  protected formatTime(value: string): string {
    const parsed = parseTimestamp(value);
    return Number.isNaN(parsed.getTime()) ? value : this.timeFormat.format(parsed);
  }

  protected slotLabel(minutes: number): string {
    return clockFromMinutes(minutes);
  }

  protected statusBadge(appointment: Appointment): string {
    const live = this.progress(appointment);
    if (live.key === 'upcoming') return attendanceState(appointment) !== 'pending' ? 'badge badge-ok' : 'badge badge-neutral';
    return `badge ${live.badge}`;
  }

  /** Texto del estado en la ficha: "En curso", "Terminó · falta cobrar", "Finalizada"… y, si aún no llega, si ya confirmó. */
  protected statusText(appointment: Appointment): string {
    const live = this.progress(appointment);
    if (live.key === 'upcoming') {
      const state = attendanceState(appointment);
      return `Por venir · ${state === 'confirmed' ? 'Confirmó' : state === 'deposit' ? 'Anticipo pagado' : 'Sin confirmar'}`;
    }
    return live.label;
  }

  /**
   * Cierra el día que se está viendo: para la colaboradora del filtro o, sin filtro, para todo el equipo.
   * Avisa si ya hay citas (no se cancelan solas) y se puede deshacer.
   */
  protected async dayOff(): Promise<void> {
    const day = this.cursor();
    const date = this.dayKey(day);
    const members = this.visibleStaff();
    if (!members.length) {
      return;
    }
    const who = members.length === 1 ? members[0].full_name : 'todo el equipo';
    const booked = this.appointmentsOn(day).filter(
      (item) => members.some((member) => member.id === item.staff_id) && (item.status === 'scheduled' || item.status === 'awaiting_deposit'),
    ).length;
    const ok = await this.confirm.ask({
      title: `¿Día libre para ${who}?`,
      message: booked
        ? `El ${longDay(date)} ya hay ${booked} ${booked === 1 ? 'cita' : 'citas'}. No se cancelan solas: muévelas o cancélalas y avisa a cada cliente.`
        : `El ${longDay(date)} nadie podrá reservar con ${members.length === 1 ? members[0].full_name : 'tu equipo'}.`,
      confirm: 'Cerrar el día',
    });
    if (!ok) {
      return;
    }
    forkJoin(
      members.map((member) =>
        this.appointmentsApi.createBlock({ staff_id: member.id, starts_at: `${date}T00:00:00`, ends_at: `${date}T23:59:00`, note: 'Día libre' }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.offerBlockUndo(`Día libre · ${who}`, rows.map((row) => row.id));
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => this.loadError.set(readError(error, 'No pudimos cerrar el día.')),
      });
  }

  /** "Día libre · Deshacer" durante 6 segundos; deshacer borra los bloqueos recién creados. */
  protected readonly blockUndo = signal<{ label: string; ids: number[] } | null>(null);
  private blockUndoTimer: ReturnType<typeof setTimeout> | null = null;

  private offerBlockUndo(label: string, ids: number[]): void {
    if (this.blockUndoTimer) {
      clearTimeout(this.blockUndoTimer);
    }
    this.blockUndo.set({ label, ids });
    this.blockUndoTimer = setTimeout(() => this.blockUndo.set(null), 6000);
  }

  protected undoBlocks(): void {
    const row = this.blockUndo();
    if (!row) {
      return;
    }
    this.blockUndo.set(null);
    forkJoin(row.ids.map((id) => this.agendaApi.deleteBlock(id).pipe(catchError(() => of(null)))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toasts.show('Se abrió el día otra vez.');
        this.loadAppointments(this.range(), this.staffId(), this.serviceId());
      });
  }

  /** Enlace de WhatsApp con el precio acordado; se muestra como <a> para que el navegador no lo bloquee. */
  protected priceHref(appointment: Appointment): string | null {
    const phone = waPhone(appointment.client_phone);
    if (!phone || appointment.quoted_price == null) {
      return null;
    }
    const text = this.copy.message('quote', {
      ...this.visitVars(appointment),
      precio: this.pesos(appointment.quoted_price),
      anticipo: appointment.deposit_amount ? this.pesos(appointment.deposit_amount) : '',
      enlace: this.manageLink(appointment),
    });
    return whatsappLink(phone, text);
  }

  /** Enlace directo al chat del cliente. */
  protected chatHref(appointment: Appointment): string | null {
    const phone = waPhone(appointment.client_phone);
    if (!phone) {
      return null;
    }
    return whatsappLink(phone, this.copy.message('chat', this.visitVars(appointment)));
  }

  /** Lo que comparten casi todos los mensajes sobre una cita. */
  private visitVars(appointment: Appointment): MessageVars {
    return {
      nombre: firstName(appointment.client_name),
      negocio: this.shopName(),
      servicio: appointment.service_name,
      dia: longDay(appointment.starts_at),
      hora: this.formatTime(appointment.starts_at),
      equipo: appointment.staff_name,
      cita: this.copy.text().visit.toLowerCase(),
    };
  }

  /** Precio variable que todavía no tiene precio acordado: hay que cotizar. Un servicio de precio fijo nunca lo pide. */
  protected needsQuote(appointment: Appointment): boolean {
    const service = this.services().find((item) => item.id === appointment.service_id);
    const open = appointment.status === 'scheduled' || appointment.status === 'awaiting_deposit';
    return open && !!service?.variable_price && appointment.quoted_price == null;
  }

  protected readonly quoteFocus = signal(false);
  protected readonly quoteHref = signal<string | null>(null);
  protected readonly quoteSaving = signal(false);

  protected saveQuote(appointment: Appointment, value: string): void {
    const amount = Number(value);
    if (!String(value).trim() || Number.isNaN(amount) || this.quoteSaving()) {
      return;
    }
    this.quoteSaving.set(true);
    this.appointmentsApi
      .quote(appointment.id, amount)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.quoteSaving.set(false);
          this.patchLocal(saved);
          this.quoteHref.set(this.priceHref(saved));
          this.toasts.show('Precio guardado.');
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          this.quoteSaving.set(false);
          this.loadError.set(readError(error, 'No pudimos guardar el precio.'));
        },
      });
  }

  protected async repeat(appointment: Appointment, weeks: number): Promise<void> {
    const start = parseTimestamp(appointment.starts_at);
    const time = appointment.starts_at.slice(11, 16);
    const dates = [1, 2, 3].map((step) => {
      const next = new Date(start);
      next.setDate(next.getDate() + weeks * 7 * step);
      return next;
    });
    const label = (day: Date) => day.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
    const list = dates.map(label).join(', ');
    const ok = await this.confirm.ask({
      title: `¿Repetir cada ${weeks} semanas?`,
      message: `Se crearán 3 citas de ${appointment.service_name} para ${appointment.client_name} a las ${time}: ${list}.`,
      confirm: 'Crear 3 citas',
    });
    if (!ok) {
      return;
    }
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    if (phone) {
      // Se deja como enlace para tocar: abrirlo después de la confirmación lo bloquearía el navegador.
      const text = this.copy.message('repeat', {
        ...this.visitVars(appointment),
        hora: this.formatTime(appointment.starts_at),
        fechas: dates.map((day) => `📅 ${label(day)}`).join('\n'),
      });
      this.clientNotice.set(whatsappLink(phone, text));
    }
    const jobs = dates.map((next) => {
      return this.appointmentsApi
        .createAdminAppointment({
          service_id: appointment.service_id,
          staff_id: appointment.staff_id,
          starts_at: `${this.dayKey(next)}T${time}:00`,
          client_name: appointment.client_name,
          client_phone: appointment.client_phone || '',
          client_email: appointment.client_email,
          notes: appointment.notes,
          waive_deposit: true,
        })
        .pipe(catchError(() => of(null)));
    });
    forkJoin(jobs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => {
        const failed = rows.filter((row) => row === null).length;
        this.toasts.show(
          failed ? `Se crearon ${3 - failed} de 3 citas. ${failed} no se pudieron (horario ocupado o fuera de horario); revísalas en la agenda.` : 'Se crearon las 3 citas.',
        );
        this.closeAppointment();
        this.loadAppointments(this.range(), this.staffId(), this.serviceId());
      });
  }

  protected openBlock(): void {
    this.blockForm.patchValue({
      staff_id: this.staffId() ?? this.staff()[0]?.id ?? null,
      date: this.dayKey(this.cursor()),
    });
    this.blocking.set(true);
    this.blockError.set(null);
  }

  protected saveBlock(): void {
    const value = this.blockForm.getRawValue();
    if (value.staff_id == null || !value.date) {
      return;
    }
    if (value.start >= value.end) {
      this.blockError.set('La hora de fin debe ser posterior.');
      return;
    }
    if (value.repeat === 'always') {
      this.blockSaving.set(true);
      this.appointmentsApi
        .createStanding({
          staff_id: value.staff_id,
          start_time: value.start,
          end_time: value.end,
          note: value.note.trim() || null,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.blockSaving.set(false);
            this.blocking.set(false);
            this.toasts.show('Comida fija, de lunes a viernes');
            this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          },
          error: (error: unknown) => {
            this.blockSaving.set(false);
            this.blockError.set(readError(error, 'No pudimos guardar la comida fija.'));
          },
        });
      return;
    }
    const days = repeatDays(value.date, value.repeat);
    this.blockSaving.set(true);
    this.blockError.set(null);
    forkJoin(
      days.map((day) =>
        this.appointmentsApi.createBlock({
          staff_id: value.staff_id as number,
          starts_at: `${day}T${value.start}:00`,
          ends_at: `${day}T${value.end}:00`,
          note: value.note.trim() || null,
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.blockSaving.set(false);
          this.blocking.set(false);
          this.toasts.show(days.length === 1 ? 'Horario bloqueado' : `Se bloquearon ${days.length} días`);
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => {
          this.blockSaving.set(false);
          this.blockError.set(readError(error, 'No pudimos bloquear ese horario.'));
        },
      });
  }

  /** Tocar un bloqueo muestra qué es y quién; quitarlo es una decisión aparte. */
  protected async removeBlock(block: TimeBlock, event: Event): Promise<void> {
    event.stopPropagation();
    const when = `${longDay(block.starts_at)} · ${this.formatTime(block.starts_at)} a ${this.formatTime(block.ends_at)} · ${block.staff_name}`;
    const ok = await this.confirm.ask({
      title: block.note || 'Horario bloqueado',
      message: block.rule_id ? `${when}. Se repite de lunes a viernes; al quitarlo se quita de todos los días.` : `${when}.`,
      confirm: block.rule_id ? 'Quitar de todos los días' : 'Quitar bloqueo',
      cancel: 'Cerrar',
      danger: true,
    });
    if (!ok) {
      return;
    }
    const request = block.rule_id ? this.appointmentsApi.deleteStanding(block.rule_id) : this.agendaApi.deleteBlock(block.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toasts.show(block.rule_id ? 'Comida fija eliminada.' : 'Bloqueo eliminado. El horario quedó libre.');
        this.loadAppointments(this.range(), this.staffId(), this.serviceId());
      },
      error: (error: unknown) => this.loadError.set(readError(error, 'No pudimos quitar el bloqueo.')),
    });
  }

  protected blocksOn(day: Date, staffId?: number): TimeBlock[] {
    const key = this.dayKey(day);
    return this.blocks().filter(
      (item) => item.starts_at.startsWith(key) && (staffId == null || item.staff_id === staffId),
    );
  }

  protected spanStyle(startsAt: string, endsAt: string): { top: string; height: string } {
    const start = parseTimestamp(startsAt);
    const end = parseTimestamp(endsAt);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const bounds = this.dayBounds();
    const span = bounds.end - bounds.start;
    const top = clamp(((startMinutes - bounds.start) / span) * 100, 0, 98);
    const height = clamp(((Math.min(endMinutes, bounds.end) - Math.max(startMinutes, bounds.start)) / span) * 100, 2, 100 - top);
    return { top: `${top}%`, height: `${height}%` };
  }

  /** Un color fijo por colaboradora (según su orden), para leer el día de un vistazo. */
  protected staffColor(staffId: number): string {
    return staffColorOf(this.staff(), staffId);
  }

  protected staffTint(staffId: number): string {
    return `color-mix(in srgb, ${this.staffColor(staffId)} 16%, var(--color-surface))`;
  }

  /** Estado legible dentro del bloque: completadas atenuadas, canceladas tachadas. */
  protected tone(appointment: Appointment): string {
    if (appointment.status === 'completed') return 'opacity-60';
    if (appointment.status === 'cancelled' || appointment.status === 'no_show') return 'opacity-50 line-through';
    // Por aprobar: contorno punteado para que se vea sin abrir la ficha.
    if (appointment.needs_approval) return 'outline-2 outline-dashed outline-[var(--nx-warn-fg)] -outline-offset-2';
    return '';
  }

  /** En qué va la cita ahora: por venir, en curso, terminó sin cobrar o finalizada (con los extras en la duración). */
  protected progress(item: Appointment): Progress {
    const minutes = this.services().find((row) => row.id === item.service_id)?.duration_minutes;
    return appointmentProgress(item, this.now(), minutes);
  }

  /** Marca de estado de la cita (el color ya es de quien atiende): en curso, por cobrar, confirmada, sin confirmar, finalizada o cancelada. */
  protected stateMark(item: Appointment): { icon: string; cls: string; label: string } | null {
    const live = this.progress(item);
    if (live.key === 'live') return { icon: live.icon, cls: 'text-accent', label: live.label };
    if (live.key === 'ended') return { icon: live.icon, cls: 'text-(--nx-warn-fg)', label: live.label };
    if (item.status === 'completed') return { icon: 'paid', cls: 'text-(--nx-ok-fg)', label: 'Finalizada · cobrada' };
    if (item.status === 'cancelled') return { icon: 'event_busy', cls: 'text-muted', label: 'Cancelada' };
    if (item.status === 'no_show') return { icon: 'person_off', cls: 'text-muted', label: 'No llegó' };
    if (item.status === 'scheduled' && !item.needs_approval) {
      const state = attendanceState(item);
      if (state === 'pending') {
        return { icon: 'help', cls: 'text-(--nx-warn-fg)', label: 'Sin confirmar' };
      }
      return { icon: 'check_circle', cls: 'text-(--nx-ok-fg)', label: state === 'deposit' ? 'Anticipo pagado' : 'Confirmó' };
    }
    return null;
  }

  /** WhatsApp para pedir confirmación desde el panel del día (el mismo mensaje de recordatorio de Inicio). */
  protected confirmHref(item: Appointment): string | null {
    const phone = waPhone(item.client_phone);
    if (!phone || item.status !== 'scheduled' || attendanceState(item) !== 'pending' || item.needs_approval) {
      return null;
    }
    const sameDay = toInputDate(new Date()) === item.starts_at.slice(0, 10);
    return whatsappLink(phone, this.copy.message('reminder', { ...this.visitVars(item), cuando: sameDay ? 'hoy' : 'mañana', enlace: this.manageLink(item) }));
  }

  /** Abre la ficha de la cita ya en el cobro (igual que el botón Cobrar de Inicio). */
  protected chargeFromList(item: Appointment): void {
    this.showAppointment({ appointment: item, x: 24, y: 88, maxHeight: 560, history: [] }, false);
    this.startCharge(item);
  }

  /** Puede cobrarse desde la lista: agendada, con precio ya acordado y sin anticipo ni aprobación pendientes. */
  protected canChargeFromList(item: Appointment): boolean {
    return item.status === 'scheduled' && !item.needs_approval && !this.needsQuote(item);
  }

  protected blockStyle(appointment: Appointment): { top: string; height: string } {
    const start = parseTimestamp(appointment.starts_at);
    const minutes = start.getHours() * 60 + start.getMinutes();
    const bounds = this.dayBounds();
    const span = bounds.end - bounds.start;
    const top = clamp(((minutes - bounds.start) / span) * 100, 0, 98);
    const height = clamp((this.durationMinutes(appointment) / span) * 100, 4, 100 - top);
    return { top: `${top}%`, height: `${height}%` };
  }

  protected availabilityStyle(staffId: number, day: Date): { top: string; height: string } | null {
    const window = this.workingWindow(staffId, day);
    if (!window) {
      return null;
    }
    const bounds = this.dayBounds();
    const span = bounds.end - bounds.start;
    const start = clamp(((window.start - bounds.start) / span) * 100, 0, 100);
    const end = clamp(((window.end - bounds.start) / span) * 100, 0, 100);
    if (end <= start) {
      return null;
    }
    return { top: `${start}%`, height: `${end - start}%` };
  }

  protected isAvailable(staffId: number): boolean {
    return this.workingWindow(staffId, this.cursor()) !== null;
  }

  protected openCreateAt(day: Date, minutes: number, staffId?: number): void {
    this.selected.set(null);
    this.formError.set(null);
    this.petName.set('');
    this.form.reset({
      service_id: this.serviceId(),
      staff_id: staffId ?? this.staffId(),
      date: toInputDate(day),
      time: clockFromMinutes(minutes),
      client_name: '',
      client_phone: '',
      client_email: '',
      notes: '',
      quoted_price: '',
      waive_deposit: false,
    });
    this.known.set(null);
    this.freshPhone.set(false);
    this.guestQuery.set('');
    this.guestOpen.set(false);
    if (this.guests().length === 0) {
      this.booking.getClients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((rows) => {
        this.guests.set(rows);
        if (this.pendingTel) {
          this.applyTel(this.pendingTel);
        }
      });
    }
    if (this.isStaff()) {
      this.form.controls.staff_id.disable();
    }
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '980px',
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'service-sheet',
      autoFocus: 'first-tabbable',
    });
  }

  protected openCreate(): void {
    this.openCreateAt(this.cursor(), 9 * 60, this.staffId() ?? undefined);
  }

  /** Desde Clientes ("repetir última cita"): ?tel=, ?servicio= y ?con= prellenan el formulario. */
  private prefillFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    const serviceId = Number(params.get('servicio'));
    if (serviceId && this.activeServices().some((item) => item.id === serviceId)) {
      this.form.controls.service_id.setValue(serviceId);
    }
    const staffId = Number(params.get('con'));
    if (!this.isStaff() && staffId && this.staff().some((member) => member.id === staffId && member.is_active)) {
      this.form.controls.staff_id.setValue(staffId);
    }
    const tel = params.get('tel')?.trim();
    if (tel) {
      this.form.controls.client_phone.setValue(tel);
      this.pendingTel = tel;
      if (this.guests().length) {
        this.applyTel(tel);
      }
    }
  }

  private applyTel(tel: string): void {
    this.pendingTel = null;
    this.matchClient(tel);
    const person = this.known();
    if (person && !this.form.controls.client_name.value.trim()) {
      this.form.controls.client_name.setValue(person.full_name);
    }
  }

  protected pesos(amount: number): string {
    return this.pesosFormat.format(amount);
  }

  protected chargeHint(): string | null {
    const value = this.form.getRawValue();
    const service = this.services().find((item) => item.id === value.service_id);
    if (!service) {
      return null;
    }
    const quoted = String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null;
    const total = quoted ?? service.price;
    if (value.waive_deposit) {
      return `Sin anticipo. En la cita cobra ${this.pesos(total)}.`;
    }
    const deposit = this.previewDeposit(service, quoted);
    if (!deposit) {
      return null;
    }
    const rest = Math.max(0, Math.round((total - deposit) * 100) / 100);
    return `Anticipo ${this.pesos(deposit)}. En la cita cobra ${this.pesos(rest)}.`;
  }

  /** "6 citas · $3,200 por cobrar" para el día que se está viendo. */
  protected daySummary(day: Date): string {
    const active = this.appointmentsOn(day).filter((item) => item.status !== 'cancelled' && item.status !== 'no_show');
    if (!active.length) {
      return '';
    }
    const due = active
      .filter((item) => item.status !== 'completed')
      // Sin anticipo ni cotización, bill() es null y se cobra el precio del servicio completo.
      .reduce((sum, item) => sum + (this.bill(item)?.rest ?? this.services().find((row) => row.id === item.service_id)?.price ?? 0), 0);
    const visit = this.copy.text().visit.toLowerCase();
    const count = `${active.length} ${visit}${active.length === 1 ? '' : 's'}`;
    return due > 0 ? `${count} · ${this.pesosFormat.format(due)} por cobrar` : count;
  }

  protected bill(appointment: Appointment): { total: number; deposit: number; rest: number; pending: boolean } | null {
    const service = this.services().find((item) => item.id === appointment.service_id);
    const total = appointment.quoted_price ?? service?.price;
    const deposit = appointment.deposit_amount ?? 0;
    if (total == null || (!deposit && appointment.quoted_price == null)) {
      return null;
    }
    return {
      total,
      deposit,
      rest: Math.max(0, Math.round((total - deposit) * 100) / 100),
      pending: appointment.status === 'awaiting_deposit',
    };
  }

  private previewDeposit(service: { variable_price?: boolean; deposit_amount?: number | null; price: number }, quoted: number | null): number | null {
    const rules = this.depositRules();
    if (!rules.account) {
      return null;
    }
    if (service.variable_price && rules.percent) {
      if (quoted == null) {
        return null;
      }
      const amount = Math.round((quoted * rules.percent) / 100 * 100) / 100;
      return amount || null;
    }
    const fixed = service.deposit_amount ?? rules.amount;
    return fixed || null;
  }

  /** Búsqueda de clientas por nombre o teléfono (datalist no funciona bien en iPhone). */
  protected readonly guestQuery = signal('');
  protected readonly guestOpen = signal(false);
  protected readonly guestMatches = computed(() => {
    const term = this.guestQuery().trim().toLowerCase();
    if (term.length < 2) {
      return [];
    }
    const digits = term.replace(/\D/g, '');
    return this.guests()
      .filter((row) => row.full_name.toLowerCase().includes(term) || (digits.length >= 3 && row.phone.replace(/\D/g, '').includes(digits)))
      .slice(0, 6);
  });

  protected typeGuest(value: string): void {
    this.guestQuery.set(value);
    this.guestOpen.set(true);
  }

  /** Al elegir de la lista, llena nombre y teléfono y muestra su historial. */
  protected pickGuest(row: { full_name: string; phone: string }): void {
    this.form.patchValue({ client_name: row.full_name, client_phone: row.phone });
    this.matchClient(row.phone);
    this.guestOpen.set(false);
  }

  /** Los que acepta el negocio (Configuración → Anticipo y pagos) más "Paquete", que siempre está. */
  private readonly acceptedMethods = signal<string[]>(ALL_METHODS);
  protected readonly payMethods = computed(() => [
    ...PAYMENT_METHODS.filter((item) => this.acceptedMethods().includes(item.value)),
    { value: 'paquete', label: 'Paquete' },
  ]);
  protected readonly charging = signal<number | null>(null);
  protected readonly chargeAmount = signal('');
  protected readonly chargeMethod = signal('efectivo');
  protected readonly chargeTip = signal('');
  protected readonly chargeNote = signal('');
  /** Productos activos con existencia, para venderlos junto con el servicio. */
  protected readonly products = signal<ShopProduct[]>([]);
  protected readonly cart = signal<{ id: number; name: string; price: number; qty: number; stock: number }[]>([]);
  protected readonly productPick = signal<number | null>(null);
  protected readonly productsTotal = computed(() =>
    Math.round(this.cart().reduce((sum, row) => sum + row.price * row.qty, 0) * 100) / 100,
  );
  protected readonly serviceCharge = computed(() => toAmount(this.chargeAmount()) ?? 0);
  protected readonly tipAmount = computed(() => toAmount(this.chargeTip()) ?? 0);
  /**
   * Anticipo que el cliente ya pagó (la cita está agendada, así que se recibió). El precio del servicio
   * se guarda completo (final_price), pero en caja solo se cobra lo que falta.
   */
  protected readonly chargeDeposit = signal(0);
  protected readonly dueNow = computed(
    () => Math.max(0, Math.round((this.serviceCharge() - this.chargeDeposit()) * 100) / 100) + this.productsTotal() + this.tipAmount(),
  );
  private productsLoaded = false;

  protected startCharge(appointment: Appointment): void {
    this.charging.set(appointment.id);
    this.moving.set(null);
    this.chargeAmount.set(String(this.bill(appointment)?.total ?? appointment.quoted_price ?? this.services().find((item) => item.id === appointment.service_id)?.price ?? ''));
    this.chargeDeposit.set(appointment.status === 'scheduled' ? appointment.deposit_amount ?? 0 : 0);
    this.chargeMethod.set(this.payMethods()[0].value);
    this.chargeTip.set('');
    this.chargeNote.set('');
    this.cart.set([]);
    this.productPick.set(null);
    if (!this.productsLoaded) {
      this.productsLoaded = true;
      this.shopApi
        .products()
        .pipe(catchError(() => of([] as ShopProduct[])), takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => this.products.set(rows.filter((row) => row.stock > 0)));
    }
    setTimeout(() => document.getElementById('charge-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  protected addProduct(): void {
    const id = this.productPick();
    const product = this.products().find((row) => row.id === id);
    if (!product) {
      return;
    }
    this.cart.update((rows) => {
      const found = rows.find((row) => row.id === product.id);
      if (found) {
        return rows.map((row) => (row.id === product.id ? { ...row, qty: Math.min(row.stock, row.qty + 1) } : row));
      }
      return [...rows, { id: product.id, name: product.name, price: product.price, qty: 1, stock: product.stock }];
    });
    this.productPick.set(null);
  }

  protected setProductQty(id: number, value: string): void {
    const qty = Math.floor(Number(value));
    this.cart.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, qty: Number.isNaN(qty) ? 1 : Math.min(row.stock, Math.max(1, qty)) } : row)),
    );
  }

  protected removeProduct(id: number): void {
    this.cart.update((rows) => rows.filter((row) => row.id !== id));
  }

  private sellCart(rows: { id: number; name: string; price: number; qty: number }[]): void {
    // Los productos se cobran junto con la cita, por el mismo método.
    const method = this.chargeMethod();
    if (!rows.length) {
      return;
    }
    forkJoin(
      rows.map((row) =>
        this.shopApi.sell(row.id, row.qty, row.price, method).pipe(
          map(() => null),
          catchError(() => of(row.name)),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((failed) => {
        const missing = failed.filter((name): name is string => !!name);
        this.toasts.show(missing.length ? `No se pudo registrar la venta de: ${missing.join(', ')}.` : 'Venta de productos registrada.');
        this.productsLoaded = false;
      });
  }

  protected completeWithCharge(appointment: Appointment): void {
    const tip = toAmount(this.chargeTip());
    const note = this.chargeNote().trim();
    const sold = this.cart();
    void this.setStatus(
      appointment,
      'completed',
      {
        final_price: toAmount(this.chargeAmount()),
        payment_method: this.chargeMethod(),
        tip: tip && tip > 0 ? tip : null,
        visit_note: note || null,
      },
      () => this.sellCart(sold),
    );
    this.charging.set(null);
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    const link = this.manageLink(appointment);
    if (phone && link) {
      const text = this.copy.message('review', { nombre: firstName(appointment.client_name), enlace: link });
      this.reviewNotice.set({ name: firstName(appointment.client_name), href: whatsappLink(phone, text) });
    }
  }

  protected matchClient(phone: string): void {
    const key = phone.replace(/\D/g, '');
    if (key.length < 7) {
      this.known.set(null);
      this.freshPhone.set(false);
      return;
    }
    const found = this.guests().find((row) => row.phone.replace(/\D/g, '') === key);
    this.known.set(found ?? null);
    this.freshPhone.set(!found);
  }

  protected closeEditor(): void {
    this.dialogRef?.close();
  }

  protected save(): void {
    if (this.isSaving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    if (value.service_id == null || value.staff_id == null) {
      return;
    }
    this.isSaving.set(true);
    this.formError.set(null);
    this.appointmentsApi
      .createAdminAppointment({
        service_id: value.service_id,
        staff_id: value.staff_id,
        starts_at: `${value.date}T${value.time}:00`,
        client_name: value.client_name.trim(),
        client_phone: value.client_phone.trim(),
        client_email: value.client_email.trim() || null,
        quoted_price: String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null,
        waive_deposit: value.waive_deposit,
        notes: [this.copy.text().pet && this.petName().trim() ? `Mascota: ${this.petName().trim()}` : '', value.notes.trim()].filter(Boolean).join('\n') || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.isSaving.set(false);
          this.closeEditor();
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          this.toasts.show(`Se agendó la ${this.copy.text().visit.toLowerCase()}.`);
          this.clientNotice.set(this.clientWhatsapp(created));
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos agendar la cita.'));
        },
      });
  }

  protected openAppointment(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    const margin = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const x = Math.max(margin, Math.min(event.clientX, window.innerWidth - width - margin));
    const room = window.innerHeight - margin * 2;
    const want = Math.min(560, room);
    const y = Math.max(margin, Math.min(event.clientY, window.innerHeight - want - margin));
    this.showAppointment({ appointment, x, y, maxHeight: window.innerHeight - y - margin, history: [] });
  }

  protected readonly lastNote = signal<{ note: string; date: string | null } | null>(null);

  /** Abre la ficha y limpia lo de la cita anterior (cobro, cambio, cotización). */
  private showAppointment(pop: SelectedAppointment, focusQuote = false): void {
    this.freed.set([]);
    this.charging.set(null);
    this.moving.set(null);
    this.quoteHref.set(null);
    this.lastNote.set(null);
    this.quoteFocus.set(focusQuote);
    this.selected.set(pop);
    this.loadHistory(pop.appointment);
    const id = pop.appointment.id;
    if (pop.appointment.client_phone) {
      this.appointmentsApi
        .lastNote(id)
        .pipe(catchError(() => of({ note: null, date: null })), takeUntilDestroyed(this.destroyRef))
        .subscribe((row) => {
          if (row.note && this.selected()?.appointment.id === id) {
            this.lastNote.set({ note: row.note, date: row.date });
          }
        });
    }
    if (focusQuote) {
      setTimeout(() => document.getElementById('quote-price')?.focus(), 80);
    }
  }

  private loadHistory(appointment: Appointment): void {
    const phone = appointment.client_phone;
    if (!phone) {
      return;
    }
    forkJoin({
      visits: this.appointmentsApi.getAppointments({ client_phone: phone }).pipe(catchError(() => of([] as Appointment[]))),
      reviews: this.reviewsApi.getReviews().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ visits, reviews }) => {
        const past = visits
          .filter((item) => item.id !== appointment.id && item.starts_at < appointment.starts_at)
          .slice(-3)
          .reverse();
        const lines = past.map(
          (item) => `${item.starts_at.slice(0, 10)} · ${item.service_name}${item.deposit_amount ? ' · Anticipo' : ''}`,
        );
        const named = appointment.client_name.trim().toLowerCase();
        if (reviews.some((review) => review.client_name.trim().toLowerCase() === named)) {
          lines.push('Dejó una reseña');
        }
        const current = this.selected();
        if (current?.appointment.id === appointment.id) {
          this.selected.set({ ...current, history: lines });
        }
      });
  }

  protected closeAppointment(): void {
    this.selected.set(null);
  }

  private clientWhatsapp(appointment: Appointment): string | null {
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    if (!phone) {
      return null;
    }
    return whatsappLink(phone, this.copy.message('booked', { ...this.visitVars(appointment), enlace: this.manageLink(appointment) }));
  }

  /** Aprobar a mano: el horario ya estaba apartado; queda confirmada y sale el WhatsApp para avisarle. */
  protected approve(appointment: Appointment): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(appointment.id);
    this.patchLocal({ ...appointment, needs_approval: false });
    this.appointmentsApi
      .approve(appointment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pendingId.set(null);
          this.patchLocal({ ...appointment, ...updated });
          const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
          if (phone) {
            window.open(whatsappLink(phone, this.copy.message('approved', { ...this.visitVars(appointment), enlace: this.manageLink(appointment) })), '_blank', 'noopener');
          }
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.patchLocal(appointment);
          this.loadError.set(readError(error, 'No pudimos aprobar la cita.'));
        },
      });
  }

  /** Rechazar es cancelar (con "Deshacer") y ofrecerle otro horario por WhatsApp. */
  protected decline(appointment: Appointment): void {
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    void this.setStatus(appointment, 'cancelled', undefined, () => {
      if (phone) {
        window.open(whatsappLink(phone, this.copy.message('declined', { ...this.visitVars(appointment), enlace: this.shareLink() })), '_blank', 'noopener');
      }
    });
  }

  protected acceptAndTell(appointment: Appointment): void {
    this.setStatus(appointment, 'scheduled');
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    if (phone) {
      window.open(whatsappLink(phone, this.copy.message('deposit_ok', this.visitVars(appointment))), '_blank', 'noopener');
    }
  }

  protected askAnother(appointment: Appointment): void {
    this.appointmentsApi
      .clearProof(appointment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
        if (phone) {
          const text = this.copy.message('proof_retry', { nombre: firstName(appointment.client_name), enlace: this.manageLink(appointment) });
          window.open(whatsappLink(phone, text), '_blank', 'noopener');
        }
        this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        this.closeAppointment();
      });
  }

  protected readonly moving = signal<number | null>(null);
  protected readonly moveDate = signal('');
  protected readonly moveTime = signal('');
  protected readonly moveStaff = signal(0);
  protected readonly moveError = signal<string | null>(null);

  /** Horas libres para mover la cita (mismo servicio, día y colaboradora elegidos). */
  protected readonly moveTimes = signal<string[]>([]);
  private moveRequest = 0;

  protected startMove(appointment: Appointment): void {
    this.moving.set(appointment.id);
    this.charging.set(null);
    this.moveDate.set(appointment.starts_at.slice(0, 10));
    this.moveTime.set(appointment.starts_at.slice(11, 16));
    this.moveStaff.set(appointment.staff_id);
    this.moveError.set(null);
    this.loadMoveTimes(appointment);
  }

  protected pickMoveDate(appointment: Appointment, value: string): void {
    this.moveDate.set(value);
    this.moveTime.set('');
    this.loadMoveTimes(appointment);
  }

  protected pickMoveStaff(appointment: Appointment, value: string | number | null): void {
    if (typeof value !== 'number') {
      return;
    }
    this.moveStaff.set(value);
    this.moveTime.set('');
    this.loadMoveTimes(appointment);
  }

  private loadMoveTimes(appointment: Appointment): void {
    const slug = this.auth.currentUser()?.slug;
    const request = ++this.moveRequest;
    this.moveTimes.set([]);
    if (!slug || !this.moveDate()) {
      return;
    }
    this.booking
      .getAvailability(slug, appointment.service_id, this.moveStaff(), this.moveDate())
      .pipe(
        map((rows) => rows.map((row) => row.starts_at.slice(11, 16))),
        catchError(() => of([] as string[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((times) => {
        if (request === this.moveRequest) {
          this.moveTimes.set(times);
        }
      });
  }

  /** "lunes 20 de octubre · 10:00 a. m." para la ficha. */
  protected whenLabel(value: string): string {
    return `${longDay(value)} · ${this.formatTime(value)}`;
  }

  protected telHref(phone: string | null): string | null {
    const digits = (phone ?? '').replace(/\D/g, '');
    return digits ? `tel:${digits.length === 10 ? `+52${digits}` : `+${digits}`}` : null;
  }

  protected saveMove(appointment: Appointment): void {
    if (!this.moveDate() || !this.moveTime() || this.pendingId() !== null) {
      this.moveError.set('Elige día y hora.');
      return;
    }
    this.pendingId.set(appointment.id);
    this.appointmentsApi
      .move(appointment.id, `${this.moveDate()}T${this.moveTime()}:00`, this.moveStaff())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (moved) => {
          this.pendingId.set(null);
          this.moving.set(null);
          this.patchLocal(moved);
          this.closeAppointment();
          this.refreshQuietly();
          this.toasts.show('Cita movida. Avísale al cliente.');
          this.clientNotice.set(this.clientWhatsapp(moved));
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
          this.moveError.set(typeof detail === 'string' ? detail : 'No pudimos mover la cita.');
        },
      });
  }

  protected async setStatus(
    appointment: Appointment,
    status: AppointmentStatus,
    charge?: StatusCharge,
    after?: (updated: Appointment) => void,
  ): Promise<void> {
    if (this.pendingId() !== null) {
      return;
    }
    // Cancelar no pregunta: se puede deshacer durante 5 s. "No llegó" sí confirma (cuenta como falta).
    if (
      status === 'no_show' &&
      !(await this.confirm.ask({
        title: '¿Marcar que no llegó?',
        message: `${appointment.client_name} · ${appointment.service_name}. Cuenta en su historial de faltas.`,
        confirm: 'Sí, no llegó',
        cancel: 'Volver',
        danger: true,
      }))
    ) {
      return;
    }
    const previous = appointment.status;
    // Cambio al instante en la agenda; si el servidor falla, se regresa.
    this.patchLocal({ ...appointment, status });
    if (status === 'cancelled') {
      this.offerUndo(appointment, previous);
    }
    this.pendingId.set(appointment.id);
    this.appointmentsApi
      .updateStatus(appointment.id, status, charge)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          const next = { ...appointment, ...updated, status: updated.status ?? status };
          this.patchLocal(next);
          this.pendingId.set(null);
          if (status === 'cancelled' || status === 'no_show') {
            this.offerFreed(appointment);
          }
          after?.(next);
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.patchLocal(appointment);
          if (this.undo()?.appointment.id === appointment.id) {
            this.dismissUndo();
          }
          this.loadError.set(readError(error, 'No pudimos actualizar la cita.'));
        },
      });
  }

  /** Aviso "Cita cancelada · Deshacer" durante 5 segundos. */
  protected readonly undo = signal<{ appointment: Appointment; previous: AppointmentStatus } | null>(null);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  private offerUndo(appointment: Appointment, previous: AppointmentStatus): void {
    this.dismissUndo();
    this.undo.set({ appointment, previous });
    this.undoTimer = setTimeout(() => this.undo.set(null), 5000);
  }

  protected dismissUndo(): void {
    if (this.undoTimer) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
    this.undo.set(null);
  }

  protected undoCancel(): void {
    const row = this.undo();
    if (!row) {
      return;
    }
    this.dismissUndo();
    const restored = { ...row.appointment, status: row.previous };
    this.patchLocal(restored);
    this.freed.set([]);
    this.appointmentsApi
      .updateStatus(row.appointment.id, row.previous)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.patchLocal({ ...restored, ...updated });
          this.toasts.show('Se recuperó la cita.');
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          this.patchLocal({ ...row.appointment, status: 'cancelled' });
          this.loadError.set(readError(error, 'No pudimos deshacer la cancelación.'));
        },
      });
  }

  /** Reemplaza la cita en la lista local (y en la ficha abierta) sin esperar a recargar. */
  private patchLocal(next: Appointment): void {
    this.appointments.update((items) => items.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
    this.selected.update((current) =>
      current?.appointment.id === next.id ? { ...current, appointment: { ...current.appointment, ...next } } : current,
    );
  }

  /** Recarga en segundo plano, sin spinner ni reabrir fichas. */
  private refreshQuietly(): void {
    this.loadAppointments(this.range(), this.staffId(), this.serviceId(), true);
  }

  private offerFreed(appointment: Appointment): void {
    const day = appointment.starts_at.slice(0, 10);
    this.appointmentsApi
      .waiters(day, appointment.service_id, appointment.staff_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => {
        const slug = this.auth.currentUser()?.slug ?? '';
        this.freed.set(
          rows.map((row) => ({
            name: row.client_name,
            href: whatsappLink(
              row.client_phone,
              this.copy.message('waitlist', {
                ...this.visitVars(appointment),
                nombre: firstName(row.client_name),
                enlace: slug ? this.booking.shareUrl(slug) : '',
              }),
            ),
          })),
        );
      });
  }

  private loadCatalog(): void {
    if (this.isStaff()) {
      forkJoin({
        services: this.servicesApi.getServices(),
        profile: this.staffApi.getStaffProfile(),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ services, profile }) => {
            this.services.set(services);
            this.staff.set([{ ...profile, is_active: true }]);
            this.staffId.set(profile.id);
            this.form.controls.staff_id.setValue(profile.id);
            this.form.controls.staff_id.disable();
            this.loadSchedules([profile]);
            this.ownStaffReady.set(true);
          },
          error: () => {
            this.services.set([]);
            this.staff.set([]);
            this.ownStaffReady.set(true);
            this.loadError.set('No pudimos cargar tu agenda.');
          },
        });
      return;
    }

    forkJoin({
      services: this.servicesApi.getServices(),
      staff: this.staffApi.getStaff(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ services, staff }) => {
          this.services.set(services);
          this.staff.set(staff);
          this.loadSchedules(staff.filter((member) => member.is_active));
        },
        error: () => {
          this.services.set([]);
          this.staff.set([]);
        },
      });
  }

  private loadSchedules(staff: Staff[]): void {
    if (staff.length === 0) {
      this.schedules.set(new Map());
      return;
    }
    forkJoin(
      staff.map((member) =>
        this.schedulesApi.getStaffSchedule(member.id).pipe(
          catchError(() => of([] as ScheduleItem[])),
          map((rows) => [member.id, rows] as const),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.schedules.set(new Map(rows)));
  }

  private loadAppointments(range: DateRange, staffId: number | null, serviceId: number | null, quiet = false): void {
    const current = ++this.requestId;
    if (!quiet) {
      this.isLoading.set(true);
    }
    this.loadError.set(null);
    forkJoin({
      items: this.appointmentsApi.getAppointments({
        start_date: range.start,
        end_date: range.end,
        staff_id: staffId,
        service_id: serviceId,
      }),
      blocks: this.appointmentsApi.getBlocks({
        start_date: range.start,
        end_date: range.end,
        staff_id: staffId,
      }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, blocks }) => {
          if (current !== this.requestId) {
            return;
          }
          this.appointments.set(items);
          this.blocks.set(blocks);
          this.isLoading.set(false);
          const cita = Number(this.route.snapshot.queryParamMap.get('cita'));
          const found = items.find((item) => item.id === cita);
          if (!quiet && found && !this.citaOpened) {
            this.citaOpened = true;
            this.showAppointment({ appointment: found, x: 24, y: 88, maxHeight: 560, history: [] }, this.needsQuote(found));
            // ?cobrar=1 (botón "Cobrar" de Inicio): la ficha abre ya en el cobro.
            if (this.route.snapshot.queryParamMap.get('cobrar') && found.status === 'scheduled') {
              this.startCharge(found);
            }
          } else if (!quiet && !this.scrolledToNow) {
            // Al abrir hoy en Día o Semana, la pantalla baja sola a la hora actual.
            this.scrolledToNow = true;
            setTimeout(() => document.getElementById('now-line')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
          }
        },
        error: (error: unknown) => {
          if (current !== this.requestId) {
            return;
          }
          if (!quiet) {
            this.appointments.set([]);
            this.blocks.set([]);
            this.loadError.set(readError(error, 'No pudimos cargar las citas.'));
          }
          this.isLoading.set(false);
        },
      });
  }

  private durationMinutes(appointment: Appointment): number {
    return this.services().find((item) => item.id === appointment.service_id)?.duration_minutes ?? 60;
  }

  private workingWindow(staffId: number, day: Date): { start: number; end: number } | null {
    const weekday = (day.getDay() + 6) % 7;
    const rows = this.schedules().get(staffId);
    if (!rows || rows.length === 0) {
      return weekday <= 4 ? { start: 9 * 60, end: 18 * 60 } : null;
    }
    const row = rows.find((item) => item.day_of_week === weekday && item.is_active);
    if (!row) {
      return null;
    }
    return { start: minutesOf(row.start_time), end: minutesOf(row.end_time) };
  }
}

function readView(): CalendarView | null {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === 'day' || saved === 'week' || saved === 'month' ? saved : null;
  } catch {
    return null;
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), offset);
}

function buildMonthWeeks(cursor: Date): Date[][] {
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let day = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  while (day <= monthEnd && weeks.length < 6) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
    day = addDays(day, 7);
  }
  return weeks;
}

function toInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseTimestamp(value: string): Date {
  return new Date(value);
}

function minutesOf(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function clockFromMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPeriod(view: CalendarView, cursor: Date, week: Date[]): string {
  if (view === 'month') {
    return capitalize(new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(cursor));
  }
  if (view === 'day') {
    return capitalize(
      new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(cursor),
    );
  }
  const start = week[0];
  const end = week[6];
  const day = new Intl.DateTimeFormat('es-MX', { day: 'numeric' });
  const month = new Intl.DateTimeFormat('es-MX', { month: 'long' });
  if (start.getMonth() === end.getMonth()) {
    return `${day.format(start)} - ${day.format(end)} ${capitalize(month.format(start))}, ${end.getFullYear()}`;
  }
  return `${day.format(start)} ${capitalize(month.format(start))} - ${day.format(end)} ${capitalize(month.format(end))}, ${end.getFullYear()}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function repeatDays(anchor: string, mode: 'day' | 'weekdays' | 'weeks' | 'always'): string[] {
  const [year, month, day] = anchor.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (mode === 'day' || Number.isNaN(date.getTime())) {
    return [anchor];
  }
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const span = mode === 'weekdays' ? 5 : 28;
  const days: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + offset);
    const weekday = next.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    const monthText = String(next.getMonth() + 1).padStart(2, '0');
    const dayText = String(next.getDate()).padStart(2, '0');
    days.push(`${next.getFullYear()}-${monthText}-${dayText}`);
  }
  return days;
}

function monthTheme(month: number): { title: string; mark: string; wash: string; ink: string } | null {
  if (month === 9) {
    return { title: 'Halloween', mark: '🎃', wash: '#fff4e8', ink: '#7c2d12' };
  }
  if (month === 10) {
    return { title: 'Día de Muertos', mark: '🌼', wash: '#fff7ed', ink: '#6b21a8' };
  }
  if (month === 11) {
    return { title: 'Navidad y Año Nuevo', mark: '🎄', wash: '#f0fdf4', ink: '#14532d' };
  }
  if (month === 1) {
    return { title: 'San Valentín', mark: '♥', wash: '#fff1f2', ink: '#9f1239' };
  }
  return null;
}

/** Teléfono para wa.me: solo dígitos; a 10 dígitos (México) se le antepone 52. */
function waPhone(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 10 ? `52${digits}` : digits;
}

function toAmount(value: string | number | null | undefined): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const amount = Number(raw);
  return Number.isNaN(amount) || amount < 0 ? null : amount;
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
