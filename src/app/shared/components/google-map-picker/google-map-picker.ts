import { afterNextRender, Component, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { GOOGLE_MAP_ID } from '@core/config/google-maps';
import { googleLibrary } from '@core/google-maps';
import { MEXICO_CENTER, roundCoord } from '@core/maps';

/**
 * La dueña marca su local en Google Maps: busca la dirección con el buscador de Google (Places),
 * usa su ubicación actual o toca el mapa, y arrastra el pin para afinarlo. Mismas entradas y
 * salidas que `app-map-picker` (OpenStreetMap), que se usa cuando no hay llave de Google.
 */
@Component({
  selector: 'app-google-map-picker',
  imports: [MatIconModule],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div #search class="nx-place-search min-w-0 flex-1"></div>
        <button type="button" class="btn btn-secondary shrink-0" (click)="locate()" [disabled]="locating()">
          <mat-icon>my_location</mat-icon>
          {{ locating() ? 'Ubicando…' : 'Estoy en el local' }}
        </button>
      </div>

      <div #box class="h-64 w-full overflow-hidden rounded-xl border border-line bg-canvas sm:h-72"></div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p class="text-muted" role="status">
          {{ message() || (latitude() != null ? 'Arrastra el pin o toca el mapa para ajustarlo a la puerta del local.' : 'Aún no está en el mapa: búscalo o toca el mapa donde está tu local.') }}
        </p>
        @if (latitude() != null) {
          <button type="button" class="min-h-11 font-medium text-ink-soft hover:text-ink" (click)="clear()">Quitar del mapa</button>
        }
      </div>
    </div>
  `,
})
export class GoogleMapPicker {
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  readonly pointChange = output<{ lat: number; lng: number } | null>();

  protected readonly locating = signal(false);
  protected readonly message = signal('');

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly searchBox = viewChild.required<ElementRef<HTMLElement>>('search');
  private map?: google.maps.Map;
  private marker?: google.maps.marker.AdvancedMarkerElement;
  private Marker?: typeof google.maps.marker.AdvancedMarkerElement;

  constructor() {
    afterNextRender(() => void this.init());
    // Al cargar o descartar cambios, el punto viene de afuera: se mueve sin volver a avisar.
    effect(() => this.show(this.latitude(), this.longitude()));
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
        this.message.set(coords.accuracy > 60 ? `Quedó aproximado (unos ${Math.round(coords.accuracy)} m): arrastra el pin a la puerta.` : 'Listo: marcamos dónde estás.');
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
    // Llave rechazada (dominio no permitido, API apagada o sin facturación): Google llama a esto.
    (window as unknown as { gm_authFailure: () => void }).gm_authFailure = () =>
      this.message.set('Google Maps rechazó la llave: revisa que esté activa y permita este dominio.');
    try {
      const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }] = await Promise.all([
        googleLibrary<google.maps.MapsLibrary>('maps'),
        googleLibrary<google.maps.MarkerLibrary>('marker'),
        googleLibrary<google.maps.PlacesLibrary>('places'),
      ]);
      this.Marker = AdvancedMarkerElement;
      const lat = this.latitude();
      const lng = this.longitude();
      this.map = new Map(this.box().nativeElement, {
        center: lat != null && lng != null ? { lat, lng } : { lat: MEXICO_CENTER.lat, lng: MEXICO_CENTER.lng },
        zoom: lat != null ? 17 : MEXICO_CENTER.zoom,
        mapId: GOOGLE_MAP_ID,
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
      });
      this.map.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) {
          this.pick(event.latLng.lat(), event.latLng.lng());
          this.message.set('');
        }
      });

      const search = new PlaceAutocompleteElement({ includedRegionCodes: ['mx'] });
      search.setAttribute('placeholder', 'Busca tu dirección o el nombre de tu negocio');
      this.searchBox().nativeElement.appendChild(search);
      search.addEventListener('gmp-select', async (event: Event) => {
        const place = (event as google.maps.places.PlacePredictionSelectEvent).placePrediction.toPlace();
        await place.fetchFields({ fields: ['location'] });
        if (place.location) {
          this.pick(place.location.lat(), place.location.lng(), 18);
          this.message.set('Revisa que el pin quede en tu local; si no, arrástralo.');
        }
      });
      this.show(lat, lng);
    } catch {
      this.message.set('No cargó Google Maps. Revisa tu conexión y recarga la página.');
    }
  }

  /** Punto elegido aquí: se mueve el pin y se avisa al formulario. */
  private pick(lat: number, lng: number, zoom?: number): void {
    lat = roundCoord(lat);
    lng = roundCoord(lng);
    this.show(lat, lng, zoom);
    this.pointChange.emit({ lat, lng });
  }

  private show(lat: number | null, lng: number | null, zoom?: number): void {
    const { map, Marker } = this;
    if (!map || !Marker) {
      return;
    }
    if (lat == null || lng == null) {
      if (this.marker) {
        this.marker.map = null;
        this.marker = undefined;
      }
      return;
    }
    if (!this.marker) {
      this.marker = new Marker({ map, position: { lat, lng }, gmpDraggable: true, title: 'Tu local' });
      this.marker.addListener('dragend', () => {
        const position = this.marker?.position;
        if (position) {
          const point = position instanceof google.maps.LatLng ? position.toJSON() : position;
          this.pick(point.lat, point.lng);
          this.message.set('');
        }
      });
    } else {
      this.marker.position = { lat, lng };
    }
    if (zoom) {
      map.setCenter({ lat, lng });
      map.setZoom(zoom);
    } else if (!map.getBounds()?.contains({ lat, lng })) {
      map.panTo({ lat, lng });
    }
  }
}
