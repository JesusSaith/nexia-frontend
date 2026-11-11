import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { MatIconModule } from '@angular/material/icon';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, DestroyRef, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { CalendarComponent } from '../calendar/calendar';
import { WheelColumnComponent, WheelItem } from '../wheel/wheel-column';

function clock(value: string): string {
  return value.slice(0, 5);
}

/** "15:30" -> "3:30 PM" (se guarda siempre en 24 h; solo se muestra en 12 h). */
export function clock12(value: string): string {
  if (!/^\d{1,2}:\d{2}/.test(value)) {
    return '';
  }
  const [hour, minute] = clock(value).split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function openSheet(overlay: Overlay, view: ViewContainerRef, anchor: HTMLElement, template: TemplateRef<unknown>, width: number): OverlayRef {
  const ref = overlay.create({
    positionStrategy: overlay
      .position()
      .flexibleConnectedTo(anchor)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
      ])
      .withPush(true)
      .withViewportMargin(8),
    scrollStrategy: overlay.scrollStrategies.reposition(),
    width,
  });
  ref.attach(new TemplatePortal(template, view));
  return ref;
}

const dayFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const dayShortFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function longDay(iso: string): string {
  return dayFormat.format(new Date(`${iso.slice(0, 10)}T12:00:00`)).replace(/\./g, '');
}

@Component({
  selector: 'app-date-field',
  imports: [MatIconModule, CalendarComponent],
  template: `
    <div class="relative">
      <button type="button" class="flex h-11 w-full items-center justify-between rounded-lg border border-line-strong bg-surface px-3.5 text-left text-sm text-ink disabled:opacity-50" [disabled]="disabled() || disabledIn()" aria-haspopup="dialog" (click)="toggle($event)">
        <span [class.text-muted]="!current()">{{ shown() }}</span>
        <mat-icon class="text-muted" aria-hidden="true">event</mat-icon>
      </button>
    <ng-template #panel>
      <app-calendar mode="single" [start]="current() || null" [min]="minDay()" [max]="max()" [allow]="allow()" (picked)="pick($event)" />
    </ng-template>
    </div>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
})
export class DateFieldComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly view = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private sheet: OverlayRef | null = null;
  readonly allow = input<((iso: string) => boolean) | null>(null);
  readonly fromToday = input(false);
  readonly valueIn = input<string | null>(null);
  /** Primer y último día que se pueden elegir ("YYYY-MM-DD"). */
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly disabledIn = input(false);
  readonly picked = output<string>();
  protected readonly open = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly shown = computed(() => {
    const iso = this.current();
    return iso ? longDay(iso) : 'Elegir fecha';
  });
  /** Si el padre manda `valueIn`, ese es el día; si no, el del formulario. */
  protected readonly current = computed(() => {
    const given = this.valueIn();
    return given !== null ? given : this.value();
  });
  protected readonly minDay = computed(() => {
    const min = this.min();
    if (!this.fromToday()) {
      return min;
    }
    const today = todayIso();
    return min && min > today ? min : today;
  });
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  writeValue(value: string | null): void {
    this.value.set(value ? value.slice(0, 10) : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!this.open() || this.host.nativeElement.contains(target) || this.sheet?.overlayElement.contains(target)) {
      return;
    }
    this.dismiss();
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) {
      this.dismiss();
      return;
    }
    this.sheet = openSheet(this.overlay, this.view, event.currentTarget as HTMLElement, this.panel(), 352);
    this.open.set(true);
  }

  private dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }

  protected pick(iso: string): void {
    this.value.set(iso);
    this.onChange(iso);
    this.onTouched();
    this.picked.emit(iso);
    this.dismiss();
  }
}

/** Elegir un rango de fechas (desde - hasta) en un solo calendario: toca el primer día y luego el último. */
@Component({
  selector: 'app-date-range-field',
  imports: [MatIconModule, CalendarComponent],
  template: `
    <div class="relative">
      <button type="button" class="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-sm text-ink disabled:opacity-50" [disabled]="disabledIn()" aria-haspopup="dialog" (click)="toggle($event)">
        <span class="nums min-w-0 truncate" [class.text-muted]="!start()">{{ shown() }}</span>
        <mat-icon class="shrink-0 text-muted" aria-hidden="true">date_range</mat-icon>
      </button>
    <ng-template #panel>
      <app-calendar mode="range" [start]="start()" [end]="end()" [min]="min()" [max]="max()" (rangePicked)="pick($event)" />
    </ng-template>
    </div>
  `,
})
export class DateRangeFieldComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly view = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private sheet: OverlayRef | null = null;
  readonly start = input<string | null>(null);
  readonly end = input<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly disabledIn = input(false);
  readonly rangePicked = output<{ start: string; end: string }>();
  protected readonly open = signal(false);
  protected readonly shown = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start) {
      return 'Elegir fechas';
    }
    if (!end || end === start) {
      return longDay(start);
    }
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const from = sameYear ? dayShortFormat.format(new Date(`${start}T12:00:00`)).replace(/\./g, '') : longDay(start);
    return `${from} – ${longDay(end)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!this.open() || this.host.nativeElement.contains(target) || this.sheet?.overlayElement.contains(target)) {
      return;
    }
    this.dismiss();
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) {
      this.dismiss();
      return;
    }
    this.sheet = openSheet(this.overlay, this.view, event.currentTarget as HTMLElement, this.panel(), 352);
    this.open.set(true);
  }

  private dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }

  protected pick(range: { start: string; end: string }): void {
    this.rangePicked.emit(range);
    this.dismiss();
  }
}

@Component({
  selector: 'app-time-field',
  imports: [MatIconModule, WheelColumnComponent],
  template: `
    <div class="relative">
      <button type="button" class="flex h-11 w-full items-center justify-between rounded-lg border border-line-strong bg-surface px-3.5 text-left text-sm text-ink disabled:opacity-50" [disabled]="disabled() || locked()" aria-haspopup="dialog" (click)="toggle($event)">
        <span class="nums" [class.text-muted]="!shown()">{{ shownLabel() || 'Elegir hora' }}</span>
        <mat-icon class="text-muted" aria-hidden="true">expand_more</mat-icon>
      </button>
    <ng-template #panel>
      <div class="rounded-2xl border border-line bg-surface p-3 text-ink shadow-lg" (click)="$event.stopPropagation()">
        @if (options() !== null && choices().length === 0) {
          <p class="px-2 py-3 text-sm text-muted">Sin horarios.</p>
        } @else {
          <div class="relative">
            <!-- Franja del centro: lo que cae aquí es lo elegido -->
            <div class="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-canvas" aria-hidden="true"></div>
            <div class="relative flex items-stretch gap-2 px-1">
              @if (options() === null) {
                <app-wheel-column class="flex-1" label="Hora" [items]="hours" [selected]="hour12()" (changed)="setHour($event)" />
                <app-wheel-column class="flex-1" label="Minutos" [items]="minuteItems()" [selected]="pickedMinute()" (changed)="setMinute($event)" />
                <app-wheel-column class="flex-1" label="AM o PM" [items]="meridiem" [selected]="pickedMeridiem()" (changed)="setMeridiem($event)" />
              } @else {
                <app-wheel-column class="flex-1" label="Hora" [items]="choiceItems()" [selected]="shown()" (changed)="setExact($event)" />
              }
            </div>
          </div>
          <button type="button" class="btn btn-primary mt-3 w-full" (click)="dismiss()">Listo</button>
        }
      </div>
    </ng-template>
    </div>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeFieldComponent), multi: true }],
})
export class TimeFieldComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly view = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private sheet: OverlayRef | null = null;
  readonly options = input<string[] | null>(null);
  /** Horas de la lista que ya tienen otra cita: se siguen viendo, con la etiqueta "ocupada". */
  readonly busy = input<string[]>([]);
  /** Quién ocupa cada hora ocupada ("12:30": "Alejandra"); "Bloqueado" si es un bloqueo. */
  readonly busyLabels = input<Record<string, string>>({});
  readonly locked = input(false);
  readonly valueIn = input<string | null>(null);
  readonly picked = output<string>();
  protected readonly open = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly shown = computed(() => clock(this.value() || this.valueIn() || ''));
  protected readonly shownLabel = computed(() => clock12(this.shown()));
  /** Horas que se pueden elegir cuando el campo trae su propia lista (por ejemplo, los huecos libres de un día). */
  protected readonly choices = computed(() => {
    const base = (this.options() ?? []).map(clock);
    const current = this.shown();
    return current && !base.includes(current) ? [current, ...base] : base;
  });
  protected readonly choiceItems = computed<WheelItem[]>(() => this.choices().map((time) => ({ value: time, label: this.busy().map(clock).includes(time) ? this.busyText(time) : clock12(time) })));

  private busyText(time: string): string {
    const who = this.busyLabels()[time];
    if (!who) {
      return `${clock12(time)} · ocupada`;
    }
    return who === 'Bloqueado' ? `${clock12(time)} · bloqueada` : `${clock12(time)} · ocupada, ${who}`;
  }

  // Selector libre: tres columnas (hora, minutos y AM/PM) sobre el valor en 24 h.
  protected readonly hours: WheelItem[] = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
  protected readonly meridiem: WheelItem[] = [
    { value: 'AM', label: 'AM' },
    { value: 'PM', label: 'PM' },
  ];
  private readonly parts = computed(() => {
    const [hour, minute] = (this.shown() || '09:00').split(':').map(Number);
    return { hour: Number.isNaN(hour) ? 9 : hour, minute: Number.isNaN(minute) ? 0 : minute };
  });
  protected readonly hour12 = computed(() => String(this.parts().hour % 12 || 12));
  protected readonly pickedMinute = computed(() => String(this.parts().minute).padStart(2, '0'));
  protected readonly pickedMeridiem = computed(() => (this.parts().hour >= 12 ? 'PM' : 'AM'));
  /** De 5 en 5; si el valor trae otros minutos (09:10), se agregan para no perderlos. */
  protected readonly minuteItems = computed<WheelItem[]>(() => {
    const list = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
    const current = this.pickedMinute();
    const all = list.includes(current) ? list : [...list, current].sort();
    return all.map((minute) => ({ value: minute, label: minute }));
  });
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  writeValue(value: string | null): void {
    this.value.set(value ? clock(value) : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!this.open() || this.host.nativeElement.contains(target) || this.sheet?.overlayElement.contains(target)) {
      return;
    }
    this.dismiss();
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) {
      this.dismiss();
      return;
    }
    const anchor = event.currentTarget as HTMLElement;
    this.sheet = openSheet(this.overlay, this.view, anchor, this.panel(), Math.max(300, anchor.offsetWidth));
    this.open.set(true);
  }

  protected dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }

  /** Cada giro se aplica al momento; "Listo" (o tocar fuera) solo cierra el panel. */
  protected setHour(hour: string): void {
    this.build(Number(hour), this.pickedMeridiem() === 'PM', this.parts().minute);
  }

  protected setMinute(minute: string): void {
    this.build(Number(this.hour12()), this.pickedMeridiem() === 'PM', Number(minute));
  }

  protected setMeridiem(value: string): void {
    this.build(Number(this.hour12()), value === 'PM', this.parts().minute);
  }

  protected setExact(time: string): void {
    this.apply(time);
  }

  private build(hour12: number, pm: boolean, minute: number): void {
    const hour = (hour12 % 12) + (pm ? 12 : 0);
    this.apply(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }

  private apply(time: string): void {
    this.value.set(time);
    this.onChange(time);
    this.onTouched();
    this.picked.emit(time);
  }
}

/** Una opción de lista. `group` agrupa bajo un título; `disabled` la apaga y `hint` dice por qué ("No lo hace Mayra"). */
export type PickOption = { value: string | number | null; label: string; group?: string; disabled?: boolean; hint?: string };

export function plain(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Component({
  selector: 'app-pick-field',
  template: `
    <button type="button" class="flex w-full items-center justify-between gap-3 text-left text-sm" [class.h-11]="!bare()" [class.rounded-lg]="!bare()" [class.border]="!bare()" [class.border-line-strong]="!bare()" [class.bg-surface]="!bare()" [class.px-3]="!bare()" aria-haspopup="listbox" (click)="toggle($event)">
      <span class="truncate" [class.text-muted]="label() === placeholder()">{{ label() }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <ng-template #panel>
      <div class="pick-sheet flex flex-col overflow-hidden border border-line bg-surface text-ink shadow-lg" [class.rounded-2xl]="!mobile()" [class.rounded-t-2xl]="mobile()" [class.max-h-72]="!mobile()" [class.max-h-[75dvh]]="mobile()" style="width:100%" (click)="$event.stopPropagation()">
        @if (mobile()) {
          <div class="flex items-center justify-between px-4 pt-3">
            <p class="text-sm font-semibold">{{ placeholder() }}</p>
            <button type="button" class="h-11 rounded-lg px-3 text-sm font-medium text-ink-soft" (click)="dismiss()">Cerrar</button>
          </div>
        }
        @if (searchable()) {
          <div class="p-1.5 pb-0">
            <input type="search" class="input" placeholder="Buscar" aria-label="Buscar" autocomplete="off" [value]="query()" (input)="query.set($any($event.target).value)" />
          </div>
        }
        <div class="overflow-auto p-1.5" role="listbox">
          @for (option of shown(); track option.label; let i = $index) {
            @if (option.group && option.group !== shown()[i - 1]?.group) {
              <p class="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{{ option.group }}</p>
            }
            <button type="button" role="option" class="flex min-h-11 w-full flex-col justify-center rounded-xl px-3 py-2 text-left text-sm disabled:cursor-not-allowed" [class.bg-accent-soft]="same(option.value)" [class.font-medium]="same(option.value)" [class.text-muted]="option.disabled" [disabled]="option.disabled" [attr.aria-selected]="same(option.value)" (click)="choose(option.value)">
              <span>{{ option.label }}</span>
              @if (option.hint) { <span class="text-xs text-muted">{{ option.hint }}</span> }
            </button>
          } @empty {
            <p class="px-3 py-3 text-sm text-muted">No encontramos nada con eso.</p>
          }
        </div>
      </div>
    </ng-template>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PickFieldComponent), multi: true }],
})
export class PickFieldComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly view = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private sheet: OverlayRef | null = null;
  private readonly own = signal<string | number | null | undefined>(undefined);
  readonly options = input<PickOption[]>([]);
  readonly placeholder = input('Elegir');
  readonly bare = input(false);
  /** Cuadro para escribir y filtrar. Sin indicarlo, sale solo cuando hay más de 8 opciones. */
  readonly search = input<boolean | null>(null);
  readonly valueIn = input<string | number | null>(null);
  readonly picked = output<string | number | null>();
  protected readonly open = signal(false);
  protected readonly query = signal('');
  /** En celular la lista se abre como hoja desde abajo. */
  protected readonly mobile = signal(false);
  protected readonly searchable = computed(() => this.search() ?? this.options().length > 8);
  protected readonly shown = computed(() => {
    const text = plain(this.query().trim());
    return text ? this.options().filter((option) => plain(`${option.label} ${option.group ?? ''}`).includes(text)) : this.options();
  });
  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  protected readonly current = computed(() => (this.own() !== undefined ? this.own() : this.valueIn()));
  protected readonly label = computed(() => this.options().find((option) => this.same(option.value))?.label ?? this.placeholder());

  writeValue(value: string | number | null): void {
    this.own.set(value);
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!this.open() || this.host.nativeElement.contains(target) || this.sheet?.overlayElement.contains(target)) {
      return;
    }
    this.dismiss();
  }

  protected same(value: string | number | null): boolean {
    return this.current() === value;
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) {
      this.dismiss();
      return;
    }
    const anchor = event.currentTarget as HTMLElement;
    this.query.set('');
    const phone = typeof window !== 'undefined' && window.innerWidth < 640;
    this.mobile.set(phone);
    if (phone) {
      this.sheet = this.overlay.create({
        positionStrategy: this.overlay.position().global().bottom('0').centerHorizontally(),
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-dark-backdrop',
        width: '100%',
        maxWidth: '100vw',
        scrollStrategy: this.overlay.scrollStrategies.block(),
      });
      this.sheet.attach(new TemplatePortal(this.panel(), this.view));
    } else {
      this.sheet = openSheet(this.overlay, this.view, anchor, this.panel(), Math.max(180, anchor.offsetWidth));
    }
    this.open.set(true);
    if (!phone && this.searchable()) {
      setTimeout(() => this.sheet?.overlayElement.querySelector<HTMLInputElement>('input[type=search]')?.focus());
    }
  }

  protected choose(value: string | number | null): void {
    this.own.set(value);
    this.onChange(value);
    this.onTouched();
    this.picked.emit(value);
    this.dismiss();
  }

  protected dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }
}
