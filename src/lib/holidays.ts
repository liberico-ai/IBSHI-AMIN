// Lịch nghỉ lễ (dương) theo quy định Chính phủ VN — dùng để phân loại OT ngày lễ
// và xác định ngày nghỉ lễ (hưởng lương theo Lương BHXH).
//
// LƯU Ý: cần cập nhật/kiểm tra theo lịch nghỉ chính thức từng năm (gồm cả nghỉ bù).
// Định dạng: "YYYY-MM-DD".

// Lễ THẬT → làm việc tính OT ×3.
export const VN_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-01-01",                                   // Tết Dương lịch
    "2026-02-16", "2026-02-17", "2026-02-18",       // Tết Nguyên Đán (mùng 1 = 17/02)
    "2026-02-19", "2026-02-20",
    // 26/4/2026 là CHỦ NHẬT (Giỗ Tổ rơi vào CN) → xử lý như Chủ nhật ×2.
    "2026-04-30",                                   // Ngày Giải phóng miền Nam
    "2026-05-01",                                   // Quốc tế Lao động
    "2026-09-01", "2026-09-02",                     // Quốc khánh
  ],
};

// NGHỈ BÙ (lễ rơi vào Chủ nhật) → là ngày nghỉ hưởng lương, NHƯNG làm việc chỉ tính OT ×2 (như Chủ nhật)
// theo quy định công ty (chốt 2026-05-28).
export const COMP_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-04-27",                                   // Nghỉ bù Giỗ Tổ (Giỗ Tổ rơi CN 26/4) — OT ×2
  ],
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ngày này có phải ngày nghỉ hưởng lương không (lễ thật HOẶC nghỉ bù). */
export function isHoliday(date: Date): boolean {
  const y = date.getUTCFullYear();
  const key = ymd(date);
  return (VN_HOLIDAYS[y]?.includes(key) ?? false) || (COMP_HOLIDAYS[y]?.includes(key) ?? false);
}

/** Ngày nghỉ bù (lễ rơi CN) → làm việc tính OT ×2 như Chủ nhật, KHÔNG phải ×3. */
export function isCompensatoryHoliday(date: Date): boolean {
  return COMP_HOLIDAYS[date.getUTCFullYear()]?.includes(ymd(date)) ?? false;
}

/** Đếm số ngày nghỉ hưởng lương (lễ thật + nghỉ bù) trong 1 tháng. */
export function holidaysInMonth(year: number, month: number): string[] {
  const mm = String(month).padStart(2, "0");
  const all = [...(VN_HOLIDAYS[year] || []), ...(COMP_HOLIDAYS[year] || [])];
  return all.filter((d) => d.slice(0, 7) === `${year}-${mm}`);
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
