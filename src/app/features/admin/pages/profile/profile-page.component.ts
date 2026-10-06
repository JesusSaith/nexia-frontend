import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Staff } from '@core/models/staff.model';
import { StaffService } from '@core/services/staff.service';

@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './profile-page.component.html',
})
export class ProfilePageComponent {
  private readonly staffApi = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly validationTick = signal(0);

  protected readonly profile = signal<Staff | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly form = new FormGroup({
    full_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    avatar_url: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2048)] }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });
  protected readonly nameError = computed(() => {
    this.formEvents();
    this.validationTick();
    const control = this.form.controls.full_name;
    if (!control.touched || control.valid) {
      return '';
    }
    return 'Ingresa tu nombre.';
  });

  constructor() {
    this.staffApi
      .getStaffProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.form.reset({
            full_name: profile.full_name,
            phone: profile.phone ?? '',
            avatar_url: profile.avatar_url ?? '',
            bio: profile.bio ?? '',
          });
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar tu perfil.'));
        },
      });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    this.validationTick.update((tick) => tick + 1);
    if (this.form.invalid || this.isSaving()) {
      return;
    }
    const raw = this.form.getRawValue();
    this.isSaving.set(true);
    this.saved.set(false);
    this.formError.set(null);
    this.staffApi
      .updateStaffProfile({
        full_name: raw.full_name.trim(),
        phone: raw.phone.trim() || null,
        avatar_url: raw.avatar_url.trim() || null,
        bio: raw.bio.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.isSaving.set(false);
          this.saved.set(true);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos guardar tu perfil.'));
        },
      });
  }
}

function readError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'No hay conexión con el servidor.';
  }
  const detail = error.error?.detail;
  if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
    return detail;
  }
  return fallback;
}
