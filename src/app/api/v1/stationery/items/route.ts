import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { normalizeItemName } from "@/lib/stationery";
import { canManageVpp } from "@/lib/access";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const where = q ? { normalizedName: { contains: normalizeItemName(q) } } : {};
  const data = await prisma.stationeryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: q ? 20 : 500,
  });
  return NextResponse.json({ data });
}

// POST — thêm mặt hàng VPP vào danh mục. CHỈ người trong whitelist VPP (canManageVpp).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  const employeeCode = (session.user as any).employeeCode;
  if (!canManageVpp(role, employeeCode)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền thêm VPP" } }, { status: 403 });
  }

  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const unit = String(body?.unit ?? "").trim();
  const note = body?.note ? String(body.note).trim() : null;
  if (!name || !unit) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần nhập Tên VPP và Đơn vị tính" } }, { status: 400 });
  }

  const normalizedName = normalizeItemName(name);
  const existing = await prisma.stationeryItem.findUnique({ where: { normalizedName } });
  if (existing) {
    return NextResponse.json({ error: { code: "DUPLICATE", message: `"${name}" đã có trong danh sách VPP` } }, { status: 409 });
  }

  const item = await prisma.stationeryItem.create({ data: { name, normalizedName, unit, note } });
  return NextResponse.json({ data: item }, { status: 201 });
}
