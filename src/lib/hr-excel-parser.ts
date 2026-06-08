// Parser cho file Excel "Bảng lương" của HR.
// Đọc 2 sheet quan trọng:
//   - "Chi tiết lương": AT (lương khoán), AZ (tiền ăn TG), BE (BS đ/c) cho từng NV
//   - "Thêm giờ":       OT theo từng ngày (1-31) cho từng NV
//
// Trả về dữ liệu chuẩn hoá để API/UI xử lý tiếp.

import * as XLSX from "xlsx";

export interface ParsedHRExcelRow {
  code: string;        // Mã NV
  name: string;        // Họ tên
  pieceRate: number;   // AT - Lương khoán/sản phẩm
  mealBonus: number;   // AZ - Tiền ăn thêm giờ
  adjustment: number;  // BE - BS/Điều chỉnh kỳ này
  otByDate: Record<number, number>; // day (1-31) → hours OT
}

export interface ParsedHRExcel {
  rows: ParsedHRExcelRow[];
  totalNVs: number;
  totalPieceRate: number;
  totalMealBonus: number;
  totalAdjustment: number;
  totalOtHours: number;
}

function cellVal(ws: XLSX.WorkSheet, r: number, col: string): any {
  return ws[XLSX.utils.encode_cell({ r, c: XLSX.utils.decode_col(col) })]?.v ?? "";
}
function cellNum(ws: XLSX.WorkSheet, r: number, col: string): number {
  const x = cellVal(ws, r, col);
  return typeof x === "number" ? x : (Number(x) || 0);
}

/**
 * Đọc file Excel "Bảng lương" và trả về dữ liệu chuẩn hoá.
 *
 * @param buffer - File Excel ở dạng ArrayBuffer hoặc Buffer
 * @param month - Tháng (1-12) — dùng để map cột ngày trong sheet "Thêm giờ"
 */
export function parseHRBangLuong(buffer: ArrayBuffer | Buffer, month: number): ParsedHRExcel {
  const wb = XLSX.read(buffer, { type: "array" });

  const wsLuong = wb.Sheets["Chi tiết lương"];
  const wsTG = wb.Sheets["Thêm giờ"];
  if (!wsLuong) throw new Error("Không tìm thấy sheet 'Chi tiết lương' trong file Excel.");
  if (!wsTG) throw new Error("Không tìm thấy sheet 'Thêm giờ' trong file Excel.");

  const luongRange = XLSX.utils.decode_range(wsLuong["!ref"] || "A1");
  const tgRange = XLSX.utils.decode_range(wsTG["!ref"] || "A1");

  // Index theo Mã NV cho sheet Thêm giờ
  const tgRowByCode: Record<string, number> = {};
  for (let r = 0; r < tgRange.e.r; r++) {
    const code = String(cellVal(wsTG, r, "B"));
    if (/^\d+$/.test(code)) tgRowByCode[code] = r;
  }

  const daysInMonth = new Date(2026, month, 0).getDate(); // year 2026 cố định ok cho parse cột
  // Cột E = ngày 1, F = 2, ..., AI cho ngày 31
  function dayToCol(day: number): string {
    return XLSX.utils.encode_col(XLSX.utils.decode_col("E") + day - 1);
  }

  const rows: ParsedHRExcelRow[] = [];
  let totalOtHours = 0;
  let totalPieceRate = 0, totalMealBonus = 0, totalAdjustment = 0;

  for (let r = 0; r < luongRange.e.r; r++) {
    const code = String(cellVal(wsLuong, r, "B"));
    if (!/^\d+$/.test(code)) continue;
    const name = String(cellVal(wsLuong, r, "C"));
    const pieceRate = Math.round(cellNum(wsLuong, r, "AT"));
    const mealBonus = Math.round(cellNum(wsLuong, r, "AZ"));
    const adjustment = Math.round(cellNum(wsLuong, r, "BE"));

    const otByDate: Record<number, number> = {};
    const tgRow = tgRowByCode[code];
    if (tgRow != null) {
      for (let day = 1; day <= daysInMonth; day++) {
        const h = cellNum(wsTG, tgRow, dayToCol(day));
        if (h > 0) {
          otByDate[day] = h;
          totalOtHours += h;
        }
      }
    }

    rows.push({ code, name, pieceRate, mealBonus, adjustment, otByDate });
    totalPieceRate += pieceRate;
    totalMealBonus += mealBonus;
    totalAdjustment += adjustment;
  }

  return {
    rows,
    totalNVs: rows.length,
    totalPieceRate, totalMealBonus, totalAdjustment, totalOtHours,
  };
}

/**
 * Phân loại 1 ngày trong tháng → otRate cho việc tạo OTRequest.
 * Trả về { otRate, importToOTRequest }.
 * - importToOTRequest = false → ngày này KHÔNG cần tạo OTRequest (DB attendance đã track)
 * - importToOTRequest = true → cần tạo OTRequest (vì attendance không track đầy đủ)
 */
export function classifyDay(year: number, month: number, day: number): { otRate: number; importToOTRequest: boolean } {
  const date = new Date(year, month - 1, day);
  const dow = date.getDay();
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Lễ chính thức (không phải nghỉ bù) — VN_HOLIDAYS
  // CHỈ với T4/2026, em hard-code vài ngày — sau này refactor từ holidays.ts cho mọi tháng
  const realHolidays_2026 = ["2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-04-26", "2026-04-30", "2026-05-01", "2026-09-01", "2026-09-02"];
  const compHolidays_2026 = ["2026-04-27"];

  if (compHolidays_2026.includes(ymd)) return { otRate: 3, importToOTRequest: true };
  if (realHolidays_2026.includes(ymd)) {
    // Lễ rơi CN → ×2; lễ ngày thường → ×3
    return { otRate: dow === 0 ? 2 : 3, importToOTRequest: true };
  }
  if (dow === 0) return { otRate: 2, importToOTRequest: true };  // CN
  // T7 và T2-T6 → đã có trong AttendanceRecord
  return { otRate: 1.5, importToOTRequest: false };
}
