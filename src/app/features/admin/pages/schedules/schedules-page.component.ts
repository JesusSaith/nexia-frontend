import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { BusinessCopy } from '@core/business-copy';
import { Toasts } from '@core/toasts';
import { ScheduleItem } from '@core/models/schedule.model';
import { Staff } from '@core/models/staff.model';
import { SchedulesService, SpecialHours } from '@core/services/schedules.service';
import { ShopService } from '@core/services/shop.service';
import { Appointment } from '@core/models/appointment.model';
import { StaffService } from '@core/services/staff.service';
import { AppointmentsService } from '@core/services/appointments.service';
import { staffColorOf } from '@core/staff-colors';
import { Confirm } from '@shared/components/confirm/confirm';
import { PickFieldComponent, TimeFieldComponent } from '@shared/components/when-field/when-field';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

@Component({
  selector: 'app-schedules-page',
  imports: [
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    PickFieldComponent,
    TimeFieldComponent,
  ],
  templateUrl: './schedules-page.component.html',
})
export class SchedulesPageComponent {
  private readonly schedulesApi = inject(SchedulesService);
  protected readonly copy = inject(BusinessCopy);
  private readonly toasts = inject(Toasts);
  private readonly staffApi = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly shopApi = inject(ShopService);
  /** Citas completadas por día (0 = lunes) y hora, de las últimas 8 semanas. */
  private readonly demand = signal<{ day: number; hour: number; count: number }[]>([]);
  protected readonly specials = signal<SpecialHours[]>([]);
  /** Tras guardar: citas que quedaron fuera del horario nuevo. */
  protected readonly outside = signal<{ count: number; day: string } | null>(null);
  private requestId = 0;
  /** Lo último guardado (o cargado), para saber si hay cambios sin guardar. */
  private readonly snapshot = signal('');
  protected readonly dirty = computed(() => this.snapshot() !== '' && this.snapshot() !== this.state());
  /** Esta persona aún no tiene horario guardado: lo que se ve es una sugerencia. */
  protected readonly notSaved = signal(false);
  /** Hora a agregar en cada día (cada día tiene su propio selector). */
  protected readonly dayDraft = signal<Record<number, string>>({});
  /** Horario de todo el equipo, para la vista de la semana. */
  protected readonly team = signal<Map<number, ScheduleItem[]>>(new Map());
  protected readonly presets = [
    { label: 'Lun a vie 9–18', days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00' },
    { label: 'Lun a sáb 10–20', days: [0, 1, 2, 3, 4, 5], start: '10:00', end: '20:00' },
    { label: 'Mar a sáb 10–19', days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00' },
  ];
  // Horario especial de un día (se guarda como bloqueos antes y después)
  protected special = { date: '', until: '', from: '10:00', to: '14:00', all: false, closed: false, note: '' };
  protected readonly specialError = signal<string | null>(null);

  protected readonly dayLabels = DAY_LABELS;
  protected readonly staff = signal<Staff[]>([]);
  protected readonly staffId = signal<number | null>(null);
  protected readonly days = signal<ScheduleItem[]>(defaultWeek());
  protected readonly isLoadingStaff = signal(true);
  protected readonly isLoadingSchedule = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  protected readonly slotTimes = signal('');
  protected readonly draftClock = signal('09:00');

  constructor() {
    this.loadStaff();
  }

  private state(): string {
    return JSON.stringify([this.days(), this.slotTimes()]);
  }

  private remember(): void {
    this.snapshot.set(this.state());
  }

  /** Lo usa la ruta: pregunta antes de salir con cambios sin guardar. */
  canLeave(): boolean | Promise<boolean> {
    return !this.dirty() || this.confirm.ask({ title: '¿Salir sin guardar?', message: 'Los cambios del horario se perderán.', confirm: 'Salir', danger: true });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) {
      event.preventDefault();
    }
  }

  protected colorOf(staffId: number): string {
    return staffColorOf(this.staff(), staffId);
  }

  /** Semana del equipo: quién trabaja cada día. */
  protected readonly teamWeek = computed(() =>
    DAY_LABELS.map((label, dayOfWeek) => ({
      label,
      people: this.staff()
        .filter((member) => member.is_active)
        .map((member) => {
          const row = (this.team().get(member.id) ?? []).find((item) => item.day_of_week === dayOfWeek && item.is_active);
          return row ? { id: member.id, name: member.full_name.split(' ')[0], hours: `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}` } : null;
        })
        .filter((item): item is { id: number; name: string; hours: string } => item !== null),
    })),
  );

  protected applyPreset(preset: { days: number[]; start: string; end: string }): void {
    this.days.update((items) => items.map((day) => ({ ...day, is_active: preset.days.includes(day.day_of_week), start_time: preset.start, end_time: preset.end })));
    this.savedMessage.set(null);
  }

  /** Igual que el día anterior: horas, descanso y horas fijas. */
  protected sameAsPrevious(dayOfWeek: number): void {
    const before = this.days().find((day) => day.day_of_week === dayOfWeek - 1);
    if (before) {
      this.patchDay(dayOfWeek, { is_active: true, start_time: before.start_time, end_time: before.end_time, break_start: before.break_start ?? '', break_end: before.break_end ?? '', slot_times: before.slot_times ?? '' });
    }
  }

  /** Copia el horario de otra persona (sin guardar todavía). */
  protected copyFrom(value: string | number | null): void {
    const rows = typeof value === 'number' ? this.team().get(value) : null;
    if (rows?.length) {
      this.days.set(mergeWeek(rows));
      this.savedMessage.set(null);
      this.toasts.show('Horario copiado. Revisa y guarda.');
    }
  }

  protected readonly copyPicks = computed(() =>
    this.staff()
      .filter((member) => member.id !== this.staffId() && (this.team().get(member.id) ?? []).length)
      .map((member) => ({ value: member.id, label: member.full_name })),
  );

  /** Guarda este mismo horario para todo el equipo activo. */
  protected async applyToAll(): Promise<void> {
    const people = this.staff().filter((member) => member.is_active);
    const ok = await this.confirm.ask({
      title: '¿Usar este horario para todo el equipo?',
      message: `Se guarda el mismo horario a ${people.length} ${people.length === 1 ? 'persona' : 'personas'} y reemplaza el que tengan.`,
      confirm: 'Aplicar a todos',
    });
    if (!ok || !this.valid()) {
      return;
    }
    this.isLoading.set(true);
    forkJoin(people.map((member) => this.schedulesApi.updateStaffSchedule(member.id, this.days(), member.id === this.staffId() ? this.slotTimes() : member.slot_times ?? '')))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.notSaved.set(false);
          this.remember();
          this.loadTeam();
          this.loadInsights();
          this.toasts.show('Horario aplicado a todo el equipo.');
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.formError.set(readError(error, 'No pudimos aplicar el horario a todos.'));
        },
      });
  }

  /** Un día o un periodo (temporada) con horario distinto; manda sobre el turno normal. */
  protected saveSpecial(): void {
    const { date, until, from, to, all, closed, note } = this.special;
    if (!date || (!closed && (!from || !to || to <= from)) || (until && until < date)) {
      this.specialError.set('Revisa las fechas y que el cierre sea después de la apertura.');
      return;
    }
    this.schedulesApi
      .addSpecial({ staff_id: all ? null : this.staffId(), date_from: date, date_to: until || date, start_time: from, end_time: to, closed, note: note.trim() || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => {
          this.specialError.set(null);
          this.specials.update((rows) => [...rows, row].sort((a, b) => a.date_from.localeCompare(b.date_from)));
          this.special = { date: '', until: '', from: '10:00', to: '14:00', all: false, closed: false, note: '' };
          this.toasts.show('Horario especial guardado.');
        },
        error: (error: unknown) => this.specialError.set(readError(error, 'No pudimos guardar el horario especial.')),
      });
  }

  protected removeSpecial(row: SpecialHours): void {
    this.schedulesApi
      .deleteSpecial(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.specials.update((rows) => rows.filter((item) => item.id !== row.id)));
  }

  protected specialLabel(row: SpecialHours): string {
    const day = (value: string) => new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
    const when = row.date_from === row.date_to ? day(row.date_from) : `${day(row.date_from)} al ${day(row.date_to)}`;
    const who = row.staff_id === null ? 'Todo el equipo' : this.staff().find((member) => member.id === row.staff_id)?.full_name.split(' ')[0] ?? '';
    return `${when} · ${row.closed ? 'Cerrado' : `${row.start_time}–${row.end_time}`} · ${who}${row.note ? ` · ${row.note}` : ''}`;
  }

  /** ±30 min a la apertura o al cierre (más rápido en celular). */
  protected nudge(dayOfWeek: number, field: 'start_time' | 'end_time', minutes: number): void {
    const day = this.days().find((item) => item.day_of_week === dayOfWeek);
    if (!day) {
      return;
    }
    const [hour, minute] = day[field].split(':').map(Number);
    const total = Math.min(23 * 60 + 30, Math.max(0, hour * 60 + minute + minutes));
    this.patchDay(dayOfWeek, { [field]: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` });
  }

  /** Horas de trabajo a la semana (sin descanso), por persona del equipo. */
  protected weeklyHours(rows: ScheduleItem[]): number {
    const minutes = (clock: string) => {
      const [hour, minute] = clock.split(':').map(Number);
      return hour * 60 + (minute || 0);
    };
    const total = rows
      .filter((row) => row.is_active)
      .reduce((sum, row) => sum + Math.max(0, minutes(row.end_time) - minutes(row.start_time) - (row.break_start && row.break_end ? Math.max(0, minutes(row.break_end) - minutes(row.break_start)) : 0)), 0);
    return Math.round(total / 6) / 10;
  }

  protected readonly teamHours = computed(() =>
    this.staff()
      .filter((member) => member.is_active)
      .map((member) => ({ id: member.id, name: member.full_name.split(' ')[0], hours: this.weeklyHours(this.team().get(member.id) ?? []), own: (this.team().get(member.id) ?? []).some((row) => row.is_active) })),
  );
  protected readonly teamHoursTotal = computed(() => Math.round(this.teamHours().reduce((sum, row) => sum + row.hours, 0) * 10) / 10);

  /** Cruza quién trabaja con cuándo llegan las citas: dónde falta gente y dónde sobra. */
  protected readonly coverage = computed(() => {
    const parts = [
      { name: 'en la mañana', from: 0, to: 13 },
      { name: 'en la tarde', from: 13, to: 18 },
      { name: 'en la noche', from: 18, to: 24 },
    ];
    const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
    const people = this.staff().filter((member) => member.is_active);
    const cells: { label: string; staff: number; visits: number }[] = [];
    for (let day = 0; day < 7; day += 1) {
      for (const part of parts) {
        const staff = people.filter((member) =>
          (this.team().get(member.id) ?? []).some((row) => row.is_active && row.day_of_week === day && Number(row.start_time.slice(0, 2)) < part.to && Number(row.end_time.slice(0, 2)) > part.from),
        ).length;
        const visits = this.demand().filter((item) => item.day === day && item.hour >= part.from && item.hour < part.to).reduce((sum, item) => sum + item.count, 0);
        if (staff || visits) {
          cells.push({ label: `Los ${names[day]} ${part.name}`, staff, visits });
        }
      }
    }
    const total = cells.reduce((sum, cell) => sum + cell.visits, 0);
    if (total < 10) {
      return [];
    }
    const perPerson = (cell: { staff: number; visits: number }) => cell.visits / Math.max(cell.staff, 0.5);
    const busy = [...cells].sort((a, b) => perPerson(b) - perPerson(a))[0];
    const idle = [...cells].filter((cell) => cell.staff >= 2).sort((a, b) => perPerson(a) - perPerson(b))[0];
    const out: { tone: string; text: string }[] = [];
    if (busy && busy.visits) {
      out.push({ tone: 'warn', text: `${busy.label} llegan muchas citas (${busy.visits} en 8 semanas) y ${busy.staff ? `solo trabaja${busy.staff === 1 ? '' : 'n'} ${busy.staff}` : 'no trabaja nadie'}.` });
    }
    if (idle && idle !== busy && perPerson(idle) < perPerson(busy) / 3) {
      out.push({ tone: 'info', text: `${idle.label} trabajan ${idle.staff} y casi no hay citas (${idle.visits}): ahí podrías mover a alguien o lanzar una promoción.` });
    }
    return out;
  });

  /** Tocar a alguien en la semana del equipo abre su horario en ese día. */
  protected async editFromTeam(staffId: number, dayOfWeek: number): Promise<void> {
    if (staffId !== this.staffId()) {
      await this.pickStaff(staffId);
    }
    setTimeout(() => document.getElementById(`day-${dayOfWeek}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }

  /** Citas próximas de esta persona que el horario nuevo deja fuera. */
  private outsideOf(rows: Appointment[]): Appointment[] {
    return rows.filter((row) => {
      if (row.status !== 'scheduled' && row.status !== 'awaiting_deposit') {
        return false;
      }
      const start = new Date(row.starts_at);
      const day = this.days().find((item) => item.day_of_week === (start.getDay() + 6) % 7);
      const clock = row.starts_at.slice(11, 16);
      if (!day || !day.is_active || clock < day.start_time || clock >= day.end_time) {
        return true;
      }
      return Boolean(day.break_start && day.break_end && clock >= day.break_start && clock < day.break_end);
    });
  }

  protected setDayDraft(dayOfWeek: number, value: string): void {
    this.dayDraft.update((drafts) => ({ ...drafts, [dayOfWeek]: value }));
  }

  protected readonly staffPicks = computed(() =>
    this.staff().map((member) => ({ value: member.id, label: member.full_name })),
  );

  protected async pickStaff(value: string | number | null): Promise<void> {
    if (this.dirty() && !(await this.confirm.ask({ title: '¿Cambiar sin guardar?', message: 'Los cambios de este horario se perderán.', confirm: 'Cambiar', danger: true }))) {
      return;
    }
    this.onStaff(typeof value === 'number' ? value : '');
  }

  protected onStaff(value: number | ''): void {
    const staffId = value === '' ? null : value;
    this.staffId.set(staffId);
    this.slotTimes.set(this.staff().find((member) => member.id === staffId)?.slot_times ?? '');
    this.savedMessage.set(null);
    this.formError.set(null);
    if (staffId === null) {
      this.days.set(defaultWeek());
      return;
    }
    this.loadSchedule(staffId);
  }

  protected setActive(dayOfWeek: number, isActive: boolean): void {
    this.patchDay(dayOfWeek, { is_active: isActive });
  }

  protected patchBreak(dayOfWeek: number, field: 'break_start' | 'break_end', value: string): void {
    this.patchDay(dayOfWeek, { [field]: value ? value.slice(0, 5) : '' });
  }

  protected setTime(dayOfWeek: number, field: 'start_time' | 'end_time', value: string): void {
    if (!value) {
      return;
    }
    this.patchDay(dayOfWeek, { [field]: value.slice(0, 5) });
  }

  protected clocks(): string[] {
    return this.slotTimes()
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  protected addClock(): void {
    const clock = this.draftClock().slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(clock) || this.clocks().includes(clock)) {
      return;
    }
    this.slotTimes.set([...this.clocks(), clock].sort().join(', '));
    this.formError.set(null);
  }

  protected removeClock(clock: string): void {
    this.slotTimes.set(this.clocks().filter((item) => item !== clock).join(', '));
  }

  protected dayClocks(day: ScheduleItem): string[] {
    return (day.slot_times ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  protected addDayClock(dayOfWeek: number): void {
    const clock = (this.dayDraft()[dayOfWeek] ?? '').slice(0, 5);
    const day = this.days().find((item) => item.day_of_week === dayOfWeek);
    if (!day || !/^\d{2}:\d{2}$/.test(clock) || this.dayClocks(day).includes(clock)) {
      return;
    }
    this.patchDay(dayOfWeek, { slot_times: [...this.dayClocks(day), clock].sort().join(', ') });
  }

  protected removeDayClock(dayOfWeek: number, clock: string): void {
    const day = this.days().find((item) => item.day_of_week === dayOfWeek);
    if (!day) {
      return;
    }
    this.patchDay(dayOfWeek, { slot_times: this.dayClocks(day).filter((item) => item !== clock).join(', ') });
  }

  protected copyClocksToDays(): void {
    const raw = this.clocks().join(', ');
    this.days.update((items) => items.map((day) => (day.is_active ? { ...day, slot_times: raw } : day)));
    this.savedMessage.set(null);
  }

  protected preview(day: ScheduleItem): string {
    if (!day.is_active) {
      return 'Día cerrado.';
    }
    const own = this.dayClocks(day);
    const clocks = own.length ? own : this.clocks();
    const pause = day.break_start && day.break_end ? ` Descanso ${day.break_start}–${day.break_end}.` : '';
    if (!clocks.length) {
      return `Horarios seguidos, según la duración del servicio.${pause}`;
    }
    const shown = clocks.filter(
      (clock) => clock >= day.start_time && clock <= day.end_time && !this.inBreak(clock, day),
    );
    if (!shown.length) {
      return `Ninguna hora cabe en este turno.${pause}`;
    }
    return `${shown.join(' · ')}${own.length ? '' : ' (las de arriba)'}.${pause}`;
  }

  protected applyMondayToWorkdays(): void {
    const monday = this.days().find((day) => day.day_of_week === 0);
    if (!monday) {
      return;
    }
    this.days.update((items) =>
      items.map((day) =>
        day.day_of_week >= 1 && day.is_active
          ? {
              ...day,
              start_time: monday.start_time,
              end_time: monday.end_time,
              slot_times: monday.slot_times ?? '',
              break_start: monday.break_start ?? '',
              break_end: monday.break_end ?? '',
            }
          : day,
      ),
    );
    this.savedMessage.set(null);
  }

  private inBreak(clock: string, day: ScheduleItem): boolean {
    return !!day.break_start && !!day.break_end && clock >= day.break_start && clock < day.break_end;
  }

  protected save(): void {
    const staffId = this.staffId();
    if (staffId === null || this.isLoading()) {
      return;
    }

    const clocks = this.clocks();

    if (!this.valid()) {
      return;
    }
    const broken = this.days().find(
      (day) => day.is_active && ((day.break_start && !day.break_end) || (!day.break_start && day.break_end) || (day.break_start && day.break_end && day.break_end <= day.break_start)),
    );
    if (broken) {
      this.formError.set(`Revisa el descanso de ${DAY_LABELS[broken.day_of_week]}.`);
      this.savedMessage.set(null);
      return;
    }

    const invalid = this.days().find((day) => day.is_active && day.end_time <= day.start_time);
    if (invalid) {
      this.formError.set(
        `En ${DAY_LABELS[invalid.day_of_week]} la hora de fin debe ser posterior a la de inicio.`,
      );
      this.savedMessage.set(null);
      return;
    }

    void this.checkThenSave(staffId, clocks);
  }

  private async checkThenSave(staffId: number, clocks: string[]): Promise<void> {
    const today = new Date();
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const upcoming = await new Promise<Appointment[]>((resolve) =>
      this.appointmentsApi
        .getAppointments({ staff_id: staffId, start_date: key(today), end_date: key(new Date(today.getTime() + 120 * 86_400_000)) })
        .pipe(catchError(() => of([] as Appointment[])))
        .subscribe(resolve),
    );
    const left = this.outsideOf(upcoming);
    if (
      left.length &&
      !(await this.confirm.ask({
        title: `Quedan ${left.length} ${left.length === 1 ? 'cita' : 'citas'} fuera del nuevo horario`,
        message: 'No se cancelan solas. Guarda y después muévelas en la Agenda (te dejamos el enlace), o regresa a ajustar el horario.',
        confirm: 'Guardar de todos modos',
        cancel: 'Revisar horario',
      }))
    ) {
      return;
    }
    this.outside.set(left.length ? { count: left.length, day: left[0].starts_at.slice(0, 10) } : null);
    this.isLoading.set(true);
    this.formError.set(null);
    this.savedMessage.set(null);

    this.schedulesApi
      .updateStaffSchedule(staffId, this.days(), clocks.join(', '))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.days.set(mergeWeek(rows));
          this.notSaved.set(false);
          this.remember();
          this.team.update((teamMap) => new Map(teamMap).set(staffId, rows));
          this.staff.update((list) =>
            list.map((member) => (member.id === staffId ? { ...member, slot_times: clocks.join(', ') || null } : member)),
          );
          this.isLoading.set(false);
          this.savedMessage.set('Horario guardado.');
          this.toasts.show('Se guardó el horario.');
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.formError.set(readError(error, 'No pudimos guardar el horario.'));
        },
      });
  }

  private loadStaff(): void {
    this.staffApi
      .getStaff()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (staff) => {
          this.staff.set(staff);
          this.isLoadingStaff.set(false);
          // Desde Equipo llega ?staff=ID para abrir directo su horario.
          const asked = Number(this.route.snapshot.queryParamMap.get('staff'));
          const first = staff.find((member) => member.id === asked) ?? staff.find((member) => member.is_active) ?? staff[0];
          if (first) {
            this.onStaff(first.id);
          }
          this.loadTeam();
        },
        error: (error: unknown) => {
          this.staff.set([]);
          this.isLoadingStaff.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el equipo.'));
        },
      });
  }

  private loadSchedule(staffId: number): void {
    const current = ++this.requestId;
    this.isLoadingSchedule.set(true);
    this.loadError.set(null);

    this.schedulesApi
      .getStaffSchedule(staffId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (current !== this.requestId) {
            return;
          }
          this.days.set(rows.length === 0 ? defaultWeek() : mergeWeek(rows));
          this.notSaved.set(rows.length === 0);
          this.isLoadingSchedule.set(false);
          this.remember();
        },
        error: (error: unknown) => {
          if (current !== this.requestId) {
            return;
          }
          this.days.set([]);
          this.isLoadingSchedule.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el horario.'));
        },
      });
  }

  private loadInsights(): void {
    this.schedulesApi.listSpecial().pipe(catchError(() => of([] as SpecialHours[])), takeUntilDestroyed(this.destroyRef)).subscribe((rows) => this.specials.set(rows));
    const today = new Date();
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.shopApi
      .report(key(new Date(today.getTime() - 56 * 86_400_000)), key(today))
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((report) => this.demand.set(report?.busy_hours ?? []));
  }

  private loadTeam(): void {
    const people = this.staff();
    if (!people.length) {
      return;
    }
    forkJoin(people.map((member) => this.schedulesApi.getStaffSchedule(member.id).pipe(catchError(() => of([] as ScheduleItem[])), map((rows) => [member.id, rows] as const))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.team.set(new Map(rows)));
  }

  /** Horas fijas con formato válido (las del día cerrado no cuentan). */
  private valid(): boolean {
    const clocks = this.clocks();
    if (clocks.some((part) => !/^\d{2}:\d{2}$/.test(part))) {
      this.formError.set('Escribe los horarios como 09:30, 12:30, 15:00, 18:00.');
      return false;
    }
    return true;
  }

  private patchDay(dayOfWeek: number, patch: Partial<ScheduleItem>): void {
    this.days.update((items) =>
      items.map((day) => (day.day_of_week === dayOfWeek ? { ...day, ...patch } : day)),
    );
    this.savedMessage.set(null);
  }
}

function defaultWeek(): ScheduleItem[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    start_time: '09:00',
    end_time: '18:00',
    is_active: dayOfWeek <= 4,
    slot_times: '',
    break_start: '',
    break_end: '',
  }));
}

function mergeWeek(rows: ScheduleItem[]): ScheduleItem[] {
  const byDay = new Map(rows.map((row) => [row.day_of_week, row]));
  return defaultWeek().map((fallback) => {
    const row = byDay.get(fallback.day_of_week);
    if (!row) {
      return fallback;
    }
    return {
      day_of_week: row.day_of_week,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      is_active: row.is_active,
      slot_times: row.slot_times ?? '',
      break_start: row.break_start?.slice(0, 5) ?? '',
      break_end: row.break_end?.slice(0, 5) ?? '',
    };
  });
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
    if (Array.isArray(detail)) {
      const message = detail
        .map((item) => (typeof item?.msg === 'string' ? item.msg : ''))
        .filter(Boolean)
        .join(' ');
      if (message) {
        return message;
      }
    }
  }
  return fallback;
}
