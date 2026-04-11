import prisma from "@/lib/prisma";

export async function createLeaveRequest(data: {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
}) {
  return prisma.leaveRequest.create({
    data: {
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      leaveType: data.leaveType as any,
      status: "PENDING",
    },
  });
}

/**
 * Multi-level approval:
 * - TEAM_LEAD / MANAGER + status=PENDING → PENDING_HR (notify HR)
 * - HR_ADMIN / BOM + status=PENDING|PENDING_HR → APPROVED (check balance if ANNUAL)
 */
export async function approveLeave(id: string, approvedById: string, approverRole: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id },
    include: { employee: { select: { userId: true } } },
  });

  if (req.status === "APPROVED" || req.status === "REJECTED") {
    throw new Error("ALREADY_PROCESSED");
  }

  const year = new Date().getFullYear();
  const isHrOrAbove = approverRole === "HR_ADMIN" || approverRole === "BOM";

  // First-level approval: TEAM_LEAD / MANAGER forwards to HR
  if (req.status === "PENDING" && !isHrOrAbove) {
    const hrAdmins = await prisma.user.findMany({
      where: { role: { in: ["HR_ADMIN"] }, isActive: true },
      select: { id: true },
    });

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: "PENDING_HR", approvedBy: approvedById, approvedAt: new Date() },
    });

    await Promise.all(
      hrAdmins.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            title: "Đơn nghỉ phép chờ duyệt cấp 2",
            message: `Trưởng phòng đã xác nhận, đơn nghỉ ${req.totalDays} ngày chờ HC duyệt lần cuối.`,
            type: "APPROVAL_REQUIRED",
            referenceType: "leave_request",
            referenceId: id,
          },
        })
      )
    );

    return updated;
  }

  // Final approval: HR_ADMIN or BOM (can approve PENDING or PENDING_HR)
  if (req.leaveType === "ANNUAL") {
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId: req.employeeId, year } },
    });
    if (!balance || balance.remainingDays < req.totalDays) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: approvedById, approvedAt: new Date() },
  });

  // Update balance for ALL leave types
  if (req.leaveType === "ANNUAL") {
    await prisma.leaveBalance.updateMany({
      where: { employeeId: req.employeeId, year },
      data: { usedDays: { increment: req.totalDays }, remainingDays: { decrement: req.totalDays } },
    });
  } else {
    await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId: req.employeeId, year } },
      update: { usedDays: { increment: req.totalDays } },
      create: {
        employeeId: req.employeeId,
        year,
        totalDays: 0,
        usedDays: req.totalDays,
        remainingDays: 0,
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: req.employee.userId,
      title: "Đơn nghỉ phép được duyệt",
      message: `Đơn nghỉ phép ${req.totalDays} ngày của bạn đã được phê duyệt hoàn tất.`,
      type: "APPROVED",
      referenceType: "leave_request",
      referenceId: id,
    },
  });

  return updated;
}

export async function rejectLeave(id: string, approvedById: string, note?: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id },
    include: { employee: { select: { userId: true } } },
  });

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedBy: approvedById, approvedAt: new Date(), rejectedReason: note },
  });

  await prisma.notification.create({
    data: {
      userId: req.employee.userId,
      title: "Đơn nghỉ phép bị từ chối",
      message: `Đơn nghỉ phép của bạn bị từ chối${note ? `: ${note}` : "."}`,
      type: "REJECTED",
      referenceType: "leave_request",
      referenceId: id,
    },
  });

  return updated;
}

export async function getLeaveBalance(employeeId: string, year?: number) {
  const y = year ?? new Date().getFullYear();
  return prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId, year: y } } });
}
