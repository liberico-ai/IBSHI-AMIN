import prisma from "@/lib/prisma";

export async function generateWeeklyHR(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const [active, newHires, resigned, pendingLeaves, pendingOT] = await Promise.all([
    prisma.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION"] } } }),
    prisma.employee.count({ where: { startDate: { gte: weekStart, lte: weekEnd } } }),
    prisma.employee.count({ where: { status: "RESIGNED", updatedAt: { gte: weekStart, lte: weekEnd } } }),
    prisma.leaveRequest.count({ where: { status: "PENDING", startDate: { gte: weekStart, lte: weekEnd } } }),
    prisma.oTRequest.count({ where: { status: "PENDING", date: { gte: weekStart, lte: weekEnd } } }),
  ]);

  return { period: { from: weekStart, to: weekEnd }, active, newHires, resigned, pendingLeaves, pendingOT };
}

export async function generateMonthlyHR(month: number, year: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59);

  const [total, active, probation, newHires, resigned] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.employee.count({ where: { status: "PROBATION" } }),
    prisma.employee.count({ where: { startDate: { gte: from, lte: to } } }),
    prisma.employee.count({ where: { status: "RESIGNED", updatedAt: { gte: from, lte: to } } }),
  ]);

  return { period: { month, year }, headcount: { total, active, probation, newHires, resigned } };
}

export async function generateFinanceSummary(month: number, year: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59);

  const payrollPeriod = await prisma.payrollPeriod.findFirst({
    where: { month, year },
    include: { records: { select: { grossSalary: true, netSalary: true, bhxh: true, bhyt: true, bhtn: true, tncn: true } } },
  });

  const records = payrollPeriod?.records ?? [];
  return {
    period: { month, year },
    payroll: {
      status: payrollPeriod?.status ?? null,
      headcount: records.length,
      totalGross: records.reduce((s, r) => s + r.grossSalary, 0),
      totalNet: records.reduce((s, r) => s + r.netSalary, 0),
    },
    from,
    to,
  };
}
