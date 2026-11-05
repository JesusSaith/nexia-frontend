import { describe, expect, it } from 'vitest';

import { agendaTourSteps, nextTourStep, tourStorageKey } from './tour';

describe('tour', () => {
  it('la Agenda tiene tres pasos, distintos en celular y en escritorio', () => {
    const phone = agendaTourSteps(true, 'Cita');
    const desktop = agendaTourSteps(false, 'Cita');
    expect(phone).toHaveLength(3);
    expect(desktop).toHaveLength(3);
    expect(phone[2].target).toBe('dia');
    expect(desktop[2].target).toBe('navegar');
  });

  it('usa la palabra del giro', () => {
    expect(agendaTourSteps(false, 'Clase')[0].title).toBe('Agendar una clase');
  });

  it('avanza hasta el último paso', () => {
    expect(nextTourStep(0, 3)).toBe(1);
    expect(nextTourStep(2, 3)).toBeNull();
  });

  it('guarda cada recorrido con su propia llave', () => {
    expect(tourStorageKey('agenda')).toBe('nexia-tour-agenda');
  });
});
