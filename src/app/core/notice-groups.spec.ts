import { NOTICE_GROUPS, noticeAction, noticeGroup } from './notice-groups';

describe('noticeGroup', () => {
  it('junta los tipos del servidor en pocos grupos', () => {
    expect(noticeGroup('payment')).toBe('payments');
    expect(noticeGroup('deposit_expired')).toBe('payments');
    expect(noticeGroup('cancelled')).toBe('cancels');
    expect(noticeGroup('no_show')).toBe('cancels');
    expect(noticeGroup('waitlist')).toBe('waitlist');
    expect(noticeGroup('new_booking')).toBe('bookings');
  });

  it('un tipo desconocido o vacío cae en citas y nunca se pierde', () => {
    expect(noticeGroup('algo_nuevo')).toBe('bookings');
    expect(noticeGroup(null)).toBe('bookings');
    expect(noticeGroup(undefined)).toBe('bookings');
  });

  it('todo grupo que devuelve existe en la lista de filtros', () => {
    const keys = NOTICE_GROUPS.map((group) => group.key);
    for (const kind of ['booking', 'payment', 'cancelled', 'waitlist', 'zzz', null]) {
      expect(keys).toContain(noticeGroup(kind));
    }
  });
});

describe('noticeAction', () => {
  it('dice qué se hace al abrir la cita', () => {
    expect(noticeAction('payment')).toBe('Revisar comprobante');
    expect(noticeAction('new_booking')).toBe('Revisar cita');
    expect(noticeAction('cancelled')).toBe('Ver cita');
    expect(noticeAction(null)).toBe('Ver cita');
  });
});
