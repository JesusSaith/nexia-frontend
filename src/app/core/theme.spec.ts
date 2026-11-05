import { describe, expect, it } from 'vitest';

import { contrast, readableOn, textOn } from './theme';

describe('readableOn', () => {
  it('deja igual un color que ya se lee', () => {
    expect(readableOn('#1c1a19')).toBe('#1c1a19');
  });

  it('oscurece un rosa claro hasta pasar 4.5:1 sobre blanco', () => {
    const result = readableOn('#e8909a');
    expect(contrast(result, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(result).not.toBe('#e8909a');
  });

  it('conserva el tono: no se vuelve gris', () => {
    const result = readableOn('#e8909a');
    const [r, g] = [parseInt(result.slice(1, 3), 16), parseInt(result.slice(3, 5), 16)];
    expect(r).toBeGreaterThan(g);
  });

  it('un valor inválido no rompe la página', () => {
    expect(readableOn('rojo')).toBe('#1c1a19');
  });
});

describe('textOn', () => {
  it('blanco sobre oscuro y oscuro sobre claro', () => {
    expect(textOn('#111111')).toBe('#ffffff');
    expect(textOn('#f5e6e8')).toBe('#1c1a19');
  });
});
