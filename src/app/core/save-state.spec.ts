import { describe, expect, it } from 'vitest';

import { saveStateOf, saveStateText } from './save-state';

describe('saveState', () => {
  it('guardando gana sobre todo lo demás', () => {
    expect(saveStateOf(true, 3)).toBe('saving');
  });

  it('con cambios pendientes avisa; sin ellos, todo guardado', () => {
    expect(saveStateOf(false, 2)).toBe('dirty');
    expect(saveStateOf(false, 0)).toBe('saved');
  });

  it('dice cuántos cambios hay', () => {
    expect(saveStateText('dirty', 1)).toBe('Cambios sin guardar');
    expect(saveStateText('dirty', 3)).toBe('3 cambios sin guardar');
    expect(saveStateText('saved')).toBe('Todo guardado');
  });
});
