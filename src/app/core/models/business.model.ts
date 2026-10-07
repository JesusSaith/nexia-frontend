export interface BusinessBrand {
  name: string;
  logo_url: string | null;
  primary_color: string;
  canvas_color?: string | null;
  phone: string;
  email?: string | null;
  slug?: string | null;
  description?: string | null;
  address?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  website?: string | null;
  deposit_amount?: number | null;
  deposit_percent?: number | null;
  deposit_account?: string | null;
}

export interface BusinessProfileUpdate {
  name?: string;
  phone?: string | null;
  logo_url?: string | null;
  description?: string | null;
  address?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  website?: string | null;
  primary_color?: string;
  canvas_color?: string | null;
}

export interface PublicService {
  id: number;
  name: string;
  description: string | null;
  price: number;
  deposit_amount?: number | null;
  duration_minutes: number;
  variable_price?: boolean;
}

export interface PublicStaff {
  id: number;
  full_name: string;
  role_title: string;
  avatar_url?: string | null;
  bio?: string | null;
  service_ids?: number[];
}
