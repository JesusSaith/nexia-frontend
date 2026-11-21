import { Injectable, signal } from '@angular/core';

/**
 * Aviso entre pantallas del panel: cuando llega algo nuevo (una reserva, una cancelación), quien lo detecta
 * llama `bump()` y la Agenda vuelve a cargar al instante en lugar de esperar su siguiente consulta.
 */
@Injectable({ providedIn: 'root' })
export class LiveSyncService {
  readonly version = signal(0);

  bump(): void {
    this.version.update((value) => value + 1);
  }
}
