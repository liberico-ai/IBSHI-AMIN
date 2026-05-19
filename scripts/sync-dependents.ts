// Sync Employee.dependents từ file lương khách (cột 72 "Người phụ thuộc" sheet "Chi tiết lương").
// Nhận 1 hoặc nhiều file qua CLI args. File sau ghi đè file trước (ưu tiên file gần đây nhất).
//
// Usage:
//   npx tsx --env-file=.env scripts/sync-dependents.ts <file1.xls> [<file2.xls> ...]             (dry-run)
//   npx tsx --env-file=.env scripts/sync-dependents.ts <file1.xls> [<file2.xls> ...] --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const FILES = process.argv.slice(2).filter((a) => a !== "--apply");

if (FILES.length === 0) {
  console.error("Usage: npx tsx --env-file=.env scripts/sync-dependents.ts <file1.xls> [<file2.xls> ...] [--apply]");
  console.error("  Truyền file mới nhất CUỐI cùng (sẽ ghi đè file trước).");
  process.exit(2);
}

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

  // Đọc tất cả file, gộp lại (file sau ghi đè file trước)
  const depMap = new Map<string, number>();
  for (const f of FILES) {
    const m = readDependents(f);
    console.log(`File "${f.split(/[\\/]/).pop()}": ${m.size} NV`);
    for (const [ma, dep] of m) depMap.set(ma, dep);
  }
  console.log(`Tổng NV sau gộp: ${depMap.size}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: { user: { select: { erpCode: true } } },
  });

  let updated = 0, kept = 0, notFound = 0;
  for (const emp of dbEmps) {
    const erp = emp.user?.erpCode; if (!erp) { notFound++; continue; }
    const newDep = depMap.get(erp);
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
