/** Lo último que reservó esta persona en un negocio (se guarda solo en su navegador). */
export interface LastBooking {
  service_id: number;
  staff_id: number | null;
  service_name: string;
  staff_name: string | null;
}

export const LAST_BOOKING_KEY = 'nexia-last-booking';

type Store = Record<string, LastBooking>;

function read(raw: string | null): Store {
  try {
    const parsed = JSON.parse(raw ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function lastBookingFor(raw: string | null, slug: string): LastBooking | null {
  const row = read(raw)[slug];
  return row && typeof row.service_id === 'number' && typeof row.service_name === 'string' ? row : null;
}

export function withLastBooking(raw: string | null, slug: string, booking: LastBooking): string {
  return JSON.stringify({ ...read(raw), [slug]: booking });
}

/**
 * ¿Se puede repetir? Solo si el servicio sigue activo y es el mismo de la última vez; el servicio con opciones se deja
 * a mano porque hay que elegir la opción otra vez.
 */
export function repeatable<T extends { id: number; variants?: unknown[] | null }>(last: LastBooking | null, services: readonly T[]): T | null {
  if (!last) return null;
  const service = services.find((item) => item.id === last.service_id);
  return service && !(service.variants ?? []).length ? service : null;
}
