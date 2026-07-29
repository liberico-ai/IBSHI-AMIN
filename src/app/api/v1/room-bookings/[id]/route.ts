import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

// PUT /api/v1/room-bookings/[id]
//   Người có quyền DUYỆT phòng họp SỬA thông tin 1 phiếu CHƯA HỌP XONG (status PENDING/APPROVED và
//   giờ kết thúc > hiện tại): đổi PHÒNG / GIỜ / tiêu đề / mô tả. Sửa ĐÚNG 1 phiếu — phiếu khác (kể cả
//   cùng series) KHÔNG ảnh hưởng.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { select: { departmentId: true } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Quyền: allowlist/role cũ HOẶC ma trận m10.phonghop.dat:approve + trong phạm vi.
  let canEdit = canApproveRoomVehicle(employeeCode, role);
  if (!canEdit && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, role, "m10.phonghop.dat");
    canEdit = scopeAllowsDept(scope, b.requester?.departmentId);
  }
  if (!canEdit) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền sửa phiếu đặt phòng họp" } }, { status: 403 });

  // Chỉ sửa phiếu CHƯA HỌP XONG: còn hiệu lực (PENDING/APPROVED) + chưa kết thúc.
  if (b.status !== "PENDING_APPROVAL" && b.status !== "APPROVED")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Phiếu đã huỷ/từ chối — không sửa được" } }, { status: 400 });
  if (new Date(b.endTime).getTime() <= Date.now())
    return NextResponse.json({ error: { code: "ALREADY_ENDED", message: "Cuộc họp đã kết thúc/đã họp xong — không sửa được" } }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const roomId: string = body?.roomId || b.roomId;
  const startTime = body?.startTime ? new Date(body.startTime) : b.startTime;
  const endTime = body?.endTime ? new Date(body.endTime) : b.endTime;
  if (endTime <= startTime)
    return NextResponse.json({ error: { code: "INVALID_TIME", message: "Giờ kết thúc phải sau giờ bắt đầu" } }, { status: 400 });

  if (roomId !== b.roomId) {
    const room = await prisma.meetingRoom.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return NextResponse.json({ error: { code: "ROOM_NOT_FOUND", message: "Phòng chỉ định không tồn tại" } }, { status: 400 });
  }

  // Check trùng với lịch ĐÃ DUYỆT khác ở phòng/giờ mới (trừ chính phiếu này).
  const conflict = await prisma.roomBooking.findFirst({
    where: { id: { not: id }, roomId, status: "APPROVED", startTime: { lt: endTime }, endTime: { gt: startTime } },
    select: { title: true },
  });
  if (conflict) return NextResponse.json({
    error: { code: "CONFLICT", message: `Phòng đã có lịch ĐÃ DUYỆT khác trong khung giờ: "${conflict.title}"` },
  }, { status: 409 });

  const data = await prisma.roomBooking.update({
    where: { id },
    data: {
      roomId, startTime, endTime,
      ...(body?.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body?.description !== undefined ? { description: String(body.description).trim() || null } : {}),
      ...(body?.priorityNote !== undefined ? { priorityNote: String(body.priorityNote).trim() || null } : {}),
    },
  });
  return NextResponse.json({ data });
}
