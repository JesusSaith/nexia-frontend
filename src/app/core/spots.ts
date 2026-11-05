/** "Quedan 3 lugares" para clases con cupo; vacío si el servicio no maneja cupo. */
export function spotsLabel(left: number | null | undefined): string {
  if (left === null || left === undefined) {
    return '';
  }
  if (left <= 0) {
    return 'Lleno';
  }
  return left === 1 ? 'Queda 1 lugar' : `Quedan ${left} lugares`;
}
