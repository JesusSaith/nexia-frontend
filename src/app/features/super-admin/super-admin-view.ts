import { BetaRequestItem, BetaStatus } from '@core/models/platform-business.model';

export type RequestFilter = 'atender' | 'seguimiento' | 'registradas' | 'descartadas' | 'todas';

/** Estado de la solicitud que corresponde a cada filtro (null = todas). */
export const FILTER_STATUS: Record<RequestFilter, BetaStatus | null> = {
  atender: 'nueva',
  seguimiento: 'aprobada',
  registradas: 'registrada',
  descartadas: 'descartada',
  todas: null,
};

export function countByStatus(items: readonly BetaRequestItem[]): Record<RequestFilter, number> {
  const count = (status: BetaStatus) => items.filter((item) => item.status === status).length;
  return { atender: count('nueva'), seguimiento: count('aprobada'), registradas: count('registrada'), descartadas: count('descartada'), todas: items.length };
}

/** Solicitudes de un filtro, las más recientes primero. */
export function filterRequests(items: readonly BetaRequestItem[], filter: RequestFilter): BetaRequestItem[] {
  const status = FILTER_STATUS[filter];
  return items.filter((item) => status === null || item.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Filtro con el que conviene abrir: lo que espera respuesta, luego el seguimiento y, si no hay nada, todas. */
export function defaultFilter(counts: Record<RequestFilter, number>): RequestFilter {
  return counts.atender > 0 ? 'atender' : counts.seguimiento > 0 ? 'seguimiento' : 'todas';
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Ancho (0 a 100) de una barra respecto al valor más grande; una cifra mayor que cero siempre se alcanza a ver. */
export function barPercent(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.max(Math.round((value / max) * 100), 3);
}

/** Nombre de la fuente para mostrar: "whatsapp" se ve como WhatsApp y las demás empiezan con mayúscula. */
export function sourceLabel(source: string): string {
  if (source === 'whatsapp') {
    return 'WhatsApp';
  }
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : source;
}
