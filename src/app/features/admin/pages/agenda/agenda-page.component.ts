import { HttpErrorResponse } from '@angular/common/http';
import { FormStatusComponent } from '@shared/components/form-status/form-status';
import { pesos } from '@core/money';
import { canSplitPay, splitCardAmount, splitProblem, tipOnCard, toAmount } from '@core/split-pay';
import { SplitPay } from '@shared/components/split-pay/split-pay';
import { hora12 } from '../../../../core/hours';
import { HoraPipe } from '../../../../shared/pipes/hora.pipe';
import { NgTemplateOutlet } from '@angular/common';
import { SegmentedDirective } from '@shared/directives/segmented.directive';
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
import { MatMenuModule } from '@angular/material/menu';
import { Loader } from '@shared/components/loader/loader';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom, forkJoin, interval, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { Progress, appointmentProgress, attendanceState } from '@core/appointment-progress';
import { closureOn, closureSpan, noteOf } from '@core/shop-note';
import { Closure } from '@core/models/business.model';
import { staffColorOf } from '@core/staff-colors';
import { ALL_METHODS, METHOD_LABELS, PAYMENT_METHODS } from '@core/payment-methods';
import { agendaTourSteps } from '@core/tour';
import { TourComponent } from '@shared/components/tour/tour';
import { DragTarget, dragTarget } from '@core/drag-move';
import { updatedAgo } from '@core/updated-ago';
import { Skeleton } from '@shared/components/skeleton/skeleton';
import { buildDaySheet, daySheetHtml, daySheetText } from '@core/day-sheet';
import { MessageVars, firstName, isPhone, longDay, whatsappLink } from '@core/message-templates';
import { Toasts } from '@core/toasts';
import { AdminAppointmentCreate, AdminAppointmentUpdate, Appointment, AppointmentCorrection, AppointmentStatus, FreeTimes, PastHour, VisitPart } from '@core/models/appointment.model';
import { ScheduleItem } from '@core/models/schedule.model';
import { Service } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { MultiSelectFieldComponent } from '@shared/components/multi-select/multi-select';
import { DateFieldComponent, PickFieldComponent, PickOption, TimeFieldComponent } from '@shared/components/when-field/when-field';
import { AgendaService } from '@core/services/agenda.service';
import { AppointmentsService, StatusCharge, TimeBlock } from '@core/services/appointments.service';
import { ShopProduct, ShopService } from '@core/services/shop.service';
import { BusinessClock } from '@core/business-clock';
import { AuthService } from '@core/services/auth.service';
import { PackagesService, VisitPackage } from '@core/services/packages.service';
import { BookingService } from '@core/services/booking.service';
import { ReviewsService } from '@core/services/reviews.service';
import { SchedulesService, SpecialHours } from '@core/services/schedules.service';
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
/** "13:30" → "1:30p", "09:00" → "9a": hora corta para las celdas del mes. */
function compactTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'p' : 'a';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

@Component({
  selector: 'app-agenda-page',
  imports: [MultiSelectFieldComponent, SegmentedDirective, FormStatusComponent, SplitPay,
    HoraPipe,
    NgTemplateOutlet,
    Skeleton,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatMenuModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    Loader,
    MatSelectModule,
    DateFieldComponent,
    TimeFieldComponent,
    PickFieldComponent,
    TourComponent,
  ],
  templateUrl: './agenda-page.component.html',
})
export class AgendaPageComponent {
  private readonly auth = inject(AuthService);
  /** "Hoy" y "ahora" son los del negocio, no los del navegador. */
  private readonly clock = inject(BusinessClock);
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
  private readonly packagesApi = inject(PackagesService);
  /** Paquetes con visitas por usar, para avisar al abrir la cita y al cobrar. */
  private readonly packages = signal<VisitPackage[]>([]);
  protected readonly petName = signal('');
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly servicesApi = inject(ServicesService);
  private readonly staffApi = inject(StaffService);
  private readonly schedulesApi = inject(SchedulesService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private readonly fixer = viewChild.required<TemplateRef<unknown>>('fixer');
  private readonly changer = viewChild.required<TemplateRef<unknown>>('changer');
  private dialogRef: MatDialogRef<unknown> | null = null;
  private requestId = 0;
  private readonly ownStaffReady = signal(!inject(AuthService).isStaff());
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
  });

  protected readonly views: { id: CalendarView; label: string }[] = [
    { id: 'month', label: 'Mes' },
    { id: 'week', label: 'Semana' },
    { id: 'day', label: 'Día' },
  ];
  protected readonly weekdayLabels = WEEKDAY_LABELS;

  protected readonly isStaff = this.auth.isStaff;
  /** Recorrido de primera vez (se muestra una sola vez; la Ayuda lo repite). */
  protected readonly tourSteps = computed(() => agendaTourSteps(typeof window !== 'undefined' && window.innerWidth < 768, this.copy.text().visit));
  protected readonly focus = signal<'missed' | 'deposit' | null>(null);
  // Abre en la última vista elegida; la primera vez, Día en celular y Semana en escritorio.
  protected readonly currentView = signal<CalendarView>(readView() ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'));
  /** Hora actual, al minuto: línea de "ahora" en Día y Semana. */
  protected readonly now = signal(this.clock.nowMs());
  /** Cuándo llegó la última lista del servidor, para mostrar "Actualizado hace 1 min". */
  protected readonly updatedAt = signal<number | null>(null);
  protected readonly updatedLabel = computed(() => updatedAgo(this.updatedAt(), this.now()));
  protected readonly legendOpen = signal(false);
  /** Celular: los filtros de servicio y equipo se abren con el botón "Filtros". */
  protected readonly filtersOpen = signal(false);
  /** Primera carga de la agenda: se muestra un esqueleto en lugar de una cuadrícula vacía. */
  protected readonly firstLoad = computed(() => this.isLoading() && this.updatedAt() === null);

  /** Botón "Actualizar": vuelve a pedir la agenda con el indicador de carga. */
  protected refreshNow(): void {
    if (!this.isLoading()) {
      this.loadAppointments(this.range(), this.staffId(), this.serviceId());
    }
  }
  private scrolledToNow = false;
  protected readonly openTimes = signal<string[]>([]);
  protected readonly holdHours = signal(3);
  /** Días que el negocio marcó como cerrados en Configuración (festivos, vacaciones). */
  private readonly closures = signal<Closure[]>([]);
  protected readonly depositRules = signal<{ account: string | null; amount: number | null; percent: number | null }>({
    account: null,
    amount: null,
    percent: null,
  });
  protected readonly exporting = signal(false);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly linkCopied = signal(false);
  protected readonly monthService = computed(() => this.pickedService()?.name ?? '');
  protected readonly cursor = signal(startOfDay(this.clock.now()));
  protected readonly serviceId = signal<number | null>(null);
  protected readonly staffId = signal<number | null>(null);
  protected readonly services = signal<Service[]>([]);
  protected readonly staff = signal<Staff[]>([]);
  protected readonly schedules = signal<ReadonlyMap<number, ScheduleItem[]>>(new Map());
  /** Horarios especiales que tocan el rango a la vista (incluso de días que ya pasaron): mandan sobre el turno normal. */
  private readonly specials = signal<SpecialHours[]>([]);
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
  private readonly blockTick = signal(0);
  /** Lo que falta para guardar el bloqueo: el botón queda apagado y se dice qué es. */
  protected readonly blockMissing = computed<string[]>(() => {
    this.blockTick();
    const value = this.blockForm.getRawValue();
    const list: string[] = [];
    if (value.staff_id == null) {
      list.push(this.copy.text().person.toLowerCase());
    }
    if (!value.date) {
      list.push('el día');
    }
    if (!value.start || !value.end || value.start >= value.end) {
      list.push('que la hora de fin sea después de la de inicio');
    }
    return list;
  });
  protected readonly selected = signal<SelectedAppointment | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly slotTimes = signal<string[]>([]);
  protected readonly slotsReady = signal(false);
  /** Quién ocupa cada hora ocupada de la lista ("12:30": "Alejandra"). */
  protected readonly busyLabels = signal<Record<string, string>>({});
  /** Cuántas horas libres hay (la lista también trae las ocupadas, atenuadas). */
  protected readonly freeCount = signal(0);
  /** Si no hay horas libres: por qué y cuál es el siguiente día libre. */
  protected readonly dayReason = signal<string | null>(null);
  protected readonly dayNote = signal<string | null>(null);
  protected readonly nextDay = signal<string | null>(null);
  /** Escribir una hora que no está en la lista (fuera del turno); se pregunta antes de guardar. */
  protected readonly customTime = signal(false);
  protected readonly guests = signal<{ phone: string; visit_count: number; total_spent: number; cancel_count: number; full_name: string }[]>([]);
  protected readonly known = signal<{ visit_count: number; total_spent: number; cancel_count: number; full_name: string; last_service_id?: number | null; last_staff_id?: number | null } | null>(null);
  protected readonly freshPhone = signal(false);
  protected readonly freed = signal<{ name: string; href: string }[]>([]);
  private readonly pesosFormat = { format: pesos };
  protected readonly bookableDay = (iso: string): boolean => {
    const staffId = this.form.controls.staff_id.value;
    if (staffId == null) {
      return false;
    }
    const day = new Date(`${iso}T12:00:00`);
    const today = this.clock.today();
    const oldest = new Date(today);
    oldest.setDate(oldest.getDate() - 365);
    return day >= oldest && this.workingWindow(staffId, day) !== null;
  };

  /** Quien escribió por Instagram o Messenger y no tiene celular: se agenda con su usuario. */
  protected readonly noPhone = signal(false);
  protected readonly contactChannel = signal<'instagram' | 'messenger' | 'facebook' | 'otro'>('instagram');
  protected readonly contactHandle = signal('');
  protected readonly contactChannels: { value: 'instagram' | 'messenger' | 'facebook' | 'otro'; label: string }[] = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'messenger', label: 'Messenger' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'otro', label: 'Otro' },
  ];
  private readonly formTick = signal(0);
  /** Lo que falta para poder guardar. Mientras haya algo, el botón Guardar queda apagado y se dice qué es. */
  protected readonly missing = computed<string[]>(() => {
    this.formTick();
    const value = this.form.getRawValue();
    const list: string[] = [];
    if (value.service_id == null) {
      list.push('el servicio');
    }
    if (value.staff_id == null) {
      list.push(`${this.copy.text().person.toLowerCase()}`);
    }
    if (!value.date) {
      list.push('la fecha');
    }
    if (!value.time) {
      list.push('la hora');
    }
    if (!value.client_name.trim()) {
      list.push(`el nombre del ${this.copy.text().client.toLowerCase()}`);
    }
    if (this.noPhone()) {
      const handle = this.contactHandle().trim();
      if (handle.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(handle)) {
        list.push('su usuario o nombre en la red');
      }
    } else if (!isPhone(value.client_phone)) {
      list.push('el teléfono de 10 dígitos');
    }
    if (value.client_email.trim() && this.form.controls.client_email.invalid) {
      list.push('un correo válido');
    }
    if (this.pastVisit() && this.pastOutcome() === 'done' && this.priceAtVisit(value.service_id) && !String(value.quoted_price ?? '').trim()) {
      list.push('cuánto se cobró');
    }
    if (this.pastVisit() && this.pastOutcome() === 'done' && this.pastSplitBad()) {
      list.push('cuánto pagó con tarjeta');
    }
    if (!this.pastVisit() && value.deposit_mode === 'received' && !(Number(value.deposit_received) > 0)) {
      list.push('cuánto anticipo te mandó');
    }
    return list;
  });

  /** La fecha y hora del formulario ya pasaron: se registra una cita que ocurrió, sin anticipo ni avisos. */
  protected readonly pastVisit = signal(false);
  protected readonly pastOutcome = signal<'done' | 'no_show'>('done');
  protected readonly pastMethod = signal('efectivo');
  protected readonly pastTip = signal('');
  protected readonly pastNote = signal('');
  protected readonly pastSplitOn = signal(false);
  protected readonly pastSplitCard = signal('');
  protected readonly pastTipCard = signal(false);
  protected readonly busyTimes = signal<string[]>([]);
  protected readonly pastMethods = computed(() => this.payMethods().filter((item) => item.value !== 'paquete'));


  protected readonly form = new FormGroup({
    service_id: new FormControl<number | null>(null, Validators.required),
    staff_id: new FormControl<number | null>(null, Validators.required),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    client_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    // El teléfono es obligatorio salvo que no tenga celular: eso lo revisa `missing()`.
    client_phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(32)],
    }),
    client_email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    quoted_price: new FormControl('', { nonNullable: true }),
    // Anticipo: 'auto' (como lo pide el negocio), 'none' (sin anticipo) o 'received' (ya lo recibió por fuera, con su monto).
    deposit_mode: new FormControl<'auto' | 'none' | 'received'>('auto', { nonNullable: true }),
    deposit_received: new FormControl('', { nonNullable: true }),
  });

  protected readonly activeServices = computed(() => this.services().filter((item) => item.is_active && !item.is_hold));
  /** Servicios agrupados por categoría; los que la persona elegida no hace salen apagados con el motivo en vez de desaparecer. */
  protected readonly servicePicks = computed(() => {
    this.formTick();
    const member = this.staff().find((item) => item.id === this.form.getRawValue().staff_id);
    return [{ value: null, label: 'Elegir' }, ...this.serviceOptions(member)];
  });
  private serviceOptions(member: { full_name: string; service_ids?: number[] } | undefined, skip: Set<number | null> = new Set()): PickOption[] {
    return this.activeServices()
      .filter((item) => !skip.has(item.id))
      .map((item) => {
        const blocked = !!member?.service_ids && !member.service_ids.includes(item.id);
        return { value: item.id, label: item.name, group: item.category?.trim() || 'Otros', disabled: blocked, hint: blocked ? `No lo hace ${firstName(member!.full_name)}` : undefined };
      })
      .sort((a, b) => (a.group === 'Otros' ? 1 : 0) - (b.group === 'Otros' ? 1 : 0) || a.group.localeCompare(b.group));
  }
  // Varios servicios en una misma visita (solo al crear): los extras siguen al principal; los "después" van en un segundo horario del mismo día.
  protected readonly extraIds = signal<number[]>([]);
  protected readonly laterIds = signal<number[]>([]);
  protected readonly laterTime = signal('');
  protected readonly laterSlots = signal<string[]>([]);
  protected readonly visitParts = signal<VisitPart[]>([]);
  private readonly maxVisitServices = 5;
  protected readonly extraServices = computed(() => this.byIds(this.extraIds()));
  protected readonly laterServices = computed(() => this.byIds(this.laterIds()));
  protected readonly visitCount = computed(() => 1 + this.extraIds().length + this.laterIds().length);
  /** Servicios que lleva la otra parte de la visita (al editar una cita partida en dos horarios): cuentan para el tope de 5. */
  protected readonly partnerServices = signal(0);
  protected readonly canAddService = computed(() => this.visitCount() + this.partnerServices() < this.maxVisitServices);
  protected readonly laterMinutes = computed(() => this.laterServices().reduce((sum, item) => sum + item.duration_minutes, 0));
  /** Servicios que se pueden sumar: los de la lista que no están ya y que la persona elegida hace. */
  protected readonly extraPicks = computed(() => {
    this.formTick();
    const { service_id, staff_id } = this.form.getRawValue();
    return this.serviceOptions(this.staff().find((member) => member.id === staff_id), new Set([service_id]));
  });
  protected readonly staffPicks = computed(() => [
    { value: null, label: 'Elegir' },
    ...this.staff()
      .filter((member) => member.is_active)
      .map((member) => ({ value: member.id, label: member.full_name })),
  ]);
  /** Horas como botones: la primera libre (para el botón "Primer horario libre") y quitar la rueda salvo en "Otra hora". */
  protected readonly firstFree = computed(() => {
    const busy = new Set(this.busyTimes());
    return this.slotTimes().find((time) => !busy.has(time)) ?? null;
  });
  protected readonly selectedBusy = computed(() => {
    this.formTick();
    return this.busyTimes().includes(this.form.controls.time.value);
  });

  protected clock12(time: string): string {
    return hora12(time);
  }

  protected pickTime(time: string): void {
    this.form.controls.time.setValue(time);
    this.form.controls.time.markAsDirty();
  }

  /** Cliente que ya vino: ofrece repetir su última visita (servicio y persona) con un toque. */
  protected readonly repeatLast = computed(() => {
    this.formTick();
    const person = this.known();
    if (this.editingId() !== null || !person?.last_service_id) {
      return null;
    }
    const service = this.activeServices().find((item) => item.id === person.last_service_id);
    const member = this.staff().find((item) => item.id === person.last_staff_id && item.is_active);
    if (!service || this.form.controls.service_id.value === service.id) {
      return null;
    }
    return { service, member: this.isStaff() ? null : (member ?? null) };
  });

  protected applyLast(): void {
    const last = this.repeatLast();
    if (!last) {
      return;
    }
    this.form.controls.service_id.setValue(last.service.id);
    if (last.member) {
      this.form.controls.staff_id.setValue(last.member.id);
    }
  }

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
  /** El cierre de ese día ("Navidad", "Vacaciones") o null si se abre normal. */
  protected closureFor(day: Date): Closure | null {
    return closureOn(toInputDate(day), noteOf({ closures: this.closures() }));
  }

  protected closureName(row: Closure): string {
    return row.label || 'Cerrado';
  }

  /** Aviso arriba de la agenda: en la vista de día, ese cierre; en la semana, los que caen en ella. */
  protected readonly closureNotice = computed(() => {
    const view = this.currentView();
    if (view === 'month' || !this.closures().length) {
      return '';
    }
    const days = view === 'day' ? [this.cursor()] : this.weekDays();
    const names = [...new Set(days.map((day) => this.closureFor(day)).filter((row): row is Closure => row !== null).map((row) => this.closureName(row)))];
    if (!names.length) {
      return '';
    }
    return view === 'day' ? `Este día está marcado como cerrado (${names[0]}). Las citas que ya tienes se respetan.` : `Esta semana hay días cerrados: ${names.join(', ')}.`;
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
    const visibleIds = new Set(this.visibleStaff().map((member) => member.id));
    for (const row of this.specials()) {
      if (!row.closed && (row.staff_id === null || visibleIds.has(row.staff_id))) {
        start = Math.min(start, minutesOf(row.start_time));
        end = Math.max(end, minutesOf(row.end_time));
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
    this.packagesApi
      .list()
      .pipe(catchError(() => of([] as VisitPackage[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.packages.set(rows));
    this.loadCatalog();
    this.booking
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((brand) => {
        this.holdHours.set(brand.deposit_hold_hours || 3);
        this.closures.set(brand.closures ?? []);
        this.staffCanEditPrice.set(brand.staff_can_edit_price === true);
        this.depositCancelPolicy.set(brand.deposit_cancel_policy === 'keep' ? 'keep' : 'refund');
        this.acceptedMethods.set(brand.payment_methods?.length ? brand.payment_methods : ALL_METHODS);
        this.cardFeeRate.set(brand.card_fee_percent ? (brand.card_fee_percent / 100) * (brand.card_fee_iva ? 1.16 : 1) : 0);
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
    this.blockForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.blockTick.update((count) => count + 1));
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formTick.update((count) => count + 1);
      const { date, time } = this.form.getRawValue();
      const today = toInputDate(this.clock.now());
      const now = this.clock.now();
      this.pastVisit.set(this.editingId() === null && !!date && (date < today || (date === today && !!time && time < clockFromMinutes(now.getHours() * 60 + now.getMinutes()))));
    });
    this.form.valueChanges
      .pipe(
        map((value) => `${value.service_id ?? ''}|${value.staff_id ?? ''}|${value.date}|${this.editingId() ?? ''}|${this.firstPartMinutes(value.service_id ?? null) ?? ''}`),
        distinctUntilChanged(),
        switchMap((key) => {
          const [serviceId, staffId, date, editing, visitMinutes] = key.split('|');
          const slug = this.auth.currentUser()?.slug;
          if (!slug || !serviceId || !staffId || !date) {
            return of(null);
          }
          // Para la dueña salen todas las horas libres cada 15 min (sin las reglas de la página pública); al editar no cuenta la propia cita.
          const none: FreeTimes = { times: [], busy: [], reason: null, note: null, next_day: null };
          const day$ = this.appointmentsApi.freeTimes(Number(staffId), Number(serviceId), date, editing ? Number(editing) : null, visitMinutes ? Number(visitMinutes) : null).pipe(catchError(() => of(none)));
          const today = toInputDate(this.clock.now());
          if ((editing && !this.editingClosed()) || date > today) {
            return day$.pipe(map((day) => this.dayTimes(day, day.times, [])));
          }
          // Hoy o antes: se muestran las horas que la persona trabaja (las ocupadas, marcadas), no solo los huecos de adelante.
          const isToday = date === today;
          const nowClock = clockFromMinutes(this.clock.now().getHours() * 60 + this.clock.now().getMinutes());
          return forkJoin([day$, this.appointmentsApi.getPastHours(Number(staffId), Number(serviceId), date).pipe(catchError(() => of([] as PastHour[])))]).pipe(
            map(([day, hours]) => {
              const worked = hours.filter((row) => !isToday || row.time < nowClock);
              const view = this.dayTimes(isToday ? day : { ...none }, isToday ? day.times : [], worked.map((row) => row.time));
              const busy = worked.filter((row) => row.busy).map((row) => row.time);
              return { ...view, busy: [...new Set([...busy, ...view.busy])].sort(), reason: isToday ? view.reason : null };
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((view) => {
        this.slotsReady.set(view !== null);
        this.slotTimes.set(view?.options ?? []);
        this.busyTimes.set(view?.busy ?? []);
        this.busyLabels.set(view?.labels ?? {});
        this.freeCount.set(view?.free ?? 0);
        this.dayReason.set(view?.reason ?? null);
        this.dayNote.set(view?.note ?? null);
        this.nextDay.set(view?.nextDay ?? null);
        const current = this.form.controls.time.value;
        if (current && view && !view.options.includes(current) && !this.customTime()) {
          const clean = !this.hasChanges();
          this.form.controls.time.setValue('', { emitEvent: false });
          this.formTick.update((count) => count + 1); // el resumen de abajo deja de mostrar la hora que se quitó
          if (clean) {
            this.baseline = this.snapshot();
          }
        }
      });
    // Horas libres del segundo horario de la visita: mismo día y misma persona, sin encimarse con el primero.
    effect((onCleanup) => {
      this.formTick();
      const minutes = this.laterMinutes();
      const { service_id, staff_id, date, time } = this.form.getRawValue();
      // En una cita que ya pasó no hay "horas libres": el segundo horario se escribe libre.
      if (!minutes || service_id == null || staff_id == null || !date || this.pastVisit()) {
        this.laterSlots.set([]);
        return;
      }
      const sub = this.appointmentsApi
        .freeTimes(staff_id, service_id, date, null, minutes)
        .pipe(catchError(() => of(null)))
        .subscribe((day) => {
          const first = this.firstPartMinutes(service_id) ?? this.services().find((item) => item.id === service_id)?.duration_minutes ?? 0;
          const start = time ? minutesOf(time) : null;
          const list = (day?.times ?? []).filter((slot) => start === null || minutesOf(slot) >= start + first || minutesOf(slot) + minutes <= start);
          this.laterSlots.set(list);
          if (this.laterTime() && !list.includes(this.laterTime())) {
            this.laterTime.set('');
          }
        });
      onCleanup(() => sub.unsubscribe());
    });
    // Si solo una persona hace el servicio elegido, se elige sola.
    effect(() => {
      this.formTick();
      const { service_id, staff_id } = this.form.getRawValue();
      if (this.editingId() !== null || service_id == null || staff_id != null || this.isStaff()) {
        return;
      }
      const able = this.staff().filter((member) => member.is_active && (!member.service_ids || member.service_ids.includes(service_id)));
      if (able.length === 1) {
        this.form.controls.staff_id.setValue(able[0].id);
      }
    });
    // Ficha: si la cita es una parte de una visita en dos horarios, se cargan las otras partes.
    effect((onCleanup) => {
      const pop = this.selected();
      if (!pop?.appointment.visit_group) {
        this.visitParts.set([]);
        return;
      }
      const sub = this.appointmentsApi
        .visitGroup(pop.appointment.id)
        .pipe(catchError(() => of([] as VisitPart[])))
        .subscribe((parts) => this.visitParts.set(parts));
      onCleanup(() => sub.unsubscribe());
    });
    interval(20000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.now.set(this.clock.nowMs());
        // En segundo plano no se vuelve a pedir la agenda; al regresar, el siguiente ciclo la actualiza.
        if (this.ownStaffReady() && !document.hidden) {
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

  private swipeFrom: { x: number; y: number } | null = null;

  /** Celular: deslizar el calendario a los lados pasa al día (o semana, o mes) anterior o siguiente. */
  protected swipeStart(event: TouchEvent): void {
    const target = event.target as HTMLElement | null;
    const touch = event.touches[0];
    // No se desliza si el dedo empezó en algo que ya se mueve o se escribe (campos, listas con scroll horizontal).
    if (!touch || event.touches.length > 1 || (target?.closest('input, textarea, select, [data-no-swipe]') ?? null)) {
      this.swipeFrom = null;
      return;
    }
    this.swipeFrom = { x: touch.clientX, y: touch.clientY };
  }

  protected swipeEnd(event: TouchEvent): void {
    const from = this.swipeFrom;
    const touch = event.changedTouches[0];
    this.swipeFrom = null;
    if (!from || !touch || typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    // Solo un gesto claramente horizontal: así no choca con bajar por la lista de citas.
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) {
      return;
    }
    this.shift(dx < 0 ? 1 : -1);
  }

  /** Citas del día que se está viendo: texto para compartir (celular) o una hoja para imprimir (escritorio). */
  private daySheet() {
    return buildDaySheet(this.appointments(), toInputDate(this.cursor()));
  }

  protected async shareDay(): Promise<void> {
    const business = this.auth.currentUser()?.businessName ?? '';
    const text = daySheetText(this.daySheet(), business);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // La persona cerró el menú de compartir: no es un error.
      }
      return;
    }
    window.open(whatsappLink(null, text), '_blank', 'noopener');
  }

  protected printDay(): void {
    const business = this.auth.currentUser()?.businessName ?? '';
    const sheet = window.open('', '_blank');
    if (!sheet) {
      this.toasts.show('Tu navegador bloqueó la ventana. Permítela para imprimir la agenda.');
      return;
    }
    sheet.document.write(daySheetHtml(this.daySheet(), business));
    sheet.document.close();
    sheet.focus();
    sheet.print();
  }

  protected goToday(): void {
    this.cursor.set(startOfDay(this.clock.now()));
    this.selected.set(null);
    this.scrolledToNow = false;
  }

  protected onService(value: number | ''): void {
    this.serviceId.set(value === '' ? null : value);
    this.selected.set(null);
  }

  protected readonly clientNotice = signal<string | null>(null);
  /** Tras cobrar: WhatsApp listo para pedir la opinión del cliente. */
  protected readonly reviewNotice = signal<{ name: string; href: string; receiptHref: string } | null>(null);

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
    return this.services().find((item) => (id === null ? item.is_active && !item.is_hold : item.id === id));
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

  /** Primeras citas del día para la celda del mes en pantalla grande ("9:30 Ana"). */
  protected monthPreview(day: Date): { time: string; name: string }[] {
    return [...this.activeOn(day)]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 2)
      .map((item) => ({ time: compactTime(item.starts_at.slice(11, 16)), name: firstName(item.client_name) }));
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
        const left = created.getTime() + this.holdHours() * 3_600_000 - this.clock.nowMs();
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
    return toInputDate(day) === toInputDate(this.clock.now());
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
    return hora12(clockFromMinutes(minutes), true);
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
      pago: appointment.deposit_amount
        ? `Para apartar tu lugar el anticipo es de ${this.pesos(appointment.deposit_amount)}; el resto lo pagas en la cita.`
        : 'No necesitas pagar anticipo; lo pagas en la cita.',
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
    return open && !!service?.variable_price && !service.price_at_visit && appointment.quoted_price == null;
  }

  /** Servicio "en la cita": se aparta sin precio y se acuerda el día de la visita. */
  protected priceAtVisit(serviceId: number | null | undefined): boolean {
    return !!this.services().find((item) => item.id === serviceId)?.price_at_visit;
  }

  /** Cita de "precio en la cita" que todavía no tiene precio: se ve como "Precio por definir". */
  protected priceOpen(appointment: Appointment): boolean {
    const open = appointment.status === 'scheduled' || appointment.status === 'awaiting_deposit';
    return open && this.priceAtVisit(appointment.service_id) && appointment.quoted_price == null;
  }

  /** La dueña dejó que el personal cambie precios y quite anticipos en cualquier servicio. */
  private readonly staffCanEditPrice = signal(false);
  private readonly depositCancelPolicy = signal<'refund' | 'keep'>('refund');

  /** Dueña y administración siempre; el personal, solo en servicios de precio variable o si la dueña lo permitió. */
  protected canPrice(serviceId: number | null | undefined): boolean {
    return !this.isStaff() || this.staffCanEditPrice() || !!this.services().find((item) => item.id === serviceId)?.variable_price;
  }

  protected canWaiveDeposit(): boolean {
    return !this.isStaff() || this.staffCanEditPrice();
  }

  protected readonly quoteFocus = signal(false);
  protected readonly quoteHref = signal<string | null>(null);
  protected readonly quoteSaving = signal(false);

  /** Guarda el precio. Con `notify`, abre de una vez el WhatsApp con el precio y el enlace de la cita. */
  protected saveQuote(appointment: Appointment, value: string, notify = false): void {
    const amount = Number(value);
    if (!String(value).trim() || Number.isNaN(amount) || this.quoteSaving()) {
      return;
    }
    // La ventana se abre aquí, dentro del toque, para que el navegador no la bloquee; se llena al guardar.
    const chat = notify && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    this.quoteSaving.set(true);
    this.appointmentsApi
      .quote(appointment.id, amount)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.quoteSaving.set(false);
          this.patchLocal(saved);
          const href = this.priceHref(saved);
          if (chat && href) {
            chat.location.href = href;
            this.quoteHref.set(null);
            this.toasts.show('Precio guardado. Toca enviar en WhatsApp.');
          } else {
            chat?.close();
            this.quoteHref.set(href);
            this.toasts.show(notify && !href ? 'Precio guardado. Este contacto no tiene WhatsApp.' : 'Precio guardado.');
          }
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          chat?.close();
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
    const sameDay = toInputDate(this.clock.now()) === item.starts_at.slice(0, 10);
    return whatsappLink(phone, this.copy.message(this.isHold(item.service_id) ? 'hold_idea' : 'reminder', { ...this.visitVars(item), cuando: sameDay ? 'hoy' : 'mañana', enlace: this.manageLink(item) }));
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

  /** Qué cambió respecto a la cita tal como se abrió (solo al editar). */
  protected readonly changedList = computed<string[]>(() => {
    this.formTick();
    this.noPhone();
    this.petName();
    this.contactHandle();
    this.contactChannel();
    if (this.editingId() === null || !this.baseline) {
      return [];
    }
    const [before, pet, noPhone, channel, handle] = JSON.parse(this.baseline) as [ReturnType<typeof this.form.getRawValue>, string, boolean, string, string];
    const now = this.form.getRawValue();
    const list: string[] = [];
    if (now.service_id !== before.service_id) {
      list.push('el servicio');
    }
    if (now.staff_id !== before.staff_id) {
      list.push(this.copy.text().person.toLowerCase());
    }
    if (now.date !== before.date || now.time !== before.time) {
      list.push('el día u hora');
    }
    if (now.client_name !== before.client_name || now.client_phone !== before.client_phone || now.client_email !== before.client_email || noPhone !== this.noPhone() || channel !== this.contactChannel() || handle !== this.contactHandle().trim()) {
      list.push('los datos del cliente');
    }
    if (now.quoted_price !== before.quoted_price) {
      list.push('el precio');
    }
    if (now.deposit_mode !== before.deposit_mode || (now.deposit_mode === 'received' && now.deposit_received !== before.deposit_received)) {
      list.push('el anticipo');
    }
    if (now.notes !== before.notes || pet !== this.petName()) {
      list.push('las notas');
    }
    return list;
  });

  /** Lo que la clienta debe saber si cambia: día, hora, servicio, persona, precio o anticipo. */
  private changesToTell(): boolean {
    return this.changedList().some((item) => item !== 'los datos del cliente' && item !== 'las notas');
  }

  /** Anticipo que pediría el negocio con el servicio y precio elegidos (para mostrarlo en el botón y sugerirlo). */
  protected readonly suggestedDeposit = computed<number | null>(() => {
    this.formTick();
    const value = this.form.getRawValue();
    const service = this.services().find((item) => item.id === value.service_id);
    if (!service) {
      return null;
    }
    const quoted = String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null;
    return this.previewDeposit(service, quoted);
  });

  /** Última forma de anticipo elegida al agendar (solo "según el negocio" o "sin anticipo"): comodidad de este navegador. */
  private rememberedDeposit(): 'auto' | 'none' {
    try {
      return localStorage.getItem('nx-deposit-mode') === 'none' ? 'none' : 'auto';
    } catch {
      return 'auto';
    }
  }

  protected pickDepositMode(mode: 'auto' | 'none' | 'received'): void {
    if (mode !== 'received') {
      try {
        localStorage.setItem('nx-deposit-mode', mode);
      } catch {
        // sin almacenamiento: simplemente no se recuerda
      }
    }
    this.form.controls.deposit_mode.setValue(mode);
    const suggested = this.suggestedDeposit();
    if (mode === 'received' && !String(this.form.controls.deposit_received.value).trim() && suggested) {
      this.form.controls.deposit_received.setValue(String(suggested));
    }
  }

  protected useSuggestedDeposit(): void {
    const suggested = this.suggestedDeposit();
    if (suggested) {
      this.form.controls.deposit_received.setValue(String(suggested));
    }
  }

  /** Resumen fijo al pie del formulario: cuándo, con quién, qué y cuánto, con la hora en que termina. */
  protected readonly summary = computed<string | null>(() => {
    this.formTick();
    const value = this.form.getRawValue();
    const service = this.services().find((item) => item.id === value.service_id);
    const member = this.staff().find((item) => item.id === value.staff_id);
    if (!service || !member || !value.date || !value.time) {
      return null;
    }
    const editing = this.editingAppointment();
    const real = editing?.ends_at && editing.service_id === service.id ? Math.round((new Date(editing.ends_at).getTime() - new Date(editing.starts_at).getTime()) / 60000) : 0;
    const minutes = real > 0 ? real : (this.firstPartMinutes(service.id) ?? service.duration_minutes);
    const [hour, minute] = value.time.split(':').map(Number);
    const end = clockFromMinutes((hour * 60 + minute + minutes) % 1440);
    const day = this.dayShort(value.date);
    const quoted = String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null;
    const open = quoted == null && !!(service.price_at_visit || service.is_hold || !service.price);
    const everyone = [service, ...this.extraServices(), ...this.laterServices()];
    const names = [service, ...this.extraServices()].map((item) => item.name).join(' + ');
    const parts = [`${day.charAt(0).toUpperCase()}${day.slice(1)}`, `${hora12(value.time)} a ${hora12(end)}`, firstName(member.full_name), names];
    if (this.laterIds().length > 0) {
      parts.push(this.laterTime() ? `Luego ${hora12(this.laterTime())}: ${this.laterServices().map((item) => item.name).join(' + ')}` : 'Falta la hora del segundo horario');
    }
    const sum = everyone.reduce((total, item) => total + item.price, 0);
    const anyOpen = everyone.some((item) => item.price_at_visit || item.variable_price || !item.price);
    parts.push(open || (quoted == null && everyone.length > 1 && anyOpen) ? 'Precio por definir' : pesos(quoted ?? (everyone.length > 1 ? sum : service.price)));
    if (!this.pastVisit()) {
      const suggested = this.suggestedDeposit();
      const got = Number(value.deposit_received);
      if (value.deposit_mode === 'none') {
        parts.push('Sin anticipo');
      } else if (value.deposit_mode === 'received') {
        parts.push(got > 0 ? `${open ? 'Apartado' : 'Anticipo'} ${pesos(got)} recibido` : 'Falta el monto del anticipo');
      } else if (suggested) {
        parts.push(`Anticipo ${pesos(suggested)} por pagar`);
      }
    }
    return parts.join(' · ');
  });

  /** Si esa persona ya tiene otra cita ese día (se ve en la agenda cargada): avisa para no duplicar. */
  protected readonly sameDayNote = computed<string | null>(() => {
    this.formTick();
    this.noPhone();
    this.contactHandle();
    this.contactChannel();
    const value = this.form.getRawValue();
    if (!value.date) {
      return null;
    }
    const channel = this.contactChannels.find((item) => item.value === this.contactChannel())?.label ?? '';
    const key = this.noPhone() ? `${channel} ${this.contactHandle().trim()}`.toLowerCase().replace(/\s+/g, ' ') : value.client_phone.replace(/\D/g, '').slice(-10);
    if (key.length < 7) {
      return null;
    }
    const same = this.appointments().filter((item) => {
      if (item.id === this.editingId() || !item.starts_at.startsWith(value.date) || item.status === 'cancelled' || item.status === 'no_show') {
        return false;
      }
      const stored = item.client_phone ?? '';
      return this.noPhone() ? stored.toLowerCase().replace(/\s+/g, ' ') === key : stored.replace(/\D/g, '').slice(-10) === key;
    });
    if (same.length === 0) {
      return null;
    }
    return `Ya tiene ${same.length === 1 ? 'otra cita' : 'otras citas'} ese día: ${same.map((item) => `${item.service_name} a las ${hora12(item.starts_at.slice(11, 16))}`).join(' y ')}.`;
  });

  /** Arma lo que muestra la lista de horas: libres y ocupadas juntas (las ocupadas atenuadas, con su cita) y el motivo si no hay ninguna libre. */
  private dayTimes(day: FreeTimes, free: string[], worked: string[]) {
    const busy = day.busy.map((row) => row.time);
    const options = [...new Set([...worked, ...free, ...busy])].sort();
    return {
      options,
      busy,
      labels: Object.fromEntries(day.busy.map((row) => [row.time, row.label])) as Record<string, string>,
      free: free.length,
      reason: free.length ? null : day.reason,
      note: day.note,
      nextDay: free.length ? null : day.next_day,
    };
  }

  /** "mar 10 nov" para el botón "Ver el siguiente día libre". */
  protected dayShort(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  }

  protected goToNextDay(): void {
    const next = this.nextDay();
    if (next) {
      this.form.controls.date.setValue(next);
      this.form.controls.time.setValue('');
    }
  }

  protected openCreateAt(day: Date, minutes: number, staffId?: number): void {
    this.openForm(day, minutes, staffId);
  }

  private byIds(ids: number[]): Service[] {
    return ids.map((id) => this.services().find((item) => item.id === id)).filter((item): item is Service => !!item);
  }

  /** Minutos de la primera parte: el servicio principal más los que siguen. Sin extras, lo de siempre (null). */
  private firstPartMinutes(serviceId: number | null): number | null {
    const main = this.services().find((item) => item.id === serviceId);
    if (!main || this.extraIds().length === 0) {
      return null;
    }
    return main.duration_minutes + this.extraServices().reduce((sum, item) => sum + item.duration_minutes, 0);
  }

  /** Servicios de la visita ya elegidos (sin el principal), para el selector múltiple. */
  protected readonly visitValues = computed(() => [...this.extraIds(), ...this.laterIds()]);

  /** El selector múltiple manda la lista completa: lo nuevo se suma al primer horario y lo quitado se va de ambos. */
  protected setVisitServices(values: (string | number)[]): void {
    const wanted = values.map(Number).slice(0, this.maxVisitServices - 1 - this.partnerServices());
    const keep = (list: number[]) => list.filter((id) => wanted.includes(id));
    const known = new Set([...this.extraIds(), ...this.laterIds()]);
    this.extraIds.set([...keep(this.extraIds()), ...wanted.filter((id) => !known.has(id))]);
    this.laterIds.set(keep(this.laterIds()));
    if (this.laterIds().length === 0) {
      this.laterTime.set('');
    }
    this.form.updateValueAndValidity();
  }

  protected removeVisitService(id: number): void {
    this.extraIds.update((list) => list.filter((item) => item !== id));
    this.laterIds.update((list) => list.filter((item) => item !== id));
    if (this.laterIds().length === 0) {
      this.laterTime.set('');
    }
    this.form.updateValueAndValidity();
  }

  /** Pasa un servicio sumado al segundo horario (o lo regresa al primero). */
  protected toggleLater(id: number): void {
    if (this.laterIds().includes(id)) {
      this.laterIds.update((list) => list.filter((item) => item !== id));
      this.extraIds.update((list) => [...list, id]);
    } else {
      this.extraIds.update((list) => list.filter((item) => item !== id));
      this.laterIds.update((list) => [...list, id]);
    }
    if (this.laterIds().length === 0) {
      this.laterTime.set('');
    }
    this.form.updateValueAndValidity();
  }

  private resetVisit(): void {
    this.extraIds.set([]);
    this.laterIds.set([]);
    this.laterTime.set('');
    this.laterSlots.set([]);
  }

  /** Abre otra parte de la misma visita desde la ficha. */
  protected openVisitPart(part: VisitPart): void {
    this.appointmentsApi.getAppointment(part.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (found) => this.showAppointment({ appointment: found, x: 24, y: 88, maxHeight: 560, history: [] }),
      error: () => undefined,
    });
  }

  /** Editar una cita pendiente: el mismo formulario de "Nueva cita", ya con los datos de la cita. */
  protected readonly editingId = signal<number | null>(null);
  /** Cita de un día pasado (atendida o "No llegó"): se edita lo que no mueve dinero; el cobro se corrige con "Corregir". */
  protected readonly editingClosed = computed(() => {
    const status = this.editingAppointment()?.status;
    return status === 'completed' || status === 'no_show';
  });

  protected openEdit(appointment: Appointment): void {
    this.openForm(new Date(`${appointment.starts_at.slice(0, 10)}T00:00:00`), 0, undefined, appointment);
  }

  private openForm(day: Date, minutes: number, staffId?: number, editing?: Appointment): void {
    this.selected.set(null);
    this.formError.set(null);
    this.resetVisit();
    this.petName.set('');
    this.editingId.set(editing?.id ?? null);
    this.editingAppointment.set(editing ?? null);
    this.customTime.set(false);
    this.freeCount.set(0);
    this.dayReason.set(null);
    this.dayNote.set(null);
    this.nextDay.set(null);
    this.busyLabels.set({});
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
      deposit_mode: 'auto',
      deposit_received: '',
    });
    this.noPhone.set(false);
    this.contactChannel.set('instagram');
    this.contactHandle.set('');
    this.partnerServices.set(0);
    if (!editing && this.canWaiveDeposit() && this.rememberedDeposit() === 'none') {
      this.form.controls.deposit_mode.setValue('none');
    }
    if (editing) {
      this.fillFrom(editing);
      this.loadVisitForEdit(editing);
    }
    this.pastOutcome.set('done');
    this.pastMethod.set(this.pastMethods()[0]?.value ?? 'efectivo');
    this.pastTip.set('');
    this.pastNote.set('');
    this.pastSplitOn.set(false);
    this.pastSplitCard.set('');
    this.pastTipCard.set(false);
    this.busyTimes.set([]);
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
    this.baseline = this.snapshot();
    // Cerrar con la X, tocando fuera o con Escape pregunta antes si hay cambios sin guardar.
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '980px',
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'service-sheet',
      autoFocus: 'first-tabbable',
      disableClose: true,
    });
    const ref = this.dialogRef;
    ref.backdropClick().subscribe(() => void this.requestClose());
    ref.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        void this.requestClose();
      }
    });
  }

  /** Al editar: los servicios sumados de la cita y cuántos lleva la otra parte de la visita (si está partida en dos horarios). */
  private loadVisitForEdit(appointment: Appointment): void {
    const names = (appointment.extra_label ?? '').split(', ').filter(Boolean);
    const ids = names.map((name) => this.services().find((item) => item.name === name)?.id).filter((id): id is number => id != null);
    this.extraIds.set(ids);
    this.baseline = this.snapshot();
    if (!appointment.visit_group) {
      return;
    }
    this.appointmentsApi
      .visitGroup(appointment.id)
      .pipe(catchError(() => of([] as VisitPart[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((parts) => this.partnerServices.set(parts.reduce((sum, part) => sum + 1 + (part.extra_label ? part.extra_label.split(', ').length : 0), 0)));
  }

  private readonly editingAppointment = signal<Appointment | null>(null);
  private baseline = '';

  /** Lo que hay en el formulario ahora, para saber si algo cambió desde que se abrió. */
  private snapshot(): string {
    return JSON.stringify([this.form.getRawValue(), this.petName(), this.noPhone(), this.contactChannel(), this.contactHandle().trim()]);
  }

  protected hasChanges(): boolean {
    return this.snapshot() !== this.baseline;
  }

  protected async requestClose(): Promise<void> {
    if (this.isSaving()) {
      return;
    }
    if (
      this.hasChanges() &&
      !(await this.confirm.ask({
        title: '¿Salir sin guardar?',
        message: this.editingId() !== null ? `Los cambios de la ${this.copy.text().visit.toLowerCase()} se perderán.` : `Lo que escribiste de la ${this.copy.text().visit.toLowerCase()} se perderá.`,
        confirm: 'Salir sin guardar',
        cancel: 'Seguir editando',
        danger: true,
      }))
    ) {
      return;
    }
    this.closeEditor();
  }

  private fillFrom(appointment: Appointment): void {
    const phone = appointment.client_phone ?? '';
    const notes = appointment.notes ?? '';
    const pet = this.copy.text().pet && notes.startsWith('Mascota: ') ? notes.split('\n')[0].slice('Mascota: '.length) : '';
    if (pet) {
      this.petName.set(pet);
    }
    const paid = appointment.status === 'scheduled' && (appointment.deposit_amount ?? 0) > 0;
    this.form.patchValue({
      service_id: this.isHold(appointment.service_id) ? null : appointment.service_id,
      staff_id: appointment.staff_id,
      date: appointment.starts_at.slice(0, 10),
      time: appointment.starts_at.slice(11, 16),
      client_name: appointment.client_name,
      client_phone: isPhone(phone) ? phone : '',
      client_email: appointment.client_email ?? '',
      notes: pet ? notes.split('\n').slice(1).join('\n') : notes,
      quoted_price: appointment.quoted_price != null ? String(appointment.quoted_price) : '',
      deposit_mode: appointment.status === 'awaiting_deposit' ? 'auto' : paid ? 'received' : 'none',
      deposit_received: paid ? String(appointment.deposit_amount) : '',
    });
    this.applyContact(phone);
  }

  protected openCreate(): void {
    // Hoy: abre con la siguiente hora (cada 15 min); si ya es tarde, con mañana a las 9:00. Un día pasado se respeta (registrar una cita que ya pasó).
    let day = this.cursor();
    let minutes = 9 * 60;
    const now = this.clock.now();
    if (toInputDate(day) === toInputDate(now)) {
      const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
      if (next >= 21 * 60) {
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      } else {
        minutes = Math.max(next, 9 * 60);
      }
    }
    this.openCreateAt(day, minutes, this.staffId() ?? undefined);
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
    this.applyContact(tel);
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
    if ((service.price_at_visit || service.is_hold || !service.price) && quoted == null) {
      // Aún no hay precio: solo se habla del apartado; el total se define en la cita.
      if (value.deposit_mode === 'none') {
        return 'Sin apartado. El precio se define en la cita.';
      }
      const kept = (value.deposit_mode === 'received' ? Number(value.deposit_received) : this.previewDeposit(service, null)) ?? 0;
      return kept > 0 ? `Apartado ${this.pesos(kept)}. El precio se define en la cita y se descuenta al cobrar.` : 'El precio se define en la cita.';
    }
    if (value.deposit_mode === 'none') {
      return `Sin anticipo. En la cita cobra ${this.pesos(total)}.`;
    }
    if (value.deposit_mode === 'received') {
      const got = Number(value.deposit_received);
      return got > 0 ? `Anticipo recibido ${this.pesos(got)}. En la cita cobra ${this.pesos(Math.max(0, Math.round((total - got) * 100) / 100))}.` : null;
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
      // "Precio en la cita" sin precio acordado: aún no hay monto que cobrar.
      .filter((item) => !this.priceOpen(item))
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

  private previewDeposit(service: { variable_price?: boolean; price_at_visit?: boolean; deposit_amount?: number | null; price: number }, quoted: number | null): number | null {
    const rules = this.depositRules();
    if (!rules.account) {
      return null;
    }
    // "En la cita" no tiene precio que cotizar: el anticipo es el monto fijo, no un porcentaje.
    if (service.variable_price && !service.price_at_visit && rules.percent) {
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
    this.form.patchValue({ client_name: row.full_name, client_phone: isPhone(row.phone) ? row.phone : '' });
    this.applyContact(row.phone);
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
  /** Lo que retiene la terminal por cada peso cobrado con tarjeta (0 si no capturó la comisión en Configuración). */
  private readonly cardFeeRate = signal(0);
  /** Cobro dividido: una parte con tarjeta y el resto en efectivo o transferencia (solo si el negocio acepta tarjeta). */
  protected readonly splitOn = signal(false);
  protected readonly splitCard = signal('');
  /** La propina se pagó con tarjeta aunque la cita fuera en efectivo o transferencia. */
  protected readonly tipCard = signal(false);
  protected readonly cardAccepted = computed(() => this.acceptedMethods().includes('tarjeta'));
  /** Lo que falta de la cita (sin anticipo): la parte con tarjeta debe ser menor. */
  protected readonly serviceDue = computed(() => Math.max(this.serviceCharge() - this.chargeDeposit(), 0));
  /** Lo que se cobra con tarjeta de la cita (0 si no se divide). */
  protected readonly splitCardAmount = computed(() => splitCardAmount(this.splitOn(), this.splitCard(), this.chargeMethod(), this.cardAccepted()));
  protected readonly splitInvalid = computed(() => splitProblem(this.splitOn(), this.splitCard(), this.chargeMethod(), this.cardAccepted(), this.serviceDue()));
  protected readonly chargeTipOnCard = computed(() => tipOnCard(this.tipCard(), this.tipAmount(), this.chargeMethod(), this.cardAccepted()));
  /** Lo que queda en efectivo o transferencia: todo menos la parte con tarjeta y la propina si fue con tarjeta. */
  protected readonly splitRest = computed(() => Math.max(0, Math.round((this.dueNow() - this.splitCardAmount() - (this.chargeTipOnCard() ? this.tipAmount() : 0)) * 100) / 100));
  /** Con tarjeta: cuánto retiene la terminal de lo que se cobra ahora y cuánto se deposita (solo informativo). */
  protected readonly cardFeeNote = computed(() => {
    const rate = this.cardFeeRate();
    const onCard = this.chargeMethod() === 'tarjeta' ? this.dueNow() : this.splitCardAmount() + (this.chargeTipOnCard() ? this.tipAmount() : 0);
    if (!rate || onCard <= 0) {
      return null;
    }
    const fee = Math.round(onCard * rate * 100) / 100;
    return { fee, net: Math.round((onCard - fee) * 100) / 100 };
  });
  protected readonly tipPercents = [10, 15, 20];
  /** Propina como porcentaje del servicio, redondeada al peso. */
  protected tipFor(percent: number): number {
    return Math.round((this.serviceCharge() * percent) / 100);
  }
  protected setTipPercent(percent: number): void {
    this.chargeTip.set(this.tipAmount() === this.tipFor(percent) ? '' : String(this.tipFor(percent)));
  }
  protected setChargeMethod(value: string): void {
    this.chargeMethod.set(value);
    if (!canSplitPay(value, true)) {
      this.splitOn.set(false);
      this.tipCard.set(false);
    }
  }

  /** Visitas de paquete que le quedan a quien tiene esta cita (por teléfono, igual que en Clientes). */
  protected packVisitsLeft(appointment: Appointment): number {
    const key = (appointment.client_phone ?? '').replace(/\D/g, '').slice(-10);
    return key.length < 10 ? 0 : this.packages().filter((pack) => pack.client_phone.replace(/\D/g, '').slice(-10) === key).reduce((sum, pack) => sum + pack.remaining, 0);
  }
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
    if (this.isHold(appointment.service_id)) {
      this.startSwap(appointment);
      return;
    }
    this.charging.set(appointment.id);
    this.moving.set(null);
    this.chargeAmount.set(String(this.bill(appointment)?.total ?? appointment.quoted_price ?? this.services().find((item) => item.id === appointment.service_id)?.price ?? ''));
    this.chargeDeposit.set(appointment.status === 'scheduled' ? appointment.deposit_amount ?? 0 : 0);
    this.chargeMethod.set(this.payMethods()[0].value);
    this.chargeTip.set('');
    this.splitOn.set(false);
    this.splitCard.set('');
    this.tipCard.set(false);
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

  /** El recibo para WhatsApp: servicio, anticipo, propina y total, con el método con el que pagó. */
  private receiptText(appointment: Appointment, paid: { price: number; deposit: number; products: number; tip: number; method: string }, link: string): string {
    const money = (amount: number) => (amount > 0 ? this.pesos(amount) : '');
    const byPackage = paid.method === 'paquete';
    return this.copy.message('receipt', {
      nombre: firstName(appointment.client_name),
      negocio: this.auth.currentUser()?.businessName ?? '',
      servicio: this.services().find((item) => item.id === appointment.service_id)?.name ?? '',
      dia: longDay(appointment.starts_at),
      precio: byPackage ? '' : money(paid.price),
      anticipo: byPackage ? '' : money(paid.deposit),
      propina: money(paid.tip),
      total: money((byPackage ? 0 : paid.price) + paid.products + paid.tip),
      metodo: METHOD_LABELS[paid.method] ?? paid.method,
      enlace: link,
    });
  }

  protected completeWithCharge(appointment: Appointment): void {
    const tip = toAmount(this.chargeTip());
    const note = this.chargeNote().trim();
    const sold = this.cart();
    // Lo que se cobró, antes de que la pantalla de cobro se limpie: de aquí sale el recibo.
    const paid = { price: this.serviceCharge(), deposit: this.chargeDeposit(), products: this.productsTotal(), tip: tip && tip > 0 ? tip : 0, method: this.chargeMethod() };
    void this.setStatus(
      appointment,
      'completed',
      {
        final_price: toAmount(this.chargeAmount()),
        payment_method: this.chargeMethod(),
        tip: tip && tip > 0 ? tip : null,
        card_amount: this.splitCardAmount() || null,
        tip_on_card: this.chargeTipOnCard(),
        visit_note: note || null,
      },
      () => this.sellCart(sold),
    );
    this.charging.set(null);
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    const link = this.manageLink(appointment);
    if (phone && link) {
      const text = this.copy.message('review', { nombre: firstName(appointment.client_name), enlace: link });
      this.reviewNotice.set({ name: firstName(appointment.client_name), href: whatsappLink(phone, text), receiptHref: whatsappLink(phone, this.receiptText(appointment, paid, link)) });
    }
  }

  /** Un cliente que se guardó con su usuario ("Instagram @lupita"): se abre en modo "No tiene celular". */
  private applyContact(value: string): void {
    if (isPhone(value) || !value.trim()) {
      this.noPhone.set(false);
      return;
    }
    const [first, ...rest] = value.trim().split(/\s+/);
    const channel = this.contactChannels.find((item) => item.label.toLowerCase() === first.toLowerCase());
    this.noPhone.set(true);
    this.contactChannel.set(channel?.value ?? 'otro');
    this.contactHandle.set((channel ? rest.join(' ') : value).trim());
  }

  protected matchClient(phone: string): void {
    const key = isPhone(phone) ? phone.replace(/\D/g, '') : phone.trim().toLowerCase();
    if (key.length < 7) {
      this.known.set(null);
      this.freshPhone.set(false);
      return;
    }
    const found = this.guests().find((row) => (isPhone(row.phone) ? row.phone.replace(/\D/g, '') : row.phone.trim().toLowerCase()) === key);
    this.known.set(found ?? null);
    this.freshPhone.set(!found);
  }

  protected closeEditor(): void {
    this.dialogRef?.close();
  }

  // Corregir una cita que ya quedó cerrada (cobrada, no llegó o cancelada): precio, forma de pago, propina o cómo terminó.
  protected readonly fixing = signal<Appointment | null>(null);
  protected readonly fixStatus = signal<AppointmentCorrection['status']>('completed');
  protected readonly fixPrice = signal('');
  protected readonly fixMethod = signal('efectivo');
  protected readonly fixTip = signal('');
  protected readonly fixSplitOn = signal(false);
  protected readonly fixSplitCard = signal('');
  protected readonly fixTipCard = signal(false);
  protected readonly fixNote = signal('');
  protected readonly fixError = signal<string | null>(null);
  protected readonly fixSaving = signal(false);
  protected readonly fixOutcomes: { value: AppointmentCorrection['status']; label: string }[] = [
    { value: 'completed', label: 'Se atendió' },
    { value: 'no_show', label: 'No llegó' },
    { value: 'cancelled', label: 'Cancelada' },
    { value: 'scheduled', label: 'Pendiente' },
  ];

  protected canCorrect(appointment: Appointment): boolean {
    return appointment.status === 'completed' || appointment.status === 'no_show' || appointment.status === 'cancelled';
  }

  protected readonly swapping = signal<Appointment | null>(null);
  protected readonly swapService = signal<number | null>(null);
  protected readonly swapPrice = signal('');
  protected readonly swapError = signal<string | null>(null);
  protected readonly swapSaving = signal(false);
  protected readonly swapPicks = computed(() =>
    this.services()
      .filter((item) => !item.is_hold && (item.is_active || item.id === this.swapping()?.service_id))
      .map((item) => ({ value: item.id, label: item.name })),
  );
  protected readonly swapChosen = computed(() => this.services().find((item) => item.id === this.swapService()) ?? null);

  /** La cita es de "Por elegir" (la clienta apartó sin decidir): primero se elige el servicio y luego se cobra. */
  protected isHold(serviceId: number | null | undefined): boolean {
    return !!this.services().find((item) => item.id === serviceId)?.is_hold;
  }

  /** Contacto de Instagram o Messenger (sin celular): no recibe recordatorios por WhatsApp. */
  protected isPhoneless(appointment: Appointment): boolean {
    return !!appointment.client_phone && !this.telHref(appointment.client_phone);
  }

  protected canSwapService(appointment: Appointment): boolean {
    return appointment.status === 'scheduled' || appointment.status === 'awaiting_deposit';
  }

  protected startSwap(appointment: Appointment): void {
    this.selected.set(null);
    this.swapping.set(appointment);
    this.swapService.set(null);
    this.swapPrice.set('');
    this.swapError.set(null);
    this.dialogRef = this.dialog.open(this.changer(), { width: '460px', maxWidth: 'calc(100vw - 32px)', panelClass: 'service-sheet', autoFocus: 'first-tabbable' });
  }

  protected pickSwap(value: string | number | null): void {
    if (typeof value === 'number') {
      this.swapService.set(value);
      this.swapPrice.set('');
    }
  }

  protected saveSwap(): void {
    const appointment = this.swapping();
    const service = this.swapChosen();
    if (!appointment || !service || this.swapSaving()) {
      return;
    }
    const price = this.swapPrice().trim() && this.canPrice(service.id) ? Number(this.swapPrice()) : null;
    this.swapSaving.set(true);
    this.swapError.set(null);
    this.appointmentsApi
      .changeService(appointment.id, service.id, price)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.swapSaving.set(false);
          this.closeEditor();
          this.swapping.set(null);
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          this.toasts.show('Listo, cambiamos el servicio.');
        },
        error: (error: unknown) => {
          this.swapSaving.set(false);
          this.swapError.set(readError(error, 'No pudimos cambiar el servicio.'));
        },
      });
  }

  protected toNumber(value: string): number {
    return toAmount(value) ?? 0;
  }

  /** Lo que se cobró de un servicio que ya pasó: el que se escribió o, si no, el del servicio (0 si no se sabe). */
  protected pastDue(): number {
    const value = this.form.getRawValue();
    const typed = toAmount(value.quoted_price);
    const price = typed ?? this.services().find((item) => item.id === Number(value.service_id))?.price ?? 0;
    return price > 0 ? price : 1e9; // sin precio todavía, el servidor valida el tope
  }
  protected pastCardAmount(): number {
    return splitCardAmount(this.pastSplitOn(), this.pastSplitCard(), this.pastMethod(), this.cardAccepted());
  }
  protected pastTipOnCard(): boolean {
    return tipOnCard(this.pastTipCard(), toAmount(this.pastTip()) ?? 0, this.pastMethod(), this.cardAccepted());
  }
  protected pastSplitBad(): boolean {
    return this.pastOutcome() === 'done' && splitProblem(this.pastSplitOn(), this.pastSplitCard(), this.pastMethod(), this.cardAccepted(), this.pastDue());
  }
  protected setPastMethod(value: string): void {
    this.pastMethod.set(value);
    if (!canSplitPay(value, true)) {
      this.pastSplitOn.set(false);
      this.pastTipCard.set(false);
    }
  }

  protected fixDue(): number {
    const typed = toAmount(this.fixPrice());
    const item = this.fixing();
    const price = typed ?? item?.quoted_price ?? this.services().find((row) => row.id === item?.service_id)?.price ?? 0;
    const due = price - (item?.deposit_amount ?? 0);
    return due > 0 ? due : 1e9;
  }
  protected fixCardAmount(): number {
    return splitCardAmount(this.fixSplitOn(), this.fixSplitCard(), this.fixMethod(), this.cardAccepted());
  }
  protected fixTipOnCard(): boolean {
    return tipOnCard(this.fixTipCard(), toAmount(this.fixTip()) ?? 0, this.fixMethod(), this.cardAccepted());
  }
  protected fixSplitBad(): boolean {
    return this.fixStatus() === 'completed' && splitProblem(this.fixSplitOn(), this.fixSplitCard(), this.fixMethod(), this.cardAccepted(), this.fixDue());
  }
  protected setFixMethod(value: string): void {
    this.fixMethod.set(value);
    if (!canSplitPay(value, true)) {
      this.fixSplitOn.set(false);
      this.fixTipCard.set(false);
    }
  }

  protected startFix(appointment: Appointment): void {
    this.selected.set(null);
    this.fixing.set(appointment);
    this.fixError.set(null);
    this.fixStatus.set(appointment.status as AppointmentCorrection['status']);
    this.fixPrice.set(appointment.quoted_price != null ? String(appointment.quoted_price) : '');
    this.fixMethod.set(appointment.payment_method ?? this.pastMethods()[0]?.value ?? 'efectivo');
    this.fixTip.set(appointment.tip ? String(appointment.tip) : '');
    this.fixSplitOn.set(!!appointment.card_amount);
    this.fixSplitCard.set(appointment.card_amount ? String(appointment.card_amount) : '');
    this.fixTipCard.set(!!appointment.tip_card);
    this.fixNote.set(appointment.visit_note ?? '');
    this.dialogRef = this.dialog.open(this.fixer(), { width: '460px', maxWidth: 'calc(100vw - 32px)', panelClass: 'service-sheet', autoFocus: 'first-tabbable' });
  }

  protected async saveFix(): Promise<void> {
    const appointment = this.fixing();
    if (!appointment || this.fixSaving()) {
      return;
    }
    const done = this.fixStatus() === 'completed';
    if (done && this.priceAtVisit(appointment.service_id) && !this.fixPrice().trim()) {
      this.fixError.set('Escribe cuánto se cobró.');
      return;
    }
    const price = this.fixPrice().trim() ? Number(this.fixPrice()) : null;
    const tip = Number(this.fixTip()) > 0 ? Number(this.fixTip()) : null;
    const moneyChanged =
      (appointment.status === 'completed') !== done || (done && (price !== (appointment.quoted_price ?? null) || tip !== (appointment.tip || null) || this.fixMethod() !== (appointment.payment_method ?? '') || (this.fixCardAmount() || null) !== (appointment.card_amount ?? null) || this.fixTipOnCard() !== !!appointment.tip_card));
    const old = (this.clock.now().getTime() - parseTimestamp(appointment.starts_at).getTime()) / 86_400_000 > 7;
    if (moneyChanged && old) {
      const ok = await this.confirm.ask({
        title: 'Corregir un cobro de hace más de una semana',
        message: 'Se van a actualizar tus reportes y comisiones de ese día. ¿Quieres guardar el cambio?',
        confirm: 'Guardar cambio',
      });
      if (!ok) {
        return;
      }
    }
    this.fixSaving.set(true);
    this.fixError.set(null);
    this.appointmentsApi
      .correctAppointment(appointment.id, {
        status: this.fixStatus(),
        final_price: done ? price : null,
        payment_method: done ? this.fixMethod() : null,
        tip: done ? tip : null,
        card_amount: done ? this.fixCardAmount() || null : null,
        tip_on_card: done && this.fixTipOnCard(),
        visit_note: this.fixNote().trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.fixSaving.set(false);
          this.closeEditor();
          this.fixing.set(null);
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          this.toasts.show(`Se corrigió la ${this.copy.text().visit.toLowerCase()}.`);
        },
        error: (error: unknown) => {
          this.fixSaving.set(false);
          this.fixError.set(readError(error, 'No pudimos guardar la corrección.'));
        },
      });
  }

  protected save(): void {
    if (this.isSaving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.missing().length > 0) {
      return;
    }
    const value = this.form.getRawValue();
    if (value.service_id == null || value.staff_id == null) {
      return;
    }
    void this.saveChecked(value);
  }

  /** Agendar en un día que se marcó como cerrado es posible (la dueña manda), pero se pregunta antes. */
  private async saveChecked(value: ReturnType<typeof this.form.getRawValue>): Promise<void> {
    const closure = closureOn(value.date, noteOf({ closures: this.closures() }));
    if (closure) {
      const ok = await this.confirm.ask({
        title: 'Ese día está cerrado',
        message: `Marcaste ${closureSpan(closure)}${closure.label ? ` (${closure.label})` : ''} como día que no abres. ¿Quieres agendar esta cita de todos modos?`,
        confirm: 'Agendar de todos modos',
      });
      if (!ok) {
        return;
      }
    }
    if (value.service_id == null || value.staff_id == null || this.missing().length > 0) {
      return;
    }
    const past = this.pastVisit();
    if (!past && value.deposit_mode === 'received' && !(Number(value.deposit_received) > 0)) {
      this.formError.set('Escribe cuánto anticipo te mandó.');
      return;
    }
    if (past && this.pastOutcome() === 'done' && this.priceAtVisit(value.service_id) && !String(value.quoted_price ?? '').trim()) {
      this.formError.set('Escribe cuánto se cobró.');
      return;
    }
    if (this.laterIds().length > 0 && !this.laterTime()) {
      this.formError.set('Elige la hora del segundo horario.');
      return;
    }
    if (await this.confirmOutOfShift(value.time)) {
      return;
    }
    const editing = this.editingId();
    if (editing !== null) {
      this.saveEdit(editing, value);
      return;
    }
    const payload: AdminAppointmentCreate = {
        service_id: value.service_id,
        staff_id: value.staff_id,
        starts_at: `${value.date}T${value.time}:00`,
        ...(this.extraIds().length ? { extra_service_ids: this.extraIds() } : {}),
        ...(this.laterIds().length ? { later_part: { starts_at: `${value.date}T${this.laterTime()}:00`, service_ids: this.laterIds() } } : {}),
        client_name: value.client_name.trim(),
        client_phone: this.noPhone() ? '' : value.client_phone.trim(),
        ...(this.noPhone() ? { contact_channel: this.contactChannel(), contact_handle: this.contactHandle().trim() } : {}),
        client_email: value.client_email.trim() || null,
        quoted_price: String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null,
        waive_deposit: past || value.deposit_mode === 'none',
        deposit_received: !past && value.deposit_mode === 'received' && Number(value.deposit_received) > 0 ? Number(value.deposit_received) : null,
        ...(past
          ? {
              past_outcome: this.pastOutcome(),
              payment_method: this.pastOutcome() === 'done' ? this.pastMethod() : null,
              tip: this.pastOutcome() === 'done' && Number(this.pastTip()) > 0 ? Number(this.pastTip()) : null,
              card_amount: this.pastOutcome() === 'done' ? this.pastCardAmount() || null : null,
              tip_on_card: this.pastOutcome() === 'done' && this.pastTipOnCard(),
              visit_note: this.pastNote().trim() || null,
            }
          : {}),
        notes: [this.copy.text().pet && this.petName().trim() ? `Mascota: ${this.petName().trim()}` : '', value.notes.trim()].filter(Boolean).join('\n') || null,
      };
    void this.submitCreate(payload, past);
  }

  /** Una hora escrita a mano que no está en la lista (fuera del turno): se pregunta antes de guardar. Devuelve true si se canceló. */
  private async confirmOutOfShift(time: string): Promise<boolean> {
    if (!this.customTime() || !time || this.slotTimes().includes(time)) {
      return false;
    }
    const ok = await this.confirm.ask({
      title: 'Esa hora no está en su horario',
      message: `${hora12(time)} queda fuera del turno de ese día. ¿Quieres agendarla de todos modos?`,
      confirm: 'Agendar de todos modos',
      cancel: 'Elegir otra hora',
    });
    return !ok;
  }

  /** Si la hora choca con otra cita, el servidor lo dice y la dueña decide si agenda encimado. */
  private overlapMessage(error: unknown): string | null {
    const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
    return detail && typeof detail === 'object' && detail.code === 'overlap' ? String(detail.message) : null;
  }

  private async submitCreate(payload: AdminAppointmentCreate, past: boolean): Promise<void> {
    this.isSaving.set(true);
    this.formError.set(null);
    this.appointmentsApi
      .createAdminAppointment(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.isSaving.set(false);
          this.closeEditor();
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          if (past) {
            this.toasts.show(`Se registró la ${this.copy.text().visit.toLowerCase()} que ya pasó.`);
          } else {
            this.toasts.show(`Se agendó la ${this.copy.text().visit.toLowerCase()}.`);
            this.clientNotice.set(this.clientWhatsapp(created));
          }
        },
        error: async (error: unknown) => {
          this.isSaving.set(false);
          const clash = this.overlapMessage(error);
          if (clash && !payload.allow_overlap && (await this.confirm.ask({ title: 'Esa hora ya está ocupada', message: `${clash} ¿Quieres agendar encimada de todos modos?`, confirm: 'Agendar de todos modos', cancel: 'Elegir otra hora' }))) {
            void this.submitCreate({ ...payload, allow_overlap: true }, past);
            return;
          }
          this.formError.set(clash ?? readError(error, 'No pudimos agendar la cita.'));
        },
      });
  }

  private saveEdit(id: number, value: ReturnType<typeof this.form.getRawValue>): void {
    if (value.service_id == null || value.staff_id == null) {
      return;
    }
    const closed = this.editingClosed();
    const tell = !closed && this.changesToTell();
    void this.submitEdit(
      id,
      {
        service_id: value.service_id,
        ...(closed ? {} : { extra_service_ids: this.extraIds() }),
        staff_id: value.staff_id,
        starts_at: `${value.date}T${value.time}:00`,
        client_name: value.client_name.trim(),
        client_phone: this.noPhone() ? '' : value.client_phone.trim(),
        ...(this.noPhone() ? { contact_channel: this.contactChannel(), contact_handle: this.contactHandle().trim() } : {}),
        client_email: value.client_email.trim() || null,
        quoted_price: String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null,
        deposit_mode: value.deposit_mode,
        deposit_received: value.deposit_mode === 'received' && Number(value.deposit_received) > 0 ? Number(value.deposit_received) : null,
        notes: [this.copy.text().pet && this.petName().trim() ? `Mascota: ${this.petName().trim()}` : '', value.notes.trim()].filter(Boolean).join('\n') || null,
      },
      tell,
    );
  }

  private async submitEdit(id: number, payload: AdminAppointmentUpdate, tell: boolean): Promise<void> {
    this.isSaving.set(true);
    this.formError.set(null);
    this.appointmentsApi
      .updateAdminAppointment(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.isSaving.set(false);
          this.closeEditor();
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          this.toasts.show(`Se guardaron los cambios de la ${this.copy.text().visit.toLowerCase()}.`);
          // Cambió algo que la clienta debe saber (día, hora, servicio, persona, precio o anticipo): se ofrece avisarle por WhatsApp.
          if (tell) {
            this.clientNotice.set(this.clientWhatsapp(updated));
          }
        },
        error: async (error: unknown) => {
          this.isSaving.set(false);
          const clash = this.overlapMessage(error);
          if (clash && !payload.allow_overlap && (await this.confirm.ask({ title: 'Esa hora ya está ocupada', message: `${clash} ¿Quieres guardarla encimada de todos modos?`, confirm: 'Guardar de todos modos', cancel: 'Elegir otra hora' }))) {
            void this.submitEdit(id, { ...payload, allow_overlap: true }, tell);
            return;
          }
          this.formError.set(clash ?? readError(error, 'No pudimos guardar los cambios.'));
        },
      });
  }

  protected openAppointment(appointment: Appointment, event: MouseEvent): void {
    event.stopPropagation();
    if (this.justDragged) {
      return;
    }
    const margin = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const x = Math.max(margin, Math.min(event.clientX, window.innerWidth - width - margin));
    const room = window.innerHeight - margin * 2;
    const want = Math.min(560, room);
    const y = Math.max(margin, Math.min(event.clientY, window.innerHeight - want - margin));
    this.showAppointment({ appointment, x, y, maxHeight: window.innerHeight - y - margin, history: [] });
  }

  // Arrastrar citas (solo con ratón, en Semana y Día): la hora se ajusta a la cuadrícula y el servidor valida el cambio.
  protected readonly drag = signal<{ id: number; dx: number; dy: number; snapDx: number; snapDy: number; label: string } | null>(null);
  private dragStart: { appointment: Appointment; view: 'day' | 'week'; x: number; y: number; width: number; active: boolean } | null = null;
  private justDragged = false;

  protected dragDown(event: PointerEvent, appointment: Appointment, view: 'day' | 'week'): void {
    if (event.pointerType !== 'mouse' || event.button !== 0 || this.pendingId() !== null) {
      return;
    }
    if (appointment.status !== 'scheduled' && appointment.status !== 'awaiting_deposit') {
      return;
    }
    const button = event.currentTarget as HTMLElement;
    button.setPointerCapture(event.pointerId);
    const width = button.parentElement?.getBoundingClientRect().width ?? 0;
    this.dragStart = { appointment, view, x: event.clientX, y: event.clientY, width, active: false };
  }

  protected dragMove(event: PointerEvent): void {
    const start = this.dragStart;
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.active && Math.hypot(dx, dy) < 6) {
      return;
    }
    start.active = true;
    // Mientras se arrastra, un recuadro punteado muestra dónde caería (la hora se ajusta a la cuadrícula).
    const target = this.targetFor(start, { dx, dy });
    const was = start.appointment.starts_at;
    const minutes = (value: string): number => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
    const snapDy = ((minutes(target.startsAt) - minutes(was)) / SLOT_MINUTES) * SLOT_HEIGHT;
    const move = (list: (string | number)[], from: string | number, to: string | number): number => list.indexOf(to) - list.indexOf(from);
    const columns = start.view === 'day'
      ? move(this.visibleStaff().map((member) => member.id), start.appointment.staff_id, target.staffId)
      : move(this.weekDays().map((day) => toInputDate(day)), was.slice(0, 10), target.startsAt.slice(0, 10));
    const person = target.staffId !== start.appointment.staff_id ? ` · ${(this.staff().find((member) => member.id === target.staffId)?.full_name ?? '').split(' ')[0]}` : '';
    this.drag.set({ id: start.appointment.id, dx, dy, snapDx: columns * start.width, snapDy, label: `${target.startsAt.slice(0, 10) !== was.slice(0, 10) ? `${longDay(target.startsAt)} · ` : ''}${this.formatTime(target.startsAt)}${person}` });
  }

  /** A dónde caería la cita según lo arrastrado (lo usa el recuadro de vista previa y al soltar). */
  private targetFor(start: NonNullable<typeof this.dragStart>, shift: { dx: number; dy: number }): DragTarget {
    const { appointment } = start;
    const bounds = this.dayBounds();
    return dragTarget({
      startsAt: appointment.starts_at,
      dx: shift.dx,
      dy: shift.dy,
      slotHeight: SLOT_HEIGHT,
      slotMinutes: SLOT_MINUTES,
      columnWidth: start.width,
      dayStart: bounds.start,
      dayEnd: bounds.end,
      duration: this.durationMinutes(appointment),
      view: start.view,
      staffId: appointment.staff_id,
      staffIds: this.visibleStaff().map((member) => member.id),
      days: this.weekDays().map((day) => toInputDate(day)),
    });
  }

  protected dragCancel(): void {
    this.dragStart = null;
    this.drag.set(null);
  }

  protected dragShift(id: number): string | null {
    const now = this.drag();
    return now && now.id === id ? `translate(${now.dx}px, ${now.dy}px)` : null;
  }

  protected async dragUp(event: PointerEvent): Promise<void> {
    const start = this.dragStart;
    const shift = this.drag();
    this.dragStart = null;
    this.drag.set(null);
    if (!start || !start.active || !shift) {
      return;
    }
    // El clic que sigue a soltar el ratón no debe abrir la ficha.
    this.justDragged = true;
    setTimeout(() => (this.justDragged = false), 60);
    const { appointment } = start;
    const target = this.targetFor(start, shift);
    if (!target.changed) {
      return;
    }
    const newStaff = this.staff().find((member) => member.id === target.staffId)?.full_name ?? appointment.staff_name;
    const accepted = await this.confirm.ask({
      title: `¿Mover la ${this.copy.text().visit.toLowerCase()}?`,
      message: `${appointment.client_name} · ${appointment.service_name}. De ${this.whenLabel(appointment.starts_at)} a ${this.whenLabel(target.startsAt)}, con ${newStaff}.`,
      confirm: 'Sí, mover',
      cancel: 'Volver',
    });
    if (!accepted) {
      return;
    }
    this.pendingId.set(appointment.id);
    this.appointmentsApi
      .move(appointment.id, target.startsAt, target.staffId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (moved) => {
          this.pendingId.set(null);
          this.patchLocal(moved);
          this.refreshQuietly();
          this.toasts.show('Cita movida. Avísale al cliente.');
          this.clientNotice.set(this.clientWhatsapp(moved));
          this.offerMoveUndo(appointment);
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
          this.toasts.show(typeof detail === 'string' ? detail : 'No pudimos mover la cita.');
        },
      });
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

  /** "7 nov 2026" para el historial de la ficha. */
  private shortDay(timestamp: string): string {
    return parseTimestamp(timestamp).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
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
          (item) => `${this.shortDay(item.starts_at)} · ${item.service_name}${item.deposit_amount ? ' · con anticipo' : ''}`,
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
    const text = this.copy.message('booked', { ...this.visitVars(appointment), enlace: this.manageLink(appointment) });
    this.lastNotice = { text, phone: appointment.client_phone ?? '' };
    return whatsappLink(phone, text);
  }

  private lastNotice: { text: string; phone: string } | null = null;

  /** "Copiar mensaje": el mismo aviso del WhatsApp, para pegarlo donde el cliente escribió (WhatsApp Web, Instagram…). */
  protected copyNotice(): void {
    const text = this.lastNotice?.text;
    if (!text) {
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => this.toasts.show('Mensaje copiado.'),
      () => this.toasts.show('No pudimos copiarlo. Usa "Enviar por WhatsApp".'),
    );
  }

  /** "Agendar otra": abre Nueva cita con el mismo cliente. */
  protected bookAnother(): void {
    const phone = this.lastNotice?.phone ?? '';
    this.clientNotice.set(null);
    this.openCreate();
    if (phone) {
      this.form.controls.client_phone.setValue(phone);
      this.pendingTel = phone;
      if (this.guests().length) {
        this.applyTel(phone);
      }
    }
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

  /** No mandó anticipo pero sí va a ir: queda confirmada sin anticipo y paga todo en la cita. */
  protected waiveDeposit(appointment: Appointment): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(appointment.id);
    this.appointmentsApi
      .waiveDeposit(appointment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pendingId.set(null);
          this.patchLocal({ ...appointment, ...updated });
          this.refreshQuietly();
          this.toasts.show('Listo: la cita queda confirmada sin anticipo. Paga todo en la cita.');
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.toasts.show(readError(error, 'No pudimos quitar el anticipo.'));
        },
      });
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

  /** Horas libres para mover la cita (cada 15 min, con su duración real, el día y la persona elegidos). */
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
    const request = ++this.moveRequest;
    this.moveTimes.set([]);
    if (!this.moveDate()) {
      return;
    }
    this.appointmentsApi
      .moveTimes(appointment.id, this.moveDate(), this.moveStaff())
      .pipe(
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
    const digits = isPhone(phone) ? (phone ?? '').replace(/\D/g, '') : '';
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
          this.offerMoveUndo(appointment);
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
    // Cancelar y "No llegó" preguntan antes (cancelar avisa al cliente y libera el horario; "no llegó" cuenta como falta).
    // Rechazar una solicitud ya es una decisión explícita (pasa `after`), así que no vuelve a preguntar.
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
    if (
      status === 'cancelled' &&
      !after &&
      !(await this.confirm.ask({
        title: `¿Cancelar la ${this.copy.text().visit.toLowerCase()}?`,
        message: `${appointment.client_name} · ${appointment.service_name}. El horario queda libre; si te equivocas, podrás deshacerlo unos segundos.`,
        confirm: 'Sí, cancelar',
        cancel: 'Volver',
        danger: true,
      }))
    ) {
      return;
    }
    // Visita partida en dos horarios: cancelar o marcar "No llegó" una parte pregunta si va igual para la otra.
    let others: VisitPart[] = [];
    if ((status === 'cancelled' || status === 'no_show') && appointment.visit_group && !after) {
      others = await this.pendingVisitParts(appointment);
      if (others.length > 0) {
        const names = others.map((part) => `${part.service_name} a las ${hora12(part.starts_at.slice(11, 16))}`).join(' y ');
        const both = await this.confirm.ask({
          title: 'Esta visita tiene otro horario',
          message: `También está agendado ${names}. ¿${status === 'cancelled' ? 'Lo cancelas' : 'Lo marcas como "No llegó"'} también?`,
          confirm: status === 'cancelled' ? 'Sí, cancelar los dos' : 'Sí, los dos',
          cancel: 'Solo este',
          danger: true,
        });
        if (!both) {
          others = [];
        }
      }
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
          for (const part of others) {
            this.appointmentsApi.updateStatus(part.id, status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.refreshQuietly(), error: () => this.toasts.show('No pudimos cambiar el otro horario. Hazlo desde su cita.') });
          }
          if (status === 'completed' && appointment.visit_group) {
            void this.remindOtherPart(appointment);
          }
          if (status === 'no_show') {
            this.offerStepUndo(`Marcada como "No llegó" · ${appointment.client_name}`, () => this.undoNoShow(appointment, previous));
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

  /** Las otras partes de la visita que siguen pendientes (agendadas o esperando anticipo). */
  private async pendingVisitParts(appointment: Appointment): Promise<VisitPart[]> {
    try {
      const parts = await firstValueFrom(this.appointmentsApi.visitGroup(appointment.id));
      return parts.filter((part) => part.status === 'scheduled' || part.status === 'awaiting_deposit');
    } catch {
      return [];
    }
  }

  /** Al cobrar una parte, recuerda la otra: se cobra por separado. */
  private async remindOtherPart(appointment: Appointment): Promise<void> {
    const parts = await this.pendingVisitParts(appointment);
    if (parts.length > 0) {
      const names = parts.map((part) => `${part.service_name} a las ${hora12(part.starts_at.slice(11, 16))}`).join(' y ');
      this.toasts.show(`Falta la otra parte de la visita: ${names}. Se cobra por separado.`);
    }
  }

  /** Aviso "Cita cancelada · Deshacer" durante 5 segundos. */
  protected readonly undo = signal<{ appointment: Appointment; previous: AppointmentStatus } | null>(null);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  private offerUndo(appointment: Appointment, previous: AppointmentStatus): void {
    this.dismissUndo();
    this.undo.set({ appointment, previous });
    this.undoTimer = setTimeout(() => this.undo.set(null), this.depositNote(appointment, previous) ? 9000 : 5000);
  }

  /** Si la cita ya tenía el anticipo pagado, recuerda qué hacer con él (la dueña decide si la cancelación fue suya). */
  protected depositNote(appointment: Appointment, previous: AppointmentStatus): string {
    const paid = previous === 'scheduled' && (appointment.deposit_amount ?? 0) > 0;
    if (!paid) {
      return '';
    }
    const amount = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(appointment.deposit_amount ?? 0);
    return this.depositCancelPolicy() === 'refund'
      ? `Ya había pagado ${amount} de anticipo: devuélvelo.`
      : `Pagó ${amount} de anticipo. Tu política dice que no se devuelve; si cancelas tú, devuélvelo.`;
  }

  /** "Deshacer" de 6 segundos para "No llegó" y para mover una cita (mismo aviso que cancelar). */
  protected readonly stepUndo = signal<{ label: string; run: () => void } | null>(null);
  private stepUndoTimer: ReturnType<typeof setTimeout> | null = null;

  private offerStepUndo(label: string, run: () => void): void {
    this.dismissStepUndo();
    this.stepUndo.set({ label, run });
    this.stepUndoTimer = setTimeout(() => this.stepUndo.set(null), 6000);
  }

  protected dismissStepUndo(): void {
    if (this.stepUndoTimer) {
      clearTimeout(this.stepUndoTimer);
      this.stepUndoTimer = null;
    }
    this.stepUndo.set(null);
  }

  protected runStepUndo(): void {
    const row = this.stepUndo();
    this.dismissStepUndo();
    row?.run();
  }

  private undoNoShow(appointment: Appointment, previous: AppointmentStatus): void {
    this.patchLocal({ ...appointment, status: previous });
    this.freed.set([]);
    this.appointmentsApi
      .updateStatus(appointment.id, previous)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.patchLocal({ ...appointment, ...updated, status: previous });
          this.toasts.show('Listo, ya no está marcada como "No llegó".');
          this.refreshQuietly();
        },
        error: (error: unknown) => {
          this.patchLocal({ ...appointment, status: 'no_show' });
          this.loadError.set(readError(error, 'No pudimos deshacer el cambio.'));
        },
      });
  }

  private offerMoveUndo(before: Appointment): void {
    this.offerStepUndo(`Cita movida · ${before.client_name}`, () => {
      this.clientNotice.set(null);
      this.appointmentsApi
        .move(before.id, before.starts_at, before.staff_id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (back) => {
            this.patchLocal(back);
            this.toasts.show('La cita volvió a su lugar. Si ya avisaste al cliente, avísale de nuevo.');
            this.refreshQuietly();
          },
          error: (error: unknown) => {
            const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
            this.toasts.show(typeof detail === 'string' ? detail : 'No pudimos regresar la cita; ese horario ya no está libre.');
          },
        });
    });
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
    this.schedulesApi
      .listSpecial({ start: range.start, end: range.end })
      .pipe(catchError(() => of([] as SpecialHours[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.specials.set(rows));
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
          this.updatedAt.set(this.clock.nowMs());
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

  /** El horario especial de ese día (el de la persona gana sobre el de todo el equipo), igual que `special_for` en el backend. */
  private specialOn(staffId: number, day: Date): SpecialHours | null {
    const key = toInputDate(day);
    const weekday = String((day.getDay() + 6) % 7);
    const rows = this.specials().filter(
      (row) => row.date_from <= key && row.date_to >= key && (!row.weekdays || row.weekdays.split(',').some((part) => part.trim() === weekday)),
    );
    const mine = rows.filter((row) => row.staff_id === staffId);
    const everyone = rows.filter((row) => row.staff_id === null);
    const found = mine.length ? mine : everyone;
    return found.length ? found[found.length - 1] : null;
  }

  private workingWindow(staffId: number, day: Date): { start: number; end: number } | null {
    const special = this.specialOn(staffId, day);
    if (special) {
      return special.closed ? null : { start: minutesOf(special.start_time), end: minutesOf(special.end_time) };
    }
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
  if (!isPhone(value)) {
    return '';
  }
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 10 ? `52${digits}` : digits;
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
