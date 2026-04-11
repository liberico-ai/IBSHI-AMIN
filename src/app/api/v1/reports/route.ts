import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

// ─── In-memory cache for dashboard-kpi (5-minute TTL) ────────────────────────
let kpiCache: { data: unknown; expiresAt: number } | null = null;
const KPI_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "reports", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "overview";

  // ── dashboard-kpi (cached 5 min) ──────────────────────────────────────────
  if (type === "dashboard-kpi") {
    const now = Date.now();
    if (kpiCache && kpiCache.expiresAt > now) {
      return NextResponse.json({ data: kpiCache.data }, {
        headers: { "Cache-Control": "private, max-age=300", "X-Cache": "HIT" },
      });
    }

    const nowDate = new Date();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    const monthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0, 23, 59, 59);
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0);
    const todayEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 23, 59, 59, 999);

    const [totalActive, presentToday, pendingLeaves, pendingOT, openIncidents, vehicleBookingsThisMonth, visitorsToday, payrollPeriod] =
      await Promise.all([
        prisma.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION"] } } }),
        prisma.attendanceRecord.count({ where: { date: { gte: todayStart, lte: todayEnd }, status: { in: ["PRESENT", "LATE"] } } }),
        prisma.leaveRequest.count({ where: { status: "PENDING" } }),
        prisma.oTRequest.count({ where: { status: "PENDING" } }),
        prisma.hSEIncident.count({ where: { status: { in: ["REPORTED", "INVESTIGATING"] } } }),
        prisma.vehicleBooking.count({ where: { startDate: { gte: monthStart, lte: monthEnd } } }),
        prisma.visitorRequest.count({ where: { visitDate: { gte: todayStart, lte: todayEnd } } }),
        prisma.payrollPeriod.findFirst({ where: { month: nowDate.getMonth() + 1, year: nowDate.getFullYear() } }),
      ]);

    const data = {
      employees: { active: totalActive, presentToday, attendanceRate: totalActive > 0 ? Math.round((presentToday / totalActive) * 100) : 0 },
      pending: { leaves: pendingLeaves, ot: pendingOT, total: pendingLeaves + pendingOT },
      hse: { openIncidents },
      vehicles: { bookingsThisMonth: vehicleBookingsThisMonth },
      visitors: { today: visitorsToday },
      payroll: { currentPeriodStatus: payrollPeriod?.status ?? null },
    };
    kpiCache = { data, expiresAt: Date.now() + KPI_TTL_MS };

    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=300", "X-Cache": "MISS" },
    });
  }

  // ── overview ─────────────────────────────────────────────────────────────
  if (type === "overview") {
    const [totalEmployees, activeEmployees, probationEmployees, departments, pendingLeaves, pendingOT, expCerts, openIncidents, pendingRecruitment] =
      await Promise.all([
        prisma.employee.count(),
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.employee.count({ where: { status: "PROBATION" } }),
        prisma.department.findMany({
          select: { id: true, name: true, headcount: true, _count: { select: { employees: { where: { status: { in: ["ACTIVE", "PROBATION"] } } } } } },
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.leaveRequest.count({ where: { status: "PENDING" } }),
        prisma.oTRequest.count({ where: { status: "PENDING" } }),
        prisma.certificate.count({ where: { status: { in: ["EXPIRING_SOON", "EXPIRED"] }, employee: { status: { in: ["ACTIVE", "PROBATION"] } } } }),
        prisma.hSEIncident.count({ where: { status: { in: ["REPORTED", "INVESTIGATING"] } } }),
        prisma.recruitmentRequest.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
      ]);

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [newHires, resigned] = await Promise.all([
      prisma.employee.count({ where: { startDate: { gte: thisMonth } } }),
      prisma.employee.count({ where: { status: "RESIGNED", updatedAt: { gte: thisMonth } } }),
    ]);

    return NextResponse.json({
      data: {
        headcount: { total: totalEmployees, active: activeEmployees, probation: probationEmployees, newHires, resigned },
        departments: departments.map((d) => ({ id: d.id, name: d.name, headcount: d.headcount, actual: d._count.employees })),
        pending: { leaves: pendingLeaves, ot: pendingOT },
        alerts: { expiredCerts: expCerts, openIncidents, openRecruitment: pendingRecruitment },
      },
    });
  }

  // ── attendance ────────────────────────────────────────────────────────────
  if (type === "attendance") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [records, employees] = await Promise.all([
      prisma.attendanceRecord.groupBy({
        by: ["employeeId", "status"],
        where: { date: { gte: startDate, lte: endDate } },
        _count: true,
      }),
      prisma.employee.findMany({
        where: { status: { in: ["ACTIVE", "PROBATION"] } },
        select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      }),
    ]);

    const empMap: Record<string, any> = {};
    for (const emp of employees) empMap[emp.id] = { ...emp, present: 0, absent: 0, late: 0 };
    for (const r of records) {
      if (!empMap[r.employeeId]) continue;
      if (r.status === "PRESENT") empMap[r.employeeId].present += r._count;
      if (r.status === "ABSENT_UNAPPROVED") empMap[r.employeeId].absent += r._count;
      if (r.status === "LATE") empMap[r.employeeId].late += r._count;
    }

    return NextResponse.json({ data: Object.values(empMap) });
  }

  // ── salary ────────────────────────────────────────────────────────────────
  if (type === "salary") {
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const periods = await prisma.payrollPeriod.findMany({
      where: { year },
      include: { records: { select: { netSalary: true, grossSalary: true, bhxh: true, bhyt: true, bhtn: true, tncn: true } } },
      orderBy: { month: "asc" },
    });

    const summary = periods.map((p) => ({
      month: p.month, year: p.year, status: p.status,
      headcount: p.records.length,
      totalGross: p.records.reduce((s, r) => s + r.grossSalary, 0),
      totalNet: p.records.reduce((s, r) => s + r.netSalary, 0),
      totalBHXH: p.records.reduce((s, r) => s + r.bhxh, 0),
      totalTNCN: p.records.reduce((s, r) => s + r.tncn, 0),
    }));

    return NextResponse.json({ data: summary });
  }

  // ── weekly-hr ─────────────────────────────────────────────────────────────
  if (type === "weekly-hr") {
    const weekStartStr = searchParams.get("weekStart");
    if (!weekStartStr) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "weekStart required" } }, { status: 400 });

    const weekStart = new Date(weekStartStr); weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);

    const [active, totalEmp, newHires, resigned, attByStatus, leaveByStatus, otAgg, employees] = await Promise.all([
      prisma.employee.count({ where: { status: { in: ["ACTIVE", "PROBATION"] } } }),
      prisma.employee.count(),
      prisma.employee.count({ where: { startDate: { gte: weekStart, lte: weekEnd } } }),
      prisma.employee.count({ where: { status: "RESIGNED", updatedAt: { gte: weekStart, lte: weekEnd } } }),
      prisma.attendanceRecord.groupBy({ by: ["employeeId", "status"], where: { date: { gte: weekStart, lte: weekEnd } }, _count: true }),
      prisma.leaveRequest.groupBy({ by: ["status"], where: { startDate: { gte: weekStart, lte: weekEnd } }, _count: true }),
      prisma.oTRequest.aggregate({ where: { date: { gte: weekStart, lte: weekEnd }, status: "APPROVED" }, _sum: { hours: true }, _count: { id: true } }),
      prisma.employee.findMany({ where: { status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true, code: true, fullName: true, department: { select: { name: true } } }, orderBy: [{ department: { sortOrder: "asc" } }, { fullName: "asc" }] }),
    ]);

    const attMap: Record<string, { present: number; absent: number; late: number; halfDay: number }> = {};
    for (const r of attByStatus) {
      if (!attMap[r.employeeId]) attMap[r.employeeId] = { present: 0, absent: 0, late: 0, halfDay: 0 };
      if (r.status === "PRESENT") attMap[r.employeeId].present += r._count;
      if (r.status === "ABSENT_UNAPPROVED" || r.status === "ABSENT_APPROVED") attMap[r.employeeId].absent += r._count;
      if (r.status === "LATE") attMap[r.employeeId].late += r._count;
      if (r.status === "HALF_DAY") attMap[r.employeeId].halfDay += r._count;
    }
    const leaveMap: Record<string, number> = {};
    for (const l of leaveByStatus) leaveMap[l.status] = l._count;

    return NextResponse.json({
      data: {
        period: { from: weekStart.toISOString(), to: weekEnd.toISOString() },
        headcount: { total: totalEmp, active, newHires, resigned },
        attendance: employees.map((e) => ({ code: e.code, fullName: e.fullName, department: e.department.name, ...(attMap[e.id] || { present: 0, absent: 0, late: 0, halfDay: 0 }) })),
        leave: { approved: leaveMap["APPROVED"] || 0, pending: leaveMap["PENDING"] || 0, rejected: leaveMap["REJECTED"] || 0 },
        ot: { count: otAgg._count.id, totalHours: otAgg._sum.hours || 0 },
      },
    });
  }

  // ── monthly-hr ────────────────────────────────────────────────────────────
  if (type === "monthly-hr") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 0, 23, 59, 59);

    const [totalEmp, activeEmp, probationEmp, newHires, resigned, departments, attByDeptRaw, leaveByType, payrollPeriod, trainingPlans, trainingCompleted, hseIncidents, hseNearMiss, disciplines] =
      await Promise.all([
        prisma.employee.count(),
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.employee.count({ where: { status: "PROBATION" } }),
        prisma.employee.count({ where: { startDate: { gte: from, lte: to } } }),
        prisma.employee.count({ where: { status: "RESIGNED", updatedAt: { gte: from, lte: to } } }),
        prisma.department.findMany({ where: { isActive: true }, select: { name: true, code: true, headcount: true, _count: { select: { employees: { where: { status: { in: ["ACTIVE", "PROBATION"] } } } } } }, orderBy: { sortOrder: "asc" } }),
        prisma.attendanceRecord.groupBy({ by: ["status"], where: { date: { gte: from, lte: to } }, _count: true }),
        prisma.leaveRequest.groupBy({ by: ["leaveType", "status"], where: { startDate: { gte: from, lte: to }, status: "APPROVED" }, _count: true, _sum: { totalDays: true } }),
        prisma.payrollPeriod.findFirst({ where: { month, year }, include: { records: { select: { grossSalary: true, netSalary: true, bhxh: true, bhyt: true, bhtn: true, tncn: true, employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } } } } }),
        prisma.trainingPlan.count({ where: { createdAt: { gte: from, lte: to } } }),
        prisma.trainingPlan.count({ where: { status: "COMPLETED", scheduledDate: { gte: from, lte: to } } }),
        prisma.hSEIncident.count({ where: { incidentDate: { gte: from, lte: to }, type: { not: "NEAR_MISS" } } }),
        prisma.hSEIncident.count({ where: { incidentDate: { gte: from, lte: to }, type: "NEAR_MISS" } }),
        prisma.disciplinaryAction.count({ where: { createdAt: { gte: from, lte: to } } }),
      ]);

    const attMap: Record<string, number> = {};
    for (const r of attByDeptRaw) attMap[r.status] = r._count;

    const leaveByTypeSummary: Record<string, { days: number; count: number }> = {};
    for (const l of leaveByType) {
      if (!leaveByTypeSummary[l.leaveType]) leaveByTypeSummary[l.leaveType] = { days: 0, count: 0 };
      leaveByTypeSummary[l.leaveType].days  += l._sum.totalDays || 0;
      leaveByTypeSummary[l.leaveType].count += l._count;
    }

    const payroll = payrollPeriod ? {
      headcount: payrollPeriod.records.length,
      totalGross: payrollPeriod.records.reduce((s, r) => s + r.grossSalary, 0),
      totalNet:   payrollPeriod.records.reduce((s, r) => s + r.netSalary, 0),
      totalBHXH:  payrollPeriod.records.reduce((s, r) => s + r.bhxh, 0),
      totalTNCN:  payrollPeriod.records.reduce((s, r) => s + r.tncn, 0),
      status: payrollPeriod.status,
      byEmployee: payrollPeriod.records.map((r) => ({ code: r.employee.code, fullName: r.employee.fullName, department: r.employee.department.name, grossSalary: r.grossSalary, netSalary: r.netSalary, bhxh: r.bhxh, bhyt: r.bhyt, bhtn: r.bhtn, tncn: r.tncn })),
    } : null;

    return NextResponse.json({
      data: {
        period: { month, year },
        headcount: { total: totalEmp, active: activeEmp, probation: probationEmp, newHires, resigned },
        departments: departments.map((d) => ({ code: d.code, name: d.name, planned: d.headcount, actual: d._count.employees })),
        attendance: { present: attMap["PRESENT"] || 0, absent: (attMap["ABSENT_UNAPPROVED"] || 0) + (attMap["ABSENT_APPROVED"] || 0), late: attMap["LATE"] || 0, halfDay: attMap["HALF_DAY"] || 0 },
        leave: leaveByTypeSummary,
        payroll,
        training: { total: trainingPlans, completed: trainingCompleted },
        hse: { incidents: hseIncidents, nearMisses: hseNearMiss },
        discipline: { total: disciplines },
      },
    });
  }

  // ── finance-summary ───────────────────────────────────────────────────────
  if (type === "finance-summary") {
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 0, 23, 59, 59);

    const [payrollPeriod, vehicleBookings, mealRegs] = await Promise.all([
      prisma.payrollPeriod.findFirst({ where: { month, year }, include: { records: { select: { grossSalary: true, netSalary: true, bhxh: true, bhyt: true, bhtn: true, tncn: true, employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } } } } }),
      prisma.vehicleBooking.groupBy({ by: ["status"], where: { startDate: { gte: from, lte: to } }, _count: true }),
      prisma.mealRegistration.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { lunchCount: true, dinnerCount: true, guestCount: true } }),
    ]);

    const payrollRecords = payrollPeriod?.records || [];
    const totalGross = payrollRecords.reduce((s, r) => s + r.grossSalary, 0);
    const totalNet   = payrollRecords.reduce((s, r) => s + r.netSalary, 0);
    const totalBHXH  = payrollRecords.reduce((s, r) => s + r.bhxh + r.bhyt + r.bhtn, 0);
    const totalTNCN  = payrollRecords.reduce((s, r) => s + r.tncn, 0);

    const byDept: Record<string, { net: number; gross: number; count: number }> = {};
    for (const r of payrollRecords) {
      const dept = r.employee.department.name;
      if (!byDept[dept]) byDept[dept] = { net: 0, gross: 0, count: 0 };
      byDept[dept].net += r.netSalary;
      byDept[dept].gross += r.grossSalary;
      byDept[dept].count++;
    }

    const vehicleMap: Record<string, number> = {};
    for (const v of vehicleBookings) vehicleMap[v.status] = v._count;

    const lunchTotal  = mealRegs._sum.lunchCount  ?? 0;
    const dinnerTotal = mealRegs._sum.dinnerCount ?? 0;
    const guestTotal  = mealRegs._sum.guestCount  ?? 0;

    return NextResponse.json({
      data: {
        period: { month, year },
        payroll: {
          status: payrollPeriod?.status || null, headcount: payrollRecords.length,
          totalGross, totalNet, totalBHXH, totalTNCN,
          byDepartment: Object.entries(byDept).map(([name, v]) => ({ name, ...v })),
          employees: payrollRecords.map((r) => ({ code: r.employee.code, fullName: r.employee.fullName, department: r.employee.department.name, grossSalary: r.grossSalary, netSalary: r.netSalary })),
        },
        vehicles: { total: vehicleBookings.reduce((s, v) => s + v._count, 0), approved: vehicleMap["APPROVED"] || 0, completed: vehicleMap["COMPLETED"] || 0 },
        meals: { lunch: lunchTotal, dinner: dinnerTotal, guest: guestTotal, total: lunchTotal + dinnerTotal + guestTotal },
      },
    });
  }

  return NextResponse.json({ error: { code: "INVALID_TYPE" } }, { status: 400 });
}
