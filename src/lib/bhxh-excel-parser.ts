// Parser file Excel BHXH (HCNS tính ngoài rồi import).
// Hỗ trợ 2 dạng file:
//   (A) File thật của HCNS: header 2 tầng + nhóm "10.5% Người lao động" / "21.5% Công ty đóng",
//       có cột tổng "Cộng NLĐ" và "Cộng Cty". Nhận diện theo 2 neo này.
//   (B) File mẫu đơn giản (nút "Tải file mẫu"): 1 dòng header
//       Mã NV | Họ tên | BHXH (8%) | BHYT (1.5%) | BHTN (1%) | BHXH Công ty (21.5%).
// Lấy: Mã NV, BHXH 8%, BHYT 1.5%, BHTN 1% (NLĐ — khoản TRỪ), BHXH Công ty 21.5% (chỉ báo cáo, KHÔNG trừ).
import * as XLSX from "xlsx";

// Nhận diện cột theo neo "Cộng NLĐ"/"Cộng Cty" (file thật) hoặc header mẫu (rev 2).
const norm = (v: any) =>
  (v ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();

// Số tiền: number → Math.round; chuỗi "1.234.567"/"1,234,567" → int (đồng).
function toInt(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = v.toString().replace(/[^\d.,-]/g, "").replace(/[.,](?=\d{3}\b)/g, "");
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export interface BhxhRow {
  code: string;
  bhxh8: number;
  bhyt15: number;
  bhtn1: number;
  bhxhEmployer: number; // Cộng Cty (21.5%) — chỉ báo cáo, KHÔNG trừ vào lương
}

export function parseBhxhExcel(buf: ArrayBuffer): BhxhRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("File Excel rỗng / không đọc được sheet");
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // 1) Tìm cột Mã NV (quét tối đa 20 dòng đầu).
  let codeCol = -1, codeRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20) && codeCol === -1; i++) {
    (rows[i] || []).forEach((c, j) => {
      const h = norm(c);
      if (codeCol === -1 && (h.includes("ma nv") || (h.startsWith("ma") && h.includes("nv")))) { codeCol = j; codeRow = i; }
    });
  }
  if (codeCol === -1) throw new Error('Không tìm thấy cột "Mã NV"');

  // 2) Tìm dòng có "Cộng NLĐ" + "Cộng Cty" (file thật) → neo cột theo vị trí.
  let bhxh8 = -1, bhyt15 = -1, bhtn1 = -1, employer = -1, dataStart = codeRow + 1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] || []).map(norm);
    const cNLD = cells.findIndex((c) => c.includes("cong nld"));
    const cCty = cells.findIndex((c) => c.includes("cong cty") || c.includes("cong ct "));
    if (cNLD >= 3 && cCty >= 0) {
      bhxh8 = cNLD - 3; bhyt15 = cNLD - 2; bhtn1 = cNLD - 1; employer = cCty;
      dataStart = i + 1;
      break;
    }
  }

  // 3) Nếu không có neo "Cộng NLĐ/Cty" → file mẫu đơn giản: dò cột theo tên header ở dòng Mã NV.
  if (bhxh8 === -1) {
    const header = (rows[codeRow] || []).map(norm);
    header.forEach((h, idx) => {
      if (!h) return;
      if (employer === -1 && (h.includes("cong ty") || h.includes("21.5") || h.includes("21,5") || h.includes("doanh nghiep"))) { employer = idx; return; }
      if (bhxh8 === -1 && h.includes("bhxh") && (h.includes("8") || !h.includes("cong ty"))) { bhxh8 = idx; return; }
      if (bhyt15 === -1 && (h.includes("bhyt") || h.includes("1.5") || h.includes("1,5"))) { bhyt15 = idx; return; }
      if (bhtn1 === -1 && (h.includes("bhtn") || h.includes("that nghiep"))) { bhtn1 = idx; return; }
    });
    dataStart = codeRow + 1;
  }

  // 4) Đọc dữ liệu. Bỏ qua dòng trống + dòng "số thứ tự cột" (mã 1-3 chữ số).
  const out: BhxhRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = (r[codeCol] ?? "").toString().trim();
    if (!code || /^\d{1,3}$/.test(code)) continue;
    out.push({
      code,
      bhxh8: bhxh8 >= 0 ? toInt(r[bhxh8]) : 0,
      bhyt15: bhyt15 >= 0 ? toInt(r[bhyt15]) : 0,
      bhtn1: bhtn1 >= 0 ? toInt(r[bhtn1]) : 0,
      bhxhEmployer: employer >= 0 ? toInt(r[employer]) : 0,
    });
  }
  if (out.length === 0) throw new Error("Không có dòng dữ liệu NV nào trong file");
  return out;
}
