import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canApproveRoomVehicle } from "@/lib/access";

const Schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  rejectedReason: z.string().optional(),
});

// PUT /api/v1/vehicles/bookings/series/[seriesId]
// Duyệt / từ chối / huỷ toàn bộ series.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const employeeCode = (session.user as any).employeeCode;

  const { seriesId } = await params;
  const body = Schema.parse(await request.json());

  // Lấy 1 phiếu để xác định owner
  const sample = await prisma.vehicleBooking.findFirst({
    where: { seriesId },
    include: { requester: { select: { userId: true } } },
  });
  if (!sample) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const isOwner = sample.requester?.userId === userId;
  const isApprover = canApproveRoomVehicle(employeeCode);

  if (body.action === "CANCEL") {
    if (!isOwner && !isApprover) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const r = await prisma.vehicleBooking.updateMany({
      where: { seriesId, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ data: { seriesId, cancelled: r.count } });
  }

  // APPROVE / REJECT — chỉ approver
  if (!isApprover) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt phiếu đặt xe" } }, { status: 403 });
  }

  if (body.action === "REJECT") {
    if (!body.rejectedReason) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần lý do từ chối" } }, { status: 400 });
    }
    const r = await prisma.vehicleBooking.updateMany({
      where: { seriesId, status: "PENDING" },
      data: { status: "REJECTED", approvedBy: userId, approvedAt: new Date(), rejectedReason: body.rejectedReason },
    });
    return NextResponse.json({ data: { seriesId, rejected: r.count } });
  }

  // APPROVE
  const pending = await prisma.vehicleBooking.findMany({
    where: { seriesId, status: "PENDING" },
    orderBy: { startDate: "asc" },
  });
  if (pending.length === 0) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Series không có phiếu chờ duyệt" } }, { status: 404 });
  }

  let approved = 0;
  const conflicts: { id: string; date: string; conflictDestination: string }[] = [];

  for (const b of pending) {
    const c = await prisma.vehicleBooking.findFirst({
      where: {
        id: { not: b.id },
        vehicleId: b.vehicleId,
        status: "APPROVED",
        startDate: { lt: b.endDate },
        endDate: { gt: b.startDate },
      },
      select: { destination: true },
    });
    if (c) {
      conflicts.push({ id: b.id, date: b.startDate.toISOString().slice(0, 10), conflictDestination: c.destination });
      continue;
    }
    await prisma.vehicleBooking.update({
      where: { id: b.id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
    approved++;
  }

  return NextResponse.json({ data: { seriesId, approved, skipped: conflicts.length, conflicts } });
}
