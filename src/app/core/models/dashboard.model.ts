import { Appointment } from './appointment.model';

export interface TopServiceItem {
  service_name: string;
  total_appointments: number;
  total_revenue: number;
}

export interface StaffOccupancyItem {
  staff_name: string;
  total_appointments: number;
}

export interface WeekTrendPoint {
  date: string;
  count: number;
  revenue: number;
}

export interface DashboardSummary {
  today_appointments_count: number;
  today_revenue: number;
  week_appointments_count: number;
  upcoming_today: Appointment[];
  week_trend: WeekTrendPoint[];
}

export interface DashboardStats {
  total_today: number;
  total_month: number;
  revenue_today: number;
  revenue_month: number;
  top_services: TopServiceItem[];
  staff_occupancy: StaffOccupancyItem[];
}
