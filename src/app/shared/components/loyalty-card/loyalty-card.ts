import { MatIconModule } from '@angular/material/icon';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { loyaltyCard, loyaltyText } from '@core/loyalty';

/** Tarjeta de cliente frecuente: círculos de sellos y el premio al final. */
@Component({
  selector: 'app-loyalty-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (card(); as c) {
      <div class="rounded-xl border border-line bg-surface p-3" role="group" [attr.aria-label]="text()">
        <div class="flex items-center gap-1.5">
          @for (stamp of c.stamps; track $index) {
            <span
              class="flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border text-xs"
              [class.bg-accent]="stamp === 'on'"
              [class.text-on-primary]="stamp === 'on'"
              [class.border-accent]="stamp !== 'off'"
              [class.border-line]="stamp === 'off'"
              [class.text-muted]="stamp !== 'on'"
              aria-hidden="true"
            >
              @if (stamp === 'on') {
                <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">check</mat-icon>
              } @else {
                <span class="nums">{{ $index + 1 }}</span>
              }
            </span>
          }
          <span
            class="nums flex h-8 flex-[1.4] items-center justify-center rounded-full px-2 text-xs font-semibold"
            [class.bg-accent]="c.hit || c.reserved"
            [class.text-on-primary]="c.hit || c.reserved"
            [class.bg-accent-soft]="!c.hit && !c.reserved"
            [class.text-accent]="!c.hit && !c.reserved"
            aria-hidden="true"
          >
            {{ c.percent }}%
          </span>
        </div>
        <p class="mt-2 text-sm text-ink">{{ text() }}</p>
      </div>
    }
  `,
})
export class LoyaltyCardComponent {
  readonly every = input<number | null | undefined>(null);
  readonly percent = input<number | null | undefined>(null);
  /** Visitas cobradas más citas en pie. */
  readonly booked = input(0);
  /** Solo visitas cobradas; si no se manda, igual a `booked`. */
  readonly completed = input<number | null>(null);
  readonly audience = input<'client' | 'owner'>('client');

  protected readonly card = computed(() => loyaltyCard(this.every(), this.percent(), this.booked(), this.completed() ?? this.booked()));
  protected readonly text = computed(() => {
    const c = this.card();
    return c ? loyaltyText(c, this.audience()) : '';
  });
}
