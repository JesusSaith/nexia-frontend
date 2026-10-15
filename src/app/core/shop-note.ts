export interface ShopNote {
  pause: boolean;
  from: string;
  to: string;
  photos: string[];
  promo: string;
  until: string;
}

/** Pausa, cierre, fotos y promoción con la forma que usa la página de reservas (columnas del negocio). */
export function noteOf(brand: {
  bookings_paused?: boolean;
  closed_from?: string | null;
  closed_to?: string | null;
  promo_text?: string | null;
  promo_until?: string | null;
  gallery?: string[];
} | null | undefined): ShopNote {
  return {
    pause: Boolean(brand?.bookings_paused),
    from: brand?.closed_from ?? '',
    to: brand?.closed_to ?? '',
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

export function dateClosed(day: string, note: ShopNote): boolean {
  return Boolean(note.from && note.to && day >= note.from && day <= note.to);
}

export function closedSpan(note: ShopNote): string {
  if (!note.from || !note.to) {
    return '';
  }
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };
  return `${fmt(note.from)} al ${fmt(note.to)}`;
}
