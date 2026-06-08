// Helper sinh danh sách ngày cho lịch đặt phòng / xe lặp lại.

export interface Recurrence {
  daysOfWeek: number[]; // 0=CN, 1=T2, 2=T3, 3=T4, 4=T5, 5=T6, 6=T7
  until: string;        // ISO date YYYY-MM-DD
}

const MAX_DAYS = 365; // chống abuse

/**
 * Sinh list ngày từ `start` đến `until` (inclusive), chỉ giữ những ngày
 * có thứ trong `daysOfWeek`.
 *
 * Mọi ngày trả về cùng giờ:phút:giây với `start` — chỉ phần date thay đổi.
 *
 * - daysOfWeek=[0..6]: hàng ngày
 * - daysOfWeek=[1..6]: T2-T7 (bỏ CN)
 * - daysOfWeek=[3]: chỉ T4 hàng tuần
 * - daysOfWeek=[2,4]: T3+T5 hàng tuần
 */
export function generateDates(start: Date, until: Date, daysOfWeek: number[]): Date[] {
  if (!daysOfWeek || daysOfWeek.length === 0) return [new Date(start)];
  const allowedSet = new Set(daysOfWeek.filter((d) => d >= 0 && d <= 6));
  if (allowedSet.size === 0) return [new Date(start)];

  // Hard cap: dừng khi đủ MAX_DAYS phiếu HOẶC vượt `until` (cái nào tới trước).
  const dates: Date[] = [];
  let d = new Date(start);
  while (d.getTime() <= until.getTime() && dates.length < MAX_DAYS) {
    if (allowedSet.has(d.getDay())) dates.push(new Date(d));
    d = new Date(d.getTime() + 86400_000);
  }
  return dates;
}

/** Apply giờ:phút từ `time` lên `date` (giữ y/m/d của date, giờ của time). */
export function applyTimeToDate(date: Date, time: Date): Date {
  const r = new Date(date);
  r.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return r;
}

/** Tên thứ ngắn cho UI hiển thị, theo thứ tự daysOfWeek. */
export const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
