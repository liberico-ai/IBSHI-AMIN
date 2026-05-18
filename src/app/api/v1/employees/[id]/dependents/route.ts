import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CreateSchema = z.object({
  fullName: z.string().min(1),
  relationship: z.string().min(1), // "Con", "Bố", "Mẹ", "Vợ", "Chồng", "Khác"
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: employeeId } = await params;
  const userRole = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  // PII (tên + ngày sinh + MST người phụ thuộc): chỉ chính chủ hoặc HR_ADMIN+ xem được.
  if (!canDo(userRole, "employees", "readAll")) {
    const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (!target || target.userId !== userId) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  const data = await prisma.dependent.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const created = await prisma.dependent.create({
    data: {
      employeeId,
      fullName: parsed.data.fullName,
      relationship: parsed.data.relationship,
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
      taxCode: parsed.data.taxCode || null,
    },
  });

  // Sync Employee.dependents counter (legacy field cho M7 thuế TNCN)
  const count = await prisma.dependent.count({ where: { employeeId } });
  await prisma.employee.update({ where: { id: employeeId }, data: { dependents: count } });

  return NextResponse.json({ data: created }, { status: 201 });
}
