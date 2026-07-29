import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;

  // (Tuỳ chọn) chỉ định lại PHÒNG khi duyệt.
  const body = await request.json().catch(() => ({}));
  const newRoomId: string | undefined = body?.roomId || undefined;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { select: { departmentId: true } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Duyệt được khi: (a) allowlist/role cũ, HOẶC (b) có quyền ma trận m10.phonghop.dat:approve
  //  và phiếu thuộc PHẠM VI dữ liệu của người duyệt.
  let canApprove = canApproveRoomVehicle(employeeCode, (session.user as any).role);
  if (!canApprove && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, (session.user as any).role, "m10.phonghop.dat");
    canApprove = scopeAllowsDept(scope, b.requester?.departmentId);
  }
  if (!canApprove)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền duyệt phiếu đặt phòng họp" } }, { status: 403 });

  if (b.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: { code: "INVALID_STATE" } }, { status: 400 });

  // Phòng cuối cùng = phòng chỉ định lại (nếu có) hoặc phòng cũ.
  const roomId = newRoomId && newRoomId !== b.roomId ? newRoomId : b.roomId;
  if (roomId !== b.roomId) {
    const room = await prisma.meetingRoom.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return NextResponse.json({ error: { code: "ROOM_NOT_FOUND", message: "Phòng chỉ định không tồn tại" } }, { status: 400 });
  }

  // Check không có booking APPROVED khác overlap ở PHÒNG CUỐI CÙNG.
  const conflict = await prisma.roomBooking.findFirst({
    where: {
      id: { not: id },
      roomId,
      status: "APPROVED",
      startTime: { lt: b.endTime },
      endTime: { gt: b.startTime },
    },
    select: { title: true },
  });
  if (conflict) return NextResponse.json({
    error: { code: "CONFLICT", message: `Phòng đã có lịch ĐÃ DUYỆT khác trong khung giờ: "${conflict.title}"` },
  }, { status: 409 });

  const data = await prisma.roomBooking.update({
    where: { id },
    data: { status: "APPROVED", roomId, approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json({ data });
}
