import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ConnectionService } from '../services/connection.service';
import { OFFLINE_MESSAGE, offlineInterceptor } from './offline.interceptor';

describe('offlineInterceptor', () => {
  function setup(online: boolean) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([offlineInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(ConnectionService).online.set(online);
    return { http: TestBed.inject(HttpClient), controller: TestBed.inject(HttpTestingController) };
  }

  it('sin internet, guardar responde con un mensaje claro y no sale la petición', () => {
    const { http, controller } = setup(false);
    let detail = '';
    http.post('/api/services', {}).subscribe({ error: (error) => (detail = error.error.detail) });
    expect(detail).toBe(OFFLINE_MESSAGE);
    controller.expectNone('/api/services');
  });

  it('sin internet, las lecturas siguen su camino', () => {
    const { http, controller } = setup(false);
    http.get('/api/services').subscribe();
    controller.expectOne('/api/services').flush([]);
  });

  it('con internet todo sale normal', () => {
    const { http, controller } = setup(true);
    http.post('/api/services', {}).subscribe();
    controller.expectOne('/api/services').flush({});
  });
});
