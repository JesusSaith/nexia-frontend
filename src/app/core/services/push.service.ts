import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { keyToBytes } from '../push-key';

export type PushState = 'unavailable' | 'off' | 'on' | 'blocked';

/** Avisos al celular (Web Push): la dueña los activa por navegador; el servidor los manda con /api/push. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** Mientras no se sepa (o el servidor/navegador no lo permitan), no se ofrece. */
  readonly state = signal<PushState>('unavailable');
  readonly busy = signal(false);
  readonly available = computed(() => this.state() !== 'unavailable');

  /** El service worker solo se registra en producción y fuera de localhost (src/main.ts). */
  private supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    );
  }

  async init(): Promise<void> {
    if (!this.supported()) return;
    try {
      const { public_key } = await firstValueFrom(this.http.get<{ public_key: string | null }>(`${this.apiBaseUrl}/push/key`));
      if (!public_key) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (Notification.permission === 'denied') this.state.set('blocked');
      else this.state.set(subscription ? 'on' : 'off');
    } catch {
      this.state.set('unavailable');
    }
  }

  /** Pide permiso, se suscribe y le avisa al servidor. Devuelve un texto de error si algo falla. */
  async enable(): Promise<string | null> {
    this.busy.set(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.state.set(permission === 'denied' ? 'blocked' : 'off');
        return 'No diste permiso para mandarte avisos. Puedes cambiarlo en los ajustes del navegador.';
      }
      const { public_key } = await firstValueFrom(this.http.get<{ public_key: string | null }>(`${this.apiBaseUrl}/push/key`));
      if (!public_key) return 'Los avisos al celular aún no están disponibles.';
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(public_key) }));
      const json = subscription.toJSON();
      await firstValueFrom(this.http.post<void>(`${this.apiBaseUrl}/push/subscribe`, { endpoint: json.endpoint, keys: json.keys }));
      this.state.set('on');
      return null;
    } catch {
      return 'No pudimos activar los avisos. Intenta de nuevo.';
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<string | null> {
    this.busy.set(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await firstValueFrom(this.http.post<void>(`${this.apiBaseUrl}/push/unsubscribe`, { endpoint: subscription.endpoint }));
        await subscription.unsubscribe();
      }
      this.state.set('off');
      return null;
    } catch {
      return 'No pudimos apagar los avisos. Intenta de nuevo.';
    } finally {
      this.busy.set(false);
    }
  }
}
