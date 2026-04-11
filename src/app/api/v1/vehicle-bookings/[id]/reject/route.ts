import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const RejectSchema = z.object({
  reason: z.string().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "vehicleBookings", "approve2")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = RejectSchema.safeParse(body);
  const rejectedReason = parsed.success ? parsed.data.reason : undefined;

  const updated = await prisma.vehicleBooking.update({
    where: { id },
    data: { status: "REJECTED", approvedBy: (session.user as any).id, approvedAt: new Date(), rejectedReason },
  });

  if (booking.requester?.user) {
    await prisma.notification.create({
      data: {
        userId: booking.requester.user.id,
        title: "Yêu cầu đặt xe bị từ chối",
        message: `Yêu cầu đặt xe bị từ chối${rejectedReason ? `: ${rejectedReason}` : ""}`,
        type: "REJECTED",
        referenceType: "vehicle_booking",
        referenceId: id,
      },
    });
  }

  return NextResponse.json({ data: updated });
}
