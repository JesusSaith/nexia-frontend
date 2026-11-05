/**
 * Google Maps: mapa de la dueña (Configuración), buscador de direcciones y mapa fijo del cliente.
 * La llave es pública por naturaleza (va en el navegador): en Google Cloud restríngela por
 * "Sitios web" a tu dominio y a localhost, y a estas APIs: Maps JavaScript API, Maps Static API y
 * Places API (New). Vacía, la app usa OpenStreetMap.
 */
export const GOOGLE_MAPS_KEY = '';

/**
 * ID de mapa (Google Cloud → Gestión de mapas), necesario para el pin arrastrable.
 * 'DEMO_MAP_ID' sirve para probar; para producción crea uno propio de tipo JavaScript.
 */
export const GOOGLE_MAP_ID = 'DEMO_MAP_ID';
