import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Appointment, AppointmentStatus } from '@core/models/appointment.model';
import { ScheduleItem } from '@core/models/schedule.model';
import { Service } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { AppointmentsService } from '@core/services/appointments.service';
import { AuthService } from '@core/services/auth.service';
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
}

const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 28;
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const SLOTS = Array.from(
  { length: (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES },
  (_, index) => DAY_START_MINUTES + index * SLOT_MINUTES,
);

@Component({
  selector: 'app-agenda-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './agenda-page.component.html',
})
export class AgendaPageComponent {
  private readonly auth = inject(AuthService);
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
  protected readonly slots = SLOTS;
  protected readonly gridHeight = SLOTS.length * SLOT_HEIGHT;

  protected readonly isStaff = this.auth.isStaff;
  protected readonly currentView = signal<CalendarView>('week');
  protected readonly cursor = signal(startOfDay(new Date()));
  protected readonly serviceId = signal<number | null>(null);
  protected readonly staffId = signal<number | null>(null);
  protected readonly services = signal<Service[]>([]);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly schedules = signal<ReadonlyMap<number, ScheduleItem[]>>(new Map());
  protected readonly appointments = signal<Appointment[]>([]);
  protected readonly selected = signal<SelectedAppointment | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

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
  });

  protected readonly activeServices = computed(() => this.services().filter((item) => item.is_active));
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

  constructor() {
    this.destroyRef.onDestroy(() => this.dialogRef?.close());
    this.loadCatalog();
    effect(() => {
      if (!this.ownStaffReady()) {
        return;
      }
      const range = this.range();
      const staffId = this.staffId();
      const serviceId = this.serviceId();
      this.loadAppointments(range, staffId, serviceId);
    });
  }

  protected setView(view: CalendarView): void {
    this.currentView.set(view);
    this.selected.set(null);
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
  }

  protected onService(value: number | ''): void {
    this.serviceId.set(value === '' ? null : value);
    this.selected.set(null);
  }

  protected onStaff(value: number | ''): void {
    if (this.isStaff()) {
      return;
    }
    this.staffId.set(value === '' ? null : value);
    this.selected.set(null);
  }

  protected openDay(day: Date): void {
    this.cursor.set(startOfDay(day));
    this.currentView.set('day');
    this.selected.set(null);
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
    return this.appointments().filter(
      (item) => item.starts_at.startsWith(key) && (staffId == null || item.staff_id === staffId),
    );
  }

  protected preview(day: Date): Appointment[] {
    return this.appointmentsOn(day).slice(0, 3);
  }

  protected hiddenCount(day: Date): number {
    return Math.max(0, this.appointmentsOn(day).length - 3);
  }

  protected formatTime(value: string): string {
    const parsed = parseTimestamp(value);
    return Number.isNaN(parsed.getTime()) ? value : this.timeFormat.format(parsed);
  }

  protected slotLabel(minutes: number): string {
    return clockFromMinutes(minutes);
  }

  protected statusLabel(status: AppointmentStatus): string {
    return STATUS_LABELS[status];
  }

  protected statusClass(status: AppointmentStatus): string {
    if (status === 'completed') {
      return 'bg-emerald-100 text-emerald-900';
    }
    if (status === 'cancelled') {
      return 'bg-slate-200 text-slate-500 line-through';
    }
    return 'bg-rose-100 text-rose-900';
  }

  protected blockStyle(appointment: Appointment): { top: string; height: string } {
    const start = parseTimestamp(appointment.starts_at);
    const minutes = start.getHours() * 60 + start.getMinutes();
    const span = DAY_END_MINUTES - DAY_START_MINUTES;
    const top = clamp(((minutes - DAY_START_MINUTES) / span) * 100, 0, 98);
    const height = clamp((this.durationMinutes(appointment) / span) * 100, 4, 100 - top);
    return { top: `${top}%`, height: `${height}%` };
  }

  protected availabilityStyle(staffId: number, day: Date): { top: string; height: string } | null {
    const window = this.workingWindow(staffId, day);
    if (!window) {
      return null;
    }
    const span = DAY_END_MINUTES - DAY_START_MINUTES;
    const start = clamp(((window.start - DAY_START_MINUTES) / span) * 100, 0, 100);
    const end = clamp(((window.end - DAY_START_MINUTES) / span) * 100, 0, 100);
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
    this.form.reset({
      service_id: this.serviceId(),
      staff_id: staffId ?? this.staffId(),
      date: toInputDate(day),
      time: clockFromMinutes(minutes),
      client_name: '',
      client_phone: '',
      client_email: '',
      notes: '',
    });
    if (this.isStaff()) {
      this.form.controls.staff_id.disable();
    }
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  protected openCreate(): void {
    this.openCreateAt(this.cursor(), 9 * 60, this.staffId() ?? undefined);
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
        notes: value.notes.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeEditor();
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos agendar la cita.'));
        },
      });
  }

  protected openAppointment(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    const width = 288;
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 240));
    this.selected.set({ appointment, x, y });
  }

  protected closeAppointment(): void {
    this.selected.set(null);
  }

  protected setStatus(appointment: Appointment, status: AppointmentStatus): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(appointment.id);
    this.appointmentsApi
      .updateStatus(appointment.id, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          const next = { ...appointment, ...updated, status: updated.status ?? status };
          this.appointments.update((items) => items.map((item) => (item.id === appointment.id ? next : item)));
          this.selected.update((current) =>
            current?.appointment.id === appointment.id ? { ...current, appointment: next } : current,
          );
          this.pendingId.set(null);
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.loadError.set(readError(error, 'No pudimos actualizar la cita.'));
        },
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

  private loadAppointments(range: DateRange, staffId: number | null, serviceId: number | null): void {
    const current = ++this.requestId;
    this.isLoading.set(true);
    this.loadError.set(null);
    this.appointmentsApi
      .getAppointments({
        start_date: range.start,
        end_date: range.end,
        staff_id: staffId,
        service_id: serviceId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          if (current !== this.requestId) {
            return;
          }
          this.appointments.set(items);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          if (current !== this.requestId) {
            return;
          }
          this.appointments.set([]);
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar las citas.'));
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

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
  }
  return fallback;
}
