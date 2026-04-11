import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/v1/cron/ncr-overdue
// Secured with CRON_SECRET header — call this on a schedule (e.g. daily at 07:00)
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const newlyOverdue = await prisma.nCR.findMany({
    where: { dueDate: { lt: new Date() }, status: { notIn: ["OVERDUE", "CLOSED"] } },
    select: { id: true, ncrNumber: true, description: true, assignedToId: true },
  });

  if (newlyOverdue.length === 0) {
    return NextResponse.json({ data: { updated: 0 } });
  }

  await prisma.nCR.updateMany({
    where: { id: { in: newlyOverdue.map((n) => n.id) } },
    data: { status: "OVERDUE" },
  });

  const hrAdmins = await prisma.user.findMany({
    where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true },
    select: { id: true },
  });
  const hrAdminIds = new Set(hrAdmins.map((u) => u.id));

  for (const ncr of newlyOverdue) {
    const notifyIds = new Set(hrAdminIds);
    if (ncr.assignedToId) {
      const emp = await prisma.employee.findUnique({ where: { id: ncr.assignedToId }, select: { userId: true } });
      if (emp?.userId) notifyIds.add(emp.userId);
    }
    await prisma.notification.createMany({
      data: Array.from(notifyIds).map((userId) => ({
        userId,
        title: "NCR quá hạn xử lý",
        message: `${ncr.ncrNumber}: ${ncr.description.slice(0, 80)} đã quá hạn`,
        type: "HSE_ALERT" as const,
        referenceType: "ncr",
        referenceId: ncr.id,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ data: { updated: newlyOverdue.length } });
}
