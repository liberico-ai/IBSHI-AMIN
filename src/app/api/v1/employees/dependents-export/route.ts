import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

// GET /api/v1/employees/dependents-export
// Danh sách NGƯỜI PHỤ THUỘC của toàn bộ nhân sự (mỗi NPT 1 dòng) — chỉ HR_ADMIN/BOM.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (!canUser(session.user as any, "m1.hoso:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const deps = await prisma.dependent.findMany({
    include: {
      employee: { select: { code: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: [{ employee: { code: "asc" } }, { createdAt: "asc" }],
  });

  // Số NPT đang hiệu lực (chưa dừng) theo từng nhân viên.
  const activeCount = new Map<string, number>();
  for (const d of deps) {
    if (!d.stoppedAt) activeCount.set(d.employeeId, (activeCount.get(d.employeeId) || 0) + 1);
  }

  const rows = deps.map((d) => ({
    code: d.employee?.code || "",
    fullName: d.employee?.fullName || "",
    department: d.employee?.department?.name || "",
    depCount: activeCount.get(d.employeeId) || 0,
    depName: d.fullName,
    relationship: d.relationship,
    dateOfBirth: d.dateOfBirth ? d.dateOfBirth.toISOString() : "",
    taxCode: d.taxCode || "",
    status: d.stoppedAt ? "Đã dừng" : "Đang hiệu lực",
    registeredAt: d.registeredAt ? d.registeredAt.toISOString() : "",
    stoppedAt: d.stoppedAt ? d.stoppedAt.toISOString() : "",
    declaration: d.declaration || "",
  }));

  return NextResponse.json({ data: rows });
}
