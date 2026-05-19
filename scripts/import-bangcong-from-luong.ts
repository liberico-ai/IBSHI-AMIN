// Import attendance từ sheet "Bảng công" + "Thêm giờ" trong file lương khách (file lương lần 2)
// Tuân thủ 100% cách khách đếm:
//   "x"     → PRESENT (8h, +1 ngày công)
//   "al"    → ABSENT_APPROVED (phép có lương, +1 ngày công thanh toán)
//   "al/2"  → HALF_DAY (phép nửa ngày, +0.5)
//   "x/2"   → HALF_DAY (làm nửa ngày, +0.5)
//   "ul"    → ABSENT_UNAPPROVED (không phép, không lương, 0)
//   "ul/2"  → tương tự nhưng 0.5 nghỉ không phép
//   trống   → không tạo record (KHÔNG đếm)
//
// OT lấy từ sheet "Thêm giờ" — số giờ OT mỗi ngày.
//
// Chạy: npx tsx --env-file=.env scripts/import-bangcong-from-luong.ts <month> <year> <file.xls> [--apply]
// VD:   npx tsx --env-file=.env scripts/import-bangcong-from-luong.ts 3 2026 "C:/Users/sontt/Downloads/Bảng lương 03.2026 lần 2 (1).xls" --apply

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
  console.error("Usage: npx tsx --env-file=.env scripts/import-bangcong-from-luong.ts <month> <year> <file.xls> [--apply]");
  process.exit(2);
}

interface DayRec {
  ma: string; name: string; day: number; status: string; workHours: number; otHours: number;
}

function detectDayCols(data: any[][], headerStartRow: number, headerEndRow: number, expectedDays: number): Map<number, number> {
  // Tìm row có 1 chuỗi số liên tục → các cột chứa Excel date serial. Đếm số cột có giá trị số ≥ 40000.
  // Mapping: col đầu tiên → ngày 1, col cuối → ngày cuối tháng.
  for (let r = headerStartRow; r < headerEndRow; r++) {
    const row = data[r] || [];
    const cols: number[] = [];
    for (let c = 0; c < 50; c++) {
      const v = Number(row[c]);
      if (Number.isFinite(v) && v >= 40000 && v <= 60000) cols.push(c);
    }
    if (cols.length >= expectedDays - 1) {
      const m = new Map<number, number>();
      cols.slice(0, expectedDays).forEach((col, i) => m.set(i + 1, col));
      return m;
    }
  }
  return new Map();
}

function parseBangCong(wb: XLSX.WorkBook): Map<string, Map<number, { status: string; workHours: number; raw: string }>> {
  const ws = wb.Sheets["Bảng công"]; if (!ws) throw new Error('Không có sheet "Bảng công"');
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const daysInMonth = new Date(YEAR, MONTH, 0).getDate();
  const dayCol = detectDayCols(data, 5, 12, daysInMonth);
  if (dayCol.size === 0) throw new Error("Không tìm thấy day column header trong Bảng công");
  console.log(`  Bảng công: ${dayCol.size} day cols (d1=col${dayCol.get(1)}, d${daysInMonth}=col${dayCol.get(daysInMonth)})`);

  const result = new Map<string, Map<number, { status: string; workHours: number; raw: string }>>();
  const seen = new Set<string>();
  for (let r = 8; r < data.length; r++) {
    const ma = String(data[r][1] ?? "").trim();
    if (!/^\d{4,}$/.test(ma)) continue;
    if (seen.has(ma)) continue; // bỏ qua duplicate (Tổng cộng)
    seen.add(ma);
    const perDay = new Map<number, { status: string; workHours: number; raw: string }>();
    dayCol.forEach((colIdx, d) => {
      const raw = String(data[r][colIdx] ?? "").trim().toLowerCase();
      if (!raw || raw === "0") return; // ô trống → không đếm
      let status = "PRESENT", workHours = 0;
      // Mapping theo header file: al/l/cl/ml/wl/sl/co/mt = nghỉ có lương phép (tách riêng khỏi Lương HC)
      const paidLeaveCodes = ["al", "l", "cl", "ml", "wl", "sl", "co", "mt"];
      const isHalf = raw.endsWith("/2");
      const base = isHalf ? raw.slice(0, -2) : raw;
      if (base === "x") { status = isHalf ? "HALF_DAY" : "PRESENT"; workHours = isHalf ? 4 : 8; }
      else if (paidLeaveCodes.includes(base)) {
        // AL full: status=ABSENT_APPROVED, workHours=0 → 1 ngày phép
        // AL/2: status=ABSENT_APPROVED, workHours=4 → 0.5 ngày phép (workHours=4 dùng làm marker half-day)
        status = "ABSENT_APPROVED"; workHours = isHalf ? 4 : 0;
      }
      else if (base === "ul") { status = "ABSENT_UNAPPROVED"; workHours = 0; }
      else if (base === "ct") { status = "BUSINESS_TRIP"; workHours = isHalf ? 4 : 8; }
      else {
        // numeric? VD "8" hoặc "4"
        const num = parseFloat(raw);
        if (!isNaN(num) && num > 0) {
          workHours = num;
          status = num >= 7 ? "PRESENT" : "HALF_DAY";
        } else {
          // Token không biết → log + bỏ qua (không count)
          console.warn(`  ⚠️ ${ma} ngày ${d}: không hiểu giá trị "${raw}" — bỏ qua`);
          return;
        }
      }
      perDay.set(d, { status, workHours, raw });
    });
    if (perDay.size > 0) result.set(ma, perDay);
  }
  return result;
}

function parseThemGio(wb: XLSX.WorkBook): Map<string, Map<number, number>> {
  const ws = wb.Sheets["Thêm giờ"]; if (!ws) { console.warn('  ⚠️ Không có sheet "Thêm giờ" — bỏ qua OT'); return new Map(); }
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: true });
  const daysInMonth = new Date(YEAR, MONTH, 0).getDate();
  const dayCol = detectDayCols(data, 0, 12, daysInMonth);
  if (dayCol.size === 0) { console.warn("  ⚠️ Không tìm thấy day header trong Thêm giờ"); return new Map(); }
  console.log(`  Thêm giờ: ${dayCol.size} day cols (d1=col${dayCol.get(1)}, d${daysInMonth}=col${dayCol.get(daysInMonth)})`);

  const result = new Map<string, Map<number, number>>();
  const seen = new Set<string>();
  for (let r = 3; r < data.length; r++) {
    const ma = String(data[r][1] ?? "").trim();
    if (!/^\d{4,}$/.test(ma)) continue;
    if (seen.has(ma)) continue; // bỏ qua duplicate (file có dòng "Tổng cộng" copy mã ở cuối)
    seen.add(ma);
    const perDay = new Map<number, number>();
    dayCol.forEach((colIdx, d) => {
      const v = Number(data[r][colIdx]) || 0;
      if (v > 0) perDay.set(d, v);
    });
    if (perDay.size > 0) result.set(ma, perDay);
  }
  return result;
}

async function main() {
  console.log(`${APPLY ? "🚀 APPLY" : "🔍 DRY-RUN"} — Import attendance T${MONTH}/${YEAR} từ ${FILE.split("/").pop()}`);
  const wb = XLSX.readFile(FILE);

  const bc = parseBangCong(wb);
  const tg = parseThemGio(wb);
  console.log(`Bảng công: ${bc.size} NV | Thêm giờ: ${tg.size} NV`);

  // Tổng records
  let totalRecs = 0;
  const allMa = new Set<string>([...bc.keys(), ...tg.keys()]);
  for (const ma of allMa) totalRecs += (bc.get(ma)?.size ?? 0) + (tg.get(ma)?.size ?? 0);
  console.log(`Tổng records dự kiến: ${totalRecs} (gộp work + OT)`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const emps = await prisma.employee.findMany({
    where: { user: { erpCode: { in: [...allMa] } } },
    select: { id: true, code: true, user: { select: { erpCode: true } } },
  });
  const byErp = new Map(emps.filter((e) => e.user?.erpCode).map((e) => [e.user!.erpCode!, e.id]));
  const missing = [...allMa].filter((m) => !byErp.has(m));
  console.log(`Resolve: ${byErp.size}/${allMa.size} NV | thiếu: ${missing.length}${missing.length > 0 ? ` (${missing.slice(0, 5).join(",")}...)` : ""}`);

  if (!APPLY) {
    // Spot-check: in tổng workDays cho vài NV
    console.log("\n--- SPOT-CHECK workDays (dry-run) ---");
    for (const ma of ["190342", "190341", "190520", "190616"]) {
      const days = bc.get(ma);
      if (!days) continue;
      let wd = 0;
      for (const [, v] of days) {
        if (["PRESENT", "LATE", "BUSINESS_TRIP", "ABSENT_APPROVED"].includes(v.status)) wd += 1;
        else if (v.status === "HALF_DAY") wd += 0.5;
      }
      console.log(`  ${ma}: ${days.size} records, workDays = ${wd}`);
    }
    console.log("\n⚠️ DRY-RUN — chạy lại với --apply");
    await prisma.$disconnect(); return;
  }

  // Clear T4 attendance + insert
  const del = await prisma.attendanceRecord.deleteMany({
    where: { date: { gte: new Date(`${YEAR}-${String(MONTH).padStart(2, "0")}-01`), lt: new Date(`${YEAR}-${String(MONTH + 1).padStart(2, "0")}-01`) } },
  });
  console.log(`\n✓ Xoá ${del.count} AttendanceRecord T${MONTH} cũ`);

  // Xoá kỳ lương nếu có
  const period = await prisma.payrollPeriod.findFirst({ where: { month: MONTH, year: YEAR } });
  if (period) {
    await prisma.payrollRecord.deleteMany({ where: { periodId: period.id } });
    await prisma.payrollPeriod.delete({ where: { id: period.id } });
    console.log(`✓ Xoá kỳ lương T${MONTH}/${YEAR}`);
  }

  const session = await prisma.user.findFirst({ where: { role: "HR_ADMIN" }, select: { id: true } });
  const createdBy = session?.id || (await prisma.user.findFirst({ select: { id: true } }))!.id;

  let created = 0, skipped = 0;
  for (const [ma, days] of bc) {
    const eid = byErp.get(ma);
    if (!eid) { skipped += days.size; continue; }
    const otDays = tg.get(ma) || new Map();
    // Gộp work + OT per day
    const allDays = new Set<number>([...days.keys(), ...otDays.keys()]);
    for (const d of allDays) {
      const work = days.get(d);
      const ot = otDays.get(d) || 0;
      const date = new Date(`${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      await prisma.attendanceRecord.create({
        data: {
          employeeId: eid, date,
          status: (work?.status ?? "ABSENT_UNAPPROVED") as any,
          workHours: work?.workHours ?? 0,
          otHours: ot, createdBy,
        },
      });
      created++;
    }
  }
  // NV chỉ có OT, không có Bảng công
  for (const [ma, otDays] of tg) {
    if (bc.has(ma)) continue;
    const eid = byErp.get(ma); if (!eid) { skipped += otDays.size; continue; }
    for (const [d, oh] of otDays) {
      const date = new Date(`${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      await prisma.attendanceRecord.create({
        data: { employeeId: eid, date, status: "ABSENT_UNAPPROVED" as any, workHours: 0, otHours: oh, createdBy },
      });
      created++;
    }
  }
  console.log(`✓ Insert ${created} AttendanceRecord | skip ${skipped}`);
  console.log("\n✅ HOÀN TẤT — Anh vào M7 tạo lại kỳ T" + MONTH);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
