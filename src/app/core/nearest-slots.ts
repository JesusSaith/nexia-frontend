/** Lo mínimo que se necesita de un horario libre (la hora del negocio, sin zona: "2026-10-30T10:00:00"). */
export interface SlotLike {
  starts_at: string;
}

function minutesOfDay(value: string): number {
  return Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
}

/**
 * Los horarios libres más cercanos al que se llevaron (del mismo día), en orden de hora.
 * Sirve cuando alguien más ganó el horario: se ofrecen alternativas a la misma hora en vez de empezar de cero.
 */
export function nearestSlots<T extends SlotLike>(slots: readonly T[], taken: string, limit = 3): T[] {
  const day = taken.slice(0, 10);
  const wanted = minutesOfDay(taken);
  return slots
    .filter((slot) => slot.starts_at.slice(0, 10) === day && slot.starts_at !== taken)
    .map((slot) => ({ slot, gap: Math.abs(minutesOfDay(slot.starts_at) - wanted) }))
    .sort((a, b) => a.gap - b.gap || a.slot.starts_at.localeCompare(b.slot.starts_at))
    .slice(0, limit)
    .map((item) => item.slot)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
