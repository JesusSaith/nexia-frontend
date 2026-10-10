import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, DestroyRef, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, forwardRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const QUARTER_HOURS = Array.from({ length: ((22 - 6) * 60) / 15 + 1 }, (_, index) => {
  const minutes = 6 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function clock(value: string): string {
  return value.slice(0, 5);
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
  template: `
    <div class="relative">
      <button type="button" class="flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-left text-sm disabled:opacity-50" [disabled]="disabled()" (click)="toggle($event)">
        <span [class.text-stone-400]="!value()">{{ shown() }}</span>
        <span class="text-stone-400" aria-hidden="true">▾</span>
      </button>
    <ng-template #panel>
      <div class="w-[280px] rounded-2xl border border-[#eceae6] bg-white p-3 shadow-lg" (click)="$event.stopPropagation()">
        <div class="mb-2 flex items-center justify-between">
          <button type="button" class="h-8 w-8 rounded-full text-stone-500" (click)="shift(-1)" aria-label="Mes anterior">‹</button>
          <p class="text-sm font-medium">{{ monthLabel() }}</p>
          <button type="button" class="h-8 w-8 rounded-full text-stone-500" (click)="shift(1)" aria-label="Mes siguiente">›</button>
        </div>
        <div class="grid grid-cols-7 text-center text-[11px] text-stone-400">
          @for (label of labels; track label) { <span>{{ label }}</span> }
        </div>
        <div class="mt-1 grid grid-cols-7 gap-1 text-center">
          @for (day of cells(); track iso(day)) {
            <button
              type="button"
              class="flex h-9 flex-col items-center justify-center rounded-lg text-sm disabled:text-stone-300"
              [class.bg-[#b76e79]]="value() === iso(day)"
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
  template: `
    <div class="relative">
      <button type="button" class="flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-left text-sm disabled:opacity-50" [disabled]="disabled() || locked()" (click)="toggle($event)">
        <span [class.text-stone-400]="!shown()">{{ shown() || 'Elegir hora' }}</span>
        <span class="text-stone-400" aria-hidden="true">▾</span>
      </button>
    <ng-template #panel>
      <div class="max-h-64 overflow-auto rounded-2xl border border-[#eceae6] bg-white p-2 shadow-lg" (click)="$event.stopPropagation()">
        @if (choices().length === 0) {
          <p class="px-2 py-3 text-sm text-stone-500">Sin horarios.</p>
        } @else {
          <div class="grid grid-cols-3 gap-1">
            @for (time of choices(); track time) {
              <button type="button" class="rounded-full px-2 py-1.5 text-xs" [class.bg-[#b76e79]]="shown() === time" [class.text-white]="shown() === time" (click)="pick(time)">{{ time }}</button>
            }
          </div>
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
  protected readonly choices = computed(() => {
    const given = this.options();
    const base = (given ?? QUARTER_HOURS).map(clock);
    const current = this.shown();
    return current && !base.includes(current) ? [current, ...base] : base;
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
    this.sheet = openSheet(this.overlay, this.view, anchor, this.panel(), Math.max(220, anchor.offsetWidth));
    this.open.set(true);
  }

  private dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }

  protected pick(time: string): void {
    this.value.set(time);
    this.onChange(time);
    this.onTouched();
    this.picked.emit(time);
    this.dismiss();
  }
}

export type PickOption = { value: string | number | null; label: string };

@Component({
  selector: 'app-pick-field',
  template: `
    <button type="button" class="flex w-full items-center justify-between gap-3 text-left text-sm" [class.h-10]="!bare()" [class.rounded-xl]="!bare()" [class.border]="!bare()" [class.border-gray-200]="!bare()" [class.bg-white]="!bare()" [class.px-3]="!bare()" (click)="toggle($event)">
      <span class="truncate" [class.text-stone-400]="label() === placeholder()">{{ label() }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <ng-template #panel>
      <div class="pick-sheet max-h-64 overflow-auto rounded-2xl border border-[#eceae6] bg-white p-1.5 shadow-lg" style="width:100%" (click)="$event.stopPropagation()">
        @for (option of options(); track option.label) {
          <button type="button" class="block w-full rounded-xl px-3 py-2 text-left text-sm" [class.bg-[#f8eef0]]="same(option.value)" [class.font-medium]="same(option.value)" (click)="choose(option.value)">{{ option.label }}</button>
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
