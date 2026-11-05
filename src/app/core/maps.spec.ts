import { canNavigate, googleMapsUrl, pointFromLink, staticMap, wazeUrl } from './maps';

describe('maps', () => {
  it('lee el punto de los enlaces largos de Google Maps', () => {
    expect(pointFromLink('https://www.google.com/maps/place/Salon/@19.4326077,-99.133208,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.4326!4d-99.1332')).toEqual({ lat: 19.4326, lng: -99.1332 });
    expect(pointFromLink('https://www.google.com/maps/@20.6597,-103.3496,15z')).toEqual({ lat: 20.6597, lng: -103.3496 });
    expect(pointFromLink('https://maps.google.com/?q=25.6866,-100.3161')).toEqual({ lat: 25.6866, lng: -100.3161 });
    expect(pointFromLink('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
    expect(pointFromLink('Av. Juárez 10, Centro')).toBeNull();
  });

  it('usa el punto si lo hay y si no la dirección', () => {
    const point = { address: 'Juárez 10', latitude: 19.43, longitude: -99.13 };
    expect(googleMapsUrl(point)).toBe('https://www.google.com/maps/dir/?api=1&destination=19.43%2C-99.13');
    expect(wazeUrl(point)).toContain('ll=19.43%2C-99.13');

    const onlyAddress = { address: 'Juárez 10, Centro' };
    expect(googleMapsUrl(onlyAddress)).toContain('destination=Ju%C3%A1rez%2010%2C%20Centro');
    expect(staticMap(onlyAddress)).toBeNull();
    expect(canNavigate({ address: '  ' })).toBe(false);
  });

  it('arma el mapa fijo con el punto dentro del mosaico central', () => {
    // Zócalo de la CDMX a zoom 16: mosaico 14721 × 29160.
    const view = staticMap({ latitude: 19.4326, longitude: -99.1332 })!;
    expect(view.tiles).toHaveLength(15);
    expect(view.tiles[7].src).toBe('https://tile.openstreetmap.org/16/14721/29160.png');
    expect(view.x).toBeGreaterThanOrEqual(512);
    expect(view.x).toBeLessThan(768);
    expect(view.y).toBeGreaterThanOrEqual(256);
    expect(view.y).toBeLessThan(512);
  });
});
