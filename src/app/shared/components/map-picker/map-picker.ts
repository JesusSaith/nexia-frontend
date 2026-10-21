import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet';

import { MEXICO_CENTER, pointFromLink, roundCoord, TILE_ATTRIBUTION, TILE_URL } from '@core/maps';

type Leaflet = typeof import('leaflet');

interface Found {
  label: string;
  lat: number;
  lng: number;
}

/**
 * La dueña marca su local: con su ubicación actual, buscando la dirección, pegando un enlace de
 * Google Maps o tocando el mapa. El punto se arrastra para afinarlo. Leaflet y su CSS viajan en el
 * pedazo de Configuración, para no pesarle a la página de reservas.
 */
@Component({
  selector: 'app-map-picker',
  imports: [MatIconModule],
  host: { class: 'block' },
  styleUrl: './map-picker.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2 sm:flex-row">
        <form class="flex min-w-0 flex-1 gap-2" (submit)="$event.preventDefault(); search()">
          <input
            class="input min-w-0 flex-1"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="address() ? 'Buscar: ' + address() : 'Dirección o enlace de Google Maps'"
            aria-label="Buscar la dirección o pegar un enlace de Google Maps"
          />
          <button type="submit" class="btn btn-secondary shrink-0" [disabled]="searching()">{{ searching() ? 'Buscando…' : 'Buscar' }}</button>
        </form>
        <button type="button" class="btn btn-secondary shrink-0" (click)="locate()" [disabled]="locating()">
          <mat-icon>my_location</mat-icon>
          {{ locating() ? 'Ubicando…' : 'Estoy en el local' }}
        </button>
      </div>

      @if (results().length) {
        <ul class="overflow-hidden rounded-xl border border-line bg-surface text-sm" aria-label="Resultados">
          @for (item of results(); track $index) {
            <li class="border-b border-line last:border-b-0">
              <button type="button" class="row-hover flex w-full items-start gap-2 px-3 py-2.5 text-left" (click)="choose(item)">
                <mat-icon class="h-5! w-5! shrink-0 text-[20px]! text-muted">location_on</mat-icon>
                <span class="min-w-0 flex-1 text-ink">{{ item.label }}</span>
              </button>
            </li>
          }
        </ul>
      }

      <div #box class="relative z-0 h-64 w-full overflow-hidden rounded-xl border border-line bg-canvas sm:h-72"></div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p class="text-muted" role="status">
          {{ message() || (latitude() != null ? 'Arrastra el punto o toca el mapa para ajustarlo a la puerta del local.' : 'Aún no está en el mapa: búscalo o toca el mapa donde está tu local.') }}
        </p>
        @if (latitude() != null) {
          <button type="button" class="font-medium text-ink-soft hover:text-ink" (click)="clear()">Quitar del mapa</button>
        }
      </div>
    </div>
  `,
})
export class MapPicker {
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  /** Dirección escrita: se usa al buscar con el campo vacío. */
  readonly address = input('');
  readonly pointChange = output<{ lat: number; lng: number } | null>();

  protected readonly query = signal('');
  protected readonly results = signal<Found[]>([]);
  protected readonly searching = signal(false);
  protected readonly locating = signal(false);
  protected readonly message = signal('');

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private L?: Leaflet;
  private map?: LeafletMap;
  private marker?: Marker;

  constructor() {
    afterNextRender(() => void this.init());
    // Al cargar o descartar cambios, el punto viene de afuera: se mueve sin volver a avisar.
    effect(() => this.show(this.latitude(), this.longitude()));
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.map?.remove());
  }

  protected async search(): Promise<void> {
    const text = (this.query().trim() || this.address().trim());
    this.results.set([]);
    if (!text) {
      this.message.set('Escribe la dirección con colonia y ciudad.');
      return;
    }
    const linked = pointFromLink(text);
    if (linked) {
      this.pick(linked.lat, linked.lng, 17);
      this.message.set('Listo: tomamos el punto del enlace.');
      return;
    }
    if (/^https?:\/\//i.test(text)) {
      this.message.set('Ese enlace no trae el punto. Busca la dirección o toca el mapa.');
      return;
    }
    this.searching.set(true);
    try {
      const params = new URLSearchParams({ q: text, format: 'jsonv2', limit: '5', countrycodes: 'mx', 'accept-language': 'es' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const rows: { display_name: string; lat: string; lon: string }[] = response.ok ? await response.json() : [];
      const found = rows.map((row) => ({ label: row.display_name, lat: Number(row.lat), lng: Number(row.lon) }));
      if (found.length === 1) {
        this.choose(found[0]);
      } else {
        this.results.set(found);
        this.message.set(found.length ? 'Elige la que corresponde a tu local.' : 'No la encontramos. Agrega colonia y ciudad, o toca el mapa donde está tu local.');
      }
    } catch {
      this.message.set('No pudimos buscar ahora. Toca el mapa donde está tu local.');
    } finally {
      this.searching.set(false);
    }
  }

  protected choose(item: Found): void {
    this.results.set([]);
    this.pick(item.lat, item.lng, 17);
    this.message.set('Revisa que el punto quede en tu local; si no, arrástralo.');
  }

  protected locate(): void {
    if (!('geolocation' in navigator)) {
      this.message.set('Este navegador no comparte la ubicación. Busca la dirección.');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.locating.set(false);
        this.pick(coords.latitude, coords.longitude, 18);
        this.message.set(coords.accuracy > 60 ? `Quedó aproximado (unos ${Math.round(coords.accuracy)} m): arrastra el punto a la puerta.` : 'Listo: marcamos dónde estás.');
      },
      (error) => {
        this.locating.set(false);
        this.message.set(error.code === error.PERMISSION_DENIED ? 'No diste permiso de ubicación. Búscala o toca el mapa.' : 'No pudimos ubicarte. Busca la dirección o toca el mapa.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  protected clear(): void {
    this.message.set('');
    this.pointChange.emit(null);
  }

  private async init(): Promise<void> {
    const module = await import('leaflet');
    const L = ((module as unknown as { default?: Leaflet }).default ?? module) as Leaflet;
    this.L = L;
    const element = this.box().nativeElement;
    const lat = this.latitude();
    const lng = this.longitude();
    this.map = L.map(element, { zoomControl: true, attributionControl: true }).setView(
      lat != null && lng != null ? [lat, lng] : [MEXICO_CENTER.lat, MEXICO_CENTER.lng],
      lat != null ? 17 : MEXICO_CENTER.zoom,
    );
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(this.map);
    this.map.on('click', (event: LeafletMouseEvent) => {
      const point = event.latlng.wrap();
      this.pick(point.lat, point.lng);
      this.message.set('');
    });
    // Dentro de una sección plegada el mapa nace sin tamaño; al abrirse se vuelve a medir.
    const observer = new ResizeObserver(() => this.map?.invalidateSize());
    observer.observe(element);
    this.map.on('unload', () => observer.disconnect());
    this.show(lat, lng);
  }

  /** Punto elegido aquí: se mueve el marcador y se avisa al formulario. */
  private pick(lat: number, lng: number, zoom?: number): void {
    lat = roundCoord(lat);
    lng = roundCoord(lng);
    this.show(lat, lng, zoom);
    this.pointChange.emit({ lat, lng });
  }

  private show(lat: number | null, lng: number | null, zoom?: number): void {
    const { L, map } = this;
    if (!L || !map) {
      return;
    }
    if (lat == null || lng == null) {
      this.marker?.remove();
      this.marker = undefined;
      return;
    }
    if (!this.marker) {
      this.marker = L.marker([lat, lng], { draggable: true, icon: pinIcon(L), title: 'Tu local', alt: 'Tu local' }).addTo(map);
      this.marker.on('dragend', () => {
        const point = this.marker!.getLatLng().wrap();
        this.pick(point.lat, point.lng);
        this.message.set('');
      });
    } else {
      this.marker.setLatLng([lat, lng]);
    }
    if (zoom) {
      map.setView([lat, lng], zoom);
    } else if (!map.getBounds().contains([lat, lng])) {
      map.setView([lat, lng], Math.max(map.getZoom(), 16));
    }
  }
}

/** Pin del color de la marca, sin las imágenes de Leaflet (que piden rutas de assets). */
function pinIcon(L: Leaflet) {
  return L.divIcon({
    className: 'nx-pin',
    html: '<svg viewBox="0 0 24 32" width="32" height="42" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0z" fill="var(--primary)" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="4.5" fill="white"/></svg>',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });
}
