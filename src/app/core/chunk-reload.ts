import { ErrorHandler, Injectable } from '@angular/core';

/** Lo que dice el navegador cuando una pantalla pide un archivo de una versión anterior que ya no existe. */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed/i;
const KEY = 'nexia.chunk-reload';
/** Si ya se recargó hace menos de esto, no se vuelve a recargar (así nunca se queda en un ciclo). */
const COOLDOWN_MS = 30_000;

export function isChunkError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : typeof error === 'string' ? error : '';
  const inner = (error as { rejection?: unknown } | null)?.rejection;
  return CHUNK_ERROR.test(text) || (inner !== undefined && inner !== error && isChunkError(inner));
}

/** ¿Toca recargar? Sí, salvo que ya se haya hecho hace poco. */
export function shouldReload(lastReload: number | null, now: number): boolean {
  return lastReload === null || Number.isNaN(lastReload) || now - lastReload > COOLDOWN_MS;
}

/**
 * Después de publicar una versión nueva, una pestaña que ya estaba abierta puede pedir una pantalla que ya no existe.
 * En vez de dejarla rota, se recarga sola una vez para tomar la versión nueva.
 */
@Injectable()
export class NexiaErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (isChunkError(error) && this.reload()) {
      return;
    }
    console.error(error);
  }

  private reload(): boolean {
    try {
      const last = Number(sessionStorage.getItem(KEY));
      if (!shouldReload(last || null, Date.now())) {
        return false;
      }
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento no hay forma de evitar un ciclo: mejor no recargar.
      return false;
    }
    location.reload();
    return true;
  }
}
