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

export function closureOn(day: string, note: ShopNote): Closure | null {
  return note.closures.find((row) => day >= row.from && day <= row.to) ?? null;
}

export function dateClosed(day: string, note: ShopNote): boolean {
  return closureOn(day, note) !== null;
}

/** El próximo cierre que aún no termina (para el aviso de arriba), o null. */
export function nextClosure(note: ShopNote, today: string): Closure | null {
  return note.closures.find((row) => row.to >= today) ?? null;
}

/** "24 dic" o "20 oct al 27 oct". */
export function closureSpan(row: Closure | null): string {
  if (!row) {
    return '';
  }
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };
  return row.from === row.to ? fmt(row.from) : `${fmt(row.from)} al ${fmt(row.to)}`;
}
