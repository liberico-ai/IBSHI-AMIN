import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/permissions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!checkPermission(userRole, "HR_ADMIN")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.vehicleBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: true } } },
  });
  if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const updated = await prisma.vehicleBooking.update({
    where: { id },
    data: { status: "APPROVED", approvedBy: (session.user as any).id, approvedAt: new Date() },
  });

  if (booking.requester?.user) {
    await prisma.notification.create({
      data: {
        userId: booking.requester.user.id,
        title: "Yêu cầu đặt xe được duyệt",
        message: `Yêu cầu đặt xe đến ${booking.destination} đã được duyệt`,
        type: "APPROVED",
        referenceType: "vehicle_booking",
        referenceId: id,
      },
    });
  }

  return NextResponse.json({ data: updated });
}
