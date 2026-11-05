export type SaveStateKind = 'saving' | 'dirty' | 'saved';

/** Qué se le dice a la dueña de una pantalla con botón "Guardar": guardando, cambios pendientes o todo guardado. */
export function saveStateOf(saving: boolean, pendingChanges: number): SaveStateKind {
  if (saving) return 'saving';
  return pendingChanges > 0 ? 'dirty' : 'saved';
}

export function saveStateText(kind: SaveStateKind, pendingChanges = 0): string {
  switch (kind) {
    case 'saving':
      return 'Guardando…';
    case 'dirty':
      return pendingChanges > 1 ? `${pendingChanges} cambios sin guardar` : 'Cambios sin guardar';
    default:
      return 'Todo guardado';
  }
}
