import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { rejectLeave } from "@/services/leave.service";
import { logAudit } from "@/lib/audit";
import prisma from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(userRole, "leaveRequests", "reject")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;

  // MANAGER can only reject requests from their own department
  if (!canDo(userRole, "leaveRequests", "approve2")) {
    const leaveReq = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { select: { departmentId: true } } },
    });
    if (!leaveReq) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

    const approver = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    if (!approver || approver.departmentId !== leaveReq.employee.departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể xử lý đơn nghỉ phép của phòng ban mình" } }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  try {
    const updated = await rejectLeave(id, userId, body.note);
    logAudit({ userId, action: "REJECT", entityType: "LeaveRequest", entityId: id, newValue: { note: body.note } });
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
}
