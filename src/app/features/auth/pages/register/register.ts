import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { BUSINESS_KINDS } from '@core/business-kinds';
import { AuthService } from '@core/services/auth.service';
import { Toasts } from '@core/toasts';

type FieldName = 'businessKind' | 'businessName' | 'phone' | 'fullName' | 'email' | 'password' | 'acceptTerms';

/** Orden en pantalla: al enviar con errores, el foco va al primero de esta lista que falle. */
const FIELD_ORDER: FieldName[] = ['businessKind', 'businessName', 'phone', 'fullName', 'email', 'password', 'acceptTerms'];

const MESSAGES: Record<FieldName, Record<string, string>> = {
  businessKind: { required: 'Elige el tipo de negocio.' },
  businessName: { required: 'Escribe el nombre del negocio.' },
  phone: { required: 'Escribe el teléfono del negocio.', pattern: 'El teléfono debe tener 10 dígitos.' },
  fullName: { required: 'Escribe tu nombre.' },
  email: { required: 'Escribe tu correo.', email: 'Revisa el correo; parece incompleto.', taken: 'Ese correo ya tiene una cuenta.' },
  password: { required: 'Crea una contraseña.', minlength: 'Usa al menos 8 caracteres.', maxlength: 'Usa máximo 72 caracteres.' },
  acceptTerms: { required: 'Para crear tu cuenta necesitas aceptar los términos y el aviso de privacidad.' },
};

/** Zona del navegador de la dueña (p. ej. "America/Tijuana"); el backend usa CDMX si no la reconoce. */
function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly kindPicks = BUSINESS_KINDS;
  protected readonly benefits = [
    { icon: 'event_available', text: 'Tus clientas reservan solas, a cualquier hora.' },
    { icon: 'payments', text: 'Pide anticipo por transferencia y evita las faltas.' },
    { icon: 'chat', text: 'Confirma y recuerda citas por WhatsApp en un toque.' },
  ];
  protected readonly bookingHost = window.location.host;

  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    businessKind: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    businessName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{10}$/)] }),
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    }),
    acceptTerms: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  protected readonly errors = computed(() => {
    this.formEvents();
    this.validationTick();
    return Object.fromEntries(FIELD_ORDER.map((name) => [name, this.fieldError(name)])) as Record<FieldName, string>;
  });

  /** El enlace real que tendrá el negocio, ya con sufijo si el nombre está ocupado. */
  protected readonly slug = toSignal(
    this.form.controls.businessName.valueChanges.pipe(
      map((name) => name.trim()),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((name) => (name ? this.authService.slugPreview(name).pipe(catchError(() => of(''))) : of(''))),
    ),
    { initialValue: '' },
  );

  /** Solo dígitos y máximo 10, aunque peguen "+52 (55) 1234-5678". */
  protected onPhoneInput(): void {
    const control = this.form.controls.phone;
    const digits = control.value.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '').slice(0, 10);
    if (digits !== control.value) {
      control.setValue(digits);
    }
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    this.validationTick.update((tick) => tick + 1);

    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.focusFirstError();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    this.authService
      .register({
        fullName: raw.fullName.trim(),
        email: raw.email.trim(),
        password: raw.password,
        businessName: raw.businessName.trim(),
        phone: raw.phone,
        businessKind: raw.businessKind,
        acceptTerms: raw.acceptTerms,
        timezone: browserTimezone(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toasts.show(
            raw.businessKind === 'otro'
              ? 'Tu negocio está listo. Empieza agregando tus servicios.'
              : 'Tu negocio está listo. Te dejamos servicios sugeridos: ajusta precios y actívalos.',
          );
          void this.router.navigateByUrl('/admin/bienvenida');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          if (error.status === 409) {
            this.form.controls.email.setErrors({ taken: true });
            this.validationTick.update((tick) => tick + 1);
            this.focusFirstError();
            return;
          }
          this.errorMessage.set(this.messageFor(error));
        },
      });
  }

  private messageFor(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    }
    if (error.status === 429) {
      return 'Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    }
    return 'No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.';
  }

  private focusFirstError(): void {
    const name = FIELD_ORDER.find((field) => this.form.controls[field].invalid);
    if (name) {
      this.host.nativeElement.querySelector<HTMLElement>(`[data-field="${name}"]`)?.focus();
    }
  }

  private fieldError(name: FieldName): string {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    const errorKey = Object.keys(MESSAGES[name]).find((key) => control.hasError(key));
    return errorKey ? MESSAGES[name][errorKey] : '';
  }
}
