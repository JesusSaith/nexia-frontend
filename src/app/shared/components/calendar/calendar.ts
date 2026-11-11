import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, input, output, signal, viewChild, AfterViewInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** "2026-11-10" desde un Date local (sin pasar por UTC). */
function toIso(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/**
 * Calendario del panel: lista de meses a la izquierda, mes con sus días a la derecha y "Hoy".
 * `mode="single"` elige un día (emite `picked`); `mode="range"` elige primero el inicio y luego el final
 * (emite `rangePicked` ya ordenado). Lo usan `app-date-field` y `app-date-range-field`.
 */
@Component({
  selector: 'app-calendar',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-[22rem] max-w-full overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[var(--elev-3)]" (click)="$event.stopPropagation()">
      <div class="relative w-[4.5rem] shrink-0 border-r border-line bg-canvas">
        <div #rail class="absolute inset-0 overflow-y-auto py-1" role="listbox" aria-label="Mes">
          @for (month of months; track month.index) {
            <button
              type="button"
              role="option"
              class="flex min-h-11 w-full items-center justify-center text-sm"
              [class.font-semibold]="month.index === cursor().getMonth()"
              [class.bg-surface]="month.index === cursor().getMonth()"
              [class.text-ink]="month.index === cursor().getMonth()"
              [class.text-muted]="month.index !== cursor().getMonth()"
              [attr.aria-selected]="month.index === cursor().getMonth()"
              [attr.data-on]="month.index === cursor().getMonth() ? '1' : null"
              (click)="goMonth(month.index)"
            >{{ month.label }}</button>
          }
        </div>
      </div>
      <div class="min-w-0 flex-1 p-3">
        <div class="mb-1 flex items-center justify-between gap-1">
          <p class="min-w-0 truncate text-sm font-semibold capitalize text-accent">{{ monthName() }}</p>
          <div class="flex items-center gap-1">
            <select class="h-11 rounded-lg border border-line bg-surface px-1.5 text-sm font-medium text-ink" aria-label="Año" (change)="goYear($any($event.target).value)">
              @for (year of years(); track year) { <option [value]="year" [selected]="year === cursor().getFullYear()">{{ year }}</option> }
            </select>
            <button type="button" class="h-11 rounded-lg px-2 text-sm font-medium text-ink-soft hover:text-ink" (click)="goToday()">Hoy</button>
          </div>
        </div>
        <div class="grid grid-cols-7 text-center text-xs text-muted">
          @for (label of labels; track label) { <span class="py-1">{{ label }}</span> }
        </div>
        <div class="grid grid-cols-7" (mouseleave)="hover.set(null)">
          @for (cell of cells(); track cell.iso) {
            @if (cell.inMonth) {
              <button
                type="button"
                class="relative flex h-11 flex-col items-center justify-center text-sm disabled:text-line-strong"
                [class.rounded-lg]="cell.single || cell.edge === 'both'"
                [class.rounded-l-lg]="cell.edge === 'start'"
                [class.rounded-r-lg]="cell.edge === 'end'"
                [class.bg-accent]="cell.single || cell.edge !== null"
                [class.text-white]="cell.single || cell.edge !== null"
                [class.bg-accent-soft]="cell.between"
                [class.font-semibold]="cell.today"
                [class.ring-1]="cell.today && !cell.single && cell.edge === null"
                [class.ring-inset]="cell.today"
                [class.ring-accent]="cell.today"
                [disabled]="cell.blocked"
                [attr.aria-pressed]="cell.single || cell.edge !== null || cell.between"
                [attr.aria-current]="cell.today ? 'date' : null"
                (click)="pick(cell.iso)"
                (mouseenter)="hover.set(cell.iso)"
              >
                {{ cell.day }}
                @if (cell.marked) { <span class="absolute bottom-1 h-1 w-1 rounded-full" [style.background]="cell.single || cell.edge !== null ? '#fff' : 'var(--nx-ok-fg)'"></span> }
              </button>
            } @else {
              <span class="h-11" aria-hidden="true"></span>
            }
          }
        </div>
        @if (mode() === 'range') {
          <p class="mt-2 min-h-5 text-xs text-muted" aria-live="polite">{{ hint() }}</p>
        }
      </div>
    </div>
  `,
})
export class CalendarComponent implements OnInit, AfterViewInit {
  readonly mode = input<'single' | 'range'>('single');
  /** Día elegido (single) o inicio del rango (range), "YYYY-MM-DD". */
  readonly start = input<string | null>(null);
  readonly end = input<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  /** Si viene, solo se pueden elegir los días que devuelva true (y se marcan con un punto). */
  readonly allow = input<((iso: string) => boolean) | null>(null);
  readonly picked = output<string>();
  readonly rangePicked = output<{ start: string; end: string }>();

  protected readonly labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  protected readonly months = Array.from({ length: 12 }, (_, index) => ({
    index,
    label: new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(new Date(2026, index, 1)).replace('.', ''),
  }));
  private readonly monthFormat = new Intl.DateTimeFormat('es-MX', { month: 'long' });
  private readonly rail = viewChild.required<ElementRef<HTMLElement>>('rail');
  protected readonly cursor = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  /** Primer día del rango ya tocado, mientras falta el último. */
  protected readonly pending = signal<string | null>(null);
  protected readonly hover = signal<string | null>(null);
  private readonly todayIso = toIso(new Date());

  protected readonly monthName = computed(() => this.monthFormat.format(this.cursor()));
  protected readonly years = computed(() => {
    const now = new Date().getFullYear();
    const from = Math.min(this.min() ? +this.min()!.slice(0, 4) : now - 100, this.cursor().getFullYear());
    const to = Math.max(this.max() ? +this.max()!.slice(0, 4) : now + 5, this.cursor().getFullYear());
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  });
  protected readonly hint = computed(() => {
    const pending = this.pending();
    if (pending) {
      return `Desde el ${this.short(pending)}. Elige el último día.`;
    }
    const start = this.start();
    const end = this.end();
    return start && end ? `${this.short(start)} al ${this.short(end)}` : 'Elige el primer día.';
  });
  protected readonly cells = computed(() => {
    const cursor = this.cursor();
    const offset = (cursor.getDay() + 6) % 7;
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    const [from, to] = this.band();
    const range = this.mode() === 'range';
    const allow = this.allow();
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      const iso = toIso(day);
      const inMonth = day.getMonth() === cursor.getMonth();
      const blocked = this.isBlocked(iso);
      const edge = range && from && to ? (iso === from && iso === to ? 'both' : iso === from ? 'start' : iso === to ? 'end' : null) : null;
      return {
        iso,
        day: day.getDate(),
        inMonth,
        blocked,
        edge,
        between: range && !!from && !!to && iso > from && iso < to,
        single: !range && iso === this.start(),
        today: iso === this.todayIso,
        marked: !!allow && !blocked,
      };
    });
  });

  ngOnInit(): void {
    const seed = this.start() || this.end();
    const day = seed ? new Date(`${seed.slice(0, 10)}T12:00:00`) : new Date();
    this.cursor.set(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  ngAfterViewInit(): void {
    this.centerMonth();
  }

  /** Inicio y fin del tramo pintado: lo elegido, o lo que se va eligiendo con el puntero encima. */
  private band(): [string | null, string | null] {
    const pending = this.pending();
    if (pending) {
      const other = this.hover() ?? pending;
      return pending <= other ? [pending, other] : [other, pending];
    }
    const start = this.start();
    const end = this.end();
    return start && end ? [start, end] : [start, start];
  }

  private isBlocked(iso: string): boolean {
    const min = this.min();
    const max = this.max();
    if ((min && iso < min) || (max && iso > max)) {
      return true;
    }
    const allow = this.allow();
    return allow ? !allow(iso) : false;
  }

  private short(iso: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace('.', '');
  }

  private centerMonth(): void {
    // El mes activo queda a la vista dentro de la lista de la izquierda.
    setTimeout(() => {
      const rail = this.rail().nativeElement;
      const on = rail.querySelector<HTMLElement>('[data-on]');
      if (on) {
        rail.scrollTop = on.offsetTop - rail.clientHeight / 2 + on.offsetHeight / 2;
      }
    });
  }

  protected goMonth(index: number): void {
    this.cursor.set(new Date(this.cursor().getFullYear(), index, 1));
  }

  protected goYear(value: string): void {
    this.cursor.set(new Date(+value, this.cursor().getMonth(), 1));
  }

  protected goToday(): void {
    const now = new Date();
    this.cursor.set(new Date(now.getFullYear(), now.getMonth(), 1));
    this.centerMonth();
  }

  protected pick(iso: string): void {
    if (this.mode() === 'single') {
      this.picked.emit(iso);
      return;
    }
    const pending = this.pending();
    if (!pending) {
      this.pending.set(iso);
      return;
    }
    this.pending.set(null);
    this.hover.set(null);
    this.rangePicked.emit(pending <= iso ? { start: pending, end: iso } : { start: iso, end: pending });
  }
}
