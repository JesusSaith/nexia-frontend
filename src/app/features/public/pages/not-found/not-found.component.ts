import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/** Cualquier dirección que no existe: dice qué pasó y a dónde ir, sin tecnicismos. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-ink">
      <section class="card text-center">
        <h1 class="text-xl font-semibold">No encontramos esta página</h1>
        @if (inPanel) {
          <p class="mt-2 text-sm text-ink-soft">Esa pantalla no existe en tu panel. Usa el menú de abajo o vuelve al inicio.</p>
          <a class="btn btn-primary mt-5 w-full justify-center" routerLink="/admin/home">Ir al inicio del panel</a>
        } @else {
          <p class="mt-2 text-sm text-ink-soft">
            Puede que el enlace esté incompleto o que el negocio lo haya cambiado. Pídele el enlace de nuevo al negocio.
          </p>
          <a class="btn btn-primary mt-5 w-full justify-center" routerLink="/">Ir al inicio</a>
        }
      </section>
    </main>
  `,
})
export class NotFoundComponent {
  /** Quien se equivocó de dirección dentro de /admin es la dueña o su equipo, no un cliente. */
  protected readonly inPanel = inject(Router).url.startsWith('/admin');
}
