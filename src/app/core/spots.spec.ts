import { describe, expect, it } from 'vitest';

import { spotsLabel } from './spots';

describe('spotsLabel', () => {
  it('sin cupo no dice nada', () => {
    expect(spotsLabel(null)).toBe('');
    expect(spotsLabel(undefined)).toBe('');
  });
  it('singular y plural', () => {
    expect(spotsLabel(1)).toBe('Queda 1 lugar');
    expect(spotsLabel(3)).toBe('Quedan 3 lugares');
  });
  it('lleno', () => expect(spotsLabel(0)).toBe('Lleno'));
});
