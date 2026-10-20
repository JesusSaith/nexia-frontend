export interface ServiceVariant {
  name: string;
  price: number;
  duration_minutes: number;
}

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
  /** Material que gasta cada vez (tinte, cera…). */
  supply_cost?: number | null;
  sort_order?: number;
  featured?: boolean;
  /** Limpieza al terminar (sigue ocupada) y espera dentro del servicio (puede atender a otra). */
  cleanup_minutes?: number;
  wait_start?: number | null;
  wait_minutes?: number;
  variants?: ServiceVariant[];
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
  supply_cost?: number | null;
  sort_order?: number;
  featured?: boolean;
  /** Limpieza al terminar (sigue ocupada) y espera dentro del servicio (puede atender a otra). */
  cleanup_minutes?: number;
  wait_start?: number | null;
  wait_minutes?: number;
  variants?: ServiceVariant[];
}

export type ServiceUpdate = Partial<ServiceWrite>;
