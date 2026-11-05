import { nearestSlots } from './nearest-slots';

const slot = (starts_at: string) => ({ starts_at });

describe('nearestSlots', () => {
  const day = [
    slot('2026-10-30T09:00:00'),
    slot('2026-10-30T10:30:00'),
    slot('2026-10-30T11:00:00'),
    slot('2026-10-30T13:00:00'),
    slot('2026-10-30T17:00:00'),
  ];

  it('da los tres más cercanos a la hora que se llevaron, en orden de hora', () => {
    expect(nearestSlots(day, '2026-10-30T11:30:00').map((item) => item.starts_at.slice(11, 16))).toEqual(['10:30', '11:00', '13:00']);
  });

  it('no repite el horario que se llevaron ni ofrece otros días', () => {
    const rows = [...day, slot('2026-10-31T11:00:00')];
    const result = nearestSlots(rows, '2026-10-30T11:00:00');
    expect(result.map((item) => item.starts_at)).not.toContain('2026-10-30T11:00:00');
    expect(result.every((item) => item.starts_at.startsWith('2026-10-30'))).toBe(true);
  });

  it('si hay menos de tres, da los que haya; sin ninguno, una lista vacía', () => {
    expect(nearestSlots([slot('2026-10-30T10:00:00')], '2026-10-30T11:00:00')).toHaveLength(1);
    expect(nearestSlots([], '2026-10-30T11:00:00')).toEqual([]);
  });

  it('con la misma distancia gana el más temprano', () => {
    const rows = [slot('2026-10-30T10:00:00'), slot('2026-10-30T12:00:00')];
    expect(nearestSlots(rows, '2026-10-30T11:00:00', 1)[0].starts_at).toBe('2026-10-30T10:00:00');
  });
});
