import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ScheduleItem } from '@core/models/schedule.model';
import { Staff } from '@core/models/staff.model';
import { SchedulesService } from '@core/services/schedules.service';
import { StaffService } from '@core/services/staff.service';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

@Component({
  selector: 'app-schedules-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './schedules-page.component.html',
})
export class SchedulesPageComponent {
  private readonly schedulesApi = inject(SchedulesService);
  private readonly staffApi = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  protected readonly dayLabels = DAY_LABELS;
  protected readonly staff = signal<Staff[]>([]);
  protected readonly staffId = signal<number | null>(null);
  protected readonly days = signal<ScheduleItem[]>(defaultWeek());
  protected readonly isLoadingStaff = signal(true);
  protected readonly isLoadingSchedule = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);

  constructor() {
    this.loadStaff();
  }

  protected onStaff(value: number | ''): void {
    const staffId = value === '' ? null : value;
    this.staffId.set(staffId);
    this.savedMessage.set(null);
    this.formError.set(null);
    if (staffId === null) {
      this.days.set(defaultWeek());
      return;
    }
    this.loadSchedule(staffId);
  }

  protected setActive(dayOfWeek: number, isActive: boolean): void {
    this.patchDay(dayOfWeek, { is_active: isActive });
  }

  protected setTime(dayOfWeek: number, field: 'start_time' | 'end_time', value: string): void {
    if (!value) {
      return;
    }
    this.patchDay(dayOfWeek, { [field]: value.slice(0, 5) });
  }

  protected applyMondayToWorkdays(): void {
    const monday = this.days().find((day) => day.day_of_week === 0);
    if (!monday) {
      return;
    }
    this.days.update((items) =>
      items.map((day) =>
        day.day_of_week >= 1 && day.day_of_week <= 4
          ? { ...day, start_time: monday.start_time, end_time: monday.end_time }
          : day,
      ),
    );
    this.savedMessage.set(null);
  }

  protected save(): void {
    const staffId = this.staffId();
    if (staffId === null || this.isLoading()) {
      return;
    }

    const invalid = this.days().find((day) => day.end_time <= day.start_time);
    if (invalid) {
      this.formError.set(
        `En ${DAY_LABELS[invalid.day_of_week]} la hora de fin debe ser posterior a la de inicio.`,
      );
      this.savedMessage.set(null);
      return;
    }

    this.isLoading.set(true);
    this.formError.set(null);
    this.savedMessage.set(null);

    this.schedulesApi
      .updateStaffSchedule(staffId, this.days())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.days.set(mergeWeek(rows));
          this.isLoading.set(false);
          this.savedMessage.set('Horario guardado.');
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.formError.set(readError(error, 'No pudimos guardar el horario.'));
        },
      });
  }

  private loadStaff(): void {
    this.staffApi
      .getStaff()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (staff) => {
          this.staff.set(staff);
          this.isLoadingStaff.set(false);
          const first = staff.find((member) => member.is_active) ?? staff[0];
          if (first) {
            this.onStaff(first.id);
          }
        },
        error: (error: unknown) => {
          this.staff.set([]);
          this.isLoadingStaff.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el equipo.'));
        },
      });
  }

  private loadSchedule(staffId: number): void {
    const current = ++this.requestId;
    this.isLoadingSchedule.set(true);
    this.loadError.set(null);

    this.schedulesApi
      .getStaffSchedule(staffId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (current !== this.requestId) {
            return;
          }
          this.days.set(rows.length === 0 ? defaultWeek() : mergeWeek(rows));
          this.isLoadingSchedule.set(false);
        },
        error: (error: unknown) => {
          if (current !== this.requestId) {
            return;
          }
          this.days.set(defaultWeek());
          this.isLoadingSchedule.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el horario.'));
        },
      });
  }

  private patchDay(dayOfWeek: number, patch: Partial<ScheduleItem>): void {
    this.days.update((items) =>
      items.map((day) => (day.day_of_week === dayOfWeek ? { ...day, ...patch } : day)),
    );
    this.savedMessage.set(null);
  }
}

function defaultWeek(): ScheduleItem[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    start_time: '09:00',
    end_time: '18:00',
    is_active: dayOfWeek <= 4,
  }));
}

function mergeWeek(rows: ScheduleItem[]): ScheduleItem[] {
  const byDay = new Map(rows.map((row) => [row.day_of_week, row]));
  return defaultWeek().map((fallback) => {
    const row = byDay.get(fallback.day_of_week);
    if (!row) {
      return fallback;
    }
    return {
      day_of_week: row.day_of_week,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      is_active: row.is_active,
    };
  });
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
      return detail;
    }
    if (Array.isArray(detail)) {
      const message = detail
        .map((item) => (typeof item?.msg === 'string' ? item.msg : ''))
        .filter(Boolean)
        .join(' ');
      if (message) {
        return message;
      }
    }
  }
  return fallback;
}
