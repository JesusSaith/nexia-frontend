export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show', 'awaiting_deposit'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface AvailabilitySlot {
  starts_at: string;
  /** Quién atiende ese horario; útil cuando se pidió "cualquiera". */
  staff_id?: number | null;
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
  /** Fotos de referencia para cotizar (data URL, máx. 3). */
  reference_photos?: string[];
  /** Campo trampa contra bots; las personas lo dejan vacío. */
  website?: string | null;
  coupon?: string | null;
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
  photo_count?: number;
  payment_method?: string | null;
  tip?: number | null;
  visit_note?: string | null;
  discount_percent?: number | null;
  /** Llegó por la página con "aprobar citas a mano": el horario está apartado, falta el sí de la dueña. */
  needs_approval?: boolean;
  /** La clienta dijo "Ya pagué" con el enlace de pago; falta revisar y aceptar. */
  paid_claim?: boolean;
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
