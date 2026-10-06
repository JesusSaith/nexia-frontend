import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

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

    this.authService
      .register(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
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
    name: 'fullName' | 'businessName' | 'email' | 'password',
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
