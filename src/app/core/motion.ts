/** ¿La persona pidió menos movimiento en su teléfono o computadora? */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Comportamiento de scroll: suave, salvo que la persona haya pedido menos movimiento. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
