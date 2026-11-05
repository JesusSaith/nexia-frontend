import { describe, expect, it } from 'vitest';

import { bookingShareText } from './booking-share';

describe('bookingShareText', () => {
  it('incluye negocio, servicio, hora y persona', () => {
    const text = bookingShareText({ business: 'Salón Luna', service: 'Corte', when: 'jueves 5 · 4:00 p. m.', who: 'Ana' });
    expect(text).toBe('Tengo cita en Salón Luna\nCorte · jueves 5 · 4:00 p. m. · con Ana');
  });
  it('agrega la dirección solo si existe', () => {
    const text = bookingShareText({ business: 'X', service: 'Y', when: 'Z', who: null, address: ' Calle 1 ' });
    expect(text.endsWith('Dirección: Calle 1')).toBe(true);
    expect(text).not.toContain('con ');
  });
});
