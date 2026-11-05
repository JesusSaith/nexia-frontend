import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Hace que un elemento aparezca suave (sube y se aclara) cuando entra en pantalla.
 * Las clases `rv` y `rv-in` viven en styles.css y se apagan con "reducir movimiento".
 * Uso: <div reveal [revealDelay]="0.1">
 */
@Directive({ selector: '[reveal]' })
export class RevealDirective implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  /** Segundos de espera antes de aparecer, para escalonar tarjetas hermanas. */
  readonly revealDelay = input(0);

  ngOnInit(): void {
    const el = this.host.nativeElement;
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    el.classList.add('rv');
    el.style.setProperty('--d', `${this.revealDelay()}s`);
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.classList.add('rv-in');
          this.observer?.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
