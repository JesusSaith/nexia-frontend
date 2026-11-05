import { describe, expect, it } from 'vitest';

import { mexicanHolidays, upcomingHolidays } from './holidays';
import { methodsSentence } from './payment-methods';

describe('mexicanHolidays', () => {
  it('calcula los lunes y la Semana Santa de 2026', () => {
    const days = Object.fromEntries(mexicanHolidays(2026).map((item) => [item.label, item.date]));
    expect(days['Día de la Constitución']).toBe('2026-02-02');
    expect(days['Natalicio de Benito Juárez']).toBe('2026-03-16');
    expect(days['Jueves Santo']).toBe('2026-04-02');
    expect(days['Viernes Santo']).toBe('2026-04-03');
    expect(days['Día de la Revolución']).toBe('2026-11-16');
  });

  it('suma el cambio de gobierno solo cada 6 años', () => {
    expect(mexicanHolidays(2030).some((item) => item.date === '2030-10-01')).toBe(true);
    expect(mexicanHolidays(2027).some((item) => item.date === '2027-10-01')).toBe(false);
  });

  it('sugiere solo los de los próximos 12 meses', () => {
    const next = upcomingHolidays('2026-10-16');
    expect(next[0].date).toBe('2026-11-02');
    expect(next.every((item) => item.date >= '2026-10-16' && item.date < '2027-10-16')).toBe(true);
  });
});

describe('methodsSentence', () => {
  it('lista los métodos aceptados y usa los tres si no hay', () => {
    expect(methodsSentence(['efectivo', 'tarjeta'])).toBe('efectivo y tarjeta');
    expect(methodsSentence([])).toBe('efectivo, transferencia y tarjeta');
  });
});
