import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { AvailabilitySlot } from '@core/models/appointment.model';
import { BookingService, ManagedAppointment } from '@core/services/booking.service';
import { DateFieldComponent } from '@shared/components/when-field/when-field';

@Component({
  selector: 'app-manage-appointment',
  imports: [DateFieldComponent],
  templateUrl: './manage-appointment.component.html',
  styleUrl: './manage-appointment.component.css',
})
export class ManageAppointmentComponent {
  private readonly bookingApi = inject(BookingService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly when = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly clock = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly slug = this.route.snapshot.paramMap.get('businessSlug') ?? '';

  protected readonly appointment = signal<ManagedAppointment | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly changing = signal(false);
  protected readonly saving = signal(false);
  protected readonly minDate = todayInput();
  protected readonly date = signal(this.minDate);
  protected readonly slots = signal<AvailabilitySlot[]>([]);
  protected readonly selectedSlot = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected label(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : this.when.format(date);
  }

  protected slotLabel(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(11, 16) : this.clock.format(date);
  }

  protected onDate(value: string): void {
    this.date.set(value);
    this.selectedSlot.set(null);
    this.loadSlots();
  }

  protected startChange(): void {
    this.changing.set(true);
    this.notice.set(null);
    this.loadSlots();
  }

  protected onProof(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
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
          this.errorMessage.set('Esa foto es demasiado pesada.');
          return;
        }
        this.saving.set(true);
        this.bookingApi
          .uploadPaymentProof(this.token, data)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (appointment) => {
              this.appointment.set(appointment);
              document.title = appointment.business_name;
              this.saving.set(false);
              this.notice.set('Comprobante enviado');
            },
            error: () => {
              this.saving.set(false);
              this.errorMessage.set('No pudimos subir el comprobante.');
            },
          });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  protected acceptPrice(): void {
    this.saving.set(true);
    this.bookingApi
      .acceptPrice(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.notice.set('Precio aceptado');
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('No pudimos guardar la aceptación.');
        },
      });
  }

  protected markPaid(): void {
    this.saving.set(true);
    this.bookingApi.markPaid(this.token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (appointment) => {
        this.appointment.set(appointment);
        this.saving.set(false);
        this.notice.set('Anticipo registrado. Tu cita quedó confirmada.');
      },
      error: () => {
        this.saving.set(false);
        this.errorMessage.set('No pudimos registrar el pago.');
      },
    });
  }

  protected confirmVisit(): void {
    this.saving.set(true);
    this.bookingApi
      .confirmManagedAppointment(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.notice.set('Listo, te esperamos');
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('No pudimos confirmar la cita.');
        },
      });
  }

  protected cancel(): void {
    const current = this.appointment();
    if (!current || current.is_cancelled || !confirm('¿Estás seguro de cancelar tu cita?')) {
      return;
    }
    this.saving.set(true);
    this.bookingApi
      .cancelManagedAppointment(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.changing.set(false);
          this.notice.set('Cita cancelada');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos cancelar la cita.'));
        },
      });
  }

  protected confirmChange(): void {
    const slot = this.selectedSlot();
    const current = this.appointment();
    if (!slot || !current) {
      return;
    }
    const [newDate, clock] = slot.split('T');
    this.saving.set(true);
    this.bookingApi
      .rescheduleManagedAppointment(this.token, {
        new_date: newDate,
        new_time: clock.slice(0, 5),
        staff_id: current.staff_id,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.changing.set(false);
          this.notice.set('Cita actualizada');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'Ese horario ya no está disponible.'));
        },
      });
  }

  private load(): void {
    if (!this.token) {
      this.isLoading.set(false);
      this.errorMessage.set('Este enlace no es válido.');
      return;
    }
    this.bookingApi
      .getManagedAppointment(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.date.set(appointment.starts_at.slice(0, 10));
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Este enlace no es válido o ya expiró.');
        },
      });
  }

  private loadSlots(): void {
    const current = this.appointment();
    if (!current) {
      return;
    }
    this.bookingApi
      .getAvailability(this.slug || current.business_slug, current.service_id, current.staff_id, this.date())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (slots) => this.slots.set(slots),
        error: () => this.slots.set([]),
      });
  }
}

function todayInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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
