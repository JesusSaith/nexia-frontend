import { describe, expect, it } from 'vitest';
import { loyaltyCard, loyaltyText } from './loyalty';

describe('loyaltyCard', () => {
  it('sin premio configurado no hay tarjeta', () => {
    expect(loyaltyCard(null, 10, 3)).toBeNull();
    expect(loyaltyCard(5, 0, 3)).toBeNull();
    expect(loyaltyCard(1, 10, 3)).toBeNull();
  });

  it('cliente nuevo empieza en cero', () => {
    const card = loyaltyCard(5, 10, 0)!;
    expect(card.stamps).toEqual(['next', 'off', 'off', 'off']);
    expect(card.left).toBe(4);
    expect(card.hit).toBe(false);
  });

  it('con una visita menos que el premio, la próxima lo lleva', () => {
    const card = loyaltyCard(5, 10, 4)!;
    expect(card.hit).toBe(true);
    expect(card.stamps.every((s) => s === 'on')).toBe(true);
    expect(loyaltyText(card, 'client')).toBe('Esta visita lleva 10% de descuento.');
  });

  it('visita con premio reservada y sin cobrar', () => {
    const card = loyaltyCard(5, 10, 5, 4)!;
    expect(card.reserved).toBe(true);
    expect(card.hit).toBe(false);
  });

  it('al cobrar la visita con premio empieza otra tarjeta', () => {
    const card = loyaltyCard(5, 10, 5)!;
    expect(card.fresh).toBe(true);
    expect(card.done).toBe(0);
    expect(loyaltyText(card, 'client')).toContain('tarjeta nueva');
  });

  it('texto para la dueña', () => {
    expect(loyaltyText(loyaltyCard(5, 10, 2)!, 'owner')).toBe('Faltan 2 visitas para su premio del 10%.');
  });
});
