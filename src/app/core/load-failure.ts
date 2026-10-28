import { HttpErrorResponse } from '@angular/common/http';

export interface LoadFailure {
  kind: 'missing' | 'network' | 'other';
  title: string;
  message: string;
}

/** Qué le decimos a quien reserva cuando no cargó la página del negocio, según lo que falló. */
export function loadFailure(error: unknown): LoadFailure {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { kind: 'network', title: 'Sin conexión', message: 'Revisa tu internet y vuelve a intentarlo.' };
    }
    if (error.status === 404) {
      return missing();
    }
  }
  return { kind: 'other', title: 'Algo salió mal de nuestro lado', message: 'Intenta de nuevo en unos minutos.' };
}

/** Enlace sin negocio o con un negocio que no existe. */
export function missing(): LoadFailure {
  return {
    kind: 'missing',
    title: 'No encontramos este negocio',
    message: 'Revisa que el enlace esté completo o pídele uno nuevo al negocio.',
  };
}
