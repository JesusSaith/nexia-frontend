import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { saveStateOf, saveStateText } from '@core/save-state';

/** Indicador de guardado, igual en todas las pantallas con botón "Guardar": "Guardando…", "N cambios sin guardar" o "Todo guardado". */
@Component({
  selector: 'app-save-state',
  imports: [MatIconModule],
  template: `
    <span class="badge h-8! gap-1.5" [class.badge-warn]="kind() === 'dirty'" [class.badge-ok]="kind() === 'saved'" [class.badge-neutral]="kind() === 'saving'" role="status">
      <mat-icon class="h-4! w-4! text-[16px]!" aria-hidden="true">{{ kind() === 'dirty' ? 'edit_note' : kind() === 'saved' ? 'check_circle' : 'sync' }}</mat-icon>
      {{ text() }}
    </span>
  `,
})
export class SaveStateComponent {
  readonly saving = input(false);
  readonly changes = input(0);
  protected readonly kind = computed(() => saveStateOf(this.saving(), this.changes()));
  protected readonly text = computed(() => saveStateText(this.kind(), this.changes()));
}
