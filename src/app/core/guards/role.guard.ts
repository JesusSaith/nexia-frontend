import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

/** Fase 1: /cliente no muestra el directorio. Lleva al motor de reservas del negocio. */
export const clientEntryGuard: CanActivateFn = () => {
  const slug = inject(AuthService).currentUser()?.slug;
  const router = inject(Router);
  return slug ? router.createUrlTree(['/', slug, 'book']) : router.createUrlTree(['/auth/login']);
};

/** Allows the route only when the signed-in role is in `allowedRoles`. */
export function roleGuard(allowedRoles: readonly string[]): CanActivateFn {
  return () => {
    const role = inject(AuthService).currentUser()?.role;
    if (role && allowedRoles.includes(role)) {
      return true;
    }
    return homeFor(role);
  };
}

function homeFor(role: UserRole | undefined): UrlTree {
  const router = inject(Router);
  if (role === 'client') {
    // FUTURE_PHASE_2_UNIFIED_PLATFORM: antes iba a /cliente (directorio y perfil). Fase 1 lo manda al motor de su negocio.
    const slug = inject(AuthService).currentUser()?.slug;
    return slug ? router.createUrlTree(['/', slug, 'book']) : router.createUrlTree(['/auth/login']);
  }
  if (role === 'staff') {
    return router.createUrlTree(['/admin/agenda']);
  }
  if (role === 'super_admin') {
    return router.createUrlTree(['/super-admin']);
  }
  if (role === 'owner' || role === 'admin') {
    return router.createUrlTree(['/admin/agenda']);
  }
  return router.createUrlTree(['/auth/login']);
}
