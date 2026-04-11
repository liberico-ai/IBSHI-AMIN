import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CalcSchema = z.object({
  quarter: z.number().int().min(1).max(4),
  year: z.number().int().min(2020).max(2100),
});

// Helper: get quarter date range
function quarterRange(quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59);
  return { start, end };
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "kpi", "calculate")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CalcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { quarter, year } = parsed.data;
  const { start, end } = quarterRange(quarter, year);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: {
      employees: {
        where: { status: { in: ["ACTIVE", "PROBATION"] } },
        select: { id: true },
      },
    },
  });

  // Get previous quarter scores for trend calculation
  const prevQuarter = quarter === 1 ? 4 : quarter - 1;
  const prevYear = quarter === 1 ? year - 1 : year;
  const prevScores = await prisma.kPIScore.findMany({
    where: { quarter: prevQuarter, year: prevYear },
    select: { departmentId: true, overallScore: true },
  });
  const prevScoreMap: Record<string, number> = {};
  for (const s of prevScores) prevScoreMap[s.departmentId] = s.overallScore;

  // Get HSE LTI incidents in the quarter (by department)
  const ltiIncidents = await prisma.hSEIncident.groupBy({
    by: ["reportedBy"],
    where: {
      incidentDate: { gte: start, lte: end },
      type: { in: ["LTI", "INJURY"] },
    },
    _count: { id: true },
  });
  // Map employee → department
  const ltiEmployees = ltiIncidents.map((i) => i.reportedBy);
  const ltiEmpDepts = ltiEmployees.length > 0
    ? await prisma.employee.findMany({
        where: { id: { in: ltiEmployees } },
        select: { departmentId: true },
      })
    : [];
  const ltiDeptSet = new Set(ltiEmpDepts.map((e) => e.departmentId));

  // Get NCR counts by responsible department name (open/in-progress/overdue)
  const openNcrs = await prisma.nCR.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
      createdAt: { gte: start, lte: end },
    },
    select: { responsibleDept: true },
  });
  // NCR.responsibleDept is a free-text string — count occurrences per dept name
  const ncrDeptCount: Record<string, number> = {};
  for (const ncr of openNcrs) {
    if (ncr.responsibleDept) {
      ncrDeptCount[ncr.responsibleDept] = (ncrDeptCount[ncr.responsibleDept] || 0) + 1;
    }
  }

  // Also count unresolved HSE incidents per dept as secondary quality signal
  const incidentCounts = await prisma.hSEIncident.groupBy({
    by: ["reportedBy"],
    where: {
      incidentDate: { gte: start, lte: end },
      status: { notIn: ["CLOSED"] },
    },
    _count: { id: true },
  });
  const incidentEmpIds = incidentCounts.map((i) => i.reportedBy);
  const incidentEmps = incidentEmpIds.length > 0
    ? await prisma.employee.findMany({
        where: { id: { in: incidentEmpIds } },
        select: { id: true, departmentId: true },
      })
    : [];
  const incidentDeptCount: Record<string, number> = {};
  for (const emp of incidentEmps) {
    const cnt = incidentCounts.find((i) => i.reportedBy === emp.id)?._count.id ?? 0;
    incidentDeptCount[emp.departmentId] = (incidentDeptCount[emp.departmentId] || 0) + cnt;
  }

  // Get attendance records for the quarter
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lte: end } },
    select: { employeeId: true, status: true },
  });

  // Get piece-rate completion for SX dept
  const pieceRateRecords = await prisma.pieceRateRecord.findMany({
    where: {
      month: { gte: (quarter - 1) * 3 + 1, lte: quarter * 3 },
      year,
    },
    select: { completionRate: true, teamId: true },
  });
  const pieceRateByTeam: Record<string, number[]> = {};
  for (const pr of pieceRateRecords) {
    if (!pieceRateByTeam[pr.teamId]) pieceRateByTeam[pr.teamId] = [];
    pieceRateByTeam[pr.teamId].push(pr.completionRate);
  }

  const scores = [];

  for (const dept of departments) {
    const empIds = dept.employees.map((e) => e.id);
    if (empIds.length === 0) continue;

    // 1. Attendance rate
    const deptAttendance = attendanceRecords.filter((a) => empIds.includes(a.employeeId));
    const totalWorkDays = deptAttendance.length;
    const presentDays = deptAttendance.filter((a) =>
      ["PRESENT", "LATE", "BUSINESS_TRIP"].includes(a.status)
    ).length;
    const attendanceRate = totalWorkDays > 0
      ? Math.min(100, Math.round((presentDays / totalWorkDays) * 100 * 10) / 10)
      : 100;

    // 2. Productivity rate (SX dept uses piece-rate completion; others default 100)
    let productivityRate = 100;
    if (dept.code === "SX") {
      const teams = await prisma.productionTeam.findMany({
        where: { departmentId: dept.id },
        select: { id: true },
      });
      const allRates = teams.flatMap((t) => pieceRateByTeam[t.id] || []);
      if (allRates.length > 0) {
        productivityRate = Math.round(
          (allRates.reduce((s, r) => s + r, 0) / allRates.length) * 100 * 10
        ) / 10;
      }
    }

    // 3. Quality rate: (headcount - NCRs) / headcount × 100, per spec formula
    //    NCRs = defect reports for this dept in quarter; headcount = proxy for "total output"
    //    Subtract 5 points per unresolved HSE incident (secondary quality signal)
    //    Minimum 0, maximum 100
    const deptNcrs = ncrDeptCount[dept.name] || 0;
    const deptIncidents = incidentDeptCount[dept.id] || 0;
    const headcount = Math.max(empIds.length, 1);
    const defectPenalty = (deptNcrs / headcount) * 100 + deptIncidents * 2;
    const qualityRate = Math.max(0, Math.round((100 - defectPenalty) * 10) / 10);

    // 4. Safety rate: 100 if no LTI, 80 if has LTI
    const safetyRate = ltiDeptSet.has(dept.id) ? 80 : 100;

    // 5. Overall: weighted average (attendance 30%, productivity 25%, quality 25%, safety 20%)
    const overallScore = Math.round(
      (attendanceRate * 0.30 + productivityRate * 0.25 + qualityRate * 0.25 + safetyRate * 0.20) * 10
    ) / 10;

    // 6. Trend vs previous quarter
    const prevOverall = prevScoreMap[dept.id] ?? overallScore;
    const trend = Math.round((overallScore - prevOverall) * 10) / 10;

    scores.push({
      departmentId: dept.id,
      quarter,
      year,
      attendanceRate,
      productivityRate,
      qualityRate,
      safetyRate,
      overallScore,
      trend,
    });
  }

  // Upsert all KPIScores
  const results = await Promise.all(
    scores.map((s) =>
      prisma.kPIScore.upsert({
        where: { departmentId_quarter_year: { departmentId: s.departmentId, quarter: s.quarter, year: s.year } },
        create: s,
        update: s,
        include: { department: { select: { name: true, code: true } } },
      })
    )
  );

  return NextResponse.json({ data: results, message: `Đã tính ${results.length} KPI scores cho Q${quarter}/${year}` });
}
