import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { AvailabilitySlot } from '@core/models/appointment.model';
import { ReviewsService } from '@core/services/reviews.service';
import { BookingService, ManagedAppointment } from '@core/services/booking.service';
// FUTURE_PHASE_SPEI: import { SpeiCheckComponent } from '@shared/components/spei-check/spei-check';
import { DateFieldComponent } from '@shared/components/when-field/when-field';
import { PlaceMap } from '@shared/components/place-map/place-map';
import { Confirm } from '@shared/components/confirm/confirm';
import { depositPolicyText, depositReasonText } from '@core/deposit-policy';
import { CalendarEvent, downloadIcs, googleCalendarUrl } from '@core/calendar';
import { canNavigate, googleMapsUrl } from '@core/maps';
import { balanceDue, formatMinutes, minutesBetween } from '@core/appointment-summary';
import { whatsappLink } from '@core/message-templates';

@Component({
  selector: 'app-manage-appointment',
  imports: [DateFieldComponent, MatIconModule, PlaceMap], // FUTURE_PHASE_SPEI: SpeiCheckComponent
  templateUrl: './manage-appointment.component.html',
  styleUrl: './manage-appointment.component.css',
})
export class ManageAppointmentComponent {
  private readonly bookingApi = inject(BookingService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(Confirm);
  protected readonly canNavigate = canNavigate;
  private readonly when = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly clock = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

  protected readonly tokenValue = this.route.snapshot.paramMap.get('token') ?? '';
  protected readonly slug = this.route.snapshot.paramMap.get('businessSlug') ?? '';

  protected readonly appointment = signal<ManagedAppointment | null>(null);
  private readonly reviewsApi = inject(ReviewsService);
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly rating = signal(5);
  protected readonly opinion = signal('');
  protected readonly reviewState = signal<'idle' | 'sending' | 'sent'>('idle');
  protected readonly reviewError = signal<string | null>(null);

  /** Después de la cita, el cliente deja su opinión desde el mismo enlace que ya tiene. */
  protected sendReview(item: ManagedAppointment): void {
    const comment = this.opinion().trim();
    if (!comment) {
      this.reviewError.set('Cuéntanos en una frase cómo te fue.');
      return;
    }
    this.reviewState.set('sending');
    this.reviewError.set(null);
    this.reviewsApi
      .createPublicReview(item.business_slug, { client_name: item.client_name || 'Cliente', rating: this.rating(), comment, photo_url: null, token: this.tokenValue })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reviewState.set('sent'),
        error: (error: unknown) => {
          this.reviewState.set('idle');
          this.reviewError.set(readError(error, 'No pudimos enviar tu opinión. Intenta de nuevo.'));
        },
      });
  }
  protected readonly isLoading = signal(true);
  /** El enlace no abre: reemplaza la página. */
  protected readonly loadError = signal<string | null>(null);
  /** Una acción falló: se muestra dentro de la cita para que la persona no pierda lo que ve. */
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

  /** La cita como evento de calendario, con la ruta y el enlace de esta página. */
  private calendarEvent(item: ManagedAppointment): CalendarEvent {
    const start = new Date(item.starts_at);
    const end = item.ends_at ? new Date(item.ends_at) : new Date(start.getTime() + 60 * 60_000);
    return {
      start,
      end,
      title: `${item.service_name} · ${item.business_name}`,
      location: item.address ?? '',
      details: [`Con ${item.staff_name}`, canNavigate(item) ? `Cómo llegar: ${googleMapsUrl(item)}` : '', `Ver o cambiar: ${location.href}`].filter(Boolean).join('\n'),
      uid: this.tokenValue,
    };
  }

  protected addToCalendar(item: ManagedAppointment): void {
    downloadIcs(this.calendarEvent(item));
  }

  protected googleCalendarHref(item: ManagedAppointment): string {
    return googleCalendarUrl(this.calendarEvent(item));
  }

  protected directionsHref(item: ManagedAppointment): string | null {
    return canNavigate(item) ? googleMapsUrl(item) : null;
  }

  protected readonly accountCopied = signal(false);

  protected copyAccount(item: ManagedAppointment): void {
    if (item.deposit_account) {
      void navigator.clipboard.writeText(item.deposit_account).then(() => this.accountCopied.set(true));
    }
  }

  /** Qué pasa con el anticipo si cancela (solo cuando la cita lleva anticipo). */
  protected depositPolicy(item: ManagedAppointment): string {
    return item.deposit_amount ? depositPolicyText(item.deposit_cancel_policy, item.cancel_hours) : '';
  }

  protected depositReason(item: ManagedAppointment): string {
    return depositReasonText(item.deposit_reason);
  }

  protected accountLabel(item: ManagedAppointment): string {
    return (item.deposit_account ?? '').replace(/\D/g, '').length === 18 ? 'CLABE' : 'cuenta';
  }

  /** "1 h 55 min" con extras incluidos; null si la API no manda el final. */
  protected duration(item: ManagedAppointment): string | null {
    const minutes = minutesBetween(item.starts_at, item.ends_at);
    return minutes ? formatMinutes(minutes) : null;
  }

  /** Lo que falta pagar en el local cuando el anticipo ya fue aceptado. */
  protected balance(item: ManagedAppointment): number | null {
    return balanceDue(item.quoted_price, item.deposit_amount);
  }

  /** WhatsApp al negocio, con el mensaje listo, para cuando ya no se puede cambiar la cita desde aquí. */
  protected contactHref(item: ManagedAppointment): string | null {
    if ((item.business_phone ?? '').replace(/\D/g, '').length < 10) {
      return null;
    }
    const text = `Hola, soy ${item.client_name || 'cliente'}. Tengo una cita el ${this.label(item.starts_at)} (${item.service_name}) y necesito cambiarla o cancelarla.`;
    return whatsappLink(item.business_phone, text);
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
          .uploadPaymentProof(this.tokenValue, data)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (appointment) => {
              this.appointment.set(appointment);
              document.title = `Tu cita · ${appointment.business_name}`;
              this.saving.set(false);
              this.notice.set('Comprobante enviado');
            },
            error: (error: unknown) => {
              this.saving.set(false);
              this.errorMessage.set(readError(error, 'No pudimos subir el comprobante.'));
            },
          });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  protected acceptPrice(): void {
    this.errorMessage.set(null);
    this.saving.set(true);
    this.bookingApi
      .acceptPrice(this.tokenValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.notice.set('Precio aceptado');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar la aceptación.'));
        },
      });
  }

  protected markPaid(): void {
    this.errorMessage.set(null);
    this.saving.set(true);
    this.bookingApi.markPaid(this.tokenValue).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (appointment) => {
        this.appointment.set(appointment);
        this.saving.set(false);
        this.notice.set('Avisamos al negocio. Tu cita queda confirmada cuando revise el pago.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(readError(error, 'No pudimos registrar el pago.'));
      },
    });
  }

  protected onSpei(appointment: ManagedAppointment): void {
    this.appointment.set(appointment);
    this.notice.set('¡Listo! Banxico confirmó tu transferencia y tu cita quedó pagada.');
  }

  protected confirmVisit(): void {
    this.errorMessage.set(null);
    this.saving.set(true);
    this.bookingApi
      .confirmManagedAppointment(this.tokenValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.notice.set('Listo, te esperamos');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos confirmar la cita.'));
        },
      });
  }

  protected async cancel(): Promise<void> {
    const current = this.appointment();
    if (!current || current.is_cancelled) {
      return;
    }
    const sure = await this.confirmDialog.ask({
      title: '¿Cancelar tu cita?',
      message: [current.cancel_policy ?? 'Se libera tu horario y el negocio recibe el aviso.', this.depositPolicy(current)].filter(Boolean).join(' '),
      confirm: 'Sí, cancelar',
      cancel: 'No, conservarla',
      danger: true,
    });
    if (!sure) {
      return;
    }
    this.errorMessage.set(null);
    this.saving.set(true);
    this.bookingApi
      .cancelManagedAppointment(this.tokenValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          this.saving.set(false);
          this.changing.set(false);
          // El aviso rojo "Cita cancelada" de la tarjeta ya lo dice: no se repite en un segundo aviso.
          this.notice.set(null);
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
    this.errorMessage.set(null);
    this.saving.set(true);
    this.bookingApi
      .rescheduleManagedAppointment(this.tokenValue, {
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
    if (!this.tokenValue) {
      this.isLoading.set(false);
      this.loadError.set('Este enlace no es válido.');
      return;
    }
    this.bookingApi
      .getManagedAppointment(this.tokenValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.appointment.set(appointment);
          document.title = `Tu cita · ${appointment.business_name}`;
          this.date.set(appointment.starts_at.slice(0, 10));
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.loadError.set('Este enlace no es válido o ya expiró.');
        },
      });
  }

  private loadSlots(): void {
    const current = this.appointment();
    if (!current) {
      return;
    }
    this.bookingApi
      .getRescheduleSlots(this.tokenValue, this.date())
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
