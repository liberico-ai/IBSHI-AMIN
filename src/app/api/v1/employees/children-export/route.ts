import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

// GET /api/v1/employees/children-export
// Danh sách CON CÁI của toàn bộ nhân sự (mỗi con 1 dòng) — chỉ HR_ADMIN/BOM.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  if (!canUser(session.user as any, "m1.hoso:view")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const children = await prisma.child.findMany({
    include: {
      employee: { select: { code: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: [{ employee: { code: "asc" } }, { dateOfBirth: "asc" }],
  });

  const childCount = new Map<string, number>();
  for (const c of children) childCount.set(c.employeeId, (childCount.get(c.employeeId) || 0) + 1);

  const rows = children.map((c) => ({
    code: c.employee?.code || "",
    fullName: c.employee?.fullName || "",
    department: c.employee?.department?.name || "",
    childCount: childCount.get(c.employeeId) || 0,
    childName: c.fullName,
    dateOfBirth: c.dateOfBirth ? c.dateOfBirth.toISOString() : "",
    taxCode: c.taxCode || "",
    idNumber: c.idNumber || "",
    hasDocs: c.documentUrls && c.documentUrls.length > 0 ? "Có" : "Chưa",
  }));

  return NextResponse.json({ data: rows });
}
