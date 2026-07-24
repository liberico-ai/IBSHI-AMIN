import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xác nhận cuộc họp ĐÃ XONG (kết thúc SỚM hơn giờ đăng ký) → rút endTime về hiện tại
// để trả phòng về trạng thái TRỐNG cho khoảng thời gian còn lại.
// KHÔNG đổi schema (chỉ cập nhật endTime). Quyền: chủ phiếu hoặc admin (như huỷ).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const { id } = await params;
  const b = await prisma.roomBooking.findUnique({
    where: { id },
    include: { requester: { include: { user: { select: { id: true } } } } },
  });
  if (!b) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const isOwner = b.requester.user?.id === userId;
  const isAdmin = role === "HR_ADMIN" || role === "BOM" || role === "ADMIN";
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ chủ phiếu hoặc admin được xác nhận xong" } }, { status: 403 });

  if (b.status !== "APPROVED")
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ phiếu ĐÃ DUYỆT mới xác nhận xong được" } }, { status: 400 });

  const now = new Date();
  if (now <= b.startTime)
    return NextResponse.json({ error: { code: "NOT_STARTED", message: "Cuộc họp chưa bắt đầu — nếu không dùng nữa hãy Huỷ phiếu" } }, { status: 400 });
  if (now >= b.endTime)
    return NextResponse.json({ error: { code: "ALREADY_ENDED", message: "Cuộc họp đã hết giờ đăng ký" } }, { status: 400 });

  // Rút giờ kết thúc về hiện tại → phòng trống phần thời gian còn lại.
  const data = await prisma.roomBooking.update({ where: { id }, data: { endTime: now } });
  return NextResponse.json({ data });
}
