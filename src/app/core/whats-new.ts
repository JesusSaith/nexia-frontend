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
    id: '2026-11-horarios-mas-claros',
    date: '2026-11-21',
    title: 'Horarios más fáciles',
    text: 'Ahora eliges si recibes citas "de tal a tal hora" o "solo a estas horas", y las horas se escriben de golpe ("9:30, 12:30, 4pm") o se tocan en una cuadrícula. Si dos horarios especiales se empalman, te avisamos cuál manda, y un calendario te muestra qué horario le toca a cada día.',
    icon: 'schedule',
    link: '/admin/schedules',
    linkLabel: 'Ver mis horarios',
  },
  {
    id: '2026-11-tarjeta-por-peldanos',
    date: '2026-11-20',
    title: 'Premios por visita, a tu manera',
    text: 'Ahora tu tarjeta puede premiar varias visitas: por ejemplo 5% en la 3, 20% en la 6 y un servicio gratis en la 10. También puedes regalar algo. Tus {clientes} ven su tarjeta con casillas, como las de papel.',
    icon: 'loyalty',
    link: '/admin/settings?sec=promociones',
    linkLabel: 'Armar mi tarjeta',
  },
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
