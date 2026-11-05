import { describe, expect, it } from 'vitest';

import { matchesQuery, plain } from './service-search';

const nails = { name: 'Uñas acrílicas', category: 'Manos', description: 'Con diseño' };

describe('service search', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(plain('UÑAS')).toBe('unas');
    expect(matchesQuery(nails, 'unas')).toBe(true);
    expect(matchesQuery(nails, 'ACRILICAS')).toBe(true);
  });
  it('busca también en categoría y descripción', () => {
    expect(matchesQuery(nails, 'manos')).toBe(true);
    expect(matchesQuery(nails, 'diseno')).toBe(true);
  });
  it('pide que aparezcan todas las palabras', () => {
    expect(matchesQuery(nails, 'unas manos')).toBe(true);
    expect(matchesQuery(nails, 'unas corte')).toBe(false);
  });
  it('vacío no filtra', () => {
    expect(matchesQuery(nails, '   ')).toBe(true);
  });
});
