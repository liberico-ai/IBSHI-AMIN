import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { approveLeave } from "@/services/leave.service";
import prisma from "@/lib/prisma";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!checkPermission(userRole, "MANAGER")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;

  // MANAGER can only approve requests from their own department
  if (!checkPermission(userRole, "HR_ADMIN")) {
    const leaveReq = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { select: { departmentId: true } } },
    });
    if (!leaveReq) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

    const approver = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!approver || approver.departmentId !== leaveReq.employee.departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể duyệt đơn nghỉ phép của phòng ban mình" } }, { status: 403 });
    }
  }

  try {
    const updated = await approveLeave(id, userId);
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
}
