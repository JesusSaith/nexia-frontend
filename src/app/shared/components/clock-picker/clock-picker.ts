import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { clockGrid, parseClocks } from '@core/clocks';
import { hora12 } from '@core/hours';

/**
 * Elegir horas fijas sin ruedas: toca las horas de la cuadrícula (cada media hora) o escribe varias de golpe
 * ("9:30, 12:30, 4pm y 6pm"). Devuelve la lista ordenada en formato 24 h ("09:30").
 */
@Component({
  selector: 'app-clock-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div>
      <label class="block">
        <span class="label opt">Escribe las horas</span>
        <span class="flex gap-2">
          <input
            class="input min-w-0 flex-1"
            type="text"
            inputmode="text"
            autocomplete="off"
            placeholder="9:30, 12:30, 4pm y 6pm"
            [value]="draft()"
            (input)="draft.set($any($event.target).value); problem.set('')"
            (keydown.enter)="$event.preventDefault(); addTyped()"
          />
          <button type="button" class="btn btn-secondary shrink-0" [disabled]="!draft().trim()" (click)="addTyped()"><mat-icon>add</mat-icon>Agregar</button>
        </span>
      </label>
      @if (problem()) {
        <p class="field-error mt-1" role="alert">{{ problem() }}</p>
      } @else {
        <p class="field-hint">Sin "am" ni "pm", de 1 a 6 cuenta como tarde (6:00 = 6:00 p.m.) y de 9 a 11 como mañana. Con 7 y 8 escribe "am" o "pm".</p>
      }

      <span class="label mt-3 block">O toca las horas</span>
      <div class="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-6" role="group" aria-label="Horas disponibles">
        @for (clock of grid(); track clock) {
          <button
            type="button"
            class="chip nums h-11! justify-center px-1!"
            [class.chip-on]="value().includes(clock)"
            [attr.aria-pressed]="value().includes(clock)"
            (click)="toggle(clock)"
          >
            {{ label(clock) }}
          </button>
        }
      </div>

      @if (extras().length) {
        <p class="mt-3 text-sm text-muted">Otras horas que no caen en la media hora:</p>
        <div class="mt-1 flex flex-wrap gap-2">
          @for (clock of extras(); track clock) {
            <button type="button" class="chip chip-on nums h-11! gap-1" (click)="toggle(clock)">
              {{ label(clock) }}<mat-icon class="h-4! w-4! text-[16px]!" aria-hidden="true">close</mat-icon><span class="sr-only">Quitar {{ label(clock) }}</span>
            </button>
          }
        </div>
      }
      <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>{{ value().length ? value().length + (value().length === 1 ? ' hora elegida' : ' horas elegidas') : 'Todavía no eliges ninguna hora' }}</span>
        @if (value().length) {
          <button type="button" class="btn btn-ghost px-2 text-sm" (click)="changed.emit([])">Quitar todas</button>
        }
      </p>
    </div>
  `,
})
export class ClockPickerComponent {
  /** Horas elegidas, "HH:MM" ordenadas. */
  readonly value = input<string[]>([]);
  /** Rango de la cuadrícula; se amplía solo si ya hay horas fuera de él. */
  readonly from = input('07:00');
  readonly to = input('21:00');
  readonly changed = output<string[]>();

  protected readonly draft = signal('');
  protected readonly problem = signal('');

  protected readonly grid = computed(() => {
    const chosen = this.value();
    const first = [this.from(), ...chosen].sort()[0];
    const last = [this.to(), ...chosen].sort().slice(-1)[0];
    return clockGrid(first.slice(0, 2) + ':00', last, 30);
  });
  protected readonly extras = computed(() => this.value().filter((clock) => !this.grid().includes(clock)));

  protected label(clock: string): string {
    return hora12(clock);
  }

  protected toggle(clock: string): void {
    const next = this.value().includes(clock) ? this.value().filter((item) => item !== clock) : [...this.value(), clock].sort();
    this.changed.emit(next);
  }

  protected addTyped(): void {
    const text = this.draft().trim();
    if (!text) {
      return;
    }
    const { clocks, invalid } = parseClocks(text);
    if (invalid.length) {
      this.problem.set(`No entendí: ${invalid.join(', ')}. Escríbelas como 9:30, 12:30, 4pm o 18:00.`);
      return;
    }
    this.changed.emit([...new Set([...this.value(), ...clocks])].sort());
    this.draft.set('');
    this.problem.set('');
  }
}
