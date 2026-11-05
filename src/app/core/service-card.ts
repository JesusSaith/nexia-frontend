/** La descripción solo se muestra si dice algo distinto al nombre del servicio. */
export function usefulDescription(name: string, description: string | null | undefined): string | null {
  const text = (description ?? '').trim();
  return text && text.toLowerCase() !== name.trim().toLowerCase() ? text : null;
}
