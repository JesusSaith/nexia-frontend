export interface Service {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}

export interface ServiceWrite {
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active?: boolean;
}

export type ServiceUpdate = Partial<ServiceWrite>;
