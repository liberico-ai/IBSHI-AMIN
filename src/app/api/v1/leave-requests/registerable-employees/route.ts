import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";

// GET — danh sách NV mà người đang đăng nhập có thể ĐĂNG KÝ NGHỈ HỘ.
//  Gate: quyền riêng m3.nghiphep:proxy ("ĐK hộ"). Phạm vi (xin hộ cho ai):
//   - HCNS / BGĐ / ADMIN: tất cả NV đang làm.
//   - Còn lại (vd Xưởng trưởng được cấp proxy): NV trong PHÒNG của mình.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!canUser(session.user as any, "m3.nghiphep:proxy")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const broad = ["HR_ADMIN", "BOM", "ADMIN"].includes(role);

  const where: any = { status: { in: ["ACTIVE", "PROBATION"] }, NOT: { code: { startsWith: "#DEL#" } } };
  if (!broad) {
    // Không phải HR/BGĐ → chỉ xin hộ NV trong phòng/xưởng của mình.
    const me = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (me?.departmentId) where.departmentId = me.departmentId;
    else return NextResponse.json({ data: [] });
  }

  const data = await prisma.employee.findMany({
    where,
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({ data });
}
