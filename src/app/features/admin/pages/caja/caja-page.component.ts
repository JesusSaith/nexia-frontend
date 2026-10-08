import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { ShopProduct, ShopService, StockMove } from '@core/services/shop.service';

// FUTURE_PHASE_INVENTORY: pantalla de compras, ventas e IVA. La ruta está apagada.
@Component({
  selector: 'app-caja-page',
  template: `
    <h1 class="text-2xl font-semibold">Inventario</h1>
    <p class="mt-1 text-sm text-slate-500">Entradas de mercancía y salidas, que son las ventas.</p>
    <form class="mt-4 grid gap-2 sm:grid-cols-3" (submit)="add($event)">
      <input name="name" class="rounded-xl border px-3 py-2 text-sm" placeholder="Producto" />
      <input name="price" class="rounded-xl border px-3 py-2 text-sm" type="number" min="0" placeholder="Precio de venta" />
      <input name="qty" class="rounded-xl border px-3 py-2 text-sm" type="number" min="0" placeholder="Cantidad que entra" />
      <input name="cost" class="rounded-xl border px-3 py-2 text-sm" type="number" min="0" placeholder="Costo de compra" />
      <label class="flex items-center gap-2 text-sm"><input name="iva" type="checkbox" /> Lleva IVA 16%</label>
      <button type="submit" class="h-10 rounded-full bg-[#1E1B1E] text-sm text-white">Agregar producto</button>
    </form>
    @if (error(); as message) { <p class="mt-2 text-sm text-red-700">{{ message }}</p> }
    <ul class="mt-4 flex flex-col gap-3">
      @for (item of products(); track item.id) {
        <li class="rounded-2xl border p-3 text-sm">
          <p class="font-medium">{{ item.name }} · quedan {{ item.stock }}</p>
          <form class="mt-2 flex flex-wrap items-center gap-2" (submit)="enter(item, $event)">
            <span class="text-xs text-stone-500">Compra</span>
            <input name="qty" class="w-16 rounded-xl border px-2 py-1" type="number" min="1" value="1" />
            <input name="cost" class="w-28 rounded-xl border px-2 py-1" type="number" min="0" placeholder="Costo" />
            <label class="flex items-center gap-1"><input name="iva" type="checkbox" /> IVA 16%</label>
            <button type="submit" class="rounded-full border px-3 py-1">Registrar compra</button>
          </form>
          <form class="mt-2 flex flex-wrap items-center gap-2" (submit)="sell(item, $event)">
            <span class="text-xs text-stone-500">Venta</span>
            <input name="qty" class="w-16 rounded-xl border px-2 py-1" type="number" min="1" value="1" />
            <input name="price" class="w-28 rounded-xl border px-2 py-1" type="number" min="0" [value]="item.price" />
            <button type="submit" class="rounded-full bg-[#1E1B1E] px-3 py-1 text-white">Registrar venta</button>
          </form>
        </li>
      }
    </ul>
    <h2 class="mt-8 text-sm font-semibold">Movimientos</h2>
    <ul class="mt-2 flex flex-col gap-1 text-sm">
      @for (move of moves(); track move.id) {
        <li>
          @if (move.kind === 'in') {
            Entró {{ move.qty }} {{ move.product_name }} · compré {{ money(move.amount) }}@if (move.iva) { · IVA {{ money(move.iva) }} }
          } @else {
            Vendí {{ move.qty }} {{ move.product_name }} · {{ money(move.amount) }}
          }
        </li>
      }
    </ul>
  `,
})
export class CajaPageComponent {
  private readonly shop = inject(ShopService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly products = signal<ShopProduct[]>([]);
  protected readonly moves = signal<StockMove[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected money(value: number): string {
    return '$' + value;
  }

  protected load(): void {
    forkJoin({ products: this.shop.products(), moves: this.shop.moves() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ products, moves }) => {
        this.products.set(products);
        this.moves.set(moves);
      });
  }

  protected add(event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      return;
    }
    this.shop
      .create(name, Number(data.get('price')) || 0, Number(data.get('qty')) || 0, Number(data.get('cost')) || 0, data.get('iva') === 'on')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        (event.target as HTMLFormElement).reset();
        this.load();
      });
  }

  protected enter(item: ShopProduct, event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    this.shop
      .receive(item.id, Number(data.get('qty')) || 1, Number(data.get('cost')) || 0, data.get('iva') === 'on')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  protected sell(item: ShopProduct, event: Event): void {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    const qty = Number(data.get('qty')) || 1;
    const price = Number(data.get('price'));
    this.shop.sell(item.id, qty, Number.isFinite(price) ? price : item.price).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.error.set(null);
        this.load();
      },
      error: () => this.error.set('No hay suficiente existencia para esa venta.'),
    });
  }
}
