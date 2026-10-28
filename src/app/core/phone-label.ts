/** "2712054908" → "271 205 4908" (10 dígitos); cualquier otra cosa se deja tal cual. */
export function phoneLabel(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 && /^[\d\s()+-]+$/.test(raw) ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : raw;
}

/** Enlace para llamar desde el celular (México si trae 10 dígitos), o null si no hay número. */
export function telLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return `tel:${digits.length === 10 ? `+52${digits}` : `+${digits}`}`;
}
