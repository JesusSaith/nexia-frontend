import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { BUSINESS_KINDS } from '@core/business-kinds';

/**
 * Página de inicio de nexiacitas.com: explica qué es Nexia a quien aún no tiene cuenta.
 * Quien ya tiene sesión nunca la ve (landingGuard la manda a su panel). Sin precios: los planes
 * todavía no existen en el sistema (ver docs/PROYECTO.md, sección 9).
 */
@Component({
  selector: 'app-landing-page',
  imports: [MatIconModule, RouterLink],
  templateUrl: './landing-page.html',
})
export class LandingPage {
  /** Los giros del registro, sin "Otro" (aparte se aclara que sirve para cualquier negocio con cita). */
  readonly kinds = BUSINESS_KINDS.filter((k) => k.value !== 'otro');

  readonly steps = [
    { icon: 'storefront', title: 'Crea tu cuenta', text: 'Elige tu giro, escribe el nombre de tu negocio y listo. Te toma unos minutos.' },
    { icon: 'tune', title: 'Pon tus servicios y horarios', text: 'Agrega lo que ofreces, quién lo hace y cuándo atienden. Te guiamos paso a paso.' },
    { icon: 'ios_share', title: 'Comparte tu enlace', text: 'Ponlo en tu Instagram, WhatsApp o Google Maps. Tus clientes reservan solos, a cualquier hora.' },
  ];

  readonly features = [
    { icon: 'event_available', title: 'Reservas a cualquier hora', text: 'Tus clientes ven los horarios libres y apartan desde el celular, sin escribirte.' },
    { icon: 'calendar_month', title: 'Agenda clara', text: 'Todas las citas del día en un lugar, por persona de tu equipo, con bloqueos y días libres.' },
    { icon: 'payments', title: 'Anticipo y cobro', text: 'Pide anticipo por transferencia con comprobante y registra el cobro al terminar la cita.' },
    { icon: 'chat', title: 'Mensajes de WhatsApp listos', text: 'Recordatorios y avisos ya escritos; con un toque los envías desde tu propio teléfono.' },
    { icon: 'groups', title: 'Equipo y comisiones', text: 'Cada persona ve solo su agenda. Tú ves cuánto dejó cada servicio y cuánto le toca a cada quien.' },
    { icon: 'groups_3', title: 'Clientes y lista de espera', text: 'Historial de cada cliente, cumpleaños y aviso cuando se libera un horario.' },
    { icon: 'insights', title: 'Reportes sencillos', text: 'Ingresos, citas, servicios que más dejan y de dónde llegan tus reservas.' },
    { icon: 'qr_code_2', title: 'Enlace y código QR', text: 'Tu propio enlace, un QR y un cartel para imprimir y pegar en tu local.' },
  ];

  readonly faqs = [
    { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Reservan desde el navegador de su celular, con el enlace que les compartes.' },
    { q: '¿Qué necesito para empezar?', a: 'Solo tu correo y los datos de tu negocio. Puedes tener tu página de reservas lista el mismo día.' },
    { q: '¿Sirve para mi tipo de negocio?', a: 'Sirve para cualquier negocio que atienda con cita: salones, barberías, spas, consultorios, clínicas, veterinarias y estudios.' },
    { q: '¿Puedo pedir anticipo?', a: 'Sí. Tú decides si lo pides, de cuánto y qué pasa con él si el cliente cancela. El cliente sube su comprobante al reservar.' },
    { q: '¿Mi equipo puede usarlo?', a: 'Sí. Cada persona entra con su cuenta y ve solo su agenda. El dinero, los precios y los reportes los ves tú.' },
    { q: '¿Qué pasa con los datos de mis clientes?', a: 'Son tuyos. Los guardamos solo para darte el servicio y no los vendemos. Puedes leer el aviso de privacidad al pie de la página.' },
  ];
}
