import { MatIconModule } from '@angular/material/icon';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { loyaltyCard, loyaltyText, stepBadge, stepText, type LoyaltyPlan } from '@core/loyalty';

/** Tarjeta de cliente frecuente: casillas numeradas y, en las visitas con premio, lo que se gana. */
@Component({
  selector: 'app-loyalty-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (card(); as c) {
      <div class="rounded-xl border border-line bg-surface p-3" role="group" [attr.aria-label]="text()">
        @if (c.cycle <= 15) {
          <div class="grid grid-cols-5 gap-2" aria-hidden="true">
            @for (slot of c.slots; track slot.n) {
              <span
                class="nums flex h-11 min-w-0 items-center justify-center rounded-full border px-1 text-center text-xs"
                [class.font-semibold]="slot.step"
                [class.bg-accent]="slot.state === 'on'"
                [class.text-on-primary]="slot.state === 'on'"
                [class.bg-accent-soft]="slot.state !== 'on' && slot.step"
                [class.text-accent]="slot.state !== 'on' && slot.step"
                [class.text-muted]="slot.state !== 'on' && !slot.step"
                [class.border-accent]="slot.state !== 'off' || slot.step"
                [class.border-line]="slot.state === 'off' && !slot.step"
                [class.ring-2]="slot.state === 'next'"
                [class.ring-accent]="slot.state === 'next'"
              >
                @if (slot.step) {
                  @if (slot.step.kind === 'gift') {
                    <mat-icon class="!h-5 !w-5 !text-[20px]">redeem</mat-icon>
                  } @else {
                    {{ badge(slot.step) }}
                  }
                } @else if (slot.state === 'on') {
                  <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">check</mat-icon>
                } @else {
                  {{ slot.n }}
                }
              </span>
            }
          </div>
        } @else {
          <div class="h-2 overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
            <div class="h-full rounded-full bg-accent" [style.width.%]="(c.done / c.cycle) * 100"></div>
          </div>
        }
        <p class="mt-2 text-sm text-ink">{{ text() }}</p>
        @if (c.cycle > 15 || hasExtras()) {
          <ul class="mt-2 flex flex-wrap gap-1.5">
            @for (step of plan()?.steps ?? []; track step.visit) {
              <li class="chip text-xs"><span class="nums">Visita {{ step.visit }}:</span> {{ describe(step) }}</li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class LoyaltyCardComponent {
  readonly plan = input<LoyaltyPlan | null | undefined>(null);
  /** Visitas cobradas más citas en pie. */
  readonly booked = input(0);
  /** Solo visitas cobradas; si no se manda, igual a `booked`. */
  readonly completed = input<number | null>(null);
  readonly audience = input<'client' | 'owner'>('client');
  /** Nombres de los servicios por id, para el premio "servicio gratis". */
  readonly names = input<Record<number, string>>({});

  protected readonly card = computed(() => loyaltyCard(this.plan(), this.booked(), this.completed() ?? this.booked()));
  protected readonly text = computed(() => {
    const c = this.card();
    return c ? loyaltyText(c, this.audience(), this.names()) : '';
  });
  protected readonly badge = stepBadge;
  /** Descuentos de un solo número se leen en la casilla; regalos y servicios gratis llevan su detalle abajo. */
  protected readonly hasExtras = computed(() => (this.plan()?.steps ?? []).some((step) => step.kind !== 'percent'));
  protected describe(step: Parameters<typeof stepText>[0]): string {
    return stepText(step, this.names());
  }
}
