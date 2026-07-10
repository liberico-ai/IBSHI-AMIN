import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const CreateSchema = z.object({
  fullName: z.string().min(1),
  relationship: z.string().min(1), // "Con", "Bố", "Mẹ", "Vợ", "Chồng", "Khác"
  dateOfBirth: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  documentUrls: z.array(z.string()).default([]),
  declaration: z.string().optional().nullable(),
  registeredAt: z.string().optional().nullable(),
});

// Tuổi tính đến hôm nay từ ngày sinh.
function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { id: employeeId } = await params;
  const userRole = (session.user as { role: string }).role;
  const userId = (session.user as { id: string }).id;

  // PII (tên + ngày sinh + MST người phụ thuộc): chỉ chính chủ hoặc HR_ADMIN+ xem được.
  if (!canUser(session.user as any, "m1.npt:view")) {
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

  if (!canUser(session.user as any, "m1.npt:create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Giấy tờ hợp lệ là bắt buộc.
  if (!parsed.data.documentUrls || parsed.data.documentUrls.length === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Vui lòng đính kèm giấy tờ hợp lệ của người phụ thuộc" } }, { status: 422 });
  }
  // NPT trên 18 tuổi phải có khai báo lý do.
  const age = ageFrom(parsed.data.dateOfBirth);
  if (age !== null && age >= 18 && !parsed.data.declaration?.trim()) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Người phụ thuộc trên 18 tuổi cần khai báo lý do (đang đi học, mất khả năng lao động...)" } }, { status: 422 });
  }

  const created = await prisma.dependent.create({
    data: {
      employeeId,
      fullName: parsed.data.fullName,
      relationship: parsed.data.relationship,
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
      taxCode: parsed.data.taxCode || null,
      documentUrls: parsed.data.documentUrls,
      declaration: parsed.data.declaration?.trim() || null,
      registeredAt: parsed.data.registeredAt ? new Date(parsed.data.registeredAt) : new Date(),
    },
  });

  // Sync Employee.dependents counter (M7 thuế TNCN) — chỉ đếm NPT đang hiệu lực (chưa dừng).
  const count = await prisma.dependent.count({ where: { employeeId, stoppedAt: null } });
  await prisma.employee.update({ where: { id: employeeId }, data: { dependents: count } });

  return NextResponse.json({ data: created }, { status: 201 });
}
