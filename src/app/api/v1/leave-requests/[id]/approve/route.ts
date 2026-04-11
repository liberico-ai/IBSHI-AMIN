import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canDo } from "@/lib/permissions";
import { approveLeave } from "@/services/leave.service";
import { logAudit } from "@/lib/audit";
import prisma from "@/lib/prisma";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(userRole, "leaveRequests", "approve1")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;

  // MANAGER scope check: can only act on requests from their department
  if (!canDo(userRole, "leaveRequests", "approve2")) {
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
    const updated = await approveLeave(id, userId, userRole);
    const isForwarded = updated.status === "PENDING_HR";
    logAudit({ userId, action: "APPROVE", entityType: "LeaveRequest", entityId: id, newValue: { status: updated.status, approverRole: userRole } });
    return NextResponse.json({
      data: updated,
      message: isForwarded
        ? "Đã chuyển HR duyệt cấp 2"
        : "Đơn nghỉ phép đã được duyệt hoàn tất",
    });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ error: { code: "INSUFFICIENT_BALANCE", message: "Nhân viên không còn đủ số ngày phép để duyệt" } }, { status: 422 });
    }
    if (err.message === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: { code: "ALREADY_PROCESSED", message: "Đơn này đã được xử lý trước đó" } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
}
