export interface ScheduleItem {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface Schedule extends ScheduleItem {
  id: number;
  staff_id: number;
}
