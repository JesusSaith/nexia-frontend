import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { PublicService, PublicStaff } from '@core/models/business.model';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';

@Component({
  selector: 'app-client-page',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './client-page.component.html',
})
export class ClientPageComponent {
  private readonly auth = inject(AuthService);
  private readonly bookingApi = inject(BookingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  protected readonly user = this.auth.currentUser;
  protected readonly staff = signal<PublicStaff[]>([]);
  protected readonly services = signal<PublicService[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly selected = computed(
    () => this.staff().find((member) => member.id === this.selectedId()) ?? this.staff()[0] ?? null,
  );

  protected readonly bookLink = computed(() => {
    const slug = this.user()?.slug;
    return slug ? ['/', slug, 'book'] : null;
  });

  constructor() {
    const slug = this.auth.currentUser()?.slug;
    if (!slug) {
      this.isLoading.set(false);
      this.loadError.set('Tu cuenta no está ligada a un negocio.');
      return;
    }
    forkJoin({
      staff: this.bookingApi.getPublicStaff(slug),
      services: this.bookingApi.getPublicServices(slug),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ staff, services }) => {
          this.staff.set(staff);
          this.services.set(services);
          this.selectedId.set(staff[0]?.id ?? null);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.loadError.set('No pudimos cargar el equipo.');
        },
      });
  }

  protected choose(id: number): void {
    this.selectedId.set(id);
  }

  protected priceLabel(member: PublicStaff): string {
    const prices = this.servicesFor(member).map((service) => service.price);
    if (prices.length === 0) {
      return '';
    }
    return this.currency.format(Math.min(...prices));
  }

  protected servicesFor(member: PublicStaff | null): PublicService[] {
    if (!member) {
      return [];
    }
    const ids = member.service_ids ?? [];
    const offered = this.services().filter((service) => ids.includes(service.id));
    return offered.length > 0 ? offered : this.services();
  }

  protected money(amount: number): string {
    return this.currency.format(amount);
  }

  protected logout(): void {
    this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.router.navigateByUrl('/auth/login');
    });
  }
}
