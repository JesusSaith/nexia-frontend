/**
 * Mensajes de WhatsApp que la dueña manda a sus clientas. Cada uno tiene un texto por defecto y la
 * dueña puede reescribirlo en Configuración → Mensajes (el backend guarda solo los que cambió).
 *
 * Reglas de las variables:
 * - `{nombre}` es el nombre de pila; si falta, se quita y se acomoda la puntuación ("¡Hola!").
 * - Cualquier otra variable vacía quita su línea completa, para que no quede "Aquí: " colgando.
 */

export type MessageKey =
  | 'reminder'
  | 'booked'
  | 'deposit_ok'
  | 'proof_retry'
  | 'quote'
  | 'chat'
  | 'repeat'
  | 'review'
  | 'birthday'
  | 'miss_you'
  | 'opening'
  | 'waitlist'
  | 'share_link';

export type MessageVars = Partial<Record<MessageVar, string>>;

export type MessageVar = 'nombre' | 'negocio' | 'servicio' | 'dia' | 'hora' | 'equipo' | 'enlace' | 'cuando' | 'precio' | 'anticipo' | 'fechas' | 'cita';

export const VARIABLE_HELP: Record<MessageVar, string> = {
  nombre: 'Nombre de la clienta',
  negocio: 'Nombre de tu negocio',
  servicio: 'Servicio de la cita',
  dia: 'Día (jueves 16 de octubre)',
  hora: 'Hora',
  equipo: 'Quién atiende',
  enlace: 'Enlace (de la cita o para reservar)',
  cuando: '"hoy" o "mañana"',
  precio: 'Precio cotizado',
  anticipo: 'Monto del anticipo',
  fechas: 'Lista de fechas',
  cita: 'Cómo le dices a la cita (cita, consulta, clase…)',
};

export interface MessageTemplate {
  key: MessageKey;
  label: string;
  /** Dónde se usa, para que la dueña lo reconozca. */
  where: string;
  vars: MessageVar[];
  text: string;
}

export const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  {
    key: 'reminder',
    label: 'Recordatorio de cita',
    where: 'Inicio → recordatorios de mañana',
    vars: ['nombre', 'cuando', 'negocio', 'servicio', 'dia', 'hora', 'equipo', 'enlace'],
    text:
      'Hola {nombre} 👋 Te recordamos tu cita de {cuando} en {negocio}:\n\n📋 {servicio}\n📅 {dia}\n🕐 {hora}\n💁 Con {equipo}\n\n' +
      'Por favor confírmanos tu asistencia aquí. Si ya no puedes, ahí mismo la cambias o la cancelas para darle el lugar a alguien más:\n{enlace}\n\n¡Te esperamos!',
  },
  {
    key: 'booked',
    label: 'Cita agendada',
    where: 'Agenda → al crear una cita',
    vars: ['nombre', 'cita', 'servicio', 'dia', 'hora', 'enlace'],
    text: 'Hola {nombre}, tu {cita} de {servicio} quedó el {dia} a las {hora}.\nPuedes verla o cancelarla aquí: {enlace}',
  },
  {
    key: 'deposit_ok',
    label: 'Anticipo recibido',
    where: 'Agenda → al aceptar un comprobante',
    vars: ['nombre', 'servicio', 'dia', 'hora'],
    text: 'Hola {nombre}, recibimos tu anticipo: tu cita de {servicio} del {dia} a las {hora} quedó confirmada. ¡Te esperamos!',
  },
  {
    key: 'proof_retry',
    label: 'Comprobante ilegible',
    where: 'Agenda → pedir otra foto del comprobante',
    vars: ['nombre', 'enlace'],
    text: 'Hola {nombre}, no se lee el comprobante. Sube otra foto aquí:\n{enlace}',
  },
  {
    key: 'quote',
    label: 'Cotización',
    where: 'Agenda → al poner precio a un servicio por cotizar',
    vars: ['nombre', 'servicio', 'dia', 'hora', 'precio', 'anticipo', 'enlace'],
    text:
      'Hola {nombre}, ya revisamos tu cita de {servicio}.\n\nDía: {dia}\nHora: {hora}\nPrecio: {precio}\n' +
      'Para apartar tu lugar el anticipo es de {anticipo}; el resto lo pagas en la cita.\n\nAquí puedes ver tu cita: {enlace}',
  },
  {
    key: 'chat',
    label: 'Escribirle por su cita',
    where: 'Agenda → botón de WhatsApp de una cita',
    vars: ['nombre', 'servicio', 'dia', 'hora'],
    text: 'Hola {nombre}, te escribimos por tu cita de {servicio} el {dia} a las {hora}.',
  },
  {
    key: 'repeat',
    label: 'Citas repetidas',
    where: 'Agenda → repetir cada 3 o 4 semanas',
    vars: ['nombre', 'servicio', 'hora', 'fechas'],
    text: 'Hola {nombre} 👋 Te apartamos tus próximas citas de {servicio} a las {hora}:\n\n{fechas}\n\nSi alguna fecha no te queda, avísanos por aquí y la movemos.',
  },
  {
    key: 'review',
    label: 'Pedir opinión',
    where: 'Agenda → después de cobrar',
    vars: ['nombre', 'enlace'],
    text: '¡Gracias por venir, {nombre}! 💛 ¿Nos ayudas con tu opinión? Toma 10 segundos:\n\n{enlace}',
  },
  {
    key: 'birthday',
    label: 'Feliz cumpleaños',
    where: 'Inicio y Clientes → cumpleaños de hoy',
    vars: ['nombre', 'negocio'],
    text: '¡Feliz cumpleaños, {nombre}! 🎉 Todo el equipo de {negocio} te desea un día increíble. ¡Te esperamos pronto para consentirte! 💖',
  },
  {
    key: 'miss_you',
    label: 'Te extrañamos',
    where: 'Clientes → dejaron de venir',
    vars: ['nombre', 'negocio'],
    text: '¡Hola {nombre}! 👋 Hace tiempo que no te vemos en {negocio} y te extrañamos. ¿Te apartamos tu próxima cita? Dinos qué día te acomoda.',
  },
  {
    key: 'opening',
    label: 'Ofrecer un horario libre',
    where: 'Inicio → huecos de mañana',
    vars: ['nombre', 'hora', 'equipo'],
    text: 'Hola {nombre}, mañana tenemos lugar a las {hora} con {equipo}. ¿Lo apartamos?',
  },
  {
    key: 'waitlist',
    label: 'Lista de espera',
    where: 'Inicio y Agenda → se liberó un horario',
    vars: ['nombre', 'negocio', 'servicio', 'dia', 'hora', 'enlace'],
    text:
      '¡Hola {nombre}! 👋 Estabas en la lista de espera de {negocio} y se liberó un horario:\n\n📋 {servicio}\n📅 {dia}\n🕐 {hora}\n\n' +
      'Si lo quieres, apártalo aquí antes de que alguien más lo tome:\n{enlace}',
  },
  {
    key: 'share_link',
    label: 'Compartir tu enlace',
    where: 'Mi negocio y Agenda → enviar por WhatsApp',
    vars: ['negocio', 'enlace'],
    text: '¡Hola! 👋 Ya puedes reservar tu cita en {negocio} en línea: eliges servicio, día y hora en segundos.\n\n{enlace}',
  },
];

const DEFAULTS = new Map(MESSAGE_TEMPLATES.map((template) => [template.key, template.text]));

export function defaultText(key: MessageKey): string {
  return DEFAULTS.get(key) ?? '';
}

/** Llena una plantilla. `{nombre}` vacío se quita; otra variable vacía quita su línea. */
export function fillTemplate(text: string, vars: MessageVars): string {
  const lines = text.split('\n').flatMap((line) => {
    let missing = false;
    const filled = line.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = (vars[name as MessageVar] ?? '').trim();
      if (!value && name !== 'nombre') {
        missing = true;
      }
      return value;
    });
    return missing ? [] : [filled.replace(/\s+([,.!?;:])/g, '$1').replace(/([¡¿])\s+/g, '$1').replace(/ {2,}/g, ' ').trimEnd()];
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Enlace de WhatsApp; a un número de 10 dígitos (México) se le antepone 52. Sin número abre "elegir chat". */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const number = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** "jueves 16 de octubre" a partir de "2026-10-16" o "2026-10-16T10:00:00". */
export function longDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "10:00 a.m." a partir de un timestamp local "2026-10-16T10:00:00". */
export function shortTime(value: string): string {
  const [hours, minutes] = value.slice(11, 16).split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
