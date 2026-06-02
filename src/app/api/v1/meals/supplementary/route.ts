import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

// Đăng ký suất ăn BỔ SUNG: đăng ký 24/7 (không chốt giờ), cần TP HCNS (HR_ADMIN/BOM) duyệt.
const CreateSchema = z.object({
  departmentId: z.string().uuid(),
  date: z.string(),
  mealType: z.enum(["LUNCH", "DINNER"]).default("LUNCH"),
  personType: z.enum(["EMPLOYEE", "GUEST", "SUBCONTRACTOR"]).default("EMPLOYEE"),
  quantity: z.number().int().min(1),
  guestUnitPrice: z.number().int().min(0).default(0),
  subcontractorName: z.string().optional().nullable(),
  reason: z.string().min(1),
  specialNote: z.string().optional().nullable(),
});

function canApprove(role: string): boolean {
  return role === "HR_ADMIN" || role === "BOM";
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  // TP HCNS / BOM xem tất cả; người khác chỉ xem phiếu mình tạo.
  const where: any = {};
  if (!canApprove(role)) where.requestedBy = userId;
  if (status) where.status = status;
  if (from || to) {
    const f = from ? new Date(new Date(from).setHours(0, 0, 0, 0)) : undefined;
    const t = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined;
    where.date = { ...(f && { gte: f }), ...(t && { lte: t }) };
  }

  const data = await prisma.mealSupplementaryRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      department: { select: { id: true, name: true } },
      requester: { select: { id: true, email: true, employee: { select: { fullName: true, code: true } } } },
      approver: { select: { id: true, employee: { select: { fullName: true } } } },
    },
  });
  return NextResponse.json({ data, canApprove: canApprove(role) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(role, "meals", "register")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }
  const b = parsed.data;

  const data = await prisma.mealSupplementaryRequest.create({
    data: {
      departmentId: b.departmentId,
      date: new Date(b.date),
      mealType: b.mealType,
      personType: b.personType,
      quantity: b.quantity,
      guestUnitPrice: b.personType === "GUEST" ? b.guestUnitPrice : 0,
      subcontractorName: b.personType === "SUBCONTRACTOR" ? (b.subcontractorName || null) : null,
      reason: b.reason,
      specialNote: b.specialNote || null,
      requestedBy: userId,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}
