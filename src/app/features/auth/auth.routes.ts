import { Routes } from '@angular/router';

import { authGuard } from '@core/guards/auth.guard';
import { guestGuard } from '@core/guards/role.guard';

export const authRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Entrar · Nexia',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Crear cuenta · Nexia',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  // Sin guestGuard: quien entra con contraseña temporal ya tiene sesión y debe elegir la suya.
  {
    path: 'cambiar-contrasena',
    title: 'Elige tu contraseña · Nexia',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/change-password/change-password').then((m) => m.ChangePassword),
  },
  // Sin guestGuard: el enlace del correo debe funcionar aunque haya otra sesión abierta en el navegador.
  {
    path: 'restablecer',
    title: 'Nueva contraseña · Nexia',
    loadComponent: () => import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
  },
];
