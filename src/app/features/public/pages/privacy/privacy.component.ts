import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { BookingService, PrivacyNotice } from '@core/services/booking.service';

/**
 * Aviso de privacidad de cada negocio. Si el negocio no escribió el suyo, se muestra uno genérico
 * con lo que la página de reservas realmente recaba. Es una base razonable para la LFPDPPP, no
 * asesoría legal: cada negocio debe revisarlo y reemplazarlo en Ajustes.
 */
@Component({
  selector: 'app-privacy',
  imports: [MatProgressSpinnerModule, RouterLink],
  template: `
    <main class="mx-auto w-full max-w-2xl px-4 py-10 text-ink">
      @if (error()) {
        <p role="alert" class="text-sm text-red-700">No pudimos cargar el aviso de privacidad.</p>
      } @else if (!notice()) {
        <div class="flex justify-center py-16"><mat-spinner diameter="32" /></div>
      } @else {
        <a class="text-sm underline underline-offset-2" [routerLink]="['/', slug, 'book']">← Volver a reservar</a>
        <h1 class="mt-4 text-2xl font-semibold">Aviso de privacidad</h1>
        <p class="mt-1 text-sm text-muted">{{ notice()!.name }}</p>

        @if (notice()!.privacy_notice; as own) {
          <article class="mt-6 whitespace-pre-line text-sm leading-relaxed">{{ own }}</article>
        } @else {
          <article class="privacy mt-6 text-sm leading-relaxed">
            <h2>Quién es responsable de tus datos</h2>
            <p>
              {{ notice()!.name }}{{ notice()!.address ? ', con domicilio en ' + notice()!.address : '' }}, es responsable del
              uso y protección de tus datos personales, de acuerdo con la Ley Federal de Protección de Datos Personales en
              Posesión de los Particulares.
            </p>

            <h2>Qué datos recabamos</h2>
            <p>Cuando reservas en esta página nos das: nombre, teléfono, correo (opcional), notas sobre lo que necesitas,
              fotos de referencia (opcional, para cotizar) y, si el servicio pide anticipo, la foto de tu comprobante de pago.
              No pedimos datos sensibles.</p>

            <h2>Para qué los usamos</h2>
            <ul>
              <li>Agendar, confirmar, cambiar o cancelar tu cita.</li>
              <li>Enviarte recordatorios y avisos sobre tu cita por WhatsApp, llamada o correo.</li>
              <li>Cotizar el servicio cuando el precio depende de lo que pides.</li>
              <li>Llevar tu historial de visitas y paquetes con nosotros.</li>
            </ul>
            <p>No usamos tus datos para publicidad de terceros ni los vendemos.</p>

            <h2>Con quién los compartimos</h2>
            <p>Solo con el proveedor tecnológico que opera este sistema de reservas, que los guarda por cuenta nuestra y no
              puede usarlos para otro fin. No los transferimos a nadie más, salvo que una autoridad lo requiera por ley.</p>

            <h2>Cuánto tiempo los guardamos</h2>
            <p>Las fotos de referencia se borran automáticamente 30 días después de tu cita. El resto de tus datos se conserva
              mientras seas cliente y hasta que pidas su eliminación.</p>

            <h2>Datos guardados en tu dispositivo</h2>
            <p>Para que no escribas todo cada vez, tu navegador recuerda tu nombre, teléfono y correo después de reservar.
              Se quedan solo en tu dispositivo; puedes borrarlos con el botón «No soy yo» en el formulario de reserva.</p>

            <h2>Tus derechos (ARCO)</h2>
            <p>Puedes pedir en cualquier momento acceder, rectificar, cancelar u oponerte al uso de tus datos, o revocar tu
              consentimiento, escribiéndonos
              @if (notice()!.email) { a <a [href]="'mailto:' + notice()!.email">{{ notice()!.email }}</a> }
              @if (notice()!.email && notice()!.phone) { o }
              @if (notice()!.phone) { al {{ notice()!.phone }} }.
              Te respondemos en un máximo de 20 días hábiles.</p>

            <h2>Cambios a este aviso</h2>
            <p>Si cambia, lo publicaremos en esta misma página.</p>
          </article>
        }
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: #f8f6f3; }
    .privacy h2 { margin-top: 1.5rem; margin-bottom: 0.4rem; font-size: 1rem; font-weight: 600; }
    .privacy ul { list-style: disc; padding-left: 1.25rem; }
    .privacy a { text-decoration: underline; }
  `,
})
export class PrivacyComponent {
  private readonly bookingApi = inject(BookingService);
  protected readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('businessSlug') ?? '';
  protected readonly notice = signal<PrivacyNotice | null>(null);
  protected readonly error = signal(false);

  constructor() {
    this.bookingApi
      .getPrivacy(this.slug)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({
        next: (row) => {
          this.notice.set(row);
          document.title = `Aviso de privacidad · ${row.name}`;
        },
        error: () => this.error.set(true),
      });
  }
}
