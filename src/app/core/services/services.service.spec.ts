import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { Service } from '../models/service.model';
import { ServicesService } from './services.service';

const serviceItem: Service = {
  id: 4,
  name: 'Corte',
  description: null,
  price: 250,
  duration_minutes: 45,
  is_active: true,
};

describe('ServicesService', () => {
  let service: ServicesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(ServicesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the service catalog', () => {
    service.getServices().subscribe((items) => expect(items).toEqual([serviceItem]));

    const request = http.expectOne('http://api.test/api/services/');
    expect(request.request.method).toBe('GET');
    request.flush([serviceItem]);
  });

  it('creates, updates, and deactivates a service', () => {
    const payload = {
      name: 'Corte',
      description: null,
      price: 250,
      duration_minutes: 45,
    };

    service.createService(payload).subscribe();
    http.expectOne('http://api.test/api/services/').flush(serviceItem);

    service.updateService(4, { is_active: true }).subscribe();
    const update = http.expectOne('http://api.test/api/services/4');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ is_active: true });
    update.flush(serviceItem);

    service.deleteService(4).subscribe();
    const remove = http.expectOne('http://api.test/api/services/4');
    expect(remove.request.method).toBe('DELETE');
    remove.flush('');
  });
});
