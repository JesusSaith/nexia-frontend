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
        title: 'Configuración · Nexia',
        canActivate: [managers],
        // Pregunta antes de salir si quedaron cambios sin guardar.
        canDeactivate: [(page: { canLeave(): boolean | Promise<boolean> }) => page.canLeave()],
        loadComponent: () =>
          import('./pages/settings/settings-page.component').then((m) => m.SettingsPageComponent),
      },
      {
        // Asistente de 3 pasos después del registro (también se abre desde Inicio).
        path: 'bienvenida',
        title: 'Bienvenida · Nexia',
        canActivate: [managers],
        loadComponent: () => import('./pages/welcome/welcome-page').then((m) => m.WelcomePageComponent),
      },
      {
        path: 'negocio',
        title: 'Mi negocio · Nexia',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/business/business-page.component').then((m) => m.BusinessPageComponent),
      },
      {
        path: 'agenda',
        title: 'Agenda · Nexia',
        loadComponent: () =>
          import('./pages/agenda/agenda-page.component').then((m) => m.AgendaPageComponent),
      },
      {
        path: 'home',
        title: 'Inicio · Nexia',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/home/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'dashboard',
        title: 'Reportes · Nexia',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
      },
      {
        path: 'services',
        title: 'Servicios · Nexia',
        canActivate: [managers],
        loadComponent: () => import('./pages/services/services').then((m) => m.ServicesPageComponent),
      },
      {
        path: 'staff',
        title: 'Equipo · Nexia',
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/staff/staff-page.component').then((m) => m.StaffPageComponent),
      },
      {
        path: 'schedules',
        title: 'Horarios · Nexia',
        canDeactivate: [(page: { canLeave(): boolean | Promise<boolean> }) => page.canLeave()],
        canActivate: [managers],
        loadComponent: () =>
          import('./pages/schedules/schedules-page.component').then((m) => m.SchedulesPageComponent),
      },
      {
        path: 'profile',
        title: 'Mi perfil · Nexia',
        canActivate: [roleGuard(['staff'])],
        loadComponent: () =>
          import('./pages/profile/profile-page.component').then((m) => m.ProfilePageComponent),
      },
      { path: 'servicios', redirectTo: 'services', pathMatch: 'full' },
      { path: 'equipo', redirectTo: 'staff', pathMatch: 'full' },
      // Ventas e inventario: fuera de la fase 1 beta, se reactiva más adelante junto con su entrada en admin-layout.ts.
      // {
      //   path: 'caja',
      //   title: 'Caja · Nexia',
      //   canActivate: [managers],
      //   loadComponent: () =>
      //     import('./pages/caja/caja-page.component').then((m) => m.CajaPageComponent),
      // },
      {
        path: 'clientes',
        title: 'Clientes · Nexia',
        loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers),
      },
    ],
  },
];
