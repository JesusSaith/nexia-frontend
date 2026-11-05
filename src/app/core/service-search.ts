/** Sin acentos ni mayúsculas, para que "unas" encuentre "Uñas" y "CORTE" encuentre "corte". */
export function plain(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface Searchable {
  name: string;
  category?: string | null;
  description?: string | null;
}

/** ¿El servicio coincide con lo que la persona escribió? Todas las palabras deben aparecer en nombre, categoría o descripción. */
export function matchesQuery(service: Searchable, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return true;
  }
  const haystack = plain(`${service.name} ${service.category ?? ''} ${service.description ?? ''}`);
  return words.every((word) => haystack.includes(word));
}

/** Con pocos servicios la búsqueda estorba más de lo que ayuda. */
export const SEARCH_FROM = 8;
