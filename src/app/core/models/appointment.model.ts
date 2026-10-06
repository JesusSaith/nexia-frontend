export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface AvailabilitySlot {
  starts_at: string;
}

export interface AppointmentCreate {
  service_id: number;
  staff_id: number;
  starts_at: string;
  client_name: string;
  client_phone: string;
  client_email: string;
}

export interface Appointment {
  id: number;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  service_id: number;
  service_name: string;
  staff_id: number;
  staff_name: string;
  starts_at: string;
  status: AppointmentStatus;
  notes?: string | null;
}

export interface AppointmentQuery {
  start_date?: string;
  end_date?: string;
  staff_id?: number | null;
  service_id?: number | null;
}

export interface AdminAppointmentCreate {
  service_id: number;
  staff_id: number;
  starts_at: string;
  client_name: string;
  client_phone: string;
  client_email?: string | null;
  notes?: string | null;
}

export interface AppointmentStatusUpdate {
  status: AppointmentStatus;
}
