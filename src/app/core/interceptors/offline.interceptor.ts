import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';

import { ConnectionService } from '../services/connection.service';

export const OFFLINE_MESSAGE = 'Sin conexión: no se guardó nada. Vuelve a intentarlo cuando tengas internet.';

/**
 * Sin internet, lo que modifica datos (guardar, cobrar, cancelar…) no sale: responde de inmediato con un mensaje claro
 * en el mismo formato que los errores del servidor (`error.detail`), para que cada pantalla lo muestre donde ya muestra sus errores.
 * Las lecturas (GET) siguen su camino: el navegador o el service worker las resuelven.
 */
export const offlineInterceptor: HttpInterceptorFn = (request, next) => {
  const connection = inject(ConnectionService);
  if (request.method !== 'GET' && !connection.online()) {
    return throwError(
      () => new HttpErrorResponse({ status: 0, url: request.url, statusText: 'Offline', error: { detail: OFFLINE_MESSAGE } }),
    );
  }
  return next(request);
};
