import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";

// Vietnam social insurance rates (employee contribution)
const BHXH_RATE = 0.08;
const BHYT_RATE = 0.015;
const BHTN_RATE = 0.01;
const STANDARD_DAYS = 26;
const BHXH_SALARY_CAP = 36_000_000; // Mức trần đóng BHXH
const PERSONAL_DEDUCTION = 11_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;
const MEAL_UNIT_PRICE = 35_000; // VND/ngày

// Phụ cấp trách nhiệm theo cấp bậc
const RESPONSIBILITY_ALLOWANCE: Record<string, number> = {
  TEAM_LEAD: 800_000,
  MANAGER: 1_500_000,
  HR_ADMIN: 1_500_000,
  BOM: 1_500_000,
  EMPLOYEE: 0,
};

// Phụ cấp độc hại: áp dụng cho NV tổ SX
const HAZARD_ALLOWANCE = 1_200_000;

// Tính TNCN theo biểu thuế lũy tiến VN (tháng)
function calcTNCN(taxable: number): number {
  if (taxable <= 0) return 0;
  if (taxable <= 5_000_000) return Math.round(taxable * 0.05);
  if (taxable <= 10_000_000) return Math.round(250_000 + (taxable - 5_000_000) * 0.10);
  if (taxable <= 18_000_000) return Math.round(750_000 + (taxable - 10_000_000) * 0.15);
  if (taxable <= 32_000_000) return Math.round(1_950_000 + (taxable - 18_000_000) * 0.20);
  if (taxable <= 52_000_000) return Math.round(4_750_000 + (taxable - 32_000_000) * 0.25);
  if (taxable <= 80_000_000) return Math.round(9_750_000 + (taxable - 52_000_000) * 0.30);
  return Math.round(18_150_000 + (taxable - 80_000_000) * 0.35);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      records: {
        include: {
          employee: {
            select: {
              id: true, code: true, fullName: true,
              department: { select: { name: true } },
              position: { select: { name: true } },
            },
          },
        },
        orderBy: { employee: { fullName: "asc" } },
      },
    },
  });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: period });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const { action } = body;

  // APPROVE action
  if (action === "APPROVE") {
    if (!checkPermission(userRole, "BOM")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data: { status: "APPROVED", approvedBy: (session.user as any).id, approvedAt: new Date() },
    });
    return NextResponse.json({ data: updated });
  }

  // CALCULATE action — auto-generate records from attendance + OT + allowances
  if (action === "CALCULATE") {
    const startDate = new Date(period.year, period.month - 1, 1);
    const endDate = new Date(period.year, period.month, 0, 23, 59, 59);

    // Grade × coefficient × 730,000 is the statutory base salary formula (VN public sector)
    const SALARY_BASE_UNIT = 730_000;

    // Get all active employees with their active contracts, position level, team info
    // Employee model includes salaryGrade and salaryCoefficient fields by default
    const employees = await prisma.employee.findMany({
      where: { status: { in: ["ACTIVE", "PROBATION"] } },
      include: {
        contracts: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        user: { select: { role: true } },
        team: { select: { id: true } },
      },
    });

    // Get attendance data for the period
    const attendanceData = await prisma.attendanceRecord.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { employeeId: true, status: true },
    });

    // Get APPROVED OT data for the period (with actual otRate per request)
    const otData = await prisma.oTRequest.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
      select: { employeeId: true, hours: true, otRate: true },
    });

    // Get piece-rate records for this month (distributed per team member)
    const pieceRateData = await prisma.pieceRateRecord.findMany({
      where: { month: period.month, year: period.year },
      include: {
        members: { select: { id: true } },
      },
    });

    // Build attendance map: employeeId → { days, otHours (from AttendanceRecord.otHours - fallback) }
    const attendanceMap: Record<string, { days: number }> = {};
    for (const a of attendanceData) {
      if (!attendanceMap[a.employeeId]) attendanceMap[a.employeeId] = { days: 0 };
      if (["PRESENT", "LATE", "BUSINESS_TRIP"].includes(a.status)) {
        attendanceMap[a.employeeId].days += 1;
      } else if (a.status === "HALF_DAY") {
        attendanceMap[a.employeeId].days += 0.5;
      }
    }

    // Build OT map: employeeId → array of { hours, otRate }
    const otMap: Record<string, { hours: number; otRate: number }[]> = {};
    for (const o of otData) {
      if (!otMap[o.employeeId]) otMap[o.employeeId] = [];
      otMap[o.employeeId].push({ hours: o.hours, otRate: o.otRate });
    }

    // Build piece-rate map: employeeId → totalPieceRateForMonth
    const pieceRateMap: Record<string, number> = {};
    for (const pr of pieceRateData) {
      const perMemberAmount = pr.memberCount > 0
        ? Math.round(pr.totalAmount / pr.memberCount)
        : 0;
      for (const member of pr.members) {
        pieceRateMap[member.id] = (pieceRateMap[member.id] || 0) + perMemberAmount;
      }
    }

    // Delete existing records for this period
    await prisma.payrollRecord.deleteMany({ where: { periodId: id } });

    // Create new records
    const records = [];
    for (const emp of employees) {
      const contract = emp.contracts[0];
      if (!contract) continue;

      // Spec: baseSalary = salaryGrade × salaryCoefficient × 730,000
      // Fall back to contract.baseSalary if grade/coefficient not set
      const baseSalary = (emp.salaryGrade && emp.salaryCoefficient)
        ? Math.round(emp.salaryGrade * emp.salaryCoefficient * SALARY_BASE_UNIT)
        : contract.baseSalary;
      const attendance = attendanceMap[emp.id] || { days: 0 };
      const workDays = attendance.days;

      // 1. Lương cơ bản theo công
      const workedPay = Math.round(baseSalary * (workDays / STANDARD_DAYS));

      // 2. Lương khoán (chỉ NV có team SX)
      const pieceRateSalary = pieceRateMap[emp.id] || 0;

      // 3. Phụ cấp độc hại (NV có teamId = thuộc tổ SX)
      const hazardAllowance = emp.teamId ? HAZARD_ALLOWANCE : 0;

      // 4. Phụ cấp trách nhiệm theo role
      const responsibilityAllow = RESPONSIBILITY_ALLOWANCE[emp.user.role] || 0;

      // 5. Phụ cấp ăn trưa
      const mealAllowance = Math.round(workDays * MEAL_UNIT_PRICE);

      // 6. Tiền OT: sum(hours × hourlyRate × otRate) — dùng otRate thực tế mỗi request
      const hourlyRate = baseSalary / (STANDARD_DAYS * 8);
      const otHours = (otMap[emp.id] || []).reduce((s, o) => s + o.hours, 0);
      const otPay = Math.round(
        (otMap[emp.id] || []).reduce((sum, o) => sum + o.hours * hourlyRate * o.otRate, 0)
      );

      // 7. Tổng thu nhập
      const grossSalary = workedPay + pieceRateSalary + hazardAllowance
        + responsibilityAllow + mealAllowance + otPay;

      // 8. Bảo hiểm (tính trên baseSalary, capped tại 36M)
      const bhxhBase = Math.min(baseSalary, BHXH_SALARY_CAP);
      const bhxh = Math.round(bhxhBase * BHXH_RATE);
      const bhyt = Math.round(bhxhBase * BHYT_RATE);
      const bhtn = Math.round(bhxhBase * BHTN_RATE);

      // 9. Thuế TNCN (có giảm trừ người phụ thuộc)
      const dependentDeduction = (emp.dependents || 0) * DEPENDENT_DEDUCTION;
      const taxableIncome = grossSalary - bhxh - bhyt - bhtn
        - PERSONAL_DEDUCTION - dependentDeduction;
      const tncn = calcTNCN(taxableIncome);

      // 10. Thực lĩnh
      const netSalary = grossSalary - bhxh - bhyt - bhtn - tncn;

      records.push({
        periodId: id,
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

    await prisma.payrollRecord.createMany({ data: records });
    await prisma.payrollPeriod.update({ where: { id }, data: { status: "PROCESSING" } });

    const updated = await prisma.payrollPeriod.findUnique({
      where: { id },
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
    return NextResponse.json({ data: updated });
  }

  // Generic status update
  const updated = await prisma.payrollPeriod.update({ where: { id }, data: { status: body.status } });
  return NextResponse.json({ data: updated });
}
