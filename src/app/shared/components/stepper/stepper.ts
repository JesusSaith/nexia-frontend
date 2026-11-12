import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface StepItem {
  id: number;
  label: string;
}

/**
 * Pasos de un proceso (reserva, asistente de bienvenida): círculos numerados unidos por una línea; los hechos llevan
 * palomita y el actual va resaltado. Toma el color de la marca (`--booking-primary` en la página pública, el acento en el panel).
 * Con `reached` y `(pick)` los pasos ya alcanzados se pueden tocar para volver; sin ellos solo muestra el avance.
 * Uso: <app-stepper [steps]="steps" [current]="step()" [reached]="reached()" (pick)="openStep($event)" label="Pasos de la reserva" />
 */
@Component({
  selector: 'app-stepper',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol [attr.aria-label]="label()">
      @for (item of steps(); track item.id) {
        <li [class.done]="current() > item.id" [class.current]="current() === item.id">
          @if (reached() !== null && item.id <= reached()! && item.id !== current()) {
            <button type="button" class="dot" [attr.aria-label]="'Ir a ' + item.label" (click)="pick.emit(item.id)">
              @if (current() > item.id) {
                <mat-icon aria-hidden="true">check</mat-icon>
              } @else {
                {{ item.id }}
              }
            </button>
          } @else {
            <span class="dot" [attr.aria-current]="current() === item.id ? 'step' : null">
              @if (current() > item.id) {
                <mat-icon aria-hidden="true">check</mat-icon>
              } @else {
                {{ item.id }}
              }
            </span>
          }
          <span class="name">{{ item.label }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; --c: var(--booking-primary, var(--color-accent)); }
    ol { display: flex; margin: 0; padding: 0; list-style: none; }
    li { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.375rem; min-width: 0; }
    /* Línea que une con el paso anterior. */
    li + li::before { content: ''; position: absolute; top: 1.125rem; right: 50%; width: 100%; height: 2px; background: var(--color-line-strong); }
    li.done::before, li.current::before { background: var(--c); }
    .dot { position: relative; z-index: 1; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; padding: 0; border-radius: 999px; border: 2px solid var(--color-line-strong); background: var(--color-surface); color: var(--color-muted); font: inherit; font-size: 0.875rem; font-weight: 600; }
    .dot mat-icon { width: 1.125rem; height: 1.125rem; font-size: 1.125rem; }
    button.dot { cursor: pointer; }
    button.dot::after { content: ''; position: absolute; inset: -0.25rem; }
    button.dot:focus-visible { outline: 2px solid var(--c); outline-offset: 3px; }
    .done .dot { background: var(--c); border-color: var(--c); color: #fff; }
    .current .dot { border-color: var(--c); color: var(--booking-ink, var(--c)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 18%, transparent); }
    .name { max-width: 100%; padding: 0 0.125rem; text-align: center; font-size: 0.8125rem; line-height: 1.2; color: var(--color-muted); overflow-wrap: anywhere; }
    .done .name { color: var(--color-ink-soft); }
    .current .name { color: var(--color-ink); font-weight: 600; }
  `,
})
export class Stepper {
  readonly steps = input.required<readonly StepItem[]>();
  /** Número del paso en que va. */
  readonly current = input.required<number>();
  /** Hasta qué paso ya se llegó; con valor, los pasos anteriores se pueden tocar. Sin valor, solo se muestra. */
  readonly reached = input<number | null>(null);
  readonly label = input('Pasos');
  readonly pick = output<number>();
}
