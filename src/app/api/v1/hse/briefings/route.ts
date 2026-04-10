import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const BriefingSchema = z.object({
  date: z.string(),
  topic: z.string().min(1),
  presenter: z.string().uuid(),
  departmentId: z.string().uuid(),
  totalAttendees: z.number().int().min(0),
  totalTarget: z.number().int().min(1),
  notes: z.string().optional().nullable(),
});

// GET /api/v1/hse/briefings?departmentId=...&year=...
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId");
  const year = searchParams.get("year");

  const where: any = {};
  if (departmentId) where.departmentId = departmentId;
  if (year) {
    where.date = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31T23:59:59`),
    };
  }

  const briefings = await prisma.safetyBriefing.findMany({
    where,
    include: {
      presenterEmployee: { select: { code: true, fullName: true } },
      department: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  // Flag low-attendance briefings (<85%)
  const flagged = briefings.map((b) => ({
    ...b,
    attendanceRate: b.totalTarget > 0
      ? Math.round((b.totalAttendees / b.totalTarget) * 100 * 10) / 10
      : 0,
    lowAttendance: b.totalTarget > 0 && (b.totalAttendees / b.totalTarget) < 0.85,
  }));

  return NextResponse.json({ data: flagged });
}

// POST /api/v1/hse/briefings
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = BriefingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const briefing = await prisma.safetyBriefing.create({
    data: {
      date: new Date(parsed.data.date),
      topic: parsed.data.topic,
      presenter: parsed.data.presenter,
      departmentId: parsed.data.departmentId,
      totalAttendees: parsed.data.totalAttendees,
      totalTarget: parsed.data.totalTarget,
      notes: parsed.data.notes ?? null,
    },
    include: {
      presenterEmployee: { select: { code: true, fullName: true } },
      department: { select: { name: true } },
    },
  });

  const attendanceRate = Math.round((briefing.totalAttendees / briefing.totalTarget) * 100 * 10) / 10;

  // Alert if attendance < 85%
  if (attendanceRate < 85) {
    const managers = await prisma.user.findMany({
      where: { role: { in: ["HR_ADMIN", "BOM", "MANAGER"] }, isActive: true },
      select: { id: true },
    });
    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((u) => ({
          userId: u.id,
          title: "Cảnh báo: Tỷ lệ tham dự briefing thấp",
          message: `Buổi briefing "${briefing.topic}" chỉ đạt ${attendanceRate}% tham dự (${briefing.totalAttendees}/${briefing.totalTarget}). Cần theo dõi.`,
          type: "HSE_ALERT" as const,
          referenceType: "safety_briefing",
          referenceId: briefing.id,
        })),
      });
    }
  }

  return NextResponse.json({ data: { ...briefing, attendanceRate } }, { status: 201 });
}
