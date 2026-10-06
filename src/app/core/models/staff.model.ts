export interface Staff {
  id: number;
  full_name: string;
  role_title: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  user_id?: number | null;
  avatar_url?: string | null;
  bio?: string | null;
  service_ids?: number[];
}

export interface StaffWrite {
  full_name: string;
  role_title: string;
  email: string | null;
  phone: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
}

export type StaffUpdate = Partial<StaffWrite>;

export interface StaffAccountCreate {
  email: string;
  password: string;
}

export interface StaffProfileUpdate {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
}
