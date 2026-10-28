import { BusinessWords } from './business-words';

export interface HelpTopic {
  id: string;
  title: string;
  icon: string;
  /** Prefijos de ruta donde este tema es "el de esta pantalla". */
  routes: string[];
  /** Quién lo ve: todos o solo quien administra. */
  managerOnly: boolean;
  summary: string;
  tips: string[];
}

/** Ayuda corta por pantalla. Los textos usan las palabras del giro (cliente, equipo, cita) y sirven para cualquiera. */
export function helpTopics(words: BusinessWords): HelpTopic[] {
  const client = words.client.toLowerCase();
  const clients = words.clients.toLowerCase();
  const people = words.people.toLowerCase();
  const visit = words.visit.toLowerCase();
  return [
    {
      id: 'inicio',
      title: 'Inicio',
      icon: 'home',
      routes: ['/admin/home'],
      managerOnly: true,
      summary: `Lo que pasó y lo que sigue hoy: avisos, ${visit}s de hoy y pendientes.`,
      tips: [
        `Cada aviso tiene su botón: abrir la ${visit}, mandar un WhatsApp o avisar a la lista de espera.`,
        'Usa los filtros arriba de los avisos para ver solo lo que te interesa.',
        'La lista de arranque te dice qué falta para que tu página reciba reservas.',
      ],
    },
    {
      id: 'agenda',
      title: 'Agenda',
      icon: 'calendar_month',
      routes: ['/admin/agenda'],
      managerOnly: false,
      summary: `Aquí ves, creas y cobras las ${visit}s de todo el día.`,
      tips: [
        `Toca el botón + para agendar una ${visit} a mano, por ejemplo cuando un ${client} te escribe por WhatsApp.`,
        `Toca una ${visit} para ver su ficha: cambiarla de hora, cancelarla o cobrarla.`,
        'En el celular, desliza a los lados para cambiar de día.',
        `Al cobrar puedes mandarle el recibo por WhatsApp a tu ${client}.`,
      ],
    },
    {
      id: 'clientes',
      title: words.clients,
      icon: 'person',
      routes: ['/admin/clientes'],
      managerOnly: false,
      summary: `Todos tus ${clients} con su historial, notas y paquetes.`,
      tips: [
        `Busca por nombre o por teléfono. También puedes usar la lupa de arriba en cualquier pantalla.`,
        `Abre la ficha para ver sus ${visit}s anteriores y escribirle por WhatsApp.`,
        'Los filtros te ayudan a encontrar a quien lleva tiempo sin venir.',
      ],
    },
    {
      id: 'reportes',
      title: 'Reportes',
      icon: 'space_dashboard',
      routes: ['/admin/dashboard'],
      managerOnly: true,
      summary: 'Cuánto vendiste, cuánto gastaste y qué servicios se piden más.',
      tips: [
        'Cambia el periodo arriba para comparar semanas o meses.',
        'Registra tus gastos para ver cuánto te queda de verdad.',
      ],
    },
    {
      id: 'servicios',
      title: 'Servicios',
      icon: 'category',
      routes: ['/admin/services'],
      managerOnly: true,
      summary: `Lo que ofreces: nombre, precio y cuánto dura. Tus ${clients} lo eligen al reservar.`,
      tips: [
        `Pon la duración real: de ella depende cuántas ${visit}s caben en el día.`,
        'Un servicio pausado deja de aparecer en tu página pero no se borra.',
      ],
    },
    {
      id: 'equipo',
      title: 'Equipo',
      icon: 'groups',
      routes: ['/admin/staff'],
      managerOnly: true,
      summary: `Tus ${people}: qué servicios hace cada uno y su acceso al panel.`,
      tips: [
        `Marca qué servicios hace cada ${words.person.toLowerCase()}; solo esos aparecen cuando alguien reserva con él.`,
        'Puedes darle acceso para que vea solo su propia agenda.',
      ],
    },
    {
      id: 'horarios',
      title: 'Horarios',
      icon: 'schedule',
      routes: ['/admin/schedules'],
      managerOnly: true,
      summary: `Cuándo trabaja cada quien. Tus ${clients} solo pueden reservar dentro de estos horarios.`,
      tips: [
        'Guarda los cambios antes de salir: si no, te preguntaremos si quieres descartarlos.',
        'Para un día de descanso o un cierre especial, bloquea ese día desde la Agenda.',
      ],
    },
    {
      id: 'negocio',
      title: 'Mi negocio',
      icon: 'storefront',
      routes: ['/admin/negocio'],
      managerOnly: true,
      summary: 'Los datos y el aspecto de tu página de reservas: nombre, logo, colores, dirección y enlace.',
      tips: [
        'Copia tu enlace y compártelo en tus redes o en tu estado de WhatsApp.',
        'Revisa cómo se ve tu página real desde Configuración.',
      ],
    },
    {
      id: 'configuracion',
      title: 'Configuración',
      icon: 'tune',
      routes: ['/admin/settings'],
      managerOnly: true,
      summary: 'Reglas de reserva, anticipos, avisos por correo y los mensajes de WhatsApp.',
      tips: [
        'Puedes reescribir cada mensaje de WhatsApp; la vista previa muestra cómo se verá.',
        `Los anticipos ayudan a que tus ${clients} no falten sin avisar.`,
        'Guarda al terminar: los cambios no se aplican hasta entonces.',
      ],
    },
    {
      id: 'perfil',
      title: 'Mi perfil',
      icon: 'account_circle',
      routes: ['/admin/profile'],
      managerOnly: false,
      summary: 'Tus datos y tu contraseña.',
      tips: ['Si olvidas tu contraseña, pide a quien administra el negocio que te dé una temporal.'],
    },
  ];
}

/** El tema de la pantalla actual (el de la ruta más larga que coincida), o null si no hay. */
export function topicForRoute(topics: readonly HelpTopic[], url: string): HelpTopic | null {
  const path = url.split(/[?#]/)[0];
  let best: HelpTopic | null = null;
  let bestLength = -1;
  for (const topic of topics) {
    for (const route of topic.routes) {
      if ((path === route || path.startsWith(route + '/')) && route.length > bestLength) {
        best = topic;
        bestLength = route.length;
      }
    }
  }
  return best;
}
