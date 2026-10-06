import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/admin-layout').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'servicios',
        loadComponent: () => import('./pages/services/services').then((m) => m.Services),
      },
      {
        path: 'equipo',
        loadComponent: () => import('./pages/team/team').then((m) => m.Team),
      },
      {
        path: 'clientes',
        loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers),
      },
    ],
  },
];
