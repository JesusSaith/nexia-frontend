/** Servicios y personas que esta clienta marcó como favoritos en un negocio (se guarda solo en su navegador). */
export interface Favorites {
  services: number[];
  staff: number[];
}

export const FAVORITES_KEY = 'nexia-favorites';

type Store = Record<string, Favorites>;

const NONE: Favorites = { services: [], staff: [] };

function ids(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
}

function read(raw: string | null): Store {
  try {
    const parsed = JSON.parse(raw ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function favoritesFor(raw: string | null, slug: string): Favorites {
  const row = read(raw)[slug];
  return row ? { services: ids(row.services), staff: ids(row.staff) } : NONE;
}

/** Pone o quita un favorito; los demás negocios no se tocan. */
export function toggleFavorite(raw: string | null, slug: string, kind: keyof Favorites, id: number): string {
  const store = read(raw);
  const current = favoritesFor(raw, slug);
  const list = current[kind];
  const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return JSON.stringify({ ...store, [slug]: { ...current, [kind]: next } });
}

/** Borra los favoritos de un negocio (cuando otra persona usa el mismo celular). */
export function clearFavorites(raw: string | null, slug: string): string {
  const { [slug]: _gone, ...rest } = read(raw);
  return JSON.stringify(rest);
}

/** Pasa a los favoritos al principio sin cambiar el orden del resto. */
export function favoritesFirst<T extends { id: number }>(rows: readonly T[], favorite: readonly number[]): T[] {
  return [...rows.filter((row) => favorite.includes(row.id)), ...rows.filter((row) => !favorite.includes(row.id))];
}
