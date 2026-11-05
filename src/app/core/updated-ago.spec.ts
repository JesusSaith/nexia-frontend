import { describe, expect, it } from 'vitest';
import { updatedAgo } from './updated-ago';

describe('updatedAgo', () => {
  const t = 1_000_000;
  it('no dice nada si aún no hay datos', () => expect(updatedAgo(null, t)).toBe(''));
  it('menos de un minuto', () => expect(updatedAgo(t, t + 30_000)).toBe('Actualizado hace un momento'));
  it('minutos', () => expect(updatedAgo(t, t + 3 * 60_000 + 5_000)).toBe('Actualizado hace 3 min'));
  it('horas', () => expect(updatedAgo(t, t + 125 * 60_000)).toBe('Actualizado hace 2 h'));
  it('no se rompe si el reloj va hacia atrás', () => expect(updatedAgo(t, t - 5000)).toBe('Actualizado hace un momento'));
});
