import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { canUser } from "@/lib/permission-catalog";
import { logAudit } from "@/lib/audit";

// Mật khẩu mặc định khi Quản trị HT reset cho 1 tài khoản.
const DEFAULT_PASSWORD = "123456";

// POST — Reset mật khẩu của 1 account về 123456. CHỈ Quản trị hệ thống (ADMIN).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "sys.phanquyen:edit")) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Không có quyền reset mật khẩu người dùng" } },
      { status: 403 }
    );
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, employeeCode: true } });
  if (!user) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy tài khoản" } }, { status: 404 });

  const newHash = await hash(DEFAULT_PASSWORD, 12);
  // forcePasswordChange: true → đăng nhập bằng 123456 xong sẽ BỊ ÉP đổi mật khẩu ngay lần đầu
  // (middleware chuyển hướng về /change-password cho tới khi user đặt mật khẩu mới).
  await prisma.user.update({ where: { id }, data: { passwordHash: newHash, forcePasswordChange: true } });

  // Ghi nhật ký (hành động nhạy cảm) — ai reset, cho tài khoản nào.
  const hdrs = (request as any)?.headers;
  const xff = hdrs?.get?.("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || hdrs?.get?.("x-real-ip") || "").trim() || undefined;
  logAudit({
    userId: (session.user as any).id,
    action: "UPDATE",
    entityType: "Auth",
    entityId: id,
    newValue: { action: "RESET_PASSWORD", target: user.employeeCode, to: "default" },
    ipAddress: ip,
  });

  return NextResponse.json({ data: { success: true } });
}
