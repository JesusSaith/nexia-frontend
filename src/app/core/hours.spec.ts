import { hora12, horario12 } from './hours';

describe('hora12', () => {
  it('pasa de 24 h a 12 h con a.m. y p.m.', () => {
    expect(hora12('09:00')).toBe('9:00 a.m.');
    expect(hora12('00:30')).toBe('12:30 a.m.');
    expect(hora12('12:00')).toBe('12:00 p.m.');
    expect(hora12('18:05:00')).toBe('6:05 p.m.');
  });

  it('en corto quita los minutos cuando es en punto', () => {
    expect(hora12('09:00', true)).toBe('9 a.m.');
    expect(hora12('13:30', true)).toBe('1:30 p.m.');
  });

  it('deja igual lo que no es una hora', () => {
    expect(hora12('')).toBe('');
    expect(hora12('Sin horario')).toBe('Sin horario');
  });

  it('arma un horario', () => {
    expect(horario12('09:00:00', '18:00:00')).toBe('9:00 a.m.–6:00 p.m.');
  });
});
