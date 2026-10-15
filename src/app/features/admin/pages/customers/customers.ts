import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { BusinessCopy } from '@core/business-copy';
import { firstName, whatsappLink } from '@core/message-templates';
import { AuthService } from '@core/services/auth.service';
import { BookingService, ClientCard } from '@core/services/booking.service';

interface GuestClient {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday?: string | null;
  visit_count: number;
  total_spent: number;
  cancel_count: number;
  last_visit?: string | null;
}

@Component({
  selector: 'app-customers',
  imports: [MatIconModule, FormsModule, RouterLink],
  templateUrl: './customers.html',
})
export class Customers {
  private readonly bookingApi = inject(BookingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly copy = inject(BusinessCopy);
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
  /** Clientas con al menos una visita que no vuelven hace más de 45 días. */
  protected readonly missing = computed(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() - 45);
    const cut = limit.toISOString().slice(0, 10);
    return this.clients()
      .filter((row) => row.last_visit && row.last_visit < cut)
      .sort((a, b) => (a.last_visit ?? '').localeCompare(b.last_visit ?? ''))
      .slice(0, 15);
  });
  /** Clientas que cumplen años hoy (el 29 de febrero se festeja el 28 en años no bisiestos). */
  protected readonly birthdays = computed(() => {
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
    return this.clients().filter((row) => {
      const day = row.birthday?.slice(5, 10);
      return day === today || (!leap && day === '02-29' && today === '02-28');
    });
  });
  protected readonly loadError = signal<string | null>(null);
  protected readonly card = signal<ClientCard | null>(null);
  protected readonly notes = signal('');
  protected readonly saved = signal(false);
  protected readonly birthdaySaved = signal(false);
  protected readonly birthdayError = signal<string | null>(null);
  /** Visita más reciente que ya ocurrió (si no hay, la última registrada) para repetirla. */
  protected readonly lastVisit = computed(() => {
    const visits = [...(this.card()?.visits ?? [])].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    const now = Date.now();
    const past = visits.filter((visit) => new Date(visit.starts_at).getTime() <= now);
    return past.find((visit) => visit.status !== 'cancelled') ?? past[0] ?? visits[0] ?? null;
  });

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
    this.birthdaySaved.set(false);
    this.birthdayError.set(null);
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

  protected saveBirthday(value: string): void {
    const card = this.card();
    const birthday = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    if (!card || (value && !birthday) || (card.birthday ?? null) === birthday) {
      return;
    }
    this.birthdaySaved.set(false);
    this.birthdayError.set(null);
    this.bookingApi
      .saveClientBirthday(card.id, birthday)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (next) => {
          this.card.set(next);
          this.birthdaySaved.set(true);
          this.clients.update((rows) => rows.map((row) => (row.id === next.id ? { ...row, birthday: next.birthday ?? null } : row)));
        },
        error: () => this.birthdayError.set('No pudimos guardar el cumpleaños.'),
      });
  }

  protected repeatLast(): void {
    const card = this.card();
    const visit = this.lastVisit();
    if (!card || !visit) {
      return;
    }
    const queryParams: Record<string, string | number> = { nueva: 1, tel: card.phone };
    if (visit.service_id) {
      queryParams['servicio'] = visit.service_id;
    }
    if (visit.staff_id) {
      queryParams['con'] = visit.staff_id;
    }
    void this.router.navigate(['/admin/agenda'], { queryParams });
  }

  protected birthdayWish(row: GuestClient): string {
    return whatsappLink(row.phone, this.copy.message('birthday', { nombre: firstName(row.full_name), negocio: this.shopName() }));
  }

  private shopName(): string {
    return this.auth.currentUser()?.businessName ?? '';
  }

  protected digits(phone: string | null | undefined): string {
    return (phone ?? '').replace(/\D/g, '');
  }

  protected daysAway(day: string | null | undefined): number {
    return day ? Math.floor((Date.now() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000) : 0;
  }

  protected missYou(row: GuestClient): string {
    return whatsappLink(row.phone, this.copy.message('miss_you', { nombre: firstName(row.full_name), negocio: this.shopName() }));
  }
}


