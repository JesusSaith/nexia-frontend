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
  paid: number;
}

export interface ShopExpense {
  id: number;
  name: string;
  amount: number;
  base: number;
  kind: string;
  cadence?: string | null;
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

  addExpense(name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null): Observable<ShopExpense> {
    return this.http.post<ShopExpense>(`${this.apiBaseUrl}/shop/expenses`, { name, amount, kind, cadence });
  }

  updateExpense(id: number, name: string, amount: number, kind: 'fixed' | 'variable', cadence: 'month' | 'week' | 'day' | null): Observable<ShopExpense> {
    return this.http.put<ShopExpense>(`${this.apiBaseUrl}/shop/expenses/${id}`, { name, amount, kind, cadence });
  }

  removeExpense(id: number): Observable<string> {
    return this.http.delete(`${this.apiBaseUrl}/shop/expenses/${id}`, { responseType: 'text' });
  }

  report(start: string, end: string): Observable<SalesReport> {
    return this.http.get<SalesReport>(`${this.apiBaseUrl}/shop/report`, { params: { start, end } });
  }

  markCommission(staffId: number, start: string, end: string, amount: number, paid: boolean): Observable<string> {
    return this.http.post(`${this.apiBaseUrl}/shop/commissions`, { staff_id: staffId, start, end, amount, paid }, { responseType: 'text' });
  }
}
