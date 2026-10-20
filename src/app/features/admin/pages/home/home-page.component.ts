import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Appointment } from '@core/models/appointment.model';
import { Service } from '@core/models/service.model';
import { BusinessCopy } from '@core/business-copy';
import { firstName, longDay, whatsappLink } from '@core/message-templates';
import { ReadinessStep, SettingsService } from '@core/services/settings.service';
import { Confirm } from '@shared/components/confirm/confirm';
import { AppointmentsService } from '@core/services/appointments.service';
import { AuthService } from '@core/services/auth.service';
import { BookingService, DueClient } from '@core/services/booking.service';
import { DashboardService } from '@core/services/dashboard.service';
import { ServicesService } from '@core/services/services.service';
import { ShopService } from '@core/services/shop.service';

type Notice = { id: number; message: string; created_at: string };

@Component({
  selector: 'app-home-page',
  imports: [MatIconModule, RouterLink],
  templateUrl: './home-page.component.html',
})
export class HomePageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly auth = inject(AuthService);
  private readonly copy = inject(BusinessCopy);
  private readonly bookingApi = inject(BookingService);
  private readonly servicesApi = inject(ServicesService);
  private readonly settingsApi = inject(SettingsService);
  private readonly shopApi = inject(ShopService);
  private readonly confirm = inject(Confirm);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly demoLoaded = signal(false);
  protected readonly demoBusy = signal(false);

  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  private readonly pesosFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  protected readonly todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly booked = signal<Appointment[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly notices = signal<Notice[]>([]);
  /** Hora actual, al minuto: mueve "Ahora" y "Siguiente" en la lista de hoy. */
  protected readonly now = signal(Date.now());

  /** Lo que hay que resolver, cada cosa con su acción. */
  protected readonly todos = computed(() => {
    const today = inputDate(new Date());
    const rows: { id: number; day: string; title: string; detail: string; action: string; tone: string }[] = [];
    for (const item of this.booked()) {
      const day = item.starts_at.slice(0, 10);
      if (day < today) {
        continue;
      }
      const when = `${item.client_name} · ${item.service_name} · ${this.slotLabel(item.starts_at)}`;
      if (item.needs_approval && (item.status === 'scheduled' || item.status === 'awaiting_deposit')) {
        rows.push({ id: item.id, day, title: 'Aprobar solicitud', detail: when, action: 'Responder', tone: 'badge-warn' });
      } else if (item.status === 'awaiting_deposit' && (item.payment_proof || item.paid_claim)) {
        rows.push({ id: item.id, day, title: 'Revisar comprobante', detail: when, action: 'Revisar', tone: 'badge-info' });
      } else if (item.status === 'awaiting_deposit') {
        rows.push({ id: item.id, day, title: 'Falta el anticipo', detail: when, action: 'Ver', tone: 'badge-warn' });
      }
    }
    return rows;
  });
  protected readonly todosShown = signal(5);

  // Citas de hoy: las cobradas se quedan (atenuadas) para que se vea el avance del día.
  protected readonly today = computed(() => {
    const day = inputDate(new Date());
    return this.booked().filter((item) => (item.status === 'scheduled' || item.status === 'completed') && item.starts_at.slice(0, 10) === day);
  });
  protected readonly todayDone = computed(() => this.today().filter((item) => item.status === 'completed').length);
  /** La que se está atendiendo (empezó y no ha terminado) y la que sigue. */
  protected readonly current = computed(() => {
    const now = this.now();
    return this.today().find((item) => {
      if (item.status !== 'scheduled') {
        return false;
      }
      const start = parseLocal(item.starts_at).getTime();
      return start <= now && now < start + this.minutes(item) * 60_000;
    })?.id ?? null;
  });
  protected readonly next = computed(() => {
    const now = this.now();
    return this.today().find((item) => item.status === 'scheduled' && parseLocal(item.starts_at).getTime() > now)?.id ?? null;
  });

  /** Los números de arriba. */
  protected readonly dayBrief = computed(() => {
    const open = this.today().filter((item) => item.status === 'scheduled');
    return {
      visits: this.today().length,
      due: open.reduce((sum, item) => sum + this.rest(item), 0),
      unconfirmed: open.filter((item) => !item.client_confirmed).length,
      todos: this.todos().length,
    };
  });

  protected readonly tomorrow = computed(() => {
    const day = inputDate(addDays(new Date(), 1));
    return this.booked().filter((item) => item.status === 'scheduled' && item.starts_at.slice(0, 10) === day);
  });
  /** Citas ya recordadas hoy (por id), para ir una por una sin repetir. */
  protected readonly reminded = signal<number[]>(readReminded());
  protected readonly pendingReminders = computed(() =>
    this.tomorrow().filter(
      (item) => (item.client_phone ?? '').replace(/\D/g, '').length >= 8 && !item.client_confirmed && !this.reminded().includes(item.id),
    ),
  );

  // birthday lo agrega el backend en GET /api/clients; se tipa opcional aquí sin tocar booking.service.ts.
  protected readonly clients = signal<{ id: number; full_name: string; phone: string; birthday?: string | null }[]>([]);
  protected readonly birthdays = computed(() => {
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.clients().filter((client) => client.birthday?.slice(5, 10) === today);
  });

  /** "Te toca": a quién le toca volver; las ya invitadas van al final. */
  protected readonly dueClients = signal<DueClient[]>([]);
  protected readonly dueShown = computed(() => [...this.dueClients()].sort((left, right) => Number(left.invited) - Number(right.invited)).slice(0, 6));

  /** Avisos que salen de los números: semana arriba o abajo, huecos, faltas, productos por acabarse. */
  protected readonly alerts = signal<{ tone: string; text: string; link: string }[]>([]);

  /** Lo cobrado esta semana (lunes a hoy) contra los mismos días de la semana pasada. */
  protected readonly week = signal<{ total: number; count: number; change: number | null } | null>(null);

  protected readonly noticePage = signal(0);
  protected readonly pagedNotices = computed(() => {
    const start = this.noticePage() * NOTICES_PER_PAGE;
    return this.notices().slice(start, start + NOTICES_PER_PAGE);
  });
  protected readonly noticePages = computed(() => Math.max(1, Math.ceil(this.notices().length / NOTICES_PER_PAGE)));

  /** Pasos para dejar el negocio listo. Oculta la lista, los avisos (p. ej. falta la CLABE) se siguen viendo. */
  protected readonly setup = signal<ReadinessStep[]>([]);
  protected readonly setupHidden = signal(readFlag('nexia-setup-hidden'));
  protected readonly setupShown = computed(() =>
    this.setupHidden() ? this.setup().filter((step) => step.group === 'aviso' && !step.done) : this.setup(),
  );
  protected readonly setupLeft = computed(() => this.setup().filter((step) => !step.done).length);
  /** Falta algo para poder reservar (servicios, equipo u horario): se ofrece el asistente. */
  protected readonly needsWizard = computed(() => this.setup().some((step) => step.group === 'arranque' && step.key !== 'share' && !step.done));

  constructor() {
    this.settingsApi.demoStatus().pipe(catchError(() => of({ loaded: false }))).subscribe((row) => this.demoLoaded.set(row.loaded));
    this.settingsApi
      .getReadiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ready) => this.setup.set(ready.steps.filter((step) => step.group !== 'perfil')),
        error: () => this.setup.set([]),
      });
    this.load();
    this.loadExtras();
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Solo las citas son indispensables; lo demás, si falla, se queda vacío sin tumbar la página. */
  protected load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    forkJoin({
      appointments: this.appointmentsApi.getAppointments({ start_date: inputDate(new Date()), end_date: inputDate(addDays(new Date(), 21)) }),
      services: this.servicesApi.getServices().pipe(catchError(() => of([] as Service[]))),
      notices: this.dashboardApi.getNotices().pipe(catchError(() => of([] as Notice[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ appointments, services, notices }) => {
          this.booked.set(appointments);
          this.services.set(services);
          this.notices.set(notices);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el inicio.'));
        },
      });
  }

  private loadExtras(): void {
    this.bookingApi
      .getDueClients()
      .pipe(catchError(() => of([] as DueClient[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.dueClients.set(rows));
    this.bookingApi
      .getClients()
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.clients.set(rows));
    this.shopApi
      .alerts()
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.alerts.set(rows));
    const today = new Date();
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const total = (start: Date, end: Date): Observable<{ total: number; count: number } | null> =>
      this.shopApi.report(inputDate(start), inputDate(end)).pipe(
        map((report) => ({ total: report.total, count: report.completed_count })),
        catchError(() => of(null)),
      );
    forkJoin({ now: total(monday, today), before: total(addDays(monday, -7), addDays(today, -7)) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ now, before }) => {
        if (now) {
          const change = before && before.total > 0 ? Math.round(((now.total - before.total) / before.total) * 100) : null;
          this.week.set({ ...now, change });
        }
      });
  }

  protected async toggleDemo(): Promise<void> {
    const loaded = this.demoLoaded();
    const ok = await this.confirm.ask(
      loaded
        ? { title: '¿Quitar los datos de ejemplo?', message: 'Se borran los servicios, el equipo, las clientas y las citas de ejemplo. Lo que tú creaste se queda.', confirm: 'Quitar', danger: true }
        : { title: '¿Llenar con datos de ejemplo?', message: 'Agrega servicios de tu giro, dos colaboradoras con horario, clientas y citas para que veas todo funcionando. Los quitas con un botón.', confirm: 'Llenar' },
    );
    if (!ok) {
      return;
    }
    this.demoBusy.set(true);
    const request = loaded ? this.settingsApi.clearDemo().pipe(map(() => null)) : this.settingsApi.loadDemo().pipe(map(() => null));
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => location.reload(),
      error: () => this.demoBusy.set(false),
    });
  }

  protected hideSetup(): void {
    this.setupHidden.set(true);
    try {
      localStorage.setItem('nexia-setup-hidden', '1');
    } catch {
      // Se vuelve a mostrar en la próxima visita.
    }
  }

  /** "/admin/settings?sec=promos" → ruta y parámetros para routerLink. */
  protected linkOf(link: string): { path: string; query: Record<string, string> } {
    const [path, query] = link.split('?');
    return { path, query: Object.fromEntries(new URLSearchParams(query ?? '')) };
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected pesos(amount: number): string {
    return this.pesosFormat.format(amount);
  }

  /** Lo que falta cobrar en la cita: precio (o cotización) menos el anticipo. */
  private rest(item: Appointment): number {
    const total = item.quoted_price ?? this.services().find((row) => row.id === item.service_id)?.price ?? 0;
    return Math.max(0, total - (item.deposit_amount ?? 0));
  }

  private minutes(item: Appointment): number {
    return this.services().find((row) => row.id === item.service_id)?.duration_minutes || 60;
  }

  /** Ya terminó y no se ha cobrado: el botón Cobrar se vuelve el principal. */
  protected overdue(item: Appointment): boolean {
    return item.status === 'scheduled' && parseLocal(item.starts_at).getTime() + this.minutes(item) * 60_000 <= this.now();
  }

  protected confirmWhatsapp(item: Appointment): string {
    return this.remind(item, 'hoy');
  }

  protected dueWhatsapp(row: DueClient): string {
    const slug = this.auth.currentUser()?.slug ?? '';
    const when = row.suggested ? new Date(row.suggested) : null;
    return whatsappLink(row.client_phone, this.copy.message('due', {
      nombre: firstName(row.client_name),
      servicio: row.service_name,
      negocio: this.shopName(),
      dia: row.suggested ? longDay(row.suggested.slice(0, 10)) : '',
      hora: when ? when.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : '',
      enlace: slug ? `${location.origin}/${slug}/book` : '',
    }));
  }

  protected dueLabel(row: DueClient): string {
    if (row.days_late > 0) {
      return `Le tocaba hace ${row.days_late} d · viene cada ${row.every_days} d`;
    }
    return row.due_on === inputDate(new Date()) ? `Le toca hoy · viene cada ${row.every_days} d` : `Le toca pronto · viene cada ${row.every_days} d`;
  }

  /** Al abrir el WhatsApp queda marcada como invitada (deja de estar arriba de la lista). */
  protected markInvited(row: DueClient): void {
    this.dueClients.update((rows) => rows.map((item) => (item.appointment_id === row.appointment_id ? { ...item, invited: true } : item)));
    this.bookingApi.markInvited(row.appointment_id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  protected birthdayWhatsapp(client: { full_name: string; phone: string }): string {
    return whatsappLink(client.phone, this.copy.message('birthday', { nombre: firstName(client.full_name), negocio: this.shopName() }));
  }

  private shopName(): string {
    return this.auth.currentUser()?.businessName ?? '';
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
    const slug = this.auth.currentUser()?.slug ?? '';
    const start = parseLocal(item.starts_at);
    const text = this.copy.message('reminder', {
      nombre: firstName(item.client_name),
      cuando: when,
      negocio: this.shopName(),
      servicio: item.service_name,
      dia: longDay(item.starts_at),
      hora: this.timeFormat.format(start),
      equipo: item.staff_name,
      enlace: item.cancel_token && slug ? `${location.origin}/${slug}/manage/${item.cancel_token}` : '',
    });
    return whatsappLink(item.client_phone, text);
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

  /** El aviso dice "Horario libre 10:00. Avisar a Ana López 5511…, … Quedó libre el 16 oct a las 10:00". */
  protected waitWhatsapp(message: string, phone: string): string {
    const slug = this.auth.currentUser()?.slug ?? '';
    const name = message.match(new RegExp(`(?:Avisar a |, )([^,]+?) ${phone}`))?.[1] ?? '';
    const text = this.copy.message('waitlist', {
      nombre: firstName(name),
      negocio: this.shopName(),
      dia: message.match(/Quedó libre el (\d+ \w+)/)?.[1] ?? '',
      hora: message.match(/\d{2}:\d{2}/)?.[0] ?? '',
      enlace: slug ? this.bookingApi.shareUrl(slug) : '',
    });
    return whatsappLink(phone, text);
  }

  /** Solo la hora ("11:00 a.m."), para listas que ya dicen de qué día son. */
  protected timeLabel(value: string): string {
    return this.timeFormat.format(parseLocal(value));
  }

  protected slotLabel(value: string): string {
    const date = parseLocal(value);
    const sameDay = startOfDay(date).getTime() === startOfDay(new Date()).getTime();
    const time = this.timeFormat.format(date);
    return sameDay ? `Hoy · ${time}` : `${this.dayFormat.format(date)} · ${time}`;
  }
}

const NOTICES_PER_PAGE = 8;

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
