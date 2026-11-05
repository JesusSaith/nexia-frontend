import { describe, expect, it } from 'vitest';

import { clock12 } from './when-field';

describe('clock12', () => {
  it('muestra en 12 horas lo que se guarda en 24', () => {
    expect(clock12('09:00')).toBe('9:00 AM');
    expect(clock12('12:15')).toBe('12:15 PM');
    expect(clock12('00:30')).toBe('12:30 AM');
    expect(clock12('18:45:00')).toBe('6:45 PM');
  });

  it('un valor vacío o roto no muestra nada', () => {
    expect(clock12('')).toBe('');
    expect(clock12('abc')).toBe('');
  });
});
