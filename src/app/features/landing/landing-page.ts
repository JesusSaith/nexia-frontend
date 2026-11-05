import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { BUSINESS_KINDS } from '@core/business-kinds';
import { BetaService } from '@core/services/beta.service';

/**
 * Página de inicio de nexiacitas.com durante la beta: muestra qué es Nexia y recibe solicitudes de acceso
 * (POST /api/beta, que le avisa por correo a quien administra Nexia). Todavía no ofrece crear cuenta ni
 * muestra planes; cuando se abra al público se cambia el formulario por "Crear cuenta" (ver docs/PROYECTO.md).
 */
@Component({
  selector: 'app-landing-page',
  imports: [MatIconModule, ReactiveFormsModule, RouterLink],
  templateUrl: './landing-page.html',
})
export class LandingPage {
  private readonly beta = inject(BetaService);

  readonly kinds = BUSINESS_KINDS;

  readonly features = [
    { icon: 'event_available', title: 'Reservas a cualquier hora', text: 'Tus clientes ven los horarios libres y apartan desde el celular, sin escribirte.', tone: 'light' },
    { icon: 'payments', title: 'Anticipo y cobro', text: 'Pide anticipo por transferencia con comprobante y registra el cobro al terminar.', tone: 'accent' },
    { icon: 'calendar_month', title: 'Agenda clara', text: 'Todas las citas del día por persona de tu equipo, con bloqueos y días libres.', tone: 'dark' },
    { icon: 'chat', title: 'Mensajes de WhatsApp listos', text: 'Recordatorios y avisos ya escritos; con un toque los envías desde tu teléfono.', tone: 'light' },
    { icon: 'groups', title: 'Equipo y comisiones', text: 'Cada persona ve solo su agenda. Tú ves cuánto dejó cada servicio y cuánto le toca a cada quien.', tone: 'accent' },
    { icon: 'hourglass_top', title: 'Clientes y lista de espera', text: 'Historial de cada cliente, cumpleaños y aviso cuando se libera un horario.', tone: 'dark' },
    { icon: 'insights', title: 'Reportes sencillos', text: 'Ingresos, citas, servicios que más dejan y de dónde llegan tus reservas.', tone: 'light' },
    { icon: 'qr_code_2', title: 'Enlace y código QR', text: 'Tu propio enlace, un QR y un cartel para imprimir y pegar en tu local.', tone: 'accent' },
  ];

  readonly steps = [
    { title: 'Pide tu acceso', text: 'Llena el formulario de abajo con los datos de tu negocio. Nos llega al instante.' },
    { title: 'Te damos acceso', text: 'Revisamos tu solicitud y te escribimos por correo o WhatsApp para abrirte la cuenta.' },
    { title: 'Configura tu negocio', text: 'Agrega tus servicios, tu equipo y tus horarios. Un asistente te guía paso a paso.' },
    { title: 'Comparte tu enlace', text: 'Ponlo en Instagram, WhatsApp o Google Maps. Tus clientes reservan solos, a cualquier hora.' },
  ];

  readonly audiences = [
    { icon: 'content_cut', title: 'Salones y barberías', text: 'Cortes, color, uñas y spa: varias personas, servicios con duraciones distintas y comisiones por persona.' },
    { icon: 'stethoscope', title: 'Consultorios y clínicas', text: 'Consultas y tratamientos con cita, recordatorios para evitar faltas y un historial por paciente.' },
    { icon: 'pets', title: 'Veterinarias y estudios', text: 'Citas para mascotas, sesiones o clases, con anticipo cuando lo necesites.' },
  ];

  readonly faqs = [
    { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Reservan desde el navegador de su celular, con el enlace que les compartes.' },
    { q: '¿Qué es la beta?', a: 'Estamos abriendo Nexia a pocos negocios para pulirla con su uso real. Quien entra a la beta nos ayuda a mejorarla y recibe acompañamiento.' },
    { q: '¿Sirve para mi tipo de negocio?', a: 'Sirve para cualquier negocio que atienda con cita: salones, barberías, spas, consultorios, clínicas, veterinarias y estudios.' },
    { q: '¿Puedo pedir anticipo?', a: 'Sí. Tú decides si lo pides, de cuánto y qué pasa con él si el cliente cancela.' },
    { q: '¿Qué pasa con los datos de mis clientes?', a: 'Son tuyos. Los guardamos solo para darte el servicio y no los vendemos.' },
  ];

  readonly submitting = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);
  readonly touched = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    businessName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    kind: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\D*(\d\D*){10}$/)] }),
    message: new FormControl('', { nonNullable: true }),
    // Campo trampa: está fuera de pantalla; solo los robots lo llenan.
    website: new FormControl('', { nonNullable: true }),
  });

  /** Mensaje de error de un campo, solo después del primer intento de enviar. */
  fieldError(name: 'name' | 'businessName' | 'kind' | 'email' | 'phone'): string | null {
    const control = this.form.controls[name];
    if (!this.touched() || control.valid) {
      return null;
    }
    const texts = {
      name: 'Escribe tu nombre.',
      businessName: 'Escribe el nombre de tu negocio.',
      kind: 'Elige el tipo de negocio.',
      email: 'Revisa el correo; parece incompleto.',
      phone: 'El WhatsApp debe tener 10 dígitos.',
    };
    return texts[name];
  }

  submit(): void {
    this.touched.set(true);
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.beta
      .request({
        name: v.name.trim(),
        email: v.email.trim(),
        phone: v.phone,
        business_name: v.businessName.trim(),
        kind: v.kind,
        message: v.message.trim() || null,
        website: v.website,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.sent.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.error.set(
            err.status === 429
              ? 'Enviaste varias solicitudes seguidas. Espera unos minutos e inténtalo de nuevo.'
              : 'No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo.',
          );
        },
      });
  }
}
