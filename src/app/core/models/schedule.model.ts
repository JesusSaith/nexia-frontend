export interface ScheduleItem {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  slot_times?: string | null;
  break_start?: string | null;
  break_end?: string | null;
}

export interface Schedule extends ScheduleItem {
  id: number;
  staff_id: number;
}
