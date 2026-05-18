// Đồng bộ Contract ACTIVE + Employee.fuelHousingEligible theo file lương khách:
//   - baseSalary       ← cột 12 (Mức chính)
//   - insuranceSalary  ← từ cột 88 (BH 32%) ÷ 32% nếu có, else = baseSalary
//   - allowances.kpi   ← cột 16
//   - allowances.responsibility ← cột 18 (xoá nếu = 0)
//   - fuelHousingEligible ← cột 19 > 0
//
// Match theo erpCode. Chỉ in những NV có thay đổi.
//
// Chạy: npx tsx --env-file=.env scripts/sync-payroll-from-file.ts          (dry-run)
//       npx tsx --env-file=.env scripts/sync-payroll-from-file.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const F = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";

interface FileNV {
  ma: string; name: string;
  mucChinh: number; kpi: number; responsibility: number; xangXe: number;
  bh32File: number;
}

function readFile(): FileNV[] {
  const wb = XLSX.readFile(F);
  const out: FileNV[] = [];
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 9; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      if (!/^\d{4,}$/.test(ma)) continue;
      out.push({
        ma, name: String(data[r][2] ?? "").trim(),
        mucChinh: Number(data[r][12]) || 0,
        kpi: Number(data[r][16]) || 0,
        responsibility: Number(data[r][18]) || 0,
        xangXe: Number(data[r][19]) || 0,
        bh32File: Number(data[r][88]) || 0,
      });
    }
  }
  return out;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");
  const rows = readFile();
  const byMa = new Map(rows.map((r) => [r.ma, r]));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // ── B1. Dedupe HĐ ACTIVE: NV có >1 HĐ ACTIVE → giữ mới nhất, EXPIRE còn lại ──
  console.log("\n── B1. Dedupe HĐ ACTIVE ──");
  const empsAll = await prisma.employee.findMany({
    include: { contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } } },
  });
  let dedupeCount = 0;
  for (const emp of empsAll) {
    if (emp.contracts.length <= 1) continue;
    const [keep, ...drop] = emp.contracts;
    console.log(`  ${emp.code} ${emp.fullName}: giữ HĐ "${keep.contractNumber}" (${keep.startDate.toISOString().slice(0, 10)}), EXPIRE ${drop.length} HĐ cũ: ${drop.map((c) => c.contractNumber).join(", ")}`);
    if (APPLY) {
      for (const c of drop) {
        await prisma.contract.update({ where: { id: c.id }, data: { status: "EXPIRED" } });
        dedupeCount++;
      }
    } else {
      dedupeCount += drop.length;
    }
  }
  console.log(`  → ${dedupeCount} HĐ sẽ EXPIRED${APPLY ? " (đã apply)" : ""}`);

  // ── B2. Sync Contract + Employee theo file ──
  console.log("\n── B2. Sync Contract + Employee.fuelHousingEligible theo file ──");
  const dbEmps = await prisma.employee.findMany({
    include: {
      user: { select: { erpCode: true } },
      contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 },
    },
  });

  let updContract = 0, updEmp = 0;
  const changes: any[] = [];

  for (const emp of dbEmps) {
    const erp = emp.user?.erpCode; if (!erp) continue;
    const f = byMa.get(erp); if (!f) continue;
    const ct = emp.contracts[0]; if (!ct) continue;

    const oldAllw = (ct.allowances as Record<string, any> | null) || {};
    const newBase = f.mucChinh;
    const newIns = f.bh32File > 0 ? Math.round(f.bh32File / 0.32) : f.mucChinh;
    const newAllw: Record<string, any> = { ...oldAllw, kpi: f.kpi };
    if (f.responsibility > 0) newAllw.responsibility = f.responsibility;
    else delete newAllw.responsibility;
    const newFh = f.xangXe > 0;

    const baseChanged = ct.baseSalary !== newBase;
    const insChanged = (ct.insuranceSalary || ct.baseSalary) !== newIns;
    const kpiChanged = (oldAllw.kpi || 0) !== f.kpi;
    const respChanged = (oldAllw.responsibility || 0) !== f.responsibility;
    const fhChanged = emp.fuelHousingEligible !== newFh;

    if (!baseChanged && !insChanged && !kpiChanged && !respChanged && !fhChanged) continue;

    const diffs: string[] = [];
    if (baseChanged) diffs.push(`baseSalary ${ct.baseSalary.toLocaleString("vi-VN")} → ${newBase.toLocaleString("vi-VN")}`);
    if (insChanged) diffs.push(`insuranceSalary ${(ct.insuranceSalary || ct.baseSalary).toLocaleString("vi-VN")} → ${newIns.toLocaleString("vi-VN")}`);
    if (kpiChanged) diffs.push(`KPI ${(oldAllw.kpi || 0).toLocaleString("vi-VN")} → ${f.kpi.toLocaleString("vi-VN")}`);
    if (respChanged) diffs.push(`PC TN ${(oldAllw.responsibility || 0).toLocaleString("vi-VN")} → ${f.responsibility.toLocaleString("vi-VN")}`);
    if (fhChanged) diffs.push(`xăng xe ${emp.fuelHousingEligible ? "✓" : "—"} → ${newFh ? "✓" : "—"}`);

    console.log(`  ${emp.code} ${emp.fullName} (erpCode ${erp}): ${diffs.join(" | ")}`);
    changes.push({ code: emp.code, name: emp.fullName, erpCode: erp, diffs: diffs.join(" | ") });

    if (APPLY) {
      if (baseChanged || insChanged || kpiChanged || respChanged) {
        await prisma.contract.update({
          where: { id: ct.id },
          data: { baseSalary: newBase, insuranceSalary: newIns, allowances: newAllw },
        });
        updContract++;
      }
      if (fhChanged) {
        await prisma.employee.update({ where: { id: emp.id }, data: { fuelHousingEligible: newFh } });
        updEmp++;
      }
    }
  }

  console.log(`\n📊 Tổng: ${changes.length} NV có thay đổi`);
  if (APPLY) console.log(`  ✅ Đã update ${updContract} Contract + ${updEmp} Employee.fuelHousingEligible`);
  console.log(APPLY
    ? "\n✅ HOÀN TẤT — anh xoá kỳ T4 + re-import file công trực tiếp + tạo lại kỳ"
    : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
