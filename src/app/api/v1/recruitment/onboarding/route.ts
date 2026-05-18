import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

// 3 mục cố định cho mọi NV mới
const FIXED_ITEMS: { itemKey: string; title: string; sortOrder: number }[] = [
  { itemKey: "RESUME", title: "Lý lịch tự thuật", sortOrder: 10 },
  { itemKey: "CCCD", title: "Xác minh CCCD/CMND", sortOrder: 20 },
  { itemKey: "FINGERPRINT", title: "Đăng ký vân tay / khuôn mặt", sortOrder: 30 },
];

const CreateSchema = z.object({
  employeeId: z.string().uuid(),
  dueDate: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "read")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const data = await prisma.onboardingChecklist.findMany({
    where: status ? { status } : {},
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      employee: {
        select: {
          id: true, code: true, fullName: true, photo: true, status: true, startDate: true,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "recruitment", "create")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: parsed.data.employeeId },
    select: { id: true, positionId: true },
  });
  if (!employee) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy nhân viên" } }, { status: 404 });

  // Check existing
  const existing = await prisma.onboardingChecklist.findUnique({
    where: { employeeId: employee.id },
  });
  if (existing) {
    return NextResponse.json({ error: { code: "CONFLICT", message: "NV đã có checklist onboarding" } }, { status: 409 });
  }

  // Lấy bằng cấp dynamic theo vị trí
  const reqs = await prisma.positionRequirement.findMany({
    where: { positionId: employee.positionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const dynamicItems = reqs.map((r, idx) => ({
    itemKey: `CERT_${r.id}`,
    title: r.name,
    sortOrder: 100 + idx * 10,
    note: r.description || null,
  }));

  const created = await prisma.onboardingChecklist.create({
    data: {
      employeeId: employee.id,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      items: { create: [...FIXED_ITEMS, ...dynamicItems] },
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      employee: {
        select: {
          id: true, code: true, fullName: true, photo: true, status: true, startDate: true,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
