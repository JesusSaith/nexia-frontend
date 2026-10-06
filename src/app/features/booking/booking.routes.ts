import { Routes } from '@angular/router';

export const bookingRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/booking/booking').then((m) => m.Booking),
  },
];
