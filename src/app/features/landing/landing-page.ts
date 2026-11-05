import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { BUSINESS_KINDS, clientsWordFor, examplesFor } from '@core/business-kinds';
import { BetaService } from '@core/services/beta.service';
import { LandingService, LandingStats } from '@core/services/landing.service';

import { CountUpDirective } from './count-up.directive';
import { RevealDirective } from './reveal.directive';
import { TiltDirective } from './tilt.directive';

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
  imports: [CountUpDirective, MatIconModule, ReactiveFormsModule, RevealDirective, RouterLink, TiltDirective],
  templateUrl: './landing-page.html',
})
export class LandingPage implements AfterViewInit {
  private readonly beta = inject(BetaService);
  private readonly landing = inject(LandingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formDialog = viewChild<ElementRef<HTMLDialogElement>>('formDialog');
  private readonly successBox = viewChild<ElementRef<HTMLElement>>('successBox');

  readonly whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
  readonly menuOpen = signal(false);
  readonly peopleOptions = [1, 2, 3, 4, 5, 6, 7];

  /** Pantallas por pestañas: celular y computadora, con un negocio de ejemplo. */
  readonly tabs = [
    { id: 'agenda', label: 'Agenda', icon: 'calendar_month', phone: '/landing/agenda-nueva.webp', desk: '/landing/d-agenda.webp', spots: [
      { x: 80, y: 15, text: 'Agrega una cita a mano.' },
      { x: 92, y: 56, text: 'Cobra con un toque.' },
      { x: 61, y: 90, text: 'Las reservas nuevas llegan aquí.' },
    ] },
    { id: 'clientes', label: 'Clientes', icon: 'groups', phone: '/landing/clientes.webp', desk: '/landing/d-clientes.webp', spots: [
      { x: 90, y: 8, text: 'Agrega o importa tus clientes.' },
      { x: 40, y: 19, text: 'Filtra a tus mejores clientes.' },
      { x: 33, y: 55, text: 'Ve cuándo es su próxima cita.' },
      { x: 93, y: 52, text: 'Sabe cuánto ha gastado.' },
    ] },
    { id: 'reportes', label: 'Reportes', icon: 'insights', phone: '/landing/reportes.webp', desk: '/landing/d-reportes.webp', spots: [
      { x: 39, y: 44, text: 'Si ganas o pierdes, de un vistazo.' },
      { x: 70, y: 43, text: 'Lo que falta por cobrar.' },
      { x: 93, y: 69, text: 'Cuánto deja cada cita.' },
    ] },
    { id: 'qr', label: 'QR', icon: 'qr_code_2', phone: '/landing/qr.webp', desk: '/landing/d-qr.webp', spots: [
      { x: 85, y: 50, text: 'Tu QR, listo para imprimir.' },
      { x: 85, y: 70, text: 'Un cartel para pegar en tu local.' },
      { x: 31, y: 87, text: 'Copia tu enlace y compártelo.' },
    ] },
  ];
  readonly tab = signal('agenda');
  readonly spot = signal(0);
  readonly currentTab = computed(() => this.tabs.find((t) => t.id === this.tab()) ?? this.tabs[0]);
  readonly currentSpot = computed(() => this.currentTab().spots[this.spot()] ?? this.currentTab().spots[0]);

  setTab(id: string): void {
    this.tab.set(id);
    this.spot.set(0);
  }

  /** Selector de giro del inicio: cambia el celular de ejemplo (nombres de examplesFor y servicios de muestra). */
  readonly heroKinds = ['belleza', 'barberia', 'unas', 'spa', 'dental', 'veterinaria'].map((v) => BUSINESS_KINDS.find((k) => k.value === v)!);
  readonly heroKind = signal('belleza');
  /** Color de cada giro: al elegirlo, el acento de todo el inicio cambia (todos con buen contraste sobre blanco). */
  private readonly kindColors: Record<string, string> = { belleza: '#e11d48', barberia: '#1d4ed8', unas: '#a21caf', spa: '#0f766e', dental: '#0369a1', veterinaria: '#b45309' };
  readonly heroTheme = computed(() => {
    const color = this.kindColors[this.heroKind()] ?? '#e11d48';
    return { '--primary': color, '--color-accent': color, '--primary-text': color, '--color-accent-soft': `color-mix(in srgb, ${color} 10%, #fff)` };
  });
  readonly heroIcon = computed(() => this.heroKinds.find((k) => k.value === this.heroKind())?.icon ?? 'event_available');

  /** Reserva de juguete del celular del inicio: servicio, horario y cita confirmada. */
  readonly mockStep = signal<'servicio' | 'horario' | 'listo'>('servicio');
  readonly mockService = signal<{ name: string; time: string; price: number } | null>(null);
  readonly mockSlot = signal('');
  readonly slots = [
    { t: '10:00 a.m.', busy: false }, { t: '11:30 a.m.', busy: true }, { t: '1:00 p.m.', busy: false },
    { t: '3:30 p.m.', busy: false }, { t: '5:00 p.m.', busy: true }, { t: '6:30 p.m.', busy: false },
  ];
  readonly mockHint = computed(() => ({ servicio: 'Pruébalo: toca un servicio', horario: 'Ahora elige una hora', listo: 'Así reserva tu cliente' })[this.mockStep()]);

  setHeroKind(value: string): void {
    this.heroKind.set(value);
    this.mockStep.set('servicio');
  }

  pickService(service: { name: string; time: string; price: number }): void {
    this.mockTouched.set(true);
    this.mockService.set(service);
    this.mockStep.set('horario');
  }

  pickSlot(time: string): void {
    this.mockSlot.set(time);
    this.mockStep.set('listo');
  }

  resetMock(): void {
    this.mockStep.set('servicio');
  }

  /** Antes y después: dónde está la línea que se arrastra (0 a 100). */
  readonly cut = signal(50);
  setCut(event: Event): void {
    this.cut.set(Number((event.target as HTMLInputElement).value));
  }

  /** Línea de tiempo de "Cómo funciona": qué tanto se ha recorrido al bajar (0 a 1). */
  private readonly timeline = viewChild<ElementRef<HTMLElement>>('timeline');
  readonly progress = signal(0);
  /** Avance de toda la página (barra fina de arriba) y sección actual (puntos laterales). */
  readonly scrollPct = signal(0);
  readonly activeSection = signal('inicio');
  readonly sections = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'explora', label: 'Explora' },
    { id: 'funciones', label: 'Funciones' },
    { id: 'como-funciona', label: 'Cómo funciona' },
    { id: 'para-quien', label: 'Para quién' },
    { id: 'preguntas', label: 'Preguntas' },
  ];

  /** Explora: pantallas, video y calculadora en un solo bloque. */
  readonly exploreTabs = [
    { id: 'pantallas', label: 'Pantallas', icon: 'devices' },
    { id: 'video', label: 'Video', icon: 'play_circle' },
    { id: 'calc', label: 'Cuánto pierdes', icon: 'calculate' },
    { id: 'comparar', label: 'Comparar', icon: 'compare_arrows' },
    { id: 'dia', label: 'Tu día', icon: 'schedule' },
  ];
  readonly explore = signal('pantallas');

  /** Qué hace Nexia por cada giro (sigue al giro elegido arriba). */
  private readonly kindPoints: Record<string, string[]> = {
    belleza: ['Varias personas y comisiones por persona.', 'Servicios con duraciones distintas.', 'Anticipo para los servicios largos.'],
    barberia: ['Agenda por barbero, sin choques.', 'Cortes de 20 a 45 minutos.', 'Recordatorios para que no falten.'],
    unas: ['Duraciones largas, sin empalmes.', 'Anticipo para diseños y acrílicas.', 'Tu enlace y QR para el local.'],
    spa: ['Terapeutas en una sola agenda.', 'Paquetes de sesiones.', 'Citas con anticipo.'],
    dental: ['Recordatorios para evitar faltas.', 'Historial por paciente.', 'Valoración y tratamiento por separado.'],
    veterinaria: ['Citas por mascota y por tutor.', 'Aviso de "te toca volver".', 'Historial de cada mascota.'],
  };
  readonly kindInfo = computed(() => {
    const kind = this.heroKinds.find((k) => k.value === this.heroKind()) ?? this.heroKinds[0];
    return { label: kind.label, icon: kind.icon, points: this.kindPoints[kind.value] ?? this.kindPoints['belleza'] };
  });


  /** Cómo se llama a quien reserva según el giro elegido ("clientes", "pacientes", "tutores"); {c} y {C} en los textos. */
  readonly clientWord = computed(() => clientsWordFor(this.heroKind()));
  t(text: string): string {
    const word = this.clientWord();
    return text.replace(/\{c\}/g, word).replace(/\{C\}/g, word.charAt(0).toUpperCase() + word.slice(1));
  }

  /** Figura que flota junto al celular: cambia con el giro. */
  private readonly shapePaths: Record<string, string> = {
    belleza: 'M24 2l5 15 15 5-15 5-5 15-5-15-15-5 15-5z',
    barberia: 'M24 2l20 22-20 22L4 24z',
    unas: 'M24 4c10 8 16 14 16 22a16 16 0 0 1-32 0c0-8 6-14 16-22z',
    spa: 'M24 4c6 8 6 14 0 22-6-8-6-14 0-22zM8 20c8 0 14 4 16 12-8 0-14-4-16-12zM40 20c-8 0-14 4-16 12 8 0 14-4 16-12z',
    dental: 'M24 4l6 6h10v10l6 6-6 6v10H30l-6 6-6-6H8V32l-6-6 6-6V10h10z',
    veterinaria: 'M24 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM10 16a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM38 16a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM24 24c8 0 14 8 10 14-3 4-8 2-10 2s-7 2-10-2c-4-6 2-14 10-14z',
  };
  readonly heroShape = computed(() => this.shapePaths[this.heroKind()] ?? this.shapePaths['belleza']);

  /** Agenda de ejemplo del giro: la usan la tarjeta "Hoy en tu agenda" y la pantalla "Tu giro". */
  private readonly agendaNames: Record<string, string[]> = {
    belleza: ['Mariana Ortega', 'Sofía Martínez', 'Daniela Torres'],
    barberia: ['Carlos Ruiz', 'Luis Herrera', 'Andrés Pineda'],
    unas: ['Paola Vega', 'Karla Soto', 'Ximena Lara'],
    spa: ['Elena Cruz', 'Roberto Díaz', 'Ana Beltrán'],
    dental: ['Laura Medina', 'Jorge Salas', 'Rosa Ibarra'],
    veterinaria: ['Rocky · Luis', 'Luna · Ana', 'Max · Pedro'],
  };
  readonly agendaRows = computed(() => {
    const kind = this.heroKind();
    const names = this.agendaNames[kind] ?? this.agendaNames['belleza'];
    const services = this.heroServices[kind] ?? this.heroServices['belleza'];
    const times = ['10:00 a.m.', '12:00 p.m.', '4:30 p.m.'];
    return services.slice(0, 3).map((sv, i) => ({ time: times[i], name: names[i], service: sv.name, price: sv.price }));
  });
  readonly agendaTotal = computed(() => this.agendaRows().reduce((sum, row) => sum + row.price, 0));

  /** Mini quiz del formulario: giro, personas y cómo llevan hoy las citas; al final, el contacto. */
  readonly quizStep = signal(0);
  readonly quizKinds = BUSINESS_KINDS;
  readonly quizPeople = [
    { label: 'Solo yo', value: 1 },
    { label: '2 o 3 personas', value: 3 },
    { label: '4 a 6 personas', value: 5 },
    { label: '7 o más', value: 7 },
  ];
  readonly quizHowOptions = [
    { id: 'libreta', label: 'En una libreta', icon: 'edit_note', gain: 'Adiós a la libreta: tus citas se guardan solas.' },
    { id: 'whatsapp', label: 'Por WhatsApp', icon: 'chat', gain: 'Tus clientes reservan sin escribirte.' },
    { id: 'app', label: 'En otra app o Excel', icon: 'grid_on', gain: 'Agenda, clientes y cobros en un solo lugar.' },
    { id: 'nada', label: 'Todavía no llevo control', icon: 'flag', gain: 'Empiezas con orden desde la primera cita.' },
  ];
  readonly quizHow = signal<string>('');
  readonly quizPeopleValue = signal<number | null>(null);
  readonly quizKind = signal('');
  readonly quizResult = computed(() => {
    const kind = this.quizKind();
    const base = this.kindPoints[kind] ?? ['Servicios y horarios a tu medida.', 'Recordatorios para que no falten.', 'Historial de cada cliente.'];
    const people = this.quizPeopleValue() ?? 1;
    const how = this.quizHowOptions.find((o) => o.id === this.quizHow());
    return [
      how?.gain ?? base[0],
      people > 1 ? 'Cada persona de tu equipo ve su propia agenda.' : 'Tu agenda y tus cobros, en un solo lugar.',
      base[1] ?? base[0],
    ];
  });

  pickKind(value: string): void {
    this.quizKind.set(value);
    this.form.controls.kind.setValue(value);
    if (this.kindColors[value]) {
      this.heroKind.set(value);
    }
    this.quizStep.set(1);
  }

  pickPeople(value: number): void {
    this.quizPeopleValue.set(value);
    this.form.controls.people.setValue(String(value));
    this.quizStep.set(2);
  }

  pickHow(id: string): void {
    this.quizHow.set(id);
    const label = this.quizHowOptions.find((o) => o.id === id)?.label.toLowerCase() ?? '';
    this.form.controls.message.setValue(`Hoy lleva sus citas: ${label}.`);
    this.quizStep.set(3);
  }

  quizBack(): void {
    this.quizStep.update((n) => Math.max(0, n - 1));
  }

  /** Comparador de formas de llevar las citas. */
  readonly compareRows = [
    { label: 'Reservan a cualquier hora', book: 'no', chat: 'no', nexia: 'yes' },
    { label: 'Sin choques de horario', book: 'no', chat: 'meh', nexia: 'yes' },
    { label: 'Recordatorios listos', book: 'no', chat: 'meh', nexia: 'yes' },
    { label: 'Anticipo y cobros', book: 'no', chat: 'no', nexia: 'yes' },
    { label: 'Historial de cada cliente', book: 'meh', chat: 'no', nexia: 'yes' },
    { label: 'Reportes de lo que dejas', book: 'no', chat: 'no', nexia: 'yes' },
  ];

  /** Un día con Nexia: mañana, tarde y noche. */
  readonly dayScenes = [
    { id: 'manana', time: '8:00 a.m.', icon: 'wb_twilight', title: 'Abres y ves tu día', tone: 'light', items: ['Hoy: 6 citas', 'Primera: 10:00 a.m.', '2 por cobrar'] },
    { id: 'tarde', time: '3:00 p.m.', icon: 'light_mode', title: 'Reservan solos', tone: 'accent', items: ['Nueva reserva · mañana 4:30', 'Anticipo recibido', 'Recordatorio enviado'] },
    { id: 'noche', time: '9:00 p.m.', icon: 'dark_mode', title: 'Duermes tranquilo', tone: 'dark', items: ['3 reservas mientras dormías', 'Cobros del día al corriente', 'Mañana: agenda lista'] },
  ];

  /** Gráfica de ingresos de ejemplo (se dibuja sola al llegar). */
  readonly chartLine = 'M0 78 L40 70 L80 74 L120 56 L160 60 L200 40 L240 44 L280 22 L320 12';
  readonly chartDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly faqAll = signal(false);
  readonly shownFaqs = computed(() => (this.faqAll() ? this.faqs : this.faqs.slice(0, 3)));
  readonly mockTouched = signal(false);

  @HostListener('window:scroll')
  @HostListener('window:resize')
  updateProgress(): void {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    this.scrollPct.set(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
    let current = this.sections[0].id;
    for (const section of this.sections) {
      const top = document.getElementById(section.id)?.getBoundingClientRect().top;
      if (top !== undefined && top <= window.innerHeight * 0.4) {
        current = section.id;
      }
    }
    this.activeSection.set(current);
    const el = this.timeline()?.nativeElement;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const value = (window.innerHeight * 0.65 - rect.top) / rect.height;
    this.progress.set(Math.min(Math.max(value, 0), 1));
  }

  stepOn(index: number): boolean {
    return this.progress() >= (index / (this.steps.length - 1)) * 0.95;
  }
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
    { icon: 'redeem', title: 'Gratis mientras dure la beta', text: 'No pagas nada en esta etapa.' },
    { icon: 'support_agent', title: 'Acompañamiento por WhatsApp', text: 'Te ayudamos a configurar.' },
    { icon: 'sell', title: 'Precio especial al terminar', text: 'Precio preferente para la beta.' },
    { icon: 'forum', title: 'Tu opinión define lo que sigue', text: 'Lo que pidas, lo mejoramos.' },
  ];

  readonly moreOpen = signal(false);

  readonly coming = ['Recordatorios automáticos por WhatsApp', 'Planes para cada tamaño de negocio', 'Más giros y plantillas listas'];

  readonly kinds = BUSINESS_KINDS;

  readonly features = [
    { scene: 'slots', icon: 'event_available', title: 'Reservas a cualquier hora', text: 'Tus {c} apartan solos, sin escribirte.', tone: 'light' },
    { scene: 'pay', icon: 'payments', title: 'Anticipo y cobro', text: 'Pide anticipo y registra el cobro.', tone: 'accent' },
    { scene: 'agenda', icon: 'calendar_month', title: 'Agenda clara', text: 'Citas por persona, sin choques.', tone: 'dark' },
    { scene: 'chat', icon: 'chat', title: 'WhatsApp listo', text: 'Recordatorios escritos; los envías con un toque.', tone: 'light' },
    { scene: 'team', icon: 'groups', title: 'Equipo y comisiones', text: 'Cada persona ve su agenda; tú ves lo que deja.', tone: 'accent' },
    { scene: 'clients', icon: 'hourglass_top', title: '{C} y lista de espera', text: 'Historial, cumpleaños y aviso si se libera un horario.', tone: 'dark' },
    { scene: 'chart', icon: 'insights', title: 'Reportes sencillos', text: 'Ingresos, citas y servicios que más dejan.', tone: 'light' },
    { scene: 'qr', icon: 'qr_code_2', title: 'Enlace y código QR', text: 'Tu enlace, tu QR y un cartel para imprimir.', tone: 'accent' },
  ];
  readonly qrCells = [1,1,1,0,1, 1,0,1,1,0, 1,1,0,1,1, 0,1,1,0,1, 1,0,1,1,1];

  readonly steps = [
    { art: 'form', icon: 'edit_square', title: 'Pide tu acceso', text: 'Llena el formulario; nos llega al instante.' },
    { art: 'mail', icon: 'mark_email_read', title: 'Recibe tu invitación', text: 'Te escribimos y te mandamos tu enlace.' },
    { art: 'setup', icon: 'tune', title: 'Configura tu negocio', text: 'Servicios, equipo y horarios, con un asistente.' },
    { art: 'share', icon: 'share', title: 'Comparte tu enlace', text: 'Ponlo en Instagram o WhatsApp y listo.' },
  ];


  readonly faqs = [
    { q: '¿Mis {c} tienen que descargar una app?', a: 'No. Reservan desde el navegador de su celular, con el enlace que les compartes.' },
    { q: '¿Qué es la beta?', a: 'Estamos abriendo Nexia a pocos negocios para pulirla con su uso real. Quien entra nos ayuda a mejorarla y recibe acompañamiento.' },
    { q: '¿Puedo pedir anticipo?', a: 'Sí. Tú decides si lo pides, de cuánto y qué pasa con él si el cliente cancela.' },
    { q: '¿Qué pasa con los datos de mis {c}?', a: 'Son tuyos. Los guardamos solo para darte el servicio y no los vendemos.' },
    { q: '¿Sirve para mi tipo de negocio?', a: 'Sirve para cualquier negocio que atienda con cita: salones, barberías, spas, consultorios, clínicas, veterinarias y estudios.' },
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
    this.updateProgress();
    // Quien llega desde "Pedir acceso" de otra página (/#beta) ve el formulario abierto.
    if (location.hash === '#beta') {
      setTimeout(() => this.openForm());
    }
  }

  /** El formulario vive en una hoja emergente: todos los "Pedir acceso" la abren. */
  openForm(event?: Event): void {
    event?.preventDefault();
    const dialog = this.formDialog()?.nativeElement;
    if (!dialog || dialog.open) {
      return;
    }
    this.menuOpen.set(false);
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    this.landing.track('form');
  }

  closeForm(): void {
    this.formDialog()?.nativeElement.close();
  }

  /** Al cerrar la hoja (botón, Escape o tocar fuera) vuelve el scroll de la página. */
  onFormClosed(): void {
    document.documentElement.style.overflow = '';
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === this.formDialog()?.nativeElement) {
      this.closeForm();
    }
  }

  onMenu(event: Event, target: string): void {
    this.menuOpen.set(false);
    if (target === '#beta') {
      this.openForm(event);
    }
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
