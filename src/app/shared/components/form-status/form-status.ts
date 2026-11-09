import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Aviso de arriba de un formulario: "Para guardar falta: …" o "Todo listo para guardar".
 * Va junto con `.label.req` (asterisco) y `.label.opt` ("(opcional)") y con el botón apagado mientras falte algo.
 */
@Component({
  selector: 'app-form-status',
  imports: [MatIconModule],
  template: `
    @if (missing().length > 0) {
      <p class="form-missing" role="status">
        <mat-icon class="shrink-0 text-muted" aria-hidden="true">info</mat-icon>
        <span>Para {{ verb() }} falta: {{ missing().join(', ') }}. Los campos con <b class="text-(--nx-bad-fg)">*</b> son obligatorios.</span>
      </p>
    } @else {
      <p class="form-missing" role="status">
        <mat-icon class="shrink-0 text-(--nx-ok-fg)" aria-hidden="true">check_circle</mat-icon>
        <span>Todo listo para {{ verb() }}.</span>
      </p>
    }
  `,
})
export class FormStatusComponent {
  readonly missing = input<string[]>([]);
  readonly verb = input('guardar');
}

/** Nombres de los campos obligatorios que están vacíos o mal: `labels` es { control: 'el nombre' }. */
export function missingLabels(controls: Record<string, { invalid: boolean; value: unknown }>, labels: Record<string, string>): string[] {
  return Object.entries(labels)
    .filter(([name]) => {
      const control = controls[name];
      const value = control?.value;
      return !control || control.invalid || value === null || value === undefined || (typeof value === 'string' && !value.trim());
    })
    .map(([, label]) => label);
}
