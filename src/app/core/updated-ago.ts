/** "Actualizado hace un momento / hace 3 min / hace 2 h" según cuándo llegaron los datos. */
export function updatedAgo(updatedAt: number | null, now: number): string {
  if (updatedAt === null) {
    return '';
  }
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60000));
  if (minutes < 1) {
    return 'Actualizado hace un momento';
  }
  if (minutes < 60) {
    return `Actualizado hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `Actualizado hace ${hours} h`;
}
