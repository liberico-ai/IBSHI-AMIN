import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canUser } from "@/lib/permission-catalog";

// Thực đơn (các món ăn dự định nấu trong ngày). Danh sách thực phẩm mua đi cùng 1 thực đơn.
const CreateSchema = z.object({
  date: z.string(),
  name: z.string().optional().nullable(),
  dishes: z.array(z.string().min(1)).default([]),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const data = await prisma.foodMenu.findMany({
    where: { date: { gte: start, lte: end } },
    include: { purchases: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data, meta: { canManage: canUser(session.user as any, "m10.nhaan.chiphi:edit") } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  if (!canUser(session.user as any, "m10.nhaan.chiphi:edit")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền quản lý thực đơn" } }, { status: 403 });

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  const { date, name, dishes } = parsed.data;

  const menu = await prisma.foodMenu.create({
    data: { date: new Date(date), name: name?.trim() || null, dishes: dishes.map((d) => d.trim()).filter(Boolean), createdBy: userId },
    include: { purchases: true },
  });
  return NextResponse.json({ data: menu }, { status: 201 });
}

// Sửa thực đơn (ngày / nhãn / danh sách món).
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.chiphi:edit")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = await request.json();
  const { id, date, name, dishes } = body as { id?: string; date?: string; name?: string | null; dishes?: string[] };
  if (!id) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu id" } }, { status: 400 });
  const data: any = {};
  if (date) data.date = new Date(date);
  if (name !== undefined) data.name = name?.trim() || null;
  if (Array.isArray(dishes)) data.dishes = dishes.map((d) => (d || "").trim()).filter(Boolean);
  const menu = await prisma.foodMenu.update({ where: { id }, data, include: { purchases: { orderBy: { createdAt: "asc" } } } });
  return NextResponse.json({ data: menu });
}

// Xóa thực đơn (cascade xóa luôn danh sách thực phẩm của thực đơn).
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m10.nhaan.chiphi:edit")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Thiếu id" } }, { status: 400 });
  await prisma.foodMenu.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
