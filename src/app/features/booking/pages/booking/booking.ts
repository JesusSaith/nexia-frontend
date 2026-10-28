import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonShape, FONT_STACKS, FontStyle, SHAPE_RADIUS, textOn } from '@core/theme';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
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
import { depositPolicyText } from '@core/deposit-policy';
import { methodsSentence } from '@core/payment-methods';
// FUTURE_PHASE_SPEI: import { SpeiCheckComponent } from '@shared/components/spei-check/spei-check';
import { closureOn, closureSpan, liveOffer, nextClosure, noteOf } from '@core/shop-note';
import { Appointment, AvailabilitySlot } from '@core/models/appointment.model';
import { BusinessBrand, PublicService, PublicStaff } from '@core/models/business.model';
import { BookingService } from '@core/services/booking.service';
import { formatMinutes, minutesBetween } from '@core/appointment-summary';
import { whatsappLink } from '@core/message-templates';
import { Review } from '@core/models/review.model';
import { ReviewsService } from '@core/services/reviews.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';
import { PlaceMap } from '@shared/components/place-map/place-map';
import { CalendarEvent, downloadIcs, googleCalendarUrl } from '@core/calendar';
import { canNavigate, googleMapsUrl } from '@core/maps';

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
    // FUTURE_PHASE_SPEI: SpeiCheckComponent,
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    PickFieldComponent,
    PlaceMap,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
  host: {
    '[style.--booking-primary]': 'primaryColor()',
    '[style.--page-canvas]': 'canvasColor()',
    '[style.--booking-on]': 'onPrimary()',
    '[style.--booking-accent]': 'accentColor()',
    '[style.--booking-radius]': 'buttonRadius()',
    '[style.font-family]': 'fontFamily()',
    '[class.fill-outline]': "brand()?.button_fill === 'outline'",
    '[class.shape-custom]': "(brand()?.button_shape || 'pill') !== 'pill'",
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
  private readonly currencyWhole = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
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
  /** Qué pasa con el anticipo si cancela, dicho antes de pagar. */
  protected readonly depositPolicy = computed(() => depositPolicyText(this.brand()?.deposit_cancel_policy, this.brand()?.cancel_hours));
  /** Hay punto en el mapa o dirección: se ofrece "Cómo llegar". */
  protected readonly hasPlace = computed(() => canNavigate(this.brand()));
  /** El mapa del encabezado se carga solo al abrirlo, para no frenar la página. */
  protected readonly mapOpen = signal(false);
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
  /** Opción elegida del servicio (si tiene); cambia precio y duración. */
  protected readonly selectedVariant = signal<string | null>(null);
  protected readonly selectedStaff = signal<PublicStaff | null>(null);
  /** "Cualquiera disponible": el horario elegido define quién atiende. */
  protected readonly anyStaff = signal(false);
  protected readonly extraIds = signal<number[]>([]);
  protected readonly showOptional = signal(false);
  protected readonly remembered = signal(false);
  /** Primer horario libre de los próximos días con lugar, para reservar "lo antes posible" sin calendario. */
  protected readonly soonest = signal<AvailabilitySlot[]>([]);
  /** Aviso cuando el horario se ocupó mientras el cliente llenaba sus datos. */
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
  /** Aviso arriba solo si el próximo cierre empieza en los siguientes 30 días. */
  protected readonly closedLabel = computed(() => {
    const next = nextClosure(this.shopNote(), todayInputValue());
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    return next && next.from <= soon.toISOString().slice(0, 10) ? closureSpan(next) + (next.label ? ` (${next.label})` : '') : '';
  });
  protected readonly payMethods = computed(() => methodsSentence(this.brand()?.payment_methods));
  protected readonly offer = computed(() => liveOffer(this.shopNote(), todayInputValue()));
  protected readonly primaryColor = computed(() => safeColor(this.brand()?.primary_color));
  /** Tema elegido en Configuración → Apariencia. */
  protected readonly onPrimary = computed(() => textOn(this.primaryColor()));
  protected readonly accentColor = computed(() => {
    const value = this.brand()?.accent_color;
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value : this.primaryColor();
  });
  protected readonly buttonRadius = computed(() => SHAPE_RADIUS[(this.brand()?.button_shape as ButtonShape) || 'pill'] ?? '999px');
  protected readonly fontFamily = computed(() => FONT_STACKS[(this.brand()?.font_style as FontStyle) || 'modern'] ?? null);
  protected readonly headerStyle = computed(() => this.brand()?.header_style || 'cover');
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
    () =>
      this.selectedService() !== null &&
      (!(this.selectedService()?.variants ?? []).length || this.selectedVariant() !== null) &&
      (this.selectedStaff() !== null || this.anyStaff()),
  );
  protected readonly chosenServices = computed(() => {
    const picked = this.selectedService();
    if (!picked) {
      return [];
    }
    const option = (picked.variants ?? []).find((item) => item.name === this.selectedVariant());
    const main = option ? { ...picked, name: `${picked.name} · ${option.name}`, price: option.price, duration_minutes: option.duration_minutes } : picked;
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
      : { percent: loyaltyOff, label: `${this.copy().client} frecuente` };
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
      detail: `${this.formatMinutes(minutes)} · ${variable ? (price ? `desde ${this.formatPrice(price)}` : 'precio por cotizar') : this.formatPrice(price)}`,
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

  /** Sin centavos cuando el precio es redondo: "$280", no "$280.00". */
  protected formatPrice(price: number): string {
    return Number.isInteger(price) ? this.currencyWhole.format(price) : this.currency.format(price);
  }

  /** "45 min", "1 h" o "3 h 31 min": más fácil de leer que 211 min. */
  protected formatMinutes(total: number): string {
    return formatMinutes(total);
  }

  /** Duración real de la cita ya reservada (con extras), o null si la API no manda el final. */
  protected durationOf(appointment: Appointment): string | null {
    const minutes = minutesBetween(appointment.starts_at, appointment.ends_at);
    return minutes ? formatMinutes(minutes) : null;
  }

  /** Total de la cita: el que quedó guardado (opción y extras) o el del servicio si no es de precio variable. */
  protected totalOf(appointment: Appointment): number | null {
    if (appointment.quoted_price != null) {
      return appointment.quoted_price;
    }
    const service = this.selectedService();
    return service && !service.variable_price ? service.price : null;
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

  protected minVariant(service: PublicService): number {
    return Math.min(...(service.variants ?? []).map((item) => item.price));
  }

  protected selectService(service: PublicService): void {
    if (this.selectedService()?.id !== service.id) {
      this.selectedVariant.set(null);
    }
    this.selectedService.set(service);
    this.selectedSlot.set(null);
    this.extraIds.update((ids) => ids.filter((id) => id !== service.id));
    this.settleStaff();
    this.scrollToNext();
    // Sin extras que ofrecer, opciones ni colaboradora que elegir, no hay nada más que decidir aquí.
    if (this.services().length === 1 && !(service.variants ?? []).length && this.canChooseSchedule()) {
      this.goToSchedule();
    }
  }

  /** En celular, baja hasta "¿Sumas otro servicio?" y la persona que atiende, que quedan fuera de la pantalla. */
  private scrollToNext(): void {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 639px)').matches) {
      return;
    }
    setTimeout(() => {
      const anchor = document.getElementById('tras-servicio');
      if (anchor && anchor.getBoundingClientRect().top > window.innerHeight * 0.55) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
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
        this.bookingApi.getAvailability(this.slug, service.id, staffId, day, this.extraIds(), this.resource(), this.selectedVariant()).pipe(
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
    if (month === 9) return 'Halloween';
    if (month === 10) return 'Día de Muertos';
    if (month === 11) return 'Navidad y Año Nuevo';
    if (month === 1) return 'San Valentín';
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
      .getAvailableDays(this.slug, service.id, this.selectedStaff()?.id ?? null, this.date().slice(0, 7), this.extraIds(), this.resource(), this.selectedVariant())
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
    // Si este paso tiene su entrada en el historial, se usa para que "Atrás" del navegador y el botón de la página coincidan.
    if (history.state?.nxStep === this.step() && !this.confirmation()) {
      history.back();
      return;
    }
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
        variant: this.selectedVariant(),
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
      // Sin almacenamiento: el cliente conserva el enlace que le damos al reservar.
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
          // Entró por un enlace anterior (QR viejo): se pasa al enlace actual.
          if (brand.slug && brand.slug !== this.slug) {
            location.replace(location.pathname.replace(`/${this.slug}/`, `/${brand.slug}/`) + location.search);
            return;
          }
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

    const closure = closureOn(date, this.shopNote());
    if (closure) {
      this.slots.set([]);
      this.slotsLoading.set(false);
      this.slotsError.set(closure.from === closure.to ? `Ese día no abrimos${closure.label ? ` (${closure.label})` : ''}.` : `Cerramos del ${closureSpan(closure)}.`);
      return;
    }

    const requestId = ++this.slotsRequest;
    this.slotsLoading.set(true);
    this.slotsError.set(null);

    this.bookingApi
      .getAvailability(this.slug, service.id, this.selectedStaff()?.id ?? null, date, this.extraIds(), this.resource(), this.selectedVariant())
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

  /** "Copiar CLABE" si la cuenta es una CLABE (18 dígitos); si no, "Copiar cuenta". */
  protected accountLabel(): string {
    return (this.brand()?.deposit_account ?? '').replace(/\D/g, '').length === 18 ? 'CLABE' : 'cuenta';
  }

  /** Cómo llegar en un toque: abre la ruta en Google Maps (la app del celular, si la tiene). */
  protected directionsHref(): string | null {
    const place = this.brand();
    return place && canNavigate(place) ? googleMapsUrl(place) : null;
  }

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
    return whatsappLink(phone, this.whatsappText(appointment, true));
  }

  /** Opción para celular: comparte las fotos como imágenes; el cliente elige el chat del negocio. */
  protected async sharePhotos(appointment: Appointment): Promise<void> {
    const files = this.refPhotos().map((data, index) => dataUrlToFile(data, `referencia-${index + 1}.jpg`));
    try {
      await navigator.share({ files, text: this.whatsappText(appointment, false) });
    } catch {
      // El cliente cerró el menú de compartir; el botón de WhatsApp con enlaces sigue disponible.
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

  private calendarEvent(appointment: Appointment): CalendarEvent {
    const start = new Date(appointment.starts_at);
    const end = new Date(start.getTime() + (this.totalMinutes() || 60) * 60_000);
    const service = appointment.service_name || this.selectedService()?.name || 'Cita';
    const manage = this.manageLink(appointment);
    return {
      start,
      end,
      title: `${service} · ${this.brand()?.name ?? ''}`.trim(),
      location: this.brand()?.address ?? '',
      details: [
        `Con ${appointment.staff_name || this.selectedStaff()?.full_name || ''}`,
        canNavigate(this.brand()) ? `Cómo llegar: ${googleMapsUrl(this.brand()!)}` : '',
        manage ? `Ver o cambiar: ${manage}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      uid: String(appointment.cancel_token ?? appointment.id),
    };
  }

  protected googleCalendarHref(appointment: Appointment): string {
    return googleCalendarUrl(this.calendarEvent(appointment));
  }

  /** Archivo .ics con la cita y dos avisos (un día y dos horas antes). */
  protected downloadIcs(appointment: Appointment): void {
    downloadIcs(this.calendarEvent(appointment));
  }

  protected openWhatsapp(href: string): void {
    window.open(href, '_blank', 'noopener');
  }

  protected businessWhatsapp(phone: string): string {
    const text = `¡Hola${this.brand()?.name ? `, ${this.brand()!.name}` : ''}! 👋 Vi su página de reservas y tengo una pregunta:\n\n`;
    return whatsappLink(phone, text);
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
    // Cada paso es una entrada del historial: "Atrás" del celular regresa un paso, no sale de la página.
    history.pushState({ ...history.state, nxStep: id }, '');
    scrollToTop();
  }

  /** Botón Atrás (o gesto) del navegador: regresa al paso anterior sin perder lo que ya eligió. */
  @HostListener('window:popstate', ['$event'])
  protected onPopState(event: PopStateEvent): void {
    if (this.confirmation()) {
      return;
    }
    const target = Number(event.state?.nxStep ?? 1);
    if (target !== this.step() && target <= this.reached()) {
      this.step.set(target);
      scrollToTop();
      if (target === 2) {
        this.loadSlots();
        this.loadOpenDays(false);
      }
    }
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
