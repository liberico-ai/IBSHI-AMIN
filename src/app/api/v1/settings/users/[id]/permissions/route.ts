import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ALL_PERMS, templatePerms, canUser } from "@/lib/permission-catalog";
import { z } from "zod";

// GET — lấy ma trận quyền hiện tại của 1 account.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "sys.phanquyen:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, include: { accessGrant: true } });
  if (!user) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  return NextResponse.json({
    data: {
      role: user.role,
      custom: !!user.accessGrant,                             // đã tùy chỉnh riêng chưa
      perms: user.accessGrant ? user.accessGrant.perms : null, // null = theo gói mẫu
      template: Array.from(templatePerms(user.role)),          // gợi ý mặc định của Nhóm quyền
    },
  });
}

const PutSchema = z.object({ perms: z.array(z.string()) });

// PUT — lưu ma trận riêng cho account (đè lên gói mẫu).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "sys.phanquyen:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });

  // Chỉ giữ các ô quyền HỢP LỆ (có trong danh mục).
  const valid = new Set(ALL_PERMS);
  const perms = Array.from(new Set(parsed.data.perms.filter((p) => valid.has(p))));

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  await prisma.accessGrant.upsert({
    where: { userId: id },
    create: { userId: id, perms, updatedBy: (session.user as any).id },
    update: { perms, updatedBy: (session.user as any).id },
  });

  return NextResponse.json({ data: { success: true, perms } });
}

// DELETE — bỏ ma trận riêng → account quay về theo gói mẫu của Nhóm quyền.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "sys.phanquyen:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  await prisma.accessGrant.deleteMany({ where: { userId: id } });
  return NextResponse.json({ data: { success: true } });
}
