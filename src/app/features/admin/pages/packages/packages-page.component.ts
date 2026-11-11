import { Loader } from '@shared/components/loader/loader';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { pesos } from '@core/money';
import { Service } from '@core/models/service.model';
import { PackageOffer, PackageOrderRow, PackagesService } from '@core/services/packages.service';
import { ServicesService } from '@core/services/services.service';
import { SettingsService } from '@core/services/settings.service';
import { Toasts } from '@core/toasts';
import { Confirm } from '@shared/components/confirm/confirm';
import { FormStatusComponent } from '@shared/components/form-status/form-status';

@Component({
  selector: 'app-packages-page',
  imports: [Loader, FormsModule, MatIconModule, FormStatusComponent],
  templateUrl: './packages-page.component.html',
})
export class PackagesPageComponent {
  private readonly api = inject(PackagesService);
  private readonly servicesApi = inject(ServicesService);
  private readonly settingsApi = inject(SettingsService);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pesos = pesos;
  protected readonly offers = signal<PackageOffer[]>([]);
  protected readonly orders = signal<PackageOrderRow[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  /** Sin cuenta para transferir, los paquetes no se muestran en la página pública. */
  protected readonly hasAccount = signal(true);
  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly proof = signal<{ id: number; image: string | null } | null>(null);
  protected readonly working = signal<number | null>(null);

  protected name = '';
  protected serviceId: number | null = null;
  protected visits: number | null = null;
  protected price: number | null = null;
  protected validDays: number | null = null;

  protected readonly waiting = computed(() => this.orders().filter((row) => row.status === 'awaiting'));
  protected readonly done = computed(() => this.orders().filter((row) => row.status !== 'awaiting').slice(0, 8));

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    forkJoin({
      offers: this.api.offers(),
      orders: this.api.orders(),
      services: this.servicesApi.getServices(),
      settings: this.settingsApi.getSettings().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ offers, orders, services, settings }) => {
          this.offers.set(offers);
          this.orders.set(orders);
          this.services.set(services.filter((row) => row.is_active && !row.is_hold));
          this.hasAccount.set(settings ? !!settings.deposit_account : true);
          this.loadError.set('');
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('No pudimos cargar tus paquetes. Revisa tu conexión e intenta de nuevo.');
          this.loading.set(false);
        },
      });
  }

  protected missing(): string[] {
    const missing: string[] = [];
    if (this.serviceId === null) {
      missing.push('Para qué servicio');
    }
    if ((this.visits ?? 0) < 2) {
      missing.push('Visitas (mínimo 2)');
    }
    if ((this.price ?? 0) <= 0) {
      missing.push('Precio total');
    }
    if (!this.name.trim()) {
      missing.push('Nombre en tu página');
    }
    return missing;
  }

  protected openForm(): void {
    this.name = '';
    this.serviceId = null;
    this.visits = null;
    this.price = null;
    this.validDays = null;
    this.formError.set('');
    this.creating.set(true);
  }

  /** Propone un nombre cuando ya hay servicio y visitas, para no empezar de cero. */
  protected suggestName(): void {
    const service = this.services().find((row) => row.id === this.serviceId);
    if (!this.name.trim() && service && this.visits && this.visits >= 2) {
      this.name = `${this.visits} × ${service.name}`.slice(0, 80);
    }
  }

  protected perVisit(): string {
    return this.visits && this.visits >= 2 && this.price && this.price > 0 ? pesos(Math.round((this.price / this.visits) * 100) / 100) : '';
  }

  /** Cuánto ahorra frente al precio de lista (solo si el servicio tiene precio fijo). */
  protected savings(): string {
    const service = this.services().find((row) => row.id === this.serviceId);
    if (!service || service.variable_price || !service.price || !this.visits || !this.price) {
      return '';
    }
    const diff = service.price * this.visits - this.price;
    return diff > 0 ? `Tu cliente ahorra ${pesos(diff)} frente a pagar cada visita.` : '';
  }

  protected save(): void {
    if (this.missing().length || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.api
      .createOffer({ service_id: this.serviceId as number, name: this.name.trim(), visits: this.visits as number, price: this.price as number, valid_days: this.validDays || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offer) => {
          this.offers.update((rows) => [...rows, offer]);
          this.creating.set(false);
          this.saving.set(false);
          this.toasts.show('Listo, ya puedes venderlo en tu página.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(error instanceof HttpErrorResponse && typeof error.error?.detail === 'string' ? error.error.detail : 'No pudimos guardar el paquete. Intenta de nuevo.');
        },
      });
  }

  protected toggle(offer: PackageOffer): void {
    this.api
      .updateOffer(offer.id, { is_active: !offer.is_active })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => {
          this.offers.update((rows) => rows.map((item) => (item.id === row.id ? row : item)));
          this.toasts.show(row.is_active ? 'Paquete activado.' : 'Paquete pausado: ya no sale en tu página.');
        },
        error: () => this.toasts.show('No pudimos cambiarlo. Intenta de nuevo.'),
      });
  }

  protected async remove(offer: PackageOffer): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Borrar "${offer.name}"?`,
      message: 'Deja de salir en tu página. Los pedidos y paquetes que ya vendiste no cambian.',
      confirm: 'Borrar',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.api
      .removeOffer(offer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.offers.update((rows) => rows.filter((item) => item.id !== offer.id));
          this.toasts.show('Paquete borrado.');
        },
        error: () => this.toasts.show('No pudimos borrarlo. Intenta de nuevo.'),
      });
  }

  protected seeProof(order: PackageOrderRow): void {
    this.api
      .orderProof(order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => this.proof.set({ id: order.id, image: row.image }),
        error: () => this.toasts.show('No pudimos abrir el comprobante.'),
      });
  }

  protected async approve(order: PackageOrderRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Ya te llegó el pago de ${order.client_name}?`,
      message: `Al aprobarlo, ${order.client_name} queda con ${order.visits} visitas de "${order.name}" y ya las puede usar al reservar.`,
      confirm: 'Sí, aprobar',
    });
    if (ok) {
      this.resolve(order, true);
    }
  }

  protected async reject(order: PackageOrderRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Rechazar el pedido de ${order.client_name}?`,
      message: 'No se le da el paquete. Si ya te pagó, escríbele para aclararlo.',
      confirm: 'Rechazar',
      danger: true,
    });
    if (ok) {
      this.resolve(order, false);
    }
  }

  private resolve(order: PackageOrderRow, approve: boolean): void {
    this.working.set(order.id);
    (approve ? this.api.approveOrder(order.id) : this.api.rejectOrder(order.id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (row) => {
        this.orders.update((rows) => rows.map((item) => (item.id === row.id ? row : item)));
        this.working.set(null);
        this.proof.set(null);
        this.toasts.show(approve ? 'Listo, el paquete ya está activo.' : 'Pedido rechazado.');
      },
      error: (error: unknown) => {
        this.working.set(null);
        this.toasts.show(error instanceof HttpErrorResponse && typeof error.error?.detail === 'string' ? error.error.detail : 'No pudimos guardarlo. Intenta de nuevo.');
      },
    });
  }

  protected validity(offer: { valid_days: number | null }): string {
    return offer.valid_days ? `Vale ${offer.valid_days} días` : 'No vence';
  }

  protected whatsapp(order: PackageOrderRow): string {
    return `https://wa.me/52${order.client_phone}`;
  }

  protected statusLabel(order: PackageOrderRow): string {
    return order.status === 'approved' ? 'Aprobado' : 'Rechazado';
  }
}
