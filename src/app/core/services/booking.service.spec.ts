import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { Appointment, AvailabilitySlot } from '../models/appointment.model';
import { BusinessBrand, PublicService, PublicStaff } from '../models/business.model';
import { BookingService } from './booking.service';

const brand: BusinessBrand = {
  name: 'Nexia',
  logo_url: null,
  primary_color: '#1769FF',
  phone: '5512345678',
};

const serviceItem: PublicService = {
  id: 2,
  name: 'Corte',
  description: null,
  price: 280,
  duration_minutes: 45,
};

const staffItem: PublicStaff = {
  id: 4,
  full_name: 'Ana Ruiz',
  role_title: 'Estilista',
};

const slot: AvailabilitySlot = { starts_at: '2026-10-06T10:00:00' };

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

describe('BookingService', () => {
  let service: BookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(BookingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the public business, services, and staff', () => {
    service.getPublicBusiness('negocio').subscribe((item) => expect(item).toEqual(brand));
    http.expectOne('http://api.test/api/businesses/negocio').flush(brand);

    service.getPublicServices('negocio').subscribe((items) => expect(items).toEqual([serviceItem]));
    http.expectOne('http://api.test/api/businesses/negocio/services').flush([serviceItem]);

    service.getPublicStaff('negocio').subscribe((items) => expect(items).toEqual([staffItem]));
    http.expectOne('http://api.test/api/businesses/negocio/staff').flush([staffItem]);
  });

  it('requests availability and creates an appointment', () => {
    service.getAvailability('negocio', 2, 4, '2026-10-06').subscribe((items) => {
      expect(items).toEqual([slot]);
    });
    const availability = http.expectOne(
      'http://api.test/api/businesses/negocio/availability?service_id=2&staff_id=4&date=2026-10-06',
    );
    expect(availability.request.method).toBe('GET');
    availability.flush([slot]);

    const payload = {
      service_id: 2,
      staff_id: 4,
      starts_at: '2026-10-06T10:00:00',
      client_name: 'Ana',
      client_phone: '5512345678',
      client_email: 'ana@example.com',
    };
    service.createAppointment('negocio', payload).subscribe((item) => expect(item).toEqual(appointment));
    const create = http.expectOne('http://api.test/api/businesses/negocio/appointments');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(payload);
    create.flush(appointment);
  });
});
