import { describe, expect, it } from 'vitest';
import { balanceDue, formatMinutes, minutesBetween } from './appointment-summary';

describe('appointment-summary', () => {
  it('calcula la duración entre inicio y fin', () => {
    expect(minutesBetween('2026-10-26T11:00:00', '2026-10-26T13:00:00')).toBe(120);
    expect(minutesBetween('2026-10-26T11:00:00', null)).toBeNull();
    expect(minutesBetween('2026-10-26T11:00:00', '2026-10-26T11:00:00')).toBeNull();
  });

  it('escribe la duración en horas y minutos', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(115)).toBe('1 h 55 min');
  });

  it('calcula lo que falta pagar', () => {
    expect(balanceDue(500, 100)).toBe(400);
    expect(balanceDue(80, 100)).toBe(0);
    expect(balanceDue(null, 100)).toBeNull();
    expect(balanceDue(500, null)).toBeNull();
  });
});
