import { Routes } from '@angular/router';

import { guestGuard } from '@core/guards/role.guard';

export const authRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  // Sin guestGuard: el enlace del correo debe funcionar aunque haya otra sesión abierta en el navegador.
  {
    path: 'restablecer',
    loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
  },
];
