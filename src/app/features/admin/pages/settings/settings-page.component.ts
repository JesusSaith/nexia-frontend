import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { BUSINESS_KINDS, kindOf } from '@core/business-kinds';
import { BusinessCopy } from '@core/business-copy';
import { MESSAGE_TEMPLATES, MessageKey, MessageVars, VARIABLE_HELP, defaultText, fillTemplate, longDay } from '@core/message-templates';
import { API_BASE_URL } from '@core/config/api-base-url';
import { BusinessCoupon, Closure } from '@core/models/business.model';
import { Holiday, upcomingHolidays } from '@core/holidays';
import { PAYMENT_METHODS, methodsSentence } from '@core/payment-methods';
import { BusinessSettings, ProfileUpdate, SettingsService } from '@core/services/settings.service';
import { Toasts } from '@core/toasts';
import { Confirm } from '@shared/components/confirm/confirm';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

type SectionId = 'negocio' | 'apariencia' | 'reservas' | 'anticipo' | 'promociones' | 'mensajes' | 'pausa' | 'avisos' | 'privacidad';

const SECTIONS: readonly { id: SectionId; label: string; icon: string; short?: string }[] = [
  { id: 'negocio', label: 'Tu negocio', icon: 'storefront' },
  { id: 'apariencia', label: 'Apariencia', icon: 'palette' },
  { id: 'reservas', label: 'Reglas de reserva', icon: 'event_available' },
  { id: 'anticipo', label: 'Anticipo y pagos', icon: 'payments' },
  { id: 'promociones', label: 'Promociones', icon: 'sell' },
  { id: 'mensajes', label: 'Mensajes de WhatsApp', short: 'Mensajes', icon: 'chat' },
  { id: 'pausa', label: 'Pausa, vacaciones y festivos', short: 'Pausa y cierres', icon: 'beach_access' },
  { id: 'avisos', label: 'Avisos por correo', icon: 'mark_email_unread' },
  { id: 'privacidad', label: 'Privacidad y datos', icon: 'shield' },
];

/** Opciones rápidas: lo más común a un toque; "Otro" sigue disponible con el campo numérico. */
const PRESETS = {
  minNoticeHours: [
    { value: 0, label: 'Sin mínimo' },
    { value: 1, label: '1 h' },
    { value: 2, label: '2 h' },
    { value: 24, label: '1 día' },
  ],
  maxDaysAhead: [
    { value: 30, label: '1 mes' },
    { value: 60, label: '2 meses' },
    { value: 90, label: '3 meses' },
    { value: 180, label: '6 meses' },
  ],
  bufferMinutes: [
    { value: 0, label: 'Seguidas' },
    { value: 5, label: '5 min' },
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
  ],
  cancelHours: [
    { value: null, label: 'Hasta que empiece' },
    { value: 2, label: '2 h antes' },
    { value: 12, label: '12 h antes' },
    { value: 24, label: '1 día antes' },
    { value: 48, label: '2 días antes' },
  ],
  depositHoldHours: [
    { value: 1, label: '1 h' },
    { value: 3, label: '3 h' },
    { value: 6, label: '6 h' },
    { value: 24, label: '1 día' },
  ],
} as const;

type PresetField = keyof typeof PRESETS;

const DEFAULT_COLOR = '#E11D48';

/** Mismos tipos y orden que ALERT_KINDS en el backend (app/core/alerts.py). */
const ALERT_OPTIONS: readonly { value: string; label: string; hint: string }[] = [
  { value: 'new_booking', label: 'Citas nuevas', hint: 'Cada vez que alguien reserva en tu página.' },
  { value: 'cancelled', label: 'Cancelaciones', hint: 'Cuando una clienta cancela desde su enlace.' },
  { value: 'rescheduled', label: 'Cambios de horario', hint: 'Cuando una clienta mueve su cita.' },
  { value: 'payment', label: 'Comprobantes y pagos de anticipo', hint: 'Para revisarlos y confirmar la cita.' },
  { value: 'deposit_expired', label: 'Anticipos vencidos', hint: 'Cuando el horario se libera porque no llegó el pago.' },
  { value: 'waitlist', label: 'Lista de espera', hint: 'Alguien espera lugar o se liberó un horario que buscaban.' },
  { value: 'confirmed', label: 'Confirmaciones de asistencia', hint: 'Cuando la clienta confirma que sí va.' },
  { value: 'daily_summary', label: 'Resumen de mañana', hint: 'A las 8 p. m., las citas del día siguiente.' },
];

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, NgTemplateOutlet, PickFieldComponent, MatIconModule],
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly settingsApi = inject(SettingsService);
  private readonly copy = inject(BusinessCopy);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  protected readonly sections = SECTIONS;
  protected readonly kindPicks = BUSINESS_KINDS.map(({ value, label }) => ({ value, label }));
  protected readonly timezonePicks = signal(timezoneOptions('America/Mexico_City'));

  protected readonly isLoading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly openSections = signal<ReadonlySet<SectionId>>(new Set(['negocio']));
  protected readonly bookingUrl = signal<string | null>(null);
  protected readonly privacyUrl = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    businessKind: new FormControl('otro', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^\d{10}$/)] }),
    address: new FormControl('', { nonNullable: true }),
    instagram: new FormControl('', { nonNullable: true }),
    facebook: new FormControl('', { nonNullable: true }),
    primaryColor: new FormControl(DEFAULT_COLOR, { nonNullable: true, validators: [Validators.pattern(/^#[0-9a-fA-F]{6}$/)] }),
    minNoticeHours: new FormControl<number | null>(0),
    maxDaysAhead: new FormControl<number | null>(90),
    bufferMinutes: new FormControl<number | null>(0),
    cancelHours: new FormControl<number | null>(null),
    timezone: new FormControl('America/Mexico_City', { nonNullable: true }),
    resources: new FormControl('', { nonNullable: true }),
    cancelPolicy: new FormControl('', { nonNullable: true }),
    depositAmount: new FormControl<number | null>(null, [Validators.min(0)]),
    depositPercent: new FormControl<number | null>(null, [Validators.min(1), Validators.max(100)]),
    depositAccount: new FormControl('', { nonNullable: true }),
    depositHoldHours: new FormControl<number | null>(3),
    paymentUrl: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^(https?:\/\/\S+)?$/)] }),
    privacyNotice: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10000)] }),
  });

  // Lo que no es un control del formulario (fotos, cupones, pausa…) vive en signals.
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly suggestedColor = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly photoNotice = signal('');
  protected readonly pausing = signal(false);
  protected readonly photos = signal<string[]>([]);
  protected readonly promo = signal('');
  protected readonly promoUntil = signal('');
  protected readonly pauseBookings = signal(false);
  /** Cierres guardados (vacaciones y festivos), ordenados por fecha. */
  protected readonly closures = signal<Closure[]>([]);
  // Lo que se está escribiendo para agregar un cierre nuevo.
  protected readonly newFrom = signal('');
  protected readonly newTo = signal('');
  protected readonly newLabel = signal('');
  protected readonly paymentMethodOptions = PAYMENT_METHODS;
  protected readonly paymentMethods = signal<ReadonlySet<string>>(new Set(PAYMENT_METHODS.map((item) => item.value)));
  protected readonly approveBookings = signal(false);
  protected readonly autoReminders = signal(false);
  protected readonly reminderHours = signal(24);
  protected readonly autoReturn = signal(false);
  protected readonly whatsappReady = signal(false);
  protected readonly reminderOptions = [
    { value: 24, label: '1 día antes' },
    { value: 12, label: '12 h antes' },
    { value: 3, label: '3 h antes' },
  ];
  /** CLABE de 18 dígitos con dígito verificador correcto (mismo cálculo que app/core/spei.py). */
  protected readonly clabeOk = computed(() => {
    this.values();
    return validClabe(this.form.controls.depositAccount.value);
  });
  protected readonly methodsText = computed(() => methodsSentence([...this.paymentMethods()]));
  protected readonly loyaltyEvery = signal<number | null>(null);
  protected readonly loyaltyPercent = signal<number | null>(null);
  protected readonly coupons = signal<BusinessCoupon[]>([]);
  protected readonly alertOptions = ALERT_OPTIONS;
  protected readonly emailAlerts = signal<ReadonlySet<string>>(new Set());
  protected readonly accountEmail = signal('');
  protected readonly messageTemplates = MESSAGE_TEMPLATES;
  protected readonly variableHelp = VARIABLE_HELP;
  /** Texto de cada mensaje tal como está en el editor (de fábrica si la dueña no lo cambió). */
  protected readonly messages = signal<Record<MessageKey, string>>(defaultMessages());
  protected readonly openMessage = signal<MessageKey | null>(null);

  /** Lo último que vino del servidor: base para "Descartar" y para contar cambios. */
  private readonly savedSettings = signal<BusinessSettings | null>(null);
  private readonly savedPayload = signal<ProfileUpdate | null>(null);

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Exactamente lo que se mandaría al guardar ahora mismo. */
  protected readonly payload = computed<ProfileUpdate>(() => {
    this.values();
    const value = this.form.getRawValue();
    const loyalty = loyaltyValues(this.loyaltyEvery(), this.loyaltyPercent());
    const saved = this.savedSettings();
    const color = value.primaryColor.toLowerCase();
    const colorChanged = color !== (saved?.primary_color ?? DEFAULT_COLOR).toLowerCase();
    return {
      name: value.name.trim(),
      business_kind: value.businessKind,
      description: value.description.trim() || null,
      phone: value.phone.trim(),
      address: value.address.trim() || null,
      instagram: value.instagram.trim().replace(/^@/, '') || null,
      facebook: facebookUrl(value.facebook),
      logo_url: this.logoUrl(),
      primary_color: color,
      canvas_color: colorChanged ? lighten(color, 0.9) : (saved?.canvas_color ?? null),
      min_notice_hours: numberOr(value.minNoticeHours, 0),
      max_days_ahead: numberOr(value.maxDaysAhead, 90),
      buffer_minutes: numberOr(value.bufferMinutes, 0),
      cancel_hours: numberOrNull(value.cancelHours),
      timezone: value.timezone,
      cancel_policy: value.cancelPolicy.trim() || null,
      deposit_amount: numberOrNull(value.depositAmount),
      deposit_percent: numberOrNull(value.depositPercent),
      deposit_account: value.depositAccount.trim() || null,
      deposit_hold_hours: numberOr(value.depositHoldHours, 3),
      payment_url: value.paymentUrl.trim() || null,
      privacy_notice: value.privacyNotice.trim() || null,
      resources: value.resources.trim() || null,
      bookings_paused: this.pauseBookings(),
      closures: this.closures(),
      payment_methods: PAYMENT_METHODS.map((item) => item.value).filter((value) => this.paymentMethods().has(value)),
      approve_bookings: this.approveBookings(),
      auto_reminders: this.autoReminders(),
      reminder_hours: this.reminderHours(),
      auto_return: this.autoReturn(),
      promo_text: this.promo().trim().slice(0, 80) || null,
      promo_until: this.promo().trim() ? this.promoUntil() || null : null,
      gallery: this.photos(),
      loyalty_every: loyalty.every,
      loyalty_percent: loyalty.percent,
      coupons: couponsJson(this.coupons()),
      email_alerts: ALERT_OPTIONS.map((option) => option.value).filter((value) => this.emailAlerts().has(value)),
      // Solo se guardan los que difieren del texto de fábrica.
      message_templates: Object.fromEntries(
        MESSAGE_TEMPLATES.filter((item) => this.messages()[item.key].trim() !== item.text.trim()).map((item) => [item.key, this.messages()[item.key].trim()]),
      ),
    };
  });

  /** Cuántos datos difieren de lo guardado; la barra de guardar solo aparece si hay alguno. */
  protected readonly changeCount = computed(() => {
    const saved = this.savedPayload();
    if (!saved) {
      return 0;
    }
    const current = this.payload();
    return (Object.keys(current) as (keyof ProfileUpdate)[]).filter((key) => key !== 'canvas_color' && JSON.stringify(current[key]) !== JSON.stringify(saved[key])).length;
  });

  /** Error del cierre que se está agregando (no bloquea el guardado: aún no está en la lista). */
  protected readonly closureError = signal('');

  /** Cierres que no han terminado; los pasados se ven aparte y se pueden limpiar. */
  protected readonly upcomingClosures = computed(() => this.closures().filter((row) => row.to >= todayIso()));
  protected readonly pastClosures = computed(() => this.closures().filter((row) => row.to < todayIso()));

  /** Festivos de los próximos 12 meses que aún no están en la lista. */
  protected readonly suggestedHolidays = computed(() => {
    const taken = new Set(this.closures().flatMap((row) => (row.from === row.to ? [row.from] : [])));
    return upcomingHolidays(todayIso()).filter((item) => !taken.has(item.date) && !this.closures().some((row) => item.date >= row.from && item.date <= row.to));
  });

  /** Un mensaje por cupón con problema; vacío si está bien. Antes se descartaban sin avisar. */
  protected readonly couponIssues = computed(() => {
    const codes = this.coupons().map((row) => row.code.trim().toUpperCase().replace(/\s+/g, ''));
    return this.coupons().map((row, index) => {
      if (!codes[index]) {
        return 'Escribe el código.';
      }
      if (codes.indexOf(codes[index]) !== index) {
        return 'Ese código ya está arriba.';
      }
      return row.percent >= 1 && row.percent <= 100 ? '' : 'El descuento va de 1 a 100%.';
    });
  });

  protected readonly loyaltyError = computed(() => {
    const every = this.loyaltyEvery();
    const percent = this.loyaltyPercent();
    if (!every && !percent) {
      return '';
    }
    if (!every || !percent) {
      return 'Pon las dos cosas: cada cuántas visitas y el descuento.';
    }
    if (every < 2 || every > 50) {
      return 'Las visitas van de 2 a 50.';
    }
    return percent < 1 || percent > 100 ? 'El descuento va de 1 a 100%.' : '';
  });

  protected readonly promoError = computed(() =>
    this.promo().trim() && this.promoUntil() && this.promoUntil() < todayIso() ? 'Esa fecha ya pasó: el anuncio no se vería.' : '',
  );

  protected readonly today = todayIso();

  /** El backend solo cobra anticipo si hay a dónde pagarlo. */
  protected readonly depositWarning = computed(() => {
    const payload = this.payload();
    const asksDeposit = Boolean(payload.deposit_amount || payload.deposit_percent);
    return asksDeposit && !payload.deposit_account
      ? 'Falta la cuenta o CLABE. Sin ella el anticipo no se pide y tus clientas reservan sin pagar.'
      : '';
  });

  protected readonly status = computed(() => {
    if (this.pauseBookings()) {
      return { tone: 'warn' as const, icon: 'pause_circle', title: 'Tu página no está tomando citas', detail: 'Tus clientas ven que por ahora no hay reservas en línea.' };
    }
    const today = todayIso();
    const now = this.upcomingClosures().find((row) => row.from <= today);
    if (now) {
      return { tone: 'info' as const, icon: 'event_busy', title: `Hoy tu negocio está cerrado${now.label ? ` (${now.label})` : ''}`, detail: `Tu página no deja reservar ${now.from === now.to ? 'este día' : `hasta el ${shortDate(now.to)}`}. Los demás días todo sigue igual.` };
    }
    const next = this.upcomingClosures()[0];
    if (next && next.from <= addDays(today, 14)) {
      return { tone: 'info' as const, icon: 'event_busy', title: `Cierras ${closureText(next)}${next.label ? ` (${next.label})` : ''}`, detail: 'Esos días no se pueden reservar. Fuera de esas fechas todo sigue igual.' };
    }
    return { tone: 'ok' as const, icon: 'check_circle', title: 'Tu página está recibiendo reservas', detail: 'Tus clientas pueden agendar en línea a cualquier hora.' };
  });

  /** Lo que se ve de cada sección aunque esté cerrada. */
  protected readonly summaries = computed<Record<SectionId, string>>(() => {
    const payload = this.payload();
    const kind = this.kindPicks.find((item) => item.value === payload.business_kind)?.label ?? 'Otro';
    const offers = [
      this.promo().trim() ? 'anuncio' : '',
      payload.loyalty_every ? `cada ${payload.loyalty_every} visitas ${payload.loyalty_percent}%` : '',
      this.coupons().length ? `${this.coupons().length} cupón${this.coupons().length === 1 ? '' : 'es'}` : '',
    ].filter(Boolean);
    const deposit = payload.deposit_amount
      ? `$${payload.deposit_amount}`
      : payload.deposit_percent
        ? `${payload.deposit_percent}% en precio acordado`
        : '';
    return {
      negocio: [payload.name, kind, payload.phone].filter(Boolean).join(' · '),
      apariencia: [this.logoUrl() ? 'Con logo' : 'Sin logo', `${this.photos().length} de 3 fotos`].join(' · '),
      reservas: [
        payload.min_notice_hours ? `${presetLabel('minNoticeHours', payload.min_notice_hours, 'h')} de anticipación` : 'Sin mínimo de anticipación',
        `hasta ${presetLabel('maxDaysAhead', payload.max_days_ahead, 'días')} a futuro`,
        payload.cancel_hours === null ? 'cancelan hasta que empiece' : `cancelan ${presetLabel('cancelHours', payload.cancel_hours, 'h antes')}`,
        ...(payload.approve_bookings ? ['apruebas cada cita'] : []),
      ].join(' · '),
      anticipo: [
        deposit ? `${deposit} · ${payload.deposit_hold_hours} h para pagar${this.depositWarning() ? ' · falta la cuenta' : ''}` : 'Sin anticipo',
        PAYMENT_METHODS.filter((item) => this.paymentMethods().has(item.value)).map((item) => item.label.toLowerCase()).join(', '),
      ].join(' · '),
      promociones: offers.length ? offers.join(' · ') : 'Sin promociones',
      pausa: [this.pauseBookings() ? 'En pausa' : 'Tomando citas', this.upcomingClosures().length ? `${this.upcomingClosures().length} cierre${this.upcomingClosures().length === 1 ? '' : 's'} por venir` : 'sin cierres'].join(' · '),
      mensajes: (this.customizedCount() ? `${this.customizedCount()} personalizado${this.customizedCount() === 1 ? '' : 's'} de ${MESSAGE_TEMPLATES.length}` : 'Todos con el texto de fábrica'),
      avisos: this.emailAlerts().size ? `${this.emailAlerts().size} de ${ALERT_OPTIONS.length} encendidos · a ${this.accountEmail()}` : 'Apagados: solo los ves en Inicio',
      privacidad: payload.privacy_notice ? 'Aviso de privacidad propio' : 'Aviso genérico de Nexia',
    };
  });

  constructor() {
    this.settingsApi
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.apply(settings);
          this.isLoading.set(false);
          // Los avisos de Inicio y Mi negocio llegan con ?sec=… para abrir justo lo que falta.
          const sec = this.route.snapshot.queryParamMap.get('sec');
          if (SECTIONS.some((section) => section.id === sec)) {
            this.openSections.set(new Set([sec as SectionId]));
            this.goTo(sec as SectionId);
          }
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.errorMessage.set(readError(error, 'No pudimos cargar la configuración.'));
        },
      });

    // Vista previa: el panel toma el color elegido al instante; si no se guarda, vuelve al guardado.
    effect(() => {
      this.values();
      const color = this.form.controls.primaryColor.value;
      if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        paintPrimary(color);
      }
    });
    this.destroyRef.onDestroy(() => paintPrimary(this.savedSettings()?.primary_color ?? DEFAULT_COLOR));
  }

  /** Lo usa la ruta (canDeactivate) para no perder cambios al salir. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.changeCount()) {
      return true;
    }
    return this.confirm.ask({
      title: 'Tienes cambios sin guardar',
      message: 'Si sales ahora se pierden.',
      confirm: 'Salir sin guardar',
      cancel: 'Seguir editando',
      danger: true,
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.changeCount()) {
      event.preventDefault();
    }
  }

  protected sectionInfo(id: SectionId): (typeof SECTIONS)[number] {
    return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0];
  }

  protected presetOptions(field: PresetField): readonly { value: number | null; label: string }[] {
    return PRESETS[field];
  }

  protected isOpen(id: SectionId): boolean {
    return this.openSections().has(id);
  }

  protected onToggle(id: SectionId, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    this.openSections.update((current) => {
      const next = new Set(current);
      if (open) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected goTo(id: SectionId): void {
    this.openSections.update((current) => new Set([...current, id]));
    setTimeout(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected setPreset(field: PresetField, value: number | null): void {
    const control = this.form.controls[field];
    control.setValue(value);
    control.markAsDirty();
  }

  protected isPreset(field: PresetField, value: number | null): boolean {
    return this.form.controls[field].value === value;
  }

  /** El campo "Otro" solo muestra un número cuando no coincide con ninguna opción rápida. */
  protected customValue(field: PresetField): string {
    const current = this.form.controls[field].value;
    return this.isCustom(field) && current !== null ? String(current) : '';
  }

  protected setCustom(field: PresetField, raw: string): void {
    // Vacío vuelve al valor por defecto de cada campo (en "cancelar", sin límite).
    this.setPreset(field, this.toNumber(raw) ?? PRESETS[field][0].value);
  }

  protected isCustom(field: PresetField): boolean {
    const current = this.form.controls[field].value;
    return !PRESETS[field].some((item) => item.value === current);
  }

  protected onPhoneInput(): void {
    const control = this.form.controls.phone;
    const digits = control.value.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '').slice(0, 10);
    if (digits !== control.value) {
      control.setValue(digits);
    }
  }

  protected readonly customizedCount = computed(() => Object.keys(this.payload().message_templates ?? {}).length);

  /** Datos de ejemplo para la vista previa de cada mensaje. */
  protected readonly sampleVars = computed<MessageVars>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const later = (weeks: number) => new Date(tomorrow.getTime() + weeks * 7 * 86_400_000);
    return {
      nombre: 'María',
      negocio: this.payload().name || 'Tu negocio',
      servicio: 'Corte de cabello',
      dia: longDay(iso(tomorrow)),
      hora: '11:00 a.m.',
      equipo: 'Ana',
      enlace: `${location.host}/tu-negocio/…`,
      cuando: 'mañana',
      precio: '$450.00',
      anticipo: '$150.00',
      fechas: [3, 6, 9].map((weeks) => `📅 ${longDay(iso(later(weeks)))}`).join('\n'),
      cita: this.copy.text().visit.toLowerCase(),
    };
  });

  protected preview(key: MessageKey): string {
    return fillTemplate(this.messages()[key], this.sampleVars());
  }

  protected isCustomized(key: MessageKey): boolean {
    return this.messages()[key].trim() !== defaultText(key).trim();
  }

  protected toggleMessage(key: MessageKey): void {
    this.openMessage.update((current) => (current === key ? null : key));
  }

  protected editMessage(key: MessageKey, text: string): void {
    this.messages.update((current) => ({ ...current, [key]: text }));
  }

  protected resetMessage(key: MessageKey): void {
    this.editMessage(key, defaultText(key));
  }

  /** Inserta la variable donde está el cursor y lo deja justo después. */
  protected insertVariable(key: MessageKey, area: HTMLTextAreaElement, name: string): void {
    const token = `{${name}}`;
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;
    this.editMessage(key, area.value.slice(0, start) + token + area.value.slice(end));
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(start + token.length, start + token.length);
    });
  }

  protected toggleAlert(kind: string): void {
    this.emailAlerts.update((current) => {
      const next = new Set(current);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  /** La pausa se guarda al momento, sola: es lo que la dueña espera de un interruptor así, y no arrastra otros cambios. */
  /** Siempre queda al menos uno: sin método no hay cómo cobrar. */
  protected toggleMethod(value: string): void {
    const next = new Set(this.paymentMethods());
    if (next.has(value)) {
      if (next.size === 1) {
        this.toasts.show('Deja al menos un método de pago.');
        return;
      }
      next.delete(value);
    } else {
      next.add(value);
    }
    this.paymentMethods.set(next);
  }

  protected addClosure(): void {
    const from = this.newFrom();
    const to = this.newTo() || from;
    if (!from) {
      this.closureError.set('Elige al menos el día en que cierras.');
      return;
    }
    if (to < from) {
      this.closureError.set('La fecha "hasta" no puede ser antes que "desde".');
      return;
    }
    if (this.closures().some((row) => from <= row.to && to >= row.from)) {
      this.closureError.set('Ya tienes un cierre que toca esas fechas.');
      return;
    }
    this.pushClosures([{ from, to, label: this.newLabel().trim().slice(0, 60) || (from === to ? 'Cerrado' : 'Vacaciones') }]);
    this.newFrom.set('');
    this.newTo.set('');
    this.newLabel.set('');
    this.closureError.set('');
  }

  protected addHolidays(items: readonly Holiday[]): void {
    this.pushClosures(items.map((item) => ({ from: item.date, to: item.date, label: item.label })));
  }

  protected removeClosure(row: Closure): void {
    this.closures.update((rows) => rows.filter((item) => item !== row));
  }

  protected clearPastClosures(): void {
    const today = todayIso();
    this.closures.update((rows) => rows.filter((row) => row.to >= today));
  }

  protected closureText(row: Closure): string {
    return closureText(row);
  }

  private pushClosures(rows: Closure[]): void {
    this.closures.update((current) => [...current, ...rows].sort((left, right) => left.from.localeCompare(right.from)).slice(0, 40));
  }

  protected togglePause(): void {
    if (this.pausing()) {
      return;
    }
    const paused = !this.pauseBookings();
    this.pauseBookings.set(paused);
    this.pausing.set(true);
    this.settingsApi
      .updateProfile({ bookings_paused: paused })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.pausing.set(false);
          this.savedSettings.update((saved) => (saved ? { ...saved, bookings_paused: settings.bookings_paused } : saved));
          this.savedPayload.update((saved) => (saved ? { ...saved, bookings_paused: Boolean(settings.bookings_paused) } : saved));
          this.toasts.show(paused ? 'Pausaste tu página: no toma citas.' : 'Tu página vuelve a recibir reservas.');
        },
        error: (error: unknown) => {
          this.pausing.set(false);
          this.pauseBookings.set(!paused);
          this.errorMessage.set(readError(error, 'No pudimos cambiar la pausa. Inténtalo de nuevo.'));
        },
      });
  }

  protected useSuggestedColor(): void {
    const color = this.suggestedColor();
    if (color) {
      this.form.controls.primaryColor.setValue(color);
    }
  }

  protected logoSrc(): string | null {
    const url = this.logoUrl();
    if (!url || url.startsWith('http') || url.startsWith('data:')) {
      return url;
    }
    return `${this.apiBaseUrl.replace(/\/api$/, '')}${url}`;
  }

  /** El logo queda como borrador hasta Guardar; del logo solo se sugiere el color, no se aplica solo. */
  protected onLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file?.type.startsWith('image/')) {
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set(null);
    const preview = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(preview);
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      this.uploading.set(false);
      if (!ctx) {
        return;
      }
      const scale = Math.min(size / img.width, size / img.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      if (data.length > 180000) {
        this.errorMessage.set('La imagen es muy pesada. Prueba otra más simple.');
        return;
      }
      this.logoUrl.set(data);
      const color = colorsFrom(ctx.getImageData(0, 0, size, size))[0] ?? null;
      this.suggestedColor.set(color && color.toLowerCase() !== this.form.controls.primaryColor.value.toLowerCase() ? color : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(preview);
      this.uploading.set(false);
      this.errorMessage.set('No pudimos leer esa imagen.');
    };
    img.src = preview;
  }

  protected removeLogo(): void {
    this.logoUrl.set(null);
    this.suggestedColor.set(null);
  }

  protected addPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = [...(input.files ?? [])];
    const files = picked.slice(0, 3 - this.photos().length);
    this.photoNotice.set(picked.length > files.length ? 'Solo caben 3 fotos; usamos las primeras.' : '');
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(preview);
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 280 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.7);
        if (this.photos().length >= 3 || this.photos().join('').length + data.length > 140000) {
          this.photoNotice.set('Esa foto ya no cabe. Quita una o prueba con otra más simple.');
          return;
        }
        this.photos.update((items) => [...items, data]);
      };
      img.src = preview;
    }
    input.value = '';
  }

  protected removePhoto(index: number): void {
    this.photos.update((items) => items.filter((_, item) => item !== index));
    this.photoNotice.set('');
  }

  /** Mover una foto a la izquierda (la primera es la que más se ve). */
  protected movePhoto(index: number): void {
    if (index > 0) {
      this.photos.update((items) => {
        const next = [...items];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        return next;
      });
    }
  }

  protected addCoupon(): void {
    this.coupons.update((rows) => [...rows, { code: '', percent: 10, first_visit: false }]);
  }

  protected removeCoupon(index: number): void {
    this.coupons.update((rows) => rows.filter((_, position) => position !== index));
  }

  protected editCoupon(index: number, patch: Partial<BusinessCoupon>): void {
    this.coupons.update((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  protected toNumber(value: string): number | null {
    return value.trim() === '' || Number.isNaN(Number(value)) ? null : Math.round(Number(value));
  }

  protected discard(): void {
    const saved = this.savedSettings();
    if (saved) {
      this.apply(saved);
    }
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.saving()) {
      return;
    }
    if (this.form.invalid || this.couponIssues().some(Boolean) || this.loyaltyError() || this.promoError()) {
      this.errorMessage.set('Revisa los campos marcados antes de guardar.');
      const firstBad = this.sections.find((section) => this.sectionHasError(section.id));
      if (firstBad) {
        this.goTo(firstBad.id);
      }
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.settingsApi
      .updateProfile(this.payload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.apply(settings);
          this.copy.setLabel(settings.staff_label);
          this.copy.setLogo(settings.logo_url);
          this.copy.setTemplates(settings.message_templates);
          this.saving.set(false);
          this.toasts.show('Cambios guardados.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.'));
          // Si el servidor dice qué campo falló, abre su sección.
          const section = sectionOfError(error);
          if (section) {
            this.goTo(section);
          }
        },
      });
  }

  protected sectionHasError(id: SectionId): boolean {
    const controls = this.form.controls;
    switch (id) {
      case 'negocio':
        return controls.name.invalid || controls.phone.invalid || controls.description.invalid;
      case 'apariencia':
        return controls.primaryColor.invalid;
      case 'anticipo':
        return controls.paymentUrl.invalid || controls.depositAmount.invalid || controls.depositPercent.invalid;
      case 'promociones':
        return this.couponIssues().some(Boolean) || Boolean(this.loyaltyError() || this.promoError());
      case 'privacidad':
        return controls.privacyNotice.invalid;
      default:
        return false;
    }
  }

  protected downloadBackup(): void {
    this.http
      .get<Record<string, unknown>>(`${this.apiBaseUrl}/settings/backup`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(file);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'nexia-copia.json';
          link.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.errorMessage.set('No pudimos descargar la copia. Inténtalo de nuevo.'),
      });
  }

  private apply(settings: BusinessSettings): void {
    this.savedSettings.set(settings);
    this.logoUrl.set(settings.logo_url);
    this.suggestedColor.set(null);
    this.photoNotice.set('');
    this.photos.set(settings.gallery ?? []);
    this.promo.set(settings.promo_text ?? '');
    this.promoUntil.set(settings.promo_until ?? '');
    this.pauseBookings.set(Boolean(settings.bookings_paused));
    this.closures.set(settings.closures ?? []);
    this.closureError.set('');
    this.paymentMethods.set(new Set(settings.payment_methods?.length ? settings.payment_methods : PAYMENT_METHODS.map((item) => item.value)));
    this.approveBookings.set(Boolean(settings.approve_bookings));
    this.autoReminders.set(Boolean(settings.auto_reminders));
    this.reminderHours.set(settings.reminder_hours || 24);
    this.autoReturn.set(Boolean(settings.auto_return));
    this.whatsappReady.set(Boolean(settings.whatsapp_ready));
    this.loyaltyEvery.set(settings.loyalty_every ?? null);
    this.loyaltyPercent.set(settings.loyalty_percent ?? null);
    this.coupons.set(parseCoupons(settings.coupons));
    this.emailAlerts.set(new Set(settings.email_alerts ?? []));
    this.messages.set({ ...defaultMessages(), ...(settings.message_templates ?? {}) } as Record<MessageKey, string>);
    this.accountEmail.set(settings.email);
    this.timezonePicks.set(timezoneOptions(settings.timezone || 'America/Mexico_City'));
    this.form.setValue({
      name: settings.name ?? '',
      businessKind: kindOf(settings.business_kind, settings.staff_label),
      description: settings.description ?? '',
      phone: (settings.phone ?? '').replace(/\D/g, ''),
      address: settings.address ?? '',
      instagram: settings.instagram ?? '',
      facebook: settings.facebook ?? '',
      primaryColor: (settings.primary_color ?? DEFAULT_COLOR).toLowerCase(),
      minNoticeHours: settings.min_notice_hours ?? 0,
      maxDaysAhead: settings.max_days_ahead ?? 90,
      bufferMinutes: settings.buffer_minutes ?? 0,
      cancelHours: settings.cancel_hours,
      timezone: settings.timezone || 'America/Mexico_City',
      resources: settings.resources ?? '',
      cancelPolicy: settings.cancel_policy ?? '',
      depositAmount: settings.deposit_amount,
      depositPercent: settings.deposit_percent,
      depositAccount: settings.deposit_account ?? '',
      depositHoldHours: settings.deposit_hold_hours ?? 3,
      paymentUrl: settings.payment_url ?? '',
      privacyNotice: settings.privacy_notice ?? '',
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.savedPayload.set(this.payload());
    this.bookingUrl.set(settings.slug ? `${location.origin}/${settings.slug}/book` : null);
    this.privacyUrl.set(settings.slug ? `${location.origin}/${settings.slug}/privacidad` : null);
  }
}

/** Campo del backend → sección donde se corrige. */
const FIELD_SECTION: Record<string, SectionId> = {
  name: 'negocio', phone: 'negocio', description: 'negocio', address: 'negocio', instagram: 'negocio', facebook: 'negocio', business_kind: 'negocio',
  logo_url: 'apariencia', primary_color: 'apariencia', gallery: 'apariencia',
  min_notice_hours: 'reservas', max_days_ahead: 'reservas', buffer_minutes: 'reservas', cancel_hours: 'reservas', timezone: 'reservas', resources: 'reservas', cancel_policy: 'reservas',
  deposit_amount: 'anticipo', deposit_percent: 'anticipo', deposit_account: 'anticipo', deposit_hold_hours: 'anticipo', payment_url: 'anticipo',
  promo_text: 'promociones', promo_until: 'promociones', loyalty_every: 'promociones', loyalty_percent: 'promociones', coupons: 'promociones',
  message_templates: 'mensajes', auto_reminders: 'mensajes', reminder_hours: 'mensajes', auto_return: 'mensajes', bookings_paused: 'pausa', closures: 'pausa', payment_methods: 'anticipo', approve_bookings: 'reservas', email_alerts: 'avisos', privacy_notice: 'privacidad',
};

function sectionOfError(error: unknown): SectionId | null {
  const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
  const loc: unknown[] = Array.isArray(detail) && Array.isArray(detail[0]?.loc) ? detail[0].loc : [];
  const field = loc.find((part): part is string => typeof part === 'string' && part in FIELD_SECTION);
  return field ? FIELD_SECTION[field] : null;
}

/** "tunegocio", "@tunegocio" o la URL completa quedan como facebook.com/tunegocio. */
function facebookUrl(raw: string): string | null {
  const value = raw.trim().replace(/^https?:\/\//i, '').replace(/^(www\.|m\.)/i, '').replace(/\/+$/, '');
  if (!value) {
    return null;
  }
  return /^(facebook|fb)\.com\//i.test(value) ? value.replace(/^fb\.com/i, 'facebook.com') : `facebook.com/${value.replace(/^@/, '')}`;
}

function defaultMessages(): Record<MessageKey, string> {
  return Object.fromEntries(MESSAGE_TEMPLATES.map((item) => [item.key, item.text])) as Record<MessageKey, string>;
}

function presetLabel(field: PresetField, value: number | null | undefined, unit: string): string {
  return PRESETS[field].find((item) => item.value === (value ?? null))?.label ?? `${value} ${unit}`;
}

function numberOr(value: number | null | undefined, fallback: number): number {
  return value === null || value === undefined || String(value) === '' ? fallback : Number(value);
}

function numberOrNull(value: number | null | undefined): number | null {
  return value === null || value === undefined || String(value) === '' ? null : Number(value);
}

/** Lealtad solo cuenta con los dos datos; el backend pide al menos 2 visitas. */
function loyaltyValues(every: number | null, percent: number | null): { every: number | null; percent: number | null } {
  if (!every || !percent || every < 2) {
    return { every: null, percent: null };
  }
  return { every: Math.min(every, 50), percent: Math.min(Math.max(percent, 1), 100) };
}

function couponsJson(coupons: BusinessCoupon[]): string | null {
  const seen = new Set<string>();
  const rows: BusinessCoupon[] = [];
  for (const row of coupons) {
    const code = row.code.trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
    const percent = Math.min(Math.max(Math.round(Number(row.percent) || 0), 1), 100);
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    rows.push({ code, percent, first_visit: Boolean(row.first_visit) });
  }
  return rows.length ? JSON.stringify(rows) : null;
}

function parseCoupons(raw: string | null | undefined): BusinessCoupon[] {
  try {
    const rows = JSON.parse(raw || '[]') as unknown;
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows
      .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
      .map((row) => ({
        code: String(row['code'] ?? ''),
        percent: Number(row['percent']) || 0,
        first_visit: Boolean(row['first_visit']),
      }));
  } catch {
    return [];
  }
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validClabe(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 18) {
    return false;
  }
  const weights = [3, 7, 1];
  const sum = [...digits.slice(0, 17)].reduce((total, digit, index) => total + ((Number(digit) * weights[index % 3]) % 10), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[17]);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const moved = new Date(year, month - 1, day + days);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
}

/** "el 24 dic" o "del 20 oct al 27 oct". */
function closureText(row: Closure): string {
  return row.from === row.to ? `el ${shortDate(row.from)}` : `del ${shortDate(row.from)} al ${shortDate(row.to)}`;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function paintPrimary(color: string): void {
  const root = document.documentElement;
  root.style.setProperty('--primary', color);
  root.style.setProperty('--business-primary', color);
  root.style.setProperty('--mat-sys-primary', color);
}

function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const red = mix((value >> 16) & 255);
  const green = mix((value >> 8) & 255);
  const blue = mix(value & 255);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function colorsFrom(data: ImageData): string[] {
  const buckets = new Map<string, number>();
  for (let index = 0; index < data.data.length; index += 16) {
    const red = data.data[index];
    const green = data.data[index + 1];
    const blue = data.data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 245 || max < 28 || max - min < 18) {
      continue;
    }
    const key = [red, green, blue].map((channel) => channel & 0xf0).join(',');
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([key]) => `#${key.split(',').map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`);
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') {
      return String(detail[0].msg).replace(/^Value error, /, '');
    }
  }
  return fallback;
}

/** Las zonas de México; si el negocio guardó otra (registro desde fuera), también aparece. */
const MEXICO_TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Centro (CDMX, Guadalajara, Monterrey)' },
  { value: 'America/Cancun', label: 'Sureste (Quintana Roo)' },
  { value: 'America/Chihuahua', label: 'Chihuahua' },
  { value: 'America/Mazatlan', label: 'Pacífico (Sinaloa, Nayarit, BCS)' },
  { value: 'America/Hermosillo', label: 'Sonora' },
  { value: 'America/Tijuana', label: 'Noroeste (Baja California)' },
];

function timezoneOptions(current: string): { value: string; label: string }[] {
  return MEXICO_TIMEZONES.some((zone) => zone.value === current)
    ? MEXICO_TIMEZONES
    : [...MEXICO_TIMEZONES, { value: current, label: current }];
}
