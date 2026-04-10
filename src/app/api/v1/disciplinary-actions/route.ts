import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  employeeId: z.string().uuid(),
  violationType: z.string().min(2),
  regulationId: z.string().uuid().optional().nullable(),
  description: z.string().min(5),
  penalty: z.string().min(2),
  decisionNumber: z.string().optional().nullable(),
  effectiveDate: z.string(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") || "";
  const status = searchParams.get("status") || "";

  const where: any = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const data = await prisma.disciplinaryAction.findMany({
    where,
    include: {
      employee: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } },
      regulation: { select: { id: true, code: true, title: true } },
    },
    orderBy: { effectiveDate: "desc" },
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

  const employee = await prisma.employee.findUnique({
    where: { id: parsed.data.employeeId },
    include: { user: true },
  });
  if (!employee) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });

  const action = await prisma.disciplinaryAction.create({
    data: {
      ...parsed.data,
      effectiveDate: new Date(parsed.data.effectiveDate),
      status: "PENDING",
    },
    include: {
      employee: { select: { id: true, code: true, fullName: true } },
      regulation: { select: { id: true, code: true, title: true } },
    },
  });

  // Notify the employee
  if (employee.user) {
    await prisma.notification.create({
      data: {
        userId: employee.user.id,
        title: "Thông báo xử lý kỷ luật",
        message: `Bạn có quyết định kỷ luật: ${parsed.data.penalty}. Ngày hiệu lực: ${new Date(parsed.data.effectiveDate).toLocaleDateString("vi-VN")}`,
        type: "SYSTEM",
        referenceType: "disciplinary",
        referenceId: action.id,
      },
    });
  }

  return NextResponse.json({ data: action }, { status: 201 });
}
