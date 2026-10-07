import { Routes } from '@angular/router';

import { roleGuard } from '@core/guards/role.guard';

const managers = roleGuard(['owner', 'admin']);

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/admin-layout').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'settings',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/settings/settings-page.component').then((m) => m.SettingsPageComponent),
      },
      {
        path: 'negocio',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/business/business-page.component').then((m) => m.BusinessPageComponent),
      },
      {
        path: 'agenda',
        loadComponent: () =>
          import('./pages/agenda/agenda-page.component').then((m) => m.AgendaPageComponent),
      },
      {
        path: 'home',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/home/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'dashboard',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
      },
      {
        path: 'services',
        canActivate: [managers],
        loadComponent: () => import('./pages/services/services').then((m) => m.ServicesPageComponent),
      },
      {
        path: 'staff',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/staff/staff-page.component').then((m) => m.StaffPageComponent),
      },
      {
        path: 'schedules',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/schedules/schedules-page.component').then((m) => m.SchedulesPageComponent),
      },
      {
        path: 'profile',
        canActivate: [roleGuard(['staff'])],
        loadComponent: () =>
          import('./pages/profile/profile-page.component').then((m) => m.ProfilePageComponent),
      },
      { path: 'servicios', redirectTo: 'services', pathMatch: 'full' },
      { path: 'equipo', redirectTo: 'staff', pathMatch: 'full' },
      {
        path: 'clientes',
        loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers),
      },
    ],
  },
];
