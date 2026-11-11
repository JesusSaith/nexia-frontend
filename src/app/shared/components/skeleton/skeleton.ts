import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Esqueleto de carga: siluetas con un brillo suave (`.skeleton`) mientras llegan los datos.
 * Con "reducir movimiento" no parpadean (styles.css) y se quedan como barras fijas.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status" aria-label="Cargando" [class]="kind() === 'grid' ? 'grid grid-cols-7 gap-2' : 'space-y-3'">
      @if (kind() === 'grid') {
        @for (cell of cells(); track $index) {
          <span class="skeleton h-16"></span>
        }
      } @else {
        @for (row of cells(); track $index) {
          <div class="flex items-center gap-3">
            <span class="skeleton skeleton-circle h-11 w-11 shrink-0"></span>
            <div class="grid min-w-0 flex-1 gap-2">
              <span class="skeleton skeleton-text h-4 w-2/3"></span>
              <span class="skeleton skeleton-text h-3 w-1/3"></span>
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
