import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Inclina suave un elemento hacia donde se mueve el mouse (solo con mouse y sin "reducir movimiento").
 * Uso: <div tilt>
 */
@Directive({
  selector: '[tilt]',
  host: { '(pointermove)': 'move($event)', '(pointerleave)': 'reset()' },
})
export class TiltDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly enabled =
    typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    if (this.enabled) {
      this.host.nativeElement.style.transition = 'transform .15s ease-out';
    }
  }

  move(event: PointerEvent): void {
    if (!this.enabled || event.pointerType !== 'mouse') {
      return;
    }
    const el = this.host.nativeElement;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg)`;
  }

  reset(): void {
    this.host.nativeElement.style.transform = '';
  }
}
