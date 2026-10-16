export interface Service {
  id: number;
  name: string;
  category?: string | null;
  description: string | null;
  price: number;
  deposit_amount?: number | null;
  duration_minutes: number;
  is_active: boolean;
  variable_price?: boolean;
  image_url?: string | null;
  questions?: string | null;
  capacity?: number;
  /** Cada cuántos días suele volver la clienta ("Te toca"); vacío = se calcula del historial. */
  return_days?: number | null;
}

export interface ServiceWrite {
  name: string;
  category?: string | null;
  description: string | null;
  price: number;
  deposit_amount?: number | null;
  duration_minutes: number;
  is_active?: boolean;
  variable_price?: boolean;
  image_url?: string | null;
  questions?: string | null;
  capacity?: number;
  return_days?: number | null;
}

export type ServiceUpdate = Partial<ServiceWrite>;
