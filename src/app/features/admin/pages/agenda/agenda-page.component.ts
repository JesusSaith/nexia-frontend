import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, effect, inject, signal, viewChild } from '@angular/core';
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

import { Appointment, AppointmentStatus } from '@core/models/appointment.model';
import { ScheduleItem } from '@core/models/schedule.model';
import { Service } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { DateFieldComponent, TimeFieldComponent } from '@shared/components/when-field/when-field';
import { AgendaService } from '@core/services/agenda.service';
import { AppointmentsService, TimeBlock } from '@core/services/appointments.service';
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

const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 28;
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No llegó',
  awaiting_deposit: 'Falta el anticipo',
};

const SLOTS = Array.from(
  { length: (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES },
  (_, index) => DAY_START_MINUTES + index * SLOT_MINUTES,
);

@Component({
  selector: 'app-agenda-page',
  imports: [
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
  ],
  templateUrl: './agenda-page.component.html',
})
export class AgendaPageComponent {
  private readonly auth = inject(AuthService);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly route = inject(ActivatedRoute);
  private readonly booking = inject(BookingService);
  private openRequest = 0;
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
  protected readonly currentView = signal<CalendarView>('month');
  protected readonly openTimes = signal<string[]>([]);
  protected readonly holdHours = signal(3);
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
  protected readonly blockNotice = signal<string | null>(null);
  private readonly agendaApi = inject(AgendaService);
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
    this.booking
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((brand) => this.holdHours.set(brand.deposit_hold_hours || 3));
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

  protected serviceColor(id: number): string {
    return ['#b76e79', '#57534e', '#3f6212', '#1d4ed8', '#b45309', '#6d28d9'][Math.abs(id) % 6];
  }

  protected serviceDots(day: Date): number[] {
    return [...new Set(this.appointmentsOn(day).map((item) => item.service_id))].slice(0, 3);
  }

  protected mark(item: Appointment): string {
    if (item.status === 'awaiting_deposit') {
      if (item.payment_proof) {
        return 'Comprobante listo';
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
      return 'Sin confirmar';
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
    const url = this.bookingUrl();
    if (!url) {
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1600);
    });
  }

  protected whatsappHref(): string {
    const url = this.bookingUrl();
    return `https://wa.me/?text=${encodeURIComponent(`Reserva tu cita aquí: ${url}`)}`;
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
    if (status === 'awaiting_deposit') {
      return 'bg-amber-100 text-amber-950';
    }
    if (status === 'cancelled' || status === 'no_show') {
      return 'bg-slate-200 text-slate-500 line-through';
    }
    return 'bg-rose-100 text-rose-900';
  }

  protected dayOff(): void {
    const staffId = this.staffId() ?? this.staff()[0]?.id;
    if (staffId == null) {
      return;
    }
    const date = this.dayKey(this.cursor());
    this.appointmentsApi
      .createBlock({ staff_id: staffId, starts_at: `${date}T08:00:00`, ends_at: `${date}T20:00:00`, note: 'Día libre' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.blockNotice.set('Día libre');
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => this.blockError.set(readError(error, 'No pudimos cerrar el día.')),
      });
  }

  protected tellPrice(appointment: Appointment): void {
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    if (!phone || appointment.quoted_price == null) {
      return;
    }
    const slug = this.auth.currentUser()?.slug ?? '';
    const link = appointment.cancel_token && slug ? ` ${location.origin}/${slug}/manage/${appointment.cancel_token}` : '';
    const deposit = appointment.deposit_amount ? ` El anticipo es $${appointment.deposit_amount}.` : '';
    const text = encodeURIComponent(
      `Hola ${appointment.client_name}, el precio de ${appointment.service_name} quedó en $${appointment.quoted_price}.${deposit}${link}`,
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
  }

  protected saveQuote(appointment: Appointment, value: string): void {
    const amount = Number(value);
    if (!value.trim() || Number.isNaN(amount)) {
      return;
    }
    this.appointmentsApi
      .quote(appointment.id, amount)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        this.selected.update((current) => (current ? { ...current, appointment: saved } : current));
        this.tellPrice(saved);
      });
  }

  protected repeat(appointment: Appointment, weeks: number): void {
    const start = parseTimestamp(appointment.starts_at);
    const next = new Date(start);
    next.setDate(next.getDate() + weeks * 7);
    const slug = this.auth.currentUser()?.slug;
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    if (phone && slug) {
      const when = next.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      const text = `Hola ${appointment.client_name}. Tu siguiente visita puede ser el ${when}. Agenda aquí: ${location.origin}/${slug}/book`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
    const time = appointment.starts_at.slice(11, 16);
    const jobs = [1, 2, 3].map((step) => {
      const next = new Date(start);
      next.setDate(next.getDate() + weeks * 7 * step);
      return this.appointmentsApi
        .createAdminAppointment({
          service_id: appointment.service_id,
          staff_id: appointment.staff_id,
          starts_at: `${this.dayKey(next)}T${time}:00`,
          client_name: appointment.client_name,
          client_phone: appointment.client_phone || '',
          client_email: appointment.client_email,
          notes: appointment.notes,
        })
        .pipe(catchError(() => of(null)));
    });
    forkJoin(jobs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.blockNotice.set('Citas repetidas');
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
            this.blockNotice.set('Comida fija, de lunes a viernes');
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
          this.blockNotice.set(days.length === 1 ? 'Horario bloqueado' : `Se bloquearon ${days.length} días`);
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => {
          this.blockSaving.set(false);
          this.blockError.set(readError(error, 'No pudimos bloquear ese horario.'));
        },
      });
  }

  protected removeBlock(block: TimeBlock, event: Event): void {
    event.stopPropagation();
    if (block.rule_id) {
      if (!confirm('¿Quitar esta comida de todos los días?')) {
        return;
      }
      this.appointmentsApi
        .deleteStanding(block.rule_id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.blockNotice.set('Comida fija eliminada');
            this.loadAppointments(this.range(), this.staffId(), this.serviceId());
          },
          error: (error: unknown) => this.blockError.set(readError(error, 'No pudimos quitar el bloqueo.')),
        });
      return;
    }
    if (!confirm('¿Eliminar este bloqueo y liberar el horario?')) {
      return;
    }
    this.agendaApi
      .deleteBlock(block.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.blockNotice.set('Bloqueo eliminado');
          this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        },
        error: (error: unknown) => this.blockError.set(readError(error, 'No pudimos quitar el bloqueo.')),
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
    const span = DAY_END_MINUTES - DAY_START_MINUTES;
    const top = clamp(((startMinutes - DAY_START_MINUTES) / span) * 100, 0, 98);
    const height = clamp(((endMinutes - startMinutes) / span) * 100, 4, 100 - top);
    return { top: `${top}%`, height: `${height}%` };
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
      quoted_price: '',
    });
    this.known.set(null);
    this.freshPhone.set(false);
    if (this.guests().length === 0) {
      this.booking.getClients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((rows) => this.guests.set(rows));
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

  protected pesos(amount: number): string {
    return this.pesosFormat.format(amount);
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
        notes: value.notes.trim() || null,
        quoted_price: String(value.quoted_price ?? '').trim() ? Number(value.quoted_price) : null,
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
    const margin = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const x = Math.max(margin, Math.min(event.clientX, window.innerWidth - width - margin));
    const room = window.innerHeight - margin * 2;
    const want = Math.min(560, room);
    const y = Math.max(margin, Math.min(event.clientY, window.innerHeight - want - margin));
    this.freed.set([]);
    this.selected.set({ appointment, x, y, maxHeight: window.innerHeight - y - margin, history: [] });
    this.loadHistory(appointment);
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

  protected receiveDeposit(appointment: Appointment, event: Event): void {
    event.stopPropagation();
    this.setStatus(appointment, 'scheduled');
  }

  protected acceptAndTell(appointment: Appointment): void {
    this.setStatus(appointment, 'scheduled');
    const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
    const text = encodeURIComponent(`Hola ${appointment.client_name}, tu cita quedó confirmada.`);
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
    }
  }

  protected askAnother(appointment: Appointment): void {
    this.appointmentsApi
      .clearProof(appointment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const phone = (appointment.client_phone ?? '').replace(/\D/g, '');
        const slug = this.auth.currentUser()?.slug ?? '';
        const link = appointment.cancel_token && slug ? `${location.origin}/${slug}/manage/${appointment.cancel_token}` : '';
        const text = encodeURIComponent(`Hola ${appointment.client_name}, no se lee el comprobante. Sube otra foto aquí: ${link}`);
        if (phone) {
          window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
        }
        this.loadAppointments(this.range(), this.staffId(), this.serviceId());
        this.closeAppointment();
      });
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
          if (status === 'cancelled' || status === 'no_show') {
            this.offerFreed(appointment);
          }
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.loadError.set(readError(error, 'No pudimos actualizar la cita.'));
        },
      });
  }

  private offerFreed(appointment: Appointment): void {
    const day = appointment.starts_at.slice(0, 10);
    this.appointmentsApi
      .waiters(day, appointment.service_id, appointment.staff_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => {
        const slug = this.auth.currentUser()?.slug ?? '';
        const shop = this.auth.currentUser()?.businessName ?? 'el negocio';
        const when = appointment.starts_at.slice(11, 16);
        this.freed.set(
          rows.map((row) => ({
            name: row.client_name,
            href: `https://wa.me/${row.client_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${row.client_name}, en ${shop} se liberó ${appointment.service_name} el ${day} a las ${when}. Aparta aquí: ${location.origin}/${slug}/book`)}`,
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
          if (!quiet && found) {
            this.selected.set({ appointment: found, x: 24, y: 88, maxHeight: 560, history: [] });
            this.loadHistory(found);
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

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
  }
  return fallback;
}
