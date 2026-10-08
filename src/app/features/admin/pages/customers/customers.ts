import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { BookingService, ClientCard } from '@core/services/booking.service';

interface GuestClient {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  visit_count: number;
  total_spent: number;
  cancel_count: number;
}

@Component({
  selector: 'app-customers',
  imports: [MatIconModule, FormsModule],
  templateUrl: './customers.html',
})
export class Customers {
  private readonly bookingApi = inject(BookingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  private readonly when = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  protected readonly clients = signal<GuestClient[]>([]);
  protected readonly query = signal('');
  protected readonly visible = computed(() => {
    const term = this.query().trim().toLowerCase();
    const list = this.clients();
    if (!term) {
      return list;
    }
    const digits = term.replace(/\D/g, '');
    return list.filter((client) => {
      const phone = client.phone.replace(/\D/g, '');
      return client.full_name.toLowerCase().includes(term) || client.phone.toLowerCase().includes(term) || (digits.length > 0 && phone.includes(digits));
    });
  });
  protected readonly best = computed(() =>
    this.clients()
      .filter((client) => client.total_spent > 0 || client.visit_count > 0)
      .sort((a, b) => b.total_spent - a.total_spent || b.visit_count - a.visit_count)
      .slice(0, 10),
  );
  protected readonly cancellers = computed(() =>
    this.clients()
      .filter((client) => client.cancel_count > 0)
      .sort((a, b) => b.cancel_count - a.cancel_count || b.total_spent - a.total_spent)
      .slice(0, 10),
  );
  protected readonly loadError = signal<string | null>(null);
  protected readonly card = signal<ClientCard | null>(null);
  protected readonly notes = signal('');
  protected readonly saved = signal(false);

  constructor() {
    this.bookingApi
      .getClients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (clients) => this.clients.set(clients),
        error: () => this.loadError.set('No pudimos cargar los clientes.'),
      });
  }

  protected open(id: number): void {
    this.saved.set(false);
    this.bookingApi
      .getClient(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((card) => {
        this.card.set(card);
        this.notes.set(card.internal_notes ?? '');
      });
  }

  protected close(): void {
    this.card.set(null);
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '·'
    );
  }

  protected spent(amount: number): string {
    return this.money.format(amount);
  }

  protected visitWhen(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : this.when.format(date);
  }

  protected saveNotes(): void {
    const card = this.card();
    if (!card) {
      return;
    }
    this.bookingApi
      .saveClientNotes(card.id, this.notes())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((next) => {
        this.card.set(next);
        this.saved.set(true);
      });
  }
}
