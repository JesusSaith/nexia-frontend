import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { API_BASE_URL } from '@core/config/api-base-url';
import { BusinessHour, BusinessSettings, SettingsService } from '@core/services/settings.service';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-page.component.html',
})
export class SettingsPageComponent {
  private readonly settingsApi = inject(SettingsService);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);

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
  });

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
    if (!file) {
      return;
    }
    this.uploading.set(true);
    this.notice.set(null);
    this.settingsApi
      .uploadLogo(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.logoUrl.set(settings.logo_url);
          this.uploading.set(false);
          this.notice.set('Logo actualizado.');
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.errorMessage.set(readError(error, 'No pudimos subir el logo.'));
        },
      });
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
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.apply(settings);
          this.savingProfile.set(false);
          this.notice.set('Perfil guardado.');
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
          this.notice.set('Horarios guardados.');
        },
        error: (error: unknown) => {
          this.savingHours.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar los horarios.'));
        },
      });
  }

  private apply(settings: BusinessSettings): void {
    this.logoUrl.set(settings.logo_url);
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

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
  }
  return fallback;
}
