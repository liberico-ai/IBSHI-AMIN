import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "cleaning", "manage")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  // Try schedule first, then zone
  const schedule = await prisma.cleaningSchedule.findUnique({ where: { id } });
  if (schedule) {
    const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
    const updated = await prisma.cleaningSchedule.update({
      where: { id },
      data: {
        completedAt: body.completed ? new Date() : null,
        completedBy: body.completed && emp ? emp.id : null,
        qualityScore: body.qualityScore ?? schedule.qualityScore,
        notes: body.notes ?? schedule.notes,
      },
      include: { zone: true },
    });
    return NextResponse.json({ data: updated });
  }

  // Zone update
  const zone = await prisma.cleaningZone.findUnique({ where: { id } });
  if (!zone) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const updated = await prisma.cleaningZone.update({ where: { id }, data: body });
  return NextResponse.json({ data: updated });
}
