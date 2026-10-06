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
import { forkJoin } from 'rxjs';

import { Appointment } from '@core/models/appointment.model';
import { BusinessBrand, PublicService, PublicStaff } from '@core/models/business.model';
import { BookingService } from '@core/services/booking.service';

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
  protected readonly services = signal<PublicService[]>([]);
  protected readonly staff = signal<PublicStaff[]>([]);
  protected readonly selectedService = signal<PublicService | null>(null);
  protected readonly selectedStaff = signal<PublicStaff | null>(null);
  protected readonly date = signal(this.minDate);
  protected readonly slots = signal<{ starts_at: string }[]>([]);
  protected readonly selectedSlot = signal<string | null>(null);
  protected readonly confirmation = signal<Appointment | null>(null);

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
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
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
      required: 'Ingresa tu correo.',
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
  }

  protected onDate(value: string): void {
    this.date.set(value);
    this.selectedSlot.set(null);
    this.loadSlots();
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

    const { client_name, client_phone, client_email } = this.clientForm.getRawValue();
    this.isSaving.set(true);
    this.formError.set(null);

    this.bookingApi
      .createAppointment(this.slug, {
        service_id: service.id,
        staff_id: member.id,
        starts_at: startsAt,
        client_name,
        client_phone,
        client_email,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (appointment) => {
          this.isSaving.set(false);
          this.confirmation.set(appointment);
          this.step.set(4);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos registrar la cita.'));
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
