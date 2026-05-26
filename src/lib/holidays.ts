// Lịch nghỉ lễ (dương) theo quy định Chính phủ VN — dùng để phân loại OT ngày lễ
// và xác định ngày nghỉ lễ (hưởng lương theo Lương BHXH).
//
// LƯU Ý: cần cập nhật/kiểm tra theo lịch nghỉ chính thức từng năm (gồm cả nghỉ bù).
// Định dạng: "YYYY-MM-DD".

export const VN_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-01-01",                                   // Tết Dương lịch
    "2026-02-16", "2026-02-17", "2026-02-18",       // Tết Nguyên Đán (mùng 1 = 17/02)
    "2026-02-19", "2026-02-20",
    "2026-04-26", "2026-04-27",                     // Giỗ Tổ Hùng Vương (10/3 ÂL)
    "2026-04-30",                                   // Ngày Giải phóng miền Nam
    "2026-05-01",                                   // Quốc tế Lao động
    "2026-09-01", "2026-09-02",                     // Quốc khánh
  ],
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ngày này có phải nghỉ lễ không (theo lịch dương Chính phủ VN). */
export function isHoliday(date: Date): boolean {
  const list = VN_HOLIDAYS[date.getUTCFullYear()];
  if (!list) return false;
  return list.includes(ymd(date));
}

/** Đếm số ngày lễ (theo dương lịch) trong 1 tháng cụ thể. */
export function holidaysInMonth(year: number, month: number): string[] {
  const list = VN_HOLIDAYS[year] || [];
  const mm = String(month).padStart(2, "0");
  return list.filter((d) => d.slice(0, 7) === `${year}-${mm}`);
}

/** Công chuẩn (CC) = số ngày trong tháng − số Chủ Nhật. */
export function standardWorkDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 0) sundays++;
  }
  return daysInMonth - sundays;
}
