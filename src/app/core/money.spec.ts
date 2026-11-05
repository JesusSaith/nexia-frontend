import { pesos } from './money';

describe('pesos', () => {
  it('quita los centavos cuando es entero', () => {
    expect(pesos(250)).toBe('$250');
  });

  it('los deja cuando los hay', () => {
    expect(pesos(250.5)).toBe('$250.50');
  });
});
