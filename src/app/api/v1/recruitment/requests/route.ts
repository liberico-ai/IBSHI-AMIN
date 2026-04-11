import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  departmentId: z.string().uuid(),
  positionName: z.string().min(2),
  quantity: z.number().int().min(1).default(1),
  reason: z.string().min(5),
  requirements: z.string().default(""),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const userRole = (session.user as any).role;

  const where: any = {};
  if (status) where.status = status;

  // MANAGER sees only their department's requests
  if (userRole === "MANAGER") {
    const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
    if (emp) where.departmentId = emp.departmentId;
  }

  const data = await prisma.recruitmentRequest.findMany({
    where,
    include: {
      department: true,
      candidates: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "read")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const req = await prisma.recruitmentRequest.create({
    data: {
      ...parsed.data,
      requestedBy: emp.id,
      status: "PENDING",
    },
    include: { department: true },
  });

  // Notify BOM
  const bomUsers = await prisma.user.findMany({ where: { role: "BOM", isActive: true } });
  await Promise.all(
    bomUsers.map((u) =>
      prisma.notification.create({
        data: {
          userId: u.id,
          title: "Đề xuất tuyển dụng mới",
          message: `${emp.fullName} đề xuất tuyển ${parsed.data.quantity} ${parsed.data.positionName} cho ${req.department.name}`,
          type: "APPROVAL_REQUIRED",
          referenceType: "recruitment",
          referenceId: req.id,
        },
      })
    )
  );

  return NextResponse.json({ data: req }, { status: 201 });
}
