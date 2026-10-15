import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { businessWords } from '@core/business-words';
import { closedSpan, dateClosed, liveOffer, noteOf } from '@core/shop-note';
import { Appointment, AvailabilitySlot } from '@core/models/appointment.model';
import { BusinessBrand, PublicService, PublicStaff } from '@core/models/business.model';
import { BookingService } from '@core/services/booking.service';
import { Review } from '@core/models/review.model';
import { ReviewsService } from '@core/services/reviews.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

const STEPS = [
  { id: 1, label: 'Servicio' },
  { id: 2, label: 'Horario' },
  { id: 3, label: 'Datos' },
] as const;

const FALLBACK_COLOR = '#E11D48';
const CLIENT_KEY = 'nexia-booking-client';
/** Citas reservadas desde este dispositivo: [{ token, slug, starts_at }]. */
const MINE_KEY = 'nexia-my-appointments';

interface SavedVisit {
  token: string;
  slug: string;
  starts_at: string;
}

interface UpcomingVisit extends SavedVisit {
  service_name: string;
  staff_name: string;
  status: string;
}

/** Teléfono con 10 a 15 dígitos, sin importar espacios, guiones o el +. */
function phoneDigits(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/\D/g, '').length;
  return !control.value || (digits >= 10 && digits <= 15) ? null : { phone: true };
}

@Component({
  selector: 'app-booking',
  imports: [
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    PickFieldComponent,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
  host: {
    '[style.--booking-primary]': 'primaryColor()',
    '[style.--page-canvas]': 'canvasColor()',
  },
})
export class Booking {
  private readonly bookingApi = inject(BookingService);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly currency = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly dateFormat = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  private slotsRequest = 0;

  protected readonly steps = STEPS;
  protected readonly categories = computed(() => {
    const names = new Set<string>();
    for (const service of this.services()) {
      const name = service.category?.trim();
      if (name) {
        names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  });
  protected readonly visibleServices = computed(() => {
    const name = this.categoryFilter();
    const rows = this.services();
    return name ? rows.filter((service) => service.category === name) : rows;
  });
  protected readonly slug =
    this.route.snapshot.paramMap.get('businessSlug') ??
    this.route.parent?.snapshot.paramMap.get('businessSlug') ??
    '';
  protected readonly minDate = todayInputValue();

  protected readonly step = signal(1);
  protected readonly reached = signal(1);
  protected readonly brand = signal<BusinessBrand | null>(null);
  protected readonly petName = signal('');
  protected readonly copy = computed(() => businessWords(this.brand()?.staff_label));
  protected readonly opinions = signal<Review[]>([]);
  /** Promedio general de las reseñas públicas del negocio (no hay calificación por colaboradora). */
  protected readonly rating = computed(() => {
    const rows = this.opinions().filter((review) => review.rating >= 1 && review.rating <= 5);
    if (!rows.length) {
      return null;
    }
    const average = rows.reduce((sum, review) => sum + review.rating, 0) / rows.length;
    return { average, label: average.toFixed(1), count: rows.length, filled: Math.round(average) };
  });
  /** Próximas citas reservadas desde este dispositivo para este negocio. */
  protected readonly upcoming = signal<UpcomingVisit[]>([]);
  protected readonly couponOpen = signal(false);
  protected readonly coupon = signal('');
  /** Porcentaje del cupón según el backend (informativo; el descuento final se decide al reservar). */
  protected readonly couponPercent = signal<number | null>(null);
  protected readonly couponChecked = signal('');
  protected readonly couponError = signal<string | null>(null);
  protected readonly loyaltyPercent = signal<number | null>(null);
  private lastLoyaltyPhone = '';
  protected readonly services = signal<PublicService[]>([]);
  protected readonly categoryFilter = signal('');
  protected readonly staff = signal<PublicStaff[]>([]);
  protected readonly selectedService = signal<PublicService | null>(null);
  protected readonly selectedStaff = signal<PublicStaff | null>(null);
  /** "Cualquiera disponible": el horario elegido define quién atiende. */
  protected readonly anyStaff = signal(false);
  protected readonly extraIds = signal<number[]>([]);
  protected readonly showOptional = signal(false);
  protected readonly remembered = signal(false);
  /** Primer horario libre de los próximos días con lugar, para reservar "lo antes posible" sin calendario. */
  protected readonly soonest = signal<AvailabilitySlot[]>([]);
  /** Aviso cuando el horario se ocupó mientras la clienta llenaba sus datos. */
  protected readonly bumpNotice = signal<string | null>(null);
  protected readonly manageCopied = signal(false);
  /** Fotos de referencia para cotizar, ya comprimidas (data URL). */
  protected readonly refPhotos = signal<string[]>([]);
  protected readonly photoError = signal<string | null>(null);
  /** Campo oculto: si llega con texto, lo llenó un bot. */
  protected readonly trap = signal('');
  /** El celular puede compartir imágenes directo a WhatsApp (Android y iPhone recientes). */
  protected readonly canShareFiles = canShareImages();
  private lastPackagePhone = '';
  private dayHops = 0;
  private pendingSoonest = false;
  protected readonly resource = signal<string | null>(null);
  protected readonly answers = signal('');
  protected readonly usePackage = signal(false);
  protected readonly packageLeft = signal<{ label: string; total: number; remaining: number } | null>(null);
  protected readonly date = signal(this.minDate);
  protected readonly waitName = signal('');
  protected readonly waitPhone = signal('');
  protected readonly waitSent = signal(false);
  protected readonly openDays = signal<string[]>([]);
  protected readonly slots = signal<AvailabilitySlot[]>([]);
  protected readonly selectedSlot = signal<string | null>(null);
  protected readonly slotGroups = computed(() => {
    const groups = [
      { label: 'Mañana', slots: [] as AvailabilitySlot[] },
      { label: 'Tarde', slots: [] as AvailabilitySlot[] },
      { label: 'Noche', slots: [] as AvailabilitySlot[] },
    ];
    for (const slot of this.slots()) {
      const hour = slotHour(slot.starts_at);
      groups[hour < 12 ? 0 : hour < 18 ? 1 : 2].slots.push(slot);
    }
    return groups.filter((group) => group.slots.length > 0);
  });
  protected readonly confirmation = signal<Appointment | null>(null);
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly reviewPhoto = signal<string | null>(null);
  protected readonly reviewSaving = signal(false);
  protected readonly reviewSent = signal(false);
  protected readonly reviewError = signal<string | null>(null);
  protected readonly reviewStars = [1, 2, 3, 4, 5];

  protected readonly isLoading = signal(true);
  protected readonly logoFailed = signal(false);
  protected readonly slotsLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly slotsError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly clientForm = new FormGroup({
    client_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    client_phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(32), phoneDigits],
    }),
    client_email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  private readonly formEvents = toSignal(this.clientForm.events, { initialValue: undefined });

  protected readonly shopNote = computed(() => noteOf(this.brand()));
  protected readonly gallery = computed(() => this.shopNote().photos);
  protected readonly closedLabel = computed(() => closedSpan(this.shopNote()));
  protected readonly offer = computed(() => liveOffer(this.shopNote(), todayInputValue()));
  protected readonly primaryColor = computed(() => safeColor(this.brand()?.primary_color));
  protected readonly canvasColor = computed(() => {
    const value = this.brand()?.canvas_color;
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  });
  protected readonly eligibleStaff = computed(() => {
    const service = this.selectedService();
    const members = this.staff();
    if (!service) {
      return members;
    }
    return members.filter((member) => {
      const ids = member.service_ids ?? [];
      return ids.includes(service.id) && this.extraIds().every((id) => ids.includes(id));
    });
  });
  protected readonly canChooseSchedule = computed(
    () => this.selectedService() !== null && (this.selectedStaff() !== null || this.anyStaff()),
  );
  protected readonly chosenServices = computed(() => {
    const main = this.selectedService();
    if (!main) {
      return [];
    }
    const extras = this.services().filter((service) => this.extraIds().includes(service.id));
    return [main, ...extras];
  });
  protected readonly totalMinutes = computed(() =>
    this.chosenServices().reduce((total, service) => total + service.duration_minutes, 0),
  );
  /** Cuánto paga hoy y cuánto en la cita, para que no haya sorpresas antes de confirmar. */
  protected readonly money = computed(() => {
    const chosen = this.chosenServices();
    if (!chosen.length) {
      return null;
    }
    const variable = chosen.some((service) => service.variable_price);
    const total = chosen.reduce((sum, service) => sum + (service.variable_price ? 0 : service.price), 0);
    const deposit = this.depositAmount() ?? 0;
    const discount = this.discount();
    const off = discount && !variable ? Math.round(total * discount.percent) / 100 : 0;
    const final = total - off;
    return { variable, total, deposit, later: Math.max(final - deposit, 0), discount, off, final };
  });
  /** Mayor descuento que aplicaría (cupón o clienta frecuente); no se suman. */
  protected readonly discount = computed(() => {
    if (this.usePackage()) {
      return null;
    }
    const couponOff = this.couponChecked() && this.couponChecked() === this.coupon().trim().toUpperCase() ? this.couponPercent() ?? 0 : 0;
    const loyaltyOff = this.loyaltyPercent() ?? 0;
    if (!couponOff && !loyaltyOff) {
      return null;
    }
    return couponOff >= loyaltyOff
      ? { percent: couponOff, label: `Cupón ${this.couponChecked()}` }
      : { percent: loyaltyOff, label: 'Clienta frecuente' };
  });
  protected readonly policy = computed(() => {
    const text = this.brand()?.cancel_policy?.trim();
    if (text) {
      return text;
    }
    const hours = this.brand()?.cancel_hours;
    return hours ? `Puedes cambiar o cancelar tu cita hasta ${hours} h antes desde el enlace que te damos al reservar.` : null;
  });
  protected readonly summary = computed(() => {
    const chosen = this.chosenServices();
    if (!chosen.length) {
      return null;
    }
    const minutes = this.totalMinutes();
    const variable = chosen.some((service) => service.variable_price);
    const price = chosen.reduce((total, service) => total + (service.variable_price ? 0 : service.price), 0);
    const slot = this.selectedSlot();
    const who = this.selectedStaff()?.full_name ?? (this.anyStaff() ? 'quien esté disponible' : null);
    return {
      title: chosen.length > 1 ? `${chosen[0].name} + ${chosen.length - 1} más` : chosen[0].name,
      detail: `${minutes} min · ${variable ? (price ? `desde ${this.formatPrice(price)}` : 'precio por cotizar') : this.formatPrice(price)}`,
      who,
      when: slot ? `${this.formatDate(slot)} · ${this.formatTime(slot)}` : null,
    };
  });

  protected readonly nameError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('client_name', {
      required: 'Ingresa tu nombre.',
      maxlength: 'El nombre es demasiado largo.',
    });
  });

  protected readonly phoneError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('client_phone', {
      required: 'Ingresa tu teléfono.',
      phone: 'Escribe tu teléfono a 10 dígitos.',
      maxlength: 'El teléfono es demasiado largo.',
    });
  });

  protected readonly emailError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('client_email', {
      email: 'Ingresa un correo válido.',
      maxlength: 'El correo es demasiado largo.',
    });
  });

  constructor() {
    this.restoreClient();
    this.loadCatalog();
    this.loadMine();
  }

  protected formatPrice(price: number): string {
    return this.currency.format(price);
  }

  protected formatTime(value: string): string {
    return formatSlotTime(value, this.timeFormat);
  }

  protected formatDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return this.dateFormat.format(parsed);
  }

  protected selectService(service: PublicService): void {
    this.selectedService.set(service);
    this.selectedSlot.set(null);
    this.extraIds.update((ids) => ids.filter((id) => id !== service.id));
    this.settleStaff();
    // Sin extras que ofrecer ni colaboradora que elegir, no hay nada más que decidir aquí.
    if (this.services().length === 1 && this.canChooseSchedule()) {
      this.goToSchedule();
    }
  }

  /** Quita a la colaboradora si ya no hace todo lo elegido y la elige sola cuando solo hay una. */
  private settleStaff(): void {
    const eligible = this.eligibleStaff();
    const current = this.selectedStaff();
    if (current && !eligible.some((member) => member.id === current.id)) {
      this.selectedStaff.set(null);
    }
    if (eligible.length === 1) {
      this.selectedStaff.set(eligible[0]);
    }
    if (eligible.length < 2) {
      this.anyStaff.set(false);
    }
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'EQ'
    );
  }

  protected selectStaff(member: PublicStaff): void {
    this.selectedStaff.set(member);
    this.anyStaff.set(false);
    this.selectedSlot.set(null);
    this.goToSchedule();
  }

  protected chooseAnyStaff(): void {
    this.selectedStaff.set(null);
    this.anyStaff.set(true);
    this.selectedSlot.set(null);
    this.goToSchedule();
  }

  protected goToSchedule(): void {
    if (!this.canChooseSchedule()) {
      return;
    }
    this.moveTo(2);
    this.dayHops = 0;
    this.bumpNotice.set(null);
    this.soonest.set([]);
    this.pendingSoonest = true;
    if (this.date() < this.minDate) {
      this.date.set(this.minDate);
    }
    this.loadOpenDays(true);
  }

  private loadSoonest(days: string[]): void {
    const service = this.selectedService();
    const picks = days.slice(0, 3);
    if (!service || !picks.length) {
      this.soonest.set([]);
      return;
    }
    const staffId = this.selectedStaff()?.id ?? null;
    forkJoin(
      picks.map((day) =>
        this.bookingApi.getAvailability(this.slug, service.id, staffId, day, this.extraIds(), this.resource()).pipe(
          map((rows) => rows[0] ?? null),
          catchError(() => of(null)),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.soonest.set(rows.filter((row): row is AvailabilitySlot => row !== null)));
  }

  protected pickSoonest(slot: AvailabilitySlot): void {
    this.date.set(slot.starts_at.slice(0, 10));
    this.selectSlot(slot);
  }

  /** "Hoy", "Mañana" o "jue 16", para que los atajos se lean de un vistazo. */
  protected dayLabel(value: string): string {
    const iso = value.slice(0, 10);
    if (iso === this.minDate) {
      return 'Hoy';
    }
    const tomorrow = new Date(`${this.minDate}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (iso === this.dayIso(tomorrow)) {
      return 'Mañana';
    }
    return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  }

  protected onDate(value: string): void {
    this.date.set(value);
    this.selectedSlot.set(null);
    this.waitSent.set(false);
    this.loadSlots();
  }

  protected monthDays(): Date[] {
    const cursor = new Date(`${this.date()}T12:00:00`);
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const lead = (start.getDay() + 6) % 7;
    const count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const days: Date[] = [];
    for (let index = 0; index < lead; index += 1) {
      days.push(new Date(start.getFullYear(), start.getMonth(), 1 - lead + index));
    }
    for (let day = 1; day <= count; day += 1) {
      days.push(new Date(start.getFullYear(), start.getMonth(), day));
    }
    return days;
  }

  protected monthLabel(): string {
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(`${this.date()}T12:00:00`));
  }

  protected themeLabel(): string {
    const month = new Date(`${this.date()}T12:00:00`).getMonth();
    if (month === 9) return '🎃 Halloween';
    if (month === 10) return '🌼 Día de Muertos';
    if (month === 11) return '🎄 Navidad y Año Nuevo';
    if (month === 1) return '♥ San Valentín';
    return '';
  }

  protected dateMonth(): number {
    return new Date(`${this.date()}T12:00:00`).getMonth();
  }

  protected dayIso(day: Date): string {
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    return `${day.getFullYear()}-${month}-${date}`;
  }

  protected toggleExtra(id: number): void {
    this.extraIds.update((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
    this.selectedSlot.set(null);
    this.settleStaff();
  }

  protected lookPackage(phone: string): void {
    this.lookLoyalty(phone);
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, '').length < 10) {
      this.lastPackagePhone = '';
      this.packageLeft.set(null);
      this.usePackage.set(false);
      return;
    }
    if (trimmed === this.lastPackagePhone) {
      return;
    }
    this.lastPackagePhone = trimmed;
    this.bookingApi.packageLeft(this.slug, trimmed).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (row) => {
        this.packageLeft.set(row);
        if (!row) {
          this.usePackage.set(false);
        }
      },
      error: () => this.packageLeft.set(null),
    });
  }

  /** Aviso de descuento por clienta frecuente en cuanto el teléfono está completo. */
  private lookLoyalty(phone: string): void {
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, '').length < 10) {
      this.lastLoyaltyPhone = '';
      this.loyaltyPercent.set(null);
      return;
    }
    if (trimmed === this.lastLoyaltyPhone) {
      return;
    }
    this.lastLoyaltyPhone = trimmed;
    const coupon = this.couponChecked();
    if (!this.brand()?.loyalty_every || !this.brand()?.loyalty_percent) {
      this.loyaltyPercent.set(null);
      if (coupon) {
        this.checkCoupon();
      }
      return;
    }
    this.bookingApi
      .getLoyalty(this.slug, trimmed, coupon || null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => {
          this.loyaltyPercent.set(row.percent ?? null);
          if (coupon) {
            this.couponPercent.set(row.coupon_percent ?? null);
            this.couponError.set(row.coupon_percent ? null : 'Ese cupón no es válido');
          }
        },
        error: () => this.loyaltyPercent.set(null),
      });
  }

  protected onCoupon(value: string): void {
    this.coupon.set(value);
    this.couponError.set(null);
    if (value.trim().toUpperCase() !== this.couponChecked()) {
      this.couponChecked.set('');
      this.couponPercent.set(null);
    }
  }

  /** Revisa el cupón solo para mostrar el descuento; el backend lo vuelve a validar al reservar. */
  protected checkCoupon(): void {
    const code = this.coupon().trim().toUpperCase();
    if (!code) {
      this.couponChecked.set('');
      this.couponPercent.set(null);
      this.couponError.set(null);
      return;
    }
    const phone = this.clientForm.controls.client_phone.value.trim();
    this.bookingApi
      .getLoyalty(this.slug, phone, code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => {
          this.couponChecked.set(code);
          this.couponPercent.set(row.coupon_percent ?? null);
          this.couponError.set(row.coupon_percent ? null : 'Ese cupón no es válido');
        },
        error: () => this.couponError.set('No pudimos revisar el cupón. Igual se aplica al confirmar si es válido.'),
      });
  }

  protected stars(filled: number): boolean[] {
    return [1, 2, 3, 4, 5].map((value) => value <= filled);
  }

  protected manageHref(token: string): string {
    return `/${this.slug}/manage/${token}`;
  }

  protected pickResource(value: string | number | null): void {
    this.resource.set(typeof value === 'string' && value ? value : null);
    this.selectedSlot.set(null);
    this.loadSlots();
    this.loadOpenDays(false);
  }

  protected resourcePicks(): { value: string; label: string }[] {
    return [{ value: '', label: 'Sin recurso' }, ...this.resourceList().map((item) => ({ value: item, label: item }))];
  }

  protected resourceList(): string[] {
    return (this.brand()?.resources ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  protected maxDate(): string {
    const ahead = this.brand()?.max_days_ahead ?? 90;
    const day = new Date();
    day.setDate(day.getDate() + ahead);
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    return `${day.getFullYear()}-${month}-${date}`;
  }

  protected pickMonthDay(day: Date): void {
    const iso = this.dayIso(day);
    if (iso < this.minDate || iso > this.maxDate() || day.getMonth() !== new Date(`${this.date()}T12:00:00`).getMonth()) {
      return;
    }
    this.onDate(iso);
  }

  protected shiftMonth(direction: -1 | 1): void {
    const cursor = new Date(`${this.date()}T12:00:00`);
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
    const iso = this.dayIso(next);
    if (iso > this.maxDate()) {
      return;
    }
    this.date.set(iso < this.minDate ? this.minDate : iso);
    this.selectedSlot.set(null);
    this.waitSent.set(false);
    // Al cambiar de mes a mano se queda en ese mes, aunque esté lleno.
    this.dayHops = 2;
    this.loadOpenDays(true);
  }

  private daysRequest = 0;

  /**
   * Marca los días con horarios del mes visible. Con `landOnOpenDay`, si el día elegido está lleno
   * salta al primero libre (y prueba el mes siguiente si este ya no tiene), luego carga sus horarios.
   */
  private loadOpenDays(landOnOpenDay: boolean): void {
    const service = this.selectedService();
    if (!service || !this.canChooseSchedule()) {
      return;
    }
    const requestId = ++this.daysRequest;
    if (landOnOpenDay) {
      this.slotsLoading.set(true);
      this.slotsError.set(null);
    }
    this.bookingApi
      .getAvailableDays(this.slug, service.id, this.selectedStaff()?.id ?? null, this.date().slice(0, 7), this.extraIds(), this.resource())
      .pipe(
        catchError(() => of([] as string[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((days) => {
        if (requestId !== this.daysRequest) {
          return;
        }
        this.openDays.set(days);
        if (this.pendingSoonest && (days.length || this.dayHops >= 2)) {
          this.pendingSoonest = false;
          this.loadSoonest(days);
        }
        if (!landOnOpenDay) {
          return;
        }
        if (!days.includes(this.date())) {
          if (days.length) {
            this.date.set(days[0]);
          } else if (this.dayHops < 2) {
            const cursor = new Date(`${this.date()}T12:00:00`);
            const next = this.dayIso(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
            if (next <= this.maxDate()) {
              this.dayHops += 1;
              this.date.set(next);
              this.loadOpenDays(true);
              return;
            }
          }
        }
        this.loadSlots();
      });
  }

  protected joinWait(): void {
    const service = this.selectedService();
    const memberId = this.selectedStaff()?.id ?? this.eligibleStaff()[0]?.id;
    const name = this.waitName().trim();
    const phone = this.waitPhone().trim();
    if (!service || !memberId || name.length < 2 || phone.length < 8 || this.waitSent()) {
      return;
    }
    this.bookingApi
      .joinWaitlist(this.slug, {
        service_id: service.id,
        staff_id: memberId,
        day: this.date(),
        client_name: name,
        client_phone: phone,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.waitSent.set(true) });
  }

  private slotStaffId: number | null = null;

  protected selectSlot(slot: AvailabilitySlot): void {
    this.selectedSlot.set(slot.starts_at);
    this.slotStaffId = slot.staff_id ?? null;
    this.bumpNotice.set(null);
    this.moveTo(3);
  }

  /** Le ganaron el horario (o ya no cumple la anticipación): de regreso a Horario con lo actualizado. */
  private bounceToSchedule(detail: string | null): void {
    this.selectedSlot.set(null);
    this.slotStaffId = null;
    this.bumpNotice.set(
      detail && detail !== 'Ese horario ya no está disponible'
        ? `${detail}. Elige otro horario; tus datos se quedan guardados.`
        : 'Alguien tomó ese horario mientras llenabas tus datos. Elige otro; tus datos se quedan guardados.',
    );
    this.step.set(2);
    scrollToTop();
    this.pendingSoonest = true;
    this.dayHops = 0;
    this.loadOpenDays(true);
  }

  protected goToDetails(): void {
    if (!this.selectedSlot()) {
      return;
    }
    this.moveTo(3);
  }

  protected openStep(id: number): void {
    if (this.confirmation() || id < 1 || id > this.reached() || id === this.step()) {
      return;
    }
    this.step.set(id);
    scrollToTop();
    if (id === 2) {
      this.loadSlots();
      this.loadOpenDays(false);
    }
  }

  protected back(): void {
    this.openStep(this.step() - 1);
  }

  protected depositAmount(): number | null {
    const account = this.brand()?.deposit_account;
    if (!account) {
      return null;
    }
    if (this.selectedService()?.variable_price && this.brand()?.deposit_percent) {
      return null;
    }
    const own = this.selectedService()?.deposit_amount;
    const amount = own === undefined || own === null ? this.brand()?.deposit_amount : own;
    return amount ? amount : null;
  }

  protected holdsDeposit(): boolean {
    return this.depositAmount() != null || Boolean(this.selectedService()?.variable_price && this.brand()?.deposit_percent && this.brand()?.deposit_account);
  }

  protected confirm(): void {
    const service = this.selectedService();
    const staffId = this.selectedStaff()?.id ?? this.slotStaffId;
    const startsAt = this.selectedSlot();
    if (!service || !staffId || !startsAt || this.isSaving()) {
      return;
    }

    this.validationTick.update((tick) => tick + 1);
    this.clientForm.markAllAsTouched();
    if (this.clientForm.invalid) {
      return;
    }

    const { client_name, client_phone, client_email, notes } = this.clientForm.getRawValue();
    if (service.variable_price && !notes.trim()) {
      this.formError.set('Cuéntanos qué necesitas para cotizar.');
      return;
    }
    if (this.copy().pet && !this.petName().trim()) {
      this.formError.set('Escribe el nombre de la mascota.');
      return;
    }
    this.isSaving.set(true);
    this.formError.set(null);

    this.bookingApi
      .createAppointment(this.slug, {
        service_id: service.id,
        staff_id: staffId,
        starts_at: startsAt,
        client_name,
        client_phone,
        client_email: client_email.trim() || null,
        notes: [this.copy().pet && this.petName().trim() ? `Mascota: ${this.petName().trim()}` : '', notes.trim()].filter(Boolean).join('\n') || null,
        extra_service_ids: this.extraIds(),
        resource_name: this.resource(),
        answers: this.answers().trim() || null,
        use_package: this.usePackage(),
        reference_photos: this.refPhotos(),
        website: this.trap() || null,
        coupon: this.coupon().trim() || null,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (appointment) => {
          this.isSaving.set(false);
          this.confirmation.set(appointment);
          this.moveTo(4);
          this.saveClient(client_name, client_phone, client_email);
          this.rememberVisit(appointment);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
          if (error instanceof HttpErrorResponse && error.status === 409 && !/paquete/i.test(String(detail ?? ''))) {
            this.bounceToSchedule(typeof detail === 'string' ? detail : null);
            return;
          }
          this.formError.set(readError(error, 'No pudimos registrar la cita.'));
        },
      });
  }

  protected setRating(value: number): void {
    this.reviewRating.set(value);
  }

  protected onReviewComment(event: Event): void {
    this.reviewComment.set((event.target as HTMLTextAreaElement).value);
  }

  protected onReviewPhoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = 480;
      const scale = Math.min(1, size / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      this.reviewPhoto.set(data.length > 180000 ? null : data);
      if (data.length > 180000) {
        this.reviewError.set('La foto es demasiado pesada.');
      }
    };
    image.src = url;
  }

  protected sendReview(): void {
    const appointment = this.confirmation();
    const comment = this.reviewComment().trim();
    if (!appointment || !comment || this.reviewSaving()) {
      this.reviewError.set(comment ? null : 'Escribe un comentario.');
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set(null);
    this.reviewsApi
      .createPublicReview(this.slug, {
        client_name: appointment.client_name,
        rating: this.reviewRating(),
        comment,
        photo_url: this.reviewPhoto(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reviewSaving.set(false);
          this.reviewSent.set(true);
        },
        error: (error: unknown) => {
          this.reviewSaving.set(false);
          this.reviewError.set(readError(error, 'No pudimos publicar el comentario.'));
        },
      });
  }

  protected restart(): void {
    this.step.set(1);
    this.reached.set(1);
    this.selectedService.set(null);
    this.selectedStaff.set(null);
    this.anyStaff.set(false);
    this.extraIds.set([]);
    this.categoryFilter.set('');
    this.selectedSlot.set(null);
    this.slotStaffId = null;
    this.slots.set([]);
    this.openDays.set([]);
    this.soonest.set([]);
    this.bumpNotice.set(null);
    this.manageCopied.set(false);
    this.refPhotos.set([]);
    this.photoError.set(null);
    this.answers.set('');
    this.coupon.set('');
    this.couponOpen.set(false);
    this.couponChecked.set('');
    this.couponPercent.set(null);
    this.couponError.set(null);
    this.lastLoyaltyPhone = '';
    this.loyaltyPercent.set(null);
    this.confirmation.set(null);
    this.proofSent.set(false);
    this.reviewRating.set(5);
    this.reviewComment.set('');
    this.reviewPhoto.set(null);
    this.reviewSent.set(false);
    this.reviewError.set(null);
    this.formError.set(null);
    this.clientForm.reset();
    this.showOptional.set(false);
    this.date.set(this.minDate);
    this.restoreClient();
    this.loadMine();
    scrollToTop();
  }

  private readMine(): SavedVisit[] {
    try {
      const rows = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]') as unknown;
      return Array.isArray(rows)
        ? rows.filter(
            (row): row is SavedVisit =>
              typeof row?.token === 'string' && typeof row?.slug === 'string' && typeof row?.starts_at === 'string',
          )
        : [];
    } catch {
      return [];
    }
  }

  private writeMine(rows: SavedVisit[]): void {
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify(rows.slice(-20)));
    } catch {
      // Sin almacenamiento: la clienta conserva el enlace que le damos al reservar.
    }
  }

  private rememberVisit(appointment: Appointment): void {
    const token = appointment.cancel_token;
    if (!token || !this.slug) {
      return;
    }
    const rows = this.readMine().filter((row) => row.token !== token);
    this.writeMine([...rows, { token, slug: this.slug, starts_at: appointment.starts_at }]);
  }

  /** Muestra las citas futuras guardadas en este dispositivo; descarta canceladas o pasadas. */
  private loadMine(): void {
    const now = Date.now();
    const all = this.readMine();
    const keep = all.filter((row) => new Date(row.starts_at).getTime() > now);
    if (keep.length !== all.length) {
      this.writeMine(keep);
    }
    const mine = keep.filter((row) => row.slug === this.slug);
    if (!mine.length) {
      this.upcoming.set([]);
      return;
    }
    forkJoin(
      mine.map((row) =>
        this.bookingApi.getManagedAppointment(row.token).pipe(
          map((detail) => ({ row, detail })),
          catchError((error: unknown) => of({ row, detail: null, gone: error instanceof HttpErrorResponse && error.status === 404 })),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        const visible: UpcomingVisit[] = [];
        const drop = new Set<string>();
        for (const result of results) {
          const detail = result.detail;
          if (!detail) {
            if ('gone' in result && result.gone) {
              drop.add(result.row.token);
            }
            continue;
          }
          if (detail.is_cancelled || detail.is_past || detail.status === 'cancelled' || detail.status === 'no_show') {
            drop.add(result.row.token);
            continue;
          }
          visible.push({
            ...result.row,
            starts_at: detail.starts_at,
            service_name: detail.service_name,
            staff_name: detail.staff_name,
            status: detail.status,
          });
        }
        if (drop.size) {
          this.writeMine(this.readMine().filter((row) => !drop.has(row.token)));
        }
        this.upcoming.set(visible.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      });
  }

  /** Quien ya reservó en este navegador encuentra su nombre y teléfono llenos. */
  private restoreClient(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(CLIENT_KEY) ?? 'null') as
        | { name?: string; phone?: string; email?: string }
        | null;
      if (!saved?.name || !saved.phone) {
        return;
      }
      this.clientForm.patchValue({ client_name: saved.name, client_phone: saved.phone, client_email: saved.email ?? '' });
      this.waitName.set(saved.name);
      this.waitPhone.set(saved.phone);
      this.remembered.set(true);
      if (saved.email) {
        this.showOptional.set(true);
      }
      this.lastPackagePhone = '';
      this.lookPackage(saved.phone);
    } catch {
      // Sin almacenamiento disponible: el formulario simplemente queda vacío.
    }
  }

  private saveClient(name: string, phone: string, email: string): void {
    try {
      localStorage.setItem(CLIENT_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }));
    } catch {
      // Recordar los datos es una comodidad; si falla no afecta la cita.
    }
  }

  protected forgetClient(): void {
    try {
      localStorage.removeItem(CLIENT_KEY);
    } catch {
      // Nada que borrar.
    }
    this.clientForm.patchValue({ client_name: '', client_phone: '', client_email: '' });
    this.clientForm.markAsUntouched();
    this.waitName.set('');
    this.waitPhone.set('');
    this.remembered.set(false);
    this.lookPackage('');
  }

  private loadCatalog(): void {
    if (!this.slug) {
      this.isLoading.set(false);
      this.loadError.set('Falta el enlace del negocio.');
      return;
    }

    forkJoin({
      brand: this.bookingApi.getPublicBusiness(this.slug),
      services: this.bookingApi.getPublicServices(this.slug),
      staff: this.bookingApi.getPublicStaff(this.slug),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ brand, services, staff }) => {
          this.brand.set(brand);
          document.title = brand.name;
          this.services.set(services);
          this.staff.set(staff);
          this.isLoading.set(false);
          // El teléfono recordado se revisó antes de conocer la lealtad del negocio.
          this.lastLoyaltyPhone = '';
          this.lookLoyalty(this.clientForm.controls.client_phone.value);
          this.reviewsApi.getPublicReviews(this.slug).pipe(catchError(() => of([] as Review[]))).subscribe((rows) => this.opinions.set(rows));
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el negocio.'));
        },
      });
  }

  private loadSlots(): void {
    const service = this.selectedService();
    const date = this.date();
    if (!service || !this.canChooseSchedule() || !date) {
      return;
    }

    if (dateClosed(date, this.shopNote())) {
      this.slots.set([]);
      this.slotsLoading.set(false);
      this.slotsError.set(`Cerramos del ${closedSpan(this.shopNote())}.`);
      return;
    }

    const requestId = ++this.slotsRequest;
    this.slotsLoading.set(true);
    this.slotsError.set(null);

    this.bookingApi
      .getAvailability(this.slug, service.id, this.selectedStaff()?.id ?? null, date, this.extraIds(), this.resource())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (slots) => {
          if (requestId !== this.slotsRequest) {
            return;
          }
          this.slots.set([...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
          this.slotsLoading.set(false);
        },
        error: (error: unknown) => {
          if (requestId !== this.slotsRequest) {
            return;
          }
          this.slots.set([]);
          this.slotsLoading.set(false);
          this.slotsError.set(readError(error, 'No pudimos consultar los horarios.'));
        },
      });
  }

  protected readonly proofSent = signal(false);
  protected readonly accountCopied = signal(false);

  protected copyAccount(): void {
    const account = this.brand()?.deposit_account ?? '';
    if (!account) {
      return;
    }
    void navigator.clipboard.writeText(account).then(() => this.accountCopied.set(true));
  }

  protected onProof(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    const appointment = this.confirmation();
    if (!file || !appointment?.cancel_token) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 480;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.72);
        if (data.length > 180000) {
          this.formError.set('Esa foto es demasiado pesada.');
          return;
        }
        this.bookingApi
          .uploadPaymentProof(appointment.cancel_token as string, data)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => this.proofSent.set(true),
            error: () => this.formError.set('No pudimos subir el comprobante.'),
          });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  protected async onRefPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].slice(0, 3 - this.refPhotos().length);
    input.value = '';
    this.photoError.set(null);
    for (const file of files) {
      const data = await shrinkImage(file);
      if (data) {
        this.refPhotos.update((photos) => [...photos, data].slice(0, 3));
      } else {
        this.photoError.set('No pudimos usar una de las fotos. Prueba con otra.');
      }
    }
  }

  protected removeRefPhoto(index: number): void {
    this.refPhotos.update((photos) => photos.filter((_, position) => position !== index));
  }

  /** Mensaje para el negocio con todo lo necesario para atender (o cotizar) sin preguntar de nuevo. */
  private whatsappText(appointment: Appointment, withPhotoLinks: boolean): string {
    const brand = this.brand();
    const quote = Boolean(this.selectedService()?.variable_price);
    const visit = this.copy().visit.toLowerCase();
    const service = [appointment.service_name || this.selectedService()?.name, appointment.extra_label].filter(Boolean).join(' + ');
    const lines = [
      quote
        ? `¡Hola${brand?.name ? `, ${brand.name}` : ''}! 👋 Quiero *cotizar* un servicio. Ya aparté mi lugar en su página de reservas:`
        : `¡Hola${brand?.name ? `, ${brand.name}` : ''}! 👋 Acabo de reservar en su página. Estos son los datos de mi ${visit}:`,
      '',
      `📋 *Servicio:* ${service}`,
      `📅 *Día:* ${this.formatDate(appointment.starts_at)}`,
      `🕐 *Hora:* ${this.formatTime(appointment.starts_at)}`,
      `💁 *Con:* ${appointment.staff_name || this.selectedStaff()?.full_name || 'quien esté disponible'}`,
      `👤 *A nombre de:* ${appointment.client_name}${appointment.client_phone ? ` (${appointment.client_phone})` : ''}`,
    ];
    if (appointment.notes) {
      lines.push(`💬 *${quote ? 'Lo que necesito' : 'Nota'}:* ${appointment.notes}`);
    }
    if (appointment.answers) {
      lines.push(`📝 *Respuestas:* ${appointment.answers}`);
    }
    const photos = this.refPhotos().length;
    if (photos && withPhotoLinks && appointment.cancel_token) {
      lines.push('', `📷 *Fotos de referencia* (toca para verlas):`);
      for (let index = 0; index < photos; index += 1) {
        lines.push(this.bookingApi.referencePhotoUrl(appointment.cancel_token, index));
      }
    } else if (photos) {
      lines.push('', `📷 Les adjunto ${photos === 1 ? 'una foto' : `${photos} fotos`} de referencia.`);
    }
    if (appointment.status === 'awaiting_deposit') {
      lines.push(
        '',
        appointment.deposit_amount
          ? `💰 *Anticipo:* ${this.formatPrice(appointment.deposit_amount)} a la cuenta ${brand?.deposit_account ?? ''}. En cuanto transfiera les mando el comprobante por aquí.`
          : '💰 Quedo pendiente de la cotización y del anticipo para confirmar.',
      );
    }
    if (quote) {
      lines.push('', '¿Me pueden decir el precio? ¡Gracias!');
    }
    const manage = this.manageLink(appointment);
    if (manage) {
      lines.push('', `🔗 Ver, cambiar o cancelar la ${visit}: ${manage}`);
    }
    return lines.join('\n');
  }

  protected whatsappHref(appointment: Appointment): string | null {
    const phone = (this.brand()?.phone ?? '').replace(/\D/g, '');
    if (!phone) {
      return null;
    }
    return `https://wa.me/${phone}?text=${encodeURIComponent(this.whatsappText(appointment, true))}`;
  }

  /** Opción para celular: comparte las fotos como imágenes; la clienta elige el chat del negocio. */
  protected async sharePhotos(appointment: Appointment): Promise<void> {
    const files = this.refPhotos().map((data, index) => dataUrlToFile(data, `referencia-${index + 1}.jpg`));
    try {
      await navigator.share({ files, text: this.whatsappText(appointment, false) });
    } catch {
      // La clienta cerró el menú de compartir; el botón de WhatsApp con enlaces sigue disponible.
    }
  }

  protected manageLink(appointment: Appointment): string | null {
    return appointment.cancel_token && this.slug
      ? `${window.location.origin}/${this.slug}/manage/${appointment.cancel_token}`
      : null;
  }

  protected copyManage(link: string): void {
    void navigator.clipboard.writeText(link).then(() => this.manageCopied.set(true));
  }

  /** Hasta cuándo se aparta el horario sin anticipo; después el backend lo libera. */
  protected holdUntil(appointment: Appointment): string | null {
    if (!appointment.created_at) {
      return null;
    }
    const limit = new Date(appointment.created_at);
    if (Number.isNaN(limit.getTime())) {
      return null;
    }
    limit.setHours(limit.getHours() + (this.brand()?.deposit_hold_hours || 3));
    const sameDay = this.dayIso(limit) === this.minDate;
    return `${sameDay ? 'hoy' : this.dateFormat.format(limit)} a las ${this.timeFormat.format(limit)}`;
  }

  private calendarEvent(appointment: Appointment) {
    const start = new Date(appointment.starts_at);
    const end = new Date(start.getTime() + (this.totalMinutes() || 60) * 60_000);
    const service = appointment.service_name || this.selectedService()?.name || 'Cita';
    const manage = this.manageLink(appointment);
    return {
      start,
      end,
      title: `${service} · ${this.brand()?.name ?? ''}`.trim(),
      location: this.brand()?.address ?? '',
      details: [`Con ${appointment.staff_name || this.selectedStaff()?.full_name || ''}`, manage ? `Ver o cambiar: ${manage}` : '']
        .filter(Boolean)
        .join('\n'),
    };
  }

  protected googleCalendarHref(appointment: Appointment): string {
    const event = this.calendarEvent(appointment);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${calendarStamp(event.start)}/${calendarStamp(event.end)}`,
      details: event.details,
      location: event.location,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /** Archivo .ics: lo abren el calendario del iPhone, Outlook y la mayoría de Android. */
  protected downloadIcs(appointment: Appointment): void {
    const event = this.calendarEvent(appointment);
    const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (char) => `\\${char}`);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Nexia//Reservas//ES',
      'BEGIN:VEVENT',
      `UID:${appointment.cancel_token ?? appointment.id}@nexia`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${calendarStamp(event.start)}`,
      `DTEND:${calendarStamp(event.end)}`,
      `SUMMARY:${escape(event.title)}`,
      `LOCATION:${escape(event.location)}`,
      `DESCRIPTION:${escape(event.details)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(event.title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mi-cita.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected openWhatsapp(href: string): void {
    window.open(href, '_blank', 'noopener');
  }

  protected businessWhatsapp(phone: string): string {
    const text = `¡Hola${this.brand()?.name ? `, ${this.brand()!.name}` : ''}! 👋 Vi su página de reservas y tengo una pregunta:\n\n`;
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  }

  protected instagramHandle(value: string): string {
    const trimmed = value.trim();
    const fromUrl = trimmed.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    const handle = (fromUrl ?? trimmed).replace(/^@/, '').split(/[/?#]/)[0];
    return handle ? `@${handle}` : trimmed;
  }

  private moveTo(id: number): void {
    this.step.set(id);
    this.reached.update((current) => Math.max(current, id));
    scrollToTop();
  }

  protected externalHref(value: string, host: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('http')) {
      return trimmed;
    }
    return `https://${host}/${trimmed.replace(/^@/, '')}`;
  }

  private fieldError(
    name: 'client_name' | 'client_phone' | 'client_email',
    messages: Record<string, string>,
  ): string | null {
    const control = this.clientForm.controls[name];
    if (!control.touched || control.valid) {
      return null;
    }
    const errorName = Object.keys(messages).find((key) => control.hasError(key));
    return errorName ? messages[errorName] : 'Revisa este campo.';
  }
}

function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function safeColor(value: string | undefined): string {
  return value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : FALLBACK_COLOR;
}

function formatSlotTime(value: string, formatter: Intl.DateTimeFormat): string {
  if (/^\d{2}:\d{2}/.test(value) && !value.includes('T')) {
    return value.slice(0, 5);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatter.format(parsed);
}

function slotHour(value: string): number {
  const clock = value.match(/(?:T|^)(\d{2}):\d{2}/);
  return clock ? Number(clock[1]) : new Date(value).getHours();
}

/** Reduce la foto hasta que pese menos de 180 KB (límite del backend), sin perder demasiado detalle. */
function shrinkImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      for (const [side, quality] of [[1000, 0.75], [800, 0.7], [640, 0.6], [480, 0.55]] as const) {
        const scale = Math.min(1, side / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= 180000) {
          resolve(data);
          return;
        }
      }
      resolve(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function dataUrlToFile(data: string, name: string): File {
  const [header, body] = data.split(',');
  const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type });
}

function canShareImages(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'foto.jpg', { type: 'image/jpeg' })] })
    );
  } catch {
    return false;
  }
}

/** Fecha local "flotante" (sin zona) para calendarios: 20261016T093000. */
function calendarStamp(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`;
}

function scrollToTop(): void {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
