import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { CurrentUser } from '../models/user.model';
import { AuthService } from './auth.service';

const user: CurrentUser = {
  id: 'user-1',
  email: 'ana@nexia.test',
  fullName: 'Ana Ruiz',
  role: 'admin',
  tenantId: 'tenant-1',
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });

    localStorage.clear();
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('keeps the signed-in user and role in memory after login', () => {
    service.login({ email: user.email, password: 'secret' }).subscribe();

    http.expectOne('http://api.test/auth/login').flush(user);

    expect(service.currentUser()).toEqual(user);
    expect(service.role()).toBe('admin');
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('clears the profile when the session cookie is missing', () => {
    service.restoreSession().subscribe();

    http.expectOne('http://api.test/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(service.currentUser()).toBeNull();
    expect(service.role()).toBeNull();
  });
});
