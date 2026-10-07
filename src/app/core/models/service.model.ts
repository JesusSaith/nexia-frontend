export interface Service {
  id: number;
  name: string;
  description: string | null;
  price: number;
  deposit_amount?: number | null;
  duration_minutes: number;
  is_active: boolean;
  variable_price?: boolean;
}

export interface ServiceWrite {
  name: string;
  description: string | null;
  price: number;
  deposit_amount?: number | null;
  duration_minutes: number;
  is_active?: boolean;
  variable_price?: boolean;
}

export type ServiceUpdate = Partial<ServiceWrite>;
