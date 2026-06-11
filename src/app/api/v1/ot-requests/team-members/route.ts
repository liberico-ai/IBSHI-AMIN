import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canSeeOTTab } from "@/lib/ot-access";

// GET — danh sách NV (đang làm, có Tổ) để chọn khi đề xuất OT.
//  - Tổ trưởng / Trưởng phòng: NV trong PHÒNG của mình.
//  - HCNS / BGĐ: tất cả NV có Tổ.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const emp = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true, jobRole: true, teamId: true } });
  if (!canSeeOTTab({ jobRole: emp?.jobRole, role })) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const where: any = { status: { in: ["ACTIVE", "PROBATION"] }, teamId: { not: null } };
  if (["HR_ADMIN", "BOM"].includes(role)) {
    // HCNS / BGĐ: tất cả NV có tổ.
  } else if (emp?.jobRole === "Tổ trưởng" && emp?.teamId) {
    where.teamId = emp.teamId; // Tổ trưởng → CHỈ tổ mình phụ trách.
  } else if (emp?.departmentId) {
    where.departmentId = emp.departmentId; // Trưởng phòng → cả phòng.
  }

  const data = await prisma.employee.findMany({
    where,
    select: { id: true, fullName: true, team: { select: { id: true, name: true } } },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json({ data });
}
