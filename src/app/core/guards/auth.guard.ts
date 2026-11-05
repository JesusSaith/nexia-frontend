import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth.service';

/** Allows navigation only after `AuthService.restoreSession()` has found a user. */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Quien abrió la app en una página pública aún no preguntó por su sesión: se pregunta ahora, antes de mandarla a entrar.
  if (!authService.hasProbedSession) {
    return authService.restoreSession().pipe(map((user) => user !== null || router.createUrlTree(['/auth/login'])));
  }

  return router.createUrlTree(['/auth/login']);
};
