import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Appointment } from '@core/models/appointment.model';
import { BusinessBrand, PublicService, PublicStaff } from '@core/models/business.model';
import { BookingService } from '@core/services/booking.service';
import { Review } from '@core/models/review.model';
import { ReviewsService } from '@core/services/reviews.service';

const STEPS = [
  { id: 1, label: 'Servicio' },
  { id: 2, label: 'Horario' },
  { id: 3, label: 'Datos' },
  { id: 4, label: 'Confirmación' },
] as const;

const FALLBACK_COLOR = '#E11D48';

@Component({
  selector: 'app-booking',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
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
  protected readonly slug =
    this.route.snapshot.paramMap.get('businessSlug') ??
    this.route.parent?.snapshot.paramMap.get('businessSlug') ??
    '';
  protected readonly minDate = todayInputValue();

  protected readonly step = signal(1);
  protected readonly brand = signal<BusinessBrand | null>(null);
  protected readonly opinions = signal<Review[]>([]);
  protected readonly services = signal<PublicService[]>([]);
  protected readonly staff = signal<PublicStaff[]>([]);
  protected readonly selectedService = signal<PublicService | null>(null);
  protected readonly selectedStaff = signal<PublicStaff | null>(null);
  protected readonly date = signal(this.minDate);
  protected readonly waitName = signal('');
  protected readonly waitPhone = signal('');
  protected readonly waitSent = signal(false);
  protected readonly openDays = signal<string[]>([]);
  protected readonly slots = signal<{ starts_at: string }[]>([]);
  protected readonly selectedSlot = signal<string | null>(null);
  protected readonly confirmation = signal<Appointment | null>(null);
  protected readonly reviewRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly reviewPhoto = signal<string | null>(null);
  protected readonly reviewSaving = signal(false);
  protected readonly reviewSent = signal(false);
  protected readonly reviewError = signal<string | null>(null);
  protected readonly reviewStars = [1, 2, 3, 4, 5];

  protected readonly isLoading = signal(true);
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
      validators: [Validators.required, Validators.maxLength(32)],
    }),
    client_email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  private readonly formEvents = toSignal(this.clientForm.events, { initialValue: undefined });

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
    return members.filter((member) => (member.service_ids ?? []).includes(service.id));
  });
  protected readonly canChooseSchedule = computed(
    () => this.selectedService() !== null && this.selectedStaff() !== null,
  );

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
    this.loadCatalog();
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
    const current = this.selectedStaff();
    if (current && !(current.service_ids ?? []).includes(service.id)) {
      this.selectedStaff.set(null);
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
    this.selectedSlot.set(null);
  }

  protected goToSchedule(): void {
    if (!this.canChooseSchedule()) {
      return;
    }
    this.step.set(2);
    this.loadSlots();
    this.loadOpenDays();
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

  protected pickMonthDay(day: Date): void {
    const iso = this.dayIso(day);
    if (iso < this.minDate || day.getMonth() !== new Date(`${this.date()}T12:00:00`).getMonth()) {
      return;
    }
    this.onDate(iso);
  }

  protected shiftMonth(direction: -1 | 1): void {
    const cursor = new Date(`${this.date()}T12:00:00`);
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
    const iso = this.dayIso(next);
    this.onDate(iso < this.minDate ? this.minDate : iso);
    this.loadOpenDays();
  }

  private loadOpenDays(): void {
    const service = this.selectedService();
    const member = this.selectedStaff();
    if (!service || !member) {
      return;
    }
    const days = this.monthDays().filter((day) => this.dayIso(day) >= this.minDate && day.getMonth() === this.dateMonth());
    forkJoin(
      days.map((day) =>
        this.bookingApi.getAvailability(this.slug, service.id, member.id, this.dayIso(day)).pipe(
          map((rows) => (rows.length > 0 ? this.dayIso(day) : '')),
          catchError(() => of('')),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((keys) => this.openDays.set(keys.filter((key) => key.length > 0)));
  }

  protected joinWait(): void {
    const service = this.selectedService();
    const member = this.selectedStaff();
    const name = this.waitName().trim();
    const phone = this.waitPhone().trim();
    if (!service || !member || name.length < 2 || phone.length < 8 || this.waitSent()) {
      return;
    }
    this.bookingApi
      .joinWaitlist(this.slug, {
        service_id: service.id,
        staff_id: member.id,
        day: this.date(),
        client_name: name,
        client_phone: phone,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.waitSent.set(true) });
  }

  protected selectSlot(startsAt: string): void {
    this.selectedSlot.set(startsAt);
  }

  protected goToDetails(): void {
    if (!this.selectedSlot()) {
      return;
    }
    this.step.set(3);
  }

  protected back(): void {
    this.step.update((current) => Math.max(1, current - 1));
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
    const member = this.selectedStaff();
    const startsAt = this.selectedSlot();
    if (!service || !member || !startsAt || this.isSaving()) {
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
    this.isSaving.set(true);
    this.formError.set(null);

    this.bookingApi
      .createAppointment(this.slug, {
        service_id: service.id,
        staff_id: member.id,
        starts_at: startsAt,
        client_name,
        client_phone,
        client_email: client_email.trim() || null,
        notes: notes.trim() || null,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (appointment) => {
          this.isSaving.set(false);
          this.confirmation.set(appointment);
          this.step.set(4);
          this.tellDeposit(appointment, client_phone);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
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
    this.selectedService.set(null);
    this.selectedStaff.set(null);
    this.selectedSlot.set(null);
    this.slots.set([]);
    this.confirmation.set(null);
    this.proofSent.set(false);
    this.reviewRating.set(5);
    this.reviewComment.set('');
    this.reviewPhoto.set(null);
    this.reviewSent.set(false);
    this.reviewError.set(null);
    this.formError.set(null);
    this.clientForm.reset();
    this.date.set(this.minDate);
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
          this.services.set(services);
          this.staff.set(staff);
          this.isLoading.set(false);
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
    const member = this.selectedStaff();
    const date = this.date();
    if (!service || !member || !date) {
      return;
    }

    const requestId = ++this.slotsRequest;
    this.slotsLoading.set(true);
    this.slotsError.set(null);

    this.bookingApi
      .getAvailability(this.slug, service.id, member.id, date)
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

  private tellDeposit(appointment: Appointment, clientPhone: string): void {
    if (appointment.status !== 'awaiting_deposit' || !appointment.deposit_amount || !appointment.cancel_token) {
      return;
    }
    const phone = (this.brand()?.phone ?? '').replace(/\D/g, '');
    if (!phone) {
      return;
    }
    const link = `${location.origin}/${this.slug}/manage/${appointment.cancel_token}`;
    const text = encodeURIComponent(
      `Hola, aparté mi cita. El anticipo es $${appointment.deposit_amount} a la cuenta ${this.brand()?.deposit_account ?? ''}. Subo el comprobante aquí: ${link}`,
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
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

  protected whatsappHref(appointment: Appointment): string | null {
    const phone = (this.brand()?.phone ?? '').replace(/\D/g, '');
    if (!phone) {
      return null;
    }
    const manage =
      appointment.cancel_token && this.slug
        ? ` Puedes verla o cambiarla aquí: ${window.location.origin}/${this.slug}/manage/${appointment.cancel_token}`
        : '';
    const deposit =
      appointment.status === 'awaiting_deposit' && this.brand()?.deposit_account
        ? ` Enviaré el anticipo de ${appointment.deposit_amount} a ${this.brand()?.deposit_account}.`
        : '';
    const message = encodeURIComponent(
      `¡Hola! Acabo de agendar una cita en ${this.brand()?.name ?? 'el negocio'}. Soy ${appointment.client_name}, para ${appointment.service_name || this.selectedService()?.name} el ${this.formatDate(appointment.starts_at)} a las ${this.formatTime(appointment.starts_at)}.${deposit}${manage}`,
    );
    return `https://wa.me/${phone}?text=${message}`;
  }

  protected openWhatsapp(href: string): void {
    window.open(href, '_blank', 'noopener');
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

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
  }
  return fallback;
}
