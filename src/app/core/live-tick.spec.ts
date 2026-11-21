import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveTick } from './live-tick';

function setHidden(value: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
}

describe('liveTick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('emite cada intervalo con la pestaña a la vista', () => {
    const seen = vi.fn();
    const sub = liveTick(1000).subscribe(seen);
    vi.advanceTimersByTime(3000);
    expect(seen).toHaveBeenCalledTimes(3);
    sub.unsubscribe();
  });

  it('con immediate emite al suscribirse', () => {
    const seen = vi.fn();
    const sub = liveTick(1000, true).subscribe(seen);
    expect(seen).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('no emite con la pestaña en segundo plano', () => {
    const seen = vi.fn();
    const sub = liveTick(1000).subscribe(seen);
    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(seen).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  it('emite de inmediato al regresar a la pestaña', () => {
    const seen = vi.fn();
    const sub = liveTick(60000).subscribe(seen);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).not.toHaveBeenCalled();
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('emite al recuperar el internet', () => {
    const seen = vi.fn();
    const sub = liveTick(60000).subscribe(seen);
    window.dispatchEvent(new Event('online'));
    expect(seen).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('al cancelar deja de escuchar', () => {
    const seen = vi.fn();
    const sub = liveTick(1000).subscribe(seen);
    sub.unsubscribe();
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event('online'));
    expect(seen).not.toHaveBeenCalled();
  });
});
