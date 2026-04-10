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

export async function approveLeave(id: string, approvedById: string) {
  const req = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id },
    include: { employee: { select: { userId: true } } },
  });

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: approvedById, approvedAt: new Date() },
  });

  if (req.leaveType === "ANNUAL") {
    await prisma.leaveBalance.updateMany({
      where: { employeeId: req.employeeId, year: new Date().getFullYear() },
      data: { usedDays: { increment: req.totalDays }, remainingDays: { decrement: req.totalDays } },
    });
  }

  await prisma.notification.create({
    data: {
      userId: req.employee.userId,
      title: "Đơn nghỉ phép được duyệt",
      message: `Đơn nghỉ phép ${req.totalDays} ngày của bạn đã được phê duyệt.`,
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
