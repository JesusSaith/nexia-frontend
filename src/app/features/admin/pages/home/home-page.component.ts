import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Appointment, AvailabilitySlot } from '@core/models/appointment.model';
import { DashboardStats } from '@core/models/dashboard.model';
import { Review } from '@core/models/review.model';
import { AppointmentsService } from '@core/services/appointments.service';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { DashboardService } from '@core/services/dashboard.service';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';
import { ReviewsService } from '@core/services/reviews.service';

@Component({
  selector: 'app-home-page',
  imports: [MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './home-page.component.html',
})
export class HomePageComponent {
  private readonly reviewsApi = inject(ReviewsService);
  private readonly dashboardApi = inject(DashboardService);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly auth = inject(AuthService);
  private readonly bookingApi = inject(BookingService);
  private readonly staffApi = inject(StaffService);
  private readonly servicesApi = inject(ServicesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  protected readonly reviews = signal<Review[]>([]);
  protected readonly upcoming = signal<Appointment[]>([]);
  protected readonly booked = signal<Appointment[]>([]);
  protected readonly notices = signal<{ id: number; message: string }[]>([]);
  protected readonly openings = signal<{ staff: string; slots: AvailabilitySlot[] }[]>([]);
  protected readonly clients = signal<{ id: number; full_name: string; phone: string }[]>([]);
  protected readonly offerId = signal<number | null>(null);
  protected readonly tomorrow = computed(() => {
    const day = inputDate(addDays(new Date(), 1));
    return this.booked().filter((item) => item.status === 'scheduled' && item.starts_at.slice(0, 10) === day);
  });
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stars = [1, 2, 3, 4, 5];

  constructor() {
    const start = inputDate(new Date());
    const end = inputDate(addDays(new Date(), 21));
    forkJoin({
      reviews: this.reviewsApi.getReviews(),
      stats: this.dashboardApi.getStats(),
      appointments: this.appointmentsApi.getAppointments({ start_date: start, end_date: end }),
      notices: this.dashboardApi.getNotices(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reviews, stats, appointments, notices }) => {
          const now = Date.now() - 30 * 60 * 1000;
          this.reviews.set(reviews);
          this.notices.set(notices);
          this.booked.set(appointments);
          this.stats.set(stats);
          this.upcoming.set(
            appointments
              .filter((item) => item.status === 'scheduled' && parseLocal(item.starts_at).getTime() >= now)
              .slice(0, 6),
          );
          this.isLoading.set(false);
          this.loadOpenings();
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el inicio.'));
        },
      });
  }

  protected initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '·';
  }

  protected when(value: string): string {
    const date = parseLocal(value);
    const days = Math.floor((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
    if (days <= 0) {
      return 'Hoy';
    }
    if (days === 1) {
      return 'Ayer';
    }
    if (days < 7) {
      return `Hace ${days} d`;
    }
    return this.dayFormat.format(date);
  }

  private loadOpenings(): void {
    const slug = this.auth.currentUser()?.slug;
    if (!slug) {
      return;
    }
    const day = inputDate(addDays(new Date(), 1));
    forkJoin({
      staff: this.staffApi.getStaff(),
      services: this.servicesApi.getServices(),
      clients: this.bookingApi.getClients(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ staff, services, clients }) => {
        this.clients.set(clients);
        this.offerId.set(clients[0]?.id ?? null);
        const service = services.find((item) => item.is_active);
        const people = staff.filter((item) => item.is_active).slice(0, 3);
        if (!service || people.length === 0) {
          return;
        }
        forkJoin(
          people.map((member) =>
            this.bookingApi.getAvailability(slug, service.id, member.id, day).pipe(
              map((slots) => ({ staff: member.full_name, slots: slots.slice(0, 3) })),
              catchError(() => of({ staff: member.full_name, slots: [] as AvailabilitySlot[] })),
            ),
          ),
        )
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((rows) => this.openings.set(rows.filter((row) => row.slots.length > 0)));
      });
  }

  protected offer(slot: string, staff: string): void {
    const client = this.clients().find((item) => item.id === this.offerId()) ?? this.clients()[0];
    if (!client) {
      return;
    }
    const phone = client.phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hola ${client.full_name}, mañana tenemos lugar a las ${this.timeFormat.format(parseLocal(slot))} con ${staff}. ¿Lo apartamos?`,
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
  }

  protected remind(item: Appointment): string {
    const phone = (item.client_phone ?? '').replace(/\D/g, '');
    const slug = this.auth.currentUser()?.slug ?? '';
    const link = item.cancel_token && slug ? ` ${location.origin}/${slug}/manage/${item.cancel_token}` : '';
    const text = encodeURIComponent(
      `Hola ${item.client_name}, te recordamos tu cita de ${item.service_name} mañana a las ${this.timeFormat.format(parseLocal(item.starts_at))}.${link}`,
    );
    return `https://wa.me/${phone}?text=${text}`;
  }

  protected slotLabel(value: string): string {
    const date = parseLocal(value);
    const sameDay = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
    const time = this.timeFormat.format(date);
    return sameDay ? `Hoy · ${time}` : `${this.dayFormat.format(date)} · ${time}`;
  }
}

function inputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseLocal(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(normalized);
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
