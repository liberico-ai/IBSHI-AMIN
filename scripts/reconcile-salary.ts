// Đối soát bảng lương Excel ↔ DB Employee
// Đầu vào: 2 file Excel T3 + T4 (mã NV, họ tên, phòng ban, mức lương chính)
// So sánh với Employee + Contract trong DB → xuất file báo cáo Excel 4 sheet
//
// Chạy: npx tsx scripts/reconcile-salary.ts

import * as XLSX from "xlsx";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const FILE_T3 = "C:/Users/sontt/Downloads/Bảng lương 03.2026 lần 2.xls";
const FILE_T4 = "C:/Users/sontt/Downloads/Bảng lương 04.2026 (11.05.2026).xls";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-doi-soat-luong.xlsx";

// Cột trong "Chi tiết lương" (verified từ inspection)
const COL = {
  STT: 0,
  MA_NV: 1,
  HO_TEN: 2,
  BO_PHAN: 3,
  CHUC_DANH: 4,
  BAC_LUONG: 7,
  NGAY_VAO: 8,
  THAM_NIEN: 10,
  LUONG_CO_BAN: 12, // "Mức lương chính" — đây là Lương cơ bản theo HĐ
  TONG_LUONG_TT: 17, // Tổng lương thoả thuận theo HĐ
};

interface ExcelEmp {
  maNV: string;
  hoTen: string;
  boPhan: string;
  chucDanh: string;
  luongCoBan: number;
  tongLuongTT: number;
  thamNien: number | null;
  source: "T3" | "T4" | "T3+T4";
}

function normalizeName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function readExcel(file: string, monthLabel: "T3" | "T4"): Map<string, ExcelEmp> {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Chi tiết lương"];
  if (!ws) throw new Error("Không tìm thấy sheet 'Chi tiết lương' trong " + file);
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });

  const map = new Map<string, ExcelEmp>();
  for (let r = 11; r < data.length; r++) {
    const row = data[r] || [];
    const raw = row[COL.MA_NV];
    if (!raw) continue;
    const maNV = String(raw).trim();
    if (!/^\d+$/.test(maNV)) continue; // skip non-numeric rows (subtotals, blanks)
    const hoTen = String(row[COL.HO_TEN] || "").trim();
    if (!hoTen) continue;

    const luong = Number(row[COL.LUONG_CO_BAN] || 0);
    if (!Number.isFinite(luong) || luong <= 0) continue; // skip rows without lương (zero salary likely placeholder)

    map.set(maNV, {
      maNV,
      hoTen,
      boPhan: String(row[COL.BO_PHAN] || "").trim(),
      chucDanh: String(row[COL.CHUC_DANH] || "").trim(),
      luongCoBan: luong,
      tongLuongTT: Number(row[COL.TONG_LUONG_TT] || 0),
      thamNien: Number(row[COL.THAM_NIEN]) || null,
      source: monthLabel,
    });
  }
  return map;
}

async function main() {
  console.log("Đang đọc Excel T3...");
  const t3 = readExcel(FILE_T3, "T3");
  console.log("  T3:", t3.size, "NV");

  console.log("Đang đọc Excel T4...");
  const t4 = readExcel(FILE_T4, "T4");
  console.log("  T4:", t4.size, "NV");

  // Gộp T3 + T4 theo mã NV — ưu tiên T4 (mới nhất)
  const excelMap = new Map<string, ExcelEmp>();
  for (const [k, v] of t3) excelMap.set(k, { ...v, source: "T3" });
  for (const [k, v] of t4) {
    const old = excelMap.get(k);
    if (old) {
      excelMap.set(k, { ...v, source: "T3+T4" });
    } else {
      excelMap.set(k, { ...v, source: "T4" });
    }
  }
  console.log("  Tổng (T3 ∪ T4):", excelMap.size, "NV");

  // Connect DB
  console.log("\nĐang query DB...");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const dbEmployees = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "PROBATION", "ON_LEAVE"] } },
    include: {
      user: { select: { erpCode: true, email: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
      contracts: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  console.log("  DB: " + dbEmployees.length + " NV ACTIVE/PROBATION/ON_LEAVE");
  const withErp = dbEmployees.filter((e) => e.user?.erpCode).length;
  console.log("    Trong đó có erpCode: " + withErp);

  // Build lookup maps for DB
  const dbByErpCode = new Map<string, (typeof dbEmployees)[number]>();
  const dbByNormName = new Map<string, (typeof dbEmployees)[number][]>();
  for (const e of dbEmployees) {
    if (e.user?.erpCode) dbByErpCode.set(e.user.erpCode, e);
    const nn = normalizeName(e.fullName);
    if (!dbByNormName.has(nn)) dbByNormName.set(nn, []);
    dbByNormName.get(nn)!.push(e);
  }

  // ── Matching ──
  const matched: any[] = [];
  const inExcelNotInDB: any[] = [];
  const usedDbIds = new Set<string>();

  for (const [maNV, ex] of excelMap) {
    let db = dbByErpCode.get(maNV);
    let matchType = db ? "erpCode" : null;

    // Fallback: by name
    if (!db) {
      const cands = dbByNormName.get(normalizeName(ex.hoTen));
      if (cands && cands.length === 1) {
        db = cands[0];
        matchType = "tên (unique)";
      } else if (cands && cands.length > 1) {
        // Multiple matches — try to disambiguate by department name
        const byDept = cands.find((c) => normalizeName(c.department?.name || "") === normalizeName(ex.boPhan));
        if (byDept) {
          db = byDept;
          matchType = "tên + phòng ban";
        } else {
          db = cands[0];
          matchType = "tên (trùng " + cands.length + ", lấy đầu tiên)";
        }
      }
    }

    if (db) {
      usedDbIds.add(db.id);
      const dbBaseSalary = db.contracts[0]?.baseSalary ?? null;
      const lechLuong =
        dbBaseSalary != null ? ex.luongCoBan - Number(dbBaseSalary) : null;
      matched.push({
        "Mã NV (Excel)": ex.maNV,
        "Mã NV (DB)": db.code,
        "ERP Code (DB)": db.user?.erpCode || "",
        "Họ tên (Excel)": ex.hoTen,
        "Họ tên (DB)": db.fullName,
        "Phòng ban (Excel)": ex.boPhan,
        "Phòng ban (DB)": db.department?.name || "",
        "Chức danh (Excel)": ex.chucDanh,
        "Chức danh (DB)": db.position?.name || "",
        "Lương cơ bản (Excel)": ex.luongCoBan,
        "Lương cơ bản (DB - HĐ ACTIVE)": dbBaseSalary != null ? Number(dbBaseSalary) : "(chưa có HĐ)",
        "Lệch (Excel - DB)": lechLuong != null ? lechLuong : "",
        "Trạng thái DB": db.status,
        "Match theo": matchType,
        "Excel source": ex.source,
      });
    } else {
      inExcelNotInDB.push({
        "Mã NV (Excel)": ex.maNV,
        "Họ tên": ex.hoTen,
        "Phòng ban": ex.boPhan,
        "Chức danh": ex.chucDanh,
        "Lương cơ bản": ex.luongCoBan,
        "Tổng lương TT theo HĐ": ex.tongLuongTT,
        "Thâm niên (năm)": ex.thamNien ?? "",
        "Có trong tháng": ex.source,
      });
    }
  }

  const inDBNotInExcel: any[] = [];
  for (const e of dbEmployees) {
    if (usedDbIds.has(e.id)) continue;
    inDBNotInExcel.push({
      "Mã NV (DB)": e.code,
      "ERP Code": e.user?.erpCode || "(không có)",
      "Họ tên": e.fullName,
      "Phòng ban": e.department?.name || "",
      "Chức danh": e.position?.name || "",
      "Trạng thái": e.status,
      "Ngày vào": e.startDate.toISOString().slice(0, 10),
      "Lương cơ bản (HĐ ACTIVE)":
        e.contracts[0]?.baseSalary != null ? Number(e.contracts[0].baseSalary) : "(chưa có HĐ)",
    });
  }

  // ── Stats ──
  const matchByErp = matched.filter((m) => m["Match theo"] === "erpCode").length;
  const matchByName = matched.filter((m) => String(m["Match theo"]).startsWith("tên")).length;
  const havingDiff = matched.filter(
    (m) => typeof m["Lệch (Excel - DB)"] === "number" && m["Lệch (Excel - DB)"] !== 0,
  ).length;
  const havingNoContract = matched.filter(
    (m) => m["Lương cơ bản (DB - HĐ ACTIVE)"] === "(chưa có HĐ)",
  ).length;

  const summary = [
    { Mục: "Số NV trong Excel T3", "Giá trị": t3.size },
    { Mục: "Số NV trong Excel T4", "Giá trị": t4.size },
    { Mục: "Tổng NV Excel (T3 ∪ T4)", "Giá trị": excelMap.size },
    { Mục: "Tổng NV DB (ACTIVE/PROBATION/ON_LEAVE)", "Giá trị": dbEmployees.length },
    { Mục: "—", "Giá trị": "" },
    { Mục: "✅ Match được (cả Excel + DB)", "Giá trị": matched.length },
    { Mục: "   ↳ Match theo erpCode (chính xác)", "Giá trị": matchByErp },
    { Mục: "   ↳ Match theo tên (fallback, cần verify)", "Giá trị": matchByName },
    { Mục: "   ↳ Có lệch lương Excel ≠ DB", "Giá trị": havingDiff },
    { Mục: "   ↳ DB chưa có HĐ ACTIVE", "Giá trị": havingNoContract },
    { Mục: "—", "Giá trị": "" },
    { Mục: "📥 Trong Excel, CHƯA có DB (cần thêm)", "Giá trị": inExcelNotInDB.length },
    { Mục: "📤 Trong DB, KHÔNG có trong bảng lương (cần verify/xoá)", "Giá trị": inDBNotInExcel.length },
  ];

  // ── Xuất Excel ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matched), "Match (so sánh lương)");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inExcelNotInDB), "Excel có, DB chưa có");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inDBNotInExcel), "DB có, Excel không có");

  XLSX.writeFile(wb, OUTPUT);
  console.log("\n✅ Xuất file: " + OUTPUT);
  console.log("\n=== TÓM TẮT ===");
  for (const s of summary) console.log("  " + s.Mục + ": " + s["Giá trị"]);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
