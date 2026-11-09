import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { loadFailure } from '@core/load-failure';
import { pesos } from '@core/money';
import { BusinessBrand } from '@core/models/business.model';
import { BookingService, PublicPackageOffer, PublicPackageOrder } from '@core/services/booking.service';

/** Paquetes del negocio: se elige uno, se transfiere y se sube el comprobante. El negocio lo aprueba. */
@Component({
  selector: 'app-public-packages',
  imports: [FormsModule, MatIconModule, RouterLink],
  templateUrl: './packages.component.html',
})
export class PublicPackagesComponent {
  private readonly api = inject(BookingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly slug = this.route.snapshot.paramMap.get('businessSlug') ?? '';
  private readonly token = this.route.snapshot.paramMap.get('token');

  protected readonly pesos = pesos;
  protected readonly brand = signal<BusinessBrand | null>(null);
  protected readonly offers = signal<PublicPackageOffer[]>([]);
  protected readonly order = signal<PublicPackageOrder | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly picked = signal<PublicPackageOffer | null>(null);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly copied = signal(false);

  protected name = '';
  protected phone = '';

  protected readonly canSend = computed(() => !!this.picked() && !this.saving());

  constructor() {
    this.api.getPublicBusiness(this.slug).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (brand) => {
        this.brand.set(brand);
        document.title = `Paquetes · ${brand.name}`;
      },
      error: (error: unknown) => {
        this.loadError.set(loadFailure(error).message);
        this.loading.set(false);
      },
    });
    if (this.token) {
      this.api.packageOrder(this.token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (row) => {
          this.order.set(row);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('No encontramos tu pedido. Revisa que el enlace esté completo.');
          this.loading.set(false);
        },
      });
    } else {
      this.api.packageOffers(this.slug).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (rows) => {
          this.offers.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('No pudimos cargar los paquetes. Revisa tu conexión e intenta de nuevo.');
          this.loading.set(false);
        },
      });
    }
  }

  protected each(offer: PublicPackageOffer): string {
    return pesos(Math.round((offer.price / offer.visits) * 100) / 100);
  }

  protected validity(days: number | null): string {
    return days ? `Lo puedes usar durante ${days} días.` : 'No vence.';
  }

  /** Lo que falta para poder pedirlo, en palabras. */
  protected missing(): string[] {
    const missing: string[] = [];
    if (!this.picked()) {
      missing.push('Elige un paquete');
    }
    if (!this.name.trim()) {
      missing.push('Tu nombre');
    }
    if (this.phone.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '').length !== 10) {
      missing.push('Tu celular a 10 dígitos');
    }
    return missing;
  }

  protected send(): void {
    const offer = this.picked();
    if (!offer || this.missing().length || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set('');
    this.api
      .orderPackage(this.slug, { offer_id: offer.id, client_name: this.name.trim(), client_phone: this.phone })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => {
          this.saving.set(false);
          void this.router.navigate(['/', this.slug, 'paquetes', row.token]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(readError(error, 'No pudimos guardar tu pedido. Intenta de nuevo.'));
        },
      });
  }

  protected copyAccount(): void {
    const account = this.order()?.deposit_account;
    if (account) {
      void navigator.clipboard.writeText(account).then(() => this.copied.set(true));
    }
  }

  protected onProof(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.token) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 480 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.72);
        if (data.length > 180000) {
          this.errorMessage.set('Esa foto es demasiado pesada. Prueba con una captura de pantalla.');
          return;
        }
        this.saving.set(true);
        this.errorMessage.set('');
        this.api
          .uploadPackageProof(this.token as string, data)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (row) => {
              this.order.set(row);
              this.saving.set(false);
            },
            error: (error: unknown) => {
              this.saving.set(false);
              this.errorMessage.set(readError(error, 'No pudimos subir el comprobante. Intenta de nuevo.'));
            },
          });
      };
      image.onerror = () => this.errorMessage.set('No pudimos leer esa imagen. Prueba con otra.');
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
    return error.error.detail;
  }
  return fallback;
}
