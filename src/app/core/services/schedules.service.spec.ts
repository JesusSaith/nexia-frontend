import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../config/api-base-url';
import { Schedule, ScheduleItem } from '../models/schedule.model';
import { SchedulesService } from './schedules.service';

const item: ScheduleItem = {
  day_of_week: 0,
  start_time: '09:00',
  end_time: '18:00',
  is_active: true,
};

const saved: Schedule = { ...item, id: 3, staff_id: 2 };

describe('SchedulesService', () => {
  let service: SchedulesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api' },
      ],
    });
    service = TestBed.inject(SchedulesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and replaces a staff schedule', () => {
    service.getStaffSchedule(2).subscribe((items) => expect(items).toEqual([saved]));
    const load = http.expectOne('http://api.test/api/schedules/staff/2');
    expect(load.request.method).toBe('GET');
    load.flush([saved]);

    service.updateStaffSchedule(2, [item]).subscribe((items) => expect(items).toEqual([saved]));
    const update = http.expectOne('http://api.test/api/schedules/staff/2');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ schedules: [item] });
    update.flush([saved]);
  });
});
