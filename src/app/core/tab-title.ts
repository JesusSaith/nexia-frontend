/** "(3) Inicio · Nexia": el título con el número de avisos sin ver. Sin avisos, el título limpio. */
export function titleWithCount(base: string, count: number): string {
  const clean = base.replace(/^\(\d+\+?\)\s*/, '');
  if (count <= 0) return clean;
  return `(${count > 99 ? '99+' : count}) ${clean}`;
}
