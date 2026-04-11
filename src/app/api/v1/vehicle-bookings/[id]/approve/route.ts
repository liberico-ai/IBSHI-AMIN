import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  const userId = (session.user as any).id;
  if (!canDo(userRole, "vehicleBookings", "approve1")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (booking.status === "APPROVED" || booking.status === "REJECTED") {
    return NextResponse.json({ error: { code: "ALREADY_PROCESSED", message: "Yêu cầu này đã được xử lý" } }, { status: 409 });
  }

  const isHrOrAbove = canDo(userRole, "vehicleBookings", "approve2");

  // First-level: MANAGER forwards to HR
  if (booking.status === "PENDING" && !isHrOrAbove) {
    // Dept scope: MANAGER can only approve for their own department
    const approver = await prisma.employee.findFirst({ where: { userId }, select: { departmentId: true } });
    const requester = await prisma.employee.findUnique({ where: { id: booking.requestedBy }, select: { departmentId: true } });
    if (!approver || !requester || approver.departmentId !== requester.departmentId) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ có thể duyệt đặt xe của nhân viên phòng ban mình" } }, { status: 403 });
    }
    const hrAdmins = await prisma.user.findMany({
      where: { role: { in: ["HR_ADMIN"] }, isActive: true },
      select: { id: true },
    });

    const updated = await prisma.vehicleBooking.update({
      where: { id },
      data: { status: "PENDING_HR", approvedBy: userId, approvedAt: new Date() },
    });

    await Promise.all(
      hrAdmins.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            title: "Yêu cầu đặt xe chờ xác nhận xe",
            message: `Trưởng phòng đã duyệt nhu cầu đặt xe đến ${booking.destination}, HC cần xác nhận xe và lịch.`,
            type: "APPROVAL_REQUIRED",
            referenceType: "vehicle_booking",
            referenceId: id,
          },
        })
      )
    );

    logAudit({ userId, action: "APPROVE", entityType: "VehicleBooking", entityId: id, newValue: { status: "PENDING_HR" } });
    return NextResponse.json({ data: updated, message: "Đã chuyển HCNS xác nhận xe" });
  }

  // Final approval: HR_ADMIN or BOM confirms vehicle assignment
  const updated = await prisma.vehicleBooking.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
  });

  if (booking.requester?.user) {
    await prisma.notification.create({
      data: {
        userId: booking.requester.user.id,
        title: "Yêu cầu đặt xe được duyệt",
        message: `Yêu cầu đặt xe đến ${booking.destination} đã được HCNS xác nhận.`,
        type: "APPROVED",
        referenceType: "vehicle_booking",
        referenceId: id,
      },
    });
  }

  logAudit({ userId, action: "APPROVE", entityType: "VehicleBooking", entityId: id, newValue: { status: "APPROVED" } });
  return NextResponse.json({ data: updated, message: "Yêu cầu đặt xe đã được duyệt hoàn tất" });
}
