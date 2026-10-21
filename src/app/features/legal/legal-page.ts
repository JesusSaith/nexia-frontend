import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { LEGAL } from './legal-info';

/**
 * Términos y Aviso de privacidad de Nexia como plataforma, para las dueñas que crean su cuenta.
 * Son una base razonable para la LFPDPPP, no asesoría legal. El aviso que ven los clientes de cada
 * negocio es otro: /:slug/privacidad.
 */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink],
  template: `
    <main class="mx-auto w-full max-w-2xl px-4 py-10 text-ink">
      <a class="text-sm text-muted underline underline-offset-2" routerLink="/auth/register">← Volver al registro</a>

      @if (doc === 'terms') {
        <h1 class="mt-4 text-2xl font-semibold">Términos y condiciones</h1>
        <p class="mt-1 text-sm text-muted">Última actualización: {{ legal.updated }}</p>

        <article class="legal mt-6 text-sm leading-relaxed">
          <p>
            Estos términos regulan el uso de {{ legal.product }}, el sistema de reservas en línea que opera {{ legal.operator }}
            ("nosotros"). Al crear tu cuenta aceptas estos términos. Si no estás de acuerdo, no uses el servicio.
          </p>

          <h2>1. Qué es {{ legal.product }}</h2>
          <p>
            Una herramienta para que tu negocio reciba citas en línea y administre su agenda, clientes, cobros y reportes.
            Tú decides tus servicios, precios, horarios y políticas; nosotros damos la plataforma.
          </p>

          <h2>2. Tu cuenta</h2>
          <ul>
            <li>Debes ser mayor de edad y tener facultades para representar al negocio que registras.</li>
            <li>Los datos que das deben ser reales y estar al día.</li>
            <li>Cuidas tu contraseña y respondes por lo que se haga con tu cuenta y con las cuentas de tu equipo.</li>
            <li>Si sospechas que alguien entró a tu cuenta, cambia tu contraseña y avísanos.</li>
          </ul>

          <h2>3. Uso permitido</h2>
          <p>No puedes usar {{ legal.product }} para:</p>
          <ul>
            <li>ofrecer servicios ilegales o publicar contenido ilegal, engañoso u ofensivo;</li>
            <li>hacerte pasar por otro negocio o persona;</li>
            <li>enviar mensajes masivos no solicitados;</li>
            <li>intentar entrar a cuentas o datos de otros negocios, o afectar el funcionamiento del sistema.</li>
          </ul>
          <p>Podemos suspender una cuenta que incumpla estas reglas, avisándote cuando sea posible.</p>

          <h2>4. Los datos de tus clientes</h2>
          <p>
            Tú eres responsable de los datos personales de tus clientes frente a ellos y frente a la ley. Nosotros los
            guardamos y procesamos solo por cuenta tuya, para darte el servicio, y no los usamos para otro fin ni los vendemos.
            Tu página de reservas incluye un aviso de privacidad genérico que puedes reemplazar por el tuyo en Configuración.
          </p>

          <h2>5. Pagos y anticipos</h2>
          <p>
            {{ legal.product }} no recibe ni procesa los pagos de tus clientes. Los anticipos y cobros se hacen directamente
            entre ellos y tu negocio. Los reembolsos, aclaraciones y disputas son entre tu negocio y tu cliente.
          </p>

          <h2>6. Mensajes de WhatsApp</h2>
          <p>
            Los botones de WhatsApp abren mensajes que tú envías desde tu propio teléfono. Debes respetar las políticas de
            WhatsApp y escribir solo a clientes que te dieron su número.
          </p>

          <h2>7. Precio del servicio</h2>
          <p>
            Si {{ legal.product }} tiene un costo, te lo informaremos antes de cobrarte. Cualquier cambio de precio te lo
            avisaremos con al menos 30 días de anticipación, y podrás cancelar tu cuenta si no estás de acuerdo.
          </p>

          <h2>8. Disponibilidad</h2>
          <p>
            Hacemos lo posible por que el servicio funcione todo el tiempo y por respaldar la información, pero puede haber
            interrupciones por mantenimiento o fallas. Te recomendamos exportar tus reportes con regularidad.
          </p>

          <h2>9. Cancelar tu cuenta</h2>
          <p>
            Puedes dejar de usar {{ legal.product }} cuando quieras y pedirnos que borremos tu cuenta y la información de tu
            negocio escribiendo a {{ legal.email }}. Antes de pedirlo, exporta lo que quieras conservar.
          </p>

          <h2>10. Responsabilidad</h2>
          <p>
            {{ legal.product }} se ofrece tal como está. No respondemos por ganancias perdidas, citas no atendidas ni por
            acuerdos entre tu negocio y tus clientes. En la medida que la ley lo permita, nuestra responsabilidad total se
            limita a lo que nos hayas pagado en los últimos 12 meses.
          </p>

          <h2>11. Cambios a estos términos</h2>
          <p>
            Si los cambiamos, publicaremos la nueva versión en esta página y te avisaremos dentro del panel. Si sigues usando
            el servicio después del aviso, se entiende que aceptas los cambios.
          </p>

          <h2>12. Ley aplicable</h2>
          <p>
            Estos términos se rigen por las leyes de México. Cualquier controversia se resolverá ante los tribunales de
            {{ legal.jurisdiction }}, salvo lo que disponga la Ley Federal de Protección al Consumidor.
          </p>

          <h2>Contacto</h2>
          <p>{{ legal.operator }} · {{ legal.address }} · {{ legal.email }}</p>
        </article>
      } @else {
        <h1 class="mt-4 text-2xl font-semibold">Aviso de privacidad</h1>
        <p class="mt-1 text-sm text-muted">Para negocios que usan {{ legal.product }} · Última actualización: {{ legal.updated }}</p>

        <article class="legal mt-6 text-sm leading-relaxed">
          <h2>Quién es responsable de tus datos</h2>
          <p>
            {{ legal.operator }}, con domicilio en {{ legal.address }}, es responsable de los datos personales que nos das
            al crear y usar tu cuenta de {{ legal.product }}, de acuerdo con la Ley Federal de Protección de Datos Personales
            en Posesión de los Particulares.
          </p>

          <h2>Qué datos recabamos</h2>
          <ul>
            <li>Tuyos: nombre, correo y contraseña (la guardamos cifrada; nadie puede leerla).</li>
            <li>De tu negocio: nombre, tipo de negocio, teléfono, dirección, redes sociales, logo y la información que captures en el panel.</li>
            <li>Técnicos: la dirección IP desde la que te conectas, solo para proteger el servicio contra abusos.</li>
          </ul>
          <p>No pedimos datos sensibles.</p>

          <h2>Para qué los usamos</h2>
          <ul>
            <li>Crear tu cuenta, mantener tu sesión y darte acceso al panel.</li>
            <li>Mostrar tu página de reservas con los datos de tu negocio.</li>
            <li>Darte soporte y avisarte de cambios importantes en el servicio.</li>
            <li>Prevenir registros falsos, accesos indebidos y otros abusos.</li>
          </ul>
          <p>No usamos tus datos para publicidad de terceros ni los vendemos.</p>

          <h2>Los datos de tus clientes</h2>
          <p>
            Lo que tus clientes dejan al reservar (nombre, teléfono, notas, fotos, comprobantes) es responsabilidad de tu
            negocio. Nosotros lo tratamos solo por cuenta tuya, como encargados, y únicamente para que funcione el servicio.
          </p>

          <h2>Con quién los compartimos</h2>
          <p>
            Con los proveedores que alojan el sistema y la base de datos, y, si está activo, con el servicio que nos avisa de
            errores técnicos. Todos los tratan por cuenta nuestra y no pueden usarlos para otro fin. No los transferimos a
            nadie más, salvo que una autoridad lo requiera por ley.
          </p>

          <h2>Cookies y almacenamiento en tu navegador</h2>
          <p>
            Usamos una sola cookie, necesaria para mantener tu sesión abierta. Tu navegador también guarda preferencias como
            el modo oscuro. No usamos cookies de publicidad ni de rastreo.
          </p>

          <h2>Cuánto tiempo los guardamos</h2>
          <p>Mientras tu cuenta esté activa, y después solo el tiempo que la ley nos obligue a conservarlos.</p>

          <h2>Tus derechos (ARCO)</h2>
          <p>
            Puedes pedir en cualquier momento acceder, rectificar, cancelar u oponerte al uso de tus datos, o revocar tu
            consentimiento, escribiendo a {{ legal.email }}. Te respondemos en un máximo de 20 días hábiles.
          </p>

          <h2>Cambios a este aviso</h2>
          <p>Si cambia, publicaremos la nueva versión en esta página y te avisaremos dentro del panel.</p>
        </article>
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--color-canvas); }
    .legal h2 { margin-top: 1.5rem; margin-bottom: 0.4rem; font-size: 1rem; font-weight: 600; }
    .legal p + p, .legal ul + p { margin-top: 0.5rem; }
    .legal ul { list-style: disc; padding-left: 1.25rem; }
  `,
})
export class LegalPage {
  protected readonly legal = LEGAL;
  protected readonly doc = inject(ActivatedRoute).snapshot.data['doc'] as 'terms' | 'privacy';

  constructor() {
    document.title = `${this.doc === 'terms' ? 'Términos y condiciones' : 'Aviso de privacidad'} · ${LEGAL.product}`;
  }
}
