import { scrollBehavior } from '@core/motion';
import { attendanceState } from '@core/appointment-progress';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
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
import { Toasts } from '@core/toasts';
import { BusinessClock } from '@core/business-clock';
import { BirthdayRow, BookingService, ClientRow, DueClient } from '@core/services/booking.service';
import { NoticeDetailComponent } from '@shared/components/notice-detail/notice-detail';
import { NOTICE_GROUPS, NoticeGroup, noticeAction, noticeGroup } from '@core/notice-groups';
import { DashboardService, HomeNotice } from '@core/services/dashboard.service';
import { ServicesService } from '@core/services/services.service';
import { ShopService } from '@core/services/shop.service';

type Notice = HomeNotice;

@Component({
  selector: 'app-home-page',
  imports: [MatIconModule, RouterLink],
  templateUrl: './home-page.component.html',
})
export class HomePageComponent {
  private readonly dashboardApi = inject(DashboardService);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly auth = inject(AuthService);
  protected readonly copy = inject(BusinessCopy);
  private readonly bookingApi = inject(BookingService);
  private readonly servicesApi = inject(ServicesService);
  private readonly settingsApi = inject(SettingsService);
  private readonly shopApi = inject(ShopService);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);
  /** "Hoy" y "ahora" son los del negocio, no los del navegador. */
  private readonly clock = inject(BusinessClock);
  protected readonly demoLoaded = signal(false);
  protected readonly demoBusy = signal(false);

  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
  private readonly dayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  private readonly pesosFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  protected readonly todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(this.clock.now());

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly booked = signal<Appointment[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly notices = signal<Notice[]>([]);
  /** Hora actual, al minuto: mueve "Ahora" y "Siguiente" en la lista de hoy. */
  protected readonly now = signal(this.clock.nowMs());

  /** Lo que hay que resolver, cada cosa con su acción. */
  protected readonly todos = computed(() => {
    const today = inputDate(this.clock.now());
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
    const day = inputDate(this.clock.now());
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
    const collected = this.today()
      .filter((item) => item.status === 'completed')
      .reduce((sum, item) => sum + (item.quoted_price ?? this.services().find((row) => row.id === item.service_id)?.price ?? 0), 0);
    return {
      visits: this.today().length,
      collected,
      due: open.reduce((sum, item) => sum + this.rest(item), 0),
      unconfirmed: open.filter((item) => attendanceState(item) === 'pending').length,
      todos: this.todos().length,
    };
  });

  protected readonly tomorrow = computed(() => {
    const day = inputDate(addDays(this.clock.now(), 1));
    return this.booked().filter((item) => item.status === 'scheduled' && item.starts_at.slice(0, 10) === day);
  });
  /** Citas ya recordadas hoy (por id), para ir una por una sin repetir. */
  protected readonly reminded = signal<number[]>(readReminded(this.clock.now()));
  protected readonly pendingReminders = computed(() =>
    this.tomorrow().filter(
      (item) => (item.client_phone ?? '').replace(/\D/g, '').length >= 8 && attendanceState(item) === 'pending' && !this.reminded().includes(item.id),
    ),
  );

  protected readonly clients = signal<ClientRow[]>([]);
  /** Cumpleaños de hoy y de los próximos 7 días, filtrados por el servidor. */
  protected readonly birthdays = signal<BirthdayRow[]>([]);
  protected readonly birthdaysTitle = computed(() => (this.birthdays().every((row) => row.days_until === 0) ? 'Cumpleaños de hoy' : 'Cumpleaños de esta semana'));

  protected birthdayWhen(row: BirthdayRow): string {
    if (row.days_until === 0) {
      return 'Hoy';
    }
    return row.days_until === 1 ? 'Mañana' : `En ${row.days_until} días`;
  }

  /** "Te toca": a quién le toca volver; las ya invitadas van al final. */
  protected readonly dueClients = signal<DueClient[]>([]);
  protected readonly dueShown = computed(() => [...this.dueClients()].sort((left, right) => Number(left.invited) - Number(right.invited)).slice(0, 6));

  /**
   * "A quién escribirle hoy": clientes que dejaron de venir (más de 45 días, sin cita próxima), sin repetir a los de
   * "Les toca volver" ni a quien ya se invitó en las últimas dos semanas. Primero quienes más han gastado.
   */
  protected readonly awayAll = computed(() => {
    const cut = inputDate(addDays(this.clock.now(), -AWAY_DAYS));
    const recent = inputDate(addDays(this.clock.now(), -CONTACT_COOLDOWN_DAYS));
    const due = new Set(this.dueClients().map((row) => row.client_phone.replace(/\D/g, '').slice(-10)));
    return this.clients()
      .filter(
        (row) =>
          !!row.last_visit &&
          row.last_visit < cut &&
          !row.next_visit &&
          row.phone.replace(/\D/g, '').length >= 8 &&
          !due.has(row.phone.replace(/\D/g, '').slice(-10)) &&
          !(row.last_contact_at && row.last_contact_at.slice(0, 10) >= recent),
      )
      .sort((left, right) => right.total_spent - left.total_spent);
  });
  protected readonly awayShown = computed(() => this.awayAll().slice(0, 5));

  protected awayLabel(row: ClientRow): string {
    const days = Math.round((startOfDay(this.clock.now()).getTime() - parseLocal(row.last_visit ?? '').getTime()) / 86_400_000);
    return days >= 60 ? `Vino por última vez hace ${Math.round(days / 30)} meses` : `Vino por última vez hace ${days} días`;
  }

  protected awayWhatsapp(row: ClientRow): string {
    return whatsappLink(row.phone, this.copy.message('miss_you', { nombre: firstName(row.full_name), negocio: this.shopName() }));
  }

  /** Al abrir el WhatsApp queda anotado y sale de la lista. */
  protected markAwayInvited(row: ClientRow): void {
    const now = this.clock.now();
    const stamp = `${inputDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.clients.update((rows) => rows.map((item) => (item.id === row.id ? { ...item, last_contact_at: stamp, last_contact_kind: 'invitar' } : item)));
    this.bookingApi.logContact(row.id, 'invitar').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  /** Avisos que salen de los números: semana arriba o abajo, huecos, faltas, productos por acabarse. */
  protected readonly alerts = signal<{ tone: string; text: string; link: string }[]>([]);

  /** Lo cobrado esta semana (lunes a hoy) contra los mismos días de la semana pasada. */
  protected readonly week = signal<{ total: number; count: number; change: number | null } | null>(null);

  /** "Ya los vi" lo guarda el servidor: los avisos sin ver aparecen con punto; los demás, atenuados. */
  protected readonly allNotices = signal(false);
  protected readonly NOTICES_SHORT = NOTICES_SHORT;
  /** Avisos con el mismo texto (p. ej. un anticipo vencido de la misma persona) se juntan en uno con su conteo. */
  protected readonly groupedNotices = computed(() => {
    const groups = new Map<string, Notice & { count: number; unseen: boolean }>();
    for (const notice of this.notices()) {
      const key = notice.message;
      const unseen = !notice.seen;
      const found = groups.get(key);
      if (found) {
        found.count += 1;
        found.unseen = found.unseen || unseen;
      } else {
        groups.set(key, { ...notice, count: 1, unseen });
      }
    }
    return [...groups.values()];
  });
  protected readonly unseenCount = computed(() => this.groupedNotices().filter((notice) => notice.unseen).length);

  /** Filtro por tipo: solo salen los tipos que sí hay, y solo si hay más de uno. */
  protected readonly noticeFilter = signal<NoticeGroup | null>(null);
  protected readonly noticeChips = computed(() => {
    const rows = this.groupedNotices();
    const chips = NOTICE_GROUPS.map((group) => ({ ...group, count: rows.filter((row) => noticeGroup(row.kind) === group.key).length })).filter((chip) => chip.count > 0);
    return chips.length > 1 ? chips : [];
  });
  protected readonly filteredNotices = computed(() => {
    const only = this.noticeFilter();
    const rows = this.groupedNotices();
    return only && this.noticeChips().some((chip) => chip.key === only) ? rows.filter((row) => noticeGroup(row.kind) === only) : rows;
  });
  protected readonly shownNotices = computed(() => (this.allNotices() ? this.filteredNotices() : this.filteredNotices().slice(0, NOTICES_SHORT)));
  protected readonly noticeAction = noticeAction;

  protected markNoticesSeen(): void {
    // Cambio al instante; si el servidor no responde, el siguiente refresco los vuelve a mostrar como nuevos.
    this.notices.update((rows) => rows.map((row) => ({ ...row, seen: true })));
    this.dashboardApi.markNoticesSeen().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  /** La dirección para mostrar (sin https://), tal como la verán tus clientes. */
  protected readonly bookingLink = computed(() => {
    const slug = this.auth.currentUser()?.slug ?? '';
    return slug ? this.bookingApi.shareUrl(slug).replace(/^https?:\/\//, '') : '';
  });
  protected readonly linkCopied = signal(false);
  protected copyLink(): void {
    const slug = this.auth.currentUser()?.slug ?? '';
    if (!slug) {
      return;
    }
    void navigator.clipboard.writeText(this.bookingApi.shareUrl(slug)).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2500);
    });
  }

  /** Pasos para dejar el negocio listo. Oculta la lista, los avisos (p. ej. falta la CLABE) se siguen viendo. */
  protected readonly setup = signal<ReadinessStep[]>([]);
  protected readonly setupHidden = signal(false);

  /** Tarjetas de Inicio que se pueden apagar (Hoy, Por resolver y Para tu negocio siempre se ven). */
  protected readonly homeCards: { key: string; label: string }[] = [
    { key: 'avisos', label: 'Avisos' },
    { key: 'manana', label: 'Mañana' },
    { key: 'cumpleanos', label: 'Cumpleaños' },
    { key: 'volver', label: 'Les toca volver' },
    { key: 'escribir', label: 'A quién escribirle hoy' },
    { key: 'semana', label: 'Esta semana' },
  ];
  protected readonly hiddenCards = signal<string[]>([]);
  protected readonly customizing = signal(false);
  /** "Hola, Nombre": más cálido que solo el título de la pantalla. */
  protected readonly greeting = computed(() => {
    const name = firstName(this.auth.currentUser()?.fullName);
    return name ? `Hola, ${name}` : 'Inicio';
  });
  protected readonly canCustomize = computed(() => this.auth.userRole() !== 'staff');

  protected shows(key: string): boolean {
    return !this.hiddenCards().includes(key);
  }

  protected toggleCard(key: string): void {
    const before = this.hiddenCards();
    const next = before.includes(key) ? before.filter((item) => item !== key) : [...before, key];
    this.hiddenCards.set(next);
    this.settingsApi
      .setHomeCards(next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.hiddenCards.set(before);
          this.toasts.show('No pudimos guardar el cambio. Intenta de nuevo.');
        },
      });
  }
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
        next: (ready) => {
          this.setup.set(ready.steps.filter((step) => step.group !== 'perfil'));
          this.setupHidden.set(ready.setup_hidden === true);
          this.hiddenCards.set(ready.home_hidden ?? []);
          // Quien la ocultó antes de que se guardara en el negocio (en este navegador): se pasa al negocio una sola vez.
          if (ready.setup_hidden !== true && readFlag('nexia-setup-hidden')) {
            this.hideSetup();
          }
        },
        error: () => this.setup.set([]),
      });
    this.load();
    this.loadExtras();
    const timer = setInterval(() => this.now.set(this.clock.nowMs()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Solo las citas son indispensables; lo demás, si falla, se queda vacío sin tumbar la página. */
  protected load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    forkJoin({
      appointments: this.appointmentsApi.getAppointments({ start_date: inputDate(this.clock.now()), end_date: inputDate(addDays(this.clock.now(), 21)) }),
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
    this.bookingApi
      .getBirthdays(7)
      .pipe(catchError(() => of([] as BirthdayRow[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.birthdays.set(rows.filter((row) => !row.congratulated || row.days_until > 0)));
    this.shopApi
      .alerts()
      .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.alerts.set(rows));
    const today = this.clock.now();
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
        ? { title: '¿Quitar los datos de ejemplo?', message: 'Se borran los servicios, el equipo, los clientes y las citas de ejemplo. Lo que tú creaste se queda.', confirm: 'Quitar', danger: true }
        : { title: '¿Llenar con datos de ejemplo?', message: 'Agrega servicios de tu giro, dos personas en tu equipo con horario, clientes y citas para que veas todo funcionando. Los quitas con un botón.', confirm: 'Llenar' },
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
    this.settingsApi.hideSetup().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  /** "/admin/settings?sec=promos" → ruta y parámetros para routerLink. */
  protected linkOf(link: string): { path: string; query: Record<string, string> } {
    const [path, query] = link.split('?');
    return { path, query: Object.fromEntries(new URLSearchParams(query ?? '')) };
  }

  protected scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
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
    if (item.ends_at) {
      const length = (parseLocal(item.ends_at).getTime() - parseLocal(item.starts_at).getTime()) / 60_000;
      if (length > 0) {
        return length;
      }
    }
    return this.services().find((row) => row.id === item.service_id)?.duration_minutes || 60;
  }

  /** Ya terminó y no se ha cobrado: el botón Cobrar se vuelve el principal. */
  /** Confirmó, anticipo pagado o sin confirmar. */
  protected attendance(item: Appointment): 'confirmed' | 'deposit' | 'pending' {
    return attendanceState(item);
  }

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
    return row.due_on === inputDate(this.clock.now()) ? `Le toca hoy · viene cada ${row.every_days} d` : `Le toca pronto · viene cada ${row.every_days} d`;
  }

  /** Al abrir el WhatsApp queda marcada como invitada (deja de estar arriba de la lista). */
  protected markInvited(row: DueClient): void {
    this.dueClients.update((rows) => rows.map((item) => (item.appointment_id === row.appointment_id ? { ...item, invited: true } : item)));
    this.bookingApi.markInvited(row.appointment_id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  /** Al abrir el WhatsApp de felicitación queda anotado en la ficha. */
  protected markCongratulated(client: { id: number }): void {
    this.bookingApi.logContact(client.id, 'felicitar').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
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
      localStorage.setItem(REMINDED_KEY, JSON.stringify({ day: inputDate(this.clock.now()), ids: this.reminded() }));
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

  private readonly dialog = inject(MatDialog);

  /** Abre el detalle del aviso: para quien no lo vio cuando llegó (la notificación, el correo). */
  protected openNotice(notice: Notice & { count: number }): void {
    this.dialog.open(NoticeDetailComponent, {
      width: '520px',
      maxWidth: 'calc(100vw - 24px)',
      panelClass: 'service-sheet',
      ariaLabelledBy: 'notice-title',
      data: {
        message: notice.message,
        when: this.noticeWhen(notice.created_at),
        kind: notice.kind,
        appointmentId: notice.appointment_id,
        count: notice.count,
        people: (notice.data?.people ?? []).map((person) => ({ name: person.name, href: this.waitWhatsapp(notice, person) })),
      },
    });
  }

  protected noticeWhen(value: string): string {
    const date = parseLocal(value);
    return `${this.dayFormat.format(date)} · ${this.timeFormat.format(date)}`;
  }

  /** Lista de espera: el aviso trae a quién avisar y de qué horario se trata. */
  protected waitWhatsapp(notice: Notice, person: { name: string; phone: string }): string {
    const slug = this.auth.currentUser()?.slug ?? '';
    const text = this.copy.message('waitlist', {
      nombre: firstName(person.name),
      negocio: this.shopName(),
      dia: notice.data?.day ?? '',
      hora: notice.data?.hour ?? '',
      enlace: slug ? this.bookingApi.shareUrl(slug) : '',
    });
    return whatsappLink(person.phone, text);
  }

  /** Solo la hora ("11:00 a.m."), para listas que ya dicen de qué día son. */
  protected timeLabel(value: string): string {
    return this.timeFormat.format(parseLocal(value));
  }

  protected slotLabel(value: string): string {
    const date = parseLocal(value);
    const sameDay = startOfDay(date).getTime() === startOfDay(this.clock.now()).getTime();
    const time = this.timeFormat.format(date);
    return sameDay ? `Hoy · ${time}` : `${this.dayFormat.format(date)} · ${time}`;
  }
}

const NOTICES_SHORT = 3;
const AWAY_DAYS = 45;
const CONTACT_COOLDOWN_DAYS = 14;

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

function readReminded(today: Date): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? 'null') as { day?: string; ids?: number[] } | null;
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
