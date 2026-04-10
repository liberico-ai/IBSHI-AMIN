import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  description: z.string().min(5),
  responsibleDept: z.string().min(1),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: z.string(),
  sourceEventId: z.string().uuid().optional().nullable(),
});

async function autoMarkOverdue() {
  // Find NCRs going overdue for the first time (not yet OVERDUE or CLOSED)
  const newlyOverdue = await prisma.nCR.findMany({
    where: { dueDate: { lt: new Date() }, status: { notIn: ["OVERDUE", "CLOSED"] } },
    select: { id: true, ncrNumber: true, description: true, assignedToId: true },
  });

  if (newlyOverdue.length === 0) return;

  await prisma.nCR.updateMany({
    where: { id: { in: newlyOverdue.map((n) => n.id) } },
    data: { status: "OVERDUE" },
  });

  // Notify HR_ADMIN + assigned employees
  const hrAdmins = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true }, select: { id: true } });
  const notifyUserIds = new Set(hrAdmins.map((u) => u.id));

  for (const ncr of newlyOverdue) {
    if (ncr.assignedToId) {
      const emp = await prisma.employee.findUnique({ where: { id: ncr.assignedToId }, select: { userId: true } });
      if (emp?.userId) notifyUserIds.add(emp.userId);
    }
    await prisma.notification.createMany({
      data: Array.from(notifyUserIds).map((userId) => ({
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
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Auto-mark overdue NCRs on every GET
  await autoMarkOverdue();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const where: any = {};
  if (status) where.status = status;

  const data = await prisma.nCR.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, fullName: true, code: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
  });

  return NextResponse.json({ data });
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

  // Generate sequential NCR number
  const count = await prisma.nCR.count();
  const year = new Date().getFullYear();
  const ncrNumber = `NCR-${year}-${String(count + 1).padStart(3, "0")}`;

  const ncr = await prisma.nCR.create({
    data: {
      ncrNumber,
      description: parsed.data.description,
      responsibleDept: parsed.data.responsibleDept,
      assignedToId: parsed.data.assignedToId ?? null,
      dueDate: new Date(parsed.data.dueDate),
      sourceEventId: parsed.data.sourceEventId ?? null,
      status: "OPEN",
    },
    include: {
      assignedTo: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({ data: ncr }, { status: 201 });
}
