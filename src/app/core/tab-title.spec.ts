import { describe, expect, it } from 'vitest';

import { titleWithCount } from './tab-title';

describe('titleWithCount', () => {
  it('antepone el número de avisos', () => {
    expect(titleWithCount('Inicio · Nexia', 3)).toBe('(3) Inicio · Nexia');
  });

  it('sin avisos deja el título limpio, también si ya traía número', () => {
    expect(titleWithCount('Inicio · Nexia', 0)).toBe('Inicio · Nexia');
    expect(titleWithCount('(3) Inicio · Nexia', 0)).toBe('Inicio · Nexia');
  });

  it('no repite el número al cambiarlo', () => {
    expect(titleWithCount('(3) Inicio · Nexia', 5)).toBe('(5) Inicio · Nexia');
  });

  it('con muchos avisos dice 99+', () => {
    expect(titleWithCount('Agenda · Nexia', 250)).toBe('(99+) Agenda · Nexia');
  });
});
