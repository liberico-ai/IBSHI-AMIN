import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canApproveRoomVehicle } from "@/lib/access";
import { canUser } from "@/lib/permission-catalog";
import { resolveScope, scopeAllowsDept } from "@/lib/data-scope.server";

// POST /api/v1/room-bookings/series/[seriesId]/edit
// SỬA ĐỒNG LOẠT cả series — áp cho MỌI buổi CHƯA họp xong (PENDING_APPROVAL/APPROVED, endTime tương lai):
//   giữ NGÀY mỗi buổi, chỉ đổi GIỜ (từ/đến) + phòng + tiêu đề.
const pad = (n: number) => String(n).padStart(2, "0");

export async function POST(req: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const employeeCode = (session.user as any).employeeCode;
  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { seriesId } = await params;

  const sample = await prisma.roomBooking.findFirst({ where: { seriesId }, include: { requester: { select: { departmentId: true } } } });
  if (!sample) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Series không tồn tại" } }, { status: 404 });
  let allowed = canApproveRoomVehicle(employeeCode, role);
  if (!allowed && canUser(session.user as any, "m10.phonghop.dat:approve")) {
    const scope = await resolveScope(userId, role, "m10.phonghop.dat");
    allowed = scopeAllowsDept(scope, sample.requester?.departmentId);
  }
  if (!allowed) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền sửa lịch đặt phòng" } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { roomId, startTime, endTime, title } = body as { roomId?: string; startTime?: string; endTime?: string; title?: string };
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime) || !endTime || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Cần giờ bắt đầu và kết thúc (HH:mm)" } }, { status: 400 });
  }

  const now = new Date();
  const items = await prisma.roomBooking.findMany({ where: { seriesId, status: { in: ["PENDING_APPROVAL", "APPROVED"] }, endTime: { gt: now } } });
  if (items.length === 0) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không còn buổi nào chưa họp xong để sửa" } }, { status: 404 });

  for (const b of items) {
    const s = new Date(b.startTime);
    const dateStr = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
    const newStart = new Date(`${dateStr}T${startTime}:00`);
    const newEnd = new Date(`${dateStr}T${endTime}:00`);
    if (newEnd <= newStart) continue; // giờ không hợp lệ cho buổi này → bỏ qua an toàn
    await prisma.roomBooking.update({
      where: { id: b.id },
      data: {
        startTime: newStart, endTime: newEnd,
        ...(roomId ? { roomId } : {}),
        ...(title !== undefined ? { title: title.trim() } : {}),
      },
    });
  }
  return NextResponse.json({ data: { seriesId, updated: items.length } });
}
