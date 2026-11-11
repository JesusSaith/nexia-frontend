import { Component, computed, input, model, signal } from '@angular/core';

import { plain } from '../when-field/when-field';

/**
 * Campo de texto que sugiere mientras se escribe (por ejemplo "Renta" o "Luz" en un gasto). Se puede escribir cualquier cosa:
 * las sugerencias solo ayudan. `[(value)]` lleva el texto. Flechas y Enter eligen; Escape cierra.
 */
@Component({
  selector: 'app-autocomplete-field',
  template: `
    <div class="relative">
      <input
        class="input"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="visible()"
        [attr.maxlength]="maxlength()"
        [attr.aria-label]="label() || null"
        [placeholder]="placeholder()"
        [value]="value()"
        (input)="type($any($event.target).value)"
        (focus)="open.set(true)"
        (blur)="open.set(false)"
        (keydown)="key($event)"
      />
      @if (visible()) {
        <ul class="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-surface p-1 text-ink shadow-lg" role="listbox">
          @for (item of matches(); track item; let i = $index) {
            <li role="option" [attr.aria-selected]="i === active()">
              <!-- mousedown (no click): así el campo no pierde el foco antes de elegir -->
              <button type="button" tabindex="-1" class="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm" [class.bg-accent-soft]="i === active()" (mousedown)="choose(item, $event)">{{ item }}</button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AutocompleteFieldComponent {
  readonly value = model('');
  readonly suggestions = input<string[]>([]);
  readonly placeholder = input('');
  readonly label = input('');
  readonly maxlength = input<number | null>(null);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly matches = computed(() => {
    const text = plain(this.value().trim());
    const seen = new Set<string>();
    return this.suggestions()
      .filter((item) => {
        const key = plain(item);
        if (seen.has(key) || key === text || (text && !key.includes(text))) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  });
  protected readonly visible = computed(() => this.open() && this.matches().length > 0);

  protected type(text: string): void {
    this.value.set(text);
    this.active.set(-1);
    this.open.set(true);
  }

  protected choose(item: string, event?: Event): void {
    event?.preventDefault();
    this.value.set(item);
    this.open.set(false);
  }

  protected key(event: KeyboardEvent): void {
    const total = this.matches().length;
    if (event.key === 'Escape') {
      this.open.set(false);
    } else if (event.key === 'ArrowDown' && total) {
      event.preventDefault();
      this.open.set(true);
      this.active.set((this.active() + 1) % total);
    } else if (event.key === 'ArrowUp' && total) {
      event.preventDefault();
      this.active.set((this.active() - 1 + total) % total);
    } else if (event.key === 'Enter' && this.visible() && this.active() >= 0) {
      event.preventDefault();
      this.choose(this.matches()[this.active()]);
    }
  }
}
