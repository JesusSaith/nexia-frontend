import { describe, expect, it } from 'vitest';

import { BetaRequestItem } from '@core/models/platform-business.model';

import { barPercent, countByStatus, defaultFilter, filterRequests, plural, sourceLabel } from './super-admin-view';

const item = (id: number, status: BetaRequestItem['status'], created_at: string): BetaRequestItem => ({
  id, name: 'Ana', email: 'a@b.mx', phone: '5512345678', business_name: 'Salón', kind: 'belleza', message: null, people: null, source: null, status, created_at,
});

describe('super-admin-view', () => {
  const items = [item(1, 'nueva', '2026-11-01'), item(2, 'aprobada', '2026-11-03'), item(3, 'nueva', '2026-11-05'), item(4, 'descartada', '2026-11-02')];

  it('cuenta por estado y ordena lo más reciente primero', () => {
    const counts = countByStatus(items);
    expect(counts).toEqual({ atender: 2, seguimiento: 1, registradas: 0, descartadas: 1, todas: 4 });
    expect(filterRequests(items, 'atender').map((i) => i.id)).toEqual([3, 1]);
    expect(filterRequests(items, 'todas').map((i) => i.id)).toEqual([3, 2, 4, 1]);
  });

  it('abre con lo que espera respuesta', () => {
    expect(defaultFilter({ atender: 2, seguimiento: 1, registradas: 0, descartadas: 0, todas: 3 })).toBe('atender');
    expect(defaultFilter({ atender: 0, seguimiento: 1, registradas: 0, descartadas: 0, todas: 1 })).toBe('seguimiento');
    expect(defaultFilter({ atender: 0, seguimiento: 0, registradas: 1, descartadas: 0, todas: 1 })).toBe('todas');
  });

  it('concuerda singular y plural', () => {
    expect(plural(1, 'solicitud', 'solicitudes')).toBe('1 solicitud');
    expect(plural(0, 'solicitud', 'solicitudes')).toBe('0 solicitudes');
    expect(plural(3, 'visita', 'visitas')).toBe('3 visitas');
  });

  it('calcula barras que siempre se ven si hay datos', () => {
    expect(barPercent(56, 56)).toBe(100);
    expect(barPercent(1, 56)).toBe(3);
    expect(barPercent(0, 56)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });

  it('muestra bien el nombre de la fuente', () => {
    expect(sourceLabel('whatsapp')).toBe('WhatsApp');
    expect(sourceLabel('instagram')).toBe('Instagram');
    expect(sourceLabel('directo')).toBe('Directo');
  });
});
