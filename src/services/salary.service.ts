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

  // KPI/PC trách nhiệm override theo kỳ — biến động theo tháng nên không thể fix cứng ở Contract.
  // Lookup ưu tiên theo (employeeId, month, year). Fallback về Contract.allowances nếu không có.
  const kpiOverrides = await prisma.payrollKpiOverride.findMany({
    where: { month: period.month, year: period.year },
    select: { employeeId: true, kpi: true, responsibility: true },
  });
  const kpiOverrideMap = new Map(kpiOverrides.map((o) => [o.employeeId, o]));

  // ── Build lookup maps ──

  // 4 — workDaysHC (= "Công đi làm" trong file khách — chỉ tính ngày đi làm thực):
  //   PRESENT / LATE / BUSINESS_TRIP → +1
  //   HALF_DAY (làm nửa ngày, "x/2") → +0.5
  //   ABSENT_APPROVED (AL/L/CL/ML/SL/CO/MT — nghỉ có lương) → KHÔNG cộng vào workDaysHC
  //     → tính riêng thành "Lương phép" (mục 11 — policyAllowance trong salary-calc).
  //   ABSENT_UNAPPROVED → KHÔNG cộng.
  const workDaysMap: Record<string, number> = {};
  // alDaysFromAttendance: ngày phép (AL) lấy từ bảng công đã import.
  //   workHours=0 → 1 ngày AL đầy đủ. workHours=4 → 0.5 ngày AL (marker half-day cho "al/2").
  const alDaysFromAttendance: Record<string, number> = {};
  for (const a of attendanceData) {
    if (!workDaysMap[a.employeeId]) workDaysMap[a.employeeId] = 0;
    if (["PRESENT", "LATE", "BUSINESS_TRIP"].includes(a.status)) workDaysMap[a.employeeId] += 1;
    else if (a.status === "HALF_DAY") workDaysMap[a.employeeId] += 0.5;
    else if (a.status === "ABSENT_APPROVED") {
      alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + (a.workHours === 4 ? 0.5 : 1);
    }
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
  // Lấy từ 2 nguồn: LeaveRequest (đơn nghỉ trong hệ thống) + AttendanceRecord (mã AL từ bảng công import)
  const policyMap: Record<string, number> = {};
  const unpaidMap: Record<string, number> = {};
  for (const l of leaveData) {
    if (l.leaveType === "UNPAID") {
      unpaidMap[l.employeeId] = (unpaidMap[l.employeeId] || 0) + l.totalDays;
    } else {
      policyMap[l.employeeId] = (policyMap[l.employeeId] || 0) + l.totalDays;
    }
  }
  // Cộng thêm AL từ bảng công đã import (ưu tiên dùng nếu có)
  for (const [empId, days] of Object.entries(alDaysFromAttendance)) {
    policyMap[empId] = (policyMap[empId] || 0) + days;
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

    // Lương cơ bản (2.1) — ưu tiên Contract.baseSalary (đồng bộ từ file lương khách = master).
    // Fallback: salaryGrade × coefficient (legacy) khi không có HĐ ACTIVE.
    let baseSalary = 0;
    if (contract && contract.baseSalary > 0) {
      baseSalary = contract.baseSalary;
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary });
    } else if (emp.salaryGrade && emp.salaryCoefficient) {
      baseSalary = Math.round(emp.salaryGrade * emp.salaryCoefficient * SALARY_BASE_UNIT);
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

    // Phụ cấp HĐ (2.2) + PC trách nhiệm (3.1) — lấy từ Contract.allowances (import từ Bảng lương)
    const allw = (contract?.allowances as Record<string, number> | null) || {};
    const phoneAllowance = allw.phone || 0;
    const fuelAllowance = allw.fuel || 0;
    const housingAllowance = allw.housing || 0;
    // KPI/PC trách nhiệm: ưu tiên PayrollKpiOverride cho kỳ này (biến động theo tháng),
    // fallback về Contract.allowances. KHÔNG dùng fallback theo role (file khách quyết định).
    const override = kpiOverrideMap.get(emp.id);
    const kpiAllowance = override?.kpi ?? allw.kpi ?? 0;
    const responsibilityAllowance = override?.responsibility ?? allw.responsibility ?? 0;

    // Build SalaryInput theo spec IBSHI
    const input: SalaryInput = {
      // Hợp đồng — phụ cấp 2.2 từ Contract.allowances
      baseSalary,
      phoneAllowance,
      fuelAllowance,
      housingAllowance,
      kpiAllowance,
      // Bổ sung — 3.1 PC trách nhiệm; 3.2 PC xăng nhà trọ (200K nếu eligible + ≥14 công)
      responsibilityAllowance,
      fuelHousingEligible: emp.fuelHousingEligible || false,
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
