import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { MatIconModule } from '@angular/material/icon';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, DestroyRef, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

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

function openSheet(overlay: Overlay, view: ViewContainerRef, anchor: HTMLElement, template: TemplateRef<unknown>, width: number): OverlayRef {
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

@Component({
  selector: 'app-date-field',
  imports: [MatIconModule],
  template: `
    <div class="relative">
      <button type="button" class="flex h-11 w-full items-center justify-between rounded-lg border border-line-strong bg-surface px-3.5 text-left text-sm text-ink disabled:opacity-50" [disabled]="disabled()" aria-haspopup="dialog" (click)="toggle($event)">
        <span [class.text-muted]="!value()">{{ shown() }}</span>
        <mat-icon class="text-muted" aria-hidden="true">expand_more</mat-icon>
      </button>
    <ng-template #panel>
      <div class="w-[280px] rounded-2xl border border-line bg-surface p-3 text-ink shadow-lg" (click)="$event.stopPropagation()">
        <div class="mb-2 flex items-center justify-between">
          <button type="button" class="h-11 w-11 rounded-full text-muted" (click)="shift(-1)" aria-label="Mes anterior"><mat-icon aria-hidden="true">chevron_left</mat-icon></button>
          <p class="text-sm font-medium">{{ monthLabel() }}</p>
          <button type="button" class="h-11 w-11 rounded-full text-muted" (click)="shift(1)" aria-label="Mes siguiente"><mat-icon aria-hidden="true">chevron_right</mat-icon></button>
        </div>
        <div class="grid grid-cols-7 text-center text-xs text-muted">
          @for (label of labels; track label) { <span>{{ label }}</span> }
        </div>
        <div class="mt-1 grid grid-cols-7 gap-1 text-center">
          @for (day of cells(); track iso(day)) {
            <button
              type="button"
              class="flex h-9 flex-col items-center justify-center rounded-lg text-sm disabled:text-line-strong"
              [class.bg-accent]="value() === iso(day)"
              [class.text-white]="value() === iso(day)"
              [disabled]="blocked(day)"
              (click)="pick(iso(day))"
            >
              {{ day.getDate() }}
              @if (marked(day)) { <span class="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" [class.bg-white]="value() === iso(day)"></span> }
            </button>
          }
        </div>
      </div>
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
  private readonly format = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  private readonly monthFormat = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
  readonly allow = input<((iso: string) => boolean) | null>(null);
  readonly fromToday = input(false);
  readonly valueIn = input<string | null>(null);
  readonly picked = output<string>();
  protected readonly labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  protected readonly open = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly cursor = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly shown = computed(() => {
    const iso = this.value() || this.valueIn() || '';
    if (!iso) {
      return 'Elegir fecha';
    }
    return this.format.format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  });
  protected readonly monthLabel = computed(() => this.monthFormat.format(this.cursor()));
  protected readonly cells = computed(() => {
    const start = new Date(this.cursor());
    const offset = (start.getDay() + 6) % 7;
    const first = new Date(start.getFullYear(), start.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  });
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  writeValue(value: string | null): void {
    this.value.set(value ? value.slice(0, 10) : '');
    if (value) {
      const day = new Date(`${value.slice(0, 10)}T12:00:00`);
      this.cursor.set(new Date(day.getFullYear(), day.getMonth(), 1));
    }
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
    this.sheet = openSheet(this.overlay, this.view, event.currentTarget as HTMLElement, this.panel(), 280);
    this.open.set(true);
  }

  private dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }

  protected shift(amount: number): void {
    const cursor = this.cursor();
    this.cursor.set(new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1));
  }

  protected iso(day: Date): string {
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    return `${day.getFullYear()}-${month}-${date}`;
  }

  protected blocked(day: Date): boolean {
    const key = this.iso(day);
    if (day.getMonth() !== this.cursor().getMonth()) {
      return true;
    }
    if (this.fromToday()) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (key < today) {
        return true;
      }
    }
    const allow = this.allow();
    return allow ? !allow(key) : false;
  }

  protected marked(day: Date): boolean {
    return !!this.allow() && !this.blocked(day);
  }

  protected pick(iso: string): void {
    this.value.set(iso);
    this.onChange(iso);
    this.onTouched();
    this.picked.emit(iso);
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
  protected readonly choiceItems = computed<WheelItem[]>(() => this.choices().map((time) => ({ value: time, label: clock12(time) })));

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

export type PickOption = { value: string | number | null; label: string };

@Component({
  selector: 'app-pick-field',
  template: `
    <button type="button" class="flex w-full items-center justify-between gap-3 text-left text-sm" [class.h-11]="!bare()" [class.rounded-lg]="!bare()" [class.border]="!bare()" [class.border-line-strong]="!bare()" [class.bg-surface]="!bare()" [class.px-3]="!bare()" aria-haspopup="listbox" (click)="toggle($event)">
      <span class="truncate" [class.text-muted]="label() === placeholder()">{{ label() }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <ng-template #panel>
      <div class="pick-sheet max-h-64 overflow-auto rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-lg" style="width:100%" (click)="$event.stopPropagation()">
        @for (option of options(); track option.label) {
          <button type="button" class="block w-full rounded-xl px-3 py-2 text-left text-sm" [class.bg-accent-soft]="same(option.value)" [class.font-medium]="same(option.value)" [attr.aria-current]="same(option.value) ? 'true' : null" (click)="choose(option.value)">{{ option.label }}</button>
        }
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
  readonly valueIn = input<string | number | null>(null);
  readonly picked = output<string | number | null>();
  protected readonly open = signal(false);
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
    this.sheet = openSheet(this.overlay, this.view, anchor, this.panel(), Math.max(180, anchor.offsetWidth));
    this.open.set(true);
  }

  protected choose(value: string | number | null): void {
    this.own.set(value);
    this.onChange(value);
    this.onTouched();
    this.picked.emit(value);
    this.dismiss();
  }

  private dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }
}
