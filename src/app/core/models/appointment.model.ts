export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show', 'awaiting_deposit'] as const;

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
  client_email?: string | null;
  notes?: string | null;
  extra_service_ids?: number[];
  resource_name?: string | null;
  answers?: string | null;
  use_package?: boolean;
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
  cancel_token?: string | null;
  deposit_amount?: number | null;
  payment_proof?: string | null;
  quoted_price?: number | null;
  client_confirmed?: boolean;
  price_accepted?: boolean;
  created_at?: string | null;
  resource_name?: string | null;
  extra_label?: string | null;
  answers?: string | null;
}

export interface AppointmentQuery {
  start_date?: string;
  end_date?: string;
  staff_id?: number | null;
  service_id?: number | null;
  client_phone?: string | null;
}

export interface AdminAppointmentCreate {
  service_id: number;
  staff_id: number;
  starts_at: string;
  client_name: string;
  client_phone: string;
  client_email?: string | null;
  notes?: string | null;
  quoted_price?: number | null;
  waive_deposit?: boolean;
}

export interface AppointmentStatusUpdate {
  status: AppointmentStatus;
}
