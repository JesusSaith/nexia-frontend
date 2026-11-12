import { describe, expect, it } from 'vitest';

import { clearFavorites, favoritesFirst, favoritesFor, toggleFavorite } from './favorites';

describe('favorites', () => {
  it('pone y quita sin tocar otros negocios', () => {
    const one = toggleFavorite(null, 'salon-a', 'services', 4);
    const two = toggleFavorite(one, 'barberia-b', 'staff', 9);
    expect(favoritesFor(two, 'salon-a')).toEqual({ services: [4], staff: [] });
    expect(favoritesFor(two, 'barberia-b')).toEqual({ services: [], staff: [9] });
    const three = toggleFavorite(two, 'salon-a', 'services', 4);
    expect(favoritesFor(three, 'salon-a').services).toEqual([]);
    expect(favoritesFor(three, 'barberia-b').staff).toEqual([9]);
  });

  it('un dato dañado se ignora', () => {
    expect(favoritesFor('no es json', 'salon-a')).toEqual({ services: [], staff: [] });
    expect(favoritesFor('{"salon-a":{"services":["x",3],"staff":7}}', 'salon-a')).toEqual({ services: [3], staff: [] });
  });

  it('borra solo el negocio indicado', () => {
    const both = toggleFavorite(toggleFavorite(null, 'a', 'services', 1), 'b', 'services', 2);
    const cleared = clearFavorites(both, 'a');
    expect(favoritesFor(cleared, 'a').services).toEqual([]);
    expect(favoritesFor(cleared, 'b').services).toEqual([2]);
  });

  it('los favoritos van primero y el resto conserva su orden', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(favoritesFirst(rows, [3, 2]).map((row) => row.id)).toEqual([2, 3, 1, 4]);
  });
});
