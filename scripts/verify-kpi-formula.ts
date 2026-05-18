// Verify công thức KPI: KPI_thực_trả = KPI_thoả_thuận × workDays / 26
//
// Cách verify:
//   1. Đọc file lương: col 16 (KPI thoả thuận), col 22 (workDays), col 36 (KPI thực trả)
//   2. Tính lại = col16 × col22 / 26
//   3. So với col36 (KPI thực trả mà khách đã tính)
//   4. So workDays file vs DB
//   5. So KPI tính lại bằng DB workDays vs file col36

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const FILES = {
  3: "C:/Users/sontt/Downloads/Bảng lương 03.2026 lần 2 (1).xls",
  4: "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls",
} as const;

interface FileRow {
  ma: string; name: string;
  kpiAgreed: number;        // col 16 — KPI thoả thuận
  workDaysFile: number;     // col 22 — Tổng ngày công
  kpiActualFile: number;    // col 36 — KPI thực trả ("Lương hiệu suất (KPI)")
}

function readFile(month: number): FileRow[] {
  const wb = XLSX.readFile(FILES[month as 3 | 4]);
  const out: FileRow[] = [];
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 10; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      if (!/^\d{5,}$/.test(ma)) continue;
      out.push({
        ma, name: String(data[r][2] ?? "").trim(),
        kpiAgreed: Number(data[r][16]) || 0,
        workDaysFile: Number(data[r][22]) || 0,
        kpiActualFile: Number(data[r][36]) || 0,
      });
    }
  }
  return out;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const p = new PrismaClient({ adapter: new PrismaPg(pool) });

  for (const month of [3, 4]) {
    console.log(`\n${"=".repeat(90)}\n=== VERIFY KPI — Kỳ T${month}/2026 ===\n${"=".repeat(90)}`);
    const rows = readFile(month);
    console.log(`File: ${rows.length} NV\n`);

    // DB workDays + KPI override
    const period = await p.payrollPeriod.findFirst({ where: { month, year: 2026 } });
    if (!period) { console.log(`Không có kỳ T${month}`); continue; }
    const recs = await p.payrollRecord.findMany({
      where: { periodId: period.id },
      include: { employee: { include: { user: { select: { erpCode: true } } } } },
    });
    const overrides = await p.payrollKpiOverride.findMany({ where: { month, year: 2026 } });
    const dbByErp = new Map<string, { workDays: number; empId: string }>();
    for (const r of recs) {
      const erp = r.employee.user?.erpCode; if (!erp) continue;
      dbByErp.set(erp, { workDays: r.workDays, empId: r.employeeId });
    }
    const ovByEmp = new Map(overrides.map((o) => [o.employeeId, o.kpi]));

    // Spot-check 10 NV đầu có KPI > 0
    console.log("--- SPOT-CHECK 10 NV ĐẦU CÓ KPI > 0 ---");
    let n = 0;
    for (const f of rows) {
      if (f.kpiAgreed <= 0) continue;
      const db = dbByErp.get(f.ma);
      const dbKpiAgreed = db ? ovByEmp.get(db.empId) ?? 0 : 0;

      // 3 cách tính:
      const A_fileSelf = (f.kpiAgreed * f.workDaysFile) / 26; // file col16 × file col22 / 26
      const B_fileXdb  = db ? (f.kpiAgreed * db.workDays) / 26 : 0; // file col16 × DB workDays
      const C_dbXdb    = db ? (dbKpiAgreed * db.workDays) / 26 : 0; // DB KPI × DB workDays

      const diffA = A_fileSelf - f.kpiActualFile;
      const diffB = B_fileXdb - f.kpiActualFile;
      const diffC = C_dbXdb - f.kpiActualFile;

      console.log(`\n  ${f.ma} ${f.name}`);
      console.log(`    File: KPI_thoả_thuận=${f.kpiAgreed.toLocaleString("vi-VN")} | workDays=${f.workDaysFile} | KPI_thực_file=${Math.round(f.kpiActualFile).toLocaleString("vi-VN")}`);
      console.log(`    DB:   KPI_thoả_thuận=${dbKpiAgreed.toLocaleString("vi-VN")} | workDays=${db?.workDays ?? "—"}`);
      console.log(`    A) file × file ÷ 26 = ${Math.round(A_fileSelf).toLocaleString("vi-VN")}    chênh vs file actual: ${Math.round(diffA).toLocaleString("vi-VN")}`);
      console.log(`    B) file × DB   ÷ 26 = ${Math.round(B_fileXdb).toLocaleString("vi-VN")}    chênh vs file actual: ${Math.round(diffB).toLocaleString("vi-VN")}`);
      console.log(`    C) DB   × DB   ÷ 26 = ${Math.round(C_dbXdb).toLocaleString("vi-VN")}    chênh vs file actual: ${Math.round(diffC).toLocaleString("vi-VN")}`);

      n++;
      if (n >= 10) break;
    }

    // Tổng hợp toàn bộ
    console.log(`\n--- TỔNG TOÀN BỘ ${rows.length} NV ---`);
    let countA = 0, countB = 0, countC = 0, withMissing = 0;
    let sumA = 0, sumB = 0, sumC = 0, sumFile = 0;
    for (const f of rows) {
      if (f.kpiActualFile === 0) continue;
      const db = dbByErp.get(f.ma);
      if (!db) { withMissing++; continue; }
      const dbKpiAgreed = ovByEmp.get(db.empId) ?? 0;
      const A = Math.round((f.kpiAgreed * f.workDaysFile) / 26);
      const B = Math.round((f.kpiAgreed * db.workDays) / 26);
      const C = Math.round((dbKpiAgreed * db.workDays) / 26);
      const actual = Math.round(f.kpiActualFile);
      sumFile += actual; sumA += A; sumB += B; sumC += C;
      if (Math.abs(A - actual) <= 1) countA++;
      if (Math.abs(B - actual) <= 1) countB++;
      if (Math.abs(C - actual) <= 1) countC++;
    }
    console.log(`  Tổng KPI thực file: ${sumFile.toLocaleString("vi-VN")}`);
    console.log(`  A) file × file ÷ 26: tổng ${sumA.toLocaleString("vi-VN")} | khớp ${countA}/${rows.length}`);
    console.log(`  B) file × DB   ÷ 26: tổng ${sumB.toLocaleString("vi-VN")} | khớp ${countB}/${rows.length}`);
    console.log(`  C) DB   × DB   ÷ 26: tổng ${sumC.toLocaleString("vi-VN")} | khớp ${countC}/${rows.length}`);
    console.log(`  NV không có DB: ${withMissing}`);
  }
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
