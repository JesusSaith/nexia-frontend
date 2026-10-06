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
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);
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
        next: (user) => {
          const destination = user.role === 'super_admin' ? '/super-admin' : '/admin';
          void this.router.navigateByUrl(destination);
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
