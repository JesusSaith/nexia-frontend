import { describe, expect, it } from 'vitest';

import { closureOn, closureSpan, noteOf, weekdayHit, weekdayOf, weekdaysText } from './shop-note';

describe('cierres por días de la semana', () => {
  it('cuenta lunes como 0 y domingo como 6', () => {
    expect(weekdayOf('2031-03-03')).toBe(0);
    expect(weekdayOf('2031-03-09')).toBe(6);
  });

  it('una lista vacía o ausente significa todos los días', () => {
    expect(weekdayHit([], '2031-03-04')).toBe(true);
    expect(weekdayHit(undefined, '2031-03-04')).toBe(true);
    expect(weekdayHit('5,6', '2031-03-04')).toBe(false);
    expect(weekdayHit('5,6', '2031-03-08')).toBe(true);
  });

  it('un cierre solo de domingos no cierra los demás días del periodo', () => {
    const note = noteOf({ closures: [{ from: '2031-03-03', to: '2031-03-16', label: 'Sin domingos', days: [6] }] });
    expect(closureOn('2031-03-09', note)?.label).toBe('Sin domingos');
    expect(closureOn('2031-03-10', note)).toBeNull();
  });

  it('lo explica con palabras', () => {
    expect(weekdaysText([6])).toBe('solo domingos');
    expect(weekdaysText([5, 6])).toBe('solo sábados y domingos');
    expect(weekdaysText([])).toBe('');
    expect(closureSpan({ from: '2031-03-03', to: '2031-03-16', label: '', days: [6] })).toContain('solo domingos');
  });
});
