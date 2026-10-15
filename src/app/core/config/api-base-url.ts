import { InjectionToken } from '@angular/core';

/**
 * Base URL of the Nexia REST API. Override this token per environment.
 * En local apunta al backend en :8000. Publicada (Vercel), usa /api del mismo dominio: vercel.json
 * reenvía esas rutas al backend, así las cookies de sesión son del mismo sitio y no hay CORS.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () =>
    typeof location === 'undefined' || ['localhost', '127.0.0.1'].includes(location.hostname)
      ? 'http://localhost:8000/api'
      : `${location.origin}/api`,
});
