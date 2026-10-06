import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { CustomButtonComponent } from '@shared/components/custom-button/custom-button';
import { CustomInputComponent } from '@shared/components/custom-input/custom-input';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, CustomInputComponent, CustomButtonComponent],
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

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
      .login(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/admin');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(
            error.status === 0
              ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
              : 'Correo o contraseña incorrectos.',
          );
        },
      });
  }

  private fieldError(
    name: 'email' | 'password',
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
