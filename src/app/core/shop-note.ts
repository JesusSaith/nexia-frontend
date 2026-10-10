export interface ShopNote {
  pause: boolean;
  from: string;
  to: string;
  photos: string[];
  promo: string;
  until: string;
}

const MARK = '\n#nx';
const EMPTY: ShopNote = { pause: false, from: '', to: '', photos: [], promo: '', until: '' };

export function splitNote(raw: string | null | undefined): { text: string; note: ShopNote } {
  const source = raw ?? '';
  const cut = source.indexOf(MARK);
  const text = (cut === -1 ? source : source.slice(0, cut)).trim();
  if (cut === -1) {
    return { text, note: EMPTY };
  }
  try {
    const parsed = JSON.parse(source.slice(cut + MARK.length)) as Partial<ShopNote> & { pause?: number };
    const photos = Array.isArray(parsed.photos) ? parsed.photos.filter((item) => typeof item === 'string').slice(0, 3) : [];
    return {
      text,
      note: {
        pause: Boolean(parsed.pause),
        from: typeof parsed.from === 'string' ? parsed.from : '',
        to: typeof parsed.to === 'string' ? parsed.to : '',
        photos,
        promo: typeof parsed.promo === 'string' ? parsed.promo.slice(0, 80) : '',
        until: typeof parsed.until === 'string' ? parsed.until : '',
      },
    };
  } catch {
    return { text, note: EMPTY };
  }
}

export function joinNote(text: string, note: ShopNote): string {
  const base = text.trim();
  if (!note.pause && !note.from && !note.to && note.photos.length === 0 && !note.promo && !note.until) {
    return base;
  }
  return `${base}${MARK}${JSON.stringify({ pause: note.pause ? 1 : 0, from: note.from, to: note.to, photos: note.photos, promo: note.promo, until: note.until })}`;
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
