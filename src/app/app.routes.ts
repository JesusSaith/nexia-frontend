import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { clientEntryGuard, roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['owner', 'admin', 'staff'])],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'super-admin',
    canActivate: [authGuard, roleGuard(['super_admin'])],
    loadComponent: () =>
      import('./features/super-admin/super-admin-page.component').then((m) => m.SuperAdminPageComponent),
  },
  // FUTURE_PHASE_2_UNIFIED_PLATFORM: /cliente es un directorio del equipo y un perfil de usuario.
  // En la fase 1 el cliente del piloto solo reserva en /:businessSlug/book, sin cruzar negocios.
  // {
  //   path: 'cliente',
  //   canActivate: [authGuard, roleGuard(['client'])],
  //   loadComponent: () => import('./features/client/client-page.component').then((m) => m.ClientPageComponent),
  // },
  {
    path: 'cliente',
    canActivate: [clientEntryGuard],
    children: [],
  },
  {
    path: ':businessSlug/manage/:token',
    loadComponent: () =>
      import('./features/public/pages/manage-appointment/manage-appointment.component').then(
        (m) => m.ManageAppointmentComponent,
      ),
  },
  {
    path: ':businessSlug/book',
    loadChildren: () => import('./features/booking/booking.routes').then((m) => m.bookingRoutes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
];
