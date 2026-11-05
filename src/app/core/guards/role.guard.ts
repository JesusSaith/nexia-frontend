import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { CurrentUser, UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

export const CHANGE_PASSWORD_PATH = '/auth/cambiar-contrasena';

/** Con contraseña temporal solo se puede entrar a elegir la propia. */
export const passwordChosenGuard: CanActivateFn = () => {
  const user = inject(AuthService).currentUser();
  return user?.must_change_password ? inject(Router).parseUrl(CHANGE_PASSWORD_PATH) : true;
};

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

/** A dónde va cada rol al entrar. El cliente (fase 1) solo reserva en el motor de su negocio. */
export function sessionHome(user: CurrentUser): string | null {
  if (user.must_change_password) {
    return CHANGE_PASSWORD_PATH;
  }
  if (user.role === 'super_admin') {
    return '/super-admin';
  }
  if (user.role === 'client') {
    return user.slug ? `/${user.slug}/book` : null;
  }
  return '/admin';
}

/** Login y registro: quien ya tiene sesión va directo a su panel en vez de ver el formulario. */
export const guestGuard: CanActivateFn = () => {
  const user = inject(AuthService).currentUser();
  const home = user ? sessionHome(user) : null;
  return home ? inject(Router).parseUrl(home) : true;
};
