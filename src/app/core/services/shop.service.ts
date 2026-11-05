import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';

export interface ShopProduct {
  id: number;
  name: string;
  price: number;
  cost: number;
  stock: number;
}

export interface CommissionRow {
  staff_id: number;
  staff_name: string;
  percent: number;
  income: number;
  commission: number;
  visits: number;
  ticket: number;
  free_hours: number;
  open_hours?: number;
  occupancy?: number;
  paid: number;
  goal?: number | null;
  tier_reached?: boolean;
  tips?: number;
  no_shows?: number;
  cancels?: number;
  /** Clientas distintas que atendió y cuántas ya habían venido antes del periodo. */
  clients?: number;
  returning?: number;
}

export interface ShopExpense {
  id: number;
  name: string;
  amount: number;
  base: number;
  kind: string;
  cadence?: string | null;
  category?: string | null;
  /** Día en que se registró (AAAA-MM-DD). */
  day?: string | null;
  /** Gasto fijo: día de pago (1 a 31 si es mensual; 0 = lunes a 6 = domingo si es semanal). */
  pay_day?: number | null;
  /** Cuántas veces cae su pago dentro del periodo del reporte (amount = base × veces). */
  times?: number;
  /** Siguiente fecha de pago (AAAA-MM-DD). */
  next_due?: string | null;
  /** Pagos marcados con "Ya pagué" que caen en el periodo. */
  paid_marks?: { due: string; paid_on: string }[];
}

/** Corte de caja de un día (GET/PUT /api/shop/cash). */
export interface CashRow {
  day: string;
  expected: number;
  counted: number;
  difference: number;
  note: string | null;
  opening: number;
  closed: boolean;
  closed_by: string | null;
}

/** Dinero que entra o sale del cajón fuera de una cita. */
export interface CashMove {
  id: number;
  kind: 'in' | 'out';
  amount: number;
  reason: string;
  /** Si salió como gasto, también aparece en Reportes. */
  as_expense: boolean;
  created_by: string | null;
}

export interface CashDay {
  day: string;
  by_method: Record<string, number>;
  expected_cash: number;
  /** Qué parte del efectivo viene de servicios, propinas y productos. */
  cash_parts: { services: number; tips: number; products: number; total: number };
  opening: number;
  /** Lo que se contó en el último corte anterior: se propone como fondo. */
  suggested_opening: number;
  moves: CashMove[];
  moves_in: number;
  moves_out: number;
  count: CashRow | null;
  history: CashRow[];
}

export interface StockMove {
  id: number;
  product_name: string;
  kind: string;
  qty: number;
  amount: number;
  iva: number;
}

export interface SalesReport {
  service_income: number;
  by_method?: Record<string, number>;
  /** Citas por venir de aquí al fin del periodo y lo que dejarían. */
  expected_income?: number;
  expected_count?: number;
  by_category?: Record<string, number>;
  /** Gastos fijos que aún caen en lo que resta del mes (no están restados de la ganancia todavía). */
  fixed_pending?: number;
  /** Próximos pagos fijos de los siguientes 30 días. */
  upcoming_fixed?: { id: number; name: string; amount: number; date: string }[];
  /** Citas del periodo que ya pasaron y siguen sin cobrar ni cerrar, y lo que falta cobrar de ellas (precio menos anticipo). */
  uncollected_count?: number;
  uncollected_amount?: number;
  uncollected?: { id: number; name: string; date: string; amount: number }[];
  /** A quién cuidar (de hoy): clientes que dejaron de venir y clientes que cancelan o faltan seguido. */
  clients_missing?: number;
  clients_cancelling?: number;
  /** Invitaciones a volver del periodo: a cuántos clientes, cuántos regresaron o tienen cita, y lo que dejaron. */
  winback_sent?: number;
  winback_returned?: number;
  winback_booked?: number;
  winback_revenue?: number;
  /** Lo que hay que ingresar en el periodo para cubrir gastos, compras de producto y comisiones, y en cuántas citas. */
  break_even?: number;
  break_even_visits?: number;
  /** % del horario de trabajo que se llenó. */
  occupancy?: number;
  new_clients?: number;
  returning_clients?: number;
  top_services?: { name: string; count: number; income: number }[];
  /** Citas completadas por día de la semana (0 = lunes) y hora. */
  busy_hours?: { day: number; hour: number; count: number }[];
  tips_total?: number;
  /** Por servicio: lo que deja después de comisión, y por hora de trabajo. */
  service_stats?: { name: string; count: number; income: number; commission: number; supplies?: number; profit: number; hours: number; per_hour: number }[];
  /** Cobrado por día del periodo. */
  daily?: { date: string; total: number; count: number }[];
  low_stock?: { name: string; stock: number }[];
  cancelled_count?: number;
  no_show_count?: number;
  /** Citas cobradas que salieron con su siguiente cita agendada. */
  rebooked?: number;
  /** Gasto promedio de un cliente en toda su historia. */
  client_value?: number;
  discount_count?: number;
  discount_amount?: number;
  /** Citas creadas en el periodo por origen: page, admin, sin_dato. */
  by_source?: Record<string, number>;
  /** Mediana de días entre que reservan en la página y la cita. */
  lead_days?: number | null;
  /** Ingresos de los últimos 12 meses (AAAA-MM). */
  months?: { month: string; total: number }[];
  product_income: number;
  total: number;
  expense_fixed: number;
  expense_variable: number;
  commission_total: number;
  product_cost: number;
  profit: number;
  completed_count: number;
  average_ticket: number;
  missed_count: number;
  missed_amount: number;
  deposit_count: number;
  deposit_due: number;
  proofs_pending: number;
  no_shows: string[];
  deposits_expired: number;
  top_name: string;
  top_count: number;
  top_income: number;
  expenses: ShopExpense[];
  staff: CommissionRow[];
}

export interface AccountingMonth {
  month: string;
  by_method: Record<string, number>;
  service_income: number;
  product_income: number;
  total: number;
  by_category: Record<string, number>;
  expenses: number;
  commissions: number;
  tips: number;
  product_cost: number;
  profit: number;
}

@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  products(): Observable<ShopProduct[]> {
    return this.http.get<ShopProduct[]>(`${this.apiBaseUrl}/shop/products`);
  }

  create(name: string, price: number, stock: number, cost: number, iva: boolean): Observable<ShopProduct> {
    return this.http.post<ShopProduct>(`${this.apiBaseUrl}/shop/products`, { name, price, stock, cost, iva });
  }

  sell(id: number, qty: number, price: number, method: string): Observable<ShopProduct> {
    return this.http.post<ShopProduct>(`${this.apiBaseUrl}/shop/products/${id}/sell`, { qty, price, method });
  }

  receive(id: number, qty: number, cost: number, iva: boolean): Observable<ShopProduct> {
    return this.http.post<ShopProduct>(`${this.apiBaseUrl}/shop/products/${id}/in`, { qty, cost, iva });
  }

  moves(): Observable<StockMove[]> {
    return this.http.get<StockMove[]>(`${this.apiBaseUrl}/shop/moves`);
  }

  addExpense(name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null, category: string | null = null, payDay: number | null = null): Observable<ShopExpense> {
    return this.http.post<ShopExpense>(`${this.apiBaseUrl}/shop/expenses`, { name, amount, kind, cadence, category, pay_day: payDay });
  }

  updateExpense(id: number, name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null, category: string | null = null, payDay: number | null = null): Observable<ShopExpense> {
    return this.http.put<ShopExpense>(`${this.apiBaseUrl}/shop/expenses/${id}`, { name, amount, kind, cadence, category, pay_day: payDay });
  }

  markExpensePaid(id: number, due: string): Observable<{ due: string; paid_on: string }> {
    return this.http.post<{ due: string; paid_on: string }>(`${this.apiBaseUrl}/shop/expenses/${id}/paid`, { due });
  }

  unmarkExpensePaid(id: number, due: string): Observable<string> {
    return this.http.delete(`${this.apiBaseUrl}/shop/expenses/${id}/paid`, { params: { due }, responseType: 'text' });
  }

  getCash(day: string): Observable<CashDay> {
    return this.http.get<CashDay>(`${this.apiBaseUrl}/shop/cash`, { params: { day } });
  }

  saveCash(day: string, counted: number, note: string, opening: number): Observable<CashDay> {
    return this.http.put<CashDay>(`${this.apiBaseUrl}/shop/cash`, { day, counted, note, opening });
  }

  reopenCash(day: string): Observable<CashDay> {
    return this.http.post<CashDay>(`${this.apiBaseUrl}/shop/cash/reopen`, { day });
  }

  addCashMove(day: string, kind: 'in' | 'out', amount: number, reason: string, asExpense: boolean): Observable<CashDay> {
    return this.http.post<CashDay>(`${this.apiBaseUrl}/shop/cash/moves`, { day, kind, amount, reason, as_expense: asExpense });
  }

  removeCashMove(id: number): Observable<CashDay> {
    return this.http.delete<CashDay>(`${this.apiBaseUrl}/shop/cash/moves/${id}`);
  }

  removeExpense(id: number): Observable<string> {
    return this.http.delete(`${this.apiBaseUrl}/shop/expenses/${id}`, { responseType: 'text' });
  }

  /** Avisos para Inicio (semana, huecos, faltas, productos por acabarse). */
  alerts(): Observable<{ tone: string; text: string; link: string }[]> {
    return this.http.get<{ tone: string; text: string; link: string }[]>(`${this.apiBaseUrl}/shop/alerts`);
  }

  /** Por mes del año: ingresos por método y gastos por categoría, para el contador. */
  accounting(year: number): Observable<AccountingMonth[]> {
    return this.http.get<AccountingMonth[]>(`${this.apiBaseUrl}/shop/accounting`, { params: { year } });
  }

  /** Cortes de caja guardados entre dos fechas. */
  cashRange(start: string, end: string): Observable<CashRow[]> {
    return this.http.get<CashRow[]>(`${this.apiBaseUrl}/shop/cash/range`, { params: { start, end } });
  }

  report(start: string, end: string): Observable<SalesReport> {
    return this.http.get<SalesReport>(`${this.apiBaseUrl}/shop/report`, { params: { start, end } });
  }

  markCommission(staffId: number, start: string, end: string, amount: number, paid: boolean): Observable<string> {
    return this.http.post(`${this.apiBaseUrl}/shop/commissions`, { staff_id: staffId, start, end, amount, paid }, { responseType: 'text' });
  }
}
