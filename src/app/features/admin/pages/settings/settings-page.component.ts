import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { BUSINESS_KINDS, kindOf } from '@core/business-kinds';
import { BusinessCopy } from '@core/business-copy';
import { API_BASE_URL } from '@core/config/api-base-url';
import { BusinessCoupon } from '@core/models/business.model';
import { BusinessSettings, ProfileUpdate, SettingsService } from '@core/services/settings.service';
import { Toasts } from '@core/toasts';
import { Confirm } from '@shared/components/confirm/confirm';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

type SectionId = 'negocio' | 'apariencia' | 'reservas' | 'anticipo' | 'promociones' | 'pausa' | 'avisos' | 'privacidad';

const SECTIONS: readonly { id: SectionId; label: string; icon: string }[] = [
  { id: 'negocio', label: 'Tu negocio', icon: 'storefront' },
  { id: 'apariencia', label: 'Apariencia', icon: 'palette' },
  { id: 'reservas', label: 'Reglas de reserva', icon: 'event_available' },
  { id: 'anticipo', label: 'Anticipo y pagos', icon: 'payments' },
  { id: 'promociones', label: 'Promociones', icon: 'sell' },
  { id: 'pausa', label: 'Pausa y vacaciones', icon: 'beach_access' },
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
    depositAmount: new FormControl<number | null>(null),
    depositPercent: new FormControl<number | null>(null),
    depositAccount: new FormControl('', { nonNullable: true }),
    depositHoldHours: new FormControl<number | null>(3),
    paymentUrl: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^(https?:\/\/\S+)?$/)] }),
    privacyNotice: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10000)] }),
  });

  // Lo que no es un control del formulario (fotos, cupones, pausa…) vive en signals.
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly suggestedColor = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly photos = signal<string[]>([]);
  protected readonly promo = signal('');
  protected readonly promoUntil = signal('');
  protected readonly pauseBookings = signal(false);
  protected readonly closedFrom = signal('');
  protected readonly closedTo = signal('');
  protected readonly loyaltyEvery = signal<number | null>(null);
  protected readonly loyaltyPercent = signal<number | null>(null);
  protected readonly coupons = signal<BusinessCoupon[]>([]);
  protected readonly alertOptions = ALERT_OPTIONS;
  protected readonly emailAlerts = signal<ReadonlySet<string>>(new Set());
  protected readonly accountEmail = signal('');

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
      facebook: value.facebook.trim() || null,
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
      closed_from: this.closedFrom() || null,
      closed_to: this.closedTo() || null,
      promo_text: this.promo().trim().slice(0, 80) || null,
      promo_until: this.promo().trim() ? this.promoUntil() || null : null,
      gallery: this.photos(),
      loyalty_every: loyalty.every,
      loyalty_percent: loyalty.percent,
      coupons: couponsJson(this.coupons()),
      email_alerts: ALERT_OPTIONS.map((option) => option.value).filter((value) => this.emailAlerts().has(value)),
    };
  });

  /** Cuántos datos difieren de lo guardado; la barra de guardar solo aparece si hay alguno. */
  protected readonly changeCount = computed(() => {
    const saved = this.savedPayload();
    if (!saved) {
      return 0;
    }
    const current = this.payload();
    return (Object.keys(current) as (keyof ProfileUpdate)[]).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key])).length;
  });

  protected readonly closureError = computed(() => {
    const from = this.closedFrom();
    const to = this.closedTo();
    if (Boolean(from) !== Boolean(to)) {
      return 'Pon las dos fechas: desde cuándo y hasta cuándo cierras.';
    }
    return from && to && to < from ? 'La fecha "hasta" no puede ser antes que "desde".' : '';
  });

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
    const from = this.closedFrom();
    const to = this.closedTo();
    if (from && to && to >= todayIso()) {
      return { tone: 'info' as const, icon: 'event_busy', title: `Cierras del ${shortDate(from)} al ${shortDate(to)}`, detail: 'Esos días no se pueden reservar. Fuera de esas fechas todo sigue igual.' };
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
      ].join(' · '),
      anticipo: deposit ? `${deposit} · ${payload.deposit_hold_hours} h para pagar${this.depositWarning() ? ' · falta la cuenta' : ''}` : 'Sin anticipo',
      promociones: offers.length ? offers.join(' · ') : 'Sin promociones',
      pausa: this.status().title,
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

  protected togglePause(): void {
    this.pauseBookings.update((paused) => !paused);
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
    const files = [...(input.files ?? [])].slice(0, 3 - this.photos().length);
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
        this.photos.update((items) => (items.length >= 3 || items.join('').length + data.length > 140000 ? items : [...items, data]));
      };
      img.src = preview;
    }
    input.value = '';
  }

  protected removePhoto(index: number): void {
    this.photos.update((items) => items.filter((_, item) => item !== index));
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
    if (this.form.invalid || this.closureError()) {
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
          this.saving.set(false);
          this.toasts.show('Cambios guardados.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.'));
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
        return controls.paymentUrl.invalid;
      case 'pausa':
        return Boolean(this.closureError());
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
    this.photos.set(settings.gallery ?? []);
    this.promo.set(settings.promo_text ?? '');
    this.promoUntil.set(settings.promo_until ?? '');
    this.pauseBookings.set(Boolean(settings.bookings_paused));
    this.closedFrom.set(settings.closed_from ?? '');
    this.closedTo.set(settings.closed_to ?? '');
    this.loyaltyEvery.set(settings.loyalty_every ?? null);
    this.loyaltyPercent.set(settings.loyalty_percent ?? null);
    this.coupons.set(parseCoupons(settings.coupons));
    this.emailAlerts.set(new Set(settings.email_alerts ?? []));
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
