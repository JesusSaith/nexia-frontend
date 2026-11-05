/** Cómo se agrupan los avisos de Inicio para filtrarlos. Los tipos (`kind`) los pone el servidor al crear el aviso. */
export type NoticeGroup = 'bookings' | 'payments' | 'cancels' | 'waitlist';

export const NOTICE_GROUPS: readonly { key: NoticeGroup; label: string }[] = [
  { key: 'bookings', label: 'Citas' },
  { key: 'payments', label: 'Pagos' },
  { key: 'cancels', label: 'Cancelaciones' },
  { key: 'waitlist', label: 'Lista de espera' },
];

const BY_KIND: Record<string, NoticeGroup> = {
  booking: 'bookings',
  new_booking: 'bookings',
  rescheduled: 'bookings',
  confirmed: 'bookings',
  quote: 'bookings',
  accepted: 'bookings',
  payment: 'payments',
  proof: 'payments',
  deposit_expired: 'payments',
  cancelled: 'cancels',
  cancelled_admin: 'cancels',
  no_show: 'cancels',
  waitlist: 'waitlist',
};

/** Un tipo que no se conoce (o un aviso viejo sin tipo) cuenta como de citas, para que nunca desaparezca de la lista. */
export function noticeGroup(kind: string | null | undefined): NoticeGroup {
  return (kind && BY_KIND[kind]) || 'bookings';
}

/** Lo que dice el enlace que lleva a la cita, según el tipo de aviso. */
export function noticeAction(kind: string | null | undefined): string {
  switch (kind) {
    case 'payment':
      return 'Revisar comprobante';
    case 'new_booking':
      return 'Revisar cita';
    default:
      return 'Ver cita';
  }
}
