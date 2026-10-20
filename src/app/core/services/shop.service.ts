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
}

/** Corte de caja de un día (GET/PUT /api/shop/cash). */
export interface CashRow {
  day: string;
  expected: number;
  counted: number;
  difference: number;
  note: string | null;
}

export interface CashDay {
  day: string;
  by_method: Record<string, number>;
  expected_cash: number;
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
  /** Lo que hay que ingresar en el periodo para cubrir gastos y comisiones, y en cuántas citas. */
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
  /** Gasto promedio de una clienta en toda su historia. */
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

  sell(id: number, qty: number, price: number): Observable<ShopProduct> {
    return this.http.post<ShopProduct>(`${this.apiBaseUrl}/shop/products/${id}/sell`, { qty, price });
  }

  receive(id: number, qty: number, cost: number, iva: boolean): Observable<ShopProduct> {
    return this.http.post<ShopProduct>(`${this.apiBaseUrl}/shop/products/${id}/in`, { qty, cost, iva });
  }

  moves(): Observable<StockMove[]> {
    return this.http.get<StockMove[]>(`${this.apiBaseUrl}/shop/moves`);
  }

  addExpense(name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null, category: string | null = null): Observable<ShopExpense> {
    return this.http.post<ShopExpense>(`${this.apiBaseUrl}/shop/expenses`, { name, amount, kind, cadence, category });
  }

  updateExpense(id: number, name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null, category: string | null = null): Observable<ShopExpense> {
    return this.http.put<ShopExpense>(`${this.apiBaseUrl}/shop/expenses/${id}`, { name, amount, kind, cadence, category });
  }

  getCash(day: string): Observable<CashDay> {
    return this.http.get<CashDay>(`${this.apiBaseUrl}/shop/cash`, { params: { day } });
  }

  saveCash(day: string, counted: number, note: string): Observable<CashDay> {
    return this.http.put<CashDay>(`${this.apiBaseUrl}/shop/cash`, { day, counted, note });
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

  report(start: string, end: string): Observable<SalesReport> {
    return this.http.get<SalesReport>(`${this.apiBaseUrl}/shop/report`, { params: { start, end } });
  }

  markCommission(staffId: number, start: string, end: string, amount: number, paid: boolean): Observable<string> {
    return this.http.post(`${this.apiBaseUrl}/shop/commissions`, { staff_id: staffId, start, end, amount, paid }, { responseType: 'text' });
  }
}
