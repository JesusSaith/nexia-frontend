import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { SearchAppointment, SearchResult, SearchService } from '@core/services/search.service';

const STATUS_LABELS: Record<SearchAppointment['status'], string> = {
  scheduled: 'Agendada',
  awaiting_deposit: 'Espera anticipo',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No llegó',
};

/**
 * Buscador global del panel (abre desde el menú, la barra del celular o Ctrl/Cmd + K).
 * Escribe un nombre o parte del teléfono y salta a la ficha del cliente o a la cita en la Agenda.
 */
@Component({
  selector: 'app-global-search',
  imports: [MatIconModule],
  templateUrl: './global-search.html',
})
export class GlobalSearchComponent {
  private readonly api = inject(SearchService);
  private readonly router = inject(Router);
  private readonly ref = inject(MatDialogRef<GlobalSearchComponent>);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly copy = inject(BusinessCopy);

  protected readonly query = signal('');
  protected readonly result = signal<SearchResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private readonly typed = new Subject<string>();

  private readonly day = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  private readonly hour = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });

  constructor() {
    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((text) => {
          if (text.length < 2) {
            this.loading.set(false);
            return of(null);
          }
          this.loading.set(true);
          this.failed.set(false);
          return this.api.search(text).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((found) => {
        this.loading.set(false);
        this.result.set(found);
      });
  }

  protected type(value: string): void {
    this.query.set(value);
    const text = value.trim();
    if (text.length < 2) {
      this.result.set(null);
      this.failed.set(false);
    }
    this.typed.next(text);
  }

  protected get tooShort(): boolean {
    return this.query().trim().length < 2;
  }

  protected get empty(): boolean {
    const found = this.result();
    return !!found && !found.clients.length && !found.appointments.length;
  }

  protected whenText(item: SearchAppointment): string {
    const start = new Date(item.starts_at);
    return `${this.day.format(start)} · ${this.hour.format(start)}`;
  }

  protected statusText(item: SearchAppointment): string {
    return STATUS_LABELS[item.status];
  }

  protected showClient(id: number): void {
    this.ref.close();
    void this.router.navigate(['/admin/clientes'], { queryParams: { ficha: id } });
  }

  protected async showAppointment(item: SearchAppointment): Promise<void> {
    this.ref.close();
    // Si ya está en la Agenda, la pantalla no se vuelve a armar sola: se pasa por otra y se regresa, para que abra la cita.
    if (this.router.url.startsWith('/admin/agenda')) {
      await this.router.navigateByUrl('/admin/clientes', { skipLocationChange: true });
    }
    void this.router.navigate(['/admin/agenda'], { queryParams: { dia: item.starts_at.slice(0, 10), cita: item.id } });
  }

  protected close(): void {
    this.ref.close();
  }
}
