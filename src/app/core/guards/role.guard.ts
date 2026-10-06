import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';

import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

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
