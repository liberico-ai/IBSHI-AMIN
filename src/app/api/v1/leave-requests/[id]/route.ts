import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";

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
  const { action, note } = body as { action: "APPROVE" | "REJECT"; note?: string };

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
