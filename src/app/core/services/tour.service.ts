import { Injectable, signal } from '@angular/core';

import { tourStorageKey } from '../tour';

/** Permite repetir un recorrido (por ejemplo desde la Ayuda): borra la marca de "ya lo vio" y avisa a la pantalla. */
@Injectable({ providedIn: 'root' })
export class TourService {
  /** Sube cada vez que se pide repetir un recorrido. */
  readonly replayed = signal<{ id: string; n: number }>({ id: '', n: 0 });

  replay(id: string): void {
    try {
      localStorage.removeItem(tourStorageKey(id));
    } catch {
      // Sin almacenamiento igual se puede repetir en esta visita.
    }
    this.replayed.update((current) => ({ id, n: current.n + 1 }));
  }
}
