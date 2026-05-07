import prisma from "@/lib/prisma";
import { calculateSalary, type SalaryInput } from "@/lib/salary-calc";
import { SALARY_CONFIG, INSURANCE_RATES } from "@/lib/constants";

// ─── Constants (legacy lookup theo role/team — có thể override ở UI) ──────────

const SALARY_BASE_UNIT = 730_000; // Mức lương cơ sở để tính từ salaryGrade × salaryCoefficient

const RESPONSIBILITY_ALLOWANCE: Record<string, number> = {
  TEAM_LEAD: SALARY_CONFIG.TEAM_LEAD_ALLOWANCE,
  MANAGER: SALARY_CONFIG.MANAGER_ALLOWANCE,
  HR_ADMIN: SALARY_CONFIG.MANAGER_ALLOWANCE,
  BOM: SALARY_CONFIG.MANAGER_ALLOWANCE,
  EMPLOYEE: 0,
};

// ─── TNCN re-export (backwards compat — vẫn dùng được nơi khác) ─────────────

export { calcTNCN } from "@/lib/salary-calc";

// ─── Core calculation ──────────────────────────────────────────────────────
// Pipeline:
//   M3 (AttendanceRecord + LeaveRequest + OTRequest) ──┐
//   M1 (Contract.baseSalary)                            ├─► calculateSalary()
//   PieceRateRecord (lương khoán theo tổ × DA)         ─┘     (lib/salary-calc.ts)
//                                                              ↓
//                                                       PayrollRecord rows

export async function calculatePayrollForPeriod(periodId: string) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw Object.assign(new Error("Payroll period not found"), { code: "PERIOD_NOT_FOUND" });
  if (period.status === "APPROVED") throw Object.assign(new Error("Period already approved"), { code: "PERIOD_ALREADY_APPROVED" });

  const startDate = new Date(period.year, period.month - 1, 1);
  const endDate = new Date(period.year, period.month, 0, 23, 59, 59);

  // M3: Bảng chấm công đã import (vân tay khối gián tiếp + khuôn mặt khối trực tiếp)
  const attendanceData = await prisma.attendanceRecord.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { employeeId: true, status: true, otHours: true, date: true },
  });

  // CHỈ tính lương cho NV CÓ DỮ LIỆU CHẤM CÔNG trong tháng
  // (theo spec: "hiển thị bảng lương của tất cả NV có chấm công đã import vào M3")
  const employeeIdsWithAttendance = Array.from(
    new Set(attendanceData.map((a) => a.employeeId))
  );

  if (employeeIdsWithAttendance.length === 0) {
    throw Object.assign(
      new Error(
        "Chưa có dữ liệu chấm công cho tháng này. Vui lòng import bảng công ở module M3 - Chấm công trước khi tính lương."
      ),
      { code: "NO_ATTENDANCE_DATA" }
    );
  }

  const employees = await prisma.employee.findMany({
    where: {
      id: { in: employeeIdsWithAttendance },
      status: { in: ["ACTIVE", "PROBATION"] },
    },
    include: {
      contracts: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
      user: { select: { role: true } },
      team: { select: { id: true } },
    },
  });

  // M3: OT đã được duyệt
  const otData = await prisma.oTRequest.findMany({
    where: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
    select: { employeeId: true, hours: true, otRate: true },
  });

  // M3: Nghỉ phép đã duyệt — phân loại có lương vs không lương
  const leaveData = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { employeeId: true, leaveType: true, totalDays: true },
  });

  // Lương khoán (M7 piece-rate) theo tổ × tháng (Phase 2 sẽ mở rộng theo công đoạn)
  const pieceRateData = await prisma.pieceRateRecord.findMany({
    where: { month: period.month, year: period.year },
    include: { members: { select: { id: true } } },
  });

  // ── Build lookup maps ──

  // 4 — workDaysHC (tính từ AttendanceRecord, các status PRESENT/LATE/CT đều +1, HALF_DAY +0.5)
  const workDaysMap: Record<string, number> = {};
  for (const a of attendanceData) {
    if (!workDaysMap[a.employeeId]) workDaysMap[a.employeeId] = 0;
    if (["PRESENT", "LATE", "BUSINESS_TRIP"].includes(a.status)) workDaysMap[a.employeeId] += 1;
    else if (a.status === "HALF_DAY") workDaysMap[a.employeeId] += 0.5;
  }

  // 5 — Phân loại OT — gộp 2 nguồn:
  //   (a) AttendanceRecord.otHours (từ import M3 — phân loại theo thứ trong tuần)
  //   (b) OTRequest đã APPROVED (đơn OT cá nhân — phân loại theo otRate)
  const otMap: Record<string, { weekday: number; sunday: number; holiday: number }> = {};

  // (a) Từ AttendanceRecord — date.getDay() === 0 → CN, else → ngày thường
  // (Không phân biệt ngày Lễ ở phase này — sẽ làm Phase 2 với holiday calendar)
  for (const a of attendanceData) {
    if (!a.otHours || a.otHours <= 0) continue;
    if (!otMap[a.employeeId]) otMap[a.employeeId] = { weekday: 0, sunday: 0, holiday: 0 };
    const dow = new Date(a.date).getDay();
    if (dow === 0) otMap[a.employeeId].sunday += a.otHours;       // Chủ nhật
    else otMap[a.employeeId].weekday += a.otHours;                 // Ngày thường (T2-T7)
  }

  // (b) Từ OTRequest — bù thêm nếu có (vd OT ngày Lễ chỉ track ở đây)
  for (const o of otData) {
    if (!otMap[o.employeeId]) otMap[o.employeeId] = { weekday: 0, sunday: 0, holiday: 0 };
    if (o.otRate >= 3.0) otMap[o.employeeId].holiday += o.hours;
    else if (o.otRate >= 2.0) otMap[o.employeeId].sunday += o.hours;
    else otMap[o.employeeId].weekday += o.hours;
  }

  // 6 — Công chế độ (phép/lễ/TNLĐ) | 7.1 — Nghỉ không lương
  const policyMap: Record<string, number> = {};
  const unpaidMap: Record<string, number> = {};
  for (const l of leaveData) {
    if (l.leaveType === "UNPAID") {
      unpaidMap[l.employeeId] = (unpaidMap[l.employeeId] || 0) + l.totalDays;
    } else {
      policyMap[l.employeeId] = (policyMap[l.employeeId] || 0) + l.totalDays;
    }
  }

  // 10 — Lương khoán: chia đều theo memberCount (Phase 2 sẽ chia theo công đi làm)
  const pieceRateMap: Record<string, number> = {};
  for (const pr of pieceRateData) {
    const perMember = pr.memberCount > 0 ? Math.round(pr.totalAmount / pr.memberCount) : 0;
    for (const member of pr.members) {
      pieceRateMap[member.id] = (pieceRateMap[member.id] || 0) + perMember;
    }
  }

  // ── Tính lương cho từng NV (dùng calculateSalary từ lib/salary-calc.ts) ──

  const records: {
    periodId: string; employeeId: string; standardDays: number; workDays: number;
    otHours: number; baseSalary: number; pieceRateSalary: number; hazardAllowance: number;
    responsibilityAllow: number; mealAllowance: number; otherIncome: number; otPay: number;
    grossSalary: number; bhxh: number; bhyt: number; bhtn: number; tncn: number;
    deductions: number; netSalary: number;
  }[] = [];

  const missingContractEmployees: { code: string; fullName: string }[] = [];
  const withContractEmployees: { code: string; fullName: string; baseSalary: number }[] = [];

  for (const emp of employees) {
    const contract = emp.contracts[0];

    // Lương cơ bản (2.1) — ưu tiên salaryGrade × coefficient → contract → 0 (default)
    let baseSalary = 0;
    if (emp.salaryGrade && emp.salaryCoefficient) {
      baseSalary = Math.round(emp.salaryGrade * emp.salaryCoefficient * SALARY_BASE_UNIT);
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary });
    } else if (contract) {
      baseSalary = contract.baseSalary;
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary });
    } else {
      // Không có HĐ active và cũng không có salaryGrade → vẫn tạo record
      // để HR thấy NV nào cần bổ sung HĐ. baseSalary = 0 → lương = 0.
      missingContractEmployees.push({ code: emp.code, fullName: emp.fullName });
    }

    const workDaysHC = workDaysMap[emp.id] || 0;
    const ot = otMap[emp.id] || { weekday: 0, sunday: 0, holiday: 0 };
    const workDaysPolicy = policyMap[emp.id] || 0;
    const workDaysUnpaid = unpaidMap[emp.id] || 0;
    const pieceRateSalary = pieceRateMap[emp.id] || 0;

    // Build SalaryInput theo spec IBSHI
    const input: SalaryInput = {
      // Hợp đồng (Phase 1: phụ cấp 2.2 chưa có data → default 0, HR override sau)
      baseSalary,
      phoneAllowance: 0,
      fuelAllowance: 0,
      housingAllowance: 0,
      kpiAllowance: 0,
      // Bổ sung (3.1 theo role; 3.2 chưa có data distance/province)
      responsibilityAllowance: RESPONSIBILITY_ALLOWANCE[emp.user.role] || 0,
      distanceToOfficeKm: 0,
      isOutOfProvince: false,
      dependentsCount: emp.dependents || 0,
      // Số công (từ M3)
      workDaysHC,
      otHoursWeekday: ot.weekday,
      otHoursWeekdayNight: 0,         // chưa tách ngày/đêm — Phase 2
      otHoursSunday: ot.sunday,
      otHoursSundayNight: 0,
      otHoursHoliday: ot.holiday,
      otHoursHolidayNight: 0,
      workDaysPolicy,
      workDaysUnpaid,
      workDaysLate: 0,                 // chưa có cột đi muộn — Phase 2
      // Lương khoán
      pieceRateSalary,
      companyServesMealOnSunday: false,
    };

    const out = calculateSalary(input);

    // Map output → existing PayrollRecord schema
    // Note: schema chưa có đủ fields theo spec mới. Phase 2 sẽ migrate.
    // Tạm map các trường chính:
    //   mealAllowance → ăn ca OT (mục 12)
    //   otherIncome   → PC xăng nhà trọ (mục 3.2)
    //   deductions    → đi muộn (mục 7.2)
    //   bhxh/bhyt/bhtn → split 8% / 1.5% / 1% (tổng 10.5% theo spec)
    const bhxhBase = Math.min(baseSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
    const totalOtHours = ot.weekday + ot.sunday + ot.holiday;

    records.push({
      periodId,
      employeeId: emp.id,
      standardDays: SALARY_CONFIG.STANDARD_WORK_DAYS,
      workDays: workDaysHC,
      otHours: totalOtHours,
      baseSalary,
      pieceRateSalary: out.pieceRateSalary,
      hazardAllowance: 0,                                  // Phase 2: theo điều kiện công ty
      responsibilityAllow: input.responsibilityAllowance,
      mealAllowance: out.overtimeMealAllow,                // mục 12
      otherIncome: out.fuelHousingAllow,                   // mục 3.2
      otPay: out.salaryOT,                                 // mục 9
      grossSalary: out.grossSalary,                        // B2
      bhxh: Math.round(bhxhBase * INSURANCE_RATES.SOCIAL),       // 8%
      bhyt: Math.round(bhxhBase * INSURANCE_RATES.HEALTH),       // 1.5%
      bhtn: Math.round(bhxhBase * INSURANCE_RATES.UNEMPLOYMENT), // 1%
      tncn: out.tncn,                                       // mục 18
      deductions: out.lateDeduction,                       // ((2)/26 × 7.2)
      netSalary: out.netSalary,                            // mục 19
    });
  }

  // ── Debug log: AttendanceRecord OT vs OTRequest ──
  const otFromAttendance = attendanceData.filter((a) => a.otHours > 0).length;
  const otFromRequest = otData.length;
  const totalOtNvs = Object.keys(otMap).length;
  const totalOtHours = Object.values(otMap).reduce((s, o) => s + o.weekday + o.sunday + o.holiday, 0);

  // Log breakdown để HR biết NV nào có HĐ vs thiếu HĐ
  console.warn(`[Payroll ${period.month}/${period.year}] ════════════════════════════════════════`);
  console.warn(`  Tổng NV có chấm công: ${employees.length}`);
  console.warn(`  ✅ Có HĐ active hoặc salaryGrade: ${withContractEmployees.length}`);
  console.warn(`  ❌ Thiếu HĐ — lương = 0: ${missingContractEmployees.length}`);
  console.warn(`  ── OT data ──`);
  console.warn(`     AttendanceRecord rows có otHours>0: ${otFromAttendance}`);
  console.warn(`     OTRequest đã APPROVED: ${otFromRequest}`);
  console.warn(`     Tổng NV có OT: ${totalOtNvs}, tổng giờ OT: ${totalOtHours}`);
  if (withContractEmployees.length > 0) {
    console.warn(`  ── Có HĐ ──`);
    withContractEmployees.slice(0, 10).forEach((e) => {
      console.warn(`    ${e.code} ${e.fullName} — baseSalary: ${e.baseSalary.toLocaleString("vi-VN")}đ`);
    });
    if (withContractEmployees.length > 10) console.warn(`    ... và ${withContractEmployees.length - 10} NV khác`);
  }
  if (missingContractEmployees.length > 0) {
    console.warn(`  ── Thiếu HĐ ──`);
    missingContractEmployees.slice(0, 10).forEach((e) => {
      console.warn(`    ${e.code} ${e.fullName}`);
    });
    if (missingContractEmployees.length > 10) console.warn(`    ... và ${missingContractEmployees.length - 10} NV khác`);
  }
  console.warn(`══════════════════════════════════════════════════════════════════════`);

  // Atomic write: xoá cũ → ghi mới → mark PROCESSING
  await prisma.$transaction(async (tx) => {
    await tx.payrollRecord.deleteMany({ where: { periodId } });
    await tx.payrollRecord.createMany({ data: records });
    await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "PROCESSING" } });
  });

  return prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      records: {
        include: {
          employee: {
            select: {
              id: true, code: true, fullName: true,
              department: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

// ─── Retrieval helpers ──────────────────────────────────────────────────────

export async function getSalarySlip(periodId: string, employeeId: string) {
  return prisma.payrollRecord.findFirst({
    where: { periodId, employeeId },
    include: {
      period: { select: { month: true, year: true, status: true } },
      employee: {
        select: {
          code: true,
          fullName: true,
          bankAccount: true,
          bankName: true,
          taxCode: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  });
}

export async function listPayrollPeriods() {
  return prisma.payrollPeriod.findMany({
    include: { records: { select: { id: true, netSalary: true, employeeId: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}
