export type ReportPeriod = 'day' | 'week' | 'month' | 'range';

const LEAD: Record<ReportPeriod, string> = {
  day: 'Hoy',
  week: 'En estos 7 días',
  month: 'En lo que va del mes',
  range: 'En este periodo',
};

function thanWhat(period: ReportPeriod, compare: 'prev' | 'year'): string {
  if (compare === 'year') return 'hace un año';
  return period === 'day' ? 'ayer' : period === 'week' ? 'la semana pasada' : period === 'month' ? 'el mes pasado' : 'el periodo anterior';
}

/** Una frase que cualquier dueña entiende: cuánto cobró y cómo va contra antes. */
export function incomeSentence(input: {
  period: ReportPeriod;
  compare: 'prev' | 'year';
  total: number;
  before: number | null | undefined;
  money: (value: number) => string;
}): string {
  const lead = LEAD[input.period];
  if (!input.total) {
    return `${lead} todavía no hay cobros.`;
  }
  const base = `${lead} cobraste ${input.money(input.total)}`;
  if (!input.before || input.before <= 0) {
    return `${base}.`;
  }
  const percent = Math.round(((input.total - input.before) / input.before) * 100);
  const than = thanWhat(input.period, input.compare);
  if (percent === 0) {
    return `${base}, lo mismo que ${than}.`;
  }
  return `${base}, ${Math.abs(percent)}% ${percent > 0 ? 'más' : 'menos'} que ${than}.`;
}
