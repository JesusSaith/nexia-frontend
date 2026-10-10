import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { PickFieldComponent, TimeFieldComponent } from '@shared/components/when-field/when-field';

import { BusinessCopy } from '@core/business-copy';
import { Toasts } from '@core/toasts';
import { API_BASE_URL } from '@core/config/api-base-url';
import { BookingService } from '@core/services/booking.service';
import { BusinessHour, BusinessSettings, SettingsService } from '@core/services/settings.service';
import { joinNote, splitNote } from '@core/shop-note';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

const ROLE_PICKS = [
  { value: 'Estilista', label: 'Salón de belleza' },
  { value: 'Barbero', label: 'Barbería' },
  { value: 'Terapeuta', label: 'Spa' },
  { value: 'Veterinario', label: 'Veterinaria' },
  { value: 'Especialista', label: 'Consultorio' },
  { value: 'Dentista', label: 'Clínica dental' },
  { value: 'Profesional', label: 'Estudio' },
  { value: 'Instructor', label: 'Clases o entrenamiento' },
  { value: 'Colaborador', label: 'Otro' },
];

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, PickFieldComponent, TimeFieldComponent],
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly settingsApi = inject(SettingsService);
  private readonly bookingApi = inject(BookingService);
  private readonly copy = inject(BusinessCopy);
  private readonly toasts = inject(Toasts);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);

  protected downloadBackup(): void {
    this.http
      .get<Record<string, unknown>>(`${this.apiBaseUrl}/settings/backup`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nexia-copia.json';
        link.click();
        URL.revokeObjectURL(url);
      });
  }

  protected readonly days = DAYS;
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly savingProfile = signal(false);
  protected readonly savingHours = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly profileForm = new FormGroup({
    phone: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    instagram: new FormControl('', { nonNullable: true }),
    facebook: new FormControl('', { nonNullable: true }),
    cancelHours: new FormControl<number | null>(null),
    depositAmount: new FormControl<number | null>(null),
    depositPercent: new FormControl<number | null>(null),
    depositAccount: new FormControl('', { nonNullable: true }),
    depositHoldHours: new FormControl<number | null>(3),
    bufferMinutes: new FormControl<number | null>(0),
    staffLabel: new FormControl('Colaborador', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    minNoticeHours: new FormControl<number | null>(0),
    maxDaysAhead: new FormControl<number | null>(90),
    cancelPolicy: new FormControl('', { nonNullable: true }),
    resources: new FormControl('', { nonNullable: true }),
    paymentUrl: new FormControl('', { nonNullable: true }),
  });

  protected readonly rolePicks = ROLE_PICKS;
  protected readonly pauseBookings = signal(false);
  protected readonly closedFrom = signal('');
  protected readonly closedTo = signal('');
  protected readonly photos = signal<string[]>([]);
  protected readonly promo = signal('');
  protected readonly promoUntil = signal('');

  protected readonly hoursForm = new FormGroup({
    days: new FormArray(
      DAYS.map((_, index) =>
        new FormGroup({
          day_of_week: new FormControl(index, { nonNullable: true }),
          is_open: new FormControl(index < 6, { nonNullable: true }),
          open_time: new FormControl('09:00', { nonNullable: true }),
          close_time: new FormControl('18:00', { nonNullable: true }),
        }),
      ),
    ),
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
    this.bookingApi
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((brand) => this.profileForm.controls.description.setValue(brand.description ?? ''));
  }

  protected isOpen(index: number): boolean {
    return this.hoursForm.controls.days.at(index).controls.is_open.value;
  }

  protected logoSrc(): string | null {
    const url = this.logoUrl();
    if (!url) {
      return null;
    }
    if (url.startsWith('http') || url.startsWith('data:')) {
      return url;
    }
    return `${this.apiBaseUrl.replace(/\/api$/, '')}${url}`;
  }

  protected onLogo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file?.type.startsWith('image/')) {
      return;
    }
    this.uploading.set(true);
    this.notice.set(null);
    this.errorMessage.set(null);
    const preview = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.uploading.set(false);
        return;
      }
      const scale = Math.min(size / img.width, size / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(preview);
      if (data.length > 180000) {
        this.uploading.set(false);
        this.errorMessage.set('La imagen es muy pesada. Prueba otra más simple.');
        return;
      }
      const colors = colorsFrom(ctx.getImageData(0, 0, size, size));
      const primary = colors[0] ?? '#1E1B1E';
      const canvasColor = lighten(primary, 0.9);
      this.logoUrl.set(data);
      this.copy.setLogo(data);
      paint(primary, canvasColor);
      this.bookingApi
        .getMyBrand()
        .pipe(
          switchMap((brand) =>
            this.bookingApi.updateBusiness({
              name: brand.name,
              phone: brand.phone,
              logo_url: data,
              description: brand.description ?? null,
              address: brand.address ?? null,
              instagram: brand.instagram ?? null,
              facebook: brand.facebook ?? null,
              website: brand.website ?? null,
              primary_color: primary,
              canvas_color: canvasColor,
            }),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => {
            this.uploading.set(false);
            this.toasts.show('Logo actualizado.');
          },
          error: () => {
            this.uploading.set(false);
            this.errorMessage.set('Vimos el logo, pero no pudimos guardarlo.');
          },
        });
    };
    img.onerror = () => {
      URL.revokeObjectURL(preview);
      this.uploading.set(false);
      this.errorMessage.set('No pudimos leer esa imagen.');
    };
    img.src = preview;
  }

  protected saveProfile(): void {
    if (this.savingProfile()) {
      return;
    }
    const value = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.notice.set(null);
    this.errorMessage.set(null);
    this.settingsApi
      .updateProfile({
        phone: value.phone.trim(),
        address: value.address.trim() || null,
        instagram: value.instagram.trim() || null,
        facebook: value.facebook.trim() || null,
        cancel_hours: value.cancelHours === null || value.cancelHours === undefined || String(value.cancelHours) === '' ? null : Number(value.cancelHours),
        deposit_amount: value.depositAmount === null || value.depositAmount === undefined || String(value.depositAmount) === '' ? null : Number(value.depositAmount),
        deposit_percent: value.depositPercent === null || value.depositPercent === undefined || String(value.depositPercent) === '' ? null : Number(value.depositPercent),
        deposit_account: value.depositAccount.trim() || null,
        deposit_hold_hours: value.depositHoldHours === null || String(value.depositHoldHours) === '' ? 3 : Number(value.depositHoldHours),
        buffer_minutes: value.bufferMinutes === null || String(value.bufferMinutes) === '' ? 0 : Number(value.bufferMinutes),
        staff_label: String(value.staffLabel || 'Colaborador').trim() || 'Colaborador',
        min_notice_hours: value.minNoticeHours === null || String(value.minNoticeHours) === '' ? 0 : Number(value.minNoticeHours),
        max_days_ahead: value.maxDaysAhead === null || String(value.maxDaysAhead) === '' ? 90 : Number(value.maxDaysAhead),
        cancel_policy: value.cancelPolicy.trim() || null,
        resources: joinNote(value.resources, {
          pause: this.pauseBookings(),
          from: this.closedFrom(),
          to: this.closedTo(),
          photos: this.photos(),
          promo: this.promo().trim().slice(0, 80),
          until: this.promo().trim() ? this.promoUntil() : '',
        }) || null,
        payment_url: value.paymentUrl.trim() || null,
      })
      .pipe(
        switchMap((settings) =>
          this.bookingApi.getMyBrand().pipe(
            switchMap((brand) =>
              this.bookingApi.updateBusiness({
                name: brand.name,
                phone: brand.phone,
                logo_url: brand.logo_url,
                description: value.description.trim() || null,
                address: brand.address ?? null,
                instagram: brand.instagram ?? null,
                facebook: brand.facebook ?? null,
                website: brand.website ?? null,
                primary_color: brand.primary_color,
                canvas_color: brand.canvas_color ?? null,
              }),
            ),
            catchError(() => of(null)),
            switchMap(() => of(settings)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.apply(settings);
          this.copy.setLabel(settings.staff_label);
          this.savingProfile.set(false);
          this.toasts.show('Se guardó el perfil.');
        },
        error: (error: unknown) => {
          this.savingProfile.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar el perfil.'));
        },
      });
  }

  protected saveHours(): void {
    if (this.savingHours()) {
      return;
    }
    const hours: BusinessHour[] = this.hoursForm.controls.days.getRawValue().map((day) => ({
      day_of_week: day.day_of_week,
      open_time: day.open_time,
      close_time: day.close_time,
      is_closed: !day.is_open,
    }));
    this.savingHours.set(true);
    this.notice.set(null);
    this.errorMessage.set(null);
    this.settingsApi
      .updateHours(hours)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.fillHours(saved);
          this.savingHours.set(false);
          this.toasts.show('Se guardaron los horarios.');
        },
        error: (error: unknown) => {
          this.savingHours.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar los horarios.'));
        },
      });
  }

  protected addPhotos(event: Event): void {
    const files = [...((event.target as HTMLInputElement).files ?? [])].slice(0, 3 - this.photos().length);
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
    (event.target as HTMLInputElement).value = '';
  }

  protected removePhoto(index: number): void {
    this.photos.update((items) => items.filter((_, item) => item !== index));
  }

  private apply(settings: BusinessSettings): void {
    this.logoUrl.set(settings.logo_url);
    const packed = splitNote(settings.resources);
    this.pauseBookings.set(packed.note.pause);
    this.closedFrom.set(packed.note.from);
    this.closedTo.set(packed.note.to);
    this.photos.set(packed.note.photos);
    this.promo.set(packed.note.promo);
    this.promoUntil.set(packed.note.until);
    const description = this.profileForm.controls.description.value;
    this.profileForm.setValue({
      phone: settings.phone ?? '',
      address: settings.address ?? '',
      instagram: settings.instagram ?? '',
      facebook: settings.facebook ?? '',
      cancelHours: settings.cancel_hours,
      depositAmount: settings.deposit_amount,
      depositPercent: settings.deposit_percent,
      depositAccount: settings.deposit_account ?? '',
      depositHoldHours: settings.deposit_hold_hours ?? 3,
      bufferMinutes: settings.buffer_minutes ?? 0,
      staffLabel: settings.staff_label || 'Colaborador',
      description,
      minNoticeHours: settings.min_notice_hours ?? 0,
      maxDaysAhead: settings.max_days_ahead ?? 90,
      cancelPolicy: settings.cancel_policy ?? '',
      resources: packed.text,
      paymentUrl: settings.payment_url ?? '',
    });
    this.fillHours(settings.hours);
  }

  private fillHours(hours: BusinessHour[]): void {
    for (const row of hours) {
      const group = this.hoursForm.controls.days.at(row.day_of_week);
      group?.setValue({
        day_of_week: row.day_of_week,
        is_open: !row.is_closed,
        open_time: row.open_time.slice(0, 5),
        close_time: row.close_time.slice(0, 5),
      });
    }
  }
}

function paint(primary: string, canvas: string): void {
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--business-primary', primary);
  root.style.setProperty('--mat-sys-primary', primary);
  root.style.setProperty('--bg-app', canvas);
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
  }
  return fallback;
}
