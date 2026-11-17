/** Tarjeta de cliente frecuente: "cada N visitas, la visita N lleva X% de descuento" (la regla vive en el backend). */
export type StampState = 'on' | 'next' | 'off';

export interface LoyaltyCardState {
  every: number;
  percent: number;
  /** Sellos de la vuelta actual (N - 1 círculos; el último lugar es el premio). */
  stamps: StampState[];
  /** Cuántos sellos lleva en esta vuelta. */
  done: number;
  /** Visitas que le faltan antes de la que lleva el premio. */
  left: number;
  /** La próxima reserva lleva el premio. */
  hit: boolean;
  /** Ya tiene reservada (sin cobrar) la visita con premio. */
  reserved: boolean;
  /** Acaba de completar la tarjeta: empieza otra. */
  fresh: boolean;
}

/**
 * Estado de la tarjeta. `booked` son las visitas cobradas más las citas que siguen en pie (lo mismo que cuenta el
 * backend para dar el premio); `completed` solo las cobradas, para saber si la visita con premio ya se cobró.
 * Devuelve null si el negocio no usa premio por visitas.
 */
export function loyaltyCard(every: number | null | undefined, percent: number | null | undefined, booked: number, completed = booked): LoyaltyCardState | null {
  const n = Math.floor(every ?? 0);
  const p = Math.floor(percent ?? 0);
  if (n < 2 || p < 1) {
    return null;
  }
  const total = Math.max(0, Math.floor(booked));
  const paid = Math.min(total, Math.max(0, Math.floor(completed)));
  const reserved = total > paid && total % n === 0;
  const hit = !reserved && total % n === n - 1;
  const fresh = total > 0 && total % n === 0 && !reserved;
  const done = reserved || hit ? n - 1 : total % n;
  const stamps: StampState[] = Array.from({ length: n - 1 }, (_, index) => (index < done ? 'on' : index === done ? 'next' : 'off'));
  return { every: n, percent: Math.min(p, 100), stamps, done, left: reserved || hit ? 0 : n - 1 - done, hit, reserved, fresh };
}

/** Texto de la tarjeta: a quien reserva ("tu") o a la dueña ("su"). */
export function loyaltyText(card: LoyaltyCardState, audience: 'client' | 'owner'): string {
  const own = audience === 'client' ? 'tu' : 'su';
  if (card.reserved) {
    return audience === 'client' ? `Ya tienes reservada tu visita con ${card.percent}% de descuento.` : `Ya tiene reservada la visita con ${card.percent}% de descuento.`;
  }
  if (card.hit) {
    return audience === 'client' ? `Esta visita lleva ${card.percent}% de descuento.` : `Su próxima visita lleva ${card.percent}% de descuento.`;
  }
  const missing = `${card.left === 1 ? 'Falta' : 'Faltan'} ${card.left} ${card.left === 1 ? 'visita' : 'visitas'}`;
  if (audience === 'client') {
    const lead = card.fresh ? 'Empiezas una tarjeta nueva. ' : card.done === 0 ? 'Empieza tu tarjeta con tu primera visita. ' : `Llevas ${card.done} de ${card.every - 1}. `;
    return `${lead}${card.left === 1 ? 'Te falta' : 'Te faltan'} ${card.left} ${card.left === 1 ? 'visita' : 'visitas'} para tener ${card.percent}% de descuento.`;
  }
  return `${missing} para ${own} premio del ${card.percent}%.`;
}
