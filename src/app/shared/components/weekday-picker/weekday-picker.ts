import { Component, input, output } from '@angular/core';

import { WEEKDAYS } from '@core/shop-note';

/**
 * Chips L M M J V S D para limitar un periodo a ciertos días de la semana.
 * Lista vacía = todos los días (así se guarda); 0 = lunes … 6 = domingo, igual que el servidor.
 */
@Component({
  selector: 'app-weekday-picker',
  template: `
    <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="label()">
      @for (day of weekdays; track day.index) {
        <button
          type="button"
          class="chip h-11! min-w-11 justify-center px-0!"
          [class.chip-on]="value().includes(day.index)"
          [attr.aria-pressed]="value().includes(day.index)"
          [attr.aria-label]="day.long"
          (click)="toggle(day.index)"
        >
          {{ day.short }}
        </button>
      }
    </div>
  `,
})
export class WeekdayPickerComponent {
  readonly value = input<number[]>([]);
  readonly label = input('Días de la semana');
  readonly changed = output<number[]>();
  protected readonly weekdays = WEEKDAYS;

  protected toggle(index: number): void {
    const next = this.value().includes(index) ? this.value().filter((item) => item !== index) : [...this.value(), index];
    this.changed.emit(next.sort((left, right) => left - right));
  }
}
