/** Duración en minutos entre el inicio y el final de una cita (horas locales, sin zona). */
export function minutesBetween(startsAt: string, endsAt: string | null | undefined): number | null {
  if (!endsAt) {
    return null;
  }
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** "45 min", "1 h" o "1 h 55 min": más fácil de leer que 115 min. */
export function formatMinutes(total: number): string {
  if (total < 60) {
    return `${total} min`;
  }
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Lo que falta por pagar en el local una vez descontado el anticipo; null si no se puede calcular. */
export function balanceDue(total: number | null | undefined, deposit: number | null | undefined): number | null {
  if (total == null || !deposit) {
    return null;
  }
  return Math.max(total - deposit, 0);
}
