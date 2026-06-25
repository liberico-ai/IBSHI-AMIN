// Phân loại mã nghỉ trong file công (dòng "nghỉ"/"Khác").
// Quy ước IBSHI (chốt 2026-06-25 — theo HCNS):
//   CÔNG TY TRẢ lương: AL (phép năm), L (lễ), CL (ma chay), WL (tai nạn LĐ), ML (đám cưới).
//   BHXH TRẢ (công ty không trả, chỉ HIỂN THỊ vào cột nghỉ hưởng lương): SL (ốm), MT (thai sản).
//   KHÔNG lương: UL.
//   "0.5XX" = nửa ngày của mã XX.

// Mã công ty trả lương (ngoài AL & L vốn xử lý riêng): CL/WL/ML cũng trả như AL.
export const COMPANY_PAID_LEAVE = ["AL", "L", "CL", "WL", "ML"];
// Mã do BHXH chi trả — chỉ hiển thị, công ty không trả.
export const BHXH_LEAVE = ["SL", "MT"];
// Mã chữ thuần (bỏ số/fraction): "0.5CL" → "CL".
export const leaveCodeBase = (code: unknown): string => String(code ?? "").toUpperCase().replace(/[0-9.,\s]/g, "");
// Số ngày của 1 mã nghỉ (fraction): "0.5CL" → 0.5, "CL" → 1, không phải mã → 0.
export const leaveQty = (code: unknown): number => {
  const m = String(code ?? "").toUpperCase().replace(",", ".").match(/^(\d*\.?\d+)?([A-Z]{1,3})$/);
  return m ? (m[1] ? parseFloat(m[1]) : 1) : 0;
};

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
