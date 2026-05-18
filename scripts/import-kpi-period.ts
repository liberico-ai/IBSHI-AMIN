// Import KPI override theo kỳ (month, year) từ file lương khách.
// Tạo/cập nhật PayrollKpiOverride per (employeeId, month, year).
// Khi tính kỳ lương đó, salary.service sẽ ưu tiên giá trị này thay vì Contract.allowances.kpi.
//
// Chạy:  npx tsx --env-file=.env scripts/import-kpi-period.ts <month> <year> <path-to-xls> [--apply]
// VD:    npx tsx --env-file=.env scripts/import-kpi-period.ts 3 2026 "C:/Users/sontt/Downloads/Bảng lương 03.2026 lần 2 (1).xls" --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const [, , monthArg, yearArg, fileArg, ...rest] = process.argv;
const APPLY = rest.includes("--apply") || process.argv.includes("--apply");
const MONTH = parseInt(monthArg, 10);
const YEAR = parseInt(yearArg, 10);
const FILE = fileArg;

if (!MONTH || !YEAR || !FILE) {
  console.error("Usage: npx tsx --env-file=.env scripts/import-kpi-period.ts <month> <year> <file.xls> [--apply]");
  process.exit(2);
}

interface FileNV { ma: string; name: string; kpi: number; responsibility: number; }

function readFile(): FileNV[] {
  const wb = XLSX.readFile(FILE);
  const out: FileNV[] = [];
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 10; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      if (!/^\d{5,}$/.test(ma)) continue;
      out.push({
        ma,
        name: String(data[r][2] ?? "").trim(),
        kpi: Number(data[r][16]) || 0,
        responsibility: Number(data[r][18]) || 0,
      });
    }
  }
  return out;
}

async function main() {
  console.log(`${APPLY ? "🚀 APPLY" : "🔍 DRY-RUN"} — Import KPI override T${MONTH}/${YEAR} từ ${FILE.split("/").pop()}`);
  const rows = readFile();
  console.log(`File: ${rows.length} NV`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const emps = await prisma.employee.findMany({
    where: { user: { erpCode: { in: rows.map((r) => r.ma) } } },
    select: { id: true, code: true, fullName: true, user: { select: { erpCode: true } } },
  });
  const byErp = new Map(emps.filter((e) => e.user?.erpCode).map((e) => [e.user!.erpCode!, e]));

  let created = 0, updated = 0, skipped = 0;
  const source = `import-file-luong-T${MONTH}-${YEAR}`;
  for (const r of rows) {
    const emp = byErp.get(r.ma);
    if (!emp) { skipped++; continue; }
    if (!APPLY) continue;
    const existing = await prisma.payrollKpiOverride.findUnique({
      where: { employeeId_month_year: { employeeId: emp.id, month: MONTH, year: YEAR } },
    });
    if (existing) {
      await prisma.payrollKpiOverride.update({
        where: { id: existing.id },
        data: { kpi: r.kpi, responsibility: r.responsibility, source },
      });
      updated++;
    } else {
      await prisma.payrollKpiOverride.create({
        data: { employeeId: emp.id, month: MONTH, year: YEAR, kpi: r.kpi, responsibility: r.responsibility, source },
      });
      created++;
    }
  }

  console.log(`\n📊 Kết quả:`);
  console.log(`  NV resolve: ${rows.length - skipped}/${rows.length}`);
  if (APPLY) {
    console.log(`  ✅ Tạo mới: ${created}`);
    console.log(`  ✅ Cập nhật: ${updated}`);
  } else {
    console.log(`  ⚠️ DRY-RUN — chạy lại với --apply để thực thi (sẽ tạo/cập nhật ${rows.length - skipped} overrides)`);
  }
  console.log(`  Skip (NV không có DB): ${skipped}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
