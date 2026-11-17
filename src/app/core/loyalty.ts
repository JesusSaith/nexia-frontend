/** Tarjeta de cliente frecuente: peldaños "a la visita N, este premio" (la regla vive en el backend). */
export type StampState = 'on' | 'next' | 'off';
export type RewardKind = 'percent' | 'free' | 'gift';

/** Un premio de la tarjeta: en qué visita se da y de qué tipo es. */
export interface LoyaltyStep {
  visit: number;
  kind: RewardKind;
  percent: number;
  label?: string | null;
  service_id?: number | null;
}

export interface LoyaltyPlan {
  steps: LoyaltyStep[];
  repeat: boolean;
}

export interface LoyaltySlot {
  n: number;
  state: StampState;
  step: LoyaltyStep | null;
}

export interface LoyaltyCardState {
  /** Casillas de la tarjeta; la última es la del último premio. */
  cycle: number;
  slots: LoyaltySlot[];
  repeat: boolean;
  /** Visitas ya hechas en esta vuelta. */
  done: number;
  /** Premio de la próxima visita (null si no toca premio). */
  hit: LoyaltyStep | null;
  /** Ya tiene reservada (sin cobrar) una visita con premio. */
  reserved: LoyaltyStep | null;
  /** Próximo premio (el de la próxima visita o uno más adelante). */
  next: LoyaltyStep | null;
  /** Visitas que le faltan antes de la que lleva el próximo premio. */
  left: number;
  /** Acaba de completar la tarjeta: empieza otra. */
  fresh: boolean;
  /** Tarjeta sin repetición y ya terminada. */
  ended: boolean;
}

export const MAX_STEPS = 6;
export const MAX_VISIT = 50;

/** Plan de la tarjeta a partir de lo que manda el servidor (acepta también el premio simple de antes). */
export function planOf(source: { loyalty_steps?: LoyaltyStep[] | null; loyalty_repeat?: boolean | null; loyalty_every?: number | null; loyalty_percent?: number | null } | null | undefined): LoyaltyPlan | null {
  if (!source) {
    return null;
  }
  let steps = (source.loyalty_steps ?? []).filter((step) => step.visit >= 2);
  if (!steps.length && (source.loyalty_every ?? 0) >= 2 && (source.loyalty_percent ?? 0) >= 1) {
    steps = [{ visit: Math.floor(source.loyalty_every as number), kind: 'percent', percent: Math.floor(source.loyalty_percent as number) }];
  }
  if (!steps.length) {
    return null;
  }
  return { steps: [...steps].sort((a, b) => a.visit - b.visit), repeat: source.loyalty_repeat ?? true };
}

/** Frase corta del premio, para botones y etiquetas. */
export function stepText(step: LoyaltyStep, names: Record<number, string> = {}): string {
  if (step.kind === 'free') {
    const name = step.service_id ? names[step.service_id] : '';
    return name ? `${name} gratis` : 'un servicio gratis';
  }
  if (step.kind === 'gift') {
    return `un regalo: ${step.label ?? ''}`.trim();
  }
  return `${step.percent}% de descuento`;
}

/** Etiqueta dentro de la casilla del premio. */
export function stepBadge(step: LoyaltyStep): string {
  return step.kind === 'percent' ? `${step.percent}%` : step.kind === 'free' ? 'Gratis' : 'Regalo';
}

/**
 * Estado de la tarjeta. `booked` son las visitas cobradas más las citas que siguen en pie (lo mismo que cuenta el
 * backend para dar el premio); `completed` solo las cobradas, para saber si la visita con premio ya se cobró.
 */
export function loyaltyCard(plan: LoyaltyPlan | null | undefined, booked: number, completed = booked): LoyaltyCardState | null {
  if (!plan || !plan.steps.length) {
    return null;
  }
  const steps = [...plan.steps].sort((a, b) => a.visit - b.visit);
  const cycle = steps[steps.length - 1].visit;
  const total = Math.max(0, Math.floor(booked));
  const paid = Math.min(total, Math.max(0, Math.floor(completed)));
  const ended = !plan.repeat && total >= cycle;
  const position = ended ? cycle + 1 : plan.repeat ? (total % cycle) + 1 : total + 1;
  const stepAt = (visit: number) => steps.find((step) => step.visit === visit) ?? null;
  const hit = ended ? null : stepAt(position);
  const lastVisit = total > 0 ? (plan.repeat ? ((total - 1) % cycle) + 1 : Math.min(total, cycle)) : 0;
  const reserved = !hit && total > paid ? stepAt(lastVisit) : null;
  const ahead = ended ? null : steps.find((step) => step.visit >= position) ?? (plan.repeat ? steps[0] : null);
  const left = !ahead ? 0 : ahead.visit >= position ? ahead.visit - position : cycle - position + ahead.visit;
  const slots: LoyaltySlot[] = Array.from({ length: cycle }, (_, index) => {
    const n = index + 1;
    const state: StampState = reserved && n === lastVisit ? 'next' : n < position ? 'on' : n === position ? 'next' : 'off';
    return { n, state, step: stepAt(n) };
  });
  const done = ended ? cycle : position - 1;
  const fresh = plan.repeat && total > 0 && total % cycle === 0 && !reserved;
  return { cycle, slots, repeat: plan.repeat, done, hit, reserved, next: hit ?? ahead, left, fresh, ended };
}

/** Texto de la tarjeta: a quien reserva ("tu") o a la dueña/dueño ("su"). */
export function loyaltyText(card: LoyaltyCardState, audience: 'client' | 'owner', names: Record<number, string> = {}): string {
  const client = audience === 'client';
  if (card.reserved) {
    const what = stepText(card.reserved, names);
    return client ? `Ya tienes reservada tu visita con ${what}.` : `Ya tiene reservada la visita con ${what}.`;
  }
  if (card.hit) {
    const what = stepText(card.hit, names);
    return client ? `Esta visita lleva ${what}.` : `Su próxima visita lleva ${what}.`;
  }
  if (card.ended) {
    return client ? 'Completaste tu tarjeta. Gracias por venir.' : 'Ya completó su tarjeta.';
  }
  const what = card.next ? stepText(card.next, names) : '';
  if (client) {
    const lead = card.fresh ? 'Empiezas una tarjeta nueva. ' : card.done === 0 ? 'Empieza tu tarjeta con tu primera visita. ' : `Llevas ${card.done} de ${card.cycle}. `;
    return `${lead}${card.left === 1 ? 'Te falta' : 'Te faltan'} ${card.left} ${card.left === 1 ? 'visita' : 'visitas'} para tener ${what}.`;
  }
  return `${card.left === 1 ? 'Falta' : 'Faltan'} ${card.left} ${card.left === 1 ? 'visita' : 'visitas'} para su premio: ${what}.`;
}

/** Descuento que da el premio al reservar `serviceId` (espejo de discount_for del backend). */
export function rewardPercent(step: LoyaltyStep | null | undefined, serviceId: number | null): number {
  if (!step || step.kind === 'gift') {
    return 0;
  }
  if (step.kind === 'free') {
    return !step.service_id || step.service_id === serviceId ? 100 : 0;
  }
  return step.percent;
}

/** Plantillas rápidas para el editor. */
export const LOYALTY_TEMPLATES: { name: string; steps: LoyaltyStep[]; repeat: boolean }[] = [
  { name: 'Cada 5 visitas, 10%', repeat: true, steps: [{ visit: 5, kind: 'percent', percent: 10 }] },
  {
    name: 'Escalera 3, 6 y 10',
    repeat: true,
    steps: [
      { visit: 3, kind: 'percent', percent: 5 },
      { visit: 6, kind: 'percent', percent: 20 },
      { visit: 10, kind: 'percent', percent: 50 },
    ],
  },
  {
    name: '3 con 10%, 5 servicio gratis',
    repeat: true,
    steps: [
      { visit: 3, kind: 'percent', percent: 10 },
      { visit: 5, kind: 'free', percent: 100 },
    ],
  },
];
