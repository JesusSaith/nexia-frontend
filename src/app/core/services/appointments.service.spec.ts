import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment } from '../models/appointment.model';
import { AppointmentsService } from './appointments.service';

const appointment: Appointment = {
  id: 9,
  client_name: 'Ana',
  client_phone: '5512345678',
  client_email: 'ana@example.com',
  service_id: 2,
  service_name: 'Corte',
  staff_id: 4,
  staff_name: 'Ana Ruiz',
  starts_at: '2026-10-06T10:00:00',
  status: 'scheduled',
};

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(AppointmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads appointments for a range and optional filters', () => {
    service
      .getAppointments({ start_date: '2026-10-05', end_date: '2026-10-11' })
      .subscribe((items) => expect(items).toEqual([appointment]));
    const byRange = http.expectOne(
      'http://api.test/api/appointments?start_date=2026-10-05&end_date=2026-10-11',
    );
    expect(byRange.request.method).toBe('GET');
    byRange.flush([appointment]);

    service.getAppointments({ start_date: '2026-10-06', staff_id: 4, service_id: 2 }).subscribe();
    http
      .expectOne('http://api.test/api/appointments?start_date=2026-10-06&staff_id=4&service_id=2')
      .flush([appointment]);
  });

  it('creates an appointment from the admin calendar', () => {
    const payload = {
      service_id: 2,
      staff_id: 4,
      starts_at: '2026-10-06T10:00:00',
      client_name: 'Ana',
      client_phone: '5512345678',
      client_email: 'ana@example.com',
      notes: null,
    };
    service.createAdminAppointment(payload).subscribe((item) => expect(item).toEqual(appointment));
    const request = http.expectOne('http://api.test/api/appointments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush(appointment);
  });

  it('updates an appointment status', () => {
    service.updateStatus(9, 'completed').subscribe((item) => {
      expect(item.status).toBe('completed');
    });
    const request = http.expectOne('http://api.test/api/appointments/9/status');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ status: 'completed' });
    request.flush({ ...appointment, status: 'completed' });
  });
});
