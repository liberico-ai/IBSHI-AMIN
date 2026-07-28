import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// GET — danh sách mục ĐỐI SOÁT (lệch giữa kê khai & chấm công). Lọc theo tháng/năm/trạng thái.
//  HR/BGĐ/ADMIN: tất cả. Người khác (phụ trách Xưởng): chỉ phòng ban của mình.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canUser(session.user as any, "m3.doisoat:view")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const status = searchParams.get("status") || "";

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const where: any = { date: { gte: start, lte: end } };
  if (status) where.status = status;
  // Không phải HR/BGĐ → chỉ thấy đối soát của phòng ban mình (phụ trách Xưởng).
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes(role)) {
    const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    where.departmentId = emp?.departmentId ?? "__none__";
  }

  const data = await prisma.attendanceReconcile.findMany({ where, orderBy: [{ date: "desc" }, { departmentName: "asc" }] });
  return NextResponse.json({ data });
}
