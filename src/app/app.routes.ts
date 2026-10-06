import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'super-admin',
    canActivate: [authGuard, roleGuard(['super_admin'])],
    loadComponent: () =>
      import('./features/super-admin/super-admin-page.component').then((m) => m.SuperAdminPageComponent),
  },
  {
    path: ':businessSlug/book',
    loadChildren: () => import('./features/booking/booking.routes').then((m) => m.bookingRoutes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
];
