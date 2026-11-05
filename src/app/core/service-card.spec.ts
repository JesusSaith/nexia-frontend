import { describe, expect, it } from 'vitest';

import { usefulDescription } from './service-card';

describe('usefulDescription', () => {
  it('oculta la que repite el nombre', () => expect(usefulDescription('pies', ' Pies ')).toBeNull());
  it('oculta vacías', () => expect(usefulDescription('Corte', '')).toBeNull());
  it('muestra la que aporta', () => expect(usefulDescription('Corte', 'Corte clásico')).toBe('Corte clásico'));
});
