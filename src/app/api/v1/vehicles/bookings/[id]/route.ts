import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";

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
  const isApprover = canApproveRoomVehicle(employeeCode, (session.user as any).role);

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { action, rejectedReason, actualKm, returnTime, driverName } = parsed.data;
  const isOwner = booking.requester?.user?.id === userId;

  // EDIT — sửa chi tiết phiếu CHỜ DUYỆT (chủ phiếu tự sửa, hoặc người có quyền m10.xe.datxe:edit).
  if (action === "EDIT") {
    if (booking.status !== "PENDING") {
      return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ sửa được phiếu đang CHỜ DUYỆT" } }, { status: 400 });
    }
    if (!isOwner && !canUser(session.user as any, "m10.xe.datxe:edit")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc người có quyền sửa mới sửa được" } }, { status: 403 });
    }
    const d = parsed.data;
    const ed: any = {};
    if (d.vehicleId !== undefined) ed.vehicleId = d.vehicleId;
    if (d.startDate !== undefined) ed.startDate = new Date(d.startDate);
    if (d.endDate !== undefined) ed.endDate = new Date(d.endDate);
    if (d.origin !== undefined) ed.origin = d.origin || null;
    if (d.destination !== undefined) ed.destination = d.destination;
    if (d.purpose !== undefined) ed.purpose = d.purpose as any;
    if (d.passengers !== undefined) ed.passengers = d.passengers;
    if (d.priority !== undefined) ed.priority = d.priority;
    if (d.notes !== undefined) ed.notes = d.notes || null;
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
