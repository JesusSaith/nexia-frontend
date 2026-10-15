import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { sessionHome } from '@core/guards/role.guard';
import { AuthService } from '@core/services/auth.service';

/** "login" pide correo y contraseña; "forgot" solo el correo; "sent" confirma que salió el enlace. */
type Mode = 'login' | 'forgot' | 'sent';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatIconModule,
  ],
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  // ?recuperar=1 abre directo en "Recupera tu contraseña" (viene de un enlace vencido).
  protected readonly mode = signal<Mode>(this.query.has('recuperar') ? 'forgot' : 'login');
  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    // Viene lleno cuando el registro avisa que el correo ya tiene cuenta.
    email: new FormControl(this.query.get('email') ?? '', {
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

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
    this.form.controls.password.markAsUntouched();
  }

  protected submit(): void {
    if (this.mode() === 'forgot') {
      this.sendResetLink();
      return;
    }

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
          void this.router.navigateByUrl(sessionHome(user) ?? '/auth/login');
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

  private sendResetLink(): void {
    const email = this.form.controls.email;
    email.markAsTouched();
    this.validationTick.update((tick) => tick + 1);

    if (email.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService
      .forgotPassword(email.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.mode.set('sent');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(
            error.status === 0
              ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
              : error.status === 429
                ? 'Pediste varios enlaces seguidos. Revisa tu correo (también en spam) o espera unos minutos.'
                : 'No pudimos enviar el enlace. Inténtalo de nuevo.',
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
