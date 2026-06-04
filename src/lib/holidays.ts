// Lịch nghỉ lễ (dương) theo quy định Chính phủ VN — dùng để phân loại OT ngày lễ
// và xác định ngày nghỉ lễ (hưởng lương theo Lương BHXH).
//
// LƯU Ý: cần cập nhật/kiểm tra theo lịch nghỉ chính thức từng năm (gồm cả nghỉ bù).
// Định dạng: "YYYY-MM-DD".

// Lễ THẬT → làm việc tính OT ×3.
// Lễ chính thức theo luật — TẤT CẢ NV được hưởng 1 công nghỉ có lương / ngày lễ
// (kể cả khi lễ rơi vào CN). NV đi làm vào lễ: ngày làm tính OT theo hệ số (lễ ×3, CN ×2),
// + vẫn được cộng 1 công nghỉ có lương theo Lương BHXH/CC.
export const VN_HOLIDAYS: Record<number, string[]> = {
  2026: [
    "2026-01-01",                                   // Tết Dương lịch
    "2026-02-16", "2026-02-17", "2026-02-18",       // Tết Nguyên Đán (mùng 1 = 17/02)
    "2026-02-19", "2026-02-20",
    "2026-04-26",                                   // Giỗ Tổ Hùng Vương (rơi CN — vẫn 1 công lễ; đi làm tính OT CN ×2)
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

/** Số ngày lễ chính thức (VN_HOLIDAYS) trong tháng — KHÔNG gồm nghỉ bù.
 *  Mọi NV được +1 công nghỉ có lương / ngày lễ này (kể cả lễ rơi CN). */
export function paidHolidaysInMonth(year: number, month: number): string[] {
  const mm = String(month).padStart(2, "0");
  return (VN_HOLIDAYS[year] || []).filter((d) => d.slice(0, 7) === `${year}-${mm}`);
}

/** Công chuẩn (CC) = số ngày làm thực = số ngày trong tháng − số Chủ Nhật − số ngày Lễ (rơi vào ngày thường). */
export function standardWorkDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let sundays = 0;
  let weekdayHolidays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getDay() === 0) {
      sundays++;
      continue; // CN rồi → không đếm vào lễ ngày thường nữa
    }
    if (isHoliday(new Date(Date.UTC(year, month - 1, d)))) weekdayHolidays++;
  }
  return daysInMonth - sundays - weekdayHolidays;
}
