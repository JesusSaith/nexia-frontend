import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Pieza suelta de esqueleto, como el Skeleton de Kendo: `text` (renglón), `circle` (foto o ícono) o `rectangle` (tarjeta, gráfica).
 * `animation`: "wave" (brillo que pasa) o "pulse" (late); `false` la deja quieta. Con "reducir movimiento" no se anima.
 * Uso: <app-skeleton-shape shape="circle" width="2.75rem" /> · <app-skeleton-shape shape="text" width="60%" />
 */
@Component({
  selector: 'app-skeleton-shape',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'presentation', 'aria-hidden': 'true', '[class]': 'classes()', '[style.width]': 'boxWidth()', '[style.height]': 'boxHeight()' },
  template: '',
})
export class SkeletonShape {
  readonly shape = input<'text' | 'circle' | 'rectangle'>('text');
  readonly animation = input<'wave' | 'pulse' | false>('wave');
  readonly width = input<string | null>(null);
  readonly height = input<string | null>(null);

  protected readonly classes = computed(() => `skeleton skeleton-${this.shape()}${this.animation() === 'pulse' ? ' skeleton-pulse' : this.animation() === false ? ' skeleton-still' : ''}`);
  protected readonly boxWidth = computed(() => this.width() ?? (this.shape() === 'circle' ? '2.75rem' : '100%'));
  protected readonly boxHeight = computed(() => this.height() ?? (this.shape() === 'circle' ? this.boxWidth() : this.shape() === 'text' ? '0.875rem' : '6rem'));
}
