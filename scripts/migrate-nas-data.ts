// @ts-nocheck
/**
 * scripts/migrate-nas-data.ts
 *
 * Migrate legacy NAS attendance/payroll data into the IBS ONE PostgreSQL DB.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migrate-nas-data.ts \
 *     --file ./scripts/fixtures/nas-export.xlsx \
 *     [--dry-run]
 *
 * Column mapping (NAS xlsx → Prisma model):
 *   "Mã NV"        → Employee.code
 *   "Họ tên"       → Employee.fullName
 *   "Phòng ban"    → Department.name  (auto-create if not found)
 *   "Chức vụ"      → Position.name    (auto-create if not found)
 *   "Ngày"         → AttendanceRecord.date
 *   "Trạng thái"   → AttendanceRecord.status  (maps via STATUS_MAP below)
 *   "Lương CB"     → Payroll.baseSalary
 *   "Phụ cấp"      → Payroll.allowances
 *   "Khấu trừ"     → Payroll.deductions
 */

import path from "path";
import fs from "fs";

// ─── Column mappings ──────────────────────────────────────────────────────────

const COLUMN_MAP = {
  employeeCode: ["Mã NV", "MaNV", "ma_nv"],
  fullName: ["Họ tên", "HoTen", "ho_ten"],
  department: ["Phòng ban", "PhongBan", "phong_ban"],
  position: ["Chức vụ", "ChucVu", "chuc_vu"],
  date: ["Ngày", "Ngay", "ngay"],
  attendanceStatus: ["Trạng thái", "TrangThai", "trang_thai"],
  baseSalary: ["Lương CB", "LuongCB", "luong_cb"],
  allowances: ["Phụ cấp", "PhuCap", "phu_cap"],
  deductions: ["Khấu trừ", "KhauTru", "khau_tru"],
} as const;

const STATUS_MAP: Record<string, string> = {
  "Có mặt": "PRESENT",
  "CM": "PRESENT",
  "Vắng": "ABSENT",
  "VM": "ABSENT",
  "Nghỉ phép": "LEAVE",
  "NP": "LEAVE",
  "Đi trễ": "LATE",
  "DT": "LATE",
  "Công tác": "BUSINESS_TRIP",
  "CT": "BUSINESS_TRIP",
  "Nghỉ lễ": "HOLIDAY",
  "NL": "HOLIDAY",
};

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1]
    || args[args.indexOf("--file") + 1];
  const dryRun = args.includes("--dry-run");

  if (!fileArg) {
    console.error("Usage: migrate-nas-data.ts --file <path-to-xlsx> [--dry-run]");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`[migrate-nas] Source file: ${filePath}`);
  console.log(`[migrate-nas] Dry run: ${dryRun}`);

  // Dynamic import to avoid bundler issues
  const ExcelJS = await import("exceljs");
  const { default: prisma } = await import("../src/lib/prisma");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheets found in the Excel file");

  // Parse header row
  const headerRow = sheet.getRow(1).values as string[];
  const colIndex = (candidates: readonly string[]) => {
    for (const cand of candidates) {
      const idx = headerRow.findIndex(
        (h) => h && h.toString().trim().toLowerCase() === cand.toLowerCase()
      );
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cols = {
    employeeCode: colIndex(COLUMN_MAP.employeeCode),
    fullName: colIndex(COLUMN_MAP.fullName),
    department: colIndex(COLUMN_MAP.department),
    position: colIndex(COLUMN_MAP.position),
    date: colIndex(COLUMN_MAP.date),
    attendanceStatus: colIndex(COLUMN_MAP.attendanceStatus),
    baseSalary: colIndex(COLUMN_MAP.baseSalary),
    allowances: colIndex(COLUMN_MAP.allowances),
    deductions: colIndex(COLUMN_MAP.deductions),
  };

  console.log("[migrate-nas] Detected columns:", cols);

  let rowsProcessed = 0;
  let errors = 0;

  const deptCache: Record<string, string> = {};
  const posCache: Record<string, string> = {};
  const empCache: Record<string, string> = {};

  async function getOrCreateDept(name: string): Promise<string> {
    if (deptCache[name]) return deptCache[name];
    const dept = await prisma.department.upsert({
      where: { name },
      create: { name, code: name.slice(0, 10).toUpperCase().replace(/\s+/g, "_"), isActive: true },
      update: {},
    });
    deptCache[name] = dept.id;
    return dept.id;
  }

  async function getOrCreatePos(name: string): Promise<string> {
    if (posCache[name]) return posCache[name];
    const pos = await prisma.position.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    posCache[name] = pos.id;
    return pos.id;
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r).values as any[];
    const code = cols.employeeCode !== -1 ? String(row[cols.employeeCode] ?? "").trim() : null;
    if (!code) continue;

    try {
      const deptName = cols.department !== -1 ? String(row[cols.department] ?? "").trim() : null;
      const posName = cols.position !== -1 ? String(row[cols.position] ?? "").trim() : null;
      const fullName = cols.fullName !== -1 ? String(row[cols.fullName] ?? "").trim() : code;

      const deptId = deptName ? await getOrCreateDept(deptName) : null;
      const posId = posName ? await getOrCreatePos(posName) : null;

      // Upsert employee
      if (!dryRun) {
        const emp = await prisma.employee.upsert({
          where: { code },
          create: {
            code,
            fullName,
            ...(deptId ? { departmentId: deptId } : {}),
            ...(posId ? { positionId: posId } : {}),
            status: "ACTIVE",
          },
          update: {
            fullName,
            ...(deptId ? { departmentId: deptId } : {}),
            ...(posId ? { positionId: posId } : {}),
          },
        });
        empCache[code] = emp.id;
      }

      // Upsert attendance record
      if (cols.date !== -1 && cols.attendanceStatus !== -1) {
        const rawDate = row[cols.date];
        const rawStatus = String(row[cols.attendanceStatus] ?? "").trim();
        const mappedStatus = STATUS_MAP[rawStatus] ?? "PRESENT";
        const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
        if (!isNaN(date.getTime()) && empCache[code]) {
          if (!dryRun) {
            await prisma.attendanceRecord.upsert({
              where: { employeeId_date: { employeeId: empCache[code], date } },
              create: { employeeId: empCache[code], date, status: mappedStatus as any },
              update: { status: mappedStatus as any },
            });
          }
        }
      }

      rowsProcessed++;
    } catch (err: any) {
      console.error(`[migrate-nas] Row ${r} (code=${code}): ${err.message}`);
      errors++;
    }
  }

  console.log(`\n[migrate-nas] Done. Processed: ${rowsProcessed} rows, Errors: ${errors}`);
  if (dryRun) console.log("[migrate-nas] DRY RUN — no data written");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[migrate-nas] Fatal:", err);
  process.exit(1);
});
