import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { sessionHome } from '@core/guards/role.guard';
import { AuthService } from '@core/services/auth.service';
import { Toasts } from '@core/toasts';

/** Primera entrada con la contraseña temporal que dio la dueña: aquí se elige la propia. */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <main class="grid min-h-dvh place-items-center bg-surface px-6 py-12">
      <div class="w-full max-w-sm">
        <img src="/nexia-mark.png" alt="Nexia" class="mx-auto mb-4 w-32" />
        <h1 class="text-xl font-semibold">Elige tu contraseña</h1>
        <p class="mb-6 mt-1 text-sm text-muted">
          Entraste con una contraseña temporal. Escribe la que quieras usar de ahora en adelante.
        </p>

        <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label class="field" [class.field-invalid]="showError('current_password')">
            <span class="field-label">Contraseña temporal</span>
            <input class="field-input" [type]="hide() ? 'password' : 'text'" formControlName="current_password" autocomplete="current-password" />
          </label>
          @if (showError('current_password')) {
            <p class="field-error">Escribe la contraseña temporal que te dieron.</p>
          }

          <label class="field" [class.field-invalid]="showError('new_password')">
            <span class="field-label">Tu nueva contraseña</span>
            <span class="flex items-center gap-2">
              <input
                class="field-input min-w-0 flex-1"
                [type]="hide() ? 'password' : 'text'"
                formControlName="new_password"
                autocomplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                class="grid h-6 w-6 shrink-0 place-items-center text-muted"
                (click)="hide.set(!hide())"
                [attr.aria-label]="hide() ? 'Mostrar contraseñas' : 'Ocultar contraseñas'"
              >
                <mat-icon class="h-4! w-4! text-[16px]! leading-4!">{{ hide() ? 'visibility' : 'visibility_off' }}</mat-icon>
              </button>
            </span>
          </label>
          @if (showError('new_password')) {
            <p class="field-error">Usa entre 8 y 72 caracteres.</p>
          }

          @if (errorMessage(); as message) {
            <p role="alert" class="badge-bad rounded-xl px-3 py-2 text-sm">{{ message }}</p>
          }

          <button class="btn btn-primary disabled:opacity-50" type="submit" [disabled]="submitting()">
            {{ submitting() ? 'Guardando…' : 'Guardar y entrar' }}
          </button>
        </form>
      </div>
    </main>
  `,
})
export class ChangePassword {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly hide = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = new FormGroup({
    current_password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    new_password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    }),
  });

  protected showError(name: 'current_password' | 'new_password'): boolean {
    const control = this.form.controls[name];
    return control.touched && control.invalid;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const { current_password, new_password } = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authService
      .changePassword(current_password, new_password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.toasts.show('Listo, tu contraseña cambió.');
          void this.router.navigateByUrl(sessionHome(user) ?? '/auth/login');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          const detail = typeof error.error?.detail === 'string' ? error.error.detail : '';
          this.errorMessage.set(
            error.status === 0
              ? 'No hay conexión con el servidor. Inténtalo de nuevo.'
              : error.status === 429
                ? 'Hiciste muchos intentos seguidos. Espera unos minutos.'
                : error.status === 400 && detail
                  ? detail
                  : 'No pudimos guardar la contraseña. Inténtalo de nuevo.',
          );
        },
      });
  }
}
