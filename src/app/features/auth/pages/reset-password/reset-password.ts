import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { sessionHome } from '@core/guards/role.guard';
import { AuthService } from '@core/services/auth.service';
import { Toasts } from '@core/toasts';

/** Se abre desde el correo de "¿Olvidaste tu contraseña?" con ?token=… */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <main class="grid min-h-dvh place-items-center bg-surface px-6 py-12">
      <div class="w-full max-w-sm">
        <img src="/nexia-mark.png" alt="Nexia" class="mx-auto mb-4 w-32" />

        @if (!token || expired()) {
          <h1 class="text-xl font-semibold">El enlace ya no sirve</h1>
          <p class="mt-1 text-sm text-muted">
            Los enlaces vencen en 1 hora y se pueden usar una sola vez. Pide uno nuevo y ábrelo desde el correo más reciente.
          </p>
          <a class="btn btn-primary mt-6 w-full justify-center" routerLink="/auth/login" [queryParams]="{ recuperar: 1 }">Pedir otro enlace</a>
        } @else {
          <h1 class="text-xl font-semibold">Elige tu nueva contraseña</h1>
          <p class="mb-6 mt-1 text-sm text-muted">Al guardarla entras directo a tu panel.</p>

          <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <label class="field" [class.field-invalid]="passwordError()">
              <span class="field-label">Nueva contraseña</span>
              <span class="flex items-center gap-2">
                <input
                  class="field-input min-w-0 flex-1"
                  [type]="hidePassword() ? 'password' : 'text'"
                  formControlName="password"
                  autocomplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  [attr.aria-invalid]="!!passwordError()"
                />
                <button
                  type="button"
                  class="grid h-6 w-6 shrink-0 place-items-center text-muted"
                  (click)="hidePassword.set(!hidePassword())"
                  [attr.aria-label]="hidePassword() ? 'Mostrar contraseña' : 'Ocultar contraseña'"
                >
                  <mat-icon class="h-4! w-4! text-[16px]! leading-4!">{{ hidePassword() ? 'visibility' : 'visibility_off' }}</mat-icon>
                </button>
              </span>
            </label>
            @if (passwordError()) {
              <p class="field-error">{{ passwordError() }}</p>
            }

            @if (errorMessage(); as message) {
              <p role="alert" class="badge-bad rounded-xl px-3 py-2 text-sm">{{ message }}</p>
            }

            <button class="btn btn-primary disabled:opacity-50" type="submit" [disabled]="submitting()">
              {{ submitting() ? 'Guardando…' : 'Guardar y entrar' }}
            </button>
          </form>
        }
      </div>
    </main>
  `,
})
export class ResetPassword {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  protected readonly submitting = signal(false);
  protected readonly hidePassword = signal(true);
  protected readonly expired = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  protected readonly passwordError = computed(() => {
    this.formEvents();
    this.validationTick();
    const control = this.form.controls.password;
    if (!control.touched || control.valid) {
      return '';
    }
    if (control.hasError('required')) {
      return 'Escribe tu nueva contraseña.';
    }
    return control.hasError('minlength') ? 'Usa al menos 8 caracteres.' : 'Usa máximo 72 caracteres.';
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
      .resetPassword(this.token, this.form.controls.password.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.toasts.show('Listo, tu contraseña cambió.');
          void this.router.navigateByUrl(sessionHome(user) ?? '/auth/login');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          if (error.status === 400) {
            this.expired.set(true);
            return;
          }
          this.errorMessage.set(
            error.status === 0
              ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
              : error.status === 429
                ? 'Hiciste muchos intentos seguidos. Espera unos minutos.'
                : 'No pudimos guardar la contraseña. Inténtalo de nuevo.',
          );
        },
      });
  }
}
