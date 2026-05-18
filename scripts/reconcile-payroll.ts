// Đối soát kỳ lương ↔ file lương khách — tham số hoá theo month/year/file.
// Usage: npx tsx --env-file=.env scripts/reconcile-payroll.ts <month> <year> <file.xls>
// VD:    npx tsx --env-file=.env scripts/reconcile-payroll.ts 5 2026 "C:/Users/sontt/Downloads/Bảng lương 05.2026.xls"

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const [, , monthArg, yearArg, fileArg] = process.argv;
const MONTH = parseInt(monthArg, 10);
const YEAR = parseInt(yearArg, 10);
const F = fileArg;
if (!MONTH || !YEAR || !F) {
  console.error("Usage: npx tsx --env-file=.env scripts/reconcile-payroll.ts <month> <year> <file.xls>");
  process.exit(2);
}
const OUTPUT = `C:/Users/sontt/Desktop/Bao-cao-doi-soat-luong-T${MONTH}-${YEAR}.xlsx`;

interface FileNV {
  ma: string; name: string; deptText: string;
  mucChinh: number; kpi: number; responsibility: number; xangXe: number;
  bh32File: number;
}

function readFile(): FileNV[] {
  const wb = XLSX.readFile(F);
  const out: FileNV[] = [];
  // Chỉ đọc 2 sheet master, bỏ qua các sheet phụ
  for (const sn of ["Chi tiết lương", "Lương thuê ngoài"]) {
    const ws = wb.Sheets[sn]; if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
    // Detect cột BH 32% theo BHXH từ R6 (text "Tổng BH 32% theo BHXH")
    let bhCol = 88;
    for (let c = 80; c < 100; c++) {
      const h = String((data[6] || [])[c] ?? "").toLowerCase();
      if (h.includes("bh 32") && h.includes("bhxh")) { bhCol = c; break; }
    }
    // Data row: bỏ qua header rows (R0-R9). Tìm mã NV thật (≥ 6 chữ số) bắt đầu từ R10
    let count = 0;
    for (let r = 10; r < data.length; r++) {
      const ma = String(data[r][1] ?? "").trim();
      if (!/^\d{5,}$/.test(ma)) continue; // mã NV thật ≥ 5 chữ số (tránh STT)
      out.push({
        ma, name: String(data[r][2] ?? "").trim(), deptText: String(data[r][3] ?? "").trim(),
        mucChinh: Number(data[r][12]) || 0,
        kpi: Number(data[r][16]) || 0,
        responsibility: Number(data[r][18]) || 0,
        xangXe: Number(data[r][19]) || 0,
        bh32File: Number(data[r][bhCol]) || 0,
      });
      count++;
    }
    console.log(`  Sheet "${sn}": ${count} NV (bhCol=${bhCol})`);
  }
  return out;
}

async function main() {
  const fileRows = readFile();
  console.log(`Tổng file lương T3: ${fileRows.length} NV`);
  const byMa = new Map<string, FileNV>();
  for (const r of fileRows) if (!byMa.has(r.ma)) byMa.set(r.ma, r);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const period = await prisma.payrollPeriod.findFirst({
    where: { month: MONTH, year: YEAR },
    include: {
      records: {
        include: {
          employee: {
            include: {
              user: { select: { erpCode: true } },
              contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!period) { console.log("⚠️ Chưa có kỳ lương T${MONTH}/${YEAR}"); await prisma.$disconnect(); return; }
  console.log(`Kỳ lương T${MONTH}/${YEAR} (id ${period.id}): ${period.records.length} bản ghi\n`);

  // Load KPI override cho kỳ T3 (KPI thực tế đã dùng khi tính lương)
  const overrides = await prisma.payrollKpiOverride.findMany({
    where: { month: MONTH, year: YEAR },
    select: { employeeId: true, kpi: true, responsibility: true },
  });
  const overrideMap = new Map(overrides.map((o) => [o.employeeId, o]));

  const matched: any[] = [], dbNotInFile: any[] = [], fileNotInDb: any[] = [];
  const usedMa = new Set<string>();
  let sumDbGross = 0, sumDbNet = 0, sumDbBhEmp = 0;
  let sumFileMucChinh = 0, sumFileKpi = 0, sumFileResp = 0, sumFileBhEmp = 0;

  for (const rec of period.records) {
    const erp = rec.employee.user?.erpCode;
    const ct = rec.employee.contracts[0];
    const allw = (ct?.allowances as any) || {};
    sumDbGross += rec.grossSalary; sumDbNet += rec.netSalary;
    sumDbBhEmp += rec.bhxh + rec.bhyt + rec.bhtn;

    if (!erp) { dbNotInFile.push({ "Mã NV (DB)": rec.employee.code, "Họ tên": rec.employee.fullName, "Lý do": "không có erpCode" }); continue; }
    const f = byMa.get(erp);
    if (!f) { dbNotInFile.push({ "Mã NV (DB)": rec.employee.code, "Họ tên": rec.employee.fullName, erpCode: erp, "Lý do": "không có trong file lương T3" }); continue; }
    usedMa.add(erp);
    sumFileMucChinh += f.mucChinh; sumFileKpi += f.kpi; sumFileResp += f.responsibility;
    const fBhEmp = f.bh32File > 0 ? Math.round((f.bh32File / 32) * 10.5) : 0;
    sumFileBhEmp += fBhEmp;

    const ov = overrideMap.get(rec.employee.id);
    // KPI/PC TN ưu tiên override cho kỳ T3, fallback Contract.allowances
    const dbKpi = ov?.kpi ?? allw.kpi ?? 0;
    const dbResp = ov?.responsibility ?? allw.responsibility ?? 0;
    const baseDiff = (ct?.baseSalary || 0) - f.mucChinh;
    const kpiDiff = dbKpi - f.kpi;
    const respDiff = dbResp - f.responsibility;
    const fhFile = f.xangXe > 0;
    const fhDb = rec.employee.fuelHousingEligible;
    const dbBhEmp = rec.bhxh + rec.bhyt + rec.bhtn;
    const bhDiff = dbBhEmp - fBhEmp;

    const issues: string[] = [];
    // Ngưỡng 1 đồng để bỏ qua floating-point precision (file Excel có khi 27500000.000000001)
    if (Math.abs(baseDiff) >= 1) issues.push(`baseSalary lệch ${baseDiff.toLocaleString("vi-VN")}`);
    if (Math.abs(kpiDiff) >= 1) issues.push(`KPI lệch ${kpiDiff.toLocaleString("vi-VN")}`);
    if (Math.abs(respDiff) >= 1) issues.push(`PC TN lệch ${respDiff.toLocaleString("vi-VN")}`);
    if (fhFile !== fhDb) issues.push(`xăng xe DB:${fhDb ? "✓" : "✗"} vs file:${fhFile ? "✓" : "✗"}`);
    if (Math.abs(bhDiff) > 100) issues.push(`BH NLĐ lệch ${bhDiff.toLocaleString("vi-VN")}`);

    matched.push({
      "Mã NV (DB)": rec.employee.code, "Họ tên": rec.employee.fullName, erpCode: erp,
      "Mức chính (DB)": ct?.baseSalary || 0, "Mức chính (file)": f.mucChinh,
      "KPI (DB)": dbKpi, "KPI (file)": f.kpi,
      "PC TN (DB)": dbResp, "PC TN (file)": f.responsibility,
      "Xăng xe (DB)": fhDb ? "✓" : "—", "Xăng xe (file)": fhFile ? "✓" : "—",
      "Ngày công M3": rec.workDays, "OT giờ": rec.otHours,
      "Gross (DB)": rec.grossSalary, "Net (DB)": rec.netSalary,
      "BH NLĐ (DB)": dbBhEmp, "BH NLĐ (file ước)": fBhEmp,
      "TNCN (DB)": rec.tncn,
      "Vấn đề": issues.length > 0 ? issues.join(" | ") : "✓ khớp",
    });
  }
  for (const f of fileRows) if (!usedMa.has(f.ma)) {
    const e = await prisma.employee.findFirst({ where: { user: { erpCode: f.ma } }, select: { code: true, status: true } });
    fileNotInDb.push({ "Mã NV (file)": f.ma, "Họ tên": f.name, "Phòng ban": f.deptText, "Trạng thái DB": e ? `${e.code} (${e.status})` : "✗ không có DB" });
  }

  const issues = matched.filter((m) => m["Vấn đề"] !== "✓ khớp");
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  console.log(`📊 KẾT QUẢ:`);
  console.log(`  Matched: ${matched.length}`);
  console.log(`     ↳ ✓ khớp: ${matched.length - issues.length}`);
  console.log(`     ↳ ⚠️ có lệch: ${issues.length}`);
  console.log(`  ⚠️ DB có, file không có: ${dbNotInFile.length}`);
  console.log(`  ⚠️ File có, không vào kỳ: ${fileNotInDb.length}`);
  console.log(`\n--- TỔNG INPUT (matched ${matched.length}) ---`);
  console.log(`  Mức chính:      DB ${fmt(matched.reduce((s, m) => s + m["Mức chính (DB)"], 0))}    file ${fmt(sumFileMucChinh)}`);
  console.log(`  KPI:            DB ${fmt(matched.reduce((s, m) => s + m["KPI (DB)"], 0))}    file ${fmt(sumFileKpi)}`);
  console.log(`  PC TN:          DB ${fmt(matched.reduce((s, m) => s + m["PC TN (DB)"], 0))}        file ${fmt(sumFileResp)}`);
  console.log(`\n--- DB OUTPUT T3 (${period.records.length} NV) ---`);
  console.log(`  Tổng Gross:  ${fmt(sumDbGross)}`);
  console.log(`  Tổng Net:    ${fmt(sumDbNet)}`);
  console.log(`  Tổng BH NLĐ: ${fmt(sumDbBhEmp)}`);
  console.log(`  BH file ước: ${fmt(sumFileBhEmp)}`);

  const wb = XLSX.utils.book_new();
  const summary = [
    { Mục: "Kỳ", "Giá trị": "T${MONTH}/${YEAR}" },
    { Mục: "NV DB", "Giá trị": period.records.length },
    { Mục: "NV file lương", "Giá trị": fileRows.length },
    { Mục: "Matched", "Giá trị": matched.length },
    { Mục: "  ↳ ✓ khớp", "Giá trị": matched.length - issues.length },
    { Mục: "  ↳ ⚠️ lệch", "Giá trị": issues.length },
    { Mục: "DB có file không", "Giá trị": dbNotInFile.length },
    { Mục: "File có không vào kỳ", "Giá trị": fileNotInDb.length },
    { Mục: "—", "Giá trị": "" },
    { Mục: "Mức chính DB", "Giá trị": matched.reduce((s, m) => s + m["Mức chính (DB)"], 0) },
    { Mục: "Mức chính file", "Giá trị": sumFileMucChinh },
    { Mục: "KPI DB", "Giá trị": matched.reduce((s, m) => s + m["KPI (DB)"], 0) },
    { Mục: "KPI file", "Giá trị": sumFileKpi },
    { Mục: "PC TN DB", "Giá trị": matched.reduce((s, m) => s + m["PC TN (DB)"], 0) },
    { Mục: "PC TN file", "Giá trị": sumFileResp },
    { Mục: "—", "Giá trị": "" },
    { Mục: "Gross DB", "Giá trị": sumDbGross },
    { Mục: "Net DB", "Giá trị": sumDbNet },
    { Mục: "BH NLĐ DB", "Giá trị": sumDbBhEmp },
    { Mục: "BH NLĐ file ước", "Giá trị": sumFileBhEmp },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Tổng quan");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issues), `Có lệch (${issues.length})`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matched), `Matched (${matched.length})`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbNotInFile), `DB có file không (${dbNotInFile.length})`);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fileNotInDb), `File có không vào kỳ (${fileNotInDb.length})`);

  let outPath = OUTPUT;
  try { XLSX.writeFile(wb, outPath); }
  catch (e: any) { if (e.code === "EBUSY") { outPath = OUTPUT.replace(".xlsx", `_${Date.now()}.xlsx`); XLSX.writeFile(wb, outPath); } else throw e; }
  console.log(`\n✅ Xuất: ${outPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
