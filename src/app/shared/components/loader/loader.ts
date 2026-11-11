import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Indicador de carga del panel, con los mismos tres estilos del Loader de Kendo:
 * `pulsing` (tres puntos que laten), `spinner` (arco que gira) y `converging` (dos arcos que se juntan).
 * Toma el color de la marca; con `class="text-..."` en el host se cambia. Con "reducir movimiento" se queda quieto.
 * Uso: <app-loader type="spinner" size="sm" label="Guardando" />
 */
@Component({
  selector: 'app-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', '[attr.aria-label]': 'label()', '[class]': 'sizeClass()' },
  template: `
    @switch (type()) {
      @case ('pulsing') {
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
      }
      @case ('converging') {
        <span class="ring converge" aria-hidden="true"><i></i><i></i></span>
      }
      @default {
        <span class="ring spin" aria-hidden="true"><i></i></span>
      }
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; color: var(--color-accent); --s: 1.5rem; }
    :host(.sm) { --s: 1.125rem; }
    :host(.lg) { --s: 2.25rem; }
    .ring { position: relative; display: block; width: var(--s); height: var(--s); }
    .ring i { position: absolute; inset: 0; border-radius: 50%; border: calc(var(--s) / 9) solid transparent; border-top-color: currentColor; }
    .spin i { animation: nx-spin 0.8s linear infinite; }
    .ring::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: calc(var(--s) / 9) solid color-mix(in srgb, currentColor 18%, transparent); }
    .converge i:nth-child(1) { animation: nx-converge-a 1.1s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
    .converge i:nth-child(2) { animation: nx-converge-b 1.1s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-top-color: transparent; border-bottom-color: currentColor; }
    .dots { display: inline-flex; align-items: center; gap: calc(var(--s) / 6); height: var(--s); }
    .dots i { width: calc(var(--s) / 4); height: calc(var(--s) / 4); border-radius: 50%; background: currentColor; animation: nx-dot 1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes nx-spin { to { transform: rotate(360deg); } }
    @keyframes nx-converge-a { 0% { transform: rotate(0); } 50% { transform: rotate(180deg) scale(0.7); } 100% { transform: rotate(360deg); } }
    @keyframes nx-converge-b { 0% { transform: rotate(0) scale(0.7); } 50% { transform: rotate(-180deg); } 100% { transform: rotate(-360deg) scale(0.7); } }
    @keyframes nx-dot { 0%, 80%, 100% { transform: scale(0.55); opacity: 0.45; } 40% { transform: scale(1); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .spin i, .converge i, .dots i { animation: none; } .dots i { opacity: 0.8; } }
  `,
})
export class Loader {
  readonly type = input<'pulsing' | 'spinner' | 'converging'>('spinner');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly label = input('Cargando');
  protected readonly sizeClass = computed(() => this.size());
}
