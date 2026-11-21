import { Observable } from 'rxjs';

/**
 * Aviso para volver a consultar datos "casi en vivo" sin gastar de más.
 * Emite cada `ms` milisegundos solo con la pestaña a la vista, y de inmediato cuando la persona regresa a la
 * pestaña o recupera el internet (sin esperar el siguiente ciclo). Con `immediate` también emite al suscribirse.
 */
export function liveTick(ms: number, immediate = false): Observable<void> {
  return new Observable<void>((subscriber) => {
    const visible = (): boolean => typeof document === 'undefined' || !document.hidden;
    const fire = (): void => subscriber.next();
    const onVisible = (): void => {
      if (visible()) {
        fire();
      }
    };
    if (immediate) {
      fire();
    }
    const timer = setInterval(() => {
      if (visible()) {
        fire();
      }
    }, ms);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', fire);
    }
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', fire);
      }
    };
  });
}
