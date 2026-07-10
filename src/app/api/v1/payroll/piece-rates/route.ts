import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { canDo } from "@/lib/permissions";
import { canViewPayroll } from "@/lib/access";
import { z } from "zod";

const CreateSchema = z.object({
  teamId: z.string().uuid().optional(),          // khoán theo TỔ (lịch sử)
  departmentId: z.string().uuid().optional(),    // khoán theo XƯỞNG (phòng ban) — từ T7/2026
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  projectCode: z.string().min(1),
  totalHours: z.number().min(0),
  unitPrice: z.number().int().min(0),
  completionRate: z.number().min(0).max(1).default(1.0),
}).refine((d) => d.teamId || d.departmentId, { message: "Cần chọn Xưởng (departmentId) hoặc Tổ (teamId)" });

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m7.dongia:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
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
      department: { select: { id: true, name: true } },
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
  if (!canUser(session.user as any, "m7.dongia:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập mục Lương" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { teamId, departmentId, month, year, projectCode, totalHours, unitPrice, completionRate } = parsed.data;

  // Thành viên nhận khoán: theo XƯỞNG (department) hoặc TỔ (team).
  let memberIds: string[];
  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Xưởng/Phòng ban không tồn tại" } }, { status: 404 });
    const emps = await prisma.employee.findMany({ where: { departmentId, status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true } });
    memberIds = emps.map((e) => e.id);
  } else {
    const team = await prisma.productionTeam.findUnique({
      where: { id: teamId! },
      include: { employees: { where: { status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true } } },
    });
    if (!team) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Tổ sản xuất không tồn tại" } }, { status: 404 });
    memberIds = team.employees.map((e) => e.id);
  }

  const memberCount = memberIds.length || 1;
  const totalAmount = Math.round(totalHours * unitPrice * completionRate);

  const record = await prisma.pieceRateRecord.create({
    data: {
      teamId: teamId ?? null,
      departmentId: departmentId ?? null,
      month,
      year,
      projectCode,
      totalHours,
      unitPrice,
      completionRate,
      totalAmount,
      memberCount,
      members: { connect: memberIds.map((id) => ({ id })) },
    },
    include: {
      team: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
