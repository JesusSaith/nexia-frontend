import { describe, expect, it } from 'vitest';
import { loyaltyCard, loyaltyText, planOf, rewardPercent, stepBadge, type LoyaltyPlan } from './loyalty';

const ladder: LoyaltyPlan = {
  repeat: true,
  steps: [
    { visit: 3, kind: 'percent', percent: 5 },
    { visit: 6, kind: 'percent', percent: 20 },
    { visit: 10, kind: 'free', percent: 100 },
  ],
};

describe('planOf', () => {
  it('sin peldaños no hay tarjeta', () => {
    expect(planOf(null)).toBeNull();
    expect(planOf({ loyalty_steps: [] })).toBeNull();
  });

  it('acepta el premio simple de antes', () => {
    expect(planOf({ loyalty_every: 5, loyalty_percent: 10 })).toEqual({ steps: [{ visit: 5, kind: 'percent', percent: 10 }], repeat: true });
  });

  it('ordena los peldaños', () => {
    const plan = planOf({ loyalty_steps: [ladder.steps[1], ladder.steps[0]], loyalty_repeat: false })!;
    expect(plan.steps.map((s) => s.visit)).toEqual([3, 6]);
    expect(plan.repeat).toBe(false);
  });
});

describe('loyaltyCard', () => {
  it('cliente nuevo empieza en cero y la tarjeta tiene tantas casillas como la última visita', () => {
    const card = loyaltyCard(ladder, 0)!;
    expect(card.cycle).toBe(10);
    expect(card.slots[0].state).toBe('next');
    expect(card.slots[2].step?.percent).toBe(5);
    expect(card.left).toBe(2);
    expect(card.hit).toBeNull();
  });

  it('con dos visitas, la próxima lleva el primer premio', () => {
    const card = loyaltyCard(ladder, 2)!;
    expect(card.hit?.percent).toBe(5);
    expect(loyaltyText(card, 'client')).toBe('Esta visita lleva 5% de descuento.');
  });

  it('después de un premio cuenta hacia el siguiente', () => {
    const card = loyaltyCard(ladder, 3)!;
    expect(card.hit).toBeNull();
    expect(card.next?.visit).toBe(6);
    expect(card.left).toBe(2);
    expect(loyaltyText(card, 'owner')).toBe('Faltan 2 visitas para su premio: 20% de descuento.');
  });

  it('la visita 10 es servicio gratis', () => {
    const card = loyaltyCard(ladder, 9)!;
    expect(card.hit?.kind).toBe('free');
    expect(loyaltyText(card, 'client')).toBe('Esta visita lleva un servicio gratis.');
  });

  it('repite al terminar', () => {
    const card = loyaltyCard(ladder, 10)!;
    expect(card.fresh).toBe(true);
    expect(card.done).toBe(0);
    expect(card.left).toBe(2);
  });

  it('sin repetición termina', () => {
    const card = loyaltyCard({ ...ladder, repeat: false }, 10)!;
    expect(card.ended).toBe(true);
    expect(card.hit).toBeNull();
    expect(loyaltyText(card, 'client')).toContain('Completaste');
  });

  it('visita con premio reservada y sin cobrar', () => {
    const card = loyaltyCard(ladder, 3, 2)!;
    expect(card.reserved?.percent).toBe(5);
    expect(loyaltyText(card, 'client')).toBe('Ya tienes reservada tu visita con 5% de descuento.');
  });

  it('regalo', () => {
    const gift: LoyaltyPlan = { repeat: true, steps: [{ visit: 3, kind: 'gift', percent: 0, label: 'Esmalte' }] };
    expect(loyaltyText(loyaltyCard(gift, 2)!, 'client')).toBe('Esta visita lleva un regalo: Esmalte.');
    expect(stepBadge(gift.steps[0])).toBe('Regalo');
  });
});

describe('rewardPercent', () => {
  it('servicio gratis solo aplica a su servicio', () => {
    const step = { visit: 4, kind: 'free' as const, percent: 100, service_id: 7 };
    expect(rewardPercent(step, 7)).toBe(100);
    expect(rewardPercent(step, 8)).toBe(0);
    expect(rewardPercent({ ...step, service_id: null }, 8)).toBe(100);
  });

  it('regalo no descuenta', () => {
    expect(rewardPercent({ visit: 3, kind: 'gift', percent: 0, label: 'x' }, 1)).toBe(0);
  });
});
