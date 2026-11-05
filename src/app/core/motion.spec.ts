import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, scrollBehavior } from './motion';

function mockMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches }));
}

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa scroll suave por defecto', () => {
    mockMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('quita el scroll suave si pidió menos movimiento', () => {
    mockMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
  });
});
