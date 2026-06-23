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
  if (!canApproveRoomVehicle(employeeCode, (session.user as any).role))
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

  // Tối ưu: thay vì N query/phiếu (chậm 30s–1p với DB từ xa), gộp còn 2 query —
  // lấy 1 lần mọi phiếu APPROVED khả nghi trong các phòng + khung thời gian, check trùng
  // trong bộ nhớ, rồi updateMany 1 lần.
  const pendingIds = new Set(pending.map((b) => b.id));
  const roomIds = Array.from(new Set(pending.map((b) => b.roomId)));
  let minStart = pending[0].startTime, maxEnd = pending[0].endTime;
  for (const b of pending) {
    if (b.startTime < minStart) minStart = b.startTime;
    if (b.endTime > maxEnd) maxEnd = b.endTime;
  }

  const approvedOthers = (await prisma.roomBooking.findMany({
    where: {
      roomId: { in: roomIds },
      status: "APPROVED",
      startTime: { lt: maxEnd },
      endTime: { gt: minStart },
    },
    select: { id: true, roomId: true, startTime: true, endTime: true, title: true },
  })).filter((o) => !pendingIds.has(o.id));

  const toApprove: string[] = [];
  const conflicts: { id: string; date: string; conflictTitle: string }[] = [];
  for (const b of pending) {
    const c = approvedOthers.find((o) => o.roomId === b.roomId && o.startTime < b.endTime && o.endTime > b.startTime);
    if (c) {
      conflicts.push({ id: b.id, date: b.startTime.toISOString().slice(0, 10), conflictTitle: c.title });
      continue;
    }
    toApprove.push(b.id);
  }

  if (toApprove.length > 0) {
    await prisma.roomBooking.updateMany({
      where: { id: { in: toApprove } },
      data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
    });
  }

  return NextResponse.json({ data: { seriesId, approved: toApprove.length, skipped: conflicts.length, conflicts } });
}
