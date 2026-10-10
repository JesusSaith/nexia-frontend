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
}

export type ServiceUpdate = Partial<ServiceWrite>;
