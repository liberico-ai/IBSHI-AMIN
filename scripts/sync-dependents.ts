// Sync Employee.dependents từ file lương khách (cột 72 "Người phụ thuộc" sheet "Chi tiết lương").
// Ưu tiên T4 (mới nhất) > T3.
//
// Chạy: npx tsx --env-file=.env scripts/sync-dependents.ts          (dry-run)
//       npx tsx --env-file=.env scripts/sync-dependents.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

function readDependents(file: string): Map<string, number> {
  const wb = XLSX.readFile(file);
  const out = new Map<string, number>();
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const d = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 10; r < d.length; r++) {
      const ma = String(d[r][1] ?? "").trim();
      if (!/^\d{5,}$/.test(ma) || out.has(ma)) continue;
      const dep = Number(d[r][72]) || 0;
      out.set(ma, dep);
    }
  }
  return out;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY" : "🔍 DRY-RUN");

  const depT4 = readDependents("C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls");
  const depT3 = readDependents("C:/Users/sontt/Downloads/Bảng lương 03.2026 lần 2 (1).xls");
  console.log(`File T4: ${depT4.size} NV | File T3: ${depT3.size} NV`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: { user: { select: { erpCode: true } } },
  });

  let updated = 0, kept = 0, notFound = 0;
  for (const emp of dbEmps) {
    const erp = emp.user?.erpCode; if (!erp) { notFound++; continue; }
    const newDep = depT4.get(erp) ?? depT3.get(erp);
    if (newDep === undefined) { notFound++; continue; }
    if (emp.dependents === newDep) { kept++; continue; }
    console.log(`  ${emp.code} ${emp.fullName} (${erp}): dependents ${emp.dependents} → ${newDep}`);
    if (APPLY) await prisma.employee.update({ where: { id: emp.id }, data: { dependents: newDep } });
    updated++;
  }
  console.log(`\n📊 Update: ${updated} | Giữ nguyên: ${kept} | Không có trong file: ${notFound}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
