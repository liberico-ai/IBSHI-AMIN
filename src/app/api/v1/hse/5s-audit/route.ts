import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

/**
 * GET /api/v1/hse/5s-audit
 * Aggregate CleaningLog scores per zone/month as 5S audit data.
 * Query params: month (1-12), year (YYYY)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "hse", "closeIncident")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year  = parseInt(searchParams.get("year")  || String(now.getFullYear()));
  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 0, 23, 59, 59);

  // Get all cleaning zones
  const zones = await prisma.cleaningZone.findMany({
    where: { isActive: true },
    select: { id: true, name: true, location: true, frequency: true },
    orderBy: { name: "asc" },
  });

  // Get cleaning logs with scores for the period
  const logs = await prisma.cleaningLog.findMany({
    where: { date: { gte: startDate, lte: endDate }, score: { not: null } },
    select: { zoneId: true, score: true, date: true, status: true },
  });

  // Build zone → scores aggregate
  const zoneScores: Record<string, { scores: number[]; logCount: number; statuses: string[] }> = {};
  for (const log of logs) {
    if (!zoneScores[log.zoneId]) zoneScores[log.zoneId] = { scores: [], logCount: 0, statuses: [] };
    if (log.score !== null) zoneScores[log.zoneId].scores.push(log.score);
    zoneScores[log.zoneId].logCount++;
    zoneScores[log.zoneId].statuses.push(log.status);
  }

  const zoneResults = zones.map((z) => {
    const data = zoneScores[z.id] || { scores: [], logCount: 0, statuses: [] };
    const avgScore = data.scores.length > 0
      ? Math.round(data.scores.reduce((s, n) => s + n, 0) / data.scores.length)
      : null;

    // 5S rating: ≥90=Excellent, ≥70=Good, ≥50=Acceptable, <50=Poor
    const rating = avgScore === null ? "N/A"
      : avgScore >= 90 ? "Xuất sắc"
      : avgScore >= 70 ? "Tốt"
      : avgScore >= 50 ? "Đạt yêu cầu"
      : "Cần cải thiện";

    return {
      zoneId: z.id,
      zoneName: z.name,
      location: z.location,
      frequency: z.frequency,
      logCount: data.logCount,
      avgScore,
      rating,
      minScore: data.scores.length > 0 ? Math.min(...data.scores) : null,
      maxScore: data.scores.length > 0 ? Math.max(...data.scores) : null,
    };
  });

  // Overall 5S score for the month
  const allScores = logs.filter((l) => l.score !== null).map((l) => l.score as number);
  const overallAvg = allScores.length > 0
    ? Math.round(allScores.reduce((s, n) => s + n, 0) / allScores.length)
    : null;

  // HSE incidents in same period for cross-reference
  const hseIncidentCount = await prisma.hSEIncident.count({
    where: { incidentDate: { gte: startDate, lte: endDate } },
  });

  return NextResponse.json({
    data: {
      period: { month, year },
      overall: { avgScore: overallAvg, totalLogs: logs.length, incidentCount: hseIncidentCount },
      zones: zoneResults,
    },
  });
}
