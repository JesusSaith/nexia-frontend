import { Component, computed, input, signal } from '@angular/core';

import { canNavigate, googleMapsUrl, googleStaticMapUrl, Place, staticMap, TILE_ATTRIBUTION, wazeUrl } from '@core/maps';

/**
 * "Cómo llegar" para el cliente: mapa fijo con el punto del local (una imagen de Google, o mosaicos
 * de OpenStreetMap si no hay llave; sin librería ni iframe, para que cargue rápido en celular), la
 * dirección y botones a Google Maps y Waze.
 */
@Component({
  selector: 'app-place-map',
  template: `
    @if (navigable()) {
      <div class="flex w-full flex-col gap-3 text-left">
        @if (googleSrc(); as src) {
          <a [href]="google()" target="_blank" rel="noopener" class="block h-48 w-full overflow-hidden rounded-2xl border border-line bg-canvas sm:h-56" [attr.aria-label]="'Abrir ' + (name() || 'el local') + ' en Google Maps'">
            <img [src]="src" alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" (error)="googleFailed.set(true)" />
          </a>
        } @else if (map(); as view) {
          <div class="relative h-48 w-full overflow-hidden rounded-2xl border border-line bg-canvas sm:h-56">
            <a [href]="google()" target="_blank" rel="noopener" class="absolute inset-0" [attr.aria-label]="'Abrir ' + (name() || 'el local') + ' en Google Maps'">
              <span class="absolute block h-192 w-7xl" [style.left]="'calc(50% - ' + view.x + 'px)'" [style.top]="'calc(50% - ' + view.y + 'px)'">
                @for (tile of view.tiles; track tile.src) {
                  <img [src]="tile.src" alt="" width="256" height="256" loading="lazy" decoding="async" draggable="false" class="absolute h-64 w-64 max-w-none" [style.left.px]="tile.left" [style.top.px]="tile.top" />
                }
              </span>
              <svg viewBox="0 0 24 32" width="32" height="42" aria-hidden="true" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow">
                <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="var(--booking-primary, var(--primary))" stroke="white" stroke-width="1.5" />
                <circle cx="12" cy="12" r="4.5" fill="white" />
              </svg>
            </a>
            <span class="absolute bottom-0 right-0 bg-white/80 px-1.5 text-[11px] leading-5 text-ink-soft" [innerHTML]="attribution"></span>
          </div>
        }
        @if (place().address) {
          <p class="text-sm text-ink-soft">{{ place().address }}</p>
        }
        <div class="grid grid-cols-2 gap-2">
          <a class="btn btn-secondary justify-center" [href]="google()" target="_blank" rel="noopener">Google Maps</a>
          <a class="btn btn-secondary justify-center" [href]="waze()" target="_blank" rel="noopener">Waze</a>
        </div>
      </div>
    }
  `,
})
export class PlaceMap {
  readonly place = input.required<Place>();
  readonly name = input<string | null | undefined>(null);
  /** Color de la marca para el pin de Google. */
  readonly color = input<string | null | undefined>(null);

  /** Si la imagen de Google falla (llave mal puesta, cuota), se cae a OpenStreetMap. */
  protected readonly googleFailed = signal(false);
  protected readonly attribution = TILE_ATTRIBUTION;
  protected readonly navigable = computed(() => canNavigate(this.place()));
  protected readonly googleSrc = computed(() => (this.googleFailed() ? null : googleStaticMapUrl(this.place(), this.color())));
  protected readonly map = computed(() => staticMap(this.place()));
  protected readonly google = computed(() => googleMapsUrl(this.place()));
  protected readonly waze = computed(() => wazeUrl(this.place()));
}
