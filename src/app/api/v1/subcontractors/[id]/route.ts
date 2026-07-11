import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.thaufu:edit")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền sửa nhà thầu" } }, { status: 403 });

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const b = parsed.data;

  // Nếu đổi tên → kiểm tra trùng với nhà thầu khác.
  if (b.name) {
    const dup = await prisma.subcontractor.findFirst({ where: { name: b.name.trim(), NOT: { id } } });
    if (dup) return NextResponse.json({ error: { code: "CONFLICT", message: "Tên nhà thầu đã tồn tại" } }, { status: 409 });
  }

  const data = await prisma.subcontractor.update({
    where: { id },
    data: {
      ...(b.name !== undefined && { name: b.name.trim() }),
      ...(b.companyName !== undefined && { companyName: b.companyName.trim() }),
      ...(b.phone !== undefined && { phone: b.phone?.trim() || null }),
      ...(b.note !== undefined && { note: b.note?.trim() || null }),
      ...(b.active !== undefined && { active: b.active }),
    },
  });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.thaufu:delete")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền xóa nhà thầu" } }, { status: 403 });

  const { id } = await params;
  await prisma.subcontractor.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
