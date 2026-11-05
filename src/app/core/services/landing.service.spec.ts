import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { LandingService } from './landing.service';

describe('LandingService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api' }],
    });
    return { landing: TestBed.inject(LandingService), http: TestBed.inject(HttpTestingController) };
  }

  it('anota cada paso una vez por visita', () => {
    const { landing, http } = setup();
    landing.track('visit');
    landing.track('visit');
    expect(http.match('/api/landing/events').length).toBe(1);
  });

  it('distingue el dato de cada paso (pestaña, giro, pregunta) y lo limpia', () => {
    const { landing, http } = setup();
    landing.track('tab', 'comparar');
    landing.track('tab', 'comparar');
    landing.track('tab', 'Video <b>');
    const calls = http.match('/api/landing/events');
    expect(calls.map((c) => c.request.body.detail)).toEqual(['comparar', 'videob']);
    expect(calls[0].request.body.step).toBe('tab');
  });
});
