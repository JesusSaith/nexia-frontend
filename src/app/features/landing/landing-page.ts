import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { BUSINESS_KINDS, examplesFor } from '@core/business-kinds';
import { BetaService } from '@core/services/beta.service';
import { LandingService, LandingStats } from '@core/services/landing.service';

import { RevealDirective } from './reveal.directive';

/** WhatsApp de contacto: 10 dígitos más la clave de México. */
export const WHATSAPP_NUMBER = '522712054908';
const WHATSAPP_TEXT = 'Hola, me interesa la beta de Nexia para mi negocio.';

/**
 * Página de inicio de nexiacitas.com durante la beta: muestra qué es Nexia y recibe solicitudes de acceso
 * (POST /api/beta, que le avisa por correo a quien administra Nexia). Todavía no ofrece crear cuenta ni
 * muestra planes; cuando se abra al público se cambia el formulario por "Crear cuenta" (ver docs/PROYECTO.md).
 */
@Component({
  selector: 'app-landing-page',
  imports: [MatIconModule, ReactiveFormsModule, RevealDirective, RouterLink],
  templateUrl: './landing-page.html',
})
export class LandingPage implements AfterViewInit {
  private readonly beta = inject(BetaService);
  private readonly landing = inject(LandingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formSection = viewChild<ElementRef<HTMLElement>>('formSection');
  private readonly successBox = viewChild<ElementRef<HTMLElement>>('successBox');

  readonly whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
  readonly menuOpen = signal(false);
  readonly peopleOptions = [1, 2, 3, 4, 5, 6, 7];

  /** Pantallas por pestañas: celular y computadora, con un negocio de ejemplo. */
  readonly tabs = [
    { id: 'agenda', label: 'Agenda', icon: 'calendar_month', phone: '/landing/agenda-nueva.webp', desk: '/landing/d-agenda.webp', text: 'Las citas del día por persona, con lo que falta por cobrar. Las reservas nuevas aparecen solas.' },
    { id: 'clientes', label: 'Clientes', icon: 'groups', phone: '/landing/clientes.webp', desk: '/landing/d-clientes.webp', text: 'Quién viene, cuánto ha gastado y cuándo regresa.' },
    { id: 'reportes', label: 'Reportes', icon: 'insights', phone: '/landing/reportes.webp', desk: '/landing/d-reportes.webp', text: 'Ingresos, citas y los servicios que más te dejan.' },
    { id: 'qr', label: 'QR', icon: 'qr_code_2', phone: '/landing/qr.webp', desk: '/landing/d-qr.webp', text: 'Tu enlace, un código QR y un cartel para imprimir y pegar en tu local.' },
  ];
  readonly tab = signal('agenda');
  readonly currentTab = computed(() => this.tabs.find((t) => t.id === this.tab()) ?? this.tabs[0]);

  /** Selector de giro del inicio: cambia el celular de ejemplo (nombres de examplesFor y servicios de muestra). */
  readonly heroKinds = ['belleza', 'barberia', 'unas', 'spa', 'dental', 'veterinaria'].map((v) => BUSINESS_KINDS.find((k) => k.value === v)!);
  readonly heroKind = signal('belleza');
  private readonly heroServices: Record<string, { name: string; time: string; price: number }[]> = {
    belleza: [{ name: 'Corte y peinado', time: '45 min', price: 350 }, { name: 'Tinte completo', time: '2 h', price: 1200 }, { name: 'Peinado de fiesta', time: '1 h', price: 600 }],
    barberia: [{ name: 'Corte y barba', time: '45 min', price: 250 }, { name: 'Fade clásico', time: '30 min', price: 180 }, { name: 'Arreglo de barba', time: '20 min', price: 100 }],
    unas: [{ name: 'Gelish en manos', time: '1 h', price: 300 }, { name: 'Acrílicas', time: '2 h', price: 550 }, { name: 'Diseño a mano', time: '30 min', price: 120 }],
    spa: [{ name: 'Masaje relajante', time: '1 h', price: 700 }, { name: 'Facial hidratante', time: '1 h', price: 650 }, { name: 'Descontracturante', time: '1 h 30', price: 900 }],
    dental: [{ name: 'Limpieza dental', time: '45 min', price: 600 }, { name: 'Valoración', time: '30 min', price: 300 }, { name: 'Resina', time: '1 h', price: 800 }],
    veterinaria: [{ name: 'Consulta veterinaria', time: '30 min', price: 400 }, { name: 'Vacuna', time: '15 min', price: 250 }, { name: 'Baño y corte', time: '1 h', price: 350 }],
  };
  readonly heroMock = computed(() => {
    const kind = this.heroKind();
    const ex = examplesFor(kind);
    return { name: ex.name, initial: ex.name.charAt(0), description: ex.description, services: this.heroServices[kind] ?? this.heroServices['belleza'] };
  });

  /** Calculadora de faltas: citas por semana, porcentaje que no llega y precio promedio. */
  readonly calcWeekly = signal(30);
  readonly calcMiss = signal(15);
  readonly calcPrice = signal(350);
  readonly calcLoss = computed(() => Math.round(this.calcWeekly() * 4.33 * (this.calcMiss() / 100) * this.calcPrice()));
  readonly calcLossYear = computed(() => this.calcLoss() * 12);

  /** Cifras reales: solo se muestran cuando ya dan confianza (no queremos presumir "3 citas"). */
  readonly stats = signal<LandingStats | null>(null);
  readonly showStats = computed(() => {
    const s = this.stats();
    return !!s && s.appointments >= 25 && s.businesses >= 3;
  });

  /** Lo que incluye la beta. */
  readonly offer = [
    { icon: 'redeem', title: 'Gratis mientras dure la beta', text: 'No pagas nada por usar Nexia en esta etapa.' },
    { icon: 'support_agent', title: 'Acompañamiento por WhatsApp', text: 'Te ayudamos a configurar y resolvemos tus dudas.' },
    { icon: 'sell', title: 'Precio especial al terminar', text: 'Quienes entran a la beta tendrán un precio preferente.' },
    { icon: 'forum', title: 'Tu opinión define lo que sigue', text: 'Lo que nos pidas se convierte en la siguiente mejora.' },
  ];

  readonly moreOpen = signal(false);

  readonly DEMO_PATH = '/demo/book';

  readonly before = [
    'Contestar mensajes a todas horas para dar una cita.',
    'Citas que se pierden por olvidos o se encimen.',
    'Anotar todo en una libreta o en las notas del celular.',
    'No saber cuánto dejó cada servicio ni cada persona.',
  ];
  readonly after = [
    'Tus clientes reservan solos, a cualquier hora.',
    'Agenda por persona, sin choques y con recordatorios.',
    'Clientes, anticipos y cobros en un solo lugar.',
    'Reportes de lo que más te deja, cada semana.',
  ];
  readonly coming = ['Recordatorios automáticos por WhatsApp', 'Planes para cada tamaño de negocio', 'Más giros y plantillas listas'];

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
    businessName: new FormControl('', { nonNullable: true }),
    kind: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    people: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\D*(\d\D*){10}$/)] }),
    message: new FormControl('', { nonNullable: true }),
    // Campo trampa: está fuera de pantalla; solo los robots lo llenan.
    website: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Primer movimiento en el formulario: la persona empezó a llenarlo.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.landing.track('start'));
    this.landing.track('visit');
    this.landing.stats().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
  }

  ngAfterViewInit(): void {
    const el = this.formSection()?.nativeElement;
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.landing.track('form');
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(el);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Valor numérico de un campo de la calculadora, acotado a un rango razonable. */
  setCalc(target: 'weekly' | 'miss' | 'price', event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? raw : 0;
    if (target === 'weekly') {
      this.calcWeekly.set(Math.min(Math.max(value, 0), 500));
    } else if (target === 'miss') {
      this.calcMiss.set(Math.min(Math.max(value, 0), 100));
    } else {
      this.calcPrice.set(Math.min(Math.max(value, 0), 20000));
    }
  }

  money(value: number): string {
    return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  openWhatsapp(): void {
    this.landing.track('whatsapp');
  }

  /** Mensaje de error de un campo: al salir de él o después de intentar enviar. */
  fieldError(name: 'name' | 'kind' | 'email' | 'phone'): string | null {
    const control = this.form.controls[name];
    if (!(this.touched() || control.touched) || control.valid) {
      return null;
    }
    const texts = {
      name: 'Escribe tu nombre.',
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
        business_name: v.businessName.trim() || null,
        kind: v.kind,
        message: v.message.trim() || null,
        people: v.people ? Number(v.people) : null,
        source: this.landing.source(),
        website: v.website,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.sent.set(true);
          this.landing.track('sent');
          // Lleva a la persona a la confirmación (el formulario desaparece y la página se acorta).
          setTimeout(() => {
            const box = this.successBox()?.nativeElement;
            box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            box?.focus({ preventScroll: true });
          });
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
