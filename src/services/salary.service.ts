import prisma from "@/lib/prisma";

// ─── Constants ─────────────────────────────────────────────────────────────

const BHXH_RATE = parseFloat(process.env.BHXH_RATE || "0.08");
const BHYT_RATE = parseFloat(process.env.BHYT_RATE || "0.015");
const BHTN_RATE = parseFloat(process.env.BHTN_RATE || "0.01");
const STANDARD_DAYS = parseInt(process.env.STANDARD_DAYS || "26", 10);
const BHXH_SALARY_CAP = 36_000_000;
const PERSONAL_DEDUCTION = 11_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;
const MEAL_UNIT_PRICE = parseInt(process.env.MEAL_UNIT_PRICE || "35000", 10);
const SALARY_BASE_UNIT = 730_000;

const RESPONSIBILITY_ALLOWANCE: Record<string, number> = {
  TEAM_LEAD: 800_000,
  MANAGER: 1_500_000,
  HR_ADMIN: 1_500_000,
  BOM: 1_500_000,
  EMPLOYEE: 0,
};
const HAZARD_ALLOWANCE = 1_200_000;

// ─── TNCN lũy tiến VN (tháng) ──────────────────────────────────────────────

export function calcTNCN(taxable: number): number {
  if (taxable <= 0) return 0;
  if (taxable <= 5_000_000) return Math.round(taxable * 0.05);
  if (taxable <= 10_000_000) return Math.round(250_000 + (taxable - 5_000_000) * 0.10);
  if (taxable <= 18_000_000) return Math.round(750_000 + (taxable - 10_000_000) * 0.15);
  if (taxable <= 32_000_000) return Math.round(1_950_000 + (taxable - 18_000_000) * 0.20);
  if (taxable <= 52_000_000) return Math.round(4_750_000 + (taxable - 32_000_000) * 0.25);
  if (taxable <= 80_000_000) return Math.round(9_750_000 + (taxable - 52_000_000) * 0.30);
  return Math.round(18_150_000 + (taxable - 80_000_000) * 0.35);
}

// ─── Core calculation ───────────────────────────────────────────────────────

export async function calculatePayrollForPeriod(periodId: string) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw Object.assign(new Error("Payroll period not found"), { code: "PERIOD_NOT_FOUND" });
  if (period.status === "APPROVED") throw Object.assign(new Error("Period already approved"), { code: "PERIOD_ALREADY_APPROVED" });

  const startDate = new Date(period.year, period.month - 1, 1);
  const endDate = new Date(period.year, period.month, 0, 23, 59, 59);

  const employees = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "PROBATION"] } },
    include: {
      contracts: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
      user: { select: { role: true } },
      team: { select: { id: true } },
    },
  });

  const attendanceData = await prisma.attendanceRecord.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { employeeId: true, status: true },
  });

  const otData = await prisma.oTRequest.findMany({
    where: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
    select: { employeeId: true, hours: true, otRate: true },
  });

  const pieceRateData = await prisma.pieceRateRecord.findMany({
    where: { month: period.month, year: period.year },
    include: { members: { select: { id: true } } },
  });

  // Build lookup maps
  const attendanceMap: Record<string, { days: number }> = {};
  for (const a of attendanceData) {
    if (!attendanceMap[a.employeeId]) attendanceMap[a.employeeId] = { days: 0 };
    if (["PRESENT", "LATE", "BUSINESS_TRIP"].includes(a.status)) {
      attendanceMap[a.employeeId].days += 1;
    } else if (a.status === "HALF_DAY") {
      attendanceMap[a.employeeId].days += 0.5;
    }
  }

  const otMap: Record<string, { hours: number; otRate: number }[]> = {};
  for (const o of otData) {
    if (!otMap[o.employeeId]) otMap[o.employeeId] = [];
    otMap[o.employeeId].push({ hours: o.hours, otRate: o.otRate });
  }

  const pieceRateMap: Record<string, number> = {};
  for (const pr of pieceRateData) {
    const perMember = pr.memberCount > 0 ? Math.round(pr.totalAmount / pr.memberCount) : 0;
    for (const member of pr.members) {
      pieceRateMap[member.id] = (pieceRateMap[member.id] || 0) + perMember;
    }
  }

  // Compute records in-memory (outside transaction — read-only)
  const records: {
    periodId: string; employeeId: string; standardDays: number; workDays: number;
    otHours: number; baseSalary: number; pieceRateSalary: number; hazardAllowance: number;
    responsibilityAllow: number; mealAllowance: number; otherIncome: number; otPay: number;
    grossSalary: number; bhxh: number; bhyt: number; bhtn: number; tncn: number;
    deductions: number; netSalary: number;
  }[] = [];
  for (const emp of employees) {
    const contract = emp.contracts[0];
    if (!contract) continue;

    const baseSalary = emp.salaryGrade && emp.salaryCoefficient
      ? Math.round(emp.salaryGrade * emp.salaryCoefficient * SALARY_BASE_UNIT)
      : contract.baseSalary;

    const workDays = (attendanceMap[emp.id] || { days: 0 }).days;

    // Các khoản thu
    const workedPay = Math.round(baseSalary * (workDays / STANDARD_DAYS));
    const pieceRateSalary = pieceRateMap[emp.id] || 0;
    const hazardAllowance = emp.teamId ? HAZARD_ALLOWANCE : 0;
    const responsibilityAllow = RESPONSIBILITY_ALLOWANCE[emp.user.role] || 0;
    const mealAllowance = Math.round(workDays * MEAL_UNIT_PRICE);

    const hourlyRate = baseSalary / (STANDARD_DAYS * 8);
    const otHours = (otMap[emp.id] || []).reduce((s, o) => s + o.hours, 0);
    const otPay = Math.round(
      (otMap[emp.id] || []).reduce((sum, o) => sum + o.hours * hourlyRate * o.otRate, 0)
    );

    const grossSalary = workedPay + pieceRateSalary + hazardAllowance
      + responsibilityAllow + mealAllowance + otPay;

    // Bảo hiểm (tính trên baseSalary, capped tại 36M)
    const bhxhBase = Math.min(baseSalary, BHXH_SALARY_CAP);
    const bhxh = Math.round(bhxhBase * BHXH_RATE);
    const bhyt = Math.round(bhxhBase * BHYT_RATE);
    const bhtn = Math.round(bhxhBase * BHTN_RATE);

    // Thuế TNCN
    const dependentDeduction = (emp.dependents || 0) * DEPENDENT_DEDUCTION;
    const taxableIncome = grossSalary - bhxh - bhyt - bhtn - PERSONAL_DEDUCTION - dependentDeduction;
    const tncn = calcTNCN(taxableIncome);

    const netSalary = grossSalary - bhxh - bhyt - bhtn - tncn;

    records.push({
      periodId,
      employeeId: emp.id,
      standardDays: STANDARD_DAYS,
      workDays,
      otHours,
      baseSalary,
      pieceRateSalary,
      hazardAllowance,
      responsibilityAllow,
      mealAllowance,
      otherIncome: 0,
      otPay,
      grossSalary,
      bhxh,
      bhyt,
      bhtn,
      tncn,
      deductions: 0,
      netSalary,
    });
  }

  // Atomic write: delete old → insert new → mark PROCESSING
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
