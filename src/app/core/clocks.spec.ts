import { describe, expect, it } from 'vitest';
import { clockGrid, clocksSentence, parseClocks } from './clocks';

describe('parseClocks', () => {
  it('entiende horas de 24 h y con minutos', () => {
    expect(parseClocks('9:30, 12:30, 16:00, 18:00').clocks).toEqual(['09:30', '12:30', '16:00', '18:00']);
  });

  it('entiende am y pm con o sin espacio y con puntos', () => {
    expect(parseClocks('4pm, 6 pm y 7:30 p.m.').clocks).toEqual(['16:00', '18:00', '19:30']);
    expect(parseClocks('9 a.m.').clocks).toEqual(['09:00']);
    expect(parseClocks('12 am').clocks).toEqual(['00:00']);
  });

  it('sin am ni pm, de 1 a 6 es tarde y de 9 a 11 es mañana', () => {
    expect(parseClocks('6:00').clocks).toEqual(['18:00']);
    expect(parseClocks('9 12 2 4 7pm').clocks).toEqual(['09:00', '12:00', '14:00', '16:00', '19:00']);
  });

  it('el 7 y el 8 sin am ni pm se piden claros', () => {
    const result = parseClocks('7, 8:30, 19:00');
    expect(result.clocks).toEqual(['08:30', '19:00']);
    expect(result.invalid).toEqual(['7 (escribe 7am o 7pm)']);
  });

  it('acepta 930 y quita repetidas', () => {
    expect(parseClocks('930, 9:30').clocks).toEqual(['09:30']);
  });

  it('avisa lo que no entiende', () => {
    const result = parseClocks('9:30, mediodía, 25:00');
    expect(result.clocks).toEqual(['09:30']);
    expect(result.invalid).toEqual(['mediodía', '25:00']);
  });
});

describe('clockGrid', () => {
  it('va cada media hora', () => {
    expect(clockGrid('09:00', '11:00')).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });
});

describe('clocksSentence', () => {
  it('une con comas y "y"', () => {
    const f = (clock: string) => clock;
    expect(clocksSentence(['09:30'], f)).toBe('09:30');
    expect(clocksSentence(['09:30', '12:00', '19:00'], f)).toBe('09:30, 12:00 y 19:00');
    expect(clocksSentence([], f)).toBe('');
  });
});
