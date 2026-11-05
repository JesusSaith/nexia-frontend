import { BetaRequestItem } from '@core/models/platform-business.model';

export interface WeekMessage {
  day: number;
  label: string;
  text: string;
}

/** Enlace de WhatsApp (clave de México) con el texto ya escrito. */
export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/52${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Mensajes de la primera semana de quien entra a la beta (día 1, 3 y 7). Van en WhatsApp, ya escritos:
 * quien administra Nexia solo toca el botón. Se escriben en tuteo y sin dar por hecho el género.
 */
export function weekOneMessages(item: BetaRequestItem): WeekMessage[] {
  const first = item.name.trim().split(' ')[0];
  const business = item.business_name?.trim() ? ` de ${item.business_name.trim()}` : '';
  return [
    {
      day: 1,
      label: 'Día 1 · Bienvenida',
      text: `Hola ${first}, ¡bienvenido a la beta de Nexia! 🎉 Ya puedes crear tu negocio${business} con el enlace que te llegó por correo. Si algo no queda claro, escríbeme por aquí y lo vemos juntos.`,
    },
    {
      day: 3,
      label: 'Día 3 · ¿Cómo vas?',
      text: `Hola ${first}, ¿cómo vas con Nexia? Para que tus clientes ya puedan reservar solo faltan tus servicios y tus horarios. ¿Te ayudo a dejarlos listos? Son unos 10 minutos.`,
    },
    {
      day: 7,
      label: 'Día 7 · Tu opinión',
      text: `Hola ${first}, ya llevas una semana en la beta de Nexia 🙌 ¿Qué es lo que más te ha servido y qué te ha costado trabajo? Tu opinión define lo que mejoramos primero.`,
    },
  ];
}
