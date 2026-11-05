import { Readiness } from '@core/services/settings.service';

/** En qué paso abrir: el primero que aún falta para poder recibir citas (5 = ya está todo). */
export function firstStepLeft(ready: Readiness | null): number {
  if (!ready) {
    return 1;
  }
  const missing = new Set(ready.steps.filter((item) => item.group === 'arranque' && !item.done).map((item) => item.key));
  if (missing.has('staff')) {
    return 1;
  }
  if (missing.has('schedules')) {
    return 2;
  }
  // Sin servicios no puede haber asignaciones: el paso 3 enciende los servicios y se los da a todo el equipo.
  if (missing.has('services') || missing.has('assignments')) {
    return 3;
  }
  return 5;
}
