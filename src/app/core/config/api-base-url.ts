import { InjectionToken } from '@angular/core';

/**
 * Base URL of the Nexia REST API. Override this token per environment.
 * - En local apunta al backend en :8001.
 * - Con dominio propio, la app vive en app.tudominio.com y la API en api.tudominio.com (detrás de
 *   Cloudflare). Son del mismo sitio, así que la cookie de sesión sigue funcionando.
 * - En cualquier otro dominio usa /api del mismo origen: solo sirve si algo reenvía esas rutas a la API
 *   (ya no hay vercel.json; en *.workers.dev no existe ese reenvío, así que ahí la app no puede iniciar sesión).
 */
export function apiBaseUrl(hostname: string, origin: string): string {
  if (['localhost', '127.0.0.1'].includes(hostname)) {
    return 'http://localhost:8001/api';
  }
  return hostname.startsWith('app.') ? `https://api.${hostname.slice(4)}/api` : `${origin}/api`;
}

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => (typeof location === 'undefined' ? 'http://localhost:8001/api' : apiBaseUrl(location.hostname, location.origin)),
});
