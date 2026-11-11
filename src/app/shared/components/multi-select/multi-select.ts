import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, DestroyRef, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PickOption, openSheet, plain } from '../when-field/when-field';

type Id = string | number;

/**
 * Elegir varios de una lista: lo elegido se ve como fichas que se quitan con una "x" y la lista se abre con búsqueda,
 * grupos y opciones apagadas (con su motivo). En celular la lista sale como hoja desde abajo.
 * `[(values)]` lleva los valores elegidos. Con `[showChips]="false"` solo se muestra el botón (las fichas las pinta quien lo usa).
 */
@Component({
  selector: 'app-multi-select-field',
  imports: [MatIconModule],
  template: `
    @if (showChips() && chosen().length) {
      <div class="mb-2 flex flex-wrap gap-2">
        @for (option of chosen(); track option.value) {
          <span class="chip chip-on gap-1 pr-1!">
            {{ option.label }}
            <button type="button" class="grid h-11 w-11 place-items-center rounded-full" [attr.aria-label]="'Quitar ' + option.label" (click)="remove(option.value!)"><mat-icon class="h-4! w-4! text-[16px]!">close</mat-icon></button>
          </span>
        }
      </div>
    }
    <button type="button" class="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm disabled:opacity-50" [disabled]="full()" aria-haspopup="listbox" (click)="toggle($event)">
      <span class="truncate text-muted">{{ full() ? 'Ya no caben más' : placeholder() }}</span>
      <mat-icon class="shrink-0 text-muted" aria-hidden="true">add</mat-icon>
    </button>
    <ng-template #panel>
      <div class="flex flex-col overflow-hidden border border-line bg-surface text-ink shadow-lg" [class.rounded-2xl]="!mobile()" [class.rounded-t-2xl]="mobile()" [class.max-h-72]="!mobile()" [class.max-h-[75dvh]]="mobile()" style="width:100%" (click)="$event.stopPropagation()">
        @if (mobile()) {
          <div class="flex items-center justify-between px-4 pt-3">
            <p class="text-sm font-semibold">{{ placeholder() }}</p>
            <button type="button" class="h-11 rounded-lg px-3 text-sm font-semibold text-accent" (click)="dismiss()">Listo</button>
          </div>
        }
        @if (options().length > 8) {
          <div class="p-1.5 pb-0">
            <input type="search" class="input" placeholder="Buscar" aria-label="Buscar" autocomplete="off" [value]="query()" (input)="query.set($any($event.target).value)" />
          </div>
        }
        <div class="overflow-auto p-1.5" role="listbox" aria-multiselectable="true">
          @for (option of shown(); track option.value; let i = $index) {
            @if (option.group && option.group !== shown()[i - 1]?.group) {
              <p class="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{{ option.group }}</p>
            }
            <button type="button" role="option" class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm disabled:cursor-not-allowed" [class.bg-accent-soft]="on(option.value!)" [class.text-muted]="option.disabled" [disabled]="option.disabled || (!on(option.value!) && full())" [attr.aria-selected]="on(option.value!)" (click)="flip(option.value!)">
              <mat-icon class="shrink-0" [class.text-accent]="on(option.value!)" aria-hidden="true">{{ on(option.value!) ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
              <span class="min-w-0 flex-1">
                <span class="block">{{ option.label }}</span>
                @if (option.hint) { <span class="block text-xs text-muted">{{ option.hint }}</span> }
              </span>
            </button>
          } @empty {
            <p class="px-3 py-3 text-sm text-muted">No encontramos nada con eso.</p>
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class MultiSelectFieldComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly view = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private sheet: OverlayRef | null = null;
  readonly options = input<PickOption[]>([]);
  readonly values = model<Id[]>([]);
  readonly placeholder = input('Agregar');
  readonly showChips = input(true);
  /** Cuántos se pueden elegir como máximo (sin tope si no se indica). */
  readonly max = input<number | null>(null);
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly mobile = signal(false);
  protected readonly chosen = computed(() => this.values().map((value) => this.options().find((option) => option.value === value)).filter((option): option is PickOption => !!option));
  protected readonly full = computed(() => this.max() !== null && this.values().length >= this.max()!);
  protected readonly shown = computed(() => {
    const text = plain(this.query().trim());
    const rows = this.options().filter((option) => option.value !== null);
    return text ? rows.filter((option) => plain(`${option.label} ${option.group ?? ''}`).includes(text)) : rows;
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

  protected on(value: Id): boolean {
    return this.values().includes(value);
  }

  protected flip(value: Id): void {
    this.values.update((list) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));
  }

  protected remove(value: Id): void {
    this.values.update((list) => list.filter((item) => item !== value));
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
      this.sheet = openSheet(this.overlay, this.view, anchor, this.panel(), Math.max(220, anchor.offsetWidth));
    }
    this.open.set(true);
  }

  protected dismiss(): void {
    this.sheet?.dispose();
    this.sheet = null;
    this.open.set(false);
  }
}
