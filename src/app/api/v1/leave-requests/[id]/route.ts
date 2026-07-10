import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { id } = await params;
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { include: { department: true } } },
  });

  if (!leaveRequest) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({ data: leaveRequest });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  const { id } = await params;

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { include: { department: true } } },
  });

  if (!leaveRequest) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (leaveRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: { code: "INVALID_STATE", message: "Đơn này đã được xử lý" } },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { action, note } = body as { action: "APPROVE" | "REJECT" | "EDIT"; note?: string };

  // SỬA đơn nghỉ CHỜ DUYỆT — chủ đơn tự sửa hoặc người có quyền m3.nghiphep:edit.
  if (action === "EDIT") {
    const userId = (session.user as any).id;
    const isOwner = leaveRequest.employee.userId === userId;
    if (!isOwner && !canUser(session.user as any, "m3.nghiphep:edit")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ đơn hoặc người có quyền sửa mới sửa được" } }, { status: 403 });
    }
    const { leaveType, startDate, endDate, reason } = body as any;
    const sd = new Date(startDate), ed = new Date(endDate);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày không hợp lệ" } }, { status: 400 });
    if (ed < sd) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Ngày kết thúc phải sau ngày bắt đầu" } }, { status: 400 });
    if (!reason || String(reason).trim().length < 5) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Lý do phải ít nhất 5 ký tự" } }, { status: 400 });
    let totalDays = 0;
    const cur = new Date(sd);
    while (cur <= ed) { if (cur.getDay() !== 0) totalDays += 1; cur.setDate(cur.getDate() + 1); }
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { ...(leaveType ? { leaveType } : {}), startDate: sd, endDate: ed, reason: String(reason).trim(), totalDays },
    });
    return NextResponse.json({ data: updated });
  }

  if (action === "APPROVE") {
    if (!canDo(userRole, "leaveRequests", "approve1")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy: (session.user as any).id,
        approvedAt: new Date(),
      },
    });

    // Deduct annual leave balance
    if (leaveRequest.leaveType === "ANNUAL") {
      await prisma.leaveBalance.updateMany({
        where: {
          employeeId: leaveRequest.employeeId,
          year: new Date().getFullYear(),
        },
        data: {
          usedDays: { increment: leaveRequest.totalDays },
          remainingDays: { decrement: leaveRequest.totalDays },
        },
      });
    }

    // Notify employee
    await prisma.notification.create({
      data: {
        userId: leaveRequest.employee.userId,
        title: "Đơn nghỉ phép được duyệt",
        message: `Đơn nghỉ phép ${leaveRequest.totalDays} ngày của bạn đã được phê duyệt.`,
        type: "APPROVED",
        referenceType: "leave_request",
        referenceId: id,
      },
    });

    return NextResponse.json({ data: updated });
  }

  if (action === "REJECT") {
    if (!canDo(userRole, "leaveRequests", "reject")) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedBy: (session.user as any).id,
        approvedAt: new Date(),
        rejectedReason: note,
      },
    });

    // Notify employee
    await prisma.notification.create({
      data: {
        userId: leaveRequest.employee.userId,
        title: "Đơn nghỉ phép bị từ chối",
        message: `Đơn nghỉ phép của bạn bị từ chối${note ? `: ${note}` : "."}`,
        type: "REJECTED",
        referenceType: "leave_request",
        referenceId: id,
      },
    });

    return NextResponse.json({ data: updated });
  }

  return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
}

// DELETE — xóa đơn nghỉ CHỜ DUYỆT (chủ đơn hoặc người có quyền m3.nghiphep:delete).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await params;
  const lr = await prisma.leaveRequest.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!lr) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (lr.status !== "PENDING") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xóa được đơn đang CHỜ DUYỆT" } }, { status: 400 });
  }
  const isOwner = lr.employee.userId === userId;
  if (!isOwner && !canUser(session.user as any, "m3.nghiphep:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ đơn hoặc người có quyền xóa mới xóa được" } }, { status: 403 });
  }
  await prisma.leaveRequest.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
