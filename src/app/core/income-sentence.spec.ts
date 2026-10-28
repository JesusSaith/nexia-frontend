import { describe, expect, it } from 'vitest';

import { incomeSentence } from './income-sentence';

const money = (value: number) => `$${value}`;

describe('incomeSentence', () => {
  it('sin cobros', () => {
    expect(incomeSentence({ period: 'day', compare: 'prev', total: 0, before: 500, money })).toBe('Hoy todavía no hay cobros.');
  });
  it('sin periodo anterior con datos solo dice cuánto', () => {
    expect(incomeSentence({ period: 'week', compare: 'prev', total: 1200, before: 0, money })).toBe('En estos 7 días cobraste $1200.');
  });
  it('más que antes', () => {
    expect(incomeSentence({ period: 'month', compare: 'prev', total: 1120, before: 1000, money })).toBe('En lo que va del mes cobraste $1120, 12% más que el mes pasado.');
  });
  it('menos que antes', () => {
    expect(incomeSentence({ period: 'day', compare: 'prev', total: 400, before: 500, money })).toBe('Hoy cobraste $400, 20% menos que ayer.');
  });
  it('contra el año pasado', () => {
    expect(incomeSentence({ period: 'month', compare: 'year', total: 100, before: 100, money })).toBe('En lo que va del mes cobraste $100, lo mismo que hace un año.');
  });
});
