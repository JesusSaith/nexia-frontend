import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { BusinessCopy } from '@core/business-copy';
import { whatsappLink } from '@core/message-templates';
import { Appointment, AppointmentStatus } from '@core/models/appointment.model';
import { noticeAction } from '@core/notice-groups';
import { AppointmentsService } from '@core/services/appointments.service';

export interface NoticeDetailData {
  message: string;
  /** "jueves 22 oct · 3:40 p. m." */
  when: string;
  kind?: string | null;
  appointmentId?: number | null;
  /** Cuántas veces pasó lo mismo (avisos repetidos juntos). */
  count: number;
  /** Lista de espera: a quién avisar, con el enlace de WhatsApp ya armado. */
  people: { name: string; href: string }[];
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  awaiting_deposit: 'Espera anticipo',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No llegó',
};

/** Detalle de un aviso de Inicio: lo que pasó, cuándo y la cita a la que se refiere (si la hay). */
@Component({
  selector: 'app-notice-detail',
  imports: [MatIconModule],
  templateUrl: './notice-detail.html',
})
export class NoticeDetailComponent {
  protected readonly data = inject<NoticeDetailData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NoticeDetailComponent>);
  private readonly router = inject(Router);
  private readonly api = inject(AppointmentsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly copy = inject(BusinessCopy);

  protected readonly appointment = signal<Appointment | null>(null);
  protected readonly loading = signal(!!this.data.appointmentId);
  /** La cita ya no existe (se borró) o no se pudo cargar. */
  protected readonly missing = signal(false);
  protected readonly actionLabel = noticeAction(this.data.kind);

  constructor() {
    if (this.data.appointmentId) {
      this.api
        .getAppointment(this.data.appointmentId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (found) => {
            this.appointment.set(found);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.missing.set(error instanceof HttpErrorResponse && error.status === 404);
            this.loading.set(false);
          },
        });
    }
  }

  protected status(item: Appointment): string {
    return STATUS_LABELS[item.status];
  }

  protected when(item: Appointment): string {
    const date = new Date(item.starts_at);
    const day = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const hour = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${hour}`;
  }

  protected chat(item: Appointment): string {
    return whatsappLink(item.client_phone, '');
  }

  protected openInAgenda(): void {
    this.ref.close();
    void this.router.navigate(['/admin/agenda'], { queryParams: { cita: this.data.appointmentId } });
  }

  protected close(): void {
    this.ref.close();
  }
}
