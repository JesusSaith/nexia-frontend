import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { titleWithCount } from '../tab-title';

/** Avisos sin ver en la pestaña ("(3) Inicio · Nexia") y en el ícono de la app instalada (Badging API, donde existe). */
@Injectable({ providedIn: 'root' })
export class TabAlerts {
  private readonly title = inject(Title);
  readonly count = signal(0);
  /** El título de la pantalla, sin número; lo pone la estrategia de títulos del router. */
  private base = '';

  constructor() {
    effect(() => {
      const count = this.count();
      this.apply(count);
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      try {
        if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
        else void nav.clearAppBadge?.()?.catch(() => undefined);
      } catch {
        // Sin soporte: solo cambia el título.
      }
    });
  }

  setBase(title: string): void {
    this.base = title;
    this.apply(this.count());
  }

  private apply(count: number): void {
    if (this.base) this.title.setTitle(titleWithCount(this.base, count));
  }
}
