import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";

const UpdateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "COMPLETE", "CANCEL"]).optional(),
  rejectedReason: z.string().optional(),
  actualKm: z.number().int().min(0).optional(),
  returnTime: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"]).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;
  const isApprover = canApproveRoomVehicle(employeeCode);

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

  const { action, rejectedReason, actualKm, returnTime } = parsed.data;

  // CANCEL — owner cũng được. APPROVE/REJECT/COMPLETE chỉ approver.
  const isOwner = booking.requester?.user?.id === userId;
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
