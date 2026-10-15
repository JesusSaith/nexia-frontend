import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Appointment, AvailabilitySlot } from '@core/models/appointment.model';
import { SchedulesService } from '@core/services/schedules.service';
import { DashboardStats } from '@core/models/dashboard.model';
import { Review } from '@core/models/review.model';
import { AppointmentsService } from '@core/services/appointments.service';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { DashboardService } from '@core/services/dashboard.service';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';
import { PackagesService, VisitPackage } from '@core/services/packages.service';
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
  private readonly schedulesApi = inject(SchedulesService);
  /** Pasos para dejar el negocio listo; desaparece al completarlos o al ocultarla. */
  protected readonly setup = signal<{ label: string; done: boolean; path: string }[]>([]);
  protected readonly setupHidden = signal(readFlag('nexia-setup-hidden'));
  protected readonly setupLeft = computed(() => this.setup().filter((step) => !step.done).length);

  protected hideSetup(): void {
    this.setupHidden.set(true);
    try {
      localStorage.setItem('nexia-setup-hidden', '1');
    } catch {
      // Se vuelve a mostrar en la próxima visita.
    }
  }

  private loadSetup(): void {
    forkJoin({
      brand: this.bookingApi.getMyBrand().pipe(catchError(() => of(null))),
      services: this.servicesApi.getServices().pipe(catchError(() => of([]))),
      staff: this.staffApi.getStaff().pipe(catchError(() => of([]))),
    })
      .pipe(
        switchMap(({ brand, services, staff }) => {
          const active = staff.filter((member) => member.is_active);
          const hours = active.length
            ? forkJoin(active.map((member) => this.schedulesApi.getStaffSchedule(member.id).pipe(catchError(() => of([])))))
            : of([]);
          return hours.pipe(map((rows) => ({ brand, services, active, hours: rows })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ brand, services, active, hours }) =>
        this.setup.set([
          { label: 'Sube tu logo', done: Boolean(brand?.logo_url), path: '/admin/settings' },
          { label: 'Agrega tus servicios', done: services.some((row) => row.is_active), path: '/admin/services' },
          { label: 'Agrega a tu equipo', done: active.length > 0, path: '/admin/staff' },
          { label: 'Pon los horarios de trabajo', done: hours.some((days) => days.some((day) => day.is_active)), path: '/admin/schedules' },
          { label: 'Comparte tu enlace de reservas', done: readFlag('nexia-shared'), path: '/admin/negocio' },
        ]),
      );
  }
  private readonly packagesApi = inject(PackagesService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly packages = signal<VisitPackage[]>([]);
  protected readonly packageName = signal('');
  protected readonly packagePhone = signal('');
  protected readonly packageVisits = signal(5);
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
  protected readonly notices = signal<{ id: number; message: string; created_at: string }[]>([]);
  protected readonly noticePage = signal(0);
  protected readonly pagedNotices = computed(() => {
    const start = this.noticePage() * 10;
    return this.notices().slice(start, start + 10);
  });
  protected readonly noticePages = computed(() => Math.max(1, Math.ceil(this.notices().length / 10)));
  protected readonly openings = signal<{ staff: string; slots: AvailabilitySlot[] }[]>([]);
  protected readonly clients = signal<{ id: number; full_name: string; phone: string }[]>([]);
  protected readonly offerId = signal<number | null>(null);
  protected readonly clientPicks = computed(() => this.clients().map((client) => ({ value: client.id, label: client.full_name })));
  protected readonly tomorrow = computed(() => {
    const day = inputDate(addDays(new Date(), 1));
    return this.booked().filter((item) => item.status === 'scheduled' && item.starts_at.slice(0, 10) === day);
  });
  protected readonly readyReminders = computed(() =>
    this.tomorrow().filter((item) => (item.client_phone ?? '').replace(/\D/g, '').length >= 8),
  );
  /** Citas ya recordadas hoy (por id), para ir una por una sin repetir. */
  protected readonly reminded = signal<number[]>(readReminded());
  protected readonly pendingReminders = computed(() =>
    this.readyReminders().filter((item) => !item.client_confirmed && !this.reminded().includes(item.id)),
  );
  protected readonly todayVisits = computed(() => {
    const day = inputDate(new Date());
    return this.booked().filter((item) => item.status === 'scheduled' && item.starts_at.slice(0, 10) === day);
  });
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  /** Lo que la dueña tiene que atender hoy, en una línea. */
  protected readonly dayBrief = computed(() => {
    const today = inputDate(new Date());
    const visits = this.todayVisits();
    return {
      visits: visits.length,
      unconfirmed: visits.filter((item) => !item.client_confirmed).length,
      deposits: this.booked().filter((item) => item.status === 'awaiting_deposit' && item.starts_at.slice(0, 10) >= today).length,
    };
  });
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly stars = [1, 2, 3, 4, 5];

  constructor() {
    if (!this.setupHidden()) {
      this.loadSetup();
    }
    const start = inputDate(new Date());
    const end = inputDate(addDays(new Date(), 21));
    forkJoin({
      reviews: this.reviewsApi.getReviews(),
      stats: this.dashboardApi.getStats(),
      appointments: this.appointmentsApi.getAppointments({ start_date: start, end_date: end }),
      notices: this.dashboardApi.getNotices(),
      packages: this.packagesApi.list().pipe(catchError(() => of([] as VisitPackage[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ reviews, stats, appointments, notices, packages }) => {
          const now = Date.now() - 30 * 60 * 1000;
          this.reviews.set(reviews);
          this.notices.set(notices);
          this.packages.set(packages);
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

  protected savePackage(): void {
    const name = this.packageName().trim();
    const phone = this.packagePhone().trim();
    const visits = Number(this.packageVisits());
    if (!name || !phone || !visits) {
      return;
    }
    this.packagesApi.create(name, phone, visits).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((row) => {
      this.packages.update((items) => [row, ...items]);
      this.packageName.set('');
      this.packagePhone.set('');
    });
  }

  protected replyReview(review: Review, event: Event): void {
    event.preventDefault();
    const reply = String(new FormData(event.target as HTMLFormElement).get('reply') ?? '').trim();
    if (!reply) {
      return;
    }
    this.reviewsApi.reply(review.id, reply).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((updated) => {
      this.reviews.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
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

  /**
   * Abre el recordatorio de la siguiente clienta. Va de una en una porque el navegador bloquea
   * abrir varias pestañas con un solo clic.
   */
  protected sendNextReminder(): void {
    const next = this.pendingReminders()[0];
    if (next) {
      this.markReminded(next);
      window.open(this.remind(next), '_blank', 'noopener');
    }
  }

  protected markReminded(item: Appointment): void {
    this.reminded.update((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));
    try {
      localStorage.setItem(REMINDED_KEY, JSON.stringify({ day: inputDate(new Date()), ids: this.reminded() }));
    } catch {
      // Sin almacenamiento solo se pierde la marca de "recordado".
    }
  }

  protected remind(item: Appointment, when: 'hoy' | 'mañana' = 'mañana'): string {
    const phone = (item.client_phone ?? '').replace(/\D/g, '');
    const slug = this.auth.currentUser()?.slug ?? '';
    const shop = this.auth.currentUser()?.businessName ?? '';
    const start = parseLocal(item.starts_at);
    const lines = [
      `Hola ${item.client_name.split(' ')[0]} 👋 Te recordamos tu cita de ${when}${shop ? ` en ${shop}` : ''}:`,
      '',
      `📋 ${item.service_name}`,
      `📅 ${new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(start)}`,
      `🕐 ${this.timeFormat.format(start)}`,
      `💁 Con ${item.staff_name}`,
    ];
    if (item.cancel_token && slug) {
      lines.push(
        '',
        `Por favor confírmanos tu asistencia aquí. Si ya no puedes, ahí mismo la cambias o la cancelas para darle el lugar a alguien más:`,
        `${location.origin}/${slug}/manage/${item.cancel_token}`,
      );
    }
    lines.push('', '¡Te esperamos!');
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  protected noticeText(message: string): string {
    return message.replace(/\s*#\d+\s*$/, '');
  }

  protected noticeWhen(value: string): string {
    const date = parseLocal(value);
    return `${this.dayFormat.format(date)} · ${this.timeFormat.format(date)}`;
  }

  protected noticeCita(message: string): number | null {
    const match = message.match(/#(\d+)\s*$/);
    return match ? Number(match[1]) : null;
  }

  protected noticePhones(message: string): string[] {
    return message.startsWith('Horario libre') ? [...message.matchAll(/\d{8,}/g)].map((match) => match[0]) : [];
  }

  protected waitWhatsapp(message: string, phone: string): string {
    const time = message.match(/\d{2}:\d{2}/)?.[0] ?? '';
    const slug = this.auth.currentUser()?.slug ?? '';
    const link = slug ? `\n\n${this.bookingApi.shareUrl(slug)}` : '';
    const text = encodeURIComponent(
      `¡Hola! 👋 Te escribimos porque estabas en lista de espera: se liberó un horario${time ? ` a las ${time}` : ''}. Si lo quieres, apártalo aquí antes de que alguien más lo tome:${link}`,
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

const REMINDED_KEY = 'nexia-reminded';

function readReminded(): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? 'null') as { day?: string; ids?: number[] } | null;
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return saved?.day === key && Array.isArray(saved.ids) ? saved.ids : [];
  } catch {
    return [];
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
