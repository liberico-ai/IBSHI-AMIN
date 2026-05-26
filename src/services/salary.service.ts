import prisma from "@/lib/prisma";
import { calculateSalary, type SalaryInput } from "@/lib/salary-calc";
import { SALARY_CONFIG, INSURANCE_RATES } from "@/lib/constants";
import { standardWorkDays, isHoliday, holidaysInMonth } from "@/lib/holidays";

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
    select: { employeeId: true, status: true, workHours: true, otHours: true, date: true },
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


  // ── Build lookup maps ──

  // ── Phân loại theo NGÀY (chốt 2026-05-26) ──
  //   Ngày thường (T2–T7, không lễ): workHours → công thường (÷8); otHours → OT ngày thường (×1.5).
  //   Chủ Nhật (ngày nghỉ): TOÀN BỘ giờ làm (workHours + otHours) → OT Chủ Nhật (×2).
  //   Ngày Lễ: TOÀN BỘ giờ làm → OT Lễ (×3).  (Ca đêm để 0 — chờ máy chấm công.)
  //   ABSENT_APPROVED(_HALF) (phép) → leaveDays (hưởng theo Lương BHXH/CC).
  const workDaysMap: Record<string, number> = {};        // công thường (ngày làm thực, ÷8)
  const alDaysFromAttendance: Record<string, number> = {};
  const otMap: Record<string, { weekday: number; sunday: number; holiday: number }> = {};
  const ensureOt = (id: string) => (otMap[id] ||= { weekday: 0, sunday: 0, holiday: 0 });

  for (const a of attendanceData) {
    const d = new Date(a.date);
    const wh = a.workHours || 0;
    const oh = a.otHours || 0;
    if (isHoliday(d)) {
      if (wh + oh > 0) ensureOt(a.employeeId).holiday += wh + oh;       // mọi giờ lễ = OT lễ
    } else if (d.getUTCDay() === 0) {
      if (wh + oh > 0) ensureOt(a.employeeId).sunday += wh + oh;        // mọi giờ CN = OT CN
    } else {
      // Ngày thường
      if (["PRESENT", "LATE", "BUSINESS_TRIP", "HALF_DAY"].includes(a.status)) {
        workDaysMap[a.employeeId] = (workDaysMap[a.employeeId] || 0) + wh / 8;
      } else if (a.status === "ABSENT_APPROVED") {
        alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + 1;
      } else if (a.status === "ABSENT_APPROVED_HALF") {
        alDaysFromAttendance[a.employeeId] = (alDaysFromAttendance[a.employeeId] || 0) + 0.5;
      }
      if (oh > 0) ensureOt(a.employeeId).weekday += oh;                 // OT ngày thường
    }
  }

  // OTRequest đã APPROVED — phân loại theo otRate (bổ sung nếu có đơn OT riêng)
  for (const o of otData) {
    ensureOt(o.employeeId);
    if (o.otRate >= 3.0) otMap[o.employeeId].holiday += o.hours;
    else if (o.otRate >= 2.0) otMap[o.employeeId].sunday += o.hours;
    else otMap[o.employeeId].weekday += o.hours;
  }

  // 6 — Nghỉ phép có lương (LeaveRequest + mã AL bảng công) → hưởng theo Lương BHXH/CC
  const leavePaidMap: Record<string, number> = {};
  for (const l of leaveData) {
    if (l.leaveType !== "UNPAID") leavePaidMap[l.employeeId] = (leavePaidMap[l.employeeId] || 0) + l.totalDays;
  }
  for (const [empId, days] of Object.entries(alDaysFromAttendance)) {
    leavePaidMap[empId] = (leavePaidMap[empId] || 0) + days;
  }

  // Nghỉ lễ: ngày lễ (lịch VN) mà NV KHÔNG đi làm → cũng hưởng lương theo Lương BHXH/CC
  const holidayYmds = holidaysInMonth(period.year, period.month);
  const workedKey = (empId: string, d: Date) =>
    `${empId}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const workedSet = new Set<string>();
  for (const a of attendanceData) {
    if (["PRESENT", "LATE", "BUSINESS_TRIP", "HALF_DAY"].includes(a.status)) {
      workedSet.add(workedKey(a.employeeId, new Date(a.date)));
    }
  }
  const holidayRestMap: Record<string, number> = {};
  for (const empId of employeeIdsWithAttendance) {
    let rest = 0;
    for (const hy of holidayYmds) if (!workedSet.has(`${empId}|${hy}`)) rest++;
    if (rest > 0) holidayRestMap[empId] = rest;
  }

  // Công chuẩn (CC) = số ngày trong tháng − số Chủ Nhật
  const CC = standardWorkDays(period.year, period.month);

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

    // Gốc lương từ HĐ: Lương đóng BHXH (lương chính) + Phụ cấp = Tổng thu nhập
    const insuranceSalary = contract?.insuranceSalary ?? contract?.baseSalary ?? 0;
    const allowance = contract?.allowance ?? 0;
    const totalIncome = insuranceSalary + allowance;

    if (totalIncome > 0) {
      withContractEmployees.push({ code: emp.code, fullName: emp.fullName, baseSalary: insuranceSalary });
    } else {
      missingContractEmployees.push({ code: emp.code, fullName: emp.fullName });
    }

    const workDaysActual = workDaysMap[emp.id] || 0;
    const leaveDays = (leavePaidMap[emp.id] || 0) + (holidayRestMap[emp.id] || 0);
    const ot = otMap[emp.id] || { weekday: 0, sunday: 0, holiday: 0 };

    const input: SalaryInput = {
      totalIncome,
      insuranceSalary,
      standardDays: CC,
      workDaysActual,
      leaveDays,
      ot: {
        weekday: ot.weekday,
        weekdayNight: 0,   // ca đêm chờ máy chấm công
        sunday: ot.sunday,
        sundayNight: 0,
        holiday: ot.holiday,
        holidayNight: 0,
      },
      dependentsCount: emp.dependents || 0,
    };

    const out = calculateSalary(input);

    // Map → PayrollRecord. Split BHXH NLĐ (10.5%) thành 8% / 1.5% / 1% (0 nếu chưa đủ 14 công).
    const bhxhBase = Math.min(insuranceSalary, SALARY_CONFIG.INSURANCE_SALARY_CAP);
    const hasBHXH = out.bhxhEmployee > 0;

    records.push({
      periodId,
      employeeId: emp.id,
      standardDays: CC,
      workDays: workDaysActual,
      otHours: out.otHoursTotal,
      baseSalary: insuranceSalary,
      pieceRateSalary: 0,
      hazardAllowance: 0,
      responsibilityAllow: 0,
      mealAllowance: 0,
      otherIncome: out.leavePay,                           // lương phép + lễ
      otPay: out.salaryOT,                                 // lương OT (đã nhân hệ số)
      grossSalary: out.grossSalary,
      bhxh: hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.SOCIAL) : 0,       // 8%
      bhyt: hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.HEALTH) : 0,       // 1.5%
      bhtn: hasBHXH ? Math.round(bhxhBase * INSURANCE_RATES.UNEMPLOYMENT) : 0, // 1%
      tncn: out.tncn,
      deductions: 0,
      netSalary: out.netSalary,
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
