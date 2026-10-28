import { describe, expect, it } from 'vitest';

import { lastBookingFor, repeatable, withLastBooking } from './last-booking';

const last = { service_id: 2, staff_id: 7, service_name: 'Corte', staff_name: 'Ana' };

describe('lastBooking', () => {
  it('guarda por negocio sin pisar los demás', () => {
    const one = withLastBooking(null, 'salon-a', last);
    const two = withLastBooking(one, 'barberia-b', { ...last, service_id: 9 });
    expect(lastBookingFor(two, 'salon-a')?.service_id).toBe(2);
    expect(lastBookingFor(two, 'barberia-b')?.service_id).toBe(9);
    expect(lastBookingFor(two, 'otro')).toBeNull();
  });

  it('un dato dañado se ignora', () => {
    expect(lastBookingFor('no es json', 'salon-a')).toBeNull();
    expect(lastBookingFor('[1,2]', 'salon-a')).toBeNull();
  });

  it('solo se repite si el servicio sigue y no tiene opciones', () => {
    expect(repeatable(last, [{ id: 2 }, { id: 3 }])?.id).toBe(2);
    expect(repeatable(last, [{ id: 3 }])).toBeNull();
    expect(repeatable(last, [{ id: 2, variants: [{}] }])).toBeNull();
    expect(repeatable(null, [{ id: 2 }])).toBeNull();
  });
});
