/** Novedades que se anuncian en Inicio. La más nueva va primero; la clave no se repite ni se cambia (el negocio guarda la última vista). */
export interface NewsItem {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  title: string;
  /** Usa {clientes} para nombrar a quien reserva según el giro (clientes, pacientes, tutores). */
  text: string;
  /** Nombre del ícono de Material. */
  icon: string;
  /** Ruta con parámetros opcionales, como los avisos de Inicio: "/admin/settings?sec=promociones". */
  link?: string;
  linkLabel?: string;
}

export const WHATS_NEW: NewsItem[] = [
  {
    id: '2026-11-tarjeta-de-clientes',
    date: '2026-11-17',
    title: 'Tarjeta de cliente frecuente',
    text: 'Tus {clientes} ven cuántos sellos llevan y cuándo les toca su premio, desde la página de reservas. Tú decides cada cuántas visitas y qué descuento.',
    icon: 'loyalty',
    link: '/admin/settings?sec=promociones',
    linkLabel: 'Configurar el premio',
  },
];

/** Cuántas novedades se muestran juntas en Inicio. */
export const NEWS_LIMIT = 3;

/** Las que la dueña todavía no ha visto: todas las anteriores a la última que marcó, o las más recientes si nunca marcó. */
export function unseenNews(seen: string | null | undefined, items: NewsItem[] = WHATS_NEW): NewsItem[] {
  const index = seen ? items.findIndex((item) => item.id === seen) : -1;
  return (index >= 0 ? items.slice(0, index) : items).slice(0, NEWS_LIMIT);
}

/** El texto de una novedad con {clientes} resuelto para el giro del negocio. */
export function newsText(item: NewsItem, clients: string): string {
  return item.text.replaceAll('{clientes}', clients.toLowerCase());
}
