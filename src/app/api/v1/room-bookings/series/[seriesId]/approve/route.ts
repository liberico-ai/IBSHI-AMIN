import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";

// POST /api/v1/room-bookings/series/[seriesId]/approve
// Duyệt cả series. Với mỗi phiếu PENDING_APPROVAL trong series:
//   - Check conflict với APPROVED khác (ngoài series). Có conflict → giữ PENDING, push vào conflicts[].
//   - Không conflict → set APPROVED.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  if (!canApproveRoomVehicle(employeeCode))
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt phiếu đặt phòng họp" } }, { status: 403 });

  const { seriesId } = await params;
  const userId = (session.user as any).id;

  const pending = await prisma.roomBooking.findMany({
    where: { seriesId, status: "PENDING_APPROVAL" },
    orderBy: { startTime: "asc" },
  });
  if (pending.length === 0) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Series không có phiếu chờ duyệt" } }, { status: 404 });
  }

  let approved = 0;
  const conflicts: { id: string; date: string; conflictTitle: string }[] = [];

  for (const b of pending) {
    const c = await prisma.roomBooking.findFirst({
      where: {
        id: { not: b.id },
        roomId: b.roomId,
        status: "APPROVED",
        startTime: { lt: b.endTime },
        endTime: { gt: b.startTime },
      },
      select: { title: true },
    });
    if (c) {
      conflicts.push({ id: b.id, date: b.startTime.toISOString().slice(0, 10), conflictTitle: c.title });
      continue;
    }
    await prisma.roomBooking.update({
      where: { id: b.id },
      data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
    });
    approved++;
  }

  return NextResponse.json({ data: { seriesId, approved, skipped: conflicts.length, conflicts } });
}
