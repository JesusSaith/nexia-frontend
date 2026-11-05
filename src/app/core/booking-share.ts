export interface ShareInfo {
  business: string;
  service: string;
  when: string;
  who: string | null;
  address?: string | null;
}

/** Texto para mandarle a quien te acompaña (o a ti mismo): qué, cuándo, con quién y dónde. */
export function bookingShareText(info: ShareInfo): string {
  const lines = [`Tengo cita en ${info.business}`, `${info.service} · ${info.when}${info.who ? ` · con ${info.who}` : ''}`];
  if (info.address?.trim()) {
    lines.push(`Dirección: ${info.address.trim()}`);
  }
  return lines.join('\n');
}
