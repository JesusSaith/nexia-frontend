import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, of, switchMap } from 'rxjs';

import { BusinessCopy } from '@core/business-copy';
import { Service } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { AuthService } from '@core/services/auth.service';
import { SchedulesService } from '@core/services/schedules.service';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';
import { Toasts } from '@core/toasts';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Asistente de bienvenida (/admin/bienvenida): justo después del registro, en 3 pasos deja la
 * página lista para reservar: quién atiende, horario base y qué servicios se ofrecen.
 * Usa las mismas APIs que Equipo, Horarios y Servicios; se puede saltar y retomar desde Inicio.
 */
@Component({
  selector: 'app-welcome-page',
  imports: [MatIconModule, RouterLink],
  templateUrl: './welcome-page.html',
})
export class WelcomePageComponent {
  private readonly staffApi = inject(StaffService);
  private readonly schedulesApi = inject(SchedulesService);
  private readonly servicesApi = inject(ServicesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly copy = inject(BusinessCopy);

  protected readonly days = DAYS;
  protected readonly step = signal(1);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // Paso 1: quién atiende.
  protected readonly existing = signal<Staff[]>([]);
  protected readonly withTeam = signal(false);
  protected readonly ownerName = signal(this.auth.currentUser()?.fullName ?? '');
  protected readonly ownerWorks = signal(true);
  protected readonly teamNames = signal<string[]>(['']);

  // Paso 2: horario base (0 = lunes, como el backend).
  protected readonly openDays = signal<ReadonlySet<number>>(new Set([0, 1, 2, 3, 4, 5]));
  protected readonly opens = signal('10:00');
  protected readonly closes = signal('19:00');

  // Paso 3: servicios (los sugeridos llegan apagados desde el registro).
  protected readonly services = signal<Service[]>([]);
  protected readonly picked = signal<ReadonlySet<number>>(new Set());
  protected readonly prices = signal<Record<number, string>>({});

  protected readonly pickedCount = computed(() => this.picked().size);

  constructor() {
    forkJoin({ staff: this.staffApi.getStaff(), services: this.servicesApi.getServices() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ staff, services }) => {
          const active = staff.filter((member) => member.is_active);
          this.existing.set(active);
          this.ownerWorks.set(!active.length);
          this.services.set(services);
          this.picked.set(new Set(services.filter((item) => item.is_active).map((item) => item.id)));
          this.prices.set(Object.fromEntries(services.map((item) => [item.id, String(item.price)])));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('No pudimos cargar tu negocio. Recarga la página.');
        },
      });
  }

  protected setTeamName(index: number, value: string): void {
    this.teamNames.update((names) => names.map((name, position) => (position === index ? value : name)));
  }

  protected addTeamName(): void {
    this.teamNames.update((names) => (names.length < 8 ? [...names, ''] : names));
  }

  protected toggleDay(day: number): void {
    this.openDays.update((current) => {
      const next = new Set(current);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  protected togglePick(id: number): void {
    this.picked.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected setPrice(id: number, value: string): void {
    this.prices.update((current) => ({ ...current, [id]: value }));
  }

  /** Paso 1 → crea a quien falte (la dueña y su equipo) y sigue. */
  protected saveTeam(): void {
    const names = [
      ...(this.ownerWorks() ? [this.ownerName().trim()] : []),
      ...(this.withTeam() ? this.teamNames().map((name) => name.trim()) : []),
    ].filter(Boolean);
    const known = new Set(this.existing().map((member) => member.full_name.trim().toLowerCase()));
    const fresh = [...new Set(names)].filter((name) => !known.has(name.toLowerCase()));
    if (!fresh.length && !this.existing().length) {
      this.error.set(`Agrega al menos a una persona que atienda.`);
      return;
    }
    this.run(
      fresh.length
        ? forkJoin(fresh.map((full_name) => this.staffApi.createStaff({ full_name, role_title: this.copy.text().person, email: null, phone: null })))
        : of([] as Staff[]),
      (created) => {
        this.existing.update((current) => [...current, ...created]);
        this.step.set(2);
      },
    );
  }

  /** Paso 2 → el mismo horario para todo el equipo. */
  protected saveHours(): void {
    if (!this.openDays().size || this.closes() <= this.opens()) {
      this.error.set('Elige al menos un día y una hora de cierre después de la de apertura.');
      return;
    }
    const items = DAYS.map((_, day) => ({ day_of_week: day, start_time: this.opens(), end_time: this.closes(), is_active: this.openDays().has(day) }));
    this.run(forkJoin(this.existing().map((member) => this.schedulesApi.updateStaffSchedule(member.id, items))), () => this.step.set(3));
  }

  /** Paso 3 → prende los elegidos con su precio y se los asigna a todo el equipo. */
  protected saveServices(): void {
    if (!this.picked().size) {
      this.error.set('Elige al menos un servicio para que tu página pueda recibir reservas.');
      return;
    }
    const updates = this.services()
      .map((item) => {
        const active = this.picked().has(item.id);
        const price = Math.max(0, Number(this.prices()[item.id]) || 0);
        return active !== item.is_active || (active && price !== item.price) ? this.servicesApi.updateService(item.id, active ? { is_active: true, price } : { is_active: false }) : null;
      })
      .filter((request): request is Observable<Service> => request !== null);
    const ids = [...this.picked()];
    this.run(
      (updates.length ? forkJoin(updates) : of([])).pipe(
        switchMap(() => forkJoin(this.existing().map((member) => this.staffApi.updateStaffServices(member.id, [...new Set([...(member.service_ids ?? []), ...ids])])))),
      ),
      () => {
        this.toasts.show('¡Listo! Tu página ya puede recibir reservas.');
        void this.router.navigateByUrl('/admin/home');
      },
    );
  }

  protected back(): void {
    this.error.set(null);
    this.step.update((current) => Math.max(1, current - 1));
  }

  private run<T>(request: Observable<T>, done: (value: T) => void): void {
    this.error.set(null);
    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.saving.set(false);
        done(value);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
        this.error.set(typeof detail === 'string' ? detail : 'No pudimos guardar. Inténtalo de nuevo.');
      },
    });
  }
}
