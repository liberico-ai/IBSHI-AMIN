import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

const UpdateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "COMPLETE", "CANCEL", "EDIT"]).optional(),
  rejectedReason: z.string().optional(),
  actualKm: z.number().int().min(0).optional(),
  returnTime: z.string().optional(),
  driverName: z.string().optional().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"]).optional(),
  // Sửa chi tiết phiếu (chỉ khi CHỜ DUYỆT) — action = "EDIT"
  vehicleId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  origin: z.string().optional().nullable(),
  destination: z.string().optional(),
  purpose: z.string().optional(),
  passengers: z.number().int().min(1).optional(),
  priority: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Duyệt được nếu: người duyệt chỉ định (cũ) HOẶC có quyền Duyệt qua ma trận + phiếu thuộc PHẠM VI của mình.
  const vscope = await resolveScope(userId, role, "m10.xe.datxe");
  const isApprover = canApproveRoomVehicle(employeeCode, role)
    || ((canUser(session.user as any, "m10.xe.datxe:approve1") || canUser(session.user as any, "m10.xe.datxe:approve2"))
        && scopeAllowsDept(vscope, (booking.requester as any)?.departmentId ?? null));

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { action, rejectedReason, actualKm, returnTime, driverName } = parsed.data;
  const isOwner = booking.requester?.user?.id === userId;

  // EDIT — sửa chuyến CHƯA HOÀN THÀNH (chốt 2026-07-29): PENDING hoặc APPROVED và completedAt==null.
  //   Người có quyền Duyệt sửa MỌI thông tin (kể cả chỉ định lại XE + LÁI XE). Chủ phiếu / người có
  //   quyền sửa vẫn tự sửa được phiếu CHỜ DUYỆT như cũ.
  if (action === "EDIT") {
    const notCompleted = booking.completedAt == null && (booking.status === "PENDING" || booking.status === "APPROVED");
    if (!notCompleted) {
      return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được chuyến CHƯA hoàn thành (chưa huỷ/từ chối)" } }, { status: 400 });
    }
    const canEditNow = isApprover || (booking.status === "PENDING" && (isOwner || canUser(session.user as any, "m10.xe.datxe:edit")));
    if (!canEditNow) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền sửa chuyến này" } }, { status: 403 });
    }
    const d = parsed.data;
    const ed: any = {};
    if (d.vehicleId !== undefined) ed.vehicleId = d.vehicleId;          // chỉ định lại XE
    if (d.startDate !== undefined) ed.startDate = new Date(d.startDate);
    if (d.endDate !== undefined) ed.endDate = new Date(d.endDate);
    if (d.origin !== undefined) ed.origin = d.origin || null;
    if (d.destination !== undefined) ed.destination = d.destination;
    if (d.purpose !== undefined) ed.purpose = d.purpose as any;
    if (d.passengers !== undefined) ed.passengers = d.passengers;
    if (d.priority !== undefined) ed.priority = d.priority;
    if (d.notes !== undefined) ed.notes = d.notes || null;
    if (d.driverName !== undefined) ed.driverName = d.driverName?.trim() || null; // chỉ định lại LÁI XE
    // Check trùng lịch: xe + giờ mới không đụng chuyến ĐÃ DUYỆT khác.
    const vId = ed.vehicleId ?? booking.vehicleId;
    const sd = ed.startDate ?? booking.startDate;
    const edd = ed.endDate ?? booking.endDate;
    if (edd <= sd) return NextResponse.json({ error: { code: "INVALID_RANGE", message: "Ngày/giờ về phải sau ngày/giờ đi" } }, { status: 400 });
    const clash = await prisma.vehicleBooking.findFirst({
      where: { id: { not: id }, vehicleId: vId, status: "APPROVED", startDate: { lte: edd }, endDate: { gte: sd } },
      select: { destination: true },
    });
    if (clash) return NextResponse.json({ error: { code: "CONFLICT", message: `Xe đã có chuyến ĐÃ DUYỆT khác trùng giờ ("${clash.destination}")` } }, { status: 409 });
    const updated = await prisma.vehicleBooking.update({ where: { id }, data: ed });
    return NextResponse.json({ data: updated });
  }

  // Duyệt phải kèm chỉ định lái xe.
  if (action === "APPROVE" && !driverName?.trim()) {
    return NextResponse.json({ error: { code: "DRIVER_REQUIRED", message: "Cần chỉ định lái xe trước khi duyệt" } }, { status: 422 });
  }

  // CANCEL — owner cũng được. APPROVE/REJECT/COMPLETE chỉ approver.
  const isCancel = action === "CANCEL" || parsed.data.status === "CANCELLED";
  if (!isApprover && !(isCancel && isOwner)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền thao tác phiếu này" } }, { status: 403 });
  }

  let newStatus = parsed.data.status;
  if (action === "APPROVE") newStatus = "APPROVED";
  if (action === "REJECT") newStatus = "REJECTED";
  if (action === "COMPLETE") newStatus = "COMPLETED";
  if (action === "CANCEL") newStatus = "CANCELLED";

  const updateData: any = {};
  if (newStatus) updateData.status = newStatus;
  if (action === "APPROVE" || action === "REJECT") {
    updateData.approvedBy = (session.user as any).id;
    updateData.approvedAt = new Date();
  }
  if (rejectedReason && action === "REJECT") updateData.rejectedReason = rejectedReason;
  if (action === "APPROVE" && driverName) updateData.driverName = driverName.trim();
  // Người duyệt CHỈ ĐỊNH XE (đổi xe khác nếu xe user xin không hợp lý) — lưu vào chính vehicleId.
  if (action === "APPROVE" && parsed.data.vehicleId) updateData.vehicleId = parsed.data.vehicleId;
  if (actualKm !== undefined) updateData.actualKm = actualKm;
  if (returnTime !== undefined) updateData.returnTime = returnTime;

  const updated = await prisma.vehicleBooking.update({ where: { id }, data: updateData });

  // Notify requester on approve/reject
  if ((action === "APPROVE" || action === "REJECT") && booking.requester?.user) {
    await prisma.notification.create({
      data: {
        userId: booking.requester.user.id,
        title: action === "APPROVE" ? "Yêu cầu đặt xe được duyệt" : "Yêu cầu đặt xe bị từ chối",
        message:
          action === "APPROVE"
            ? `Yêu cầu đặt xe đến ${booking.destination} đã được duyệt`
            : `Yêu cầu đặt xe bị từ chối: ${rejectedReason}`,
        type: action === "APPROVE" ? "APPROVED" : "REJECTED",
        referenceType: "vehicle_booking",
        referenceId: id,
      },
    });
  }

  return NextResponse.json({ data: updated });
}

// DELETE — xóa hẳn phiếu đặt xe CHỜ DUYỆT (chủ phiếu hoặc người có quyền m10.xe.datxe:delete).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (booking.status !== "PENDING") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ xóa được phiếu đang CHỜ DUYỆT" } }, { status: 400 });
  }
  const isOwner = booking.requester?.user?.id === userId;
  if (!isOwner && !canUser(session.user as any, "m10.xe.datxe:delete")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền xóa mới xóa được" } }, { status: 403 });
  }

  await prisma.vehicleBooking.delete({ where: { id } });
  return NextResponse.json({ data: { ok: true } });
}
