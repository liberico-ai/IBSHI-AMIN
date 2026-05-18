// Import từ file "Bảng lương 04.2026 (11.05.2026).xls":
//   - Contract.allowances.kpi          ← cột 16 (KPI)
//   - Contract.allowances.responsibility ← cột 18 (PC trách nhiệm; chỉ ai có > 0)
//   - Employee.fuelHousingEligible       ← cột 19 > 0 (PC xăng xe/nhà trọ — 200k tự động cấp)
//
// Match: file mã NV (cột 1) ↔ User.erpCode. Update Contract ACTIVE mới nhất.
//
// Chạy: npx tsx --env-file=.env scripts/import-kpi-allowances.ts          (dry-run)
//       npx tsx --env-file=.env scripts/import-kpi-allowances.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const F = "C:/Users/sontt/Downloads/HSNS và Lương/Bảng lương 04.2026 (11.05.2026).xls";
const OUTPUT = "C:/Users/sontt/Desktop/Bao-cao-import-KPI-PC.xlsx";

interface RowFile {
  ma: string; name: string; dept: string;
  mucChinh: number; kpi: number; responsibility: number; xangXe: number;
}

function readFile(): RowFile[] {
  const wb = XLSX.readFile(F);
  const out: RowFile[] = [];
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    for (let r = 9; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      if (!/^\d+$/.test(ma)) continue;
      out.push({
        ma, name: String(data[r][2] ?? "").trim(), dept: String(data[r][3] ?? "").trim(),
        mucChinh: Number(data[r][12]) || 0,
        kpi: Number(data[r][16]) || 0,
        responsibility: Number(data[r][18]) || 0,
        xangXe: Number(data[r][19]) || 0,
      });
    }
  }
  return out;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");

  const rows = readFile();
  console.log(`File lương: ${rows.length} NV`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const dbEmps = await prisma.employee.findMany({
    include: {
      user: { select: { erpCode: true } },
      contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 },
    },
  });
  const byErp = new Map(dbEmps.filter((e) => e.user?.erpCode).map((e) => [e.user!.erpCode!, e]));

  const updated: any[] = [];
  const noEmp: any[] = [];
  const noContract: any[] = [];

  for (const r of rows) {
    const emp = byErp.get(r.ma);
    if (!emp) { noEmp.push(r); continue; }
    const ct = emp.contracts[0];
    const fhEligible = r.xangXe > 0;
    if (!ct) {
      // Vẫn có thể update fuelHousingEligible
      if (APPLY) await prisma.employee.update({ where: { id: emp.id }, data: { fuelHousingEligible: fhEligible } });
      noContract.push({
        "Mã NV (DB)": emp.code, "Họ tên": emp.fullName, "erpCode": r.ma,
        "KPI file": r.kpi, "PC TN file": r.responsibility,
        "fuelHousingEligible": fhEligible, "Ghi chú": "không có HĐ ACTIVE — bỏ qua KPI/PC TN, chỉ set xăng xe",
      });
      continue;
    }
    const oldAllw = (ct.allowances as Record<string, any> | null) || {};
    const newAllw = { ...oldAllw, kpi: r.kpi };
    if (r.responsibility > 0) newAllw.responsibility = r.responsibility;
    else delete newAllw.responsibility; // xoá nếu file không có (theo "ai đc thì thêm")

    if (APPLY) {
      await prisma.contract.update({ where: { id: ct.id }, data: { allowances: newAllw } });
      if (emp.fuelHousingEligible !== fhEligible) {
        await prisma.employee.update({ where: { id: emp.id }, data: { fuelHousingEligible: fhEligible } });
      }
    }
    updated.push({
      "Mã NV (DB)": emp.code, "Họ tên": emp.fullName, "erpCode": r.ma, "Phòng ban (file)": r.dept,
      "Lương chính (file)": r.mucChinh, "Lương CB (DB)": ct.baseSalary,
      "KPI cũ": oldAllw.kpi || 0, "KPI mới": r.kpi,
      "PC trách nhiệm cũ": oldAllw.responsibility || 0, "PC trách nhiệm mới": r.responsibility,
      "Xăng xe (200k) cũ": emp.fuelHousingEligible ? "✓" : "—",
      "Xăng xe (200k) mới": fhEligible ? "✓" : "—",
    });
  }

  const withResp = updated.filter((u) => u["PC trách nhiệm mới"] > 0);
  const withFH = updated.filter((u) => u["Xăng xe (200k) mới"] === "✓");
  console.log(`\n📊 KẾT QUẢ:`);
  console.log(`  ✅ Update KPI + PC: ${updated.length} NV`);
  console.log(`     ↳ Có PC trách nhiệm > 0: ${withResp.length} NV (tổng ${withResp.reduce((s, x) => s + x["PC trách nhiệm mới"], 0).toLocaleString("vi-VN")} đ/tháng)`);
  console.log(`     ↳ Bật xăng xe 200k: ${withFH.length} NV`);
  console.log(`  ⚠️ NV trong file không có DB:    ${noEmp.length}`);
  console.log(`  ⚠️ NV không có HĐ ACTIVE:       ${noContract.length}`);

  // Output
  const wb = XLSX.utils.book_new();
  const summary = [
    { Mục: "Mode", "Giá trị": APPLY ? "APPLY" : "DRY-RUN" },
    { Mục: "NV trong file lương", "Giá trị": rows.length },
    { Mục: "✅ Update Contract+Employee", "Giá trị": updated.length },
    { Mục: "   ↳ Có PC trách nhiệm > 0", "Giá trị": withResp.length },
    { Mục: "   ↳ Bật xăng xe 200k", "Giá trị": withFH.length },
    { Mục: "⚠️ Không có DB", "Giá trị": noEmp.length },
    { Mục: "⚠️ Không có HĐ ACTIVE", "Giá trị": noContract.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(updated), "Đã update");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(withResp), "Có PC trách nhiệm");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(withFH), "Bật xăng xe 200k");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noEmp.map((r) => ({ "Mã NV": r.ma, "Họ tên": r.name, "Phòng ban": r.dept }))), "Không có trong DB");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noContract), "Không có HĐ ACTIVE");

  let outPath = OUTPUT;
  try { XLSX.writeFile(wb, outPath); }
  catch (e: any) { if (e.code === "EBUSY") { outPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`); XLSX.writeFile(wb, outPath); } else throw e; }
  console.log(`\n✅ Xuất: ${outPath}`);

  await prisma.$disconnect();
  console.log(APPLY ? "\n✅ HOÀN TẤT" : "\n⚠️ DRY-RUN — chạy lại với --apply để thực thi");
}

main().catch((e) => { console.error(e); process.exit(1); });
