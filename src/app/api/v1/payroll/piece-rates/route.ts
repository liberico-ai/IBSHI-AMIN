import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  teamId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  projectCode: z.string().min(1),
  totalHours: z.number().min(0),
  unitPrice: z.number().int().min(0),
  completionRate: z.number().min(0).max(1).default(1.0),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined;
  const teamId = searchParams.get("teamId") ?? undefined;

  const where: any = {};
  if (month) where.month = month;
  if (year) where.year = year;
  if (teamId) where.teamId = teamId;

  const records = await prisma.pieceRateRecord.findMany({
    where,
    include: {
      team: { select: { id: true, name: true, teamType: true } },
      members: { select: { id: true, code: true, fullName: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return NextResponse.json({ data: records });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { teamId, month, year, projectCode, totalHours, unitPrice, completionRate } = parsed.data;

  // Verify team exists
  const team = await prisma.productionTeam.findUnique({
    where: { id: teamId },
    include: { employees: { where: { status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true } } },
  });
  if (!team) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Tổ sản xuất không tồn tại" } }, { status: 404 });

  const memberCount = team.employees.length || 1;
  const totalAmount = Math.round(totalHours * unitPrice * completionRate);

  const record = await prisma.pieceRateRecord.create({
    data: {
      teamId,
      month,
      year,
      projectCode,
      totalHours,
      unitPrice,
      completionRate,
      totalAmount,
      memberCount,
      members: { connect: team.employees.map((e) => ({ id: e.id })) },
    },
    include: {
      team: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
