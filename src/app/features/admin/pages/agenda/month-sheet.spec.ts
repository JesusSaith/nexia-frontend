import { dayLabels } from './month-sheet';

describe('dayLabels', () => {
  it('un día normal con una cita: libres y la de las 2 tachada, sin repetir', () => {
    expect(dayLabels(['09:00', '17:00', '19:00'], ['14:00'])).toEqual({ free: ['09:00', '17:00', '19:00'], taken: ['14:00'] });
  });

  it('domingo especial con dos horas libres: solo esas dos, sin las fijas de siempre', () => {
    expect(dayLabels(['10:00', '11:00'], [])).toEqual({ free: ['10:00', '11:00'], taken: [] });
  });

  it('domingo especial con las dos citas tomadas: salen esas dos horas tachadas, no las cuatro de siempre', () => {
    expect(dayLabels([], ['10:00', '11:00'])).toEqual({ free: [], taken: ['10:00', '11:00'] });
  });

  it('jueves solo a las 5 y 7: no tacha las 9 ni las 2', () => {
    expect(dayLabels(['17:00', '19:00'], [])).toEqual({ free: ['17:00', '19:00'], taken: [] });
  });

  it('una hora con lugares libres y citas a la vez sale una sola vez, y todo va en orden', () => {
    expect(dayLabels(['14:00', '09:00', '14:00'], ['14:00', '17:00', '17:00'])).toEqual({ free: ['09:00', '14:00'], taken: ['17:00'] });
  });
});
