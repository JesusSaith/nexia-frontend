import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Control segmentado (.seg): la píldora blanca de la opción activa se desliza a la nueva opción.
 * Se activa solo con poner class="seg" (hay que importar esta directiva en el componente).
 * Sin JavaScript o sin opción activa, la opción activa se pinta por CSS como antes (ver styles.css).
 */
@Directive({ selector: '.seg' })
export class SegmentedDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private thumb: HTMLElement | null = null;
  private mutations: MutationObserver | null = null;
  private sizes: ResizeObserver | null = null;
  private frame = 0;

  ngAfterViewInit(): void {
    this.thumb = document.createElement('span');
    this.thumb.className = 'seg-thumb';
    this.thumb.setAttribute('aria-hidden', 'true');
    this.host.prepend(this.thumb);
    this.place(false);
    // Los botones se pintan o cambian de clase con @for y [class.is-on]: se observa el cambio en vez de enganchar cada clic.
    this.mutations = new MutationObserver(() => this.queue());
    this.mutations.observe(this.host, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    if (typeof ResizeObserver === 'function') {
      this.sizes = new ResizeObserver(() => this.queue());
      this.sizes.observe(this.host);
    }
  }

  ngOnDestroy(): void {
    this.mutations?.disconnect();
    this.sizes?.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private queue(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.place(true));
  }

  private place(animate: boolean): void {
    const thumb = this.thumb;
    if (!thumb) {
      return;
    }
    const on = this.host.querySelector<HTMLElement>(':scope > button.is-on');
    if (!on || on.offsetWidth === 0) {
      this.host.classList.remove('seg-js');
      return;
    }
    thumb.style.transition = animate ? '' : 'none';
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.height = `${on.offsetHeight}px`;
    thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    this.host.classList.add('seg-js');
    if (!animate) {
      // Sin transición en el primer acomodo; se reactiva en el siguiente cuadro.
      requestAnimationFrame(() => (thumb.style.transition = ''));
    }
  }
}
