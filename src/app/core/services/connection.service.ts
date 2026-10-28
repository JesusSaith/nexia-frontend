import { Injectable, signal } from '@angular/core';

/** ¿Hay internet? Lo avisa el navegador (eventos online/offline); sirve para la franja "Sin conexión" y para no guardar a medias. */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }
}
