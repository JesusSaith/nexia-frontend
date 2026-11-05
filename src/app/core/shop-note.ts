import { Closure } from './models/business.model';

export interface ShopNote {
  pause: boolean;
  closures: Closure[];
  photos: string[];
  promo: string;
  until: string;
}

/** Pausa, cierre, fotos y promoción con la forma que usa la página de reservas (columnas del negocio). */
export function noteOf(brand: {
  bookings_paused?: boolean;
  closures?: Closure[];
  promo_text?: string | null;
  promo_until?: string | null;
  gallery?: string[];
} | null | undefined): ShopNote {
  return {
    pause: Boolean(brand?.bookings_paused),
    closures: brand?.closures ?? [],
    photos: (brand?.gallery ?? []).slice(0, 3),
    promo: brand?.promo_text ?? '',
    until: brand?.promo_until ?? '',
  };
}

export function liveOffer(note: ShopNote, today: string): string {
  const text = note.promo.trim();
  if (!text || (note.until && today > note.until)) {
    return '';
  }
  return text;
}

/** Lunes = 0 … domingo = 6, como en el servidor (el `getDay()` de JavaScript empieza en domingo). */
export const WEEKDAYS = [
  { index: 0, short: 'L', long: 'Lunes', plural: 'lunes' },
  { index: 1, short: 'M', long: 'Martes', plural: 'martes' },
  { index: 2, short: 'M', long: 'Miércoles', plural: 'miércoles' },
  { index: 3, short: 'J', long: 'Jueves', plural: 'jueves' },
  { index: 4, short: 'V', long: 'Viernes', plural: 'viernes' },
  { index: 5, short: 'S', long: 'Sábado', plural: 'sábados' },
  { index: 6, short: 'D', long: 'Domingo', plural: 'domingos' },
] as const;

/** Día de la semana de una fecha "2026-12-24" con lunes = 0. */
export function weekdayOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/** Si ese día cae en la lista de días de la semana; lista vacía o ausente = todos. */
export function weekdayHit(days: readonly number[] | string | null | undefined, iso: string): boolean {
  const list = typeof days === 'string' ? days.split(',').filter(Boolean).map(Number) : (days ?? []);
  return !list.length || list.includes(weekdayOf(iso));
}

/** "los domingos", "los sábados y domingos", "lunes, martes y viernes"; '' si son todos. */
export function weekdaysText(days: readonly number[] | string | null | undefined): string {
  const list = typeof days === 'string' ? days.split(',').filter(Boolean).map(Number) : [...(days ?? [])];
  const names = WEEKDAYS.filter((item) => list.includes(item.index)).map((item) => item.plural);
  if (!names.length) {
    return '';
  }
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
  return `solo ${joined}`;
}

export function closureOn(day: string, note: ShopNote): Closure | null {
  return note.closures.find((row) => day >= row.from && day <= row.to && weekdayHit(row.days, day)) ?? null;
}

export function dateClosed(day: string, note: ShopNote): boolean {
  return closureOn(day, note) !== null;
}

/** El próximo cierre que aún no termina (para el aviso de arriba), o null. */
export function nextClosure(note: ShopNote, today: string): Closure | null {
  return note.closures.find((row) => row.to >= today) ?? null;
}

/** "24 dic" o "20 oct al 27 oct" (y "solo domingos" si no cierra todos los días del periodo). */
export function closureSpan(row: Closure | null): string {
  if (!row) {
    return '';
  }
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };
  const span = row.from === row.to ? fmt(row.from) : `${fmt(row.from)} al ${fmt(row.to)}`;
  const only = row.from === row.to ? '' : weekdaysText(row.days);
  return only ? `${span}, ${only}` : span;
}
