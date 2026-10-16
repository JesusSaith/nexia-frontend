import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ManagedAppointment, BookingService } from '@core/services/booking.service';
import { SPEI_BANKS } from '@core/spei-banks';

/**
 * "Ya transferí": la clienta pone banco, clave de rastreo, fecha y monto, y Banxico (CEP) confirma
 * la transferencia. Si cuadra, la cita queda pagada sin que la dueña revise nada.
 */
@Component({
  selector: 'app-spei-check',
  template: `
    @if (!open()) {
      <button type="button" class="mt-3 flex h-11 w-full items-center justify-center rounded-full border border-ink text-sm font-medium text-ink" (click)="open.set(true)">
        Ya transferí: confirmar al instante
      </button>
    } @else {
      <form class="mt-3 flex w-full flex-col gap-3 rounded-2xl border border-stone-200 p-4 text-left text-sm" (submit)="$event.preventDefault(); check()">
        <p class="font-medium">Confirma tu transferencia con Banxico</p>
        <label class="flex flex-col gap-1">
          <span class="text-stone-600">Banco desde el que transferiste</span>
          <select class="h-11 rounded-xl border border-stone-300 bg-white px-3" [value]="bank()" (change)="bank.set($any($event.target).value)">
            <option value="">Elegir</option>
            @for (item of banks; track item.code) {
              <option [value]="item.code">{{ item.name }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-stone-600">Clave de rastreo</span>
          <input class="h-11 rounded-xl border border-stone-300 bg-white px-3 uppercase" autocomplete="off" maxlength="30" [value]="tracking()" (input)="tracking.set($any($event.target).value.replace(/\\s/g, ''))" placeholder="Viene en el comprobante de tu app" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-stone-600">Fecha</span>
            <input class="h-11 rounded-xl border border-stone-300 bg-white px-3" type="date" [attr.max]="today" [value]="day()" (change)="day.set($any($event.target).value)" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-stone-600">Monto</span>
            <input class="h-11 rounded-xl border border-stone-300 bg-white px-3" type="number" min="1" step="0.01" inputmode="decimal" [value]="amountText() || (amount() ?? '')" (input)="amountText.set($any($event.target).value)" />
          </label>
        </div>
        @if (error(); as message) {
          <p class="text-red-700" role="alert">{{ message }}</p>
        }
        <button type="submit" class="flex h-11 items-center justify-center rounded-full bg-ink text-sm font-medium text-white disabled:opacity-50" [disabled]="busy()">
          {{ busy() ? 'Consultando a Banxico…' : 'Confirmar pago' }}
        </button>
        <p class="text-xs text-stone-500">Si no tienes la clave de rastreo, sube la foto del comprobante y el negocio la revisa.</p>
      </form>
    }
  `,
})
export class SpeiCheckComponent {
  readonly token = input.required<string>();
  readonly amount = input<number | null>(null);
  readonly verified = output<ManagedAppointment>();

  private readonly bookingApi = inject(BookingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly banks = SPEI_BANKS;
  protected readonly today = isoToday();
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly bank = signal('');
  protected readonly tracking = signal('');
  protected readonly day = signal(isoToday());
  protected readonly amountText = signal('');

  protected check(): void {
    const amount = Number(this.amountText() || this.amount());
    if (!this.bank() || this.tracking().length < 6 || !this.day() || !(amount > 0)) {
      this.error.set('Llena banco, clave de rastreo, fecha y monto.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.bookingApi
      .verifySpei(this.token(), { bank: this.bank(), tracking: this.tracking().toUpperCase(), day: this.day(), amount })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appointment) => {
          this.busy.set(false);
          this.verified.emit(appointment);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
          this.error.set(typeof detail === 'string' ? detail : 'No pudimos consultar a Banxico. Sube la foto del comprobante.');
        },
      });
  }
}

function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
