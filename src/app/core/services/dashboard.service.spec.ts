import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { DashboardStats } from '../models/dashboard.model';
import { DashboardService } from './dashboard.service';

const stats: DashboardStats = {
  total_today: 2,
  total_month: 8,
  revenue_today: 560,
  revenue_month: 2240,
  top_services: [{ service_name: 'Corte', total_appointments: 5, total_revenue: 1400 }],
  staff_occupancy: [{ staff_name: 'Ana Ruiz', total_appointments: 5 }],
};

describe('DashboardService', () => {
  let service: DashboardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads stats for today and for a selected date', () => {
    service.getStats().subscribe((item) => expect(item).toEqual(stats));
    http.expectOne('http://api.test/api/dashboard/stats').flush(stats);

    service.getStats('2026-10-06').subscribe();
    http.expectOne('http://api.test/api/dashboard/stats?date=2026-10-06').flush(stats);
  });
});
