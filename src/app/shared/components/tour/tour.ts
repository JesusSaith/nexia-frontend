import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { TourService } from '@core/services/tour.service';
import { TourStep, nextTourStep, tourStorageKey } from '@core/tour';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Globos de primera vez. Se muestra solo una vez por navegador (o cuando se pide repetir desde la Ayuda) y no bloquea la pantalla:
 * resalta el elemento con `data-tour="…"` y explica en una tarjeta, arriba o abajo según dónde esté.
 */
@Component({
  selector: 'app-tour',
  imports: [MatIconModule],
  template: `
    @if (step(); as current) {
      @if (box(); as rect) {
        <div class="pointer-events-none fixed z-40 rounded-xl" aria-hidden="true"
          [style.top.px]="rect.top - 6" [style.left.px]="rect.left - 6" [style.width.px]="rect.width + 12" [style.height.px]="rect.height + 12"
          style="box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.45), 0 0 0 3px var(--primary)"></div>
      }
      <div
        class="fixed inset-x-3 z-50 mx-auto max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-[0_18px_50px_rgba(30,27,30,0.3)] md:inset-x-auto md:right-6 md:mx-0"
        [class.top-16]="onTop()"
        [class.bottom-20]="!onTop()"
        [class.md:bottom-6]="!onTop()"
        role="dialog"
        aria-label="Recorrido"
      >
        <p class="nums text-xs font-semibold uppercase tracking-wide text-muted">{{ index() + 1 }} de {{ steps().length }}</p>
        <h2 class="mt-1 text-base font-semibold text-ink">{{ current.title }}</h2>
        <p class="mt-1 text-sm text-ink-soft">{{ current.text }}</p>
        <div class="mt-3 flex items-center justify-between gap-2">
          <button type="button" class="btn btn-ghost" (click)="finish()">Saltar</button>
          <button type="button" class="btn btn-primary" (click)="next()">{{ last() ? 'Entendido' : 'Siguiente' }}</button>
        </div>
      </div>
    }
  `,
})
export class TourComponent {
  readonly tourId = input.required<string>();
  readonly steps = input.required<TourStep[]>();
  private readonly tour = inject(TourService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly index = signal(0);
  protected readonly active = signal(false);
  protected readonly box = signal<Box | null>(null);
  protected readonly onTop = signal(false);
  protected readonly step = signal<TourStep | null>(null);
  protected readonly last = () => nextTourStep(this.index(), this.steps().length) === null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Primera vez: arranca solo, con un respiro para que la pantalla termine de cargar.
    this.timer = setTimeout(() => {
      if (!this.seen()) {
        this.start();
      }
    }, 1200);
    // Repetir desde la Ayuda.
    effect(() => {
      const request = this.tour.replayed();
      if (request.n > 0 && request.id === untracked(this.tourId)) {
        untracked(() => this.start());
      }
    });
    const refresh = () => this.locate();
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      if (this.timer) clearTimeout(this.timer);
    });
  }

  private seen(): boolean {
    try {
      return localStorage.getItem(tourStorageKey(this.tourId())) === '1';
    } catch {
      return true; // Sin almacenamiento no se repite en cada visita.
    }
  }

  private start(): void {
    this.index.set(0);
    this.active.set(true);
    this.show();
  }

  private show(): void {
    this.step.set(this.steps()[this.index()] ?? null);
    const element = this.find();
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Espera a que termine el desplazamiento para medir.
    setTimeout(() => this.locate(), element ? 350 : 0);
    this.locate();
  }

  private find(): HTMLElement | null {
    const current = this.steps()[this.index()];
    if (!current) return null;
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${current.target}"]`));
    return all.find((item) => item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0) ?? null;
  }

  private locate(): void {
    if (!this.active()) return;
    const rect = this.find()?.getBoundingClientRect();
    if (!rect) {
      this.box.set(null);
      this.onTop.set(false);
      return;
    }
    this.box.set({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    // La tarjeta se pone del lado contrario al elemento para no taparlo.
    this.onTop.set(rect.top > window.innerHeight / 2);
  }

  protected next(): void {
    const following = nextTourStep(this.index(), this.steps().length);
    if (following === null) {
      this.finish();
      return;
    }
    this.index.set(following);
    this.show();
  }

  protected finish(): void {
    try {
      localStorage.setItem(tourStorageKey(this.tourId()), '1');
    } catch {
      // Se mostrará de nuevo en otra visita.
    }
    this.active.set(false);
    this.step.set(null);
    this.box.set(null);
  }
}
