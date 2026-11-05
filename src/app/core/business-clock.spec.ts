import { describe, expect, it } from 'vitest';

import { wallClock } from './business-clock';

describe('wallClock', () => {
  const instant = new Date('2026-10-23T03:30:00Z');

  it('da la hora que marca el reloj en la zona del negocio', () => {
    const mexico = wallClock('America/Mexico_City', instant);
    expect([mexico.getFullYear(), mexico.getMonth(), mexico.getDate(), mexico.getHours(), mexico.getMinutes()]).toEqual([2026, 9, 22, 21, 30]);
    const tokyo = wallClock('Asia/Tokyo', instant);
    expect([tokyo.getDate(), tokyo.getHours(), tokyo.getMinutes()]).toEqual([23, 12, 30]);
  });

  it('sin zona o con una inválida usa la hora que se le dio', () => {
    expect(wallClock(null, instant)).toBe(instant);
    expect(wallClock('Marte/Olimpo', instant)).toBe(instant);
  });
});
