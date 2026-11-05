import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Cuenta de un número a otro cuando el elemento entra en pantalla (por ejemplo de 12 a 0).
 * Sin "movimiento" o sin IntersectionObserver deja directo el número final.
 * Uso: <span countUp [countFrom]="0" [countTo]="24">24</span>
 */
@Directive({ selector: '[countUp]' })
export class CountUpDirective implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;
  private frame = 0;

  readonly countFrom = input(0);
  readonly countTo = input(0);

  ngOnInit(): void {
    const el = this.host.nativeElement;
    const to = this.countTo();
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || typeof IntersectionObserver === 'undefined') {
      el.textContent = String(to);
      return;
    }
    el.textContent = String(this.countFrom());
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.observer?.disconnect();
        this.run(el);
      }
    }, { threshold: 0.4 });
    this.observer.observe(el);
  }

  private run(el: HTMLElement): void {
    const from = this.countFrom();
    const to = this.countTo();
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / 1100, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
