import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canUser } from "@/lib/permission-catalog";
import { scopeDeptIds } from "@/lib/data-scope.server";

// GET — danh sách NV mà người đang đăng nhập có thể ĐĂNG KÝ NGHỈ HỘ.
//  Gate: quyền riêng m3.nghiphep:proxy ("ĐK hộ"). Phạm vi (xin hộ cho ai) theo Phạm vi dữ liệu:
//   - scope = Tất cả (HCNS/BGĐ/ADMIN hoặc được cấp "Tất cả"): mọi NV đang làm.
//   - được cấp phòng cụ thể (vd 5 Xưởng): NV các phòng đó.
//   - mặc định: NV trong PHÒNG của mình.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!canUser(session.user as any, "m3.nghiphep:proxy")) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const where: any = { status: { in: ["ACTIVE", "PROBATION"] }, NOT: { code: { startsWith: "#DEL#" } } };
  const deptIds = await scopeDeptIds(userId, role, "m3.nghiphep");
  if (deptIds !== null) {
    if (deptIds.length === 0) return NextResponse.json({ data: [] });
    where.departmentId = { in: deptIds };
  }

  const data = await prisma.employee.findMany({
    where,
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({ data });
}
