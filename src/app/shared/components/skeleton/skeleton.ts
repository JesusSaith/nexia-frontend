import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Esqueleto de carga: barras grises que parpadean mientras llegan los datos.
 * Con "reducir movimiento" no parpadean (styles.css) y se quedan como barras fijas.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="animate-pulse" role="status" aria-label="Cargando" [class]="kind() === 'grid' ? 'grid grid-cols-7 gap-2' : 'space-y-3'">
      @if (kind() === 'grid') {
        @for (cell of cells(); track $index) {
          <div class="h-16 rounded-lg bg-line"></div>
        }
      } @else {
        @for (row of cells(); track $index) {
          <div class="flex items-center gap-3">
            <div class="h-11 w-11 shrink-0 rounded-full bg-line"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-2/3 rounded bg-line"></div>
              <div class="h-3 w-1/3 rounded bg-line"></div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class Skeleton {
  readonly kind = input<'list' | 'grid'>('list');
  readonly rows = input(6);

  protected cells(): number[] {
    const count = this.kind() === 'grid' ? this.rows() * 7 : this.rows();
    return Array.from({ length: count }, (_, index) => index);
  }
}
