/**
 * Horas de un día para la imagen de disponibilidad del mes: las libres que ofrece la API ese día y, tachadas, las que ya
 * tienen cita. Solo salen horas de ese día (nunca las fijas de la persona que ese día no se ofrecen) y ninguna se repite.
 */
export function dayLabels(free: string[], visits: string[]): { free: string[]; taken: string[] } {
  const open = [...new Set(free)].sort();
  const taken = [...new Set(visits)].filter((clock) => !open.includes(clock)).sort();
  return { free: open, taken };
}
