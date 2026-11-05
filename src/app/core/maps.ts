import { GOOGLE_MAPS_KEY } from '@core/config/google-maps';

/**
 * Mapas y enlaces: la dueña marca el punto (latitud y longitud) en Configuración y el cliente lo ve
 * en la página de reservas y en la de su cita. Sin punto se usa la dirección escrita. Con llave de
 * Google (`GOOGLE_MAPS_KEY`) se usan los mapas de Google; sin ella, OpenStreetMap.
 */
export interface Place {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Mapa de Google incrustado ("Insertar un mapa"): si viene, se muestra en lugar del mapa fijo. */
  map_embed?: string | null;
}

/** Centro de México, para abrir el mapa cuando aún no hay punto. */
export const MEXICO_CENTER = { lat: 23.6345, lng: -102.5528, zoom: 5 };

export function hasPoint(place: Place | null | undefined): boolean {
  return place?.latitude != null && place?.longitude != null;
}

function target(place: Place): string {
  return hasPoint(place) ? `${place.latitude},${place.longitude}` : (place.address ?? '').trim();
}

/** Hay algo con qué llegar: punto en el mapa o al menos la dirección. */
export function canNavigate(place: Place | null | undefined): boolean {
  return !!place && !!target(place);
}

/** Abre la ruta en Google Maps (la app en el celular, si la tiene). */
export function googleMapsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target(place))}`;
}

export function wazeUrl(place: Place): string {
  return hasPoint(place)
    ? `https://waze.com/ul?ll=${encodeURIComponent(target(place))}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(target(place))}&navigate=yes`;
}

/**
 * Mapa fijo de Google (Maps Static API): una sola imagen, rápida en celular, con los datos de Google.
 * Sin llave devuelve null y se usa el de OpenStreetMap (`staticMap`).
 */
export function googleStaticMapUrl(place: Place, color?: string | null): string | null {
  if (!GOOGLE_MAPS_KEY || !hasPoint(place)) {
    return null;
  }
  const point = `${place.latitude},${place.longitude}`;
  const pin = /^#[0-9a-f]{6}$/i.test(color ?? '') ? `color:0x${color!.slice(1)}|` : '';
  const params = new URLSearchParams({ center: point, zoom: '16', size: '640x320', scale: '2', language: 'es', region: 'MX', markers: `${pin}${point}`, key: GOOGLE_MAPS_KEY });
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

/**
 * Mosaicos del mapa (OpenStreetMap: gratis, sin llave, con atribución obligatoria). Si algún día hay
 * mucho tráfico, se cambia por un proveedor con llave (MapTiler, Stadia) solo aquí.
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const TILE = 256;

export interface StaticMap {
  /** Cada mosaico con su posición dentro del bloque (px). */
  tiles: { src: string; left: number; top: number }[];
  /** Dónde cae el punto dentro del bloque (px): el bloque se corre para dejarlo al centro. */
  x: number;
  y: number;
}

/**
 * Mapa fijo sin librería: 5 × 3 mosaicos alrededor del punto (unos 100 KB de imágenes). Cubre
 * cualquier caja de hasta 1024 × 512 px con el punto al centro. Sin punto, no hay mapa: una
 * dirección suelta puede caer en otra ciudad.
 */
export function staticMap(place: Place, zoom = 16): StaticMap | null {
  if (!hasPoint(place)) {
    return null;
  }
  const n = 2 ** zoom;
  const lat = (place.latitude! * Math.PI) / 180;
  const fx = ((place.longitude! + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const tiles: StaticMap['tiles'] = [];
  for (let row = -1; row <= 1; row++) {
    for (let col = -2; col <= 2; col++) {
      const x = (((cx + col) % n) + n) % n;
      const y = cy + row;
      if (y >= 0 && y < n) {
        tiles.push({ src: TILE_URL.replace('{z}', `${zoom}`).replace('{x}', `${x}`).replace('{y}', `${y}`), left: (col + 2) * TILE, top: (row + 1) * TILE });
      }
    }
  }
  return { tiles, x: 2 * TILE + (fx - cx) * TILE, y: TILE + (fy - cy) * TILE };
}

/** Lee el punto de un enlace largo de Google Maps (…/@19.43,-99.13,17z, ?q=19.43,-99.13 o !3d19.43!4d-99.13). */
export function pointFromLink(link: string): { lat: number; lng: number } | null {
  const patterns = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/];
  for (const pattern of patterns) {
    const match = decodeURIComponent(link).match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

/** Redondea a 6 decimales (unos 10 cm): suficiente y evita cambios "sin guardar" por ruido. */
export function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
