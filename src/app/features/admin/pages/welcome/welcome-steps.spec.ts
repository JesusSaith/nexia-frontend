import { Readiness, ReadinessStep } from '@core/services/settings.service';

import { firstStepLeft } from './welcome-steps';

function step(key: string, done: boolean, group = 'arranque'): ReadinessStep {
  return { key, label: key, done, path: '/admin', group, section: null } as ReadinessStep;
}

function ready(done: Record<string, boolean>): Readiness {
  const keys = ['services', 'staff', 'assignments', 'schedules', 'share'];
  return { can_book: false, steps: keys.map((key) => step(key, done[key] ?? false)) };
}

describe('firstStepLeft', () => {
  it('abre en el primer paso si no se pudo leer lo que falta', () => {
    expect(firstStepLeft(null)).toBe(1);
  });

  it('sin equipo empieza por quién atiende', () => {
    expect(firstStepLeft(ready({}))).toBe(1);
  });

  it('con equipo pero sin horario abre en el horario', () => {
    expect(firstStepLeft(ready({ staff: true }))).toBe(2);
  });

  it('con equipo y horario pero sin servicios abre en servicios, aunque falten las asignaciones', () => {
    expect(firstStepLeft(ready({ staff: true, schedules: true }))).toBe(3);
  });

  it('con servicios sin asignar también abre en servicios, porque ahí se asignan', () => {
    expect(firstStepLeft(ready({ staff: true, schedules: true, services: true }))).toBe(3);
  });

  it('si ya puede recibir citas abre en la pantalla final, aunque no haya compartido el enlace', () => {
    expect(firstStepLeft(ready({ staff: true, schedules: true, services: true, assignments: true }))).toBe(5);
  });
});
