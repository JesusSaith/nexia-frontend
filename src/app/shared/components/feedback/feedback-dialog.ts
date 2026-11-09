import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FeedbackService } from '@core/services/feedback.service';
import { Toasts } from '@core/toasts';

/** Diálogo "Enviar comentario": una idea, un problema o una duda sobre Nexia. */
@Component({
  selector: 'app-feedback-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <form class="w-full max-w-md p-5" (ngSubmit)="send()" novalidate>
      <h2 id="feedback-title" class="text-base font-semibold text-ink">Enviar comentario</h2>
      <p class="mt-1.5 text-sm text-ink-soft">Cuéntanos qué te gustaría que Nexia hiciera mejor o qué no te quedó claro. Lo leemos todos.</p>
      <label class="field mt-4">
        <span class="field-label req">Tu comentario</span>
        <textarea class="field-input" rows="5" maxlength="1000" [formControl]="message" aria-required="true" [attr.aria-invalid]="showError()"></textarea>
      </label>
      @if (showError()) {
        <p class="field-error mt-1" role="alert">Escribe al menos unas palabras.</p>
      }
      @if (failed()) {
        <p class="field-error mt-1" role="alert">No pudimos enviarlo. Revisa tu conexión e inténtalo de nuevo.</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="ref.close(false)">Cancelar</button>
        <button type="submit" class="btn btn-primary" [disabled]="sending() || message.invalid">{{ sending() ? 'Enviando…' : 'Enviar' }}</button>
      </div>
    </form>
  `,
})
export class FeedbackDialogComponent {
  protected readonly ref = inject(MatDialogRef<FeedbackDialogComponent, boolean>);
  private readonly page = inject<{ page: string | null }>(MAT_DIALOG_DATA, { optional: true })?.page ?? null;
  private readonly api = inject(FeedbackService);
  private readonly toasts = inject(Toasts);

  protected readonly message = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });
  protected readonly sending = signal(false);
  protected readonly failed = signal(false);
  protected readonly tried = signal(false);

  protected showError(): boolean {
    return this.tried() && this.message.invalid;
  }

  protected send(): void {
    this.tried.set(true);
    if (this.message.invalid || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.failed.set(false);
    this.api.send(this.message.value.trim(), this.page).subscribe({
      next: () => {
        this.toasts.show('Gracias por tu comentario.');
        this.ref.close(true);
      },
      error: () => {
        this.sending.set(false);
        this.failed.set(true);
      },
    });
  }
}
