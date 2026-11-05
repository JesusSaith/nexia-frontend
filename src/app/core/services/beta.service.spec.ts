import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { BetaService } from './beta.service';

describe('BetaService', () => {
  it('manda la solicitud a /beta', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api' }],
    });
    const body = { name: 'Rosa', email: 'rosa@example.com', phone: '5512345678', business_name: 'Estudio Rosa', kind: 'belleza', message: null, people: 2, source: 'instagram', website: '' };
    TestBed.inject(BetaService).request(body).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/beta');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
  });
});
