import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { Staff } from '../models/staff.model';
import { StaffService } from './staff.service';

const member: Staff = {
  id: 2,
  full_name: 'Luis Pérez',
  role_title: 'Barbero',
  email: 'luis@nexia.test',
  phone: '5512345678',
  is_active: true,
};

describe('StaffService', () => {
  let service: StaffService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(StaffService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the team', () => {
    service.getStaff().subscribe((items) => expect(items).toEqual([member]));

    http.expectOne('http://api.test/api/staff/').flush([member]);
  });

  it('assigns services, creates an account, and updates the signed-in profile', () => {
    service.updateStaffServices(2, [4, 5]).subscribe();
    const services = http.expectOne('http://api.test/api/staff/2/services');
    expect(services.request.method).toBe('PUT');
    expect(services.request.body).toEqual({ service_ids: [4, 5] });
    services.flush(member);

    service.createAccount(2, { email: 'luis@example.com', password: 'secreta1' }).subscribe();
    const account = http.expectOne('http://api.test/api/staff/2/account');
    expect(account.request.method).toBe('POST');
    expect(account.request.body).toEqual({ email: 'luis@example.com', password: 'secreta1' });
    account.flush({ ...member, user_id: 8 });

    service.getStaffProfile().subscribe();
    http.expectOne('http://api.test/api/staff/me/profile').flush(member);

    service.updateStaffProfile({ bio: 'Cortes', avatar_url: null }).subscribe();
    const profile = http.expectOne('http://api.test/api/staff/me/profile');
    expect(profile.request.method).toBe('PUT');
    expect(profile.request.body).toEqual({ bio: 'Cortes', avatar_url: null });
    profile.flush(member);
  });

  it('creates a collaborator and deactivates them', () => {
    service
      .createStaff({
        full_name: 'Luis Pérez',
        role_title: 'Barbero',
        email: 'luis@nexia.test',
        phone: '5512345678',
      })
      .subscribe();
    http.expectOne('http://api.test/api/staff/').flush(member);

    service.deleteStaff(2).subscribe();
    const remove = http.expectOne('http://api.test/api/staff/2');
    expect(remove.request.method).toBe('DELETE');
    remove.flush('');
  });
});
