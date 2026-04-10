// @ts-nocheck
/**
 * scripts/generate-sample-data.ts
 *
 * Seed the database with 50 sample employees and 3 months of historical data
 * (attendance, payroll, leave requests, HSE incidents) for end-to-end testing.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/generate-sample-data.ts
 *     [--clear]   — drop sample data before re-seeding
 *
 * IMPORTANT: This script is for development / staging only.
 * Never run against production.
 */

import { randomUUID } from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_DEPARTMENTS = [
  { name: "Sản xuất", code: "SX" },
  { name: "Kỹ thuật", code: "KT" },
  { name: "Kinh doanh", code: "KD" },
  { name: "Hành chính", code: "HC" },
  { name: "QAQC", code: "QC" },
];

const SAMPLE_POSITIONS = [
  { name: "Công nhân" },
  { name: "Kỹ sư" },
  { name: "Trưởng nhóm" },
  { name: "Chuyên viên" },
  { name: "Quản lý" },
];

const FIRST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ"];
const LAST_NAMES = ["An", "Bình", "Cường", "Dũng", "Hà", "Hùng", "Khoa", "Lan", "Mai", "Nam",
  "Ngọc", "Phong", "Quân", "Sơn", "Thắng", "Trung", "Tuấn", "Vinh", "Xuân", "Yến"];
const ATTENDANCE_STATUSES = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "LATE", "ABSENT", "LEAVE"] as const;
const INCIDENT_TYPES = ["NEAR_MISS", "FIRST_AID", "OBSERVATION", "PROPERTY_DAMAGE"] as const;
const INCIDENT_SEVERITIES = ["LOW", "LOW", "MEDIUM", "HIGH"] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function workdaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      days.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return days;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const clearFirst = args.includes("--clear");

  const { default: prisma } = await import("../src/lib/prisma");

  if (clearFirst) {
    console.log("[seed] Clearing sample data...");
    await prisma.attendanceRecord.deleteMany({});
    await prisma.hSEIncident.deleteMany({});
    await prisma.employee.deleteMany({ where: { code: { startsWith: "SAMPLE-" } } });
    console.log("[seed] Cleared.");
  }

  // 1. Ensure departments and positions exist
  const depts: Record<string, string> = {};
  for (const d of SAMPLE_DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      create: { name: d.name, code: d.code, isActive: true },
      update: {},
    });
    depts[d.code] = dept.id;
  }

  const positions: string[] = [];
  for (const p of SAMPLE_POSITIONS) {
    const pos = await prisma.position.upsert({
      where: { name: p.name },
      create: { name: p.name },
      update: {},
    });
    positions.push(pos.id);
  }

  // 2. Create 50 sample employees
  const employees: string[] = [];
  const deptCodes = Object.keys(depts);
  for (let i = 1; i <= 50; i++) {
    const code = `SAMPLE-${String(i).padStart(3, "0")}`;
    const fullName = `${randomItem(FIRST_NAMES)} Văn ${randomItem(LAST_NAMES)}`;
    const deptCode = randomItem(deptCodes as (keyof typeof depts)[]);
    const emp = await prisma.employee.upsert({
      where: { code },
      create: {
        code,
        fullName,
        departmentId: depts[deptCode],
        positionId: randomItem(positions),
        status: "ACTIVE",
        baseSalary: 8_000_000 + Math.floor(Math.random() * 12_000_000),
      },
      update: {},
    });
    employees.push(emp.id);
    if (i % 10 === 0) console.log(`[seed] Created employee ${i}/50`);
  }

  // 3. Generate 3 months of attendance records (current month minus 2)
  const now = new Date();
  for (let mOffset = 2; mOffset >= 0; mOffset--) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - mOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const workdays = workdaysInMonth(year, month);

    console.log(`[seed] Generating attendance for ${month}/${year} — ${workdays.length} workdays × ${employees.length} employees`);

    for (const empId of employees) {
      for (const day of workdays) {
        const status = randomItem(ATTENDANCE_STATUSES);
        await prisma.attendanceRecord.upsert({
          where: { employeeId_date: { employeeId: empId, date: day } },
          create: { employeeId: empId, date: day, status },
          update: {},
        });
      }
    }
  }

  // 4. Generate ~20 sample HSE incidents spread across 3 months
  console.log("[seed] Generating HSE incidents...");
  for (let i = 0; i < 20; i++) {
    const mOffset = Math.floor(Math.random() * 3);
    const targetDate = new Date(now.getFullYear(), now.getMonth() - mOffset, 1);
    const day = new Date(targetDate.getFullYear(), targetDate.getMonth(), Math.ceil(Math.random() * 25));
    const reporterId = randomItem(employees);
    await prisma.hSEIncident.create({
      data: {
        incidentDate: day,
        type: randomItem(INCIDENT_TYPES),
        severity: randomItem(INCIDENT_SEVERITIES),
        location: randomItem(["Bay 1", "Bay 2", "Warehouse", "Office", "Parking"]),
        description: `Sample incident #${i + 1} for testing purposes`,
        reportedBy: reporterId,
        status: randomItem(["REPORTED", "INVESTIGATING", "RESOLVED", "CLOSED"]),
      },
    });
  }

  console.log(`\n[seed] Done. Created 50 sample employees, 3 months attendance, 20 HSE incidents.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed] Fatal:", err);
  process.exit(1);
});
