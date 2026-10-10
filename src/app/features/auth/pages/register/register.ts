import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { AuthService } from '@core/services/auth.service';
import { SettingsService } from '@core/services/settings.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatIconModule,
    PickFieldComponent,
  ],
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly settingsApi = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly kindPicks = [
    { value: 'belleza', label: 'Salón de belleza' },
    { value: 'barberia', label: 'Barbería' },
    { value: 'spa', label: 'Spa' },
    { value: 'veterinaria', label: 'Veterinaria' },
    { value: 'consultorio', label: 'Consultorio' },
    { value: 'dental', label: 'Clínica dental' },
    { value: 'estudio', label: 'Estudio' },
    { value: 'clases', label: 'Clases o entrenamiento' },
    { value: 'otro', label: 'Otro' },
  ];
  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    businessName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    kind: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    address: new FormControl('', { nonNullable: true }),
    instagram: new FormControl('', { nonNullable: true }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  protected readonly fullNameError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('fullName', { required: 'Ingresa tu nombre.' });
  });

  protected readonly businessNameError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('businessName', { required: 'Ingresa el nombre del negocio.' });
  });

  protected readonly emailError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('email', {
      required: 'Ingresa tu correo.',
      email: 'Ingresa un correo válido.',
    });
  });

  protected readonly kindError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('kind', { required: 'Elige el tipo de negocio.' });
  });

  protected readonly phoneError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('phone', { required: 'Ingresa el teléfono del negocio.' });
  });

  protected readonly passwordError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('password', {
      required: 'Ingresa tu contraseña.',
      minlength: 'Usa al menos 8 caracteres.',
    });
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    this.validationTick.update((tick) => tick + 1);

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    this.authService
      .register({
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        businessName: raw.businessName,
      })
      .pipe(
        switchMap(() => this.settingsApi.getSettings()),
        switchMap((settings) =>
          this.settingsApi
            .updateProfile({
              phone: raw.phone.trim(),
              address: raw.address.trim() || null,
              instagram: raw.instagram.trim() || null,
              facebook: settings.facebook,
              cancel_hours: settings.cancel_hours,
              deposit_amount: settings.deposit_amount,
              deposit_percent: settings.deposit_percent,
              deposit_account: settings.deposit_account,
              deposit_hold_hours: settings.deposit_hold_hours,
              buffer_minutes: settings.buffer_minutes,
              staff_label: STAFF_BY_KIND[raw.kind] ?? settings.staff_label,
              min_notice_hours: settings.min_notice_hours,
              max_days_ahead: settings.max_days_ahead,
              cancel_policy: settings.cancel_policy,
              resources: settings.resources,
              payment_url: settings.payment_url,
            })
            .pipe(catchError(() => of(settings))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/admin');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(this.messageFor(error));
        },
      });
  }

  private messageFor(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No hay conexión con el servidor. Inténtalo de nuevo.';
    }
    if (error.status === 409) {
      return 'Ese correo ya está registrado.';
    }
    return 'No pudimos crear la cuenta. Revisa los datos.';
  }

  private fieldError(
    name: 'fullName' | 'businessName' | 'email' | 'password' | 'phone' | 'kind',
    messages: Record<string, string>,
  ): string {
    const control = this.form.controls[name];

    if (!control.touched || control.valid) {
      return '';
    }

    const errorKey = Object.keys(messages).find((key) => control.hasError(key));
    return errorKey ? messages[errorKey] : '';
  }
}

const STAFF_BY_KIND: Record<string, string> = {
  belleza: 'Estilista',
  barberia: 'Barbero',
  spa: 'Terapeuta',
  veterinaria: 'Veterinario',
  consultorio: 'Especialista',
  dental: 'Dentista',
  estudio: 'Profesional',
  clases: 'Instructor',
  otro: 'Colaborador',
};
