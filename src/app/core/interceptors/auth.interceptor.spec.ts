import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  it('attaches credentials so the browser can store and send the session cookie', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    TestBed.inject(HttpClient).get('/auth/me').subscribe();

    const request = TestBed.inject(HttpTestingController).expectOne('/auth/me');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
  });
});
