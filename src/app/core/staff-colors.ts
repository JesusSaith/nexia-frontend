import { Staff } from './models/staff.model';

/** Colores de la agenda; si la colaboradora no eligió uno, se usa el de su orden en el equipo. */
export const STAFF_PALETTE = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];

export function staffColorOf(staff: Staff[], staffId: number): string {
  const index = Math.max(0, staff.findIndex((member) => member.id === staffId));
  return staff[index]?.color || STAFF_PALETTE[index % STAFF_PALETTE.length];
}
