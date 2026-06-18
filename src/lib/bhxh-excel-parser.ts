// Parser file Excel BHXH (HCNS tính ngoài rồi import).
// Cột nhận diện theo TÊN HEADER (không phụ thuộc vị trí cố định):
//   Mã NV | BHXH (8%) | BHYT (1.5%) | BHTN (1%) | BHXH Công ty (21.5%)
// Trả về list { code, name, bhxh8, bhyt15, bhtn1, bhxhEmployer }.
import * as XLSX from "xlsx";

const norm = (v: any) =>
  (v ?? "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Số tiền: nhận number hoặc chuỗi "1.234.567" / "1,234,567" → int (đồng).
function toInt(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.round(v);
  const s = v.toString().replace(/[^\d.,-]/g, "").replace(/[.,](?=\d{3}\b)/g, ""); // bỏ dấu phân cách hàng nghìn
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export interface BhxhRow {
  code: string;
  name: string;
  bhxh8: number;
  bhyt15: number;
  bhtn1: number;
  bhxhEmployer: number;
}

export function parseBhxhExcel(buf: ArrayBuffer): BhxhRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("File Excel rỗng / không đọc được sheet");
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Tìm dòng header: dòng có ô chứa "ma" (Mã NV) + ít nhất 1 ô BHXH/BHYT/BHTN.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm);
    const hasCode = cells.some((c) => (c.includes("ma") && (c.includes("nv") || c.includes("nhan vien"))) || c === "ma");
    const hasBhxh = cells.some((c) => c.includes("bhxh") || c.includes("bhyt") || c.includes("bhtn"));
    if (hasCode && hasBhxh) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề (cần cột "Mã NV" + các cột BHXH/BHYT/BHTN)');

  const header = (rows[headerIdx] || []).map(norm);
  let codeCol = -1, nameCol = -1, c8 = -1, c15 = -1, c1 = -1, cEmp = -1;
  header.forEach((h, idx) => {
    if (!h) return;
    // Công ty / 21.5% phải xét TRƯỚC "bhxh" để không nhầm với BHXH 8%.
    if (cEmp === -1 && (h.includes("cong ty") || h.includes("21.5") || h.includes("21,5") || h.includes("doanh nghiep"))) { cEmp = idx; return; }
    if (codeCol === -1 && ((h.includes("ma") && (h.includes("nv") || h.includes("nhan vien"))) || h === "ma")) { codeCol = idx; return; }
    if (nameCol === -1 && (h.includes("ho ten") || h.includes("ten") )) { nameCol = idx; return; }
    if (c8 === -1 && h.includes("bhxh") && (h.includes("8") || !h.includes("cong ty"))) { c8 = idx; return; }
    if (c15 === -1 && (h.includes("bhyt") || h.includes("1.5") || h.includes("1,5"))) { c15 = idx; return; }
    if (c1 === -1 && (h.includes("bhtn") || h.includes("that nghiep"))) { c1 = idx; return; }
  });
  if (codeCol === -1) throw new Error('Không tìm thấy cột "Mã NV"');

  const out: BhxhRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = (r[codeCol] ?? "").toString().trim();
    if (!code) continue;
    out.push({
      code,
      name: nameCol >= 0 ? (r[nameCol] ?? "").toString().trim() : "",
      bhxh8: c8 >= 0 ? toInt(r[c8]) : 0,
      bhyt15: c15 >= 0 ? toInt(r[c15]) : 0,
      bhtn1: c1 >= 0 ? toInt(r[c1]) : 0,
      bhxhEmployer: cEmp >= 0 ? toInt(r[cEmp]) : 0,
    });
  }
  if (out.length === 0) throw new Error("Không có dòng dữ liệu NV nào trong file");
  return out;
}
