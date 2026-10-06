export interface TopServiceItem {
  service_name: string;
  total_appointments: number;
  total_revenue: number;
}

export interface StaffOccupancyItem {
  staff_name: string;
  total_appointments: number;
}

export interface DashboardStats {
  total_today: number;
  total_month: number;
  revenue_today: number;
  revenue_month: number;
  top_services: TopServiceItem[];
  staff_occupancy: StaffOccupancyItem[];
}
