// Import attendance T4/2026 trực tiếp từ 2 file công vào DB (bypass UI).
// Dùng parser đã fix:
//   - Block logic (so sánh mã NV để phân biệt dòng NV mới vs dòng nối tiếp)
//   - OT row ưu tiên dòng có nhãn "Thêm giờ" ở col 40
// Xử lý đặc biệt: file công trực tiếp ghi sai mã 190839 cho Nguyễn Đức Hiếu (đúng là 190840)
//   → ép map 190839 (trực tiếp) sang erpCode 190840 = IBS-1065.
//
// Chạy: npx tsx --env-file=.env scripts/reconcile-attendance.ts          (dry-run)
//       npx tsx --env-file=.env scripts/reconcile-attendance.ts --apply

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");
const DIR = "C:/Users/sontt/Downloads/Công tháng 4/";
const YEAR = 2026, MONTH = 4;

interface Rec { employeeCode: string; date: string; workHours: number; otHours: number }

const codeOfRow = (r: any[]): string | null => {
  const c0 = String(r?.[0] ?? "").trim();
  const c1 = String(r?.[1] ?? "").trim();
  const c2 = String(r?.[2] ?? "").trim();
  if (/^\d{4,}$/.test(c0) && c1) return c0;
  if (/^\d{1,3}$/.test(c0) && /^\d{4,}$/.test(c1) && c2) return c1;
  if (!c0 && /^\d{4,}$/.test(c1) && c2) return c1;
  return null;
};

function parse(file: string, sheet: string, source: "TT" | "GT"): Rec[] {
  const wb = XLSX.readFile(DIR + file);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: true });
  // Day column map
  const dayColMap = new Map<number, number>();
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i] || [];
    const found = new Map<number, number>();
    for (let c = 0; c < r.length; c++) {
      const v = Number(r[c]);
      if (Number.isFinite(v) && v >= 1 && v <= 31 && Number.isInteger(v)) found.set(v, c);
    }
    if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
  }
  if (dayColMap.size === 0) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const r = rows[i] || [];
      const found = new Map<number, number>();
      for (let c = 0; c < r.length; c++) {
        const v = Number(r[c]);
        if (Number.isFinite(v) && v >= 40000 && v <= 60000) {
          const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
          if (dt.getUTCFullYear() === YEAR && dt.getUTCMonth() === MONTH - 1) found.set(dt.getUTCDate(), c);
        }
      }
      if (found.size >= 20) { found.forEach((c, d) => dayColMap.set(d, c)); break; }
    }
  }

  const records: Rec[] = [];
  for (let i = 0; i < rows.length; i++) {
    const code = codeOfRow(rows[i]); if (!code) continue;
    const workRow = rows[i];
    // Collect block
    const blockRows: any[][] = [];
    let j = i + 1;
    for (; j < rows.length; j++) {
      const nc = codeOfRow(rows[j]);
      if (nc && nc !== code) break;
      blockRows.push(rows[j]);
    }
    i = j - 1;
    // OT row: ưu tiên label "Thêm giờ" ở col 40
    let otRow: any[] | undefined;
    for (const cand of blockRows) {
      const lbl = String(cand?.[40] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (lbl.includes("them gi")) { otRow = cand; break; }
    }
    if (!otRow) {
      for (const cand of blockRows) {
        let has = false;
        dayColMap.forEach((c) => {
          const s = String(cand?.[c] ?? "").trim();
          if (/^-?\d+(\.\d+)?$/.test(s) && parseFloat(s) > 0) has = true;
        });
        if (has) { otRow = cand; break; }
      }
    }

    // ⚠️ Đặc biệt: file công trực tiếp ghi sai mã 190839 cho Nguyễn Đức Hiếu — ép sang 190840.
    let effCode = code;
    if (source === "TT" && code === "190839") effCode = "190840";

    dayColMap.forEach((colIdx, d) => {
      const whStr = String(workRow?.[colIdx] ?? "").trim();
      const wh = /^-?\d+(\.\d+)?$/.test(whStr) ? parseFloat(whStr) : 0;
      const otStr = String(otRow?.[colIdx] ?? "").trim();
      const oh = otRow && /^-?\d+(\.\d+)?$/.test(otStr) ? parseFloat(otStr) : 0;
      if (wh === 0 && oh === 0) return;
      records.push({
        employeeCode: effCode,
        date: `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        workHours: wh, otHours: oh,
      });
    });
  }
  return records;
}

async function main() {
  console.log(APPLY ? "🚀 APPLY MODE" : "🔍 DRY-RUN");
  const tt = parse("công t4 trực tiếp.xlsx", "TH công", "TT");
  const gt = parse("công t4 gián tiếp.xlsx", "T04-2026-GIÁN TIẾP VP", "GT");
  console.log(`Trực tiếp: ${tt.length} bản ghi | Gián tiếp: ${gt.length} bản ghi`);

  // Merge: gián tiếp overwrites trực tiếp cho cùng (code,date)
  const all = new Map<string, Rec>();
  for (const r of tt) all.set(`${r.employeeCode}|${r.date}`, r);
  for (const r of gt) all.set(`${r.employeeCode}|${r.date}`, r);
  const records = [...all.values()];
  console.log(`Tổng records sau merge: ${records.length}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Resolve code → employeeId
  const codes = [...new Set(records.map((r) => r.employeeCode))];
  const emps = await prisma.employee.findMany({
    where: { user: { erpCode: { in: codes } } },
    select: { id: true, code: true, user: { select: { erpCode: true } } },
  });
  const codeToId = new Map(emps.filter((e) => e.user?.erpCode).map((e) => [e.user!.erpCode!, e.id]));
  const missing = codes.filter((c) => !codeToId.has(c));
  console.log(`Resolve: ${codeToId.size}/${codes.length} NV | thiếu: ${missing.length} (${missing.slice(0, 5).join(",")}${missing.length > 5 ? "..." : ""})`);

  if (!APPLY) {
    console.log(`\n⚠️ DRY-RUN — sẽ xoá ${MONTH}/${YEAR} attendance hiện có và insert ${records.length} records mới. Chạy lại với --apply.`);
    await prisma.$disconnect(); return;
  }

  // Clear T4
  const del = await prisma.attendanceRecord.deleteMany({ where: { date: { gte: new Date(`${YEAR}-0${MONTH}-01`), lt: new Date(`${YEAR}-0${MONTH + 1}-01`) } } });
  console.log(`\n✓ Xoá ${del.count} AttendanceRecord T${MONTH}/${YEAR} cũ`);

  // Xoá kỳ lương nếu có
  const period = await prisma.payrollPeriod.findFirst({ where: { month: MONTH, year: YEAR } });
  if (period) {
    await prisma.payrollRecord.deleteMany({ where: { periodId: period.id } });
    await prisma.payrollPeriod.delete({ where: { id: period.id } });
    console.log(`✓ Xoá kỳ lương T${MONTH}/${YEAR}`);
  }

  // Insert
  const session = await prisma.user.findFirst({ where: { role: "HR_ADMIN" }, select: { id: true } });
  const createdBy = session?.id || (await prisma.user.findFirst({ select: { id: true } }))?.id || "system";
  let created = 0, skipped = 0;
  for (const r of records) {
    const eid = codeToId.get(r.employeeCode);
    if (!eid) { skipped++; continue; }
    const status: any = r.workHours >= 7 ? "PRESENT" : r.workHours > 0 ? "HALF_DAY" : "ABSENT_UNAPPROVED";
    await prisma.attendanceRecord.create({
      data: { employeeId: eid, date: new Date(r.date), workHours: r.workHours, otHours: r.otHours, status, createdBy },
    });
    created++;
  }
  console.log(`✓ Insert ${created} AttendanceRecord | skip ${skipped} (NV không có DB)`);

  await prisma.$disconnect();
  console.log("\n✅ HOÀN TẤT — Anh vào M7 tạo lại kỳ T4/2026.");
}

main().catch((e) => { console.error(e); process.exit(1); });
