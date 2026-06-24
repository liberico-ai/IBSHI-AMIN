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

// Mã nghỉ = (số ngày tuỳ chọn) + 1-3 CHỮ CÁI. Vd: AL, 0.5AL, UL, MC, SL, ML, L...
// CHỈ "AL" là nghỉ phép CÓ LƯƠNG; mã khác (UL/SL/ML/MC/L/...) → công ty không trả, chỉ lưu mã để tra cứu.
const LEAVE_RE = /^(\d*\.?\d+)?([A-Z]{1,3})$/;

export function parseLeaveCode(raw: unknown): LeaveParse {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(",", ".");
  if (!s || s === "-" || /^-?\d+(\.\d+)?$/.test(s)) return { paidLeaveDays: 0, code: null }; // trống/số thuần → không phải mã nghỉ
  const m = s.match(LEAVE_RE);
  if (!m) return { paidLeaveDays: 0, code: null };
  const qty = m[1] ? parseFloat(m[1]) : 1;
  const paid = m[2] === "AL" ? qty : 0; // chỉ AL có lương
  return { paidLeaveDays: paid, code: s };
}

/** Một ô có phải mã nghỉ (chữ) không — để nhận diện DÒNG NGHỈ ("Khác") trong block của NV. */
export function isLeaveToken(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(",", ".");
  if (!s || /^-?\d+(\.\d+)?$/.test(s)) return false;
  return LEAVE_RE.test(s);
}
