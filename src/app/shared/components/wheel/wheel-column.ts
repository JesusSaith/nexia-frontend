import { AfterViewInit, Component, DestroyRef, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';

export interface WheelItem {
  value: string;
  label: string;
}

/** Alto de cada renglón; el CSS y la cuenta del scroll usan el mismo número. */
const ROW = 44;

/**
 * Una columna que gira como la de un reloj del celular: se desliza o se rueda con el mouse y lo que queda en la franja del centro es lo elegido.
 * Sirve para horas, minutos, AM/PM o cualquier lista corta (la usa `app-time-field`).
 */
@Component({
  selector: 'app-wheel-column',
  template: `
    <div
      #scroller
      class="wheel-scroll h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain text-center"
      role="listbox"
      [attr.aria-label]="label()"
      tabindex="0"
      (scroll)="onScroll()"
      (keydown)="onKey($event)"
    >
      <div class="h-[88px]" aria-hidden="true"></div>
      @for (item of items(); track item.value) {
        <div
          class="flex h-11 w-full cursor-pointer whitespace-nowrap snap-center items-center justify-center text-base nums transition-colors"
          role="option"
          [attr.aria-selected]="item.value === selected()"
          [class.text-ink]="item.value === selected()"
          [class.font-semibold]="item.value === selected()"
          [class.text-muted]="item.value !== selected()"
          (click)="go(item.value, true)"
        >
          {{ item.label }}
        </div>
      }
      <div class="h-[88px]" aria-hidden="true"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .wheel-scroll {
        scrollbar-width: none;
        -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 32%, #000 68%, transparent 100%);
        mask-image: linear-gradient(to bottom, transparent 0, #000 32%, #000 68%, transparent 100%);
      }
      .wheel-scroll::-webkit-scrollbar {
        display: none;
      }
    `,
  ],
})
export class WheelColumnComponent implements AfterViewInit {
  readonly items = input<WheelItem[]>([]);
  readonly selected = input('');
  readonly label = input('');
  readonly changed = output<string>();
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
    // Si el valor cambia desde fuera (otra columna, un atajo), la columna se acomoda sola.
    effect(() => {
      const target = this.indexOf(this.selected());
      if (this.ready && target >= 0 && Math.abs(this.scroller().nativeElement.scrollTop - target * ROW) > 2) {
        this.scroller().nativeElement.scrollTo({ top: target * ROW });
      }
    });
  }

  ngAfterViewInit(): void {
    const target = Math.max(0, this.indexOf(this.selected()));
    this.scroller().nativeElement.scrollTop = target * ROW;
    this.ready = true;
  }

  private indexOf(value: string): number {
    return this.items().findIndex((item) => item.value === value);
  }

  /** Al soltar el dedo (o dejar de rodar) se lee qué renglón quedó en el centro. */
  protected onScroll(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      const list = this.items();
      const index = Math.min(list.length - 1, Math.max(0, Math.round(this.scroller().nativeElement.scrollTop / ROW)));
      const next = list[index];
      if (next && next.value !== this.selected()) {
        this.changed.emit(next.value);
      }
    }, 90);
  }

  protected go(value: string, smooth: boolean): void {
    const index = this.indexOf(value);
    if (index < 0) {
      return;
    }
    this.scroller().nativeElement.scrollTo({ top: index * ROW, behavior: smooth ? 'smooth' : 'auto' });
    if (value !== this.selected()) {
      this.changed.emit(value);
    }
  }

  /** Con teclado: flechas arriba y abajo mueven un renglón. */
  protected onKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = this.items()[this.indexOf(this.selected()) + step];
    if (next) {
      this.go(next.value, true);
    }
  }
}
