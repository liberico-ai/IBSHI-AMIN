import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// XÓA MỀM nhân sự — KHÁC "Nghỉ việc":
//   - Ẩn hoàn toàn khỏi mọi danh sách (mã gắn tiền tố "#DEL#" → bị lọc ở API list).
//   - GIẢI PHÓNG các định danh (CCCD/email/SĐT/mã) để có thể tạo lại 1 nhân sự
//     mới với thông tin y hệt.
//   - GIỮ nguyên dữ liệu (soft) — vẫn khôi phục/đối chiếu được nếu cần.
// RÀNG BUỘC: chỉ xóa mềm được nhân sự ĐÃ ở trạng thái RESIGNED (Nghỉ việc).
// Không đổi schema DB (dùng đúng các cột sẵn có).

const DEL = "#DEL#";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  // Quyền xóa nhân sự theo ma trận phân quyền (m1.hoso:delete).
  if (!canUser(session.user as any, "m1.hoso:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Không có quyền xóa nhân sự" } }, { status: 403 });
  }

  const { id } = await params;
  const emp = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
  if (!emp) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (emp.code.startsWith(DEL)) {
    return NextResponse.json({ error: { code: "ALREADY_DELETED", message: "Nhân sự này đã bị xóa" } }, { status: 400 });
  }
  // BẮT BUỘC đã nghỉ việc mới xóa được.
  if (emp.status !== "RESIGNED") {
    return NextResponse.json(
      { error: { code: "NOT_RESIGNED", message: "Chỉ xóa được nhân sự đã ở trạng thái Nghỉ việc" } },
      { status: 400 }
    );
  }

  const stamp = Date.now();
  await prisma.$transaction([
    prisma.employee.update({
      where: { id },
      data: {
        code: `${DEL}${emp.code}`,                        // marker + giải phóng mã
        idNumber: `${DEL}${stamp}#${emp.idNumber}`,       // giải phóng CCCD
        phone: "",                                         // giải phóng SĐT (đăng nhập)
      },
    }),
    prisma.user.update({
      where: { id: emp.userId },
      data: {
        isActive: false,
        email: `del${stamp}.${emp.user.email}`,            // giải phóng email (unique)
        employeeCode: `${DEL}${emp.user.employeeCode}`,    // giải phóng mã đăng nhập
        ...(emp.user.erpCode ? { erpCode: `${DEL}${stamp}#${emp.user.erpCode}` } : {}),
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: (session.user as any).id,
      action: "DELETE",
      entityType: "Employee",
      entityId: id,
      newValue: JSON.stringify({ softDelete: true, code: emp.code, fullName: emp.fullName, idNumber: emp.idNumber }),
    },
  });

  return NextResponse.json({ data: { success: true } });
}
