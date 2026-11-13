import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { canSplitPay, splitCardAmount, splitProblem } from '@core/split-pay';
import { pesos } from '@core/money';

/**
 * Pago con tarjeta en parte o solo la propina: "Dividir el pago con tarjeta" (cuánto pagó con tarjeta y el resto va
 * en efectivo o transferencia) y "La propina fue con tarjeta". Se usa igual al cobrar, al registrar un servicio
 * realizado y al corregir un cobro. No pinta nada si el negocio no acepta tarjeta o la cita ya fue con tarjeta.
 * Uso: <app-split-pay [method]="m" [due]="falta" [tip]="propina" [cardAccepted]="true" [(on)]="a" [(card)]="b" [(tipCard)]="c" />
 */
@Component({
  selector: 'app-split-pay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (can()) {
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <button type="button" class="chip h-11!" [class.chip-on]="on()" [attr.aria-pressed]="on()" (click)="on.set(!on())">Dividir el pago con tarjeta</button>
          @if (tip() > 0) {
            <button type="button" class="chip h-11!" [class.chip-on]="tipCard()" [attr.aria-pressed]="tipCard()" (click)="tipCard.set(!tipCard())">La propina fue con tarjeta</button>
          }
        </div>
        @if (on()) {
          <label class="block">
            <span class="label">Cuánto pagó con tarjeta</span>
            <input class="input nums" type="number" min="0" inputmode="decimal" placeholder="0" [value]="card()" (input)="card.set($any($event.target).value)" />
            @if (problem() && card().trim()) {
              <span class="field-error">Escribe una cantidad menor a lo que falta del servicio.</span>
            } @else if (amount() > 0 && !problem()) {
              <span class="field-hint">El resto{{ rest() === null ? '' : ', ' + money(rest() ?? 0) + ',' }} lo cobras en {{ method() === 'efectivo' ? 'efectivo' : 'transferencia' }}.</span>
            } @else {
              <span class="field-hint">Escribe cuánto pagó con tarjeta; el resto lo cobras en {{ method() === 'efectivo' ? 'efectivo' : 'transferencia' }}.</span>
            }
          </label>
        }
      </div>
    }
  `,
})
export class SplitPay {
  /** Forma de pago elegida: el resto de la cita va con esta. */
  readonly method = input.required<string>();
  /** Lo que falta por cobrar de la cita (sin anticipo): la parte con tarjeta debe ser menor. */
  readonly due = input.required<number>();
  readonly tip = input(0);
  /** Lo que queda por cobrar en efectivo o transferencia, si se quiere mostrar. */
  readonly rest = input<number | null>(null);
  readonly cardAccepted = input(true);

  readonly on = model(false);
  readonly card = model('');
  readonly tipCard = model(false);

  protected readonly can = computed(() => canSplitPay(this.method(), this.cardAccepted()));
  protected readonly amount = computed(() => splitCardAmount(this.on(), this.card(), this.method(), this.cardAccepted()));
  protected readonly problem = computed(() => splitProblem(this.on(), this.card(), this.method(), this.cardAccepted(), this.due()));
  protected readonly money = pesos;
}
