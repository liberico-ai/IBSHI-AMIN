// Phân loại mã nghỉ trong file công (dòng "nghỉ" — dòng 3 mỗi NV).
// Quy ước IBSHI (chốt 2026-05-28):
//   AL  = nghỉ phép năm CÓ LƯƠNG (công ty trả theo lương BHXH).  "0.5AL" = 0.5 ngày phép.
//   UL  = nghỉ KHÔNG lương.                                       "0.5UL" = 0.5 ngày ko lương.
//   SL  = nghỉ ốm   → BHXH chi trả, công ty KHÔNG trả (= 0).
//   ML  = thai sản  → BHXH chi trả, công ty KHÔNG trả (= 0).
//   L   = nghỉ lễ   → xử lý qua lịch lễ (holiday-rest), không tính ở đây.
// → Chỉ AL phát sinh "ngày nghỉ có lương" trên bảng lương công ty.

export interface LeaveParse {
  paidLeaveDays: number;   // số ngày nghỉ CÓ LƯƠNG (chỉ AL): 0 / 0.5 / 1...
  code: string | null;     // mã gốc đã chuẩn hoá (AL/UL/SL/ML/L) để lưu tra cứu
}

export function parseLeaveCode(raw: unknown): LeaveParse {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s || s === "-" || /^-?\d+(\.\d+)?$/.test(s)) return { paidLeaveDays: 0, code: null }; // trống/số thuần → không phải mã nghỉ
  // AL có lương: bắt "AL", "0.5AL", "1AL", "0,5AL"
  const al = s.replace(",", ".").match(/^(\d*\.?\d+)?AL$/);
  if (al) return { paidLeaveDays: al[1] ? parseFloat(al[1]) : 1, code: s };
  // UL/SL/ML/L (+ nửa ngày) → công ty không trả
  const other = s.replace(",", ".").match(/^(\d*\.?\d+)?(UL|SL|ML|L)$/);
  if (other) return { paidLeaveDays: 0, code: s };
  return { paidLeaveDays: 0, code: null };
}

/** Một ô có phải mã nghỉ (chữ) không — để nhận diện DÒNG NGHỈ trong block của NV. */
export function isLeaveToken(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^(\d*\.?\d+)?(AL|UL|SL|ML|L)$/.test(s.replace(",", "."));
}
