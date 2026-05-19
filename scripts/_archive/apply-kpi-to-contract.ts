// Fix cứng KPI thoả thuận vào Contract.allowances.kpi cho từng NV.
// Nguồn: PayrollKpiOverride (ưu tiên T4 > T3 — bản mới nhất).
//
// Sau khi chạy:
//   - Engine sẽ luôn dùng Contract.allowances.kpi (đã cố định) để tính Lương hiệu suất.
//   - Lương hiệu suất tháng X = Contract.allowances.kpi × workDays_tháng_X / 26.
//   - Không cần import KPI mỗi tháng nữa.
//   - PayrollKpiOverride giữ làm model + xoá data — chỗ trống cho M6.
//
// Chạy: npx tsx --env-file=.env scripts/apply-kpi-to-contract.ts          (dry-run)
//       npx tsx --env-file=.env scripts/apply-kpi-to-contract.ts --apply

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: { contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 } },
  });

  // Lấy KPI override (T4 ưu tiên > T3)
  const overridesT4 = await prisma.payrollKpiOverride.findMany({ where: { month: 4, year: 2026 } });
  const overridesT3 = await prisma.payrollKpiOverride.findMany({ where: { month: 3, year: 2026 } });
  const ovT4 = new Map(overridesT4.map((o) => [o.employeeId, o]));
  const ovT3 = new Map(overridesT3.map((o) => [o.employeeId, o]));

  let updated = 0, kept = 0, noOverride = 0;
  for (const emp of dbEmps) {
    const ct = emp.contracts[0]; if (!ct) continue;
    const ov = ovT4.get(emp.id) || ovT3.get(emp.id);
    if (!ov) { noOverride++; continue; }

    const oldAllw = (ct.allowances as Record<string, any> | null) || {};
    const oldKpi = oldAllw.kpi || 0;
    const oldResp = oldAllw.responsibility || 0;
    if (oldKpi === ov.kpi && oldResp === ov.responsibility) { kept++; continue; }

    const newAllw = { ...oldAllw, kpi: ov.kpi };
    if (ov.responsibility > 0) newAllw.responsibility = ov.responsibility;
    else delete newAllw.responsibility;

    const src = ovT4.has(emp.id) ? "T4" : "T3";
    console.log(`  ${emp.code} ${emp.fullName}: KPI ${oldKpi.toLocaleString("vi-VN")} → ${ov.kpi.toLocaleString("vi-VN")} (nguồn ${src})`);
    if (APPLY) {
      await prisma.contract.update({ where: { id: ct.id }, data: { allowances: newAllw } });
    }
    updated++;
  }

  console.log(`\n📊 KẾT QUẢ:`);
  console.log(`  ✅ Update KPI vào Contract: ${updated}`);
  console.log(`  ✓ Giữ nguyên (đã trùng): ${kept}`);
  console.log(`  ⚠️ Không có override (giữ KPI cũ trong HĐ): ${noOverride}`);

  if (APPLY) {
    // Xoá data PayrollKpiOverride — giữ model
    const del = await prisma.payrollKpiOverride.deleteMany({});
    console.log(`\n✓ Xoá ${del.count} PayrollKpiOverride records (giữ model trong schema cho M6 sau này)`);
    console.log("\n✅ HOÀN TẤT — Anh:");
    console.log("   1. Xoá kỳ T3 + T4 cũ trong UI");
    console.log("   2. Tạo lại kỳ T3 + T4 → engine tự tính KPI từ Contract.allowances.kpi");
  } else {
    console.log("\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
