import { isChunkError, shouldReload } from './chunk-reload';

describe('chunk-reload', () => {
  it('reconoce el error de una pantalla que ya no existe', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://app.nexiacitas.com/chunk-ABC.js'))).toBe(true);
    expect(isChunkError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkError({ rejection: new TypeError('Failed to fetch dynamically imported module: x') })).toBe(true);
  });

  it('no confunde otros errores', () => {
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
    expect(isChunkError('algo salió mal')).toBe(false);
  });

  it('recarga una sola vez y espera antes de volver a intentar', () => {
    expect(shouldReload(null, 1_000_000)).toBe(true);
    expect(shouldReload(1_000_000, 1_010_000)).toBe(false);
    expect(shouldReload(1_000_000, 1_040_000)).toBe(true);
  });
});
