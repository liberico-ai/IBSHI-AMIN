import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Xem danh sách người dùng: theo ma trận (sys.phanquyen:view). ADMIN tự động có.
  if (!canUser(session.user as any, "sys.phanquyen:view")) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Không có quyền xem danh sách người dùng" } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || "";
  const isActive = searchParams.get("isActive");

  const where: any = {};
  if (role) where.role = role;
  if (isActive !== null) where.isActive = isActive === "true";

  const data = await prisma.user.findMany({
    where,
    select: {
      id: true, employeeCode: true, email: true, role: true, isActive: true, createdAt: true,
      employee: { select: { id: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  // Sửa vai trò/trạng thái tài khoản: theo ma trận (sys.phanquyen:edit). ADMIN tự động có.
  if (!canUser(session.user as any, "sys.phanquyen:edit")) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Không có quyền sửa vai trò/tài khoản người dùng" } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { userId, role, isActive } = body;

  if (!userId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Thiếu thông tin người dùng cần cập nhật" } },
      { status: 422 }
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: { id: true, employeeCode: true, email: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: "UPDATE",
        entityType: "User",
        entityId: userId,
        newValue: JSON.stringify({ role, isActive }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json(
      { error: { code: "UPDATE_FAILED", message: "Cập nhật vai trò thất bại, vui lòng thử lại" } },
      { status: 500 }
    );
  }
}
