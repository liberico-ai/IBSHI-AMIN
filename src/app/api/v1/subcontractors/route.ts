import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// Danh mục nhà thầu phụ. Đọc: mọi người dùng đã đăng nhập (form đăng ký suất ăn cần).
// Thêm/sửa/xóa: HCNS (HR_ADMIN / BOM).
function canManage(role: string): boolean {
  return role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
}

const CreateSchema = z.object({
  name: z.string().min(1, "Tên nhà thầu là bắt buộc"),
  companyName: z.string().min(1, "Tên công ty là bắt buộc"),
  phone: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";

  const data = await prisma.subcontractor.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data, meta: { canManage: canManage((session.user as any).role) } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canManage(role)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ HCNS được quản lý nhà thầu" } }, { status: 403 });

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const b = parsed.data;

  const existing = await prisma.subcontractor.findUnique({ where: { name: b.name.trim() } });
  if (existing) return NextResponse.json({ error: { code: "CONFLICT", message: "Tên nhà thầu đã tồn tại" } }, { status: 409 });

  const data = await prisma.subcontractor.create({
    data: {
      name: b.name.trim(),
      companyName: b.companyName.trim(),
      phone: b.phone?.trim() || null,
      note: b.note?.trim() || null,
      active: b.active,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}
