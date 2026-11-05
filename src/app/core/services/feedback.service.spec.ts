import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { FeedbackService } from './feedback.service';

describe('FeedbackService', () => {
  it('manda el comentario y la pantalla desde donde se escribió', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api' }],
    });
    TestBed.inject(FeedbackService).send('Me gustaría ver mis ventas por semana', '/admin/reportes').subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ message: 'Me gustaría ver mis ventas por semana', page: '/admin/reportes' });
  });
});
