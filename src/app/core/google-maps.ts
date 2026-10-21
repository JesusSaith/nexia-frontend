import { GOOGLE_MAPS_KEY } from '@core/config/google-maps';

let loading: Promise<void> | null = null;

/**
 * Carga el script de Google Maps una sola vez y devuelve la librería pedida
 * ('maps', 'marker', 'places'). Solo se usa en Configuración.
 */
export async function googleLibrary<T>(name: string): Promise<T> {
  loading ??= new Promise<void>((resolve, reject) => {
    if ('google' in window) {
      resolve();
      return;
    }
    const callback = '__nexiaMapsReady';
    (window as unknown as Record<string, () => void>)[callback] = () => resolve();
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: GOOGLE_MAPS_KEY, v: 'weekly', language: 'es', region: 'MX', loading: 'async', callback });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('No cargó Google Maps'));
    };
    document.head.appendChild(script);
  });
  await loading;
  return (await google.maps.importLibrary(name)) as T;
}
