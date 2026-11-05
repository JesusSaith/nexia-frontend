import { Component, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="w-full max-w-sm p-5">
      <h2 id="confirm-title" class="text-base font-semibold text-ink">{{ data.title }}</h2>
      @if (data.message) {
        <p class="mt-1.5 text-sm text-ink-soft">{{ data.message }}</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" (click)="ref.close(false)">{{ data.cancel || 'Volver' }}</button>
        <button type="button" class="btn" [class.btn-danger]="data.danger" [class.btn-primary]="!data.danger" (click)="ref.close(true)">
          {{ data.confirm || 'Confirmar' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
}

/** Confirmación con el estilo de la app, en lugar de window.confirm. */
@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly dialog = inject(MatDialog);

  ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, { data: options, autoFocus: 'dialog', maxWidth: '92vw', ariaLabelledBy: 'confirm-title', role: options.danger ? 'alertdialog' : 'dialog' });
    return firstValueFrom(ref.afterClosed()).then((answer) => answer === true);
  }
}
